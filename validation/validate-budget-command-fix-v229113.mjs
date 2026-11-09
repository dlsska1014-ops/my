// V22.9.113 예산 명령 검사: Gemini 감사 ①(‘동아리 예산 회식 50000원’이 예산 명령에 걸려 지출로 기록되지 않음)은 결함이 아니라
//  ‘모호한 예산 말은 저장하지 않고 다시 묻는다’는 설계(validate-kakao-intent-skill-auth-v22876)다. 지출로 짐작해 저장하는 수정안(분류 두 낱말↑면
//  지출, 백스톱을 ‘예산 바로 뒤 숫자’로 좁힘)은 ‘식비 예산 매달 30만원’·‘예산 카페 간식 5만원’·사용자 분류 ‘예산 아이 학원 30만원’ 같은 예산 말을
//  30만원 지출로 저장하는 회귀가 있어 넣지 않았다(review-artifacts/v113-budget-command-fix-2026-11-09/). 이 판은
//  (1) 모호한 말(분류가 두 낱말 이상)에는 ‘‘예산’ 말을 빼고 보내 달라’는 한 줄을 덧붙이고, (2) ‘월 예산 200만원’이 분류 ‘월’로 읽혀
//  ‘등록된 카테고리를 찾지 못했어요’가 되던 것을 전체 예산으로 고쳤다. 판 이름 글자는 적지 않는다(‘판 번호 정본’ 검사).
//  오프라인: 모듈 직접 호출 + 카카오 스킬 끝단(픽스처), DB·바깥 요청 없음.
import { readFileSync } from "node:fs";
import { counter, fixture, skill, withClock } from "./lib-audit-v22934.mjs";
import { parseDirectBudgetSetCommand } from "../src/modules/kakao/household-budget-commands.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { ok, eq, done } = counter("V22.9.113 예산 명령 다시 묻기·안내 문구·월 예산 검사 통과");

const HINT = "‘예산’ 말을 빼고 ‘점심 12000원’처럼 보내 주세요.";
const NOT_FOUND = "등록된 카테고리를 찾지 못했어요.";
const OWNER_ONLY = "예산은 가계부 소유자 또는 관리자만 설정할 수 있어요.";

// ── 파서: 예산 명령은 그대로 받고, ‘예산’이 든 말은 지출(null)로 넘기지 않는다 ─────────
const b = (t) => { const r = parseDirectBudgetSetCommand(t); return r ? `${r.category} ${r.amount}` : null; };
eq(b("월 예산 200만원"), "__total 2000000", "'월 예산 200만원' → 전체 예산(예전엔 분류 '월'이 되어 카테고리를 못 찾음)");
eq(b("전체 예산 300만원"), "__total 3000000", "'전체 예산 300만원' → 전체 예산 그대로");
eq(b("총 예산 100만원"), "__total 1000000", "'총 예산 100만원' → 전체 예산 그대로");
eq(b("예산 50만원"), "__total 500000", "'예산 50만원' → 전체 예산 그대로");
eq(b("식비 예산 30만원"), "식비 300000", "'식비 예산 30만원' → 식비 예산 그대로");
eq(b("예산 식비 300000"), "식비 300000", "'예산 식비 300000' → 식비 예산 그대로(도움말의 꼴)");
eq(b("식비 예산설정 30만원"), "식비 300000", "'식비 예산설정 30만원' → 식비 예산 그대로");
eq(b("식비 예산 300.000원"), "식비 300000", "'식비 예산 300.000원' → 300000(Q-2 점 천단위 그대로)");
eq(b("이번달 식비 예산 30만원"), "식비 300000", "달 힌트 붙은 예산 명령 그대로");
eq(b("예산 카페 간식 5만원"), "카페/간식 50000", "'예산 카페 간식 5만원' → 카페/간식 예산(두 낱말 별칭도 예산 명령 그대로)");
eq(b("동아리 예산 회식 50000원"), "동아리 회식 50000", "'동아리 예산 회식 50000원' 은 지출(null)로 넘기지 않는다(처리기가 저장하지 않고 다시 묻는다)");
eq(b("식비 예산 매달 30만원"), "식비 매달 300000", "'식비 예산 매달 30만원' 도 지출(null)로 넘기지 않는다");
eq(b("점심 12000원"), null, "'점심 12000원' 은 예산 명령이 아니다");

// ── 카카오 스킬 끝단: 저장하지 않고 다시 묻기 + 안내 한 줄 + 예산 설정 그대로 ─────────
// 사용자 분류 ‘아이 학원’은 두 모드에 다 심는다: 분류 표(accountbook_categories)와, 표가 없는 운영 모드(AB_QA_CATEGORIES_ABSENT=1)가 읽는
// 설정 행 custom_categories:<가계부>(normalizeStoredCategoryList 꼴 [{name,type}]).
const CUSTOM = { id: "cat-v113-custom", household_id: "house-home", name: "아이 학원", type: "expense", sort_order: 1, created_at: "2026-07-01T00:00:00Z" };
function seed(fx) {
  fx.db.accountbook_settings.push({ id: "sel-v113-bin", key: "kakao_selected_household_v2251:user-bin", value: "house-home", created_at: "2026-07-01T00:00:00Z" });
  fx.db.accountbook_settings.push({ id: "sel-v113-wifi", key: "kakao_selected_household_v2251:user-wifi", value: "house-home", created_at: "2026-07-01T00:00:00Z" });
  fx.db.accountbook_settings.push({ id: "cat-v113-settings", key: "custom_categories:house-home", value: JSON.stringify([{ name: CUSTOM.name, type: CUSTOM.type }]), created_at: "2026-07-01T00:00:00Z" });
  fx.db.accountbook_categories = fx.db.accountbook_categories || [];
  fx.db.accountbook_categories.push({ ...CUSTOM });
}
function makeRun(fx, user) {
  return async function run(utterance) {
    const before = (fx.db.transactions || []).length;
    const budgetsBefore = JSON.stringify((fx.db.accountbook_budgets || []).map((row) => [row.month, row.category, row.amount]).sort());
    const r = await skill(fx, utterance, { user });
    const added = (fx.db.transactions || []).length - before;
    const budgetsAfter = JSON.stringify((fx.db.accountbook_budgets || []).map((row) => [row.month, row.category, row.amount]).sort());
    const budget = (month, category) => (fx.db.accountbook_budgets || []).find((row) => row.month === month && row.category === category);
    return { text: String(r == null ? "" : r), added, budgetChanged: budgetsBefore !== budgetsAfter, budget };
  };
}

// 소유자(user-bin): 가계부 둘이라 선택 행을 둔다.
await withClock("2026-07-15", () => fixture(async (fx) => {
  seed(fx);
  const run = makeRun(fx, "kakao_login:2265");

  const mixed = await run("동아리 예산 회식 50000원");
  eq(mixed.added, 0, "소유자 '동아리 예산 회식 50000원' 은 지출로 저장되지 않는다(설계: 다시 묻기)");
  ok(!mixed.budgetChanged, "소유자 '동아리 예산 회식 50000원' 은 예산도 바꾸지 않는다");
  ok(mixed.text.startsWith(NOT_FOUND), "소유자 모호한 말의 답은 ‘등록된 카테고리를 찾지 못했어요’ 로 시작한다");
  ok(mixed.text.includes(HINT), "소유자 모호한 말의 답에 ‘‘예산’ 말을 빼고 … 보내 주세요’ 한 줄이 있다");
  ok(mixed.text.includes("‘예산설정’을 입력해 단계별로 선택해 주세요."), "소유자 모호한 말의 답에 예산설정 안내가 그대로 있다");

  const company = await run("회사 예산 회의 5000");
  eq(company.added, 0, "소유자 '회사 예산 회의 5000' 은 지출로 저장되지 않는다(v22876 설계 그대로)");
  ok(company.text.includes(HINT), "소유자 '회사 예산 회의 5000' 답에도 되돌아갈 길이 있다");

  for (const utterance of ["식비 예산 다음달부터 30만원", "식비 예산 매달 30만원", "식비 예산 이번달 30만원"]) {
    const r = await run(utterance);
    eq(r.added, 0, `소유자 '${utterance}' 은 30만원 지출로 저장되지 않는다(가드 수정안의 회귀 막기)`);
    ok(r.text.includes("예산"), `소유자 '${utterance}' 답은 예산 안내다`);
  }

  const alias = await run("예산 카페 간식 5만원");
  eq(alias.added, 0, "소유자 '예산 카페 간식 5만원' 은 지출이 아니다");
  ok(alias.text.includes("카페/간식 예산을 설정했어요"), "소유자 '예산 카페 간식 5만원' 은 카페/간식 예산을 설정한다(두 낱말 별칭)");
  eq(alias.budget("2026-07", "카페/간식")?.amount, 50000, "카페/간식 2026-07 예산이 50,000원이 된다");

  const custom = await run("예산 아이 학원 30만원");
  eq(custom.added, 0, "소유자 '예산 아이 학원 30만원' 은 지출이 아니다");
  ok(custom.text.includes("아이 학원 예산을 설정했어요"), "소유자 '예산 아이 학원 30만원' 은 사용자 분류 ‘아이 학원’ 예산을 설정한다");
  eq(custom.budget("2026-07", "아이 학원")?.amount, 300000, "아이 학원 2026-07 예산이 300,000원이 된다");

  const monthly = await run("월 예산 200만원");
  eq(monthly.added, 0, "소유자 '월 예산 200만원' 은 지출이 아니다");
  ok(monthly.text.includes("전체 월 예산을 설정했어요"), "소유자 '월 예산 200만원' 은 전체 월 예산을 설정한다(예전: 등록된 카테고리를 찾지 못했어요)");
  eq(monthly.budget("2026-07", "__total")?.amount, 2000000, "전체 2026-07 예산이 2,000,000원이 된다");

  const oneWordUnknown = await run("간식 예산 5만원");
  eq(oneWordUnknown.added, 0, "소유자 '간식 예산 5만원'(등록 안 된 한 낱말 분류)은 지출이 아니다");
  ok(oneWordUnknown.text.startsWith(NOT_FOUND), "한 낱말 분류를 못 찾으면 예전 답으로 시작한다");
  ok(!oneWordUnknown.text.includes(HINT), "한 낱말 분류의 답에는 ‘‘예산’ 말을 빼고’ 한 줄을 붙이지 않는다(예전 답 그대로)");

  const food = await run("식비 예산 30만원");
  eq(food.added, 0, "소유자 '식비 예산 30만원' 은 지출이 아니다");
  ok(food.text.includes("식비 예산을 설정했어요"), "소유자 '식비 예산 30만원' 은 식비 예산을 설정한다");
  ok(!food.text.includes(HINT), "정상 예산 설정 답에는 안내 한 줄이 없다");

  const plain = await run("점심 12000원");
  eq(plain.added, 1, "대조군 '점심 12000원' 은 지출로 저장된다");
}));

// 구성원(user-wifi): 예산 권한 없음. 모호한 말에도 지출을 저장하지 않고 되돌아갈 길을 준다.
await withClock("2026-07-15", () => fixture(async (fx) => {
  seed(fx);
  const run = makeRun(fx, "kakao_login:2266");

  const mixed = await run("동아리 예산 회식 50000원");
  eq(mixed.added, 0, "구성원 '동아리 예산 회식 50000원' 은 지출로 저장되지 않는다");
  ok(mixed.text.startsWith(OWNER_ONLY), "구성원 모호한 말의 답은 권한 안내로 시작한다");
  ok(mixed.text.includes(HINT), "구성원 모호한 말의 답에 ‘‘예산’ 말을 빼고 … 보내 주세요’ 한 줄이 있다");

  for (const utterance of ["식비 예산 매달 30만원", "식비 예산 다음달부터 30만원", "예산 카페 간식 5만원", "예산 아이 학원 30만원"]) {
    const r = await run(utterance);
    eq(r.added, 0, `구성원 '${utterance}' 은 지출로 저장되지 않는다(가드 수정안에서는 30만원·5만원 지출이 됐다)`);
    ok(!r.budgetChanged, `구성원 '${utterance}' 은 예산도 바꾸지 못한다`);
  }

  const food = await run("식비 예산 30만원");
  eq(food.added, 0, "구성원 '식비 예산 30만원' 은 지출이 아니다");
  eq(food.text.trim(), OWNER_ONLY, "구성원 한 낱말 예산 명령의 답은 예전 권한 안내 그대로다(안내 한 줄 없음)");

  const plain = await run("점심 12000원");
  eq(plain.added, 1, "구성원 대조군 '점심 12000원' 은 지출로 저장된다");
}));

// ── 소스 대조 ─────────────────────────────────────────────────────
const hb = read("src/modules/kakao/household-budget-commands.js");
ok(hb.includes("(?:예산|설정|저장|등록|변경|수정|월|전체|총)(?=\\s|$)"), "파서 조기 반환이 월·전체·총도 떼어 낸다(‘월 예산 200만원’ → 전체)");
ok(!hb.includes("if (!/\\s/.test(withoutAmount)) return"), "파서에 ‘분류 두 낱말↑면 지출’ 가드가 없다(예산 말을 지출로 저장하는 회귀 막기)");
const sk = read("src/modules/kakao/skill-handler.js");
ok(sk.includes("/(?:^|\\s)예산(?=\\s|$)/.test(utterance)) return kakaoText(kakaoBudgetGuideText(origin))"), "백스톱은 ‘예산’+금액이면 저장하지 않고 안내하는 넓은 꼴 그대로다");
ok(sk.includes(HINT), "처리기에 ‘‘예산’ 말을 빼고 ‘점심 12000원’처럼’ 안내 한 줄이 있다");
ok(sk.includes('/\\s/.test(String(directBudget.category || ""))'), "안내 한 줄은 분류가 두 낱말 이상일 때만 붙는다");
const design = read("validation/validate-kakao-intent-skill-auth-v22876.mjs");
ok(design.includes("ambiguous budget intent creates no transaction"), "모호한 예산 말을 저장하지 않는 설계 검사(v22876)가 그대로 있다");

// 판 단일 출처
const versionTxt = read("VERSION.txt").trim();
const appVersion = (read("src/index.js").match(/const APP_VERSION = "([^"]+)"/) || [])[1];
ok(versionTxt === appVersion, `VERSION.txt 와 번들 APP_VERSION 이 같다 (${appVersion})`);

done();
