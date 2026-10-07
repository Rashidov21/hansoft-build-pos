Param(
  [switch]$SkipRustTarget,
  [switch]$SkipNodeModulesCache
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Remove-TreeIfExists([string]$Path, [string]$Label) {
  if (Test-Path $Path) {
    Write-Host "Removing $Label : $Path" -ForegroundColor Yellow
    Remove-Item $Path -Recurse -Force -ErrorAction Stop
  }
}

Write-Host "=== Geeks POS: clean build artifacts ===" -ForegroundColor Cyan

Remove-TreeIfExists (Join-Path $root "frontend\dist") "frontend dist"
Remove-TreeIfExists (Join-Path $root "frontend\.vite") "Vite cache"

if (-not $SkipRustTarget) {
  Remove-TreeIfExists (Join-Path $root "src-tauri\target") "Rust target (full clean)"
}
else {
  Write-Host "Skipping src-tauri\target (use without -SkipRustTarget for full clean)." -ForegroundColor DarkGray
}

Remove-TreeIfExists (Join-Path $root "backend\build") "PyInstaller work"
Remove-TreeIfExists (Join-Path $root "backend\dist") "PyInstaller dist"

if (-not $SkipNodeModulesCache) {
  $viteTs = Join-Path $root "frontend\node_modules\.tmp"
  if (Test-Path $viteTs) {
    Remove-Item $viteTs -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Removed frontend\node_modules\.tmp" -ForegroundColor DarkGray
  }
}

Write-Host "Clean done." -ForegroundColor Green
