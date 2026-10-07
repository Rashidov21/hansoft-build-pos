Param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$Root = "",
  [int]$Build = 0,
  [string]$Git = ""
)

$ErrorActionPreference = "Stop"
if (-not $Root) {
  $Root = Split-Path -Parent $PSScriptRoot
}

$bundleRoot = Join-Path $Root "src-tauri\target\release\bundle"
if (-not (Test-Path $bundleRoot)) {
  throw "Bundle folder not found: $bundleRoot (run tauri build first)"
}

$folderName = if ($Build -gt 0) { "$Version+$Build" } else { $Version }
$destRoot = Join-Path $Root "dist\releases\$folderName"
New-Item -ItemType Directory -Force -Path $destRoot | Out-Null

$artifacts = @()
Get-ChildItem -Path $bundleRoot -Recurse -File -Include *.msi, *.exe, *.nsis.zip, *.zip |
  Where-Object { $_.Name -match 'geeks|Geeks|setup|msi' -or $_.DirectoryName -match 'msi|nsis' } |
  ForEach-Object {
    $rel = $_.FullName.Substring($bundleRoot.Length).TrimStart('\')
    $target = Join-Path $destRoot $_.Name
    Copy-Item -Path $_.FullName -Destination $target -Force
    $hash = Get-FileHash $_.FullName -Algorithm SHA256
    $artifacts += @{
      name   = $_.Name
      path   = $rel
      size   = $_.Length
      sha256 = $hash.Hash
    }
    Write-Host "  staged: $($_.Name)" -ForegroundColor DarkGray
  }

# Also copy loose release exes if present
$releaseDir = Join-Path $Root "src-tauri\target\release"
Get-ChildItem -Path $releaseDir -Filter "geeks-pos*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
  $target = Join-Path $destRoot $_.Name
  if (-not (Test-Path $target)) {
    Copy-Item $_.FullName $target -Force
    $hash = Get-FileHash $_.FullName -Algorithm SHA256
    $artifacts += @{
      name   = $_.Name
      path   = "release\$($_.Name)"
      size   = $_.Length
      sha256 = $hash.Hash
    }
  }
}

$manifest = @{
  version     = $Version
  build       = $Build
  fullVersion = if ($Build -gt 0) { "$Version+$Build" } else { $Version }
  stagedAt    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  git         = $Git
  artifacts   = $artifacts
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $destRoot "release-manifest.json") -Encoding UTF8

# Latest pointer (copy path file for installers)
$latestFile = Join-Path $Root "dist\releases\LATEST.txt"
Set-Content -Path $latestFile -Value $folderName -Encoding UTF8

Write-Host "Staged release -> $destRoot" -ForegroundColor Green
Write-Host "  artifacts: $($artifacts.Count)" -ForegroundColor DarkGray
