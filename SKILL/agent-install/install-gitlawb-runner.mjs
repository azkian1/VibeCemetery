import { createHash, timingSafeEqual } from 'node:crypto'
import { access, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_RAW_BASE_URL = 'https://vibecemetery.app/agents/gitlawb/v1'
const ALLOWED_FILES = [
  {
    source: 'SKILL/skills/gitlawb/SKILL.md',
    target: 'SKILL.md',
    publicPath: 'files/skills/gitlawb/SKILL.md',
  },
  {
    source: 'SKILL/skills/gitlawb/scripts/gitlawb-helper.mjs',
    target: 'scripts/gitlawb-helper.mjs',
    publicPath: 'files/skills/gitlawb/scripts/gitlawb-helper.mjs',
  },
]

function parseArgs(argv) {
  const args = { homeDir: '', rawBaseUrl: '', manifestPath: '', dryRun: false }

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--home') {
      args.homeDir = argv[++i] ?? ''
    } else if (value === '--raw-base-url') {
      args.rawBaseUrl = argv[++i] ?? ''
    } else if (value === '--manifest') {
      const manifestPath = argv[++i] ?? ''
      if (!args.manifestPath) args.manifestPath = manifestPath
    } else if (value === '--dry-run') {
      args.dryRun = true
    }
  }

  return args
}

function getHomeDir(overrideHomeDir) {
  if (overrideHomeDir) return overrideHomeDir
  return process.platform === 'win32' ? process.env.USERPROFILE ?? os.homedir() : os.homedir()
}

function getTargetRoot(homeDir) {
  return path.join(homeDir, '.hermes', 'skills', 'gitlawb')
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

async function assertSafePath(targetPath, installRoot, expectedType) {
  const resolvedInstallRoot = path.resolve(installRoot)
  const resolvedTargetPath = path.resolve(targetPath)

  if (!isPathWithin(resolvedInstallRoot, resolvedTargetPath)) {
    throw new Error(`Install target escapes the Hermes skill directory: ${resolvedTargetPath}`)
  }

  const relativePath = path.relative(resolvedInstallRoot, resolvedTargetPath)
  const segments = relativePath ? relativePath.split(path.sep).filter(Boolean) : []
  const pathsToValidate = [resolvedInstallRoot, ...segments.map((_, index) => path.join(resolvedInstallRoot, ...segments.slice(0, index + 1)))]

  for (const currentPath of pathsToValidate) {
    if (!await pathExists(currentPath)) continue

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
      throw new Error(`Install target resolves outside the Hermes skill directory: ${currentPath}`)
    }
  }
}

async function assertNoSymlinkAncestors(basePath, targetPath) {
  const resolvedBasePath = path.resolve(basePath)
  const resolvedTargetPath = path.resolve(targetPath)
  if (!isPathWithin(resolvedBasePath, resolvedTargetPath)) {
    throw new Error(`Install target escapes the home directory: ${resolvedTargetPath}`)
  }

  const relativePath = path.relative(resolvedBasePath, resolvedTargetPath)
  const segments = relativePath ? relativePath.split(path.sep).filter(Boolean) : []
  for (let index = 0; index <= segments.length; index += 1) {
    const currentPath = path.join(resolvedBasePath, ...segments.slice(0, index))
    if (!await pathExists(currentPath)) continue
    const stats = await lstat(currentPath)
    if (stats.isSymbolicLink()) {
      throw new Error(`Install path ancestor cannot use a symlink or junction: ${currentPath}`)
    }
  }
}

function isAllowedOverrideUrl(url) {
  const hostname = url.hostname.toLowerCase()
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
}

function resolveRawBaseUrl(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return DEFAULT_RAW_BASE_URL

  const normalized = trimmed.replace(/\/+$/, '')
  if (normalized === DEFAULT_RAW_BASE_URL) return normalized

  let parsedUrl
  try {
    parsedUrl = new URL(normalized)
  } catch {
    throw new Error('Installer source override must be a valid URL')
  }

  if (!isAllowedOverrideUrl(parsedUrl)) {
    throw new Error('Installer source override is restricted to localhost or 127.0.0.1 test origins')
  }

  return normalized
}

function assertValidSha256(value, sourcePath) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`Invalid sha256 manifest entry for ${sourcePath}`)
  }
}

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex')
}

function compareSha256(actualHash, expectedHash) {
  const actual = Buffer.from(actualHash.toLowerCase(), 'hex')
  const expected = Buffer.from(expectedHash.toLowerCase(), 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function hashFile(targetPath) {
  return createHash('sha256').update(await readFile(targetPath)).digest('hex')
}

function assertSafeManifestTarget(target) {
  if (!ALLOWED_FILES.some((file) => file.target === target)) {
    throw new Error(`Manifest target is not allowlisted or attempts target traversal: ${target}`)
  }
  if (target.includes('..') || path.isAbsolute(target)) {
    throw new Error(`Manifest target attempts path traversal: ${target}`)
  }
}

function getPublicPathFromManifestUrl(url, expectedPublicPath) {
  if (typeof url !== 'string' || !url.startsWith('/agents/gitlawb/v1/')) {
    throw new Error(`Manifest URL is not allowlisted: ${url}`)
  }

  const publicPath = url.slice('/agents/gitlawb/v1/'.length)
  if (publicPath !== expectedPublicPath || publicPath.includes('..') || path.isAbsolute(publicPath)) {
    throw new Error(`Manifest URL is not allowlisted: ${url}`)
  }

  return publicPath
}

function buildManifestMap(manifest) {
  const files = Array.isArray(manifest?.files) ? manifest.files : []
  const map = new Map()

  for (const expected of ALLOWED_FILES) {
    const entry = files.find((file) => file?.source === expected.source)
    if (!entry) throw new Error(`Installer manifest is missing sha256 for ${expected.source}`)
    assertValidSha256(entry.sha256, expected.source)
    assertSafeManifestTarget(entry.target)
    if (entry.target !== expected.target) throw new Error(`Manifest target is not allowlisted: ${entry.target}`)
    map.set(expected.source, {
      sha256: entry.sha256.toLowerCase(),
      target: entry.target,
      publicPath: getPublicPathFromManifestUrl(entry.url, expected.publicPath),
    })
  }

  const payloadFiles = files
    .filter((file) => !['SKILL/agent-install/install-gitlawb.sh', 'SKILL/agent-install/install-gitlawb.ps1'].includes(file.source))
    .map((file) => ({ source: file.source, sha256: file.sha256 }))
  const computedPayloadSha256 = sha256Text(JSON.stringify({ files: payloadFiles }))
  if (String(manifest.payload_sha256 || '').toLowerCase() !== computedPayloadSha256) {
    throw new Error('manifest payload_sha256 does not match manifest files')
  }

  return map
}

async function loadManifest(rawBaseUrl, manifestPath) {
  const text = manifestPath
    ? await readFile(manifestPath, 'utf8')
    : await (async () => {
      const response = await fetch(`${rawBaseUrl}/manifest.json`)
      if (!response.ok) throw new Error(`Failed to download manifest.json: ${response.status} ${response.statusText}`)
      return await response.text()
    })()

  try {
    return buildManifestMap(JSON.parse(text))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Installer manifest is not valid JSON')
    throw error
  }
}

async function downloadToFile(sourceUrl, targetPath) {
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`Failed to download ${sourceUrl}: ${response.status} ${response.statusText}`)
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, await response.text())
}

async function verifyDownloadedFile(targetPath, sourcePath, manifestMap) {
  const expected = manifestMap.get(sourcePath)?.sha256
  if (!expected) throw new Error(`Installer manifest is missing sha256 for ${sourcePath}`)

  const actual = await hashFile(targetPath)
  if (!compareSha256(actual, expected)) {
    throw new Error(`Downloaded file failed sha256 integrity check: ${sourcePath}`)
  }
}

function getTargetPath(targetRoot, target) {
  assertSafeManifestTarget(target)
  return path.join(targetRoot, target)
}

async function assertSafeInstallTargets(targetRoot, manifestMap) {
  await assertSafePath(targetRoot, targetRoot, 'directory')
  for (const file of ALLOWED_FILES) {
    await assertSafePath(getTargetPath(targetRoot, manifestMap.get(file.source)?.target ?? file.target), targetRoot, 'file')
  }
}

async function printDryRun(homeDir, manifestMap) {
  const targetRoot = getTargetRoot(homeDir)
  await assertSafeInstallTargets(targetRoot, manifestMap)

  console.log('Dry run: no files written.')
  console.log(`Target root: ${targetRoot}`)
  for (const file of ALLOWED_FILES) {
    const entry = manifestMap.get(file.source)
    console.log(`${getTargetPath(targetRoot, entry.target)} sha256=${entry.sha256}`)
  }
}

async function backupExistingTarget(targetRoot, backupRoot) {
  if (!await pathExists(targetRoot)) return false
  await assertNoSymlinkTree(targetRoot)
  await mkdir(path.dirname(backupRoot), { recursive: true })
  await rm(backupRoot, { recursive: true, force: true })
  await copyDirectory(targetRoot, backupRoot)
  return true
}

async function assertNoSymlinkTree(rootPath) {
  const entries = await readdir(rootPath, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name)
    const stats = await lstat(entryPath)
    if (stats.isSymbolicLink()) {
      throw new Error(`Existing install contains a symlink or junction: ${entryPath}`)
    }
    if (stats.isDirectory()) {
      await assertNoSymlinkTree(entryPath)
    }
  }
}

async function copyDirectory(sourceRoot, targetRoot) {
  await mkdir(targetRoot, { recursive: true })
  const entries = await readdir(sourceRoot, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name)
    const targetPath = path.join(targetRoot, entry.name)
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath)
    } else {
      await mkdir(path.dirname(targetPath), { recursive: true })
      await copyFile(sourcePath, targetPath)
    }
  }
}

async function restoreBackup(targetRoot, backupRoot, hadBackup) {
  await rm(targetRoot, { recursive: true, force: true })
  if (hadBackup) await copyDirectory(backupRoot, targetRoot)
}

async function installFiles(rawBaseUrl, homeDir, manifestPath = '', options = {}) {
  const resolvedBaseUrl = resolveRawBaseUrl(rawBaseUrl)
  const manifestMap = await loadManifest(resolvedBaseUrl, manifestPath)
  const targetRoot = getTargetRoot(homeDir)

  if (options.dryRun) {
    await printDryRun(homeDir, manifestMap)
    return
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'vibecemetery-agent-install-'))
  const backupDir = await mkdtemp(path.join(os.tmpdir(), 'vibecemetery-agent-backup-'))
  const shouldFailAfterSkillCopy = process.env.VIBECEMETERY_AGENT_INSTALL_TEST_FAIL_AFTER_SKILL_COPY === '1'

  try {
    for (const file of ALLOWED_FILES) {
      const tempPath = path.join(tempDir, file.source)
      const entry = manifestMap.get(file.source)
      await downloadToFile(`${resolvedBaseUrl}/${entry.publicPath}`, tempPath)
      await verifyDownloadedFile(tempPath, file.source, manifestMap)
    }

    await assertNoSymlinkAncestors(homeDir, targetRoot)
    await assertSafeInstallTargets(targetRoot, manifestMap)
    await mkdir(targetRoot, { recursive: true })
    await assertNoSymlinkAncestors(homeDir, targetRoot)
    await assertSafeInstallTargets(targetRoot, manifestMap)
    const hadBackup = await backupExistingTarget(targetRoot, backupDir)

    try {
      await rm(targetRoot, { recursive: true, force: true })
      await mkdir(targetRoot, { recursive: true })
      for (const file of ALLOWED_FILES) {
        const entry = manifestMap.get(file.source)
        const targetPath = getTargetPath(targetRoot, entry.target)
        await mkdir(path.dirname(targetPath), { recursive: true })
        await copyFile(path.join(tempDir, file.source), targetPath)
        if (shouldFailAfterSkillCopy && file.target === 'SKILL.md') {
          throw new Error('Test failure after skill copy')
        }
      }
    } catch (error) {
      await restoreBackup(targetRoot, backupDir, hadBackup)
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
  const rawBaseUrl = resolveRawBaseUrl(args.rawBaseUrl || process.env.VIBECEMETERY_AGENT_SKILL_INSTALL_BASE_URL)

  await installFiles(rawBaseUrl, homeDir, args.manifestPath, { dryRun: args.dryRun })
  if (!args.dryRun) {
    console.log('Restart Hermes or OpenClaw.')
    console.log('GitLawb Agent Ash skill installed at ~/.hermes/skills/gitlawb.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}

export { getHomeDir, getTargetRoot, installFiles, parseArgs, resolveRawBaseUrl }
