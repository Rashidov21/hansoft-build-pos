#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Inbound allow rule for Geeks POS backend (127.0.0.1 Waitress). Run once after install.

.DESCRIPTION
  Windows Installer (WiX/NSIS via Tauri) does not reliably add firewall rules without a custom MSI merge module.
  This script uses netsh so admins can whitelist the sidecar after deployment.

.PARAMETER ProgramPath
  Full path to geeks_pos_backend-x86_64-pc-windows-msvc.exe (or geeks_pos_backend.exe) next to GEEKS POS.exe.
#>
Param(
  [string]$ProgramPath = ""
)

$ErrorActionPreference = "Stop"

function Find-SidecarWalkingUpFromScript {
  $dir = $PSScriptRoot
  $names = @(
    "geeks_pos_backend-x86_64-pc-windows-msvc.exe",
    "geeks_pos_backend.exe"
  )
  for ($i = 0; $i -lt 6 -and $dir; $i++) {
    foreach ($n in $names) {
      $p = Join-Path $dir $n
      if (Test-Path -LiteralPath $p) { return $p }
    }
    $parent = Split-Path -Parent $dir
    if (-not $parent -or $parent -eq $dir) { break }
    $dir = $parent
  }
  return $null
}

function Find-DefaultSidecar {
  $near = Find-SidecarWalkingUpFromScript
  if ($near) { return $near }

  $roots = @(
    "${env:ProgramFiles}\GEEKS POS",
    "${env:ProgramFiles(x86)}\GEEKS POS",
    "${env:LocalAppData}\Programs\GEEKS POS"
  )
  foreach ($r in $roots) {
    if (-not (Test-Path $r)) { continue }
    $candidates = @(
      Join-Path $r "geeks_pos_backend-x86_64-pc-windows-msvc.exe",
      Join-Path $r "geeks_pos_backend.exe"
    )
    foreach ($c in $candidates) {
      if (Test-Path $c) { return $c }
    }
  }
  return $null
}

$exe = $ProgramPath.Trim()
if (-not $exe) {
  $exe = Find-DefaultSidecar
}
if (-not $exe -or -not (Test-Path $exe)) {
  throw "Backend sidecar not found. Pass -ProgramPath 'C:\...\geeks_pos_backend-x86_64-pc-windows-msvc.exe'"
}

$ruleName = "GEEKS POS Backend (Local API)"
$existing = netsh advfirewall firewall show rule name="$ruleName" 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Rule already exists: $ruleName" -ForegroundColor Yellow
  exit 0
}

netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow program="$exe" enable=yes profile=any | Out-Null
Write-Host "Added firewall rule for: $exe" -ForegroundColor Green
