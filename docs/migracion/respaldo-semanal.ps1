# GLACIAL · RESPALDO SEMANAL AUTOMÁTICO (Windows). Usa respaldo-supabase.js (solo LEE la base; no cambia nada en Supabase).
# Guarda cada semana una carpeta respaldo_AAAA-MM-DD_HHMM, conserva las últimas N y deja un registro (respaldo.log).
# La clave de la base NO va en este archivo: vive en la variable de usuario DATABASE_URL (ver respaldo-semanal.md).
param(
  [string]$Carpeta = "$env:USERPROFILE\RespaldosGlacial",   # dónde se guardan las copias (mejor otro disco o una carpeta sincronizada con la nube)
  [int]$Conservar = 8                                        # cuántas copias se conservan
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $Carpeta 'respaldo.log'
function Anotar($t) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $t) }
try {
  New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
  if (-not $env:DATABASE_URL) { $env:DATABASE_URL = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'User') }
  if (-not $env:DATABASE_URL) { throw 'Falta la variable de usuario DATABASE_URL (cadena Session pooler de Supabase).' }
  Set-Location $Carpeta
  Anotar 'Inicio del respaldo'
  & node (Join-Path $PSScriptRoot 'respaldo-supabase.js')
  if ($LASTEXITCODE -ne 0) { throw "respaldo-supabase.js terminó con error ($LASTEXITCODE)." }
  $ultima = Get-ChildItem -Directory -Filter 'respaldo_*' | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $ultima -or -not (Test-Path (Join-Path $ultima.FullName 'MANIFIESTO.json'))) { throw 'No se encontró el MANIFIESTO.json de la copia nueva.' }
  $m = Get-Content (Join-Path $ultima.FullName 'MANIFIESTO.json') -Raw | ConvertFrom-Json
  Anotar ("Copia lista: {0}" -f $ultima.Name)
  # Se conservan solo las últimas copias
  Get-ChildItem -Directory -Filter 'respaldo_*' | Sort-Object Name -Descending | Select-Object -Skip $Conservar | ForEach-Object { Remove-Item -Recurse -Force $_.FullName; Anotar ("Copia antigua eliminada: {0}" -f $_.Name) }
  Anotar 'Respaldo terminado correctamente'
} catch {
  Anotar ("ERROR: {0}" -f $_.Exception.Message)
  exit 1
}
