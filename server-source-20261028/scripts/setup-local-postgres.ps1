$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
$roleSqlPath = Join-Path $projectRoot "db\init\01-create-app-role.sql"
$postgresBin = "C:\Program Files\PostgreSQL\18\bin"
$createdbPath = Join-Path $postgresBin "createdb.exe"
$psqlPath = Join-Path $postgresBin "psql.exe"

foreach ($path in @($envPath, $roleSqlPath, $createdbPath, $psqlPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required file was not found: $path"
  }
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$') {
    $settings[$matches[1]] = $matches[2].Trim('"')
  }
}

foreach ($key in @("APP_DB_PASSWORD", "MIGRATOR_DB_PASSWORD")) {
  if (-not $settings.ContainsKey($key) -or $settings[$key] -match '^change_this_|^replace_with_') {
    throw "Set a real local value for $key in .env before continuing."
  }
}

Write-Host "Enter the PostgreSQL administrator password you chose during installation. It will not be saved by this script."
$securePassword = Read-Host "PostgreSQL password for user postgres" -AsSecureString
$credential = [System.Management.Automation.PSCredential]::new("postgres", $securePassword)
$adminPassword = $credential.GetNetworkCredential().Password
$previousPgPassword = $env:PGPASSWORD

try {
  $env:PGPASSWORD = $adminPassword
  & $createdbPath --host=127.0.0.1 --port=5432 --username=postgres --owner=postgres --no-password janankadeh
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create database janankadeh. Check the password and confirm the database does not already exist."
  }

  $env:APP_DB_PASSWORD = $settings["APP_DB_PASSWORD"]
  $env:MIGRATOR_DB_PASSWORD = $settings["MIGRATOR_DB_PASSWORD"]
  & $psqlPath --host=127.0.0.1 --port=5432 --username=postgres --dbname=janankadeh --no-password --set=ON_ERROR_STOP=1 --file=$roleSqlPath
  if ($LASTEXITCODE -ne 0) {
    throw "Database was created, but project roles could not be configured. Report this message before retrying."
  }

  Write-Host "Local database and least-privilege project roles are ready."
}
finally {
  $env:PGPASSWORD = $previousPgPassword
  Remove-Item Env:APP_DB_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:MIGRATOR_DB_PASSWORD -ErrorAction SilentlyContinue
  $adminPassword = $null
  $securePassword.Dispose()
  $credential = $null
}
