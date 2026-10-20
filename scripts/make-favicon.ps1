Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'image/hapisabela.jpg'
$destinationPath = Join-Path $projectRoot 'favicon.ico'
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$iconImages = @()
try {
    foreach ($iconSize in @(16, 32, 48, 64, 128, 256)) {
        $bitmap = New-Object System.Drawing.Bitmap($iconSize, $iconSize)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.DrawImage($sourceImage, 0, 0, $iconSize, $iconSize)
        $pngStream = New-Object System.IO.MemoryStream
        $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
        $iconImages += [PSCustomObject]@{ Size = $iconSize; Bytes = $pngStream.ToArray() }
        $pngStream.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
    $fileStream = [System.IO.File]::Create($destinationPath)
    $writer = New-Object System.IO.BinaryWriter($fileStream)
    try {
        $writer.Write([UInt16]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]$iconImages.Count)
        $imageOffset = 6 + 16 * $iconImages.Count
        foreach ($iconImage in $iconImages) {
            $dimensionByte = if ($iconImage.Size -eq 256) { 0 } else { $iconImage.Size }
            $writer.Write([Byte]$dimensionByte)
            $writer.Write([Byte]$dimensionByte)
            $writer.Write([Byte]0)
            $writer.Write([Byte]0)
            $writer.Write([UInt16]1)
            $writer.Write([UInt16]32)
            $writer.Write([UInt32]$iconImage.Bytes.Length)
            $writer.Write([UInt32]$imageOffset)
            $imageOffset += $iconImage.Bytes.Length
        }
        foreach ($iconImage in $iconImages) { $writer.Write([Byte[]]$iconImage.Bytes) }
    } finally { $writer.Dispose(); $fileStream.Dispose() }
    $appIconDirectory = Join-Path $projectRoot 'assets/icons'
    [System.IO.Directory]::CreateDirectory($appIconDirectory) | Out-Null
    foreach ($appIconSize in @(192, 512)) {
        $appBitmap = New-Object System.Drawing.Bitmap($appIconSize, $appIconSize)
        $appGraphics = [System.Drawing.Graphics]::FromImage($appBitmap)
        $appGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $appGraphics.Clear([System.Drawing.Color]::White)
        $appGraphics.DrawImage($sourceImage, 0, 0, $appIconSize, $appIconSize)
        $appBitmap.Save((Join-Path $appIconDirectory "app-$appIconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        $appGraphics.Dispose()
        $appBitmap.Dispose()
    }
} finally { $sourceImage.Dispose() }
Write-Output 'Created favicon.ico with 16, 32, 48, 64, 128, and 256 pixel icons.'
