param(
  [string]$DestinationDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) "backups")
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
$postgresBin = "C:\Program Files\PostgreSQL\18\bin"
$pgDumpPath = Join-Path $postgresBin "pg_dump.exe"
$pgRestorePath = Join-Path $postgresBin "pg_restore.exe"

foreach ($path in @($envPath, $pgDumpPath, $pgRestorePath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required file was not found: $path"
  }
}

$appPassword = $null
foreach ($line in Get-Content -LiteralPath $envPath) {
  if ($line -match '^APP_DB_PASSWORD=(.*)$') {
    $appPassword = $matches[1].Trim('"')
    break
  }
}
if (-not $appPassword -or $appPassword -match '^change_this_|^replace_with_') {
  throw "Set a real APP_DB_PASSWORD in .env before creating a backup."
}

$resolvedDestination = [System.IO.Path]::GetFullPath($DestinationDirectory)
New-Item -ItemType Directory -Force -Path $resolvedDestination | Out-Null
$backupName = "janankadeh-$((Get-Date).ToString('yyyyMMdd-HHmmss'))-$([guid]::NewGuid().ToString('N').Substring(0, 8)).dump"
$backupPath = Join-Path $resolvedDestination $backupName
$previousPgPassword = $env:PGPASSWORD
$verified = $false

try {
  $env:PGPASSWORD = $appPassword
  & $pgDumpPath --host=127.0.0.1 --port=5432 --username=janan_app --no-password --dbname=janankadeh --format=custom --file=$backupPath
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL backup failed. Confirm the local database is running and APP_DB_PASSWORD is correct." }
  if (-not (Test-Path -LiteralPath $backupPath) -or (Get-Item -LiteralPath $backupPath).Length -eq 0) {
    throw "The backup file is missing or empty."
  }

  & $pgRestorePath --list $backupPath *> $null
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL could not read the backup archive catalog." }
  $verified = $true
  Write-Output "PostgreSQL backup saved and archive catalog verified: $backupPath"
}
finally {
  if ($null -eq $previousPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $previousPgPassword
  }
  $appPassword = $null

  if (-not $verified -and (Test-Path -LiteralPath $backupPath)) {
    Remove-Item -LiteralPath $backupPath -Force
  }
}
