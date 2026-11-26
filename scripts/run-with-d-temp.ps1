[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Executable,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExecutableArguments
)

$ErrorActionPreference = "Stop"
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tempRoot = Join-Path $workspaceRoot "tmp\assistant-temp"
$npmCache = Join-Path $workspaceRoot "tmp\npm-cache"

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
New-Item -ItemType Directory -Path $npmCache -Force | Out-Null

$env:TEMP = $tempRoot
$env:TMP = $tempRoot
$env:TMPDIR = $tempRoot
$env:NPM_CONFIG_CACHE = $npmCache

& $Executable @ExecutableArguments
exit $LASTEXITCODE
