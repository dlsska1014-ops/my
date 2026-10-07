# V22.9.27 검증 기록

## 변경 범위

- `/my` 비로그인 화면에 가상 대화 기록 2건, 구조화된 거래 카드, 예산, 월간 리포트, 공동 정산을 추가했습니다.
- 가상 데이터와 실제 저장 아님을 명시하고 미리보기에는 폼, 쓰기 버튼, DB 요청, 쿠키, `fetch`, `localStorage`, `sessionStorage`를 추가하지 않았습니다.
- 기존 로컬 로그인·가입 form action, 안전한 `return_to`, 카카오 OAuth 시작, 콜백과 쿠키, 비밀번호 피드백, rate limit을 변경하지 않았습니다.
- `웹 가계부 열기`를 대표 명령어 11번으로 등록했습니다. Help와 메뉴 채팅 응답은 URL이 없고, 이 명령과 기존 `링크`, `홈페이지`, `웹` 같은 명시적 웹 명령은 모두 `/my` 주소 하나만 제공합니다.
- 로그인·가입·OAuth 오류 요약은 미리보기 위에 표시하고 기존 로그인 이름 입력칸으로 직접 연결합니다. 가입 오류는 기존 가입 접기를 연 상태로 렌더링하며 오류 알림 역할은 요약 하나에만 둡니다. 미리보기 주 색은 기존 컬러톤 토큰을 사용합니다.
- 그룹 응답 QuickReplies 금지, 개인 화면 `no-store`, 인증 화면 CSP·프레임 차단, `/my` 4회·`/app` 9회 이하 예산은 그대로입니다.

## 실행한 집중 검사

- `node validation/validate-prelogin-preview-v22927.mjs`: PASS, 73개.
- `node validation/validate-component-css-travels-v22914.mjs`: PASS, 16개.
  - 가상 데이터 표시, 대화 예시 2건, 예산·리포트·정산 가치, 로그인보다 앞선 정보 위계
  - 미리보기 폼·버튼·네트워크·브라우저 저장소 없음
  - 로그인·가입 action, `return_to`, 오류 상태, 직렬화된 기존 클라이언트 런타임 유지
  - no-store, CSP, `X-Frame-Options: DENY`, 쿠키 없음, AdSense 미삽입
  - 비로그인 `/my` 외부 요청 0회, HTML 48KiB 이하
  - Help·메뉴 URL 없음, 대표 `웹 가계부 열기`와 기존 `링크`·`홈페이지`의 단일 URL, 직접·그룹 URL 응답, 그룹 QuickReplies 없음
  - 거절된 로그인·가입과 OAuth 오류가 미리보기보다 먼저 보이고, focusable 입력칸을 가리키며, alert 역할이 하나이고, 가입 접기가 열림
  - 로그인 전 기본 CTA가 랜딩 범위의 충분한 우선순위로 기본·hover·focus 흰 글자를 유지
  - 명령어 JSON 카탈로그의 대표 11번과 staged version 확인
- `npm run validate:ux-principles`: PASS, 58개.
- `npm run validate:performance`: PASS, 165개. 인증된 `/my` 4회·`/app` 9회 이하와 기존 홈 HTML 예산을 유지했습니다.
- `npm run validate:kakao-group`: PASS, 22개.
- `npm run validate:household-security`: PASS, 89개.
- `npm run validate:adsense-v2`: PASS, 268개.
- `npm run validate:card-import`: PASS, 110개. 로그인 대기·취소와 기존 가져오기 계약을 유지했습니다.
- `node validation/validate-version-single-source-v22915.mjs`: PASS, 9개.
- `node --preserve-symlinks --preserve-symlinks-main validation/validate-launch-fixes-v22926.mjs`: PASS, 83개.
- `node validation/validate-launch-review-followups-v22926.mjs`: PASS, 125개.
- `npm run validate:kakao-intent-skill-auth`: PASS, 93개.
- `npm run validate:skill-auth-purge`: PASS, 49개.
- `node validation/validate-skill-stability-v22921.mjs`: PASS, 78개. 25행 중복 조회 합성 지연은 약 1.1초였습니다.
- `node --check` 3개와 `git diff --check`: PASS.
- `BUNDLE_FILE_CHECKSUMS_V22_9_27.sha256`: 174개 파일 해시를 별도 대조해 PASS.

## 전체 하네스 상태

최종 소스 SHA-256 `8e299f098bce6295443eae10c084df2d03bd3b7430a34fdede808668ec258d69`에서 전체 하네스 5,662개와 체크섬 174개, ESM 진입점과 공백 검사를 통과했습니다(`V27_POSTDEPLOY_EXIT=0`). 앞선 5,656·5,660개 결과는 교정 과정의 역사적 결과입니다.

## 배포 판정

- 앱 Worker: 최종 검증한 `src/index.js` 전체 교체 필요
- 관제 Worker: 변경 없음
- SQL·D1·Supabase 객체: 변경·실행 없음
- 환경변수·Secret·바인딩·Cron·도메인: 변경 없음
- immutable 자산: 변경 없음
- Kakao Developers: 변경 없음
- OpenBuilder: 2026-10-07 09:04 KST에 PARTIAL v2.3으로 Help 블록과 봇 입장 블록 2개만 배포 완료. 엔티티·스킬은 제외
- 채널 홈: 기존 소개·브랜드·처음 사용/단톡방 안내·가계부 시작/사용 가이드·챗봇 초대·채널 추가 카드의 활성 상태와 웹사이트/더 알아보기 링크를 읽기 전용 확인. 변경·저장 없음
- 운영 수동 29~31일 RPC SQL 복원: 이번 범위에서 하지 않음

## OpenBuilder 외부 확인

2026-10-07 09:04 KST에 PARTIAL v2.3 배포가 성공했습니다. `도움말` 블록과 `봇 입장` 블록만 선택했고 선택 수는 2개이며 엔티티와 스킬은 배포에서 제외했습니다. 봇 입장은 Help 플러그인과 기본 `챗봇 멘션하기` 플러그인을 사용합니다. Help는 URL이 없고 `ABC123`은 가상 예시임을 분명히 했습니다. 기본 대표 명령어 13개에 정확한 `웹 가계부 열기`가 포함됩니다. 이 배포 전에 v2.2가 2026-10-06 22:42 KST부터 이미 운영 중이었으며 이번 작업의 배포가 아닙니다.

## V22.9.26 운영 기준

V22.9.26은 2026-10-07 07:53:17 KST에 앱 버전 `599061e5-892f-4974-b1b5-2e7dc7f45932`, 배포 `c48ece5b-d8e6-4a05-83ca-e9d374bc40bd`로 100% 운영 적용했습니다. 배포 전 편집기 전체 소스는 SHA-256 `2312d8943e772df8bb71237c801487b601aa73a687b750cfd6cedbf74dccfeaa`와 정확히 일치했습니다. `/health`는 HTTP 200, V22.9.26, `alive=true`, `missing=0`이었고 `/ready`는 HTTP 200, `true`였습니다. 배포 전후 바인딩과 런타임 설정은 깊은 비교에서 같았습니다. 직전 롤백 배포는 `5a0c7faa-a9a3-4b3f-9373-5b565e3d2bc7`입니다. 공개 정적 자산 16개는 80개 검사에서 모두 HTTP 200, immutable 캐시, 올바른 Content-Type, 로컬 200 응답과 정확한 바이트 일치를 확인했습니다. 이 공개 확인은 CLI 116개 실행으로 기록하지 않습니다. 해당 CLI 검사는 네트워크 차단으로 실행되지 않았습니다.

## 남은 수동 확인

- 데스크톱·모바일 실제 브라우저에서 랜딩 화면, 키보드 초점, 확대, 카카오 로그인 대기·취소. 오프라인 HTML 렌더에서 기본 CTA의 계산 색상 결함을 확인해 보정했지만, 전체 페이지 캡처 반복 프레임과 오프스크린 locator clip 결함 때문에 모바일 시각 검증 완료로 간주하지 않음
- 실제 카카오톡 1:1·그룹의 Help, 메뉴, `웹 가계부 열기`, 기존 웹 별칭
- 배포 후 `/health`, `/ready`, 운영 소스, 바인딩·런타임 설정 보존
- 실제 계정 로그인·가입·카카오 OAuth 왕복과 기존 사용자 데이터 비노출

## 시각 확인 제약

오프라인 렌더에서 기본 CTA의 계산 색상 결함을 찾아 랜딩 범위만 흰 글자로 보정했습니다. localhost·격리 헤드리스·새 로컬 파일 탐색은 시간 초과 또는 접근 권한 부족으로 차단됐으며 우회하지 않았습니다. 배포 후에는 파일 대신 현재 공개 `/my` HTML을 쿠키 없이 가져와 격리 문서에서 1440px와 390px로 렌더했습니다. 390px에서는 카드 5개의 가로 경계, 가로 넘침 없음, 34px 제목과 흰 CTA 글자, 로그인 영역을 확인하고 부분 화면 증거를 남겼습니다. 사용자 창 크기는 변경하지 않았습니다. 이 확인은 실제 Android·iOS·Safari 또는 로그인·가입·OAuth 왕복 검증이 아닙니다.

## 운영 적용 확인 · 2026-10-07

- 09:59:40 KST 앱 Worker를 버전 `48e048cc-b483-4d4f-bd9a-59db4a943844`, 배포 `9054b211-83ab-4e05-8b4d-125e96046d06`로 100% 적용했습니다.
- 저장된 운영 `index.js`는 2,845,019바이트이며 SHA-256 `8e299f098bce6295443eae10c084df2d03bd3b7430a34fdede808668ec258d69`로 검증본과 일치했습니다.
- `/health` 200·`V22.9.27-PRELOGIN-PREVIEW`·alive=true·missing_count=0, `/ready` 200·ready=true·missing_rpcs=[]를 확인했습니다. 기존 선택 테이블 `accountbook_categories` 미가용은 준비 상태의 필수 실패가 아닙니다.
- 배포 전후 바인딩과 런타임 설정 JSON은 깊은 비교에서 같았습니다. SQL·Secret·환경변수·Cron·도메인·관제 Worker는 이 작업에서 변경하지 않았습니다.
- 공개 정적 자산 16개·80개 확인에서 HTTP 200·immutable·Content-Type·로컬 200·정확한 바이트 해시가 모두 일치했습니다.
- 로그인된 기존 `/my` 방문의 `/app` 리다이렉트와 쿠키 없는 `/my` 200·`no-store`·`X-Frame-Options: DENY`·가상 데이터 고지를 확인했습니다. 인증 폼은 제출하지 않았습니다.
- 로컬 구현 커밋 `01eee9fd307939db9eba7c3846dc0b176997457b`를 만들었습니다. GitHub push는 CLI의 `Could not resolve host: github.com` 오류로 차단됐으며 원격 완료로 기록하지 않습니다.
- 롤백 버전은 직전 운영 `599061e5-892f-4974-b1b5-2e7dc7f45932`입니다. 말일 RPC는 여전히 28일 clamp이며 수동 SQL 복원을 하지 않았습니다.
