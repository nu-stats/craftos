# Regenerates the CraftOS boot/splash artwork (contour-line motif, no third-party art).
#   powershell -File tools\gen-branding.ps1
# Outputs:
#   config/branding/splash-800x600.png, splash-640x480.png   boot menu backgrounds (GRUB + syslinux)
#   config/includes.chroot/usr/share/plymouth/themes/craftos/{bgrt-fallback,watermark}.png
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot

function New-Canvas($w, $h) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
    return @($bmp, $g)
}

function Draw-Contours($g, $w, $h, $cx, $cy, $loops, $maxR) {
    for ($k = 1; $k -le $loops; $k++) {
        $r = $maxR * $k / $loops
        $pts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
        for ($i = 0; $i -le 180; $i++) {
            $t = 2 * [Math]::PI * $i / 180
            $d = 1 + 0.10 * [Math]::Sin(3 * $t + $k * 0.35) + 0.06 * [Math]::Sin(5 * $t - $k * 0.6) + 0.03 * [Math]::Sin(9 * $t + $k)
            $pts.Add((New-Object System.Drawing.PointF ([single]($cx + $r * 1.5 * $d * [Math]::Cos($t))), ([single]($cy + $r * $d * [Math]::Sin($t)))))
        }
        $alpha = if ($k % 5 -eq 0) { 70 } else { 34 }
        $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb($alpha, 120, 200, 170)), ([single]$(if ($k % 5 -eq 0) { 1.6 } else { 1 }))
        $g.DrawPolygon($pen, $pts.ToArray())
        $pen.Dispose()
    }
}

function Draw-Wordmark($g, $cx, $y, $size) {
    $font = New-Object System.Drawing.Font 'Segoe UI Semibold', $size, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'
    $g.DrawString('Craft', $font, [System.Drawing.Brushes]::White, [single]($cx - $size * 0.70), [single]$y, $sf)
    $acc = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 120, 220, 180))
    $g.DrawString('OS', $font, $acc, [single]($cx + $size * 1.10), [single]$y, $sf)
    $font.Dispose(); $acc.Dispose()
}

# Boot menu backgrounds. The menu starts around 52% down, so art and name stay in the top half.
foreach ($s in @(@(800, 600), @(640, 480))) {
    $w = $s[0]; $h = $s[1]
    $c = New-Canvas $w $h; $bmp = $c[0]; $g = $c[1]
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $br = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 9, 22, 20)), ([System.Drawing.Color]::FromArgb(255, 14, 40, 36)), 90
    $g.FillRectangle($br, $rect)
    Draw-Contours $g $w $h ($w * 0.5) ($h * 0.30) 16 ($h * 0.50)
    Draw-Wordmark $g ($w * 0.5) ($h * 0.16) ($h * 0.11)
    $bmp.Save((Join-Path $root "config\branding\splash-${w}x${h}.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $br.Dispose()
}

# Plymouth: transparent wordmark shown on the dark background colour set in the theme.
$pdir = Join-Path $root 'config\includes.chroot\usr\share\plymouth\themes\craftos'
foreach ($spec in @(@('bgrt-fallback.png', 120), @('watermark.png', 28))) {
    $size = $spec[1]; $w = [int]($size * 6.2); $h = [int]($size * 1.6)
    $c = New-Canvas $w $h; $bmp = $c[0]; $g = $c[1]
    Draw-Wordmark $g ($w / 2) ($size * 0.15) $size
    $bmp.Save((Join-Path $pdir $spec[0]), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}
# Installer launcher icon: rounded dark tile, contour rings, accent down-arrow.
foreach ($px in 256, 48) {
    $idir = Join-Path $root "config\includes.chroot\usr\share\icons\hicolor\${px}x${px}\apps"
    New-Item -ItemType Directory -Force $idir | Out-Null
    $c = New-Canvas $px $px; $bmp = $c[0]; $g = $c[1]
    $m = $px * 0.04; $rad = $px * 0.22; $d = $rad * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($m, $m, $d, $d, 180, 90); $path.AddArc($px - $m - $d, $m, $d, $d, 270, 90)
    $path.AddArc($px - $m - $d, $px - $m - $d, $d, $d, 0, 90); $path.AddArc($m, $px - $m - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $br = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 11, 30, 27))
    $g.FillPath($br, $path)
    $g.SetClip($path)
    Draw-Contours $g $px $px ($px * 0.5) ($px * 0.5) 7 ($px * 0.36)
    $g.ResetClip()
    $acc = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 120, 220, 180))
    $a = $px * 0.5; $s = $px * 0.22
    $tri = @((New-Object System.Drawing.PointF ([single]($a - $s)), ([single]($a - $s * 0.1))),
             (New-Object System.Drawing.PointF ([single]($a + $s)), ([single]($a - $s * 0.1))),
             (New-Object System.Drawing.PointF ([single]$a), ([single]($a + $s * 0.9))))
    $g.FillPolygon($acc, $tri)
    $g.FillRectangle($acc, [single]($a - $s * 0.38), [single]($a - $s * 1.1), [single]($s * 0.76), [single]($s * 1.1))
    $bmp.Save((Join-Path $idir 'craftos-install.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $br.Dispose(); $acc.Dispose(); $path.Dispose()
}
"done"
