param(
  [string]$Message = "chore: publish site update"
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

node --check app.js
if ($LASTEXITCODE -ne 0) { throw 'app.js syntax validation failed.' }

node verify.js
if ($LASTEXITCODE -ne 0) { throw 'Project validation failed.' }

git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Failed to fetch origin/main.' }

if (git status --porcelain) {
  git add --all
  if ($LASTEXITCODE -ne 0) { throw 'Failed to stage changes.' }

  git commit -m $Message
  if ($LASTEXITCODE -ne 0) { throw 'Failed to commit changes.' }
} else {
  Write-Output 'No new working-tree changes to commit.'
}

git rebase origin/main
if ($LASTEXITCODE -ne 0) { throw 'Failed to rebase onto origin/main. Resolve the conflict, then retry.' }

git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Failed to push to GitHub.' }

Write-Output 'GitHub upload complete. Render auto-deploy will start.'
