$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw "Project .env file was not found. Create it from .env.example first, then run this script again."
}

Write-Host "This script updates only local ZarinPal settings in the ignored .env file."
Write-Host "Choose sandbox only if the UUID you enter is a sandbox merchant UUID."
Write-Host "Production mode is intentionally not configured by this local script."

$mode = (Read-Host "Local mode: disabled or sandbox [disabled]").Trim().ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($mode)) { $mode = "disabled" }
if ($mode -notin @("disabled", "sandbox")) {
  throw "Choose only 'disabled' or 'sandbox'. Production settings belong in the production secret manager."
}

$secureMerchantId = Read-Host "ZarinPal merchant UUID (input is hidden)" -AsSecureString
if ($secureMerchantId.Length -eq 0) {
  $secureMerchantId.Dispose()
  throw "A merchant UUID is required."
}

$merchantIdPointer = [IntPtr]::Zero
$merchantId = $null
try {
  $merchantIdPointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureMerchantId)
  $merchantId = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($merchantIdPointer).Trim()
} finally {
  if ($merchantIdPointer -ne [IntPtr]::Zero) {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($merchantIdPointer)
  }
  $secureMerchantId.Dispose()
}

if ($merchantId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
  $merchantId = $null
  throw "The value must be a UUID in the standard 8-4-4-4-12 format. No file was changed."
}

$existingText = [System.IO.File]::ReadAllText($envPath)
$hasUtf8Bom = $false
$fileBytes = [System.IO.File]::ReadAllBytes($envPath)
if ($fileBytes.Length -ge 3) {
  $hasUtf8Bom = $fileBytes[0] -eq 0xEF -and $fileBytes[1] -eq 0xBB -and $fileBytes[2] -eq 0xBF
}
$encoding = [System.Text.UTF8Encoding]::new($hasUtf8Bom)
$newline = if ($existingText.Contains("`r`n")) { "`r`n" } else { "`n" }
$updatedText = [System.Text.RegularExpressions.Regex]::Replace(
  $existingText,
  '(?m)^[ \t]*(?:ZARINPAL_MODE|ZARINPAL_MERCHANT_ID)[ \t]*=.*(?:\r?\n|$)',
  ""
).TrimEnd("`r", "`n")

$updatedText += $newline + "# Local ZarinPal settings; production values belong in the hosting secret manager."
$updatedText += $newline + "ZARINPAL_MODE=$mode"
$updatedText += $newline + "ZARINPAL_MERCHANT_ID=$merchantId" + $newline
[System.IO.File]::WriteAllText($envPath, $updatedText, $encoding)

$merchantId = $null
Write-Host "Local ZarinPal settings were saved. The merchant UUID was not printed."
Write-Host "AUTH_URL was left unchanged so local sign-in and same-origin callbacks keep using localhost."
if ($mode -eq "disabled") {
  Write-Host "Payments remain disabled locally. Use sandbox mode only with a sandbox merchant UUID."
}
