$ErrorActionPreference = 'Stop'

$rawBase = 'https://raw.githubusercontent.com/azkian1/VibeCemetery/ba82543066d5696535d9af97f142872c6bf1ba00'
$tmpDir = New-Item -ItemType Directory -Force -Path ([System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.IO.Path]::GetRandomFileName()))

try {
  Invoke-WebRequest -Uri "$rawBase/SKILL/install/install-contract.mjs" -OutFile (Join-Path $tmpDir.FullName 'install-contract.mjs') -UseBasicParsing | Out-Null
  Invoke-WebRequest -Uri "$rawBase/SKILL/install/install-runner.mjs" -OutFile (Join-Path $tmpDir.FullName 'install-runner.mjs') -UseBasicParsing | Out-Null

  & node (Join-Path $tmpDir.FullName 'install-runner.mjs') @args
}
finally {
  Remove-Item -Recurse -Force $tmpDir.FullName -ErrorAction SilentlyContinue
}
