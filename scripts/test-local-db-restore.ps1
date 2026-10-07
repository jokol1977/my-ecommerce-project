$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
$backupDirectory = Join-Path $projectRoot "backups"
$postgresBin = "C:\Program Files\PostgreSQL\18\bin"
$createdbPath = Join-Path $postgresBin "createdb.exe"
$dropdbPath = Join-Path $postgresBin "dropdb.exe"
$pgIsReadyPath = Join-Path $postgresBin "pg_isready.exe"
$pgRestorePath = Join-Path $postgresBin "pg_restore.exe"
$psqlPath = Join-Path $postgresBin "psql.exe"

foreach ($path in @($envPath, $backupDirectory, $createdbPath, $dropdbPath, $pgIsReadyPath, $pgRestorePath, $psqlPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required file or directory was not found: $path"
  }
}

$latestBackup = Get-ChildItem -LiteralPath $backupDirectory -Filter "*.dump" -File |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1
if ($null -eq $latestBackup -or $latestBackup.Length -eq 0) {
  throw "No non-empty local PostgreSQL backup archive was found."
}

$migratorPassword = $null
foreach ($line in Get-Content -LiteralPath $envPath -Encoding utf8) {
  if ($line -match '^MIGRATOR_DB_PASSWORD=(.*)$') {
    $migratorPassword = $matches[1].Trim()
    if ($migratorPassword.Length -ge 2) {
      $isQuoted = ($migratorPassword.StartsWith('"') -and $migratorPassword.EndsWith('"')) -or
        ($migratorPassword.StartsWith("'") -and $migratorPassword.EndsWith("'"))
      if ($isQuoted) { $migratorPassword = $migratorPassword.Substring(1, $migratorPassword.Length - 2) }
    }
    break
  }
}
if ([string]::IsNullOrWhiteSpace($migratorPassword) -or $migratorPassword -match '^(?i:change_this_|replace_with_|your_)') {
  throw "Set a real MIGRATOR_DB_PASSWORD in .env before testing backup restoration."
}

$restoreToken = [guid]::NewGuid().ToString("N").Substring(0, 12)
$restoreDatabase = "janankadeh_restore_check_$restoreToken"
if ($restoreDatabase -notmatch '^janankadeh_restore_check_[0-9a-f]{12}$' -or $restoreDatabase -eq "janankadeh") {
  throw "The temporary restore database name failed its safety check."
}

$previousPgPassword = $env:PGPASSWORD
$previousConnectTimeout = $env:PGCONNECT_TIMEOUT
$databaseCreated = $false
$currentStage = "startup"
$operationFailure = $null
$cleanupFailure = $false

try {
  $env:PGPASSWORD = $migratorPassword
  $env:PGCONNECT_TIMEOUT = "5"

  $currentStage = "PostgreSQL availability check"
  & $pgIsReadyPath --host=127.0.0.1 --port=5432 --timeout=3 *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "The local PostgreSQL server is not accepting connections on 127.0.0.1:5432."
  }

  $currentStage = "backup archive check"
  & $pgRestorePath --list $latestBackup.FullName *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL could not read the latest backup archive catalog."
  }

  $currentStage = "temporary database creation"
  & $createdbPath --host=127.0.0.1 --port=5432 --username=janan_migrator --no-password --maintenance-db=postgres --owner=janan_migrator $restoreDatabase *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the uniquely named temporary restore database. No existing database was changed."
  }
  $databaseCreated = $true

  $currentStage = "archive restore"
  & $pgRestorePath --exit-on-error --single-transaction --no-owner --no-acl --host=127.0.0.1 --port=5432 --username=janan_migrator --no-password --dbname=$restoreDatabase $latestBackup.FullName *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL could not restore the latest archive into the temporary database."
  }

  $currentStage = "restored data verification"
  $verificationQuery = @"
SELECT current_database() || '|' ||
  (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations') || '|' ||
  (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('User', 'Product', 'Order', 'Payment')) || '|' ||
  (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_schema='public' AND table_name='LedgerTransfer');
"@
  $verification = & $psqlPath --host=127.0.0.1 --port=5432 --username=janan_migrator --no-password --dbname=$restoreDatabase --tuples-only --no-align --set=ON_ERROR_STOP=1 --command $verificationQuery 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "The temporary database was restored, but its migration and core-table verification failed."
  }

  $values = (($verification | Out-String).Trim() -split '\|')
  if ($values.Count -ne 4 -or $values[0] -ne $restoreDatabase) {
    throw "The temporary database verification returned an unexpected result."
  }
  foreach ($value in $values[1..3]) {
    if ($value -notmatch '^\d+$') {
      throw "The temporary database verification returned an invalid row count."
    }
  }
  if ([int]$values[1] -ne 1) {
    throw "The backup did not restore the Prisma migration metadata table."
  }
  if ([int]$values[2] -ne 4 -or [int]$values[3] -gt 1) {
    throw "The backup did not restore all required core application tables."
  }

  Write-Output "Restore verification passed using: $($latestBackup.Name)"
  Write-Output "Prisma migration metadata and all 4 required core tables are present."
  if ([int]$values[3] -eq 0) {
    Write-Warning "This archive predates the current LedgerTransfer table. Create a fresh backup after the latest migration to protect the current schema."
  } else {
    Write-Output "The current LedgerTransfer table is present in the restored archive."
  }
} catch {
  $operationFailure = "Stage: $currentStage. $($_.Exception.Message)"
} finally {
  if ($databaseCreated) {
    & $dropdbPath --host=127.0.0.1 --port=5432 --username=janan_migrator --no-password --maintenance-db=postgres --if-exists $restoreDatabase *> $null
    $cleanupFailure = $LASTEXITCODE -ne 0
  }

  if ($null -eq $previousPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $previousPgPassword
  }
  if ($null -eq $previousConnectTimeout) {
    Remove-Item Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
  } else {
    $env:PGCONNECT_TIMEOUT = $previousConnectTimeout
  }
  $migratorPassword = $null
}

if ($cleanupFailure) {
  throw "The temporary restore database could not be removed: $restoreDatabase"
}
if ($operationFailure) {
  throw $operationFailure
}

Write-Output "The temporary restore database was removed. The source database and backup archive were not changed."
