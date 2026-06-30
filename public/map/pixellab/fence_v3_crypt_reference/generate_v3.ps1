$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tilesetDir = Join-Path $repoRoot 'tilesets'
$outPath = Join-Path $tilesetDir 'main_gate_fence_connectors_32x32_v3.png'
$copyPath = Join-Path $PSScriptRoot 'main_gate_fence_connectors_32x32_v3.png'
$refPath = 'C:\Users\az\Desktop\March\02\vibecemetery\public\Tailes\crypt\32px+VXACE\crypt_c.png'

$ref = [System.Drawing.Bitmap]::FromFile($refPath)
$bmp = New-Object System.Drawing.Bitmap 128,128,([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor

function Hex([string]$value) {
    [System.Drawing.ColorTranslator]::FromHtml($value)
}

$concreteOutline = Hex '#0A1012'
$concreteDark = Hex '#1D2A30'
$concreteMid = Hex '#31434B'
$concreteHi = Hex '#546975'
$moss = Hex '#33463C'

function FillRect([int]$x, [int]$y, [int]$w, [int]$h, [System.Drawing.Color]$c) {
    if ($w -le 0 -or $h -le 0) { return }
    $brush = New-Object System.Drawing.SolidBrush $c
    $script:g.FillRectangle($brush, $x, $y, $w, $h)
    $brush.Dispose()
}

function PutPixel([int]$x, [int]$y, [System.Drawing.Color]$c) {
    if ($x -lt 0 -or $x -ge 128 -or $y -lt 0 -or $y -ge 128) { return }
    $script:bmp.SetPixel($x, $y, $c)
}

function ClearTile([int]$col, [int]$row) {
    FillRect ($col * 32) ($row * 32) 32 32 ([System.Drawing.Color]::Transparent)
}

function CopyRef([int]$sx, [int]$sy, [int]$w, [int]$h, [int]$dx, [int]$dy) {
    for ($y = 0; $y -lt $h; $y++) {
        for ($x = 0; $x -lt $w; $x++) {
            $c = $script:ref.GetPixel($sx + $x, $sy + $y)
            if ($c.A -gt 0) {
                PutPixel ($dx + $x) ($dy + $y) $c
            }
        }
    }
}

function PaintConcreteColumn([int]$ox, [int]$oy, [int]$x) {
    FillRect ($ox + $x) ($oy + 0) 9 32 $concreteOutline
    FillRect ($ox + $x + 1) ($oy + 1) 7 30 $concreteDark
    FillRect ($ox + $x + 2) ($oy + 2) 5 25 $concreteMid
    FillRect ($ox + $x + 3) ($oy + 3) 3 19 $concreteHi
    FillRect ($ox + $x + 1) ($oy + 0) 7 4 $concreteOutline
    FillRect ($ox + $x + 2) ($oy + 1) 5 2 $concreteHi
    PutPixel ($ox + $x + 2) ($oy + 14) $moss
}

function BuildHorizontal([int]$col, [int]$row) {
    $ox = $col * 32
    $oy = $row * 32
    ClearTile $col $row
    CopyRef 288 96 32 32 $ox $oy
}

function BuildLeftTransition([int]$col, [int]$row) {
    $ox = $col * 32
    $oy = $row * 32
    ClearTile $col $row
    CopyRef 256 96 32 32 $ox $oy
    PaintConcreteColumn $ox $oy 0
}

function BuildRightTransition([int]$col, [int]$row) {
    $ox = $col * 32
    $oy = $row * 32
    ClearTile $col $row
    CopyRef 320 96 32 32 $ox $oy
    PaintConcreteColumn $ox $oy 23
}

function BuildVertical([int]$col, [int]$row) {
    $ox = $col * 32
    $oy = $row * 32
    ClearTile $col $row
    CopyRef 256 128 32 32 $ox $oy
    CopyRef 320 128 32 32 $ox $oy
}

function BuildRightDownCorner([int]$col, [int]$row) {
    $ox = $col * 32
    $oy = $row * 32
    ClearTile $col $row
    CopyRef 256 160 32 32 $ox $oy
    CopyRef 288 160 32 32 $ox $oy
    PaintConcreteColumn $ox $oy 0
}

function BuildLeftDownCorner([int]$col, [int]$row) {
    $ox = $col * 32
    $oy = $row * 32
    ClearTile $col $row
    CopyRef 288 160 32 32 $ox $oy
    CopyRef 320 160 32 32 $ox $oy
    PaintConcreteColumn $ox $oy 23
}

BuildHorizontal 0 0
ClearTile 1 0
BuildLeftTransition 2 0
BuildRightTransition 3 0

BuildVertical 0 1
ClearTile 1 1
BuildRightDownCorner 2 1
BuildLeftDownCorner 3 1

ClearTile 0 2
ClearTile 1 2
ClearTile 2 2
ClearTile 3 2

ClearTile 0 3
ClearTile 1 3
ClearTile 2 3
ClearTile 3 3

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($copyPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$ref.Dispose()

Write-Output "created=$outPath"
