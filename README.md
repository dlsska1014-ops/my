# 똑똑한 가계부 V22.8.18 UI·UX 4단계 안전본

V22.8.17까지의 보안·카카오·영수증·분석·테마·AdSense 심사 기준을 유지하면서, 첨부된 UI·UX v1~v4와 서버 이식 CSS를 현재 실데이터 화면에 선별 반영한 누적 배포본입니다.

운영 적용은 검증된 `src/index.js`를 기존 Cloudflare Worker 코드와 전체 교체합니다. 부분 붙여넣기는 하지 않습니다.

## 이번 버전 핵심

- 공개 홈과 정책·주요 콘텐츠 14개 정식 경로 및 12개 별칭: `ca-pub-8422696710972974` 소유권 메타 정확히 1회
- `/ads.txt`: `google.com, pub-8422696710972974, DIRECT, f08c47fec0942fa0`
- 승인 전 광고 스크립트·슬롯·광고 쿠키 코드 비활성
- 개인 가계부·거래·분석·영수증·설정·백업·관리자·운영 화면 광고 제외
- V4 참고본의 기록·리포트·함께·관리 메뉴 구조, 248px 사이드바, 모바일 5탭, 통합 카드·필터·표·입력 체계 반영
- 데모의 가상 데이터와 자체 localStorage 거래 기능은 제외하고 실제 서버 권한·거래·분석 기능 유지
- 시스템·라이트·다크와 블루·그린·바이올렛·앰버 컬러톤 유지
- 선택 달력, 주말, 오늘, 분석 의미색, 모바일 메뉴·터치·태블릿 경계 대비 보정

## 정적 자원

| 경로 | 역할 |
|---|---|
| `/assets/accountbook-shell-v22818.css` | V2 보호 규칙과 UI·UX 4단계 통합 디자인 최종 셸 |
| `/assets/accountbook-stage4-nav-v22818.js` | 기존 불변 자산 뒤에서 모바일 5개 목적지를 확정하는 4단계 런타임 |
| `/assets/accountbook-theme-v22812.js` | 모드·컬러톤 저장과 시스템 설정 동기화 |
| `/assets/accountbook-shell-v22811.css` | 바이트가 보존된 이전 공통 셸 |
| `/assets/mobile-home-shell-v22811.js` | 바이트가 보존된 홈 메뉴 동기화 런타임 |
| `/assets/mobile-home-v22810.css` | 바이트가 보존된 홈 기본 CSS |
| `/assets/mobile-home-v22810.js` | 바이트가 보존된 레거시 홈 런타임 |

정적 자원은 DB를 조회하지 않고 `public, max-age=31536000, immutable`로 제공됩니다. 개인 데이터 HTML은 계속 `no-store`입니다.

## 적용 판단

| 항목 | 작업 |
|---|---|
| Cloudflare Worker | `src/index.js` 전체 교체 필요 |
| Supabase SQL·스키마·RLS·RPC | 변경 없음 |
| Cloudflare 환경변수·Secret | 변경 없음 |
| Kakao Developers | 변경 없음 |
| OpenBuilder | 변경 없음 |
| 운영 배포·실기기 확인 | 별도 수동 단계 |

운영에는 이전 게시자 환경값이 남아 있지만, 이번 심사본은 `ca-pub-8422696710972974`를 코드에서 고정해 그 값을 무시합니다. 환경변수 자체를 새로 만들거나 바꾸지 않습니다.

## 자동 검증

```sh
npm run validate:receipt
npm run validate:kakao-group
npm run validate:household-security
npm run validate:ux-principles
npm run validate:performance
npm run validate:adsense-v2
node .codex/scripts/verify-repository.mjs
```

- 영수증 55개
- 카카오 그룹 18개
- 가계부·계정 보안 43개
- UX·분석 보호 55개
- 사용자 화면·홈 버튼·테마·성능 141개
- AdSense 심사·V2·UI·UX 4단계 화면 246개
- 합계 558개와 ESM `default.fetch`

## 적용 후 확인

1. `/health`가 `V22.8.18-UIUX-STAGE4-REVIEW-SAFE`인지 확인합니다.
2. 공개 홈과 `/privacy`의 소유권 메타가 정확히 한 번인지 확인합니다.
3. `/ads.txt`의 한 줄, MIME, 줄바꿈을 확인합니다.
4. 개인 `/app`, `/my/analysis`, `/receipts`와 관리자 화면에 광고 메타·스크립트가 없는지 확인합니다.
5. 새 `/assets/accountbook-shell-v22818.css`의 200·CSS MIME·immutable·ETag를 확인합니다.
6. PC와 모바일에서 4단계 메뉴·홈·달력·분석·다크모드·네 컬러톤과 가로 넘침을 확인합니다.
7. 기록 저장, 가계부 전환, 계정 보안, 영수증 OCR, 카카오 1:1·그룹을 확인합니다.

## 롤백

DB와 외부 콘솔 변경이 없으므로 문제가 생기면 직전 V22.8.17 `src/index.js`로 Worker 코드만 전체 롤백합니다.
