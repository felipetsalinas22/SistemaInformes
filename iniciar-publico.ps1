$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$node = 'C:\Program Files\nodejs\node.exe'
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'

if (-not (Test-Path $node)) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) { $node = $nodeCommand.Source } else { throw 'No se encontro node.exe.' }
}
if (-not (Test-Path $cloudflared)) {
  $cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cloudflaredCommand) { $cloudflared = $cloudflaredCommand.Source } else { throw 'No se encontro cloudflared.exe. Ejecute: winget install --id Cloudflare.cloudflared' }
}

$runtime = Join-Path $root '.runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$tunnelOut = Join-Path $runtime 'tunnel.out.log'
$tunnelErr = Join-Path $runtime 'tunnel.err.log'
$serverOut = Join-Path $runtime 'server.out.log'
$serverErr = Join-Path $runtime 'server.err.log'

Write-Host 'Cerrando procesos anteriores...'
Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" |
  Where-Object { $_.CommandLine -like '*tunnel*localhost:3000*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -like '*server/server.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

Remove-Item $tunnelOut, $tunnelErr, $serverOut, $serverErr -ErrorAction SilentlyContinue

Write-Host 'Creando tunel de Cloudflare...'
$tunnel = Start-Process -FilePath $cloudflared `
  -ArgumentList @('tunnel', '--url', 'http://localhost:3000', '--no-autoupdate') `
  -WorkingDirectory $root `
  -RedirectStandardOutput $tunnelOut `
  -RedirectStandardError $tunnelErr `
  -WindowStyle Hidden `
  -PassThru

$publicUrl = $null
for ($i = 0; $i -lt 80; $i++) {
  Start-Sleep -Milliseconds 500
  foreach ($file in @($tunnelOut, $tunnelErr)) {
    if (Test-Path $file) {
      $text = Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue
      if ([string]::IsNullOrEmpty($text)) { continue }
      $match = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
      if ($match.Success) { $publicUrl = $match.Value; break }
    }
  }
  if ($publicUrl) { break }
}

if (-not $publicUrl) {
  Write-Host 'No se pudo obtener la URL publica. Revise:' $tunnelErr
  exit 1
}

Write-Host "URL publica: $publicUrl"
Write-Host 'Actualizando APP_ORIGIN...'

$envPath = Join-Path $root '.env'
if (-not (Test-Path $envPath)) { throw 'No existe el archivo .env.' }

$envText = [System.IO.File]::ReadAllText($envPath)
$lines = $envText -split "`r?`n"
$originUpdated = $false
$trustUpdated = $false

for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match '^APP_ORIGIN=(.*)$') {
    $origins = $Matches[1] -split ',' |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ -and $_ -notmatch '\.trycloudflare\.com$' }
    $origins += $publicUrl
    $lines[$i] = 'APP_ORIGIN=' + (($origins | Select-Object -Unique) -join ',')
    $originUpdated = $true
  }
  if ($lines[$i] -match '^TRUST_PROXY=') {
    $lines[$i] = 'TRUST_PROXY=1'
    $trustUpdated = $true
  }
}

if (-not $originUpdated) { $lines += 'APP_ORIGIN=' + $publicUrl }
if (-not $trustUpdated) { $lines += 'TRUST_PROXY=1' }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, ($lines -join "`r`n"), $utf8NoBom)

Write-Host 'Iniciando servidor Node...'
$server = Start-Process -FilePath $node `
  -ArgumentList @('server/server.js') `
  -WorkingDirectory $root `
  -RedirectStandardOutput $serverOut `
  -RedirectStandardError $serverErr `
  -WindowStyle Hidden `
  -PassThru

$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri 'http://localhost:3000/api/health' -TimeoutSec 2
    if ($health.ok -eq $true) { $healthy = $true; break }
  } catch {
    # El servidor todavia esta arrancando.
  }
}

if (-not $healthy) {
  Write-Host 'El servidor local no respondio. Revise .runtime\server.err.log'
  exit 1
}

Write-Host ''
Write-Host 'Sistema disponible desde cualquier red:'
Write-Host $publicUrl
Write-Host ''
Write-Host 'Servidor local: http://localhost:3000'
Write-Host "PIDs: servidor=$($server.Id) tunel=$($tunnel.Id)"
Write-Host 'Para detenerlo: .\detener-publico.ps1'
