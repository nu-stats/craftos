# Lettered placeholder icons for trial packages whose project has no icon yet.
#   powershell -ExecutionPolicy Bypass -File tools\gen-trial-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$icons = @(
    @{ name = 'statcraft';      text = 'St'; r = 40;  g = 110; b = 180 },
    @{ name = 'rcraft';         text = 'R';  r = 50;  g = 120; b = 200 },
    @{ name = 'husky-eye-view'; text = 'EV'; r = 160; g = 40;  b = 60  },
    @{ name = 'husky-explorer'; text = 'Hx'; r = 150; g = 60;  b = 50  },
    @{ name = 'craft-keys';     text = 'Ck'; r = 90;  g = 90;  b = 100 }
)
foreach ($i in $icons) {
    $s = 256
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAlias'
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 56
    $path.AddArc(8, 8, $d, $d, 180, 90); $path.AddArc($s - 8 - $d, 8, $d, $d, 270, 90)
    $path.AddArc($s - 8 - $d, $s - 8 - $d, $d, $d, 0, 90); $path.AddArc(8, $s - 8 - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $c1 = [System.Drawing.Color]::FromArgb(255, [Math]::Min(255, [int]($i.r * 1.25 + 20)), [Math]::Min(255, [int]($i.g * 1.25 + 20)), [Math]::Min(255, [int]($i.b * 1.25 + 20)))
    $c2 = [System.Drawing.Color]::FromArgb(255, $i.r, $i.g, $i.b)
    $br = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Rectangle 0, 0, $s, $s), $c1, $c2, 90
    $g.FillPath($br, $path)
    $font = New-Object System.Drawing.Font 'Segoe UI Semibold', 110, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
    $g.DrawString($i.text, $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 0, $s, $s), $sf)
    $bmp.Save((Join-Path $root "trial\icons\$($i.name).png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $br.Dispose(); $font.Dispose()
}
"done"
