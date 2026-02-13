param(
    [switch]$NoVenv
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$serviceVenvActivate = Join-Path $repoRoot "apps/service/.venv/Scripts/Activate.ps1"
$rootVenvActivate = Join-Path $repoRoot ".venv/Scripts/Activate.ps1"

if (-not $NoVenv) {
    if (Test-Path $serviceVenvActivate) {
        . $serviceVenvActivate
    } elseif (Test-Path $rootVenvActivate) {
        . $rootVenvActivate
    }
}

Push-Location $repoRoot
try {
    pytest apps/service/tests -q
} finally {
    Pop-Location
}
