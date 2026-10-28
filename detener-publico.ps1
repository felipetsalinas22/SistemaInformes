$ErrorActionPreference = 'Stop'

Write-Host 'Deteniendo servidor y tunel...'
Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" |
  Where-Object { $_.CommandLine -like '*tunnel*localhost:3000*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -like '*server/server.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host 'Sistema detenido. La URL publica dejo de funcionar.'
