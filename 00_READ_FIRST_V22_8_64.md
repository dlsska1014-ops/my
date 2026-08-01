# V22.8.64 웹 매니페스트 적용 안내

버전: `V22.8.64-WEB-MANIFEST`

## 적용 파일

- `src/index.js` 전체 교체
- 신규 SQL 없음
- 환경변수·Secret·Kakao Developers·OpenBuilder 변경 없음

## 배경

V22.8.63에서 아이콘 파일을 제공해 404를 없앴고, 이번 단계는 `홈 화면에 추가`가
앱처럼 동작하도록 웹 매니페스트를 제공합니다.

## 제공하는 경로

| 경로 | 형식 | 용도 |
|---|---|---|
| `/manifest.json` | `application/manifest+json` | 설치 정보 |
| `/icon-192.png` | PNG 192×192 | 안드로이드 설치 아이콘 |
| `/icon-512.png` | PNG 512×512 | 안드로이드 설치·스플래시, maskable |
| `/favicon.ico` | ICO 32×32 | 브라우저 탭 (V22.8.63) |
| `/apple-touch-icon.png` | PNG 180×180 | iOS 홈 화면 (V22.8.63) |

## 매니페스트 설정값

| 항목 | 값 | 의미 |
|---|---|---|
| `name` | 똑똑한 가계부 | 설치 화면에 표시 |
| `short_name` | 가계부 | 홈 화면 아이콘 아래 표시 |
| `start_url` | `/app` | 아이콘을 눌렀을 때 여는 화면 |
| `scope` | `/` | 앱으로 취급하는 범위 |
| `display` | `standalone` | 브라우저 주소창 없이 열림 |
| `theme_color` | `#3182f6` | 상태 표시줄 색 |
| `background_color` | `#f2f4f6` | 실행 직후 배경색 |

`display`를 `browser`로 바꾸면 기존처럼 브라우저 UI를 유지한 채 열립니다.
주소창과 뒤로가기 버튼을 남기고 싶으면 이 값을 바꾸면 됩니다.

## 적용 순서

1. 현재 운영 Worker 전체 소스를 별도 파일로 백업합니다.
2. 이 패키지의 `src/index.js` 전체를 복사해 운영 소스와 교체합니다.
3. 저장 후 배포합니다.
4. 저장소 루트에서 아래 명령을 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\10_VERIFY_AFTER_DEPLOY_V22_8_64.ps1
```

5. 안드로이드 크롬에서 `설치` 또는 `홈 화면에 추가`가 뜨는지, 설치 후 아이콘과
   앱 이름이 맞는지, 눌렀을 때 `/app`이 열리는지 확인합니다.
6. iPhone 사파리에서 `공유 → 홈 화면에 추가` 아이콘을 확인합니다.
7. 카카오톡 인앱 브라우저는 매니페스트 영향을 받지 않으므로 기존과 같아야 합니다.

기존 V22.6.8·V22.7.0·V22.7.1·V22.8.46 SQL은 `/ready`가 정상이라면 다시 실행하지 않습니다.
