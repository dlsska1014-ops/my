# V22.8.73 검증 보고서

검증일: 2026-08-06

## 점검 범위

외부에서 받은 `V22.8.71-CALENDAR-CHALLENGE` 작업(`src/index.js` 단일 파일,
`00_READ_FIRST_V22_8_71.md`, `02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql`)을
저장소 최신 상태에 합치고, **SQL 과 시크릿 관련 변경을 전수 검토**했습니다.

## 1. 받은 파일은 V22.8.70 에서 갈라진 것이었습니다

먼저 어느 지점에서 갈라졌는지 확인했습니다. 저장소 최근 20개 커밋과 각각 대조해
차이가 가장 작은 지점을 찾았습니다.

| 대조 대상 | 차이 줄 수 |
|---|---:|
| V22.8.71-EDIT-RESTORE-FIX | 666 |
| **V22.8.70-AMOUNT-PARSE-FIX** | **550** |
| V22.8.69 | 573 |
| V22.8.68 | 607 |

받은 파일에는 저장소의 V22.8.71·V22.8.72 수정이 **없습니다.**

| 표지 | 받은 파일 | 저장소 |
|---|:--:|:--:|
| `splitKakaoEditDatePrefixV4` (V22.8.71) | 없음 | 있음 |
| `KAKAO_EDIT_UNDO_MAX` (V22.8.71) | 없음 | 있음 |
| `normalizeKakaoEditAmountValue` (V22.8.71) | 없음 | 있음 |
| `addSkipToContentLink` (V22.8.72) | 없음 | 있음 |

반대로 받은 파일의 새 식별자(`REPORT_CHALLENGE_TYPES`,
`kakaoSkillCallerAuthorized`, `READINESS_REQUIRED_TABLES`,
`activeSpenderExists`, `validateAdminApiTransactionBody`, `randomEntityId` 등)는
저장소 어디에도 없었습니다. **양쪽 다 상대의 작업을 담고 있지 않았습니다.**

그대로 덮어썼다면 위 네 결함이 되살아났을 것입니다. 그중 두 건은
**기록이 사라지거나 엉뚱한 기록이 바뀌는** 종류입니다.

## 2. 그래서 덮어쓰지 않고 3-way 로 병합했습니다

V22.8.70 을 공통 조상으로 두고 병합했습니다. 충돌은 **3건**뿐이었고
셋 다 버전 문자열이었습니다.

| 충돌 | 해소 |
|---|---|
| `APP_VERSION` | 번호가 겹치므로 `V22.8.73-CALENDAR-CHALLENGE-SECURITY` |
| `ACCOUNTBOOK_SHELL_CSS_ASSET_PATH` | 양쪽이 셸 CSS 를 함께 바꿨으므로 새 주소 `v22873` |
| 셸 CSS ETag | 같은 이유로 `v22873` |

병합 후 양쪽 작업이 모두 살아 있는지 표지로 확인했고, 기존 회귀
(수정·삭제·복구 58개, 본문 바로가기 178개, 금액 파싱 77개, 메모·중복 방지 57개,
카카오 수정 플로우 130개, 핵심 쓰기 110개)를 모두 다시 통과시켰습니다.

## 3. SQL 검토

`02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql` 은 **새 RPC 를 만들지 않습니다.**
`accountbook_purge_household_v227` 는 이미 `schema_v22_7_0_auth_atomicity.sql` 에
정의돼 있고 `/ready` 필수 목록에도 있습니다. 이 파일은 그 정의만 바꿉니다.

기존 정의와 직접 대조한 실제 차이는 **세 가지**입니다.

| 변경 | 내용 | 검토 |
|---|---|---|
| `set search_path = public` → `''` | SECURITY DEFINER 함수의 search_path 하이재킹 방지 | 본문의 표 참조가 전부 `public.` 으로 정규화돼 있고, 쓰이는 함수(`to_regclass`·`left`·`strpos`·`btrim`·`jsonb_build_object`)는 `pg_catalog` 소속이라 빈 search_path 에서도 해석됨 — **안전** |
| 삭제 키 3종 추가 | `report_challenge:`·`goals:v5:`·`favorites:v5:<id>:` | 가계부를 지워도 남던 설정 — **실제 누락 보완** |
| 적용 후 확인 조회 | `purge_rpc_count` 가 1인지 | 데이터를 바꾸지 않음 |

키 형식이 앱이 실제로 쓰는 것과 같은지 코드와 대조했습니다.

| 키 | 앱이 만드는 형식 | SQL 방식 | 일치 |
|---|---|---|---|
| `report_challenge:` | `report_challenge:<householdId>` | 정확히 일치 | ✅ |
| `goals:v5:` | `goals:v5:<householdId>` | 정확히 일치 | ✅ |
| `favorites:v5:` | `favorites:v5:<householdId>:<userKey>` | 접두 일치 | ✅ |

`favorites` 는 뒤에 사용자 키가 붙으므로 정확히 일치로 지웠다면 아무것도 안 지워집니다.
SQL 이 접두 일치를 쓰는 것이 맞습니다.

파괴적 문장(`drop`·`truncate`)은 없고, 실행 권한은 `service_role` 에만 주고
`public`·`anon`·`authenticated` 에서 회수합니다.

## 4. 시크릿 검토

새 환경변수 3개가 생겼고 **셋 다 넣지 않아도 지금 그대로 동작합니다.**

| 이름 | 기본값 | 동작 |
|---|---|---|
| `KAKAO_SKILL_SECRET` | 없음 | 비우면 `/skill` 은 지금처럼 열려 있음 |
| `KAKAO_SKILL_AUTH_REQUIRED` | `0` | `1` 이면 비밀값이 비었을 때 준비 실패로 잡음 |
| `HOUSEHOLD_CREATE_LEASE_SECONDS` | `30` | 가계부 생성 잠금 임대 시간 |

가장 위험한 지점은 **기본값이 닫힘이면 배포 즉시 카카오 채널이 통째로 죽는다**는 것입니다.
그래서 이 동작을 실제로 요청을 보내 확인했습니다.

| 상황 | 응답 |
|---|---|
| 비밀값 없음 | **200** (기존과 동일) |
| 비밀값 있음 · 헤더 없음 | 403 |
| 비밀값 있음 · 틀린 값 | 403 |
| `x-api-key` (OpenBuilder 기본) | 200 |
| `x-kakao-skill-secret` | 200 |
| `Authorization: Bearer …` | 200 |

비교는 상수 시간(`constantTimeTextEqual`)이고, 차단 응답과 `/health` 응답에
비밀값이 섞이지 않는 것을 확인했습니다. `/health` 는
`skill_caller_auth_configured` 로 **설정 여부만** 알립니다.

## 5. 함께 검토한 나머지 변경

| 항목 | 검토 |
|---|---|
| `/ready` 필수 10 · 선택 1 분리 | `accountbook_categories` 는 설정 저장소 대체 경로가 있어 없어도 동작 — 선택으로 두는 것이 맞음. `/ready` 가 11개를 보고하는 것을 실측 |
| 가계부 생성 잠금 → Supabase 임대 | 프로세스 메모리 잠금은 Worker 인스턴스가 여러 개면 무의미. 임대 전환이 맞음. 미획득 시 생성하지 않고, 끝나면 반납 |
| 저장 식별자 난수화 | `Date.now()+Math.random()` → `crypto.getRandomValues`. 시간 기반 식별자가 남지 않는 것을 확인 |
| `pending`·`blocked` 지출자 차단 | 주요 쓰기 경로 15곳에 적용 |
| 인증 제한 DB 실패 시 실패-폐쇄 | 보호 장치가 죽었을 때 열어 두지 않음 |
| 관리자 거래 API 400 검증 | 잘못된 JSON·유형·금액·날짜·비활성 지출자 거절 |
| 캘린더 도트·날짜 상세·챌린지 3종 | 기능 확장. `can_write`·`can_edit` 로 권한 분기 |

## 6. 기존 검사 2건을 갱신했습니다

받은 작업이 계약을 바꿔 기존 검사 2건이 실패했습니다. 둘 다 **의도된 변경**이라
검사를 새 계약에 맞췄고, 의도를 잃지 않도록 확인 항목을 늘렸습니다.

| 검사 | 왜 실패했나 | 갱신 |
|---|---|---|
| V22.8.49 `day details provide a record-add action` | 기록 추가 버튼이 기본 `hidden` 이 되고 권한이 있을 때만 노출 | 버튼 존재 + `can_write` 노출 로직 + API 가 `can_write` 를 준다는 것까지 확인 |
| V22.8.58 `day slots expose a textual success/spend state` | 챌린지 3종 확장으로 문구가 유형별 라벨로 일반화 | 무지출은 기존 문구 유지 + 나머지 유형이 각자 라벨을 갖는 것 확인 |

## 7. 바이트 고정을 의도적으로 갱신했습니다

`mobile-home` 스타일시트는 SHA-256 으로 고정돼 있습니다.
받은 작업이 캘린더 기록 도트를 넣으며 이 파일을 건드렸습니다.

내용 차이를 직접 확인한 결과 **`.calRecordDot` 두 줄이 전부**였고,
`<i class="calRecordDot" aria-hidden="true">` 를 실제로 그리기 위한 것이라
고정값을 갱신하고 그 이유를 검사 파일에 주석으로 남겼습니다.

## 8. 성능·자원

| 항목 | 예산 | 실측 | 여유 |
|---|---|---|---|
| 기준 픽스처 홈 HTML | 35,840 B | 35,065 B | 775 B |
| 200행 실사용 홈 HTML | 45,056 B | 44,654 B | 402 B |

| 자원 | 이전 | 이번 |
|---|---:|---:|
| `accountbook-shell-*.css` | 151,228 B (`v22872`) | 153,827 B (`v22873`) |
| `mobile-home-*.css` | 51,806 B (`v22810`) | 51,943 B (`v22873`) |
| `accountbook-v5-*.js` | 66,xxx B (`v22861`) | 68,684 B (`v22873`) |

> ⚠️ 실사용 여유가 **402 B** 로 더 줄었습니다. 이 수치는 픽스처가 날짜 기준이라
> 측정일에 따라 흔들리므로, 다음 변경에서 카드 마크업이 조금만 커져도 예산을
> 넘길 수 있습니다. **예산 재검토가 시급합니다.**

## 9. 자동 검사

- 신규 회귀 **49개** (`validation/validate-skill-auth-purge-v22873.mjs`)
- 저장소 전체 **2,673개** 자동검사 통과
- ESM `default.fetch` 확인, 체크섬 매니페스트 일치

신규 회귀도 **결함을 되돌려** 실제로 잡히는지 확인했습니다.

- `/skill` 기본값을 닫힘으로 되돌림 → `비밀값이 없으면 기존처럼 열려 있다` 실패
- purge SQL 에서 `report_challenge:` 제거 → `삭제 시 report_challenge: 설정도 지운다` 실패

신규 회귀가 고정하는 것:

- 비밀값이 없으면 `/skill` 이 **지금처럼 열려 있다** (배포로 채널이 죽지 않는다)
- 비밀값을 켜면 헤더 3종을 받고 틀린 값은 막으며, 응답에 비밀값이 새지 않는다
- 켜기로 해 놓고 값을 빼먹은 배포는 구성 미비로 잡힌다
- `/ready` 가 필수 10개·선택 1개를 나눠 보고한다
- 가계부 생성 잠금이 DB 임대이고 프로세스 메모리 잠금이 남지 않는다
- 저장 식별자가 암호학적 난수다
- purge SQL 이 지우는 키 형식이 앱이 쓰는 형식과 같다
- purge SQL 에 파괴적 문장이 없고 실행 권한이 `service_role` 로 제한된다

## 10. 운영 변경

- **신규 SQL 있음**: `02_APPLY_HOUSEHOLD_PURGE_V22_8_71.sql` 수동 검토·적용 필요
- **신규 환경변수 3개**: 전부 선택, 넣지 않으면 현재 동작 유지
- Kakao Developers·OpenBuilder: `/skill` 인증을 쓸 때만 헤더 추가
- immutable 자원 주소 `v22873` 로 변경 (웹 탭 새로고침 필요)

## 배포 후 확인 부탁드립니다

1. `/health` 의 `skill_caller_auth_configured`
2. `/ready` 가 표 11개·RPC 17개와 함께 `ready=true`
3. 캘린더의 기록 도트, 날짜 상세의 수정·삭제·기록 추가
4. 챌린지 3종(무지출·하루 한도·분류별 한도)
5. 카카오톡 `수정 01번 금액 3만5천원` 과 연속 삭제 후 두 건 복구 (V22.8.71 유지 확인)
6. 아무 화면에서 Tab 한 번 → `본문 바로가기` (V22.8.72 유지 확인)
7. 오래 열어 둔 웹 탭 새로고침 후 `v22873` 자원 적용

> `/skill` 인증을 쓰려면 **OpenBuilder 헤더를 먼저** 넣고 확인한 뒤
> Worker 에 `KAKAO_SKILL_SECRET` 을 넣으십시오. 반대로 하면 그 사이 채널이 403 으로 막힙니다.

> 이 저장소 작업에서는 SQL 실행과 운영 배포를 수행하지 않았습니다.
