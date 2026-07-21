# 똑똑한 가계부 V22.8.15 다크 인증 화면 대비 핫픽스

V22.8.14의 홈 전체 조회 버튼 보정과 모든 보안·카카오·영수증·분석 보호 기준을 유지하면서, 다크모드 로그인과 내 계정·보안 화면의 밝은 컴포넌트 대비를 교정한 핫픽스입니다.

부분 패치가 아닙니다. 운영에 적용할 때는 검증된 `src/index.js`를 기존 Cloudflare Worker 코드와 전체 교체합니다.

## 이번 버전 핵심

- 화면 모드: 시스템 설정 따르기, 라이트, 다크
- 컬러톤: 블루, 그린, 바이올렛, 앰버
- 저장 범위: 개인정보 없는 브라우저 로컬 설정, 기기별 유지
- 대비 수정: 로그인·계정보안의 카카오 배지, 도움말, 안내·경고, 계정 식별, 보조 버튼
- 라이트 로그인 구분 문구 4.5:1 이상 보정
- 분석 클라이언트·렌더러 구조와 보호 해시 유지
- V22.8.11과 V22.8.10의 기존 정적 자원 바이트·ETag 보존

## 정적 자원

| 경로 | 역할 |
|---|---|
| `/assets/accountbook-shell-v22815.css` | 인증 화면 범위와 대비를 포함한 최신 셸 |
| `/assets/accountbook-theme-v22812.js` | 모드·컬러톤 저장과 시스템 설정 동기화 |
| `/assets/accountbook-shell-v22811.css` | 바이트가 보존된 이전 공통 셸 |
| `/assets/mobile-home-shell-v22811.js` | 바이트가 보존된 홈 메뉴 동기화 런타임 |
| `/assets/mobile-home-v22810.css` | 바이트가 보존된 홈 기본 CSS |
| `/assets/mobile-home-v22810.js` | 바이트가 보존된 레거시 홈 런타임 |

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
- 카카오 그룹 18개
- 가계부·계정 보안 43개
- UX·분석 보호 55개
- 인증 화면·홈 버튼·테마·성능 123개
- 합계 294개와 ESM `default.fetch`

## 적용 후 확인

1. `/health` 버전이 `V22.8.15-DARK-AUTH-SURFACE-CONTRAST`인지 확인합니다.
2. 전체 메뉴의 화면 설정에서 시스템·라이트·다크와 네 가지 컬러톤을 확인합니다.
3. 새로고침과 같은 브라우저의 다른 화면에서 선택값이 유지되는지 확인합니다.
4. PC Chrome, iPhone Safari, Android Chrome에서 로그인·내 계정·보안과 홈·분석·예산·정산·내 설정 대비를 확인합니다.
5. 새 CSS·JavaScript와 보존된 이전 자원 경로가 모두 200인지 확인합니다.
6. 기록 저장, 가계부 전환, 계정 보안, 분석, 영수증 OCR, 카카오 1:1·그룹을 확인합니다.

## 롤백

DB 변경이 없으므로 문제가 생기면 직전 V22.8.14 `src/index.js`로 Worker 코드만 전체 롤백합니다. SQL·환경변수·외부 콘솔 롤백은 없습니다.
