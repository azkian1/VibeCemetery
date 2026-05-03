$ErrorActionPreference = 'Stop'

$installRef = if ($env:VIBECEMETERY_INSTALL_REF) { $env:VIBECEMETERY_INSTALL_REF } else { 'e7a04921dfee5af3880f603763bff20bfe672621' }
$rawBase = "https://raw.githubusercontent.com/azkian1/VibeCemetery/$installRef"
$tmpDir = New-Item -ItemType Directory -Force -Path ([System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.IO.Path]::GetRandomFileName()))

try {
  Invoke-WebRequest -Uri "$rawBase/SKILL/install/install-contract.mjs" -OutFile (Join-Path $tmpDir.FullName 'install-contract.mjs') -UseBasicParsing | Out-Null
  Invoke-WebRequest -Uri "$rawBase/SKILL/install/install-runner.mjs" -OutFile (Join-Path $tmpDir.FullName 'install-runner.mjs') -UseBasicParsing | Out-Null

  & node (Join-Path $tmpDir.FullName 'install-runner.mjs') @args
}
finally {
  Remove-Item -Recurse -Force $tmpDir.FullName -ErrorAction SilentlyContinue
}
