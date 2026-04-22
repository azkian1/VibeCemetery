import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const API_BASE_URL = 'https://vibecemetery.app'

export const STRONG_MARKER_FILES = [
  'package.json',
  'Cargo.toml',
  'go.mod',
  'requirements.txt',
  'pyproject.toml',
  'pom.xml',
  'build.gradle',
]

export const CONFIDENCE_BOOSTER_FILES = [
  'README.md',
  'CLAUDE.md',
  'PRD.md',
  'PLAN.md',
  'vercel.json',
  'netlify.toml',
  'Dockerfile',
  '.env.example',
]

export const CODE_LIKE_EXTENSIONS = [
  '.py',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.css',
  '.java',
  '.go',
  '.rs',
  '.sh',
  '.ps1',
]

export const SKIPPED_CHILD_DIRECTORY_NAMES = [
  'node_modules',
  'vendor',
  'target',
  'dist',
  'build',
  '.next',
  '__pycache__',
]

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`
}

export function normalizeFingerprintPath(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) {
    return ''
  }

  const resolved = path.resolve(raw)
  try {
    return fs.realpathSync.native(resolved).replace(/\\/g, '/')
  } catch {
    return resolved.replace(/\\/g, '/')
  }
}

export function computePathFingerprint(value) {
  return sha256(normalizeFingerprintPath(value))
}

function normalizeRootEntry(entry) {
  const name = typeof entry?.name === 'string' ? entry.name : ''
  const normalizedName = name.toLowerCase()
  const type = entry?.type === 'directory' || entry?.type === 'dir'
    ? 'directory'
    : entry?.type === 'file'
      ? 'file'
      : entry?.isDirectory?.()
        ? 'directory'
        : 'file'

  return {
    name,
    normalizedName,
    type,
    isFile: type === 'file',
    isDirectory: type === 'directory',
  }
}

export function classifyProjectRootEntries(entries) {
  const normalizedEntries = Array.isArray(entries) ? entries.map(normalizeRootEntry) : []
  const rootFiles = normalizedEntries.filter((entry) => entry.isFile)
  const strongMatches = []

  if (normalizedEntries.some((entry) => entry.isDirectory && entry.normalizedName === '.git')) {
    strongMatches.push('.git/')
  }

  for (const marker of STRONG_MARKER_FILES) {
    if (rootFiles.some((entry) => entry.normalizedName === marker.toLowerCase())) {
      strongMatches.push(marker)
    }
  }

  for (const entry of rootFiles) {
    if (entry.normalizedName.endsWith('.sln') || entry.normalizedName.endsWith('.csproj')) {
      strongMatches.push(entry.name)
    }
  }

  const codeLikeFiles = rootFiles
    .filter((entry) => CODE_LIKE_EXTENSIONS.includes(path.extname(entry.normalizedName)))
    .map((entry) => entry.name)
  const confidenceBoosters = rootFiles
    .filter((entry) => CONFIDENCE_BOOSTER_FILES.some((marker) => marker.toLowerCase() === entry.normalizedName))
    .map((entry) => entry.name)
  const hasStrong = strongMatches.length > 0
  const qualifiesFallback = !hasStrong && (
    codeLikeFiles.length >= 2
    || (codeLikeFiles.length >= 1 && confidenceBoosters.length >= 1)
    || (rootFiles.length === 1 && codeLikeFiles.length === 1)
  )

  return {
    isCandidate: hasStrong || qualifiesFallback,
    source: hasStrong ? 'strong' : qualifiesFallback ? 'fallback' : 'none',
    strongMatches,
    codeLikeFiles,
    codeLikeCount: codeLikeFiles.length,
    confidenceBoosters,
    confidenceBoosterCount: confidenceBoosters.length,
  }
}

export function selectProjectCandidates(options = {}) {
  const scanPath = typeof options.scanPath === 'string' ? options.scanPath : ''
  const scanPathClassification = classifyProjectRootEntries(options.scanPathEntries)

  if (scanPath && scanPathClassification.isCandidate) {
    return [{
      path: scanPath,
      classification: scanPathClassification,
    }]
  }

  const childDirectories = Array.isArray(options.childDirectories) ? options.childDirectories : []
  return childDirectories.flatMap((child) => {
    const childPath = typeof child?.path === 'string' ? child.path : ''
    const classification = classifyProjectRootEntries(child?.entries)

    if (!childPath || !classification.isCandidate) {
      return []
    }

    return [{
      path: childPath,
      classification,
    }]
  })
}

function readProjectRootEntries(rootPath) {
  return fs.readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return [{ name: entry.name, type: 'directory' }]
    }

    if (entry.isFile()) {
      return [{ name: entry.name, type: 'file' }]
    }

    return []
  })
}

function normalizePathForComparison(targetPath) {
  const resolvedPath = path.resolve(targetPath)
  return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath
}

function countNonRootPathSegments(targetPath) {
  const resolvedPath = path.resolve(targetPath)
  const parsedPath = path.parse(resolvedPath)
  return resolvedPath.slice(parsedPath.root.length).split(path.sep).filter(Boolean).length
}

function getPathChain(targetPath) {
  const resolvedPath = path.resolve(targetPath)
  const parsedPath = path.parse(resolvedPath)
  const segments = resolvedPath.slice(parsedPath.root.length).split(path.sep).filter(Boolean)
  return [parsedPath.root, ...segments.map((_, index) => path.join(parsedPath.root, ...segments.slice(0, index + 1)))]
}

function assertNoRedirectedSegments(targetPath) {
  for (const currentPath of getPathChain(targetPath)) {
    if (!fs.existsSync(currentPath)) {
      continue
    }

    const stats = fs.lstatSync(currentPath)
    if (stats.isSymbolicLink()) {
      throw new Error('Scan path cannot include a symlink or junction segment')
    }
  }
}

function assertSafeScanPath(scanPath, options = {}) {
  const rawScanPath = typeof scanPath === 'string' ? scanPath.trim() : ''
  if (!rawScanPath) {
    throw new Error('Scan path is required')
  }

  const resolvedScanPath = path.resolve(rawScanPath)
  assertNoRedirectedSegments(resolvedScanPath)
  const stats = fs.lstatSync(resolvedScanPath)
  if (stats.isSymbolicLink()) {
    throw new Error('Scan path cannot be a symlink or junction')
  }

  if (!stats.isDirectory()) {
    throw new Error('Scan path must be an existing directory')
  }

  const parsedPath = path.parse(resolvedScanPath)
  if (resolvedScanPath === parsedPath.root) {
    throw new Error('Scan path cannot be a filesystem root')
  }

  const homedir = options.homedir || os.homedir()
  const blockedRoots = [
    homedir,
    path.join(homedir, 'Desktop'),
    path.join(homedir, 'Documents'),
    path.join(homedir, 'Downloads'),
  ].map(normalizePathForComparison)
  const normalizedScanPath = normalizePathForComparison(fs.realpathSync.native(resolvedScanPath))

  if (blockedRoots.includes(normalizedScanPath)) {
    throw new Error('Scan path is unsafe')
  }

  if (countNonRootPathSegments(resolvedScanPath) < 2) {
    throw new Error('Scan path is unsafe')
  }

  return fs.realpathSync.native(resolvedScanPath)
}

export function detectProjectCandidates(scanPath, options = {}) {
  const resolvedScanPath = assertSafeScanPath(scanPath, options)
  const registryEntries = normalizeRegistryEntries(Array.isArray(options.registryEntries) ? options.registryEntries : [])
  const scanPathEntries = readProjectRootEntries(resolvedScanPath)
  const childDirectories = fs.readdirSync(resolvedScanPath, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || SKIPPED_CHILD_DIRECTORY_NAMES.includes(entry.name)) {
      return []
    }

    const childPath = path.join(resolvedScanPath, entry.name)
    const childStats = fs.lstatSync(childPath)
    if (childStats.isSymbolicLink() || !childStats.isDirectory()) {
      return []
    }

    return [{
      path: childPath,
      entries: readProjectRootEntries(childPath),
    }]
  })

  return selectProjectCandidates({
    scanPath: resolvedScanPath,
    scanPathEntries,
    childDirectories,
  }).map((candidate) => {
    const pathFingerprint = computePathFingerprint(candidate.path)
    const registryMatch = registryEntries.some((entry) => entry.path_fingerprint === pathFingerprint)

    return {
      ...candidate,
      name: path.basename(candidate.path),
      path_fingerprint: pathFingerprint,
      status: registryMatch ? 'Cremated' : 'Untracked',
    }
  })
}

export function buildSelectionPromptModel(rows) {
  const normalizedRows = Array.isArray(rows) ? rows.map((row) => ({
    name: sanitizeDisplayText(typeof row?.name === 'string' ? row.name : '', 120),
    status: sanitizeDisplayText(typeof row?.status === 'string' ? row.status : '', 40),
  })).filter((row) => row.name) : []

  const crematedRows = normalizedRows.filter((row) => row.status === 'Cremated')
  const selectableRows = normalizedRows
    .filter((row) => row.status !== 'Cremated')
    .map((row, index) => ({ ...row, index: index + 1 }))

  const acceptedReplies = []
  if (selectableRows.length === 1) {
    acceptedReplies.push(String(selectableRows[0].index))
  } else if (selectableRows.length > 1) {
    acceptedReplies.push(selectableRows.map((row) => String(row.index)).join(','))
  }

  if (selectableRows.some((row) => row.status === 'Dead')) {
    acceptedReplies.push('all dead')
  }

  return {
    selectableRows,
    crematedRows,
    acceptedReplies,
  }
}

export function computeStoragePaths(options = {}) {
  const platform = options.platform || process.platform
  const env = options.env || process.env
  const homedir = options.homedir || os.homedir()

  if (platform === 'win32') {
    const appData = (env.APPDATA || '').trim()
    const baseDir = path.join(appData || path.join(homedir, 'AppData', 'Roaming'), 'Claude', 'vibecemetery')
    return {
      baseDir,
      configPath: path.join(baseDir, 'bury.json'),
      registryPath: path.join(baseDir, 'cremated-registry.json'),
    }
  }

  const baseDir = path.join(homedir, '.config', 'claude', 'vibecemetery')
  return {
    baseDir,
    configPath: path.join(baseDir, 'bury.json'),
    registryPath: path.join(baseDir, 'cremated-registry.json'),
  }
}

export function sanitizeDisplayText(value, maxLength = 200) {
  const text = typeof value === 'string' ? value : ''
  const withoutAnsi = text.replace(/\x1b\[[0-9;]*m/g, '')
  const withoutControl = withoutAnsi.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
  return withoutControl.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function stripUtf8Bom(value) {
  return typeof value === 'string' ? value.replace(/^\uFEFF/, '') : ''
}

export function sanitizeGitHubRemote(remote) {
  const raw = typeof remote === 'string' ? remote.trim() : ''
  if (!raw) {
    return { registryValue: '', githubUrl: '' }
  }

  const sshMatch = raw.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i)
  if (sshMatch) {
    const owner = sshMatch[1]
    const repo = sshMatch[2]
    return {
      registryValue: `github.com/${owner}/${repo}`,
      githubUrl: `https://github.com/${owner}/${repo}`,
    }
  }

  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (host !== 'github.com' && host !== 'www.github.com') {
      return { registryValue: '', githubUrl: '' }
    }

    const parts = url.pathname.replace(/^\/+/, '').replace(/\.git$/i, '').split('/').filter(Boolean)
    if (parts.length !== 2) {
      return { registryValue: '', githubUrl: '' }
    }

    const owner = parts[0]
    const repo = parts[1]
    return {
      registryValue: `github.com/${owner}/${repo}`,
      githubUrl: `https://github.com/${owner}/${repo}`,
    }
  } catch {
    return { registryValue: '', githubUrl: '' }
  }
}

function canonicalizeLegacyPath(rawPath) {
  const resolved = path.resolve(rawPath)

  try {
    return fs.realpathSync.native(resolved).replace(/\\/g, '/')
  } catch {
    return resolved.replace(/\\/g, '/')
  }
}

export function validateApproveUrl({ approveUrl, apiBaseUrl = API_BASE_URL, linkId, claimToken }) {
  try {
    const approve = new URL(approveUrl)
    const apiBase = new URL(apiBaseUrl)

    if (approve.protocol !== 'http:' && approve.protocol !== 'https:') {
      return { ok: false, error: 'Approval URL must use http or https' }
    }

    if (approve.origin !== apiBase.origin) {
      return { ok: false, error: 'Approval URL origin must match API_BASE_URL origin' }
    }

    if (approve.pathname !== '/cli/connect') {
      return { ok: false, error: 'Approval URL path must be /cli/connect' }
    }

    if ((approve.searchParams.get('link_id') || '') !== linkId) {
      return { ok: false, error: 'Approval URL link_id does not match link start response' }
    }

    const hashParams = new URLSearchParams(approve.hash.replace(/^#/, ''))
    const hashClaimToken = (hashParams.get('claim_token') || '').trim()
    if (!hashClaimToken) {
      return { ok: false, error: 'Approval URL is missing claim_token proof' }
    }

    if (hashClaimToken !== claimToken) {
      return { ok: false, error: 'Approval URL claim_token does not match link start response' }
    }

    return { ok: true }
  } catch {
    return { ok: false, error: 'Approval URL is invalid' }
  }
}

export function normalizeRegistryEntries(entries) {
  if (!Array.isArray(entries)) {
    return []
  }

  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const legacyPath = typeof entry.path === 'string' ? canonicalizeLegacyPath(entry.path) : ''
    const pathFingerprint = sanitizeDisplayText(typeof entry.path_fingerprint === 'string' ? entry.path_fingerprint : '', 80)
      || (legacyPath ? computePathFingerprint(legacyPath) : '')
    const remote = sanitizeGitHubRemote(typeof entry.git_remote === 'string' ? entry.git_remote : '').registryValue

    return [{
      name: sanitizeDisplayText(typeof entry.name === 'string' ? entry.name : '', 120),
      path_fingerprint: pathFingerprint,
      git_remote: remote,
      first_commit: sanitizeDisplayText(typeof entry.first_commit === 'string' ? entry.first_commit : '', 80),
      cremated_at: sanitizeDisplayText(typeof entry.cremated_at === 'string' ? entry.cremated_at : '', 20),
      cause: sanitizeDisplayText(typeof entry.cause === 'string' ? entry.cause : '', 200),
    }].filter((item) => item.name)
  })
}

function ensureCanonicalParent(baseDir) {
  fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 })
  return fs.realpathSync.native(baseDir)
}

function assertSafeJsonTarget(targetPath, expectedBaseDir) {
  const canonicalBase = ensureCanonicalParent(expectedBaseDir)
  const resolvedTarget = path.resolve(targetPath)
  const targetParent = path.dirname(resolvedTarget)
  const canonicalParent = ensureCanonicalParent(targetParent)
  const relativeParent = path.relative(canonicalBase, canonicalParent)

  if (relativeParent.startsWith('..') || path.isAbsolute(relativeParent)) {
    throw new Error('Target path escapes the expected config directory')
  }

  if (fs.existsSync(resolvedTarget)) {
    const stats = fs.lstatSync(resolvedTarget)
    if (!stats.isFile()) {
      throw new Error('Target must be a regular file')
    }
  }

  return resolvedTarget
}

function readJsonFileSafe(targetPath, fallbackValue) {
  try {
    if (!fs.existsSync(targetPath)) {
      return fallbackValue
    }

    const stats = fs.lstatSync(targetPath)
    if (!stats.isFile()) {
      throw new Error('Target must be a regular file')
    }

    const raw = stripUtf8Bom(fs.readFileSync(targetPath, 'utf8')).trim()
    if (!raw) {
      return fallbackValue
    }

    return JSON.parse(raw)
  } catch {
    return fallbackValue
  }
}

function writeJsonFileAtomic(targetPath, value) {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(tempPath, targetPath)
}

export function loadConfig() {
  const paths = computeStoragePaths()
  const targetPath = assertSafeJsonTarget(paths.configPath, paths.baseDir)
  const config = readJsonFileSafe(targetPath, {})
  return {
    path: targetPath,
    config: config && typeof config === 'object' && !Array.isArray(config) ? config : {},
  }
}

export function saveConfig(config) {
  const paths = computeStoragePaths()
  const targetPath = assertSafeJsonTarget(paths.configPath, paths.baseDir)
  writeJsonFileAtomic(targetPath, config)
  return targetPath
}

export function loadRegistry() {
  const paths = computeStoragePaths()
  const targetPath = assertSafeJsonTarget(paths.registryPath, paths.baseDir)
  return {
    path: targetPath,
    entries: normalizeRegistryEntries(readJsonFileSafe(targetPath, [])),
  }
}

export function saveRegistry(entries) {
  const paths = computeStoragePaths()
  const targetPath = assertSafeJsonTarget(paths.registryPath, paths.baseDir)
  const normalized = normalizeRegistryEntries(entries)
  writeJsonFileAtomic(targetPath, normalized)
  return targetPath
}

export function buildCremationBody(payload) {
  const body = {
    name: sanitizeDisplayText(payload?.name, 120),
    cause: sanitizeDisplayText(payload?.cause, 200),
  }

  const normalizedRemote = sanitizeGitHubRemote(typeof payload?.github_url === 'string' ? payload.github_url : '')
  if (normalizedRemote.githubUrl) {
    body.github_url = normalizedRemote.githubUrl
  }

  if (payload?.last_commit_message) {
    body.last_commit_message = sanitizeDisplayText(payload.last_commit_message, 200)
  }

  return body
}

async function readStdin() {
  return await new Promise((resolve, reject) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      raw += chunk
    })
    process.stdin.on('end', () => resolve(raw))
    process.stdin.on('error', reject)
  })
}

export async function postCremationFromStdin() {
  const stdin = await readStdin()
  const payload = JSON.parse(typeof stdin === 'string' ? stdin : '')
  const { config } = loadConfig()
  const cliToken = typeof config.cli_token === 'string' ? config.cli_token.trim() : ''

  if (!cliToken) {
    process.stdout.write(JSON.stringify({ status: 401, ok: false, error: 'Missing CLI token' }))
    return
  }

  const body = buildCremationBody(payload)

  const response = await fetch(`${API_BASE_URL}/api/cremated`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cliToken}`,
    },
    body: JSON.stringify(body),
  })

  let error = null
  if (!response.ok) {
    error = response.status === 429 ? 'Rate limited' : response.status >= 500 ? 'API unreachable' : 'Request failed'
  }

  process.stdout.write(JSON.stringify({ status: response.status, ok: response.ok, error }))
}

async function main() {
  const command = process.argv[2]

  if (command === 'paths') {
    process.stdout.write(`${JSON.stringify(computeStoragePaths())}\n`)
    return
  }

  if (command === 'post-cremation') {
    await postCremationFromStdin()
    return
  }

  if (command === 'detect-candidates') {
    const scanPath = process.argv[3]
    const { entries } = loadRegistry()
    process.stdout.write(`${JSON.stringify(detectProjectCandidates(scanPath, { registryEntries: entries }))}\n`)
  }
}

const currentFilePath = fileURLToPath(import.meta.url)
const invokedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : ''

if (invokedFilePath === currentFilePath) {
  main().catch((error) => {
    process.stdout.write(JSON.stringify({ status: 500, ok: false, error: sanitizeDisplayText(error?.message || 'Unexpected error') }))
    process.exitCode = 1
  })
}
