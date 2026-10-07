param(
  [string]$Email
)

$ErrorActionPreference = "Stop"
$postgresBin = "C:\Program Files\PostgreSQL\18\bin"
$psqlPath = Join-Path $postgresBin "psql.exe"

if (-not (Test-Path -LiteralPath $psqlPath -PathType Leaf)) {
  throw "PostgreSQL 18 psql.exe was not found in the default installation directory."
}

if ([string]::IsNullOrWhiteSpace($Email)) {
  $Email = Read-Host "Email address of the already verified account to promote"
}

$normalizedEmail = $Email.Trim()
try {
  $parsedEmail = [System.Net.Mail.MailAddress]::new($normalizedEmail)
} catch {
  throw "Enter a valid email address."
}
if ($parsedEmail.Address -cne $normalizedEmail) {
  throw "Enter only the email address, without a display name."
}
$normalizedEmail = $parsedEmail.Address.ToLowerInvariant()

Write-Host "This local-only operation creates the first administrator and can succeed only once."
Write-Host "It requires an existing active account whose email has already been verified."
$securePassword = Read-Host "PostgreSQL administrator password for user postgres" -AsSecureString
if ($securePassword.Length -eq 0) {
  throw "A PostgreSQL administrator password is required."
}

$credential = [System.Management.Automation.PSCredential]::new("postgres", $securePassword)
$adminPassword = $credential.GetNetworkCredential().Password
$previousPgPassword = $env:PGPASSWORD

$sql = @'
BEGIN;
LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE;
SELECT set_config('janankadeh.bootstrap_email', :'target_email', true);
DO $bootstrap$
DECLARE
  target_email text := current_setting('janankadeh.bootstrap_email');
  target_user_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "role" = 'ADMIN') THEN
    RAISE EXCEPTION 'An administrator already exists; local bootstrap is allowed only once.';
  END IF;

  SELECT "id" INTO target_user_id
  FROM "User"
  WHERE lower("email") = target_email
    AND "emailVerified" IS NOT NULL
    AND "status" = 'ACTIVE'
  FOR UPDATE;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No active account with a verified matching email was found.';
  END IF;

  UPDATE "User"
  SET "role" = 'ADMIN', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = target_user_id;

  INSERT INTO "AdminAuditEvent" ("id", "actorUserId", "action", "targetType", "targetId")
  VALUES ('bootstrap-' || gen_random_uuid()::text, NULL, 'INITIAL_ADMIN_BOOTSTRAPPED', 'USER', target_user_id);
END;
$bootstrap$;
COMMIT;
'@

try {
  $env:PGPASSWORD = $adminPassword
  & $psqlPath --no-psqlrc --quiet --host=127.0.0.1 --port=5432 --username=postgres --no-password --dbname=janankadeh --set=ON_ERROR_STOP=1 --set="target_email=$normalizedEmail" --command $sql
  if ($LASTEXITCODE -ne 0) {
    throw "Administrator setup failed. Confirm the password, database migrations, and verified account, then review the PostgreSQL error above."
  }
  Write-Output "The first local administrator was created and recorded in the audit log. Sign in again to refresh the account session."
}
finally {
  if ($null -eq $previousPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $previousPgPassword
  }
  $adminPassword = $null
  $credential = $null
  $securePassword.Dispose()
}
