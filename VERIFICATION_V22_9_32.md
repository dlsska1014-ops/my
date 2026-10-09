# V22.9.32 검증 기록

저장소 자동 검증은 끝났고, 운영 적용은 별도입니다. 운영 배포와 실제 Cloudflare API 호출은 하지 않았습니다. checkout은 `D:\Github_Kakao_Account\my`이고, 이 판은 PR #56(모듈 분리 0·1단계)과 PR #57(배포 스크립트) 위에 쌓였습니다. 기준은 V22.9.31 main `6c86ee8`, 동결 소스 SHA-256은 `a361b2f6e87cddd2b283ce9fadf8ac8ee0b3622057d41c8191e3d1b05105fcb7`(3,151,305 bytes, 34,255줄)입니다.

## 동작 동일성

| 확인 | 결과 |
|---|---|
| 최상위 문장 구문 트리 비교 (`tools/compare-worker-statements.mjs`, V22.9.31 `bbcd1756…` 대비, `--allow-changed APP_VERSION`) | 1,610 대 1,610개, 같은 것 1,609개, 바뀐 것 `APP_VERSION`, 순서 같음 |
| 음성 대조 | 허용 목록 없이 실행하면 실패. CSS 템플릿 안에 공백 한 칸을 넣어도 변경으로 잡음 |
| 불변 자산 주소 | 32개 통과. 과거 자산 4개를 포함해 내려가는 바이트 해시가 같음 |
| 성능·시작 예산·판 번호 정본 | 165·40·9개 통과 |
| 분석 스크립트의 acorn 전환 | V22.9.31 소스로 Node 내부 acorn판과 벤더 acorn판을 각각 실행. 출력 125개 파일이 같음(파싱 시간 필드만 다름) |

## 집중 검증

| 검증 | 결과 |
|---|---|
| 빌드 동일성 (`validate:build-identity`) | 19개 |
| 모듈 단독 문법·import/export 표시 (`validate:module-syntax`) | 117개. 모듈 108개가 표시를 포함해 단독 ES 모듈로 파싱됨. import 이름 2,722개가 모두 실제 export와 이어짐 |
| 클라이언트 직렬화 자체 완결 (`validate:client-serialization`) | 38개. 직렬화 지점 43곳, 클라이언트 함수 32개, 화면 전역 허용 2건 |
| 초기화 순서 (`validate:init-order`) | 13개. 로드 때 다른 상수를 읽는 문장 7개가 모두 순서에 맞음. 계획서 4.7의 6건을 탐지함 |
| 배포 스크립트 (`validate:deploy-script`) | 178개. 가짜 Cloudflare API로 업로드·대조·승격·되돌림과 거부 경로를 확인 |

일부러 실패시켜 본 경우는 모두 예상대로 실패했습니다.

- 빌드 도구: 드리프트, 끝 빈 줄, 끝 줄바꿈 누락, CRLF, 오타 인자, manifest 없음
- 빌드 동일성: 고아 파일, 모듈만 고침, `src/index.js` 직접 수정, manifest 분실
- 모듈 문법: 표시를 갱신하지 않은 새 모듈 간 참조
- 클라이언트 직렬화: 클라이언트 함수 안의 서버 도우미 `escapeHtml` 참조, 한 지점에서만 함께 직렬화되는 함수 참조(`moneyTokenSpans` → `mobileUiUxClientMain`은 `mobileHomeJsAsset` 화면에 없음. 지점들을 합쳐 보던 첫 판은 통과시켜서 지점마다 보도록 고침)
- annotate 도구: 문법 오류를 `모듈:줄`로 알림

시험한 뒤에는 모두 원상 복구하고 해시로 확인했습니다.

## 전체 검증

- 새 manifest: `BUNDLE_FILE_CHECKSUMS_V22_9_32.sha256`은 이전 199개 경로를 모두 보존하고 새 파일 133개를 더한 **332개**입니다. 더한 것은 모듈 108개와 `MANIFEST.txt`, 도구 9개, 검증 5개, 계획 문서·명세·스크립트 7개, 판 문서 3개입니다. 과거 manifest는 수정하지 않았습니다.
- 전체 하네스: `node .codex/scripts/verify-repository.mjs`가 자동 검사 **8,365개**(하한 8,365)·Worker 문법·ESM default.fetch·작업 트리와 스테이징 공백 검사를 통과했습니다.
- Node.js v22.23.1에서 `node monitoring/test-d1.mjs`의 SQLite 45개를 별도로 통과했습니다.
- CI(Ubuntu·Windows) 결과는 아래 "GitHub 통합과 운영 기준"에 적었습니다.

## GitHub 통합과 운영 기준

2026-10-09에 세 PR을 쌓인 순서대로 main에 병합했습니다. 병합할 때마다 main CI가 끝난 것을 확인하고 다음 PR의 base를 main으로 바꿨습니다.

| PR | 구현 커밋 | main 병합 커밋 | CI (모두 Ubuntu·Windows 통과, SQLite 45개) |
|---|---|---|---|
| [#56](https://github.com/dlsska1014-ops/my/pull/56) 모듈 분리 0·1단계 | `9f521f1117c06a97402ac2a1f9f3406961ac5dac` | `6be76c0725260bbfa6fe948d348c16875cb9858d` | [브랜치](https://github.com/dlsska1014-ops/my/actions/runs/37752557461)·[PR](https://github.com/dlsska1014-ops/my/actions/runs/37752609148)·[main](https://github.com/dlsska1014-ops/my/actions/runs/37868007439): 체크섬 199개·검사 8,019개, `bbcd1756…` 그대로 |
| [#57](https://github.com/dlsska1014-ops/my/pull/57) 배포 스크립트 | `f9eb93911c3c59ecc5c886e7d9261e78bacd13b6` | `bc4cc1940ca55775a6d81912f7aa2408e5d8cd8a` | [브랜치](https://github.com/dlsska1014-ops/my/actions/runs/37758796704)·[main](https://github.com/dlsska1014-ops/my/actions/runs/37868137555): 199개·8,197개, `bbcd1756…` 그대로 |
| [#58](https://github.com/dlsska1014-ops/my/pull/58) 2·3단계 판 | `a56a85fe1c5caf3dccfb6f5cd46f2d197c13ec6f` | `08f772b2d6cf0044b82b2ba5e4384ae3c64edb70` | [브랜치](https://github.com/dlsska1014-ops/my/actions/runs/37867285413)·[main](https://github.com/dlsska1014-ops/my/actions/runs/37868289810): 332개·8,365개, `a361b2f6…` |

#57·#58은 base를 바꿔도 PR 트리거가 다시 돌지 않습니다(`pull_request` 기본 유형). 그래서 브랜치 CI와 병합 직후 main CI로 확인했습니다. 병합된 main을 로컬에 받아 다음을 확인했습니다.

- `VERSION.txt`·`APP_VERSION`·`package.json`이 V22.9.32로 일치합니다.
- `src/index.js`는 `a361b2f6…`(3,151,305 bytes)입니다.
- `npm test`와 SQLite 45개가 통과했습니다.

main `07d0f60`의 V22.9.31 운영 기록 `docs/deployments/V22_9_31_2026_10_08.md`는 이번 병합으로 이 판의 트리에 함께 들어왔고, 수정하지 않았습니다.

병합 뒤 운영 상태도 확인했습니다. 공개 GET `/health`는 V22.9.31·alive=true·설정 누락 0개였고, `/ready`는 200이었습니다. 배포 스크립트가 승격 뒤 실행하는 공개 검사(`tools/verify-deployment-v22920.mjs --version V22.9.31-GROUP-FIRST-RECORD --legacy-origin https://ttokttok-accountbook.com`)도 현재 운영에 미리 실행해 116개가 모두 통과했습니다. V22.9.32 배포는 아직 실행하지 않았습니다.

## 운영과 한계

이 판의 Worker 교체는 새 배포 스크립트의 첫 실제 사용입니다. `content/v2` 응답 형식, inherit로 올린 버전의 바인딩 조회, 서버 etag와 소스 SHA-256의 관계는 실제 API에서 처음 확인합니다. 어긋나면 스크립트는 멈추고, 기존 대시보드 절차로 돌아갑니다. 새 SQL·스키마·환경변수·Secrets·바인딩·외부 콘솔 변경은 없습니다.

모듈 간 최상위 `let` 대입 10건(지연 생성 자산 캐시)은 단일 파일 배포에서는 문제가 없습니다. 하지만 진짜 ES 모듈로 나눠 평가하면 import가 읽기 전용이라 실패합니다. 4단계에서 캐시 옆으로 옮길 대상이고, 지금은 검사가 목록을 고정해 새 사례만 막습니다. 10,000자를 넘는 줄은 템플릿 리터럴 8개와 과거 자산 항목 4줄입니다. 과거 자산 줄은 값 자체가 긴 문자열이라, 값을 바꾸지 않고는 더 줄일 수 없습니다.
