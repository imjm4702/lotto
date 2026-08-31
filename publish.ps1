param(
  [string]$Message = "chore: publish site update"
)

Set-Location -LiteralPath $PSScriptRoot
node publish.js $Message
exit $LASTEXITCODE
