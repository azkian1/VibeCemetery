$ErrorActionPreference = 'Stop'

$rawBase = if ($env:VIBECEMETERY_INSTALL_RAW_BASE_URL) { $env:VIBECEMETERY_INSTALL_RAW_BASE_URL } else { 'https://vibecemetery.app/skills/bury/v1' }
$rawBase = $rawBase.TrimEnd('/')
$tmpDir = New-Item -ItemType Directory -Force -Path ([System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.IO.Path]::GetRandomFileName()))

if ($env:VIBECEMETERY_INSTALL_RAW_BASE_URL) {
  $overrideUri = [System.Uri] $rawBase
  $hostName = $overrideUri.Host.ToLowerInvariant()
  if ($hostName -notin @('localhost', '127.0.0.1', '::1')) {
    throw 'Installer source override is restricted to localhost or 127.0.0.1 test origins'
  }
}

function Assert-ManifestHash {
  param(
    [Parameter(Mandatory = $true)] $Manifest,
    [Parameter(Mandatory = $true)] [string] $Source,
    [Parameter(Mandatory = $true)] [string] $FilePath
  )

  $entry = $Manifest.files | Where-Object { $_.source -eq $Source } | Select-Object -First 1
  if (-not $entry -or -not ($entry.sha256 -match '^[A-Fa-f0-9]{64}$')) {
    throw "Missing sha256 for $Source"
  }

  $actual = (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $expected = ([string] $entry.sha256).ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "sha256 mismatch for $Source"
  }
}

try {
  Invoke-WebRequest -Uri "$rawBase/manifest.json" -OutFile (Join-Path $tmpDir.FullName 'manifest.json') -UseBasicParsing | Out-Null
  Invoke-WebRequest -Uri "$rawBase/SKILL/install/install-contract.mjs" -OutFile (Join-Path $tmpDir.FullName 'install-contract.mjs') -UseBasicParsing | Out-Null
  Invoke-WebRequest -Uri "$rawBase/SKILL/install/install-runner.mjs" -OutFile (Join-Path $tmpDir.FullName 'install-runner.mjs') -UseBasicParsing | Out-Null

  $manifest = Get-Content -LiteralPath (Join-Path $tmpDir.FullName 'manifest.json') -Raw | ConvertFrom-Json
  Assert-ManifestHash -Manifest $manifest -Source 'SKILL/install/install-contract.mjs' -FilePath (Join-Path $tmpDir.FullName 'install-contract.mjs')
  Assert-ManifestHash -Manifest $manifest -Source 'SKILL/install/install-runner.mjs' -FilePath (Join-Path $tmpDir.FullName 'install-runner.mjs')

  & node (Join-Path $tmpDir.FullName 'install-runner.mjs') --manifest (Join-Path $tmpDir.FullName 'manifest.json') @args
}
finally {
  Remove-Item -Recurse -Force $tmpDir.FullName -ErrorAction SilentlyContinue
}
