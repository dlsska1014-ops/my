# 똑똑한 가계부 V22.8.11 홈 UX 셸 확장본

V22.8.10의 홈 성능 최적화와 모든 보안·카카오·영수증·분석 보호 기준을 유지하면서, 승인된 UI 방향을 홈과 주요 사용자 화면의 공통 디자인 셸로 승격한 누적 배포본입니다.

부분 패치가 아닙니다. 운영에 적용할 때는 검증된 `src/index.js`를 기존 Cloudflare Worker 코드와 전체 교체합니다.

## 이번 버전 핵심

- 공통 토큰: `#f2f4f6`, `#fff`, `#191f28`, `#6b7684`, `#e9ebee`, `#3182f6`
- PC 홈: 238px 흰색 사이드바와 파란 활성 메뉴
- 모바일: 기존 홈·기록·입력·정산·메뉴 동선 유지
- 주요 사용자 화면: 홈, 통합 내비게이션, 개인 메뉴, 로그인, 계정 보안, 가계부 시작 화면
- 공통 셸 CSS는 `body.abV22811Shell`로 제한하고 각 대상 HTML에 마지막 cascade로 한 번만 연결
- V22.8.10 기본 자산의 바이트와 ETag 보존

## 정적 자원

| 경로 | 역할 |
|---|---|
| `/assets/mobile-home-v22810.css` | 바이트가 보존된 홈 기본 CSS |
| `/assets/mobile-home-v22810.js` | 바이트가 보존된 레거시 홈 런타임 |
| `/assets/accountbook-shell-v22811.css` | 공통 디자인 셸 |
| `/assets/mobile-home-shell-v22811.js` | 레거시 홈 기능과 현재 메뉴 동기화 런타임 |

모든 정적 자원은 DB를 조회하지 않고 `public, max-age=31536000, immutable`로 제공됩니다. 개인 데이터 HTML은 계속 `no-store`입니다.

## 성능 기준

| 항목 | 기준 |
|---|---:|
| `/my` 데이터 요청 | 4회 이하 |
| `/app` 데이터 요청 | 9회 이하 |
| 개인 홈 HTML | 35KB 미만 |
| 정적 자원 DB 요청 | 0회 |

## 적용 판단

| 항목 | 작업 |
|---|---|
| Cloudflare Worker | `src/index.js` 전체 교체 필요 |
| Supabase SQL·스키마·RLS·RPC | 변경 없음 |
| Cloudflare 환경변수·Secret | 변경 없음 |
| Kakao Developers | 변경 없음 |
| OpenBuilder | 변경 없음 |
| 운영 배포·실기기 확인 | 별도 수동 승인·실행 필요 |

## 자동 검증

```sh
npm run validate:receipt
npm run validate:kakao-group
npm run validate:household-security
npm run validate:ux-principles
npm run validate:performance
node .codex/scripts/verify-repository.mjs
```

- 영수증 55개
- 카카오 18개
- 가계부·계정 보안 43개
- UX·분석 보호 55개
- 홈 UX 셸·성능 94개
- 합계 265개와 ESM `default.fetch`

## 적용 후 확인

1. `/health`의 버전이 `V22.8.11-HOME-UX-SHELL-EXPANSION`인지 확인합니다.
2. PC Chrome에서 `/my → /app`과 주요 메뉴를 확인합니다.
3. iPhone Safari와 Android Chrome에서 입력 글자, 터치 영역, 하단 메뉴를 확인합니다.
4. 새 CSS·JavaScript 두 경로와 V22.8.10 기본 자원 두 경로가 모두 200인지 확인합니다.
5. 기록 저장, 가계부 전환, 계정 보안, 분석, 영수증 OCR, 카카오 1:1·그룹을 확인합니다.

## 롤백

DB 변경이 없으므로 문제가 생기면 직전 V22.8.10 `src/index.js`로 Worker 코드만 전체 롤백합니다. SQL·환경변수·외부 콘솔 롤백은 없습니다.
