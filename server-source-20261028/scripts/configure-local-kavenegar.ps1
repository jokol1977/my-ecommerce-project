$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw "Project .env file was not found. Create it from .env.example first, then run this script again."
}

Write-Host "This script updates only local Kavenegar settings in the ignored .env file."
Write-Host "It never sends a test SMS. Production credentials belong in the hosting secret manager."

$provider = (Read-Host "Local SMS provider: disabled or kavenegar [disabled]").Trim().ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($provider)) { $provider = "disabled" }
if ($provider -notin @("disabled", "kavenegar")) {
  throw "Choose only 'disabled' or 'kavenegar'. Production settings belong in the hosting secret manager."
}

$apiKey = $null
$sender = $null
if ($provider -eq "kavenegar") {
  $secureApiKey = Read-Host "Kavenegar API key (input is hidden)" -AsSecureString
  if ($secureApiKey.Length -eq 0) {
    $secureApiKey.Dispose()
    throw "A Kavenegar API key is required. No file was changed."
  }

  $apiKeyPointer = [IntPtr]::Zero
  try {
    $apiKeyPointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)
    $apiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($apiKeyPointer).Trim()
  } finally {
    if ($apiKeyPointer -ne [IntPtr]::Zero) {
      [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($apiKeyPointer)
    }
    $secureApiKey.Dispose()
  }

  $sender = (Read-Host "Kavenegar sender number or sender ID").Trim()
  if (
    [string]::IsNullOrWhiteSpace($apiKey) -or
    $apiKey.Length -gt 512 -or
    $sender.Length -eq 0 -or
    $sender.Length -gt 80 -or
    $apiKey -match '[\x00-\x1F\x7F]' -or
    $sender -match '[\x00-\x1F\x7F]'
  ) {
    $apiKey = $null
    throw "The Kavenegar values are empty, too long, or contain control characters. No file was changed."
  }
}

function ConvertTo-DotEnvQuotedValue([string]$value) {
  $escaped = $value.Replace('\', '\\').Replace('"', '\"')
  return '"' + $escaped + '"'
}

$existingText = [System.IO.File]::ReadAllText($envPath)
$fileBytes = [System.IO.File]::ReadAllBytes($envPath)
$hasUtf8Bom = $fileBytes.Length -ge 3 -and $fileBytes[0] -eq 0xEF -and $fileBytes[1] -eq 0xBB -and $fileBytes[2] -eq 0xBF
$encoding = [System.Text.UTF8Encoding]::new($hasUtf8Bom)
$crlf = ([string][char]13) + ([string][char]10)
$newline = if ($existingText.Contains($crlf)) { $crlf } else { [string][char]10 }
$updatedText = [System.Text.RegularExpressions.Regex]::Replace(
  $existingText,
  '(?m)^[ \t]*(?:SMS_PROVIDER|KAVENEGAR_API_KEY|KAVENEGAR_SENDER)[ \t]*=.*(?:\r?\n|$)',
  ""
).TrimEnd([char]13, [char]10)

$updatedText += $newline + "# Local Kavenegar settings; production values belong in the hosting secret manager."
$updatedText += $newline + "SMS_PROVIDER=$provider"
if ($provider -eq "kavenegar") {
  $updatedText += $newline + "KAVENEGAR_API_KEY=$(ConvertTo-DotEnvQuotedValue $apiKey)"
  $updatedText += $newline + "KAVENEGAR_SENDER=$(ConvertTo-DotEnvQuotedValue $sender)"
} else {
  $updatedText += $newline + "KAVENEGAR_API_KEY="
  $updatedText += $newline + "KAVENEGAR_SENDER="
}
$updatedText += $newline
[System.IO.File]::WriteAllText($envPath, $updatedText, $encoding)

$apiKey = $null
$sender = $null
if ($provider -eq "kavenegar") {
  Write-Host "Local Kavenegar settings were saved. The API key was not printed."
  Write-Host "No test SMS was sent."
} else {
  Write-Host "Local SMS remains disabled. Existing local Kavenegar values were cleared."
}
