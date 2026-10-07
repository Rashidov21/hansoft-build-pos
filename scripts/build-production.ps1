Param(
  [string]$Python = "py",
  [string]$Version = "",
  [switch]$SkipNpmInstall,
  [switch]$SkipClean,
  [switch]$SkipRustTargetOnClean,
  [switch]$FullClean,
  [switch]$NoIncrementBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== Geeks POS: production build ===" -ForegroundColor Cyan

$syncArgs = @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "scripts\sync-version.ps1"), "-Root", $root)
if ($Version) { $syncArgs += @("-Version", $Version) }
if (-not $NoIncrementBuild) { $syncArgs += "-IncrementBuild" }
powershell @syncArgs | Out-Null
$buildVersion = (Get-Content (Join-Path $root "VERSION") -Raw).Trim()
$lock = Get-Content (Join-Path $root "version.lock.json") -Raw | ConvertFrom-Json
$buildNum = [int]$lock.build
$gitHash = [string]$lock.lastGit
$fullVersion = if ($buildNum -gt 0) { "$buildVersion+$buildNum" } else { $buildVersion }
Write-Host "Release: $fullVersion" -ForegroundColor Green

$venvPython = Join-Path $root ".venv\Scripts\python.exe"
if (Test-Path $venvPython) {
  $Python = $venvPython
  Write-Host "Python: .venv ($Python)" -ForegroundColor DarkGray
}
elseif ($Python -eq "py" -and -not (Get-Command "py" -ErrorAction SilentlyContinue)) {
  if (Get-Command "python" -ErrorAction SilentlyContinue) {
    $Python = "python"
    Write-Host "Python: global python (py launcher yo'q)" -ForegroundColor DarkGray
  }
  else {
    throw "Python topilmadi. .venv yarating yoki py/python PATH ga qo'shing."
  }
}

foreach ($cmd in @("npm", "npx", "rustc")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Required command not on PATH: $cmd"
  }
}

if (-not $SkipClean) {
  $cleanArgs = @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "scripts\clean-build-artifacts.ps1"))
  # Keep src-tauri\target unless -FullClean (WDAC often blocks fresh Rust build-script exes).
  if ($FullClean -and -not $SkipRustTargetOnClean) {
    Write-Host "Full clean: removing Rust target ( -FullClean )" -ForegroundColor Yellow
  }
  else {
    $cleanArgs += "-SkipRustTarget"
    Write-Host "Clean: keeping src-tauri\target (use -FullClean to wipe Rust cache)" -ForegroundColor DarkGray
  }
  powershell @cleanArgs
}

$repoDb = Join-Path $root "backend\db.sqlite3"
if (Test-Path $repoDb) {
  throw "Release blocked: backend\db.sqlite3 exists. Remove or move (never ship user DB in installer)."
}

Write-Host "[1/5] Backend sidecar (PyInstaller)..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $root "backend\scripts\build_sidecar.ps1") -Python $Python -Name "geeks_pos_backend" -RequireVenv

$sidecar = Join-Path $root "backend\dist\geeks_pos_backend.exe"
if (-not (Test-Path $sidecar)) {
  throw "Sidecar missing: $sidecar"
}
$sidecarHash = Get-FileHash $sidecar -Algorithm SHA256
Write-Host "  sidecar SHA256: $($sidecarHash.Hash.Substring(0,16))..." -ForegroundColor DarkGray

Write-Host "[2/5] Frontend (Vite production)..." -ForegroundColor Cyan
if (-not $SkipNpmInstall) {
  npm install --prefix frontend
}
npm run build --prefix frontend

Write-Host "[3/5] Tauri bundle (MSI/NSIS)..." -ForegroundColor Cyan
Push-Location $root
try {
  npx tauri build --config src-tauri/tauri.conf.json
}
finally {
  Pop-Location
}

Write-Host "[4/5] Verify bundled sidecar..." -ForegroundColor Cyan
$releaseDir = Join-Path $root "src-tauri\target\release"
$sidecarInRelease = Get-ChildItem -Path $releaseDir -Filter "geeks_pos_backend*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sidecarInRelease) {
  throw "Tauri release folder missing geeks_pos_backend*.exe"
}
Write-Host "  OK: $($sidecarInRelease.Name)" -ForegroundColor DarkGray

Write-Host "[5/5] Stage versioned release..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\stage-release-artifacts.ps1") `
  -Version $buildVersion -Build $buildNum -Git $gitHash -Root $root

Write-Host ""
Write-Host "Build finished: $fullVersion" -ForegroundColor Green
Write-Host "  Installers: src-tauri\target\release\bundle\" -ForegroundColor Green
Write-Host "  Archived:   dist\releases\$fullVersion\" -ForegroundColor Green
Write-Host "  LATEST:     dist\releases\LATEST.txt" -ForegroundColor DarkGray
Write-Host "  Semver:     edit VERSION, then build (build counter auto +1)" -ForegroundColor DarkGray
Write-Host "  Bump:       npm run version:bump:patch" -ForegroundColor DarkGray
