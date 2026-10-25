# 변경안: 환불을 원래 지출에 연결해 정산·지출에서 빼기 (V44:D-5 + V76:M-7, P2)

V22.9.78 에 넣은 **변경안**이다. 코드와 DB 는 아직 바꾸지 않았다.
**운영 DB 변경(새 표·트리거·RPC 2개·권한)이 필요하다. 운영자 승인 전에는 적용하지 않는다.**
2026-10-23 운영자 결정: 원지출과 명시적으로 연결된 환불만 정산에서 뺀다. 일반 수입을 한꺼번에 빼거나 과거 기록을 한꺼번에 바꾸지 않는다. 연결이 불분명한 항목은 확인 대상으로 남긴다.
경로는 `src/modules/` 를 뺐고, 줄 번호는 V22.9.78 작업 중(ee625ac) 기준이다.

## 먼저 정해 주실 것

4. 연결·해제는 소유자·관리자만 할까요(제안)? 환급을 기록한 본인도 할 수 있게 할까요?
5. 정산을 완료한 달의 환급은 연결을 막을까요(제안, 지금 미리보기와 같음)? 허용하고 ‘완료 뒤 바뀜’으로 보일까요?
6. 다른 달 원지출은 며칠 전 것까지 고를 수 있게 할까요(제안 365일)? 그 차감이 환불 달의 분류·예산 사용액을 줄여도 될까요?
7. ‘수입으로 두기’는 분류는 그대로 두고 확인 대상에서만 빼는 뜻인가요(제안)? 분류를 바꾸는 뜻인가요?
8. 기능을 켜는 시점과 카카오 정산 답장의 새 문구를 정해 주세요.
그리고 DDL·트리거·RPC 적용과 service_role 권한, 기능 플래그 켜기.

## 지금

- 환불은 수입·분류 ‘환급’으로 적힌다(`nlu/category-rules.js`). 가져오기의 음수 지출도 확인 표시와 함께 환급 수입이 된다(`import/flexible-import-parser.js:822-849`).
- 정산은 수입 행을 건너뛴다. 그래서 환불만큼 송금 방향·금액이 틀린다(D-5).
- `features/settlement-refund-preview.js` 는 미리보기뿐이다: 소유자·관리자만, 두 행이 같은 달, 받은 사람 = 환급 행의 user_id, 한도 초과·중복 거절, 완료된 달 409. 아무것도 저장하지 않는다.
  지금 거래 RPC 가 환불 관계·원본 변경·정산 완료를 원자적으로 지키지 못하기 때문이다. 정산 모델(`buildSettlementModel`)은 이미 연결 목록을 받을 수 있다.
- 정산 완료 저장은 행을 잠금 밖에서 읽고 digest(지출 [id, amount, user_id])를 비교한 뒤 설정 잠금 안에서 `settlement_history:<hid>`(v2)를 쓴다.
- 카카오 정산 답장은 지출만 읽고 “환급은 빼지 않아요”라고 안내한다(V76 K-14).

## 데이터 모델 — 권장: 새 연결 표

환불 하나에 지출 여럿, 부분 금액 연결이 되고, transactions 열·select·운영 RPC 본문을 건드리지 않으며, 거래를 지우면 연결도 함께 지워진다.
반대안(transactions.refund_of_id 열)은 1:1 전액만 되고 모든 거래 읽기·쓰기를 바꿔야 한다.

검토용 초안(실행 금지, 운영 정의 확인 전). 구현을 시작하면 `docs/db-review/v22978/` 에 V61 방식(첫 줄 실행 차단문)으로 옮기고 로컬 PostgreSQL 로 시험한다.

```sql
BEGIN;
DO $review_only$ BEGIN RAISE EXCEPTION 'v78_review_only_refund_links_approval_required'; END $review_only$;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s';
CREATE TABLE public.accountbook_refund_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  refund_id  uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 2000000000),
  created_by uuid,  -- users FK 없음(사용자 합치기·탈퇴와 엮지 않음)
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (expense_id <> refund_id),
  UNIQUE (expense_id, refund_id)
);
CREATE INDEX accountbook_refund_links_refund_idx ON public.accountbook_refund_links (refund_id);
CREATE INDEX accountbook_refund_links_household_idx ON public.accountbook_refund_links (household_id);
ALTER TABLE public.accountbook_refund_links ENABLE ROW LEVEL SECURITY;  -- 정책 없음
REVOKE ALL ON public.accountbook_refund_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.accountbook_refund_links TO service_role;  -- 쓰기는 아래 RPC 로만
COMMIT;
```

- 받은 사람·달 열은 두지 않는다. 받은 사람은 환급 행의 user_id, 그 달 연결은 그 달 환급 행 id 로 조회한다(환급이 없는 달은 요청이 늘지 않는다).
- `runtime/config-readiness.js` 의 선택 표 목록에 넣는다. 표나 RPC 가 없으면 지금의 미리보기 안내로 돌아간다.

## 원자적 보호

새 RPC 2개(SECURITY DEFINER, search_path 고정, EXECUTE 는 service_role 만):
`accountbook_link_refund_v22978(p_household_id, p_actor_user_id, p_expense_id, p_refund_id, p_amount, p_expected jsonb)`,
`accountbook_unlink_refund_v22978(p_household_id, p_actor_user_id, p_link_id, p_expected_amount)`.

연결 RPC:
1. 두 거래 행을 id 순서로 `FOR UPDATE`(교착 방지). 같은 가계부인지, actor 가 소유자·관리자인지 본다.
2. 화면이 본 값(p_expected)과 두 행의 금액·유형·분류·user_id·날짜를 비교한다. 다르면 `refund_link_source_changed`.
3. 지출은 expense, 환급은 income 이고 분류 ‘환급’. 환급 날짜 ≥ 지출 날짜, 기간 한도 안.
4. 금액 한도: 그 지출의 연결 합 + 금액 ≤ 지출 금액, 그 환급의 연결 합 + 금액 ≤ 환급 금액. 넘으면 `refund_link_amount_exceeded`(행 잠금으로 동시 연결도 차례로).
5. 환급 달이 정산 완료면 `refund_link_month_completed`(`settlement_history:<hid>` 를 FOR SHARE 로 읽음, 미리보기와 같은 규칙).
6. `accountbook_transaction_audit` 에 환급 행 기준 'update' 기록(검사 제약은 바꾸지 않음).
해제 RPC 는 금액을 비교한 뒤 지우고, 완료된 달이면 거절한다.

기존 수정 경로는 트리거로 막는다: `refund_link_guard_v22978` BEFORE UPDATE OF type, amount, category, household_id, transaction_date ON public.transactions.
연결된 행이면 유형·가계부 변경, 금액을 연결 합보다 줄이기, 환급 행 분류 변경, 날짜 순서를 깨는 변경을 `refund_link_*` 로 거절한다.
RPC 본문 대신 트리거로 하는 이유: 수정 RPC v227·일괄·관리자 REST·되돌린 옛 Worker 까지 한 곳에서 막고, 저장소에 없는 운영 RPC 본문을 고치지 않아도 된다.
거래 삭제·가계부 삭제(purge)는 FK 연쇄 삭제로 연결도 지워진다(purge·merge·leave·import 본문 변경 없음).

정산 완료와 맞추기:
1. 연결·해제는 Worker 가 설정 잠금(`withHouseholdSettingsRmw`) 안에서 RPC 를 부른다.
2. 완료 저장은 잠금을 잡은 뒤 행과 연결을 다시 읽어 모델과 digest 를 다시 만든다(지금 잠금 밖 읽기를 안으로).
3. digest 에 연결 [id, expense_id, refund_id, amount] 와 연결된 환급 행 [id, amount, user_id] 를 넣는다. 이력 v3 에 refund_total·refund_links. v2 이력은 그대로 읽는다.
4. 완료 뒤 연결된 기록의 수정·삭제는 막지 않는다(일반 지출과 같음). 정산 화면이 이력 digest 와 견줘 ‘완료 뒤 바뀐 기록 있음’을 보인다.
남는 틈: 일반 기록 수정은 잠금 밖이라 완료 순간과 겹칠 수 있다(지금과 같은 수준).

## 화면

- **웹 정산 화면**(`/settlement-summary`, 옛 별칭도 같은 모델): 그 달 환급 행을 보인다.
  연결됨 “10/12 쿠팡 환불 32,000원 → 10/03 쿠팡 주문 89,000원(생활)에서 뺐어요 [연결 풀기]”,
  확인 대상 “10/12 쿠팡 환불 +32,000원 · 받은 사람 B / 원래 지출을 고르면 정산과 지출 합계에서 뺍니다 [원래 지출 고르기] [수입으로 두기]”, 일부 연결 “남은 12,000원 확인 대상”.
  보고 있는 달만 보이고, 과거 기록을 한꺼번에 바꾸지 않는다.
- **원래 지출 고르기**: 미리보기 경로를 고르기 화면으로. 후보는 같은 가계부의 지출, 날짜 ≤ 환급 날짜, 기간 한도 안. 같은 내용·같은 결제수단·금액 ≥ 환급 순. 금액 기본값 = min(환급 남은 액, 지출 남은 액).
- **수입으로 두기**: 세금 환급 같은 진짜 수입용. 분류는 그대로, 설정 `refund_review_kept:<hid>` 에 넣어 확인 대상에서 뺀다.
- **기록 화면**: 환급 행에 “원래 지출과 연결”, 연결된 지출에 “환불 N원 연결됨”. 트리거 거절 문구 “환불과 연결된 기록이라 금액을 연결액보다 줄일 수 없어요. 연결을 먼저 풀어 주세요.”(웹·관리자·카카오 수정 공통).
- **권한·카카오**: 연결·해제는 소유자·관리자만, 구성원은 상태만 본다. 카카오에서는 연결하지 않는다(후보 목록이 길다). 알림센터에 이번 달 “연결할 환급 N건” 정보 알림.

## 계산 — 환불이 들어온 달에서 뺀다

정산(환급 날짜의 달 M): 총액 = M 지출 합 − 환급 날짜가 M 인 연결 합. 받은 사람(환급 행 user_id)의 낸 돈에서 −연결액. 몫은 M 의 분배 방식으로.
품목별 방식은 원지출이 M 에 있으면 그 품목에서 빼고, 다른 달이면 “환불: 9월 쿠팡 −40,000” 줄을 따로 둔다(참여자 기본값 전체).

- 같은 달: A 가 100,000 을 쓰고 A 가 40,000 을 돌려받음, 균등 2명 → 총 60,000, B→A 30,000(지금은 50,000). D-5 재현 `review-artifacts/v22944-audit/money/m1-settlement.mjs` 의 기대와 같다.
- 다른 달: 9월 A 100,000, 정산 완료(B→A 50,000). 10월 환급 40,000 연결 → 10월 총액 −40,000, A→B 20,000. 합치면 B 부담 30,000 = 순지출 60,000 의 절반.
- 총액이 음수여도 계산·송금을 그대로 낸다. 잔액 0 은 ‘정산 차액 없음’(D3 계약).

리포트·분석·예산·카카오 요약(달 M): 지출 −L, 수입 −L(연결된 몫만), 잔액은 그대로. 차감은 원지출의 분류·지출자에, 날짜는 환급 날짜에. 표시 “지출 N원 (환불 차감 L원 반영)”.
분류·일별 그래프는 0 아래로 그리지 않고 차감을 한 줄로 따로 적는다. 연결 안 된 환급은 지금처럼 수입.
구현은 domain 에 `applyRefundLinkNetting(rows, links)`(연결 몫을 뺀 환급 행 + {type:"expense", amount:−L, source:"refund_link"} 차감 행). amount>0 으로 거르는 곳(리포트·expenseDays·budgetSummary)은 차감 행을 따로 다룬다.

이 방식을 고른 이유: 연결해도 한 달만 바뀌고 다른 달의 잔액·닫힌 달·완료 이력·월 리포트 스냅숏을 건드리지 않는다. 원지출 달이 이미 정산 완료여도 다음 정산이 바로잡는다. 카드 취소가 취소한 달에 찍히는 것, CSV 가져오기가 음수 행을 그 날짜의 환급으로 넣는 것과 같다. 같은 달이면 두 방식의 결과가 같다.
대가: 다른 달 환불은 M 의 분류·예산 사용액을 줄인다(음수는 표시에서 0 으로 멈춤).

## 그 밖의 영향

- **백업 CSV**: 열은 그대로(W-10 결정), 연결은 내보내지 않는다. 복원은 새 id 를 만들어 복원된 환급은 확인 대상으로 돌아온다. 백업 화면에 한 줄 “환불 연결은 CSV에 담기지 않아요. 복원하면 환불은 다시 ‘확인 대상’이 됩니다.”
- **관리자 JSON 백업**: id 를 유지하므로 refund_links 를 선택 키로 더하고, 적용 뒤 두 id 가 모두 있으면 RPC 로 다시 연결(없으면 “연결 못 살림 N건”).
- **카카오**: 정산 답장이 환급 행과 연결도 읽는다. “연결한 환불 L원은 이 정산에서 뺐어요. 원래 지출을 고르지 않은 환급 K건은 빼지 않았어요. 웹 정산 화면에서 고를 수 있어요.” 음수 총액은 설명 문구로. 이번 달 요약에 “환불 차감 L원”. 삭제 취소로 같은 id 가 되살아나도 연결은 이미 지워져 확인 대상으로 돌아온다.
- **리포트 스냅숏**: 과거 달 환급을 연결하면 그 달 스냅숏을 다시 만들기 목록에 넣는다.

## 순서

0. Aside 읽기 전용 확인(“읽기만, 아무것도 바꾸지 말 것”, 새 쿼리 탭): 달별 환급 행 수, amount ≤ 0 거래 수, public.transactions 트리거 목록, 수정·삭제·일괄 RPC v227 의 운영 정의.
1. 검토용 SQL(표·트리거·RPC 2개·권한)을 만들고 로컬 PostgreSQL 로 시험(V61 방식).
2. 운영자 승인 뒤 Aside 가 DDL 적용. 아무도 쓰지 않는 추가형이라 V22.9.77·78 Worker 와 함께 돌아가도 된다.
3. Worker: readiness, 읽기, 정산 계산, digest v3, 잠금 안 재읽기, 오류 문구. 환경 플래그 기본 꺼짐.
4. 화면: 정산 연결 칸, 고르기 화면, 기록 화면, 알림.
5. 리포트·예산·카카오의 차감과 문구.
6. 운영자 결정으로 플래그를 켠다.
Worker 를 되돌려도 DDL 은 남겨 둔다(트리거가 옛 Worker 의 잘못된 수정도 막는다). 되돌리기 대상은 version id 로만 적는다.

## 시험

- 새 검사 `validation/validate-refund-links-v22978.mjs`: 정산(같은 달·다른 달·부분 연결·환급 하나→지출 둘·품목별·음수 총액·잔액 0), digest 가 연결에 따라 바뀜, 완료 달 연결 거절, 리포트 차감(지출·수입·잔액·분류 0 고정), 카카오 문구, CSV 열 그대로, 복원 뒤 확인 대상, 표가 없을 때 옛 안내.
  옛 동작에서 실패할 근거: 같은 달 예가 지금은 B→A 50,000.
- 고칠 기존 검사: validate-bot-refund-preview-v22954(다른 달 거절), validate-d3-refund-guidance-v22958, validate-kakao-income-fixes-v22976.
- SQL(로컬 PostgreSQL): 두 세션이 동시에 연결해 한도를 넘으면 하나만 성공, 금액 축소·유형 변경 거절, 삭제·purge 에서 연결 연쇄 삭제, anon·authenticated 거절.

## 위험

- 운영 RPC·트리거 본문을 아직 보지 못했다(0단계에서 확인).
- 트리거 거절이 옛 경로에서는 일반 오류로 보인다.
- 분류·예산에 음수가 생길 수 있어 표시를 처리해야 한다.
- 배포할 때 열려 있던 정산 화면은 digest 가 바뀌어 한 번 ‘settlement_changed’ 가 뜬다.
- 환급 행이 있는 달은 요청이 1개 는다.
- 세금 환급도 확인 대상에 뜬다(‘수입으로 두기’로 해소).
