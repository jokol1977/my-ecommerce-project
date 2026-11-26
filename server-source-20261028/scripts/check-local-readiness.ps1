$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
$postgresBin = "C:\Program Files\PostgreSQL\18\bin"
$pgIsReadyPath = Join-Path $postgresBin "pg_isready.exe"
$psqlPath = Join-Path $postgresBin "psql.exe"
$pgRestorePath = Join-Path $postgresBin "pg_restore.exe"
$prismaCommand = Join-Path $projectRoot "node_modules\.bin\prisma.cmd"
$script:checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
  param([string]$Name, [bool]$Passed, [string]$Detail)
  $script:checks.Add([PSCustomObject]@{ Name = $Name; Passed = $Passed; Detail = $Detail })
}

function Read-ProjectEnvironment {
  param([string]$Path)
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding utf8) {
    if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Z][A-Z0-9_]*)=(.*)$') { continue }
    $value = $matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$matches[1]] = $value
  }
  return $values
}

function Test-LocalDatabaseUrl {
  param([string]$Value, [string]$ExpectedUser)
  $uri = $null
  if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) { return $false }
  if ($uri.Scheme -ne "postgresql" -or $uri.Host -notin @("127.0.0.1", "localhost") -or $uri.Port -ne 5432 -or $uri.AbsolutePath.Trim("/") -ne "janankadeh") {
    return $false
  }
  $username = [Uri]::UnescapeDataString($uri.UserInfo).Split(":")[0]
  return $username -eq $ExpectedUser
}

Write-Output "Local JananKadeh readiness check (secrets are not displayed)."

$hasEnvironment = Test-Path -LiteralPath $envPath -PathType Leaf
Add-Check "Environment file" $hasEnvironment "Project .env file is present."

$settings = @{}
if ($hasEnvironment) { $settings = Read-ProjectEnvironment -Path $envPath }

$requiredValuesPresent = $hasEnvironment
foreach ($key in @("APP_DB_PASSWORD", "MIGRATOR_DB_PASSWORD", "DATABASE_URL", "DIRECT_URL")) {
  $value = [string]$settings[$key]
  $isSet = -not [string]::IsNullOrWhiteSpace($value) -and $value -notmatch '^(?i:change_this_|replace_with_|your_)'
  if (-not $isSet) { $requiredValuesPresent = $false }
}
Add-Check "Local database settings" $requiredValuesPresent "Required values exist and are not example placeholders."

$appUrlIsLocal = Test-LocalDatabaseUrl -Value ([string]$settings["DATABASE_URL"]) -ExpectedUser "janan_app"
$migratorUrlIsLocal = Test-LocalDatabaseUrl -Value ([string]$settings["DIRECT_URL"]) -ExpectedUser "janan_migrator"
Add-Check "Database role separation" ($appUrlIsLocal -and $migratorUrlIsLocal) "App and migration URLs use their separate local roles."

$postgresToolsExist = (Test-Path -LiteralPath $pgIsReadyPath -PathType Leaf) -and (Test-Path -LiteralPath $psqlPath -PathType Leaf) -and (Test-Path -LiteralPath $pgRestorePath -PathType Leaf)
Add-Check "PostgreSQL tools" $postgresToolsExist "PostgreSQL 18 client tools are available in the default install path."

$postgresIsReady = $false
if ($postgresToolsExist) {
  $previousErrorPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $pgIsReadyPath --host=127.0.0.1 --port=5432 --timeout=3 *> $null
    $postgresIsReady = $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
}
Add-Check "PostgreSQL service" $postgresIsReady "The local server accepts connections on 127.0.0.1:5432."

$appConnectionWorks = $false
if ($postgresIsReady -and $requiredValuesPresent -and $appUrlIsLocal) {
  $previousPgPassword = $env:PGPASSWORD
  $previousConnectTimeout = $env:PGCONNECT_TIMEOUT
  $previousErrorPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $env:PGPASSWORD = [string]$settings["APP_DB_PASSWORD"]
    $env:PGCONNECT_TIMEOUT = "5"
    $identity = & $psqlPath --host=127.0.0.1 --port=5432 --username=janan_app --no-password --dbname=janankadeh --tuples-only --no-align --command "SELECT current_database() || '|' || current_user" 2>$null
    $appConnectionWorks = $LASTEXITCODE -eq 0 -and (($identity | Out-String).Trim() -eq "janankadeh|janan_app")
  } catch {
    $appConnectionWorks = $false
  } finally {
    if ($null -eq $previousPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $previousPgPassword }
    if ($null -eq $previousConnectTimeout) { Remove-Item Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue } else { $env:PGCONNECT_TIMEOUT = $previousConnectTimeout }
    $ErrorActionPreference = $previousErrorPreference
  }
}
Add-Check "Least-privilege app connection" $appConnectionWorks "The restricted app role can connect to janankadeh."

$migrationsAreCurrent = $false
if ($appConnectionWorks -and (Test-Path -LiteralPath $prismaCommand -PathType Leaf)) {
  Push-Location $projectRoot
  $previousErrorPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $prismaCommand migrate status *> $null
    $migrationsAreCurrent = $LASTEXITCODE -eq 0
  } catch {
    $migrationsAreCurrent = $false
  } finally {
    $ErrorActionPreference = $previousErrorPreference
    Pop-Location
  }
}
Add-Check "Prisma migration status" $migrationsAreCurrent "The local database matches the recorded project migrations."

$backupVerified = $false
$backupDirectory = Join-Path $projectRoot "backups"
if ($postgresToolsExist -and (Test-Path -LiteralPath $backupDirectory -PathType Container)) {
  $latestBackup = Get-ChildItem -LiteralPath $backupDirectory -Filter "*.dump" -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if ($null -ne $latestBackup -and $latestBackup.Length -gt 0) {
    $previousErrorPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      & $pgRestorePath --list $latestBackup.FullName *> $null
      $backupVerified = $LASTEXITCODE -eq 0
    } finally {
      $ErrorActionPreference = $previousErrorPreference
    }
  }
}
Add-Check "Latest local backup" $backupVerified "A non-empty backup archive exists and its catalog is readable."

$gitAvailable = $null -ne (Get-Command git -ErrorAction SilentlyContinue)
$envIsIgnored = $false
$backupsAreIgnored = $false
if ($gitAvailable) {
  Push-Location $projectRoot
  try {
    & git check-ignore --quiet -- .env
    $envIsIgnored = $LASTEXITCODE -eq 0
    & git check-ignore --quiet -- backups
    $backupsAreIgnored = $LASTEXITCODE -eq 0
  } finally {
    Pop-Location
  }
}
Add-Check "Git secret and backup exclusions" ($envIsIgnored -and $backupsAreIgnored) "Both .env and backups are excluded from Git."

Write-Output ""
foreach ($check in $script:checks) {
  if ($check.Passed) { Write-Output "[OK] $($check.Name) - $($check.Detail)" }
  else { Write-Output "[NEEDS ATTENTION] $($check.Name) - $($check.Detail)" }
}

$issues = @($script:checks | Where-Object { -not $_.Passed } | ForEach-Object { $_.Name })
if ($issues.Count -eq 0) {
  Write-Output ""
  Write-Output "Local setup checks passed. Production checkout still requires live ZarinPal settings, the canonical HTTPS AUTH_URL, and a successful end-to-end gateway check."
  exit 0
}

Write-Output ""
Write-Output "Checks needing attention: $($issues -join ', ')"
Write-Output "This local setup check is not a production security certification."
exit 1
