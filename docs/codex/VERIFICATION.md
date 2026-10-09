## V22.9.32의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_32.sha256`의 332개 파일을 사용하고 자동 검사 하한은 8,384개입니다. 이전 199개 경로를 보존하고 모듈·도구·검증·계획 문서 133개를 더했습니다. 하네스는 먼저 빌드 동일성(모듈 → `src/index.js`)을 보고, 이어서 모듈 단독 문법·import/export 표시, 클라이언트 직렬화 자체 완결, 초기화 순서, 배포 스크립트(가짜 Cloudflare API)를 확인합니다.

모듈을 고친 뒤에는 `npm run build:worker`로 표시와 `src/index.js`를 함께 갱신합니다. 소스 바이트를 바꾸는 정리라면 `node tools/compare-worker-statements.mjs <이전 src/index.js> src/index.js --allow-changed <이름>`으로 의도한 문장만 바뀌었는지 PR에서 확인합니다. `node monitoring/test-d1.mjs`의 SQLite 45개는 Node.js 22에서 별도로 실행합니다. 배포 스크립트의 실제 API 동작은 하네스가 아니라 운영 적용 기록에서 확인합니다.

## V22.9.31의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_31.sha256`의 199개 파일을 사용하고 자동 검사 하한은 8,000개입니다. 이전 7,079개 기준을 낮추지 않고 승인된 그룹 정책 단언 1개와 새 공동방 runtime 859개를 추가했습니다. 과거 manifest와 불변 자산 바이트는 보존합니다.

`npm run validate:group-first`는 실제 합성 Skill 요청과 PostgREST/작업 임대 모사로 같은 사용자의 A/B/C 동일 발화, 같은 방의 두 사용자·동시 첫 입력·실제 거래 저장, 역할 관리·수동 승인, 무인증/legacy 경계, strict/malformed/null 읽기, 단계별 unknown/late write, 저장 중 bind/unbind/leave/purge 경합과 나가기·삭제 후 차단을 확인합니다. 첫1·3·25건은 NLU background를 수집하여 실제 fetch를 세고 50회를 넘으면 거절합니다.

그룹·보안·UX·성능·개인 첫 기록·개인 호출 예산을 먼저 실행한 뒤 `node .codex/scripts/verify-repository.mjs`를 실행합니다. `node monitoring/test-d1.mjs`의 SQLite 45개는 Node.js 22에서 별도로 실행하고 실제 버전을 기록합니다. 최종 결과·동결 hash·운영 미확인 항목은 `VERIFICATION_V22_9_31.md`에 기록합니다. 실제 Supabase·카카오·5초 latency·엣지 CPU와 만료 후 원격 commit은 합성 통과로 주장하지 않습니다.

아래에는 이전 버전의 검증 기록을 보존합니다.

## V22.9.27의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_27.sha256`의 174개 파일을 사용하며 자동 검사 하한은 5,662개입니다.
신규 `validation/validate-prelogin-preview-v22927.mjs` 73개는 로그인 전 가상 기능 미리보기, 기존 로그인·가입·`return_to`, 로그인·가입·OAuth 오류 순서와 focusable 입력 대상·단일 alert·가입 열림 상태, 기본 CTA의 기본·hover·focus 흰 글자, no-store·CSP·쿠키 없음, 48KiB HTML 예산, Help·메뉴 URL 없음, 신규·기존 웹 명령의 단일 URL, 그룹 QuickReplies 금지를 확인합니다.
전체 하네스 5,662개·체크섬 174개와 운영 소스 일치, /health·/ready·정적 자산 16개·80개, 공개 응답의 1440px·390px 격리 렌더를 부모 작업에서 확인했습니다. 결과는 `VERIFICATION_V22_9_27.md`에 기록합니다. SQLite·실기기·실제 인증 왕복·Kakao 앱 확인을 자동 통과로 보지 않으며 채널 홈은 기존 카드를 읽기 전용 확인한 범위만 기록합니다.

## V22.9.26의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_26.sha256`의 170개 파일을 사용하며 자동 검사 하한은 5,589개입니다.
라우터 await·안전 실패 회귀 검사 47개, 출시 점검 수정(카카오·인증·시간·가져오기·예산·헤더) 83개, 코드리뷰 후속 125개와 cold/warm 직렬 깊이 보호 6개를 포함합니다. 독립 메모리 픽스처가 Supabase 503·네트워크 끊김·레이트리밋 거부를 흉내 내며 실제 DB에 연결하지 않습니다.
브라우저 감사와 `node monitoring/test-d1.mjs`는 하네스 밖에서 별도로 실행하고 실제 실행 시점의 소스 해시와 Node.js 버전을 기록합니다. 결과는 `VERIFICATION_V22_9_26.md`에 기록합니다.

## V22.9.25의 검증 방법

당시 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_25.sha256`을 사용했으며 자동 검사 하한은 5,327개였습니다.
홈·거래 상세·가져오기 회귀 검사 42개를 추가했습니다. `npm run audit:uiux`는 설치된 Chrome 또는 Edge에서 독립 메모리 픽스처를 사용합니다.
브라우저 감사와 `node monitoring/test-d1.mjs`는 별도로 실행합니다. 결과는 `VERIFICATION_V22_9_25.md`에 기록합니다.
사용자 승인 후 앱 V22.9.25를 운영에 배포했으며 공개 검사 116개, 운영 소스 일치와 설정 보존을 확인했습니다. 배포 ID와 남은 수동 검증도 같은 문서에 기록합니다.

## V22.9.24

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_24.sha256`을 사용하며 자동 검사 하한은 5,285개입니다.
신규 설정 범위·취소·관제 SSO·DB 부분 지표 검사 121개를 포함합니다.
`node monitoring/test-d1.mjs`는 Node.js 22 SQLite 메모리 검증 45개를 별도로 수행합니다.
공개 배포 검사는 현재 릴리스 소스에서 자산 주소를 읽어 운영 자산의 바이트까지 비교합니다.
운영 배포 ID와 실제 점검 결과, 남은 수동 검증은 `VERIFICATION_V22_9_24.md`에 기록합니다.

## V22.9.23의 검증 기록

당시 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_23.sha256`을 사용했으며 자동 검사 하한은 5,164개였습니다.
이름 구분자·역할 표시·immutable 자산·반응형 레이아웃·Workers 런타임·실제 공급자 지표 회귀 37개를 추가했습니다.
브라우저 감사와 Node.js 22 SQLite 45개 검사는 별도로 실행합니다. 최신 기록은 `VERIFICATION_V22_9_23.md`입니다.

아래에는 이전 버전의 기록을 보존합니다.

## V22.9.22 종합 관제

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_22.sha256`을 사용하며 자동 검사 하한은 5,127개입니다.
관제 인증·허용 목록·수집 장애·리소스 한도 83개를 추가했습니다. Node.js 22에서는
`node monitoring/test-d1.mjs`로 실제 SQLite의 45개 검사를 별도로 실행합니다.
Wrangler 사전 검사는 실제 운영 수집 성공을 의미하지 않습니다. 최신 결과는 `VERIFICATION_V22_9_22.md`에 기록합니다.
아래 내용은 이전 검증 기록입니다.

# Codex 검증 하네스

회사 PC와 집 PC의 Codex CLI·IDE에서 같은 저장소 검증을 실행하기 위한 기준입니다.
현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_20.sha256`의 V22.9.20 파일 133개와
자동 검사 4,966개 이상, Worker 문법, ESM 진입점, Git 공백 오류를 확인합니다.
이름·도메인·카카오 콜백 전환과 월초·월말 하루 환산 검사가 포함됩니다.
운영 점검은 `00_READ_FIRST_V22_9_20.md`와 `RELEASE-CHECKLIST.md`를 따릅니다.
아래 상세 목록은 V22.8.78 당시의 검증 기록이며 최신 검사 수는 하네스 실행 결과로 확인합니다.

## 전체 검증

저장소 루트에서 실행합니다.

```sh
node .codex/scripts/verify-repository.mjs
```

하네스는 다음을 순서대로 확인합니다.

1. `BUNDLE_FILE_CHECKSUMS_V22_8_74.sha256`의 배포 파일
2. `src/index.js` JavaScript 문법
3. 카드사 가져오기·로그인 대기·영수증 제거 110개
4. 카카오 그룹 22개
5. 카카오 수정·삭제·복구 V4 130개
6. 가계부·운영 보안 89개
7. 참여자 역할 스키마 20개
8. UX·분석 보호 56개
9. 사용자 화면·홈 버튼·테마·성능 161개
10. AdSense 심사·V2·UI V5 공통 셸 262개
11. UI V5 권한·범위·저장 안정화 41개
12. 핵심 쓰기·권한 스모크 110개
13. UI/UX 1~4단계 218개
14. 리포트 대시보드 UX 60개
15. 홈 우측 기록·챌린지 보정 68개
16. 챌린지·최근 기록 UI/UX 76개
17. 계정·런타임 신뢰성 16개
18. 기능·UI 신뢰성 48개
19. 모바일 화면 보정 69개
20. 모바일 전체 탭 점검 102개
21. 앱 아이콘 자원 38개
22. 웹 매니페스트 64개
23. 테마 글자 대비 49개
24. 거래 삭제 동작 15개
25. 역할별 화면·빈 상태 203개
26. 조작 영역·접근성 278개
27. 카카오 메모·중복 방지 57개
28. 금액 파싱 77개
29. 수정·삭제·복구 왕복 58개
30. 본문 바로가기 178개
31. 스킬 인증·삭제 SQL 49개
32. 예산 재검토·다크 대비 18개
33. ESM import와 `default.fetch`
34. 작업 트리·스테이징 영역의 공백 오류

성공 결과는 총 2,691개 자동 검사와 현재 `src/index.js` SHA-256을 표시합니다.

## 빠른 검사

| 영역 | 명령 |
|---|---|
| 카드사 가져오기·로그인 대기 | `npm run validate:card-import` |
| 카카오 | `npm run validate:kakao-group` |
| 카카오 수정·복구 | `npm run validate:kakao-edit` |
| 계정·가계부 보안 | `npm run validate:household-security` |
| 참여자 역할 스키마 | `npm run validate:member-role-schema` |
| UX·분석 보호 | `npm run validate:ux-principles` |
| 접근성 테마·홈 셸·성능 | `npm run validate:performance` |
| AdSense 심사·V2·UI V5 공통 셸 | `npm run validate:adsense-v2` |
| UI V5 권한·범위·저장 안정화 | `npm run validate:v5` |
| 핵심 쓰기·권한 스모크 | `npm run validate:core-write` |
| UI/UX 1단계 | `npm run validate:uiux-stage1` |
| UI/UX 2단계 | `npm run validate:uiux-stage2` |
| UI/UX 3단계 | `npm run validate:uiux-stage3` |
| UI/UX 4단계 | `npm run validate:uiux-stage4` |
| 리포트 대시보드 UX | `npm run validate:report-dashboard` |
| 홈 우측 기록·챌린지 보정 | `npm run validate:home-rail-challenge` |
| 챌린지·최근 기록 UI/UX | `npm run validate:challenge-activity-ux` |
| 계정·런타임 신뢰성 | `npm run validate:account-runtime` |
| 기능·UI 신뢰성 | `npm run validate:functional-ui` |
| 모바일 화면 보정 | `npm run validate:mobile-surface` |
| 모바일 전체 탭 점검 | `npm run validate:mobile-audit` |
| 앱 아이콘 자원 | `npm run validate:app-icon` |
| 웹 매니페스트 | `npm run validate:web-manifest` |
| 테마 글자 대비 | `npm run validate:theme-contrast` |
| 거래 삭제 동작 | `npm run validate:tx-delete` |
| 역할별 화면·빈 상태 | `npm run validate:role-surface` |
| 조작 영역·접근성 | `npm run validate:tap-target` |
| 카카오 메모·중복 방지 | `npm run validate:kakao-memo` |
| 금액 파싱 | `npm run validate:amount-parse` |
| 수정·삭제·복구 왕복 | `npm run validate:edit-restore` |
| 본문 바로가기 | `npm run validate:skip-to-content` |
| 스킬 인증·삭제 SQL | `npm run validate:skill-auth-purge` |
| 예산 재검토·다크 대비 | `npm run validate:budget-dark-contrast` |

## 하네스 자체 점검

```sh
node .codex/scripts/verify-repository.mjs --self-test
```

## 자동화할 수 없는 항목

하네스 성공은 운영 배포 승인이 아닙니다. Cloudflare 운영 배포, `/health`·`/ready`, 챌린지 인라인 저장, 신규 계정 생성·재로그인과 실기기 반응형·모바일 화면은 `RELEASE-CHECKLIST.md`에서 별도 확인합니다. V22.8.78에는 신규 SQL이 없으며 기존 V22.6.8·V22.7.0·V22.7.1과 V22.8.46 SQL은 다시 실행하지 않습니다.
## V22.9.30

현재 정본은 `BUNDLE_FILE_CHECKSUMS_V22_9_30.sha256`의 195개와 동적으로 합산하는 `.codex/scripts/verify-repository.mjs`의 실측 7,079개입니다. `npm test` 또는 `node .codex/scripts/verify-repository.mjs`로 실행하며 Node22를 사용합니다. 새 audit-corrections378, startup-budget40, import-cron477과 main sister-link44가 전체 하네스에 포함됩니다. 기존 검사와 checksum coverage를 줄이지 않습니다.

SQLite45는 실제 Node.js v22.23.1에서 별도로 확인했고 CI도 Node22 Ubuntu/Windows에서 실행하도록 준비했습니다. 운영·실기기 결과와 코드 검증은 `VERIFICATION_V22_9_30.md`와 `docs/ASIDE_V22_9_30.md`에 구분합니다. `.agents` 스킬의 제거된 receipt 명령과 오래된 count는 범위 밖으로 보고하며 현재 package scripts/하네스 결과를 따릅니다.
