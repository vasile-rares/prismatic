param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

function Get-ToolPath {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Names
    )

    foreach ($name in $Names) {
        try {
            return (Get-Command $name -ErrorAction Stop).Source
        }
        catch {
        }
    }

    return $null
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    Write-Host "==> $Label"
    $global:LASTEXITCODE = 0
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Pasul '$Label' a eșuat cu codul $LASTEXITCODE."
    }
}

function Get-IncludedDrawioFiles {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseDirectory
    )

    $targets = New-Object System.Collections.Generic.HashSet[string]
    $patterns = @(
        '\\includesvg(?:\[[^\]]*\])?\{(?<path>[^}]+\.drawio)\}',
        '\\includegraphics(?:\[[^\]]*\])?\{(?<path>[^}]+\.drawio\.pdf)\}'
    )

    Get-ChildItem -Path $BaseDirectory -Filter *.tex -Recurse | ForEach-Object {
        $content = Get-Content -Path $_.FullName -Raw
        foreach ($pattern in $patterns) {
            foreach ($match in [regex]::Matches($content, $pattern)) {
                $target = $match.Groups["path"].Value
                if ($target.EndsWith(".drawio.pdf")) {
                    $target = $target.Substring(0, $target.Length - 4)
                }

                [void]$targets.Add($target)
            }
        }
    }

    return @($targets) | Sort-Object
}

function Convert-DrawioToPdf {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DrawioExe,
        [Parameter(Mandatory = $true)]
        [string]$InputPath,
        [Parameter(Mandatory = $true)]
        [string]$OutputPath
    )

    & $DrawioExe --export --format pdf --crop --output $OutputPath $InputPath
    if ($LASTEXITCODE -ne 0) {
        throw "Exportul Draw.io a eșuat pentru '$InputPath' cu codul $LASTEXITCODE."
    }
}

function Ensure-DrawioPdfExports {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseDirectory
    )

    $drawioExe = Get-ToolPath @(
        "drawio",
        "draw.io",
        "diagrams.net",
        "C:\Program Files\draw.io\draw.io.exe",
        "C:\Users\rares\AppData\Local\Programs\draw.io\draw.io.exe",
        "C:\Program Files\diagrams.net\draw.io.exe"
    )

    $missingExports = @()

    foreach ($relativePath in (Get-IncludedDrawioFiles -BaseDirectory $BaseDirectory)) {
        $drawioPath = Join-Path $BaseDirectory ($relativePath -replace '/', '\')
        $pdfPath = "$drawioPath.pdf"

        if (-not (Test-Path $drawioPath)) {
            throw "Fișierul sursă pentru diagramă lipsește: '$relativePath'."
        }

        if (Test-Path $pdfPath) {
            continue
        }

        if ($drawioExe) {
            Write-Host "   Export diagramă: $relativePath -> $([System.IO.Path]::GetFileName($pdfPath))"
            Convert-DrawioToPdf -DrawioExe $drawioExe -InputPath $drawioPath -OutputPath $pdfPath
            continue
        }

        $missingExports += [pscustomobject]@{
            Source = $relativePath
            ExpectedPdf = "$relativePath.pdf"
        }
    }

    if ($missingExports.Count -gt 0) {
        $details = ($missingExports | ForEach-Object {
            " - $($_.Source) -> lipsește $($_.ExpectedPdf)"
        }) -join [Environment]::NewLine

        throw @"
Lipsesc exporturile PDF pentru diagramele Draw.io, iar utilitarul Draw.io/diagrams.net nu este disponibil în PATH.

$details

Instalează Draw.io Desktop / diagrams.net Desktop și rulează din nou build-ul
sau exportă manual fișierele '.drawio' în '.drawio.pdf' în același director.
"@
    }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root

try {
    if (-not (Get-ToolPath @("xelatex"))) {
        throw "Nu am găsit 'xelatex' în PATH."
    }

    if (-not (Get-ToolPath @("biber"))) {
        throw "Nu am găsit 'biber' în PATH."
    }

    if ($Clean) {
        Get-ChildItem -File -Include *.aux,*.bbl,*.bcf,*.blg,*.lof,*.log,*.lot,*.out,*.run.xml,*.toc,*.pdf |
            Remove-Item -Force -ErrorAction SilentlyContinue
    }

    Invoke-Step "Export diagrame Draw.io -> PDF" { Ensure-DrawioPdfExports -BaseDirectory $root }
    Invoke-Step "XeLaTeX (1)" { xelatex -shell-escape -interaction=nonstopmode -halt-on-error main.tex | Out-Host }
    Invoke-Step "Biber" { biber main | Out-Host }
    Invoke-Step "XeLaTeX (2)" { xelatex -shell-escape -interaction=nonstopmode -halt-on-error main.tex | Out-Host }
    Invoke-Step "XeLaTeX (3)" { xelatex -shell-escape -interaction=nonstopmode -halt-on-error main.tex | Out-Host }
}
finally {
    Pop-Location
}
