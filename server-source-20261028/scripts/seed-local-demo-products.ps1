param(
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
$sqlPath = Join-Path $PSScriptRoot "sql\seed-local-demo-products.sql"
$psqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

if (-not $Apply) {
  throw "No changes were made. Re-run with -Apply to add clearly marked demo products to the local janankadeh database."
}

foreach ($path in @($envPath, $sqlPath, $psqlPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required local file was not found: $path"
  }
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath $envPath -Encoding utf8) {
  if ($line -match '^\s*#' -or $line -notmatch '^\s*([A-Z][A-Z0-9_]*)=(.*)$') { continue }
  $value = $matches[2].Trim()
  if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  $settings[$matches[1]] = $value
}

foreach ($key in @("APP_DB_PASSWORD", "DATABASE_URL")) {
  $value = [string]$settings[$key]
  if ([string]::IsNullOrWhiteSpace($value) -or $value -match '^(?i:change_this_|replace_with_|your_)') {
    throw "Set a real local $key value in .env before continuing."
  }
}

$databaseUri = $null
if (-not [Uri]::TryCreate([string]$settings["DATABASE_URL"], [UriKind]::Absolute, [ref]$databaseUri)) {
  throw "DATABASE_URL is not a valid PostgreSQL URL."
}
$databaseUser = [Uri]::UnescapeDataString($databaseUri.UserInfo.Split(":")[0])
if ($databaseUri.Scheme -ne "postgresql" -or $databaseUri.Host -notin @("127.0.0.1", "localhost") -or $databaseUri.Port -ne 5432 -or $databaseUri.AbsolutePath.Trim("/") -ne "janankadeh" -or $databaseUser -ne "janan_app") {
  throw "Safety check stopped the seed: DATABASE_URL must point to local janankadeh as janan_app."
}

Write-Host "Adding local-only sample products for storefront and cart review. They are visibly marked as test products."
$previousPassword = $env:PGPASSWORD
$previousEncoding = $env:PGCLIENTENCODING
try {
  $env:PGPASSWORD = [string]$settings["APP_DB_PASSWORD"]
  $env:PGCLIENTENCODING = "UTF8"
  & $psqlPath --host=127.0.0.1 --port=5432 --username=janan_app --no-password --dbname=janankadeh --set=ON_ERROR_STOP=1 --file=$sqlPath
  if ($LASTEXITCODE -ne 0) {
    throw "The local demo-product seed failed. The SQL transaction was rolled back if an error occurred."
  }
  Write-Host "Local demo products are ready. Refresh http://127.0.0.1:3000 to see the cards."
}
finally {
  if ($null -eq $previousPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $previousPassword }
  if ($null -eq $previousEncoding) { Remove-Item Env:PGCLIENTENCODING -ErrorAction SilentlyContinue } else { $env:PGCLIENTENCODING = $previousEncoding }
  $settings["APP_DB_PASSWORD"] = $null
  $databaseUri = $null
}
