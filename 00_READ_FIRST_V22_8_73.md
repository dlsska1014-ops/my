# V22.8.73 캘린더·챌린지·보안 병합 안내

버전: `V22.8.73-CALENDAR-CHALLENGE-SECURITY`

## 이 패키지가 무엇인지 (먼저 읽어 주세요)

외부에서 받은 `V22.8.71-CALENDAR-CHALLENGE` 작업을 저장소의 최신 상태에 **합친** 것입니다.

받은 파일은 **V22.8.70 에서 갈라져 나온 것**이라 그대로 배포하면
저장소가 이미 고친 아래 결함이 **되살아납니다.**

| 되살아났을 결함 | 저장소 버전 |
|---|---|
| `수정 01번 날짜 어제` 가 다른 날의 01번을 건드리고 "변경했어요" 라고 답함 | V22.8.71 |
| 연속 삭제 시 첫 기록이 안내와 달리 복구되지 않음 (기록 소실) | V22.8.71 |
| `수정 01번 금액 6만원` 을 거절함 | V22.8.71 |
| 키보드로 본문에 닿으려면 Tab 55회 | V22.8.72 |

그래서 **덮어쓰지 않고 3-way 로 병합**했고, 양쪽 작업이 모두 살아 있는지
자동 검사로 확인했습니다. 버전 번호가 겹치므로 이 패키지는 **V22.8.73** 입니다.

## 적용 파일

- `src/index.js` 전체 교체
- `02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql` **검토 후 Supabase SQL Editor 에서 수동 적용**
- immutable 자원 주소 변경: `/assets/mobile-home-v22873.css`,
  `/assets/accountbook-shell-v22873.css`, `/assets/accountbook-v5-v22873.js`

## SQL 검토 결과

`02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql` 은 **이미 있는** RPC
`accountbook_purge_household_v227` 의 내용만 바꿉니다.
(원래 정의는 `schema_v22_7_0_auth_atomicity.sql` 에 있고, `/ready` 필수 목록에도 이미 있습니다.)

실제 변경은 세 가지입니다.

| 변경 | 내용 | 판단 |
|---|---|---|
| `set search_path = public` → `''` | SECURITY DEFINER 함수의 search_path 하이재킹 방지 | 본문의 모든 표가 `public.` 으로 정규화돼 있어 안전 |
| 삭제 대상 키 3종 추가 | `report_challenge:`·`goals:v5:`·`favorites:v5:<id>:` | 가계부를 지워도 남던 설정을 함께 지움 |
| 적용 후 확인 조회 추가 | `purge_rpc_count` 가 1인지 | 데이터를 바꾸지 않는 조회 |

세 키 형식이 앱이 실제로 쓰는 형식과 같은지 대조했고 일치합니다.
`favorites` 는 뒤에 사용자 키가 붙으므로 접두 일치로 지웁니다.

`drop`·`truncate` 같은 파괴적 문장은 없습니다. 실행 권한은
`service_role` 에만 주고 `public`·`anon`·`authenticated` 에서는 회수합니다.

> **이 SQL 은 가계부를 지우지 않습니다.** 삭제 기능이 호출될 때 무엇을 함께
> 지울지를 정하는 함수 정의만 바꿉니다.

## 시크릿 검토 결과

새 환경변수 **3개**가 생겼고, **셋 다 넣지 않아도 지금 그대로 동작합니다.**

| 이름 | 기본값 | 하는 일 |
|---|---|---|
| `KAKAO_SKILL_SECRET` | 없음 | 비우면 `/skill` 은 **지금처럼 열려 있습니다.** 값을 넣으면 그때부터 헤더 검사 |
| `KAKAO_SKILL_AUTH_REQUIRED` | `0` | `1` 이면 비밀값이 비어 있을 때 준비 실패로 잡아 "켠 줄 알았는데 안 켜진" 상태를 막음 |
| `HOUSEHOLD_CREATE_LEASE_SECONDS` | `30` | 가계부 생성 잠금의 임대 시간 |

`/skill` 인증은 `x-kakao-skill-secret`, `x-api-key`(OpenBuilder 기본),
`Authorization: Bearer …` 셋 중 하나를 받고 **상수 시간 비교**를 씁니다.
차단 응답과 `/health` 에 비밀값이 새지 않는 것을 검사로 고정했습니다.
`/health` 는 `skill_caller_auth_configured` 로 **설정 여부만** 알립니다.

> ⚠️ **순서를 지켜 주세요.** OpenBuilder 스킬 헤더를 먼저 넣고 동작을 확인한 뒤에
> Worker 에 `KAKAO_SKILL_SECRET` 을 넣으십시오. 반대로 하면 그 사이 카카오 채널이
> 403 으로 막힙니다. `KAKAO_SKILL_AUTH_REQUIRED=1` 은 둘 다 확인한 뒤 마지막에 켭니다.

## 함께 들어온 개선

- 캘린더 기록 도트를 실제 요소(`.calRecordDot`)로 복구하고 선택된 날짜에서도 대비 유지
- 날짜 상세 팝업에서 권한별 수정·삭제·기록 추가 (`can_write`·`can_edit` 기준)
- 챌린지 3종 확장: 무지출 일수 · 하루 지출 한도 · 분류별 하루 한도 (기존 설정은 무지출로 호환)
- `pending`·`blocked` 참여자를 지출자로 지정하는 주요 쓰기 경로 차단
- 인증 제한 DB 연결 실패 시 로그인·중요 쓰기를 **실패-폐쇄**
- `/ready` 가 필수 표 10개와 선택 표 1개를 나눠 확인 (`accountbook_categories` 는 대체 경로가 있어 선택)
- 관리자 거래 API 의 잘못된 JSON·유형·금액·날짜·비활성 지출자를 400 으로 거절
- 참여자 목록 조회 장애 시 유일 소유자 삭제 거절
- 가계부 생성 잠금을 프로세스 메모리 → Supabase 작업 임대로 전환 (인스턴스가 여러 개여도 유효)
- 저장 식별자를 시간 기반 → 암호학적 난수로 전환
- 구조화 오류 로그(`logWorkerError`)

## 적용 순서

1. Worker 와 Supabase 를 백업합니다.
2. `02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql` 을 직접 읽어 검토합니다.
3. 승인되면 SQL Editor 에서 실행하고 마지막 `purge_rpc_count` 가 **1** 인지 확인합니다.
4. `src/index.js` 전체를 교체해 배포합니다.
5. 저장소 루트에서 아래를 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\10_VERIFY_AFTER_DEPLOY_V22_8_73.ps1
```

6. `/health` 의 `skill_caller_auth_configured` 와 `/ready` 의 표 11개를 확인합니다.
7. 캘린더 도트, 날짜 상세의 수정·삭제, 챌린지 3종을 실제 계정으로 확인합니다.
8. 오래 열어 둔 웹 탭은 새로고침해야 `v22873` 자원이 적용됩니다.
9. (선택) `/skill` 인증을 쓸 경우에만 위 "순서를 지켜 주세요" 를 따릅니다.

기존 V22.6.8·V22.7.0·V22.7.1·V22.8.46 SQL 은 `/ready` 가 정상이라면 다시 실행하지 않습니다.

> 이 저장소 작업에서는 SQL 실행과 운영 배포를 수행하지 않았습니다.
