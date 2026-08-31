# 픽앤밸런스

로또 6/45 공식 이력을 참고해 균형 잡힌 번호 조합을 생성하는 정적 웹사이트입니다.

## 로컬 실행

```powershell
node serve-local.js
```

브라우저에서 `http://localhost:4173`을 엽니다.

## GitHub 업로드와 Render 자동 배포

변경사항을 검증하고 `main` 브랜치에 올리려면 다음 명령 하나만 실행합니다.

```powershell
.\publish.ps1 -Message "feat: 변경 내용"
```

스크립트가 JavaScript와 당첨 이력을 검증한 후 커밋하고 GitHub에 푸시합니다. Render는 루트의 `render.yaml`을 사용하며, `main`에 새 커밋이 올라오면 사이트를 자동으로 다시 배포합니다.

매주 토요일에는 GitHub Actions가 최신 당첨 이력을 갱신하고 커밋합니다. 이 커밋 역시 Render 자동 배포를 시작합니다.

## 수동 검증

```powershell
node --check app.js
node verify.js
```
