import { access, lstat, mkdir, mkdtemp, realpath, rm, writeFile, copyFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { INSTALLER_CONTRACT } from './install-contract.mjs'

function parseArgs(argv) {
  const args = { homeDir: '', rawBaseUrl: '' }

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--home') {
      args.homeDir = argv[++i] ?? ''
    } else if (value === '--raw-base-url') {
      args.rawBaseUrl = argv[++i] ?? ''
    }
  }

  return args
}

function getHomeDir(overrideHomeDir) {
  if (overrideHomeDir) return overrideHomeDir
  return process.platform === 'win32' ? process.env.USERPROFILE ?? os.homedir() : os.homedir()
}

function getTargetPaths(homeDir) {
  return {
    claudeDir: path.join(homeDir, '.claude'),
    commandsDir: path.join(homeDir, '.claude', 'commands'),
    skillsDir: path.join(homeDir, '.claude', 'skills'),
    workflowDir: path.join(homeDir, '.claude', 'skills', 'bury-workflow'),
    commandFile: path.join(homeDir, '.claude', 'commands', 'bury.md'),
  }
}

async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

function isPathWithin(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

async function assertSafeInstallPath(targetPath, installRoot, expectedType) {
  const resolvedInstallRoot = path.resolve(installRoot)
  const resolvedTargetPath = path.resolve(targetPath)

  if (!isPathWithin(resolvedInstallRoot, resolvedTargetPath)) {
    throw new Error(`Install target escapes the Claude directory: ${resolvedTargetPath}`)
  }

  const relativePath = path.relative(resolvedInstallRoot, resolvedTargetPath)
  const segments = relativePath ? relativePath.split(path.sep).filter(Boolean) : []
  const pathsToValidate = [resolvedInstallRoot, ...segments.map((_, index) => path.join(resolvedInstallRoot, ...segments.slice(0, index + 1)))]

  for (const currentPath of pathsToValidate) {
    if (!await pathExists(currentPath)) {
      continue
    }

    const stats = await lstat(currentPath)
    if (stats.isSymbolicLink()) {
      throw new Error(`Install target cannot use a symlink or junction: ${currentPath}`)
    }

    const isLeaf = currentPath === resolvedTargetPath
    const expectedLeafType = isLeaf ? expectedType : 'directory'
    if (expectedLeafType === 'directory' && !stats.isDirectory()) {
      throw new Error(`Install target must be a directory: ${currentPath}`)
    }

    if (expectedLeafType === 'file' && !stats.isFile()) {
      throw new Error(`Install target must be a regular file: ${currentPath}`)
    }

    const canonicalPath = await realpath(currentPath)
    if (!isPathWithin(resolvedInstallRoot, canonicalPath)) {
      throw new Error(`Install target resolves outside the Claude directory: ${currentPath}`)
    }
  }
}

async function assertSafeInstallTargets(targets) {
  await assertSafeInstallPath(targets.claudeDir, targets.claudeDir, 'directory')
  await assertSafeInstallPath(targets.commandsDir, targets.claudeDir, 'directory')
  await assertSafeInstallPath(targets.skillsDir, targets.claudeDir, 'directory')
  await assertSafeInstallPath(targets.commandFile, targets.claudeDir, 'file')
  await assertSafeInstallPath(targets.workflowDir, targets.claudeDir, 'directory')
}

function isAllowedOverrideUrl(url) {
  const hostname = url.hostname.toLowerCase()
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
}

function resolveRawBaseUrl(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) {
    return INSTALLER_CONTRACT.rawBaseUrl
  }

  if (trimmed === INSTALLER_CONTRACT.rawBaseUrl) {
    return trimmed
  }

  let parsedUrl
  try {
    parsedUrl = new URL(trimmed)
  } catch {
    throw new Error('Installer source override must be a valid URL')
  }

  if (!isAllowedOverrideUrl(parsedUrl)) {
    throw new Error('Installer source override is restricted to localhost or 127.0.0.1 test origins')
  }

  return trimmed.replace(/\/+$/, '')
}

async function downloadToFile(sourceUrl, targetPath) {
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`Failed to download ${sourceUrl}: ${response.status} ${response.statusText}`)
  }

  const text = await response.text()
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, text)
}

async function copyTree(sourceRoot, targetRoot) {
  await mkdir(targetRoot, { recursive: true })

  const entries = await readdir(sourceRoot, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name)
    const targetPath = path.join(targetRoot, entry.name)
    if (entry.isDirectory()) {
      await copyTree(sourcePath, targetPath)
      continue
    }

    await mkdir(path.dirname(targetPath), { recursive: true })
    await copyFile(sourcePath, targetPath)
  }
}

async function backupExistingTargets(targets, backupRoot) {
  const backups = {
    commandFile: path.join(backupRoot, 'bury.md'),
    workflowDir: path.join(backupRoot, 'bury-workflow'),
    hasCommandFile: false,
    hasWorkflowDir: false,
  }

  if (await pathExists(targets.commandFile)) {
    backups.hasCommandFile = true
    await mkdir(path.dirname(backups.commandFile), { recursive: true })
    await copyFile(targets.commandFile, backups.commandFile)
  }

  if (await pathExists(targets.workflowDir)) {
    backups.hasWorkflowDir = true
    await copyTree(targets.workflowDir, backups.workflowDir)
  }

  return backups
}

async function restoreBackups(targets, backups) {
  if (backups.hasCommandFile) {
    await mkdir(path.dirname(targets.commandFile), { recursive: true })
    await copyFile(backups.commandFile, targets.commandFile)
  }

  if (backups.hasWorkflowDir) {
    await rm(targets.workflowDir, { recursive: true, force: true })
    await copyTree(backups.workflowDir, targets.workflowDir)
  }
}

async function installFiles(rawBaseUrl, homeDir) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'vibecemetery-install-'))
  const backupDir = await mkdtemp(path.join(os.tmpdir(), 'vibecemetery-backup-'))
  const resolvedBaseUrl = resolveRawBaseUrl(rawBaseUrl)
  const shouldFailAfterCommandCopy = process.env.VIBECEMETERY_INSTALL_TEST_FAIL_AFTER_COMMAND_COPY === '1'

  try {
    for (const file of INSTALLER_CONTRACT.files) {
      await downloadToFile(`${resolvedBaseUrl}/${file.source}`, path.join(tempDir, file.source))
    }

      const targets = getTargetPaths(homeDir)
      await assertSafeInstallTargets(targets)
      await mkdir(targets.claudeDir, { recursive: true })
      await mkdir(targets.commandsDir, { recursive: true })
      await mkdir(targets.skillsDir, { recursive: true })
      await assertSafeInstallTargets(targets)

      const backups = await backupExistingTargets(targets, backupDir)

    try {
      await copyFile(path.join(tempDir, 'SKILL', 'commands', 'bury.md'), targets.commandFile)
      if (shouldFailAfterCommandCopy) {
        throw new Error('Test failure after command copy')
      }

      await rm(targets.workflowDir, { recursive: true, force: true })
      await copyTree(path.join(tempDir, 'SKILL', 'skills', 'bury-workflow'), targets.workflowDir)
    } catch (error) {
      await restoreBackups(targets, backups)
      throw error
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
    await rm(backupDir, { recursive: true, force: true })
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const homeDir = getHomeDir(args.homeDir)
  const rawBaseUrl = resolveRawBaseUrl(args.rawBaseUrl || process.env.VIBECEMETERY_INSTALL_RAW_BASE_URL)

  await installFiles(rawBaseUrl, homeDir)
  console.log('Restart Claude Code.')
  console.log('Then run /bury.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}

export { getHomeDir, getTargetPaths, installFiles, parseArgs, resolveRawBaseUrl }
