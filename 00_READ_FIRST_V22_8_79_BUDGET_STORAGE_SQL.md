# V22.8.79 예산 저장소 정합성 SQL 안내

적용 파일: `03_APPLY_BUDGET_STORAGE_V22_8_79.sql`

## 요약

- **SQL 파일 하나뿐입니다. `src/index.js` 는 한 줄도 바뀌지 않았습니다.**
- **아직 운영에 적용하지 않았습니다.** 이 저장소는 운영 DB 에 접근하지 않습니다.
  운영자가 Supabase SQL Editor 에서 실행해야 합니다.
- 실행하지 않아도 예산 화면은 지금처럼 동작합니다. 설정 JSON 폴백을 계속 탈 뿐입니다.
- Worker 배포와 순서를 맞출 필요가 없습니다. 적용 전에도 후에도 같은 Worker 가 그대로 돕니다.

> 이 파일의 내용은 V22.8.79 릴리스가 나갈 때 `SQL_HISTORY.md` 와 `KNOWN-ISSUES.md` 로
> 옮겨집니다. 지금 그 두 파일을 고치지 않은 이유는 `BUNDLE_FILE_CHECKSUMS_V22_8_78.sha256`
> 가 V22.8.78 트리를 고정하고 있어서, 거기 묶인 파일을 고치면 그 기록이 더 이상
> V22.8.78 을 가리키지 않게 되기 때문입니다.

## 무엇이 문제였나 — 예산이 두 곳에 나뉘어 저장되고 있었습니다

`src/index.js` 는 예산을 두 곳에 씁니다.

1. `public.accountbook_budgets` 표 (정본)
2. `public.accountbook_settings` 의 `budgets:<가계부ID>:<월>` JSON (폴백)

개별 저장(`handleBudgetSave`, `/admin/budget/save`)은 PostgREST 로 이렇게 보냅니다.

```
POST /rest/v1/accountbook_budgets?on_conflict=household_id,month,category
Prefer: resolution=merge-duplicates
```

이 세 열을 덮는 유니크 인덱스가 없으면 PostgREST 가 거절합니다.

```
42P10  there is no unique or exclusion constraint matching the ON CONFLICT specification
```

그러면 코드는 `catch` 로 넘어가 `saveSettingsBudget` 폴백에 씁니다. **화면에는 "저장됨"
이 뜨므로 겉으로는 아무 문제가 없어 보입니다.** 대신 `fetchBudgets` 가 매 요청마다 표와
설정을 둘 다 읽어 `mergeBudgetRows` 로 합치고 있습니다.

일괄 저장(`handleMyBudgetBulkSave`, `/my/budget-bulk/save`)은 RPC 로 표에 바로 씁니다.
그래서 **같은 가계부의 예산이 어느 경로로 저장했느냐에 따라 다른 곳에 있었습니다.**

로컬 PostgreSQL 16.13 에서 적용 전 upsert 가 실제로 42P10 으로 실패하고, 적용 후
성공하는 것을 확인했습니다.

## 이 SQL 이 하는 일

1. `public.accountbook_budgets` 가 없으면 만듭니다. 운영에는 이미 있을 것이므로 대개
   무동작입니다. **새로 만들 때만** RLS 를 켜고 `service_role` 전용으로 권한을 겁니다.
2. Worker 가 `select` 하는 열을 확인합니다. `household_id`·`month`·`category`·`amount`
   중 하나라도 없으면 **이름을 찍고 중단·롤백합니다**(사람 판단이 필요한 상황입니다).
   `id`·`created_at` 은 없으면 안전하게 추가합니다.
3. `(household_id, month, category)` 중복 행을 `created_at` 이 가장 늦은 1건만 남기고
   정리합니다. 동률이면 금액이 큰 쪽, 그래도 동률이면 물리 순서로 정합니다.
4. 같은 세 열의 유니크 인덱스를 만듭니다. **이미 같은 열 집합을 덮는 유니크가 있으면
   재사용하고 만들지 않습니다.** 열 순서는 상관없습니다 — PostgREST 의 `on_conflict` 은
   열 집합으로 추론합니다.
5. `budgets:<가계부ID>:<월>` 설정 JSON 을 표로 이관하고 그 키를 지웁니다.

## 하지 않는 일

- `drop`·`truncate` 없음. 기존 예산 금액을 바꾸지 않습니다.
- `accountbook_replace_budget_plan_v227` RPC 본문을 손대지 않습니다.
- **이미 있는 표의 RLS·권한을 바꾸지 않습니다.** 현재 상태는 사후점검이 보고만 하고,
  조일지 여부는 운영자가 판단합니다.
- `src/index.js` 의 폴백 코드를 지우지 않습니다. 그대로 두어야 적용 전에도 동작합니다.

## 실행 방법

Supabase SQL Editor 에 파일 전체를 붙여 넣고 한 번 실행합니다. 재시도해도 안전합니다
(멱등). 두 번째 실행은 중복 0건·이관 0건으로 끝납니다.

맨 아래 비변경 조회가 결과를 냅니다.

| 열 | 기대값 | 뜻 |
|---|---|---|
| `upsert_ready` | `true` | 이 값이 `true` 여야 개별 예산 저장이 표로 갑니다. **가장 중요합니다.** |
| `duplicate_groups` | `0` | 남은 중복 조합 |
| `leftover_settings_budget_keys` | 0 이 아니어도 정상 | 아래 "남기는 키" 참고 |
| `rls_enabled` | 보고만 | `false` 면 별도 판단 |
| `anon_or_authenticated_grants` | 보고만 | 0 초과면 별도 판단 |

## 알아 둘 것

- **금액이 0 이하이거나 분류가 빈 항목은 옮기지 않고 버립니다.** `budgetSummary`·
  `incomePlans`·`expensePlans` 가 모두 `amount > 0` 만 세므로 화면과 집계에서 이미
  무시되던 값입니다. 다만 `__income` 을 0원으로 저장해 둔 행이 있었다면 사라집니다.
- **표와 설정에 같은 분류가 서로 다른 금액으로 있으면 표 값이 남습니다.**
  `mergeBudgetRows` 가 이미 표를 우선하고 있어, 화면에 보이던 값이 유지되는 쪽입니다.
  설정 쪽 금액은 없어집니다.
- **남기는 키:** 가계부 ID 가 uuid 가 아니거나(`budgets:default:…`), 가계부가 이미
  삭제됐거나, JSON 이 깨졌거나 배열이 아닌 설정 키는 건드리지 않고 남깁니다.
  `leftover_settings_budget_keys` 가 그 개수입니다. 지우지 않으므로 나중에 사람이
  보고 판단할 수 있습니다.
- **유니크 인덱스가 생기면 같은 분류를 중복으로 넣는 저장은 이제 실패합니다.**
  `accountbook_replace_budget_plan_v227` 은 `p_rows` 를 중복 제거 없이 넣기 때문입니다.
  `handleMyBudgetBulkSave` 가 `normalizeText(분류)` 를 키로 하는 `Map` 으로 먼저
  합치므로 **앱에서 중복이 나가는 경로는 없습니다.** 앞뒤 공백·특수문자·대소문자·
  80자 공유 접두·이모지 절단까지 확인했습니다. 다른 경로로 이 RPC 를 직접 호출한다면
  중복 제거를 호출하는 쪽에서 해야 합니다.
- **표 저장 금액에 상한 검사를 걸지 않았습니다.** `handleBudgetSave` 가 금액을 clamp
  하지 않아서, 상한을 걸면 큰 입력이 표 저장에 실패해 다시 설정 폴백으로 갈라집니다.
  상한(20억)은 일괄 저장 RPC 가 이미 걸고 있습니다.
- **검증은 로컬 PostgreSQL 16.13 에서 했습니다. 운영 DB 의 실제 제약·RLS·데이터는
  확인하지 못했습니다.**

## 검증한 경로

로컬에 운영과 같은 형태(유니크 없음·중복 3행·폴백 JSON 8종)를 만들어 확인했습니다.

- 적용 전 upsert 가 42P10 으로 실패 → 적용 후 성공
- 표가 없는 환경에서 생성 경로(RLS 켜짐, `anon` 권한 없음)
- 열 순서가 다른 기존 유니크 제약을 재사용하고 인덱스를 새로 만들지 않음
- 필수 열 누락 시 이름을 찍고 중단·롤백(표 구조 그대로)
- 중복 3행 → `created_at` 최신 1건만 남음
- 표가 설정을 이김 / 빈 분류·0원·문자 금액 버림 / JSON 내부 중복은 큰 금액만
- `reserve_plans:` 등 예산과 무관한 설정 키는 그대로
- 이관 후 `accountbook_replace_budget_plan_v227` 왕복 정상
- 재실행 멱등

## 되돌리기

인덱스만 지우면 적용 전 동작으로 돌아갑니다. 이관된 예산은 표에 남고, 코드가 표를
우선하므로 화면 값은 그대로입니다.

```sql
drop index if exists public.accountbook_budgets_household_month_category_unique_v22879;
```

이관으로 지워진 설정 키는 이 명령으로 돌아오지 않습니다. 되돌릴 계획이 조금이라도
있으면 실행 전에 백업을 만드세요.
