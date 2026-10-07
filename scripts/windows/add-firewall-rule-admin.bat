@echo off
REM Run from the folder that contains add-firewall-rule.ps1 (e.g. ...\GEEKS POS\resources\).
cd /d "%~dp0"
if not exist "add-firewall-rule.ps1" (
  echo add-firewall-rule.ps1 not found in:
  echo %CD%
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Join-Path (Get-Location).Path 'add-firewall-rule.ps1'; Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', $p)"
