# 픽앤밸런스

로또 6/45 공식 이력을 참고해 균형 잡힌 번호 조합을 생성하는 정적 웹사이트입니다.

## 앙상블 추천 엔진

- 최근 30회 빈도와 전체 기간 빈도를 가중 혼합합니다.
- 15주 이상 미출현 번호에는 완만한 보간 가중치를 적용합니다.
- 합계 120~160, 홀짝·저고·끝수·10단위 구간·연속번호 분포를 검사합니다.
- 회차 번호를 기본 시드로 사용해 20,000개 조합을 Monte Carlo 탐색합니다.
- 과거 당첨 조합과 지나치게 유사하거나 자주 반복된 형태를 거릅니다.
- 상위 후보를 1~2개 번호씩 변이하고 엘리트를 보존하며 6세대 개선합니다.
- `분석 JSON 복사`로 외부 텍스트 모델이 검토하기 쉬운 메타데이터를 만들 수 있습니다.

로또 추첨은 독립 시행이므로 모든 유효 조합의 1등 확률은 같습니다. 앙상블 점수는 당첨 확률이 아니라 통계 신호와 분포 기준에 따른 상대 평가값입니다.

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

`verify.js`는 공식 이력 무결성뿐 아니라 최근 분석 창, 장기 미출현 보간, 회차 시드 재현성, 균형 필터와 추천 개수도 함께 검사합니다.
