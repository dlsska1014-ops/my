# V22.9.41 검증 기록

기준 커밋은 main `002d99a`(V22.9.40-ADS-GATE-CONTENT + 관제 1.1.1 + 배포 기록, 운영과 같은 Worker 소스)이며 작업 브랜치는 `claude/v22941-admin-return`입니다. 상태는 운영 적용 대기(`production-pending`)입니다.

## 고친 것과 근거

| 항목 | 내용 | 근거 |
|---|---|---|
| 관리자 로그인 복귀 | `src/modules/auth/crypto-admin-session.js`에 `adminLoginLocation(url)`을 두고 `src/modules/runtime/ops-monitor.js`·`src/modules/admin/nlu-openbuilder-ops.js`의 세션 없는 리디렉션이 `/admin-view?return_to=<safeAdminReturnPath(경로·쿼리)>`로 갑니다. | 2026-10-13 운영에서 `/ops-monitor` → 로그인 → `/?legacy=1` 로 떨어진 것을 사용자가 확인했고, 픽스처 재현 `GET /ops-monitor` → `303 /admin-view` → 폼 return_to `/?legacy=1`. |
| 옛 관리자 화면 내비 스타일 | `src/modules/admin/dashboard-page.js`의 `renderUnifiedNav(..., { scope: "admin" })`. 후처리는 전처럼 범위 표식을 admin으로 두고 인라인 스타일을 head로 옮깁니다. | 운영 `/?legacy=1`(관리자 세션, 실제 Chrome)과 픽스처 렌더(헤드리스 Chrome 1280·390px) 모두 사이드바가 맨글자 링크였고 브랜드 SVG가 화면 폭을 채웠습니다. V22.9.38·39·40 빌드가 같았고, `navScope === "user" ? "" : <style>` 조건은 V22.8.44(2026-07-28)부터입니다. 고친 뒤 같은 렌더에서 사이드바·본문이 정상입니다. |

## 검사

- 새 검사 `validation/validate-admin-return-v22941.mjs` 55개(`npm run validate:admin-return`): 세션 없는 5개 화면의 303 위치, 로그인 폼의 return_to와 안전하지 않은 값(외부 주소·`/login`·`/my/logout`)의 기본값 복귀, 로그인 뒤 복귀와 세션 쿠키, 옛 관리자 화면 3개 주소와 휴대폰 UA의 인라인 내비 스타일·범위 표식·셸 CSS 부재, `/app`의 불변, 소스 고정 6개.
- 일반·분류 표 부재 모드 각각 14,573개 검사·404개 체크섬, SQLite 관제 84개(`node monitoring/test-d1.mjs`)가 통과했습니다.
- `src/index.js`는 4,045,530바이트, SHA-256 `dcb4f83716447338d90addd48252c8c557581cdb429d73c83a555b945c1a2073`, 모듈 111개입니다. 내보내기 목록은 V22.9.40과 같습니다(`named_handlers` 대조 불변).
- manifest `BUNDLE_FILE_CHECKSUMS_V22_9_41.sha256` 404개는 V22.9.40의 399개에 새 검사기 1개, 판 문서 3개, 직전 manifest를 더한 것입니다.

## 바이트 영향

- 옛 관리자 화면 `/?legacy=1`(픽스처): 109,951 → 125,044 B(인라인 내비 스타일 13,472 B와 내비 스크립트). 관리자 세션에서만 나오는 화면입니다.
- 사용자 화면(`/app`·`/my`·공개 문서)은 바뀌지 않습니다. 홈 HTML 여유 248 B도 그대로입니다.

## 실행하지 못한 검증

운영 Worker 업로드·승격과 운영 공개 검사, 실제 브라우저에서 로그인 뒤 `/ops-monitor` 복귀 확인은 배포 뒤에 합니다(`docs/ASIDE_V22_9_41.md`).
