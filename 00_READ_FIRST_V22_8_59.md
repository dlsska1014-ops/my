# V22.8.59 계정·런타임 신뢰성 적용 안내

버전: `V22.8.59-ACCOUNT-RUNTIME-RELIABILITY`

## 적용 파일

- `src/index.js` 전체 교체
- 신규 SQL 없음
- 환경변수·Secret·Kakao Developers·OpenBuilder 변경 없음

## 적용 순서

1. 현재 운영 Worker 전체 소스를 별도 파일로 백업합니다.
2. 이 패키지의 `src/index.js` 전체를 복사해 운영 소스와 교체합니다.
3. 저장 후 배포합니다.
4. 저장소 루트에서 아래 명령을 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\10_VERIFY_AFTER_DEPLOY_V22_8_59.ps1
```

5. 신규 계정 하나를 만들고 가계부 생성 화면 이동, 로그아웃, 같은 계정 재로그인을 확인합니다.

기존 V22.6.8·V22.7.0·V22.7.1·V22.8.46 SQL은 다시 실행하지 않습니다.
