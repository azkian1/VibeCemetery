import { access, mkdir, mkdtemp, rm, writeFile, copyFile, readdir } from 'node:fs/promises'
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
    commandsDir: path.join(homeDir, '.claude', 'commands'),
    skillsDir: path.join(homeDir, '.claude', 'skills'),
    workflowDir: path.join(homeDir, '.claude', 'skills', 'bury-workflow'),
    commandFile: path.join(homeDir, '.claude', 'commands', 'bury.md'),
  }
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

async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
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
  const resolvedBaseUrl = rawBaseUrl || INSTALLER_CONTRACT.rawBaseUrl
  const shouldFailAfterCommandCopy = process.env.VIBECEMETERY_INSTALL_TEST_FAIL_AFTER_COMMAND_COPY === '1'

  try {
    for (const file of INSTALLER_CONTRACT.files) {
      await downloadToFile(`${resolvedBaseUrl}/${file.source}`, path.join(tempDir, file.source))
    }

    const targets = getTargetPaths(homeDir)
    await mkdir(targets.commandsDir, { recursive: true })
    await mkdir(targets.skillsDir, { recursive: true })

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
  const rawBaseUrl = args.rawBaseUrl || process.env.VIBECEMETERY_INSTALL_RAW_BASE_URL || INSTALLER_CONTRACT.rawBaseUrl

  await installFiles(rawBaseUrl, homeDir)
  console.log('Restart Claude Code.')
  console.log('Then run /bury.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}

export { getHomeDir, getTargetPaths, installFiles, parseArgs }
