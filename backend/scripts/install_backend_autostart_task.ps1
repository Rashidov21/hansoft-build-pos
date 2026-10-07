# Register Geeks POS backend logon task (same as production app setup).
# Usage: .\install_backend_autostart_task.ps1 -BackendExe "C:\Path\geeks_pos_backend.exe"

param(
    [Parameter(Mandatory = $true)]
    [string]$BackendExe
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $BackendExe)) {
    throw "BackendExe not found: $BackendExe"
}

$appHome = Join-Path $env:APPDATA 'GeeksPOS'
New-Item -ItemType Directory -Force -Path $appHome | Out-Null
$keyPath = Join-Path $appHome 'runtime_secret.key'
if (-not (Test-Path $keyPath)) {
    $g1 = [guid]::NewGuid().ToString()
    $g2 = [guid]::NewGuid().ToString()
    Set-Content -Path $keyPath -Value "geekspos-$g1-$g2" -Encoding UTF8
}
$flushPath = Join-Path $appHome 'internal_flush.key'
if (-not (Test-Path $flushPath)) {
    Set-Content -Path $flushPath -Value "prod-internal-flush-key" -Encoding UTF8
}

$sidecar = (Resolve-Path $BackendExe).Path.Replace("'", "''")
$scriptPath = Join-Path $appHome 'start_backend_service.ps1'
@"

`$ErrorActionPreference = 'SilentlyContinue'
`$port = 8000
`$healthUri = "http://127.0.0.1:`$port/api/health/"
try {
  `$r = Invoke-WebRequest -Uri `$healthUri -UseBasicParsing -TimeoutSec 3
  if (`$r.StatusCode -eq 200) { exit 0 }
} catch {}

`$appHome = Join-Path `$env:APPDATA 'GeeksPOS'
`$keyPath = Join-Path `$appHome 'runtime_secret.key'
`$flushPath = Join-Path `$appHome 'internal_flush.key'
`$env:DJANGO_SECRET_KEY = (Get-Content -Path `$keyPath -Raw).Trim()
`$env:INTERNAL_FLUSH_KEY = (Get-Content -Path `$flushPath -Raw).Trim()
`$env:PYTHONUNBUFFERED = '1'
`$env:DJANGO_DEBUG = '0'
`$env:GEEKS_POS_ALLOW_DB_OVERRIDE = '0'
`$env:WAITRESS_THREADS = '2'
`$backend = '$sidecar'
`$logDir = Join-Path `$appHome 'logs'
New-Item -ItemType Directory -Force -Path `$logDir | Out-Null
`$logFile = Join-Path `$logDir 'backend_boot.log'
Start-Process -FilePath `$backend -ArgumentList @('--host','127.0.0.1','--port',`$port,'--threads','2') -WindowStyle Hidden -RedirectStandardOutput `$logFile -RedirectStandardError `$logFile
exit 0
"@ | Set-Content -Path $scriptPath -Encoding UTF8

$tr = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""
schtasks /Create /F /SC ONLOGON /RL LIMITED /DELAY 0000:20 /TN GeeksPOS_Backend /TR $tr
Write-Host "Registered GeeksPOS_Backend -> $scriptPath"
