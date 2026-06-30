Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$batchDir = $PSScriptRoot
$sourceDir = Join-Path $batchDir "source"
$cleanDir = Join-Path $batchDir "cleaned_no_soil"
$contactDir = Join-Path $batchDir "contact_sheets"
$manifestPath = Join-Path $batchDir "cleaned_no_soil_manifest.json"
$contactSheetPath = Join-Path $contactDir "tree_cleaned_no_soil_contact_sheet.png"

New-Item -ItemType Directory -Force -Path $cleanDir | Out-Null
New-Item -ItemType Directory -Force -Path $contactDir | Out-Null

$targets = @(
    @{ Asset = "tree_small_thin_a_crooked_sapling_32x64"; File = "tree_small_thin_a_crooked_sapling_32x64_2f5d3182.png"; YStart = 50; Note = "small 1x2 sapling, remove root grass" },
    @{ Asset = "tree_small_thin_b_dark_yew_32x64"; File = "tree_small_thin_b_dark_yew_32x64_066c250a.png"; YStart = 50; Note = "small 1x2 dark yew, remove small base" },
    @{ Asset = "tree_small_thin_c_dead_shrub_tree_32x64"; File = "tree_small_thin_c_dead_shrub_tree_32x64_dac67e5b.png"; YStart = 48; Note = "small 1x2 dead shrub, remove grass clump" },
    @{ Asset = "tree_tall_thin_cypress_a_straight_32x96"; File = "tree_tall_thin_cypress_a_straight_32x96_533454c2.png"; YStart = 74; Note = "1x3 straight cypress, remove diamond base" },
    @{ Asset = "tree_tall_thin_cypress_b_bent_32x96"; File = "tree_tall_thin_cypress_b_bent_32x96_59a95dc6.png"; YStart = 75; Note = "1x3 bent cypress, remove grass base" },
    @{ Asset = "tree_medium_b_crooked_deadwood_64x96"; File = "tree_medium_b_crooked_deadwood_64x96_9556f66f.png"; YStart = 66; Note = "2x3 deadwood, remove diamond platform" },
    @{ Asset = "tree_medium_c_dark_leafy_yew_64x96"; File = "tree_medium_c_dark_leafy_yew_64x96_b43f7f4d.png"; YStart = 76; Note = "2x3 leafy yew, remove small green base" },
    @{ Asset = "tree_round_leafy_large_a_old_oak_96x128"; File = "tree_round_leafy_large_a_old_oak_96x128_330f4e2f.png"; YStart = 92; Note = "3x4 old oak, remove diamond base" },
    @{ Asset = "tree_round_leafy_large_b_broad_mossy_tree_96x128"; File = "tree_round_leafy_large_b_broad_mossy_tree_96x128_802c5e35.png"; YStart = 100; Note = "3x4 broad mossy tree, remove oval base" },
    @{ Asset = "tree_hero_old_b_dead_witness_tree_96x160"; File = "tree_hero_old_b_dead_witness_tree_96x160_2eccfb1a.png"; YStart = 128; Note = "3x5 hero dead tree, remove grass strip" }
)

function Test-BranchPixel {
    param([System.Drawing.Color]$Color)

    if ($Color.A -eq 0) { return $false }

    $r = [int]$Color.R
    $g = [int]$Color.G
    $b = [int]$Color.B

    $brown = ($r -ge ($g - 4)) -and ($r -ge ($b + 5)) -and (($r - $g) -gt 4 -or ($g - $b) -gt 4)
    $darkBrown = ($r -gt 22) -and ($r -lt 150) -and ($g -lt 105) -and ($b -lt 105) -and ($r -ge ($g - 3)) -and ($r -ge ($b - 2))
    $purpleBranch = ($r -gt ($g + 8)) -and ($b -gt ($g + 5)) -and ($r -lt 150) -and ($b -lt 140) -and ($g -lt 95)

    return ($brown -or $darkBrown -or $purpleBranch)
}

$manifest = @()
$transparent = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)

foreach ($target in $targets) {
    $inputPath = Join-Path $sourceDir $target.File
    if (-not (Test-Path -LiteralPath $inputPath)) {
        throw "Missing source image: $inputPath"
    }

    $bitmap = [System.Drawing.Bitmap]::FromFile($inputPath)
    try {
        $output = New-Object System.Drawing.Bitmap $bitmap.Width, $bitmap.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($output)
        try {
            $graphics.Clear($transparent)
            $graphics.DrawImageUnscaled($bitmap, 0, 0)
        }
        finally {
            $graphics.Dispose()
        }

        $branchMask = New-Object 'bool[,]' $bitmap.Width, $bitmap.Height
        for ($y = 0; $y -lt $bitmap.Height; $y++) {
            for ($x = 0; $x -lt $bitmap.Width; $x++) {
                $branchMask[$x, $y] = Test-BranchPixel -Color $output.GetPixel($x, $y)
            }
        }

        $removed = 0
        for ($y = [int]$target.YStart; $y -lt $bitmap.Height; $y++) {
            for ($x = 0; $x -lt $bitmap.Width; $x++) {
                $color = $output.GetPixel($x, $y)
                if ($color.A -eq 0) { continue }

                if ($branchMask[$x, $y]) {
                    continue
                }

                $output.SetPixel($x, $y, $transparent)
                $removed++
            }
        }

        $outFile = $target.File -replace '\.png$', '_clean_no_soil.png'
        $outPath = Join-Path $cleanDir $outFile
        $output.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

        $manifest += [pscustomobject]@{
            asset = $target.Asset
            source = ("Xmap/pixellab/tree_batch_mcp_20260605/source/" + $target.File)
            cleaned = ("Xmap/pixellab/tree_batch_mcp_20260605/cleaned_no_soil/" + $outFile)
            size = ("{0}x{1}" -f $bitmap.Width, $bitmap.Height)
            y_start = [int]$target.YStart
            removed_pixels = $removed
            status = "cleaned / preview candidate"
            notes = $target.Note
        }
    }
    finally {
        if ($output) { $output.Dispose() }
        $bitmap.Dispose()
    }
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$scale = 2
$cardWidth = 240
$cardHeight = 260
$columns = 3
$rows = [Math]::Ceiling($targets.Count / $columns)
$sheetWidth = $columns * $cardWidth
$sheetHeight = [int]($rows * $cardHeight + 44)
$sheet = New-Object System.Drawing.Bitmap $sheetWidth, $sheetHeight, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($sheet)
try {
    $g.Clear([System.Drawing.Color]::FromArgb(24, 32, 29))
    $titleFont = New-Object System.Drawing.Font "Consolas", 15, ([System.Drawing.FontStyle]::Bold)
    $labelFont = New-Object System.Drawing.Font "Consolas", 9
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190, 210, 200))
    $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(78, 91, 84)), 1
    $checkerA = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(68, 76, 72))
    $checkerB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(47, 55, 52))

    $g.DrawString("cleaned no-soil tree variants", $titleFont, $white, 16, 12)

    for ($i = 0; $i -lt $manifest.Count; $i++) {
        $item = $manifest[$i]
        $col = $i % $columns
        $row = [Math]::Floor($i / $columns)
        $cardX = $col * $cardWidth + 12
        $cardY = $row * $cardHeight + 44
        $g.DrawRectangle($borderPen, $cardX, $cardY, $cardWidth - 24, $cardHeight - 18)

        $cleanPath = Join-Path $batchDir ($item.cleaned -replace '^Xmap/pixellab/tree_batch_mcp_20260605/', '')
        $img = [System.Drawing.Bitmap]::FromFile($cleanPath)
        try {
            $imgW = $img.Width * $scale
            $imgH = $img.Height * $scale
            $imgX = $cardX + [int](($cardWidth - 24 - $imgW) / 2)
            $imgY = $cardY + 14

            for ($cy = 0; $cy -lt $imgH; $cy += 8) {
                for ($cx = 0; $cx -lt $imgW; $cx += 8) {
                    $brush = if ((([int]($cx / 8) + [int]($cy / 8)) % 2) -eq 0) { $checkerA } else { $checkerB }
                    $g.FillRectangle($brush, $imgX + $cx, $imgY + $cy, 8, 8)
                }
            }

            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
            $g.DrawImage($img, $imgX, $imgY, $imgW, $imgH)
        }
        finally {
            $img.Dispose()
        }

        $short = $item.asset -replace '^tree_', ''
        if ($short.Length -gt 27) { $short = $short.Substring(0, 27) }
        $g.DrawString($short, $labelFont, $white, $cardX + 8, $cardY + $cardHeight - 62)
        $g.DrawString(("{0} / removed {1}px" -f $item.size, $item.removed_pixels), $labelFont, $muted, $cardX + 8, $cardY + $cardHeight - 44)
    }
}
finally {
    $g.Dispose()
    if ($titleFont) { $titleFont.Dispose() }
    if ($labelFont) { $labelFont.Dispose() }
    if ($white) { $white.Dispose() }
    if ($muted) { $muted.Dispose() }
    if ($borderPen) { $borderPen.Dispose() }
    if ($checkerA) { $checkerA.Dispose() }
    if ($checkerB) { $checkerB.Dispose() }
}

$sheet.Save($contactSheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()

"cleaned=$($manifest.Count)"
"manifest=$manifestPath"
"contact_sheet=$contactSheetPath"
