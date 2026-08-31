# 픽앤밸런스

로또 6/45 공식 이력을 참고해 균형 잡힌 번호 조합을 생성하는 정적 웹사이트입니다.

## 로컬 실행

```powershell
node serve-local.js
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 배포 프로그램

Windows에서는 [deploy.cmd](./deploy.cmd)를 더블클릭하고 커밋 메시지만 입력합니다. 프로그램이 다음 작업을 순서대로 처리합니다.

1. JavaScript와 당첨 이력 검증
2. GitHub의 최신 `main` 가져오기
3. 변경사항 커밋
4. 원격 변경사항과 안전하게 rebase
5. GitHub 푸시 및 Render 자동 배포 시작

터미널에서는 다음과 같이 실행할 수 있습니다.

```powershell
node publish.js "feat: 변경 내용"
```

실제 커밋이나 배포 없이 프로그램만 점검하려면 다음 명령을 사용합니다.

```powershell
node publish.js --dry-run
```

Render는 루트의 `render.yaml`을 사용하며, GitHub와 연결된 뒤에는 `main`의 새 커밋을 자동 배포합니다. Git 연결 대신 Render Deploy Hook을 사용할 때만 세션 환경변수로 비밀 URL을 전달합니다. URL은 저장소에 커밋하지 않습니다.

```powershell
$env:RENDER_DEPLOY_HOOK_URL="Render에서 발급한 비밀 Deploy Hook URL"
node publish.js "feat: 변경 내용"
```

매주 토요일에는 GitHub Actions가 최신 당첨 이력을 갱신하고 커밋합니다. 이 커밋 역시 Render 자동 배포를 시작합니다.

## 수동 검증

```powershell
node --check app.js
node verify.js
```
