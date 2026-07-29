# 똑똑한 가계부 V22.8.46 참여자 역할 스키마 정합성

V22.8.45의 Error 1101 보호를 유지하면서 운영 DB 역할 규칙에 누락된 `admin`을 안전하게 추가해 참여자 관리자 승격을 완성한 누적 배포본입니다.

운영 적용 상태: V22.8.45 Worker에서 DB 역할 규칙 오류 확인. V22.8.46은 로컬 전체 검증 완료, 운영 SQL과 Worker 배포 대기입니다.

운영 적용은 V22.8.46 SQL 성공을 먼저 확인한 뒤 검증된 `src/index.js`로 Cloudflare Worker 전체를 교체합니다. 부분 붙여넣기는 하지 않습니다.

## 이번 버전 핵심

- `household_members.role`의 텍스트 CHECK 또는 enum을 자동 판별해 `admin` 허용
- 알 수 없는 기존 역할·예상하지 못한 제약·5초 잠금 실패 시 transaction 전체 중단
- 기존 참여자 행·RLS·GRANT·RPC·인덱스는 변경하지 않고 SQL 사후 readiness 결과 제공
- 승인대기 참여자의 관리자 승격 경로에서 DB 예외를 처리해 Error 1101 대신 화면 내 오류 표시
- 권한 변경 실패 시 기존 역할을 유지하고, 실제 반영 행이 없으면 성공으로 오판하지 않음
- 허용되지 않은 역할 값 거부와 권한 변경용 참여자 조회의 fail-closed 처리
- 라이트 카드·보조 표면에서 4.26:1이던 공통 보조 텍스트를 최소 4.92:1 이상 토큰으로 보정
- 다크모드 주요 `빠른 입력` 링크가 포인트 컬러에 덮이던 대비 결함을 흰색 전경으로 고정
- 블루·그린·바이올렛·앰버의 라이트·다크 강조색 조합을 4.5:1 이상으로 자동 계측
- 모바일 전체 메뉴 버튼을 44×44px 이상으로 보장하고 고대비·강제 색상·동작 줄이기 환경 지원
- 변경된 공통 CSS를 `/assets/accountbook-shell-v22844.css`와 새 ETag로 분리해 immutable 캐시 오염 방지
- 정산 완료 이력과 목표 JSON 쓰기에서 설정 읽기 실패를 빈 목록으로 처리하지 않고 기존 데이터를 보존
- 가계부 단위 operation lease로 정산·목표 동시 저장을 직렬화하고 경합 요청에 명시적 재시도 안내
- 정산 이력 읽기·쓰기 실패 뒤 기존 이력을 유지하고 잠금 해제 후 안전하게 재시도
- 목표 조회·저장 실패를 503·구분 가능한 `reason`·사용자 메시지로 반환하고 브라우저에 오류 표시
- 목표 ID를 Worker Web Crypto `crypto.randomUUID()`로 생성
- 자산·결제수단의 생성·수정·삭제를 가계부 단위 operation lease로 직렬화해 v2271 RPC 환경에서도 동일 이름 동시 생성을 차단
- 자산 본체 저장 후 월 순자산 스냅샷만 실패하면 전체 실패나 무조건 성공이 아닌 “저장 완료·기록 갱신 지연”으로 안내
- 예산 table 저장 성공 뒤 같은 category의 오래된 settings fallback을 정리하고, 정리 실패는 저장 성공과 분리해 안내
- 월 예산 전체 교체 RPC가 settings fallback 전체를 같은 transaction에서 제거해 삭제한 분류의 재등장을 막는 회귀검사 추가
- 정기지출·자산·카드혜택에서 접근 불가능한 명시적 `household_id`를 첫 가계부로 대체하지 않고 거부
- 예산이 실제 존재하는 table/settings 저장소를 먼저 판별해 어느 삭제가 실패해도 다른 사본을 잃지 않고 오류 안내
- 거래 수정은 성공했지만 보조 표시 이력만 실패한 경우 실제 수정 성공을 정확히 안내하고 운영 경고 기록
- 일반 웹 거래 생성에 기존 DB operation lease를 적용하고 잠금 경합을 미검증 중복 성공이 아닌 재시도 오류로 처리
- 요청한 가계부를 읽을 권한이 없으면 첫 가계부로 자동 대체하지 않고 안전하게 거부
- 거래 쓰기·가계부 관리·정산·관리자 화면의 명시적 `household_id` 범위 통일
- 수동 cron HTTP 실행은 POST와 비밀 헤더/Bearer만 허용하고 query secret 폐기
- 카카오 테스트 payload·raw text·고정 QA 식별자는 QA 플래그와 관리자 인증을 함께 요구
- `/health` liveness와 `/ready` dependency readiness 분리, 3개 테이블·17개 RPC 시그니처 점검
- 운영 오류 화면의 HTTP 500 유지와 운영 대시보드 사용자 키 마스킹
- Git 이력과 동일한 V22.6.8·V22.7.0·V22.7.1 SQL 원본을 장애 복구 자료로 복원
- 카카오 날짜별 기록 번호 조회·수정·삭제와 삭제 복구
- 사용자·대화방별 5분 수정 세션, 반복 응답·무한루프 차단
- 삭제 복구 데이터의 가계부 식별자 보존과 호환 재시도
- 복구 버퍼 저장 실패 시 삭제를 중단하는 데이터 손실 방지
- 복구 INSERT 실패 중 버퍼를 유지하고 다음 요청에서 재시도
- 웹 폼 성공·오류 안내를 제출 위치 근처에 표시
- JSON 오류의 사용자용 `message`와 기계 판정용 `reason`
- 공개 홈과 정책·주요 콘텐츠 14개 정식 경로 및 12개 별칭: `ca-pub-8422696710972974` 소유권 메타 정확히 1회
- `/ads.txt`: `google.com, pub-8422696710972974, DIRECT, f08c47fec0942fa0`
- 승인 전 광고 스크립트·슬롯·광고 쿠키 코드 비활성
- 개인 가계부·거래·분석·영수증·설정·백업·관리자·운영 화면 광고 제외
- 홈을 포함한 로그인 사용자 화면의 기록·리포트·함께·관리 공통 셸, 238px 접이식 사이드바와 모바일 5탭
- 데스크톱 기록·자산·리포트·함께·관리 그룹과 모바일 홈·거래·정산·통계·예산 5탭
- 가계부 전환·참여자·단톡방·가져오기·통계/분석 경로의 정확한 현재 메뉴 표시
- 900px 미만 공통 상단 바·전체 메뉴 드로어·하단 탭과 키보드 초점 가두기·복원
- 홈·소비 분석·정산의 공통 페이지 헤더, 기간 컨트롤, KPI·필터·카드 규격
- 10억 원 이상 KPI도 말줄임 없이 의미가 보이도록 줄바꿈·전체 표시
- 분석 종합 리포트·예산 설정·참여자·백업·단톡방·시작가이드의 구형 내부 메뉴 제거
- 무료 리포트·스마트 도구·자산·결제수단·분류·가계부 전환·계정 보안의 공통 헤더와 카드 표면
- 문자 기호 대신 공통 선형 SVG 아이콘을 사용하고 데스크톱·모바일 메뉴가 같은 사이드바 DOM을 공유
- UI V5의 라이트·다크 표면, 18px 카드 반경, 8px 간격 토큰을 기존 테마 인프라에 연결
- 데모의 가상 데이터와 자체 localStorage 거래 기능은 제외하고 실제 서버 권한·거래·분석 기능 유지
- 시스템·라이트·다크와 블루·그린·바이올렛·앰버 컬러톤 유지
- 선택 달력, 주말, 오늘, 분석 의미색, 모바일 메뉴·터치·태블릿 경계 대비 보정
- 데스크톱의 거래 검색·빠른 입력 2개 주요 작업과 예산 알림·화면 설정 보조 작업
- 모바일 단일 작업 버튼과 네 작업을 모은 접근성 대화상자, `/` 검색 단축키
- 홈의 서버 `app` 메뉴와 클라이언트 `home` 상태를 정확히 매핑해 현재 메뉴 1개 유지
- 연간 리포트와 저축·목표 경로, 전 기간 거래 검색·알림 센터·검색 즐겨찾기 제공
- 존재하지 않는 가계부 요청의 자동 대체 차단과 조회 전용 목표 변경 금지
- 목표 동시 저장 잠금, 0원 목표·납입 차단, 이탈 시 되돌리기 저장 안정화
- 검색·알림 오버레이의 Tab 순환·Escape 닫기·초점 복원

## 정적 자원

| 경로 | 역할 |
|---|---|
| `/assets/accountbook-shell-v22844.css` | UI V5 공통 셸·테마 대비·보조 디스플레이·900px 반응형 CSS |
| `/assets/accountbook-nav-v22836.js` | 현재 메뉴·모바일 드로어·빠른 입력·화면 설정 런타임 |
| `/assets/accountbook-v5-v22838.js` | 검색·알림·즐겨찾기 오버레이 공통 번들 |
| `/assets/accountbook-goals-v22843.js` | 목표 저장 실패 피드백을 포함한 목표 화면 클라이언트 런타임 |
| `/assets/accountbook-theme-v22812.js` | 모드·컬러톤 저장과 시스템 설정 동기화 |
| `/assets/accountbook-shell-v22811.css` | 바이트가 보존된 이전 공통 셸 |
| `/assets/mobile-home-shell-v22811.js` | 바이트가 보존된 홈 메뉴 동기화 런타임 |
| `/assets/mobile-home-v22810.css` | 바이트가 보존된 홈 기본 CSS |
| `/assets/mobile-home-v22810.js` | 바이트가 보존된 레거시 홈 런타임 |

정적 자원은 DB를 조회하지 않고 `public, max-age=31536000, immutable`로 제공됩니다. 개인 데이터 HTML은 계속 `no-store`입니다.

## 적용 판단

| 항목 | 작업 |
|---|---|
| Cloudflare Worker | SQL 성공 후 `src/index.js` 전체 교체 필요 |
| Supabase SQL·스키마·RLS·RPC | `01_APPLY_MEMBER_ROLE_SCHEMA_V22_8_46.sql` 1회 실행 필요. RLS·GRANT·RPC·인덱스 변경 없음 |
| Cloudflare 환경변수·Secret | 변경 없음 |
| Kakao Developers | 변경 없음 |
| OpenBuilder | 변경 없음 |
| 운영 배포·실기기 확인 | 별도 수동 단계 |

운영에는 이전 게시자 환경값이 남아 있지만, 이번 심사본은 `ca-pub-8422696710972974`를 코드에서 고정해 그 값을 무시합니다. 환경변수 자체를 새로 만들거나 바꾸지 않습니다.

## 자동 검증

```sh
npm run validate:receipt
npm run validate:kakao-group
npm run validate:kakao-edit
npm run validate:household-security
npm run validate:member-role-schema
npm run validate:ux-principles
npm run validate:performance
npm run validate:adsense-v2
npm run validate:v5
npm run validate:core-write
node .codex/scripts/verify-repository.mjs
```

- 영수증 56개
- 카카오 그룹 22개
- 카카오 수정·삭제·복구 130개
- 가계부·계정·운영 보안 75개
- 참여자 역할 스키마 20개
- UX·분석 보호 56개
- 사용자 화면·홈 버튼·테마·성능 144개
- AdSense 심사·V2·UI V5 공통 셸 261개
- V5 권한·범위·저장 안정화 41개
- 핵심 쓰기·권한 스모크 97개
- 합계 902개와 ESM `default.fetch`

## 적용 후 확인

1. SQL 결과가 `admin_allowed:true`, `invalid_role_count:0`, `readiness_ok:true`인지 확인합니다.
2. `/health`가 HTTP 200, `alive: true`, `V22.8.46-MEMBER-ROLE-SCHEMA-ALIGNMENT`인지 확인합니다.
3. `/ready`가 HTTP 200이며 `failed_tables`와 `missing_rpcs`가 비어 있는지 확인합니다.
4. 공개 홈과 `/privacy`의 소유권 메타가 정확히 한 번인지 확인합니다.
5. `/ads.txt`의 한 줄, MIME, 줄바꿈을 확인합니다.
6. 개인 `/app`, `/my/analysis`, `/receipts`와 관리자 화면에 광고 메타·스크립트가 없는지 확인합니다.
7. `/assets/accountbook-shell-v22844.css`, `/assets/accountbook-nav-v22836.js`, `/assets/accountbook-v5-v22838.js`의 200·MIME·immutable·ETag를 확인합니다.
8. 390px·768px·900px·1024px·1440px에서 홈·통계·분석·정산과 예산·리포트·참여자·자산·백업·보안의 공통 헤더·메뉴·전역 작업, 다크모드·네 컬러톤과 가로 넘침을 확인합니다.
9. 승인대기 테스트 참여자를 관리자로 저장해 Error 1101과 DB 역할 오류 없이 상태가 유지되는지 확인합니다.
10. 기록 저장·수정·삭제, 가계부 전환, 로컬 로그인, 계정 보안, 영수증 OCR, 카카오 1:1·그룹을 확인합니다.

## 롤백

코드 문제면 배포 직전 백업한 V22.8.45 `src/index.js`로 Worker 코드만 전체 롤백합니다. 적용된 역할 제약은 기존 역할과 `admin`을 함께 허용하므로 임의로 제거하지 않습니다.
