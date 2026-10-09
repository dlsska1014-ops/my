# V22.9.32 모듈 소스

버전은 `V22.9.32-MODULAR-SOURCE`입니다. 사용자 기능은 바뀌지 않습니다. Worker 소스를 `src/modules/`의 모듈 108개로 나누고, `src/index.js`는 `npm run build:worker`가 그 모듈을 `MANIFEST.txt` 순서로 이어 만드는 생성 파일이 됐습니다. 배포 대상은 여전히 `src/index.js` 한 파일입니다. V22.9.31과 비교하면 최상위 문장 1,610개 중 `APP_VERSION` 하나만 구문 트리가 다르고(`node tools/compare-worker-statements.mjs`), 나머지 바이트 변화는 머리 주석의 생성 파일 안내 한 줄과 과거 런타임 자산 객체의 항목별 줄바꿈입니다.

함께 들어온 것은 다음과 같습니다. 모듈마다 import/export 표시가 붙었고 빌드가 이를 지웁니다. 대시보드 붙여넣기를 대신하는 배포 스크립트 `tools/deploy-worker-version.mjs`는 Versions API로 업로드하고 대조한 뒤, 승인을 받아야 승격합니다. 분석용으로 acorn 8.16.0을 원본 그대로 담았습니다. 빌드 동일성·모듈 문법·클라이언트 직렬화·초기화 순서·배포 스크립트 검사도 추가했습니다.

운영 적용 정본은 `docs/ASIDE_V22_9_32.md`입니다. 이 판은 새 배포 스크립트의 첫 실제 사용이며 저장소 작업에서는 운영에 배포하지 않았습니다. 새 SQL·환경변수·Secrets·바인딩·Kakao Developers·OpenBuilder·요금제 변경은 없습니다. 배포 스크립트에 쓸 Cloudflare API 토큰(Workers Scripts Write, 이 계정 한정, 만료일 지정)은 사용자가 외부 콘솔에서 만듭니다.

검증 결과는 `VERIFICATION_V22_9_32.md`, 설계와 단계는 `docs/refactor/modularization-v1/PLAN.md`, 보호 기준은 `BASELINE.md`, 알려진 한계는 `KNOWN-ISSUES.md`, 운영 확인 항목은 `RELEASE-CHECKLIST.md`를 확인합니다.
