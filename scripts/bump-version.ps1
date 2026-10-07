Param(
  [ValidateSet('patch', 'minor', 'major')]
  [string]$Part = 'patch',
  [string]$Root = ""
)

$ErrorActionPreference = "Stop"
if (-not $Root) {
  $Root = Split-Path -Parent $PSScriptRoot
}

$versionFile = Join-Path $Root "VERSION"
if (-not (Test-Path $versionFile)) {
  Set-Content -Path $versionFile -Value "1.0.0" -Encoding UTF8
}
$current = (Get-Content $versionFile -Raw).Trim()
if ($current -match '^(\d+)\.(\d+)\.(\d+)') {
  $major = [int]$Matches[1]
  $minor = [int]$Matches[2]
  $patch = [int]$Matches[3]
  switch ($Part) {
    'major' { $major++; $minor = 0; $patch = 0 }
    'minor' { $minor++; $patch = 0 }
    'patch' { $patch++ }
  }
  $next = "$major.$minor.$patch"
}
else {
  throw "Cannot parse VERSION: $current"
}

Set-Content -Path $versionFile -Value $next -Encoding UTF8
Write-Host "VERSION -> $next ($Part bump)" -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "sync-version.ps1") -Version $next -Root $Root -NoWriteLock
