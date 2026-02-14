param(
    [switch]$NoVenv
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
    pytest apps/service/tests -q
} finally {
    Pop-Location
}
