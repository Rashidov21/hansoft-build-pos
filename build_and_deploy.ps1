Param(
  [string]$Python = "py",
  [string]$Version = "",
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "[0/7] Preflight (py, npm, npx)..." -ForegroundColor Cyan
foreach ($cmd in @("py", "npm", "npx")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Talab qilinadigan buyruq topilmadi: '$cmd'. PATH ga qo'shing yoki o'rnating."
  }
}

$versionFile = Join-Path $root "VERSION"
if ($Version) {
  $buildVersion = $Version.Trim()
}
elseif (Test-Path $versionFile) {
  $buildVersion = (Get-Content $versionFile -Raw).Trim()
}
else {
  throw "VERSION file missing. Create VERSION (e.g. 1.0.0) or pass -Version."
}
powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\sync-version.ps1") -Version $buildVersion -Root $root
Write-Host "Build version: $buildVersion" -ForegroundColor Cyan

Write-Host "[1/7] Cleaning old artifacts..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File ".\scripts\clean-build-artifacts.ps1"
$repoDb = ".\backend\db.sqlite3"
if (Test-Path $repoDb) {
  throw "Clean release rad etildi: $repoDb topildi. Bu fayl eski user/PINni yangi installga ko‘chirib yuborishi mumkin."
}

Write-Host "[2/7] Building backend sidecar..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File ".\backend\scripts\build_sidecar.ps1" -Python $Python -Name "geeks_pos_backend" -RequireVenv

$sidecarExe = ".\backend\dist\geeks_pos_backend.exe"
if (!(Test-Path $sidecarExe)) {
  throw "Sidecar build failed: $sidecarExe topilmadi."
}

Write-Host "[3/7] Verifying sidecar output..." -ForegroundColor Cyan
$hash = Get-FileHash $sidecarExe -Algorithm SHA256
Write-Host ("Sidecar SHA256: " + $hash.Hash) -ForegroundColor DarkGray

Write-Host "[4/7] Building frontend..." -ForegroundColor Cyan
if (-not $SkipNpmInstall) {
  npm install --prefix frontend
}
npm run build --prefix frontend

Write-Host "[5/7] Building Tauri desktop installer..." -ForegroundColor Cyan
npx tauri build --config src-tauri/tauri.conf.json

Write-Host "Tauri release ichida sidecar tekshiruvi..." -ForegroundColor Cyan
$releaseDir = Join-Path $root "src-tauri\target\release"
$sidecarInRelease = Get-ChildItem -Path $releaseDir -Filter "geeks_pos_backend*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sidecarInRelease) {
  throw "Tauri build: externalBin sidecar topilmadi: $releaseDir\geeks_pos_backend*.exe (tauri.conf.json externalBin)"
}
Write-Host ("Sidecar (release): " + $sidecarInRelease.FullName) -ForegroundColor DarkGray

Write-Host "[6/7] Stage versioned release files..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\stage-release-artifacts.ps1") -Version $buildVersion -Root $root

Write-Host "[7/7] Done ($buildVersion)." -ForegroundColor Green
Write-Host "  Tauri bundle: .\src-tauri\target\release\bundle\" -ForegroundColor Green
Write-Host "  Versioned:    .\dist\releases\$buildVersion\" -ForegroundColor Green
