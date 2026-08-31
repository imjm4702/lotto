param(
  [string]$Message = "chore: publish site update"
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

node --check app.js
if ($LASTEXITCODE -ne 0) { throw 'app.js 문법 검증에 실패했습니다.' }

node verify.js
if ($LASTEXITCODE -ne 0) { throw '프로젝트 검증에 실패했습니다.' }

if (-not (git status --porcelain)) {
  Write-Output '업로드할 변경사항이 없습니다.'
  exit 0
}

git add --all
if ($LASTEXITCODE -ne 0) { throw '변경사항 스테이징에 실패했습니다.' }

git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw '커밋에 실패했습니다.' }

git push origin main
if ($LASTEXITCODE -ne 0) { throw 'GitHub 푸시에 실패했습니다.' }

Write-Output 'GitHub 업로드 완료. Render 자동 배포가 시작됩니다.'
