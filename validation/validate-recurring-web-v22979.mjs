// V22.9.79 정기 항목 웹 검사 (V44 D-25 남은 부분, V76 W-3 남은 부분). 메모리 픽스처로 실제 화면을 그리고 브라우저가 보내는
// 폼 값(formFields)을 그대로 보내며 네트워크를 쓰지 않는다. 분류 표가 있는 모드와 없는 모드(운영) 모두에서 돈다.
//   D-25 고정 항목 목록을 읽지 못하면 /reserve-plans 는 '등록된 항목 없음'·'아직 없습니다', /my/settings 는 '아직 정기지출이
//        없습니다'·합계 0원을 보였다. 이미 있는 항목을 다시 추가하게 만들었다(같은 규칙이 둘이면 다달이 두 번 기록된다).
//        이제 '불러오지 못했어요 … 새로고침해 확인한 뒤 추가' 와 '확인 불가'를 보인다. 같은 내용을 짧은 시간(10분) 안에 다시
//        보내면 새로 만들지 않는 것(V22.9.76)과, 목록을 못 읽으면 같은 항목 확인도 못 하므로 새로 만들지 않는 것도 다시 본다.
//   W-3  V22.9.76 배포(2026-10-22 19:32 KST) 전에 분류를 비워 만든 정기 수입 계획은 지출 기본값 '세금/수수료'로 저장됐다.
//        이 값은 읽을 때 수입 기본 분류 '기타수입'으로 보이고 다음 저장 때 그 값으로 남는다. 배포 뒤에 만든 수입 계획과 지출
//        계획의 '세금/수수료', 수정 화면에서 고른 분류는 그대로다. /reserve-plans 고정 항목 추가 폼(/admin/recurring/save)도
//        분류를 비운 고정 수입을 '기타'가 아니라 '기타수입'으로 저장한다(/my/settings 와 같다).
//   F-3  (V22.9.79 후속) 종합 리포트(/my/analysis?view=report)·무료 리포트(/my/premium)·PC 분석(/analysis)은 목록을 못 읽으면
//        이미 등록한 정기 항목까지 반복 후보(무료 리포트는 등록 단추)로 보였고, 백업센터(/backup)는 '고정항목 0개'였다. 이제
//        후보를 고르지 않고 '확인 불가'를 보인다.
// 사용: node validation/validate-recurring-web-v22979.mjs
import { counter, failure, fixture, formFields, intercept, page, post, putSetting, settingValue, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.79 정기 항목 목록 실패 표시·정기 수입 기본 분류 검사 통과");
const HH = "house-home";
const Q = `household_id=${HH}&month=2026-10`;
const PLANS = `reserve_plans:${HH}`;
const EVERY_MONTH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const strip = (html) => String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const plans = (fx) => JSON.parse(settingValue(fx, PLANS) || "[]");
const planOf = (fx, id) => plans(fx).find((plan) => plan.id === id) || {};
// 수정 폼은 항목마다 하나다. id 가 같은 폼을 고른다.
const editForm = (html, id) => formFields(String(html).split("<form").map((part) => `<form${part}`).find((part) => part.includes("action=\"/admin/reserve-plan/update\"") && part.includes(`name="id" value="${id}"`)) || "", "/admin/reserve-plan/update");
const listFails = () => intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_recurring") ? failure(503) : null));
const MODES = [["분류 표 있음", true], ["분류 표 없음(운영)", false]];

// ── D-25-A: 고정 항목 목록을 못 읽으면 '없음'이 아니라 '불러오지 못함'을 보인다 ─────────────────────────────
for (const [mode, categoriesPresent] of MODES) {
  await withClock("2026-10-26", () => fixture(async (fx) => {
    const restore = listFails();
    let reserve, settings;
    try {
      reserve = await page(fx, `/reserve-plans?${Q}`);
      settings = await page(fx, `/my/settings?${Q}`);
    } finally { restore(); }
    const r = strip(reserve.html), s = strip(settings.html);
    eq(reserve.status, 200, `D25-A ${mode} /reserve-plans 는 목록을 못 읽어도 열린다`);
    ok(r.includes("고정 수입·지출 목록을 불러오지 못했어요") && r.includes("새로고침해 목록을 확인한 뒤 추가해 주세요"), `D25-A ${mode} /reserve-plans 는 목록을 불러오지 못했다고 알리고 확인한 뒤 추가하라고 한다`);
    ok(r.includes("고정 수입·지출 목록 확인 불가"), `D25-A ${mode} /reserve-plans 고정 항목 요약은 '목록 확인 불가'다`);
    ok(!r.includes("등록된 항목 없음") && !r.includes("아직 없습니다. 월세·보험·구독료처럼"), `D25-A ${mode} /reserve-plans 는 '등록된 항목 없음'·'아직 없습니다'를 보이지 않는다 (예전: 목록 실패를 빈 목록으로 보였다)`);
    eq(settings.status, 200, `D25-A ${mode} /my/settings 는 목록을 못 읽어도 열린다`);
    ok(s.includes("정기 항목 목록을 불러오지 못했어요"), `D25-A ${mode} /my/settings 는 정기 항목 목록을 불러오지 못했다고 알린다`);
    ok(!s.includes("아직 정기지출이 없습니다"), `D25-A ${mode} /my/settings 는 '아직 정기지출이 없습니다'를 보이지 않는다`);
    ok(s.includes("정기지출 합계 확인 불가") && s.includes("등록 건수 확인 불가") && !s.includes("정기지출 합계 0원"), `D25-A ${mode} /my/settings 정기 합계는 0원이 아니라 '확인 불가'다`);
  }, { categoriesPresent }));
}

// ── D-25-B: 목록을 읽었고 비어 있으면 예전처럼 '없음'을 보인다 ─────────────────────────────────────────
await withClock("2026-10-26", () => fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  const r = strip((await page(fx, `/reserve-plans?${Q}`)).html);
  const s = strip((await page(fx, `/my/settings?${Q}`)).html);
  ok(r.includes("고정 수입·지출 등록된 항목 없음") && r.includes("아직 없습니다. 월세·보험·구독료처럼"), "D25-B 빈 목록이면 /reserve-plans 는 '등록된 항목 없음'이다");
  ok(!r.includes("불러오지 못했어요"), "D25-B 빈 목록은 실패 안내를 보이지 않는다");
  ok(s.includes("아직 정기지출이 없습니다") && s.includes("정기지출 합계 0원") && !s.includes("확인 불가"), "D25-B 빈 목록이면 /my/settings 는 '아직 정기지출이 없습니다'·합계 0원이다");
}));

// ── D-25-C: 같은 고정 항목을 다시 보내도 규칙은 하나, 목록을 못 읽으면 새로 만들지 않는다 ──────────────────────
for (const path of ["/admin/recurring/save", "/my/recurring/save"]) {
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    const fields = { household_id: HH, month: "2026-10", type: "expense", memo: "구독 음악", amount: "10900", day_of_month: "12", category: "구독", payment_method: "현대카드", user_id: "user-bin", return_to: `/reserve-plans?${Q}#fixed` };
    const count = () => fx.db.accountbook_recurring.filter((rule) => rule.memo === "구독 음악").length;
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-26T20:00:00+09:00");
    const first = await post(fx, path, fields);
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-26T20:05:00+09:00");
    const again = await post(fx, path, fields);
    ok(/recurring_saved/.test(first.decoded) && /recurring_saved/.test(again.decoded), `D25-C ${path} 두 요청 모두 저장됨으로 답한다`);
    eq(count(), 1, `D25-C ${path} 5분 뒤 같은 내용을 다시 보내도 규칙은 하나다`);
    await post(fx, path, { ...fields, amount: "11900" });
    eq(fx.db.accountbook_recurring.filter((rule) => rule.memo === "구독 음악").length, 2, `D25-C ${path} 금액이 다르면 다른 항목이다`);
    const restore = listFails();
    let failed;
    try { failed = await post(fx, path, { ...fields, memo: "목록 실패 검사" }); } finally { restore(); }
    ok(/err=/.test(failed.decoded) && !/recurring_saved/.test(failed.decoded), `D25-C ${path} 목록을 못 읽으면 같은 항목 확인도 못 하므로 저장하지 못했다고 답한다 (${failed.decoded.slice(0, 120)})`);
    eq(fx.db.accountbook_recurring.filter((rule) => rule.memo === "목록 실패 검사").length, 0, `D25-C ${path} 목록을 못 읽으면 새 규칙을 만들지 않는다`);
  }, { categoriesPresent: false });
}

// ── W-3-A: V22.9.76 배포 전 분류를 비워 만든 정기 수입 계획의 '세금/수수료'는 '기타수입'으로 읽는다 ──────────────
const LEGACY = [
  { id: "r-old", name: "직무수당", amount: 300000, type: "income", recurrence: "monthly", due_months: EVERY_MONTH, due_day: 25, category: "세금/수수료", created_at: "2026-09-01T00:00:00.000Z" },
  { id: "r-nodate", name: "가족수당", amount: 100000, type: "income", recurrence: "monthly", due_months: EVERY_MONTH, due_day: 20, category: "세금/수수료" },
  { id: "r-new", name: "세금환급", amount: 80000, type: "income", recurrence: "annual", due_months: [5], due_day: 28, category: "세금/수수료", created_at: "2026-10-23T01:00:00.000Z" },
  { id: "r-tax", name: "자동차세", amount: 240000, type: "expense", recurrence: "semiannual", due_months: [6, 12], due_day: 16, category: "세금/수수료", created_at: "2026-09-01T00:00:00.000Z" },
];
const card = (text, name) => { const i = text.indexOf(`${name} `); return i < 0 ? "" : text.slice(i, i + 60); };
for (const [mode, categoriesPresent] of MODES) {
  await withClock("2026-10-26", () => fixture(async (fx) => {
    putSetting(fx, PLANS, JSON.stringify(LEGACY));
    const html = (await page(fx, `/reserve-plans?${Q}`)).html;
    const text = strip(html);
    ok(/직무수당 수입 매월 반복 매월 · 기타수입/.test(text) && !card(text, "직무수당").includes("세금/수수료"), `W3-A ${mode} 배포 전에 만든 수입 계획의 '세금/수수료'는 '기타수입'으로 보인다 (${card(text, "직무수당")})`);
    ok(/가족수당 수입 매월 반복 매월 · 기타수입/.test(text), `W3-A ${mode} 만든 시각이 없는 옛 수입 계획도 '기타수입'으로 보인다 (${card(text, "가족수당")})`);
    ok(card(text, "세금환급").includes("세금/수수료"), `W3-A ${mode} 배포 뒤에 만든 수입 계획의 '세금/수수료'는 고른 값이라 그대로다 (${card(text, "세금환급")})`);
    ok(card(text, "자동차세").includes("세금/수수료"), `W3-A ${mode} 지출 계획의 '세금/수수료'는 그대로다 (${card(text, "자동차세")})`);
    // 다른 항목을 추가하면 저장된 목록 전체가 읽은 값으로 다시 쓰인다.
    const create = formFields(html, "/admin/reserve-plan/create");
    create.fields.set("type", "expense");
    create.fields.set("name", "재산세");
    create.fields.set("amount", "180000");
    create.fields.set("recurrence", "annual");
    create.fields.set("due_month_1", "9");
    create.fields.set("due_day", "16");
    const created = await post(fx, "/admin/reserve-plan/create", create.fields);
    ok(created.decoded.includes("msg=reserve_saved"), `W3-A ${mode} 다른 정기 계획을 추가한다 (${created.decoded.slice(0, 100)})`);
    eq(plans(fx).find((plan) => plan.name === "재산세")?.category, "세금/수수료", `W3-A ${mode} 분류를 비운 새 지출 계획의 기본값은 예전과 같은 '세금/수수료'다`);
    eq(planOf(fx, "r-old").category, "기타수입", `W3-A ${mode} 다른 항목을 저장하면 옛 수입 계획의 분류가 '기타수입'으로 남는다 (예전: '세금/수수료' 그대로)`);
    eq(planOf(fx, "r-nodate").category, "기타수입", `W3-A ${mode} 만든 시각이 없는 옛 수입 계획도 '기타수입'으로 남는다`);
    eq(planOf(fx, "r-new").category, "세금/수수료", `W3-A ${mode} 다시 쓸 때도 배포 뒤 수입 계획의 분류는 그대로다`);
    eq(planOf(fx, "r-tax").category, "세금/수수료", `W3-A ${mode} 다시 쓸 때도 지출 계획의 분류는 그대로다`);
    ok(plans(fx).every((plan) => plan.category_chosen === undefined), `W3-A ${mode} 수정 화면을 거치지 않은 항목에는 새 칸이 생기지 않는다`);

    // 수정 화면은 '기타수입'을 채워 보이고, 분류를 건드리지 않고 저장하면 그 값이 고른 값으로 남는다.
    const edit = editForm((await page(fx, `/reserve-plans?${Q}`)).html, "r-nodate");
    eq(edit.fields.get("id"), "r-nodate", `W3-A ${mode} 가족수당 수정 폼이 있다`);
    eq(edit.fields.get("category"), "기타수입", `W3-A ${mode} 수정 폼은 '기타수입'을 채워 보낸다`);
    const saved = await post(fx, "/admin/reserve-plan/update", edit.fields);
    ok(saved.status === 303 && !/err=/.test(saved.decoded), `W3-A ${mode} 수정을 저장한다 (${saved.decoded.slice(0, 100)})`);
    eq(planOf(fx, "r-nodate").category, "기타수입", `W3-A ${mode} 분류를 그대로 두고 저장한 옛 수입 계획은 '기타수입'이다`);
    eq(planOf(fx, "r-nodate").category_chosen, true, `W3-A ${mode} 수정 화면에서 저장한 항목은 고른 분류라는 표시를 남긴다`);
  }, { categoriesPresent }));
}

// ── W-3-B: 옛 수입 계획에 수정 화면에서 '세금/수수료'를 다시 고르면 그 값이 남는다 ───────────────────────────
await withClock("2026-10-26", () => fixture(async (fx) => {
  putSetting(fx, PLANS, JSON.stringify([LEGACY[0]]));
  const edit = editForm((await page(fx, `/reserve-plans?${Q}`)).html, "r-old");
  edit.fields.set("category", "세금/수수료");
  await post(fx, "/admin/reserve-plan/update", edit.fields);
  eq(planOf(fx, "r-old").category, "세금/수수료", "W3-B 수정 화면에서 고른 '세금/수수료'를 저장한다");
  eq(planOf(fx, "r-old").category_chosen, true, "W3-B 수정 화면에서 저장한 항목은 고른 분류라는 표시(category_chosen)를 남긴다");
  const text = strip((await page(fx, `/reserve-plans?${Q}`)).html);
  ok(card(text, "직무수당").includes("세금/수수료"), `W3-B 고른 '세금/수수료'는 다시 읽어도 그대로 보인다 (${card(text, "직무수당")})`);
}, { categoriesPresent: false }));

// ── W-3-C: /reserve-plans 고정 항목 추가 폼에서 분류를 비운 고정 수입은 '기타수입'이다(지출은 예전처럼 '기타') ─────────
for (const [mode, categoriesPresent] of MODES) {
  await withClock("2026-10-26", () => fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    const form = formFields((await page(fx, `/reserve-plans?${Q}`)).html, "/admin/recurring/save");
    ok(form.found && form.fields.get("category") === "", `W3-C ${mode} 고정 항목 추가 폼은 분류를 비워 보낸다`);
    const send = (type, memo, amount) => {
      const fields = new URLSearchParams(form.fields);
      fields.set("type", type); fields.set("memo", memo); fields.set("amount", amount); fields.set("day_of_month", "25"); fields.set("user_id", "user-bin");
      return post(fx, "/admin/recurring/save", fields);
    };
    const income = await send("income", "직무수당", "300000");
    ok(/recurring_saved/.test(income.decoded), `W3-C ${mode} 고정 수입을 저장한다 (${income.decoded.slice(0, 100)})`);
    eq(fx.db.accountbook_recurring.find((rule) => rule.memo === "직무수당")?.category, "기타수입", `W3-C ${mode} 분류를 비운 고정 수입은 '기타수입'이다 (예전: '기타')`);
    await send("expense", "정수기", "29900");
    eq(fx.db.accountbook_recurring.find((rule) => rule.memo === "정수기")?.category, "기타", `W3-C ${mode} 분류를 비운 고정 지출은 예전처럼 '기타'다`);
    await post(fx, "/my/recurring/save", { household_id: HH, month: "2026-10", type: "income", memo: "용돈", amount: "50000", day_of_month: "5", category: "", payment_method: "", user_id: "user-bin", return_to: `/my/settings?${Q}` });
    eq(fx.db.accountbook_recurring.find((rule) => rule.memo === "용돈")?.category, "기타수입", `W3-C ${mode} /my/settings 경로도 '기타수입'이다(V22.9.76 W-1 그대로)`);
  }, { categoriesPresent }));
}

// ── F3: 정기 항목 목록을 못 읽은 분석·리포트·백업 화면은 '없음'·새 후보가 아니라 '확인 불가'다 ─────────────────────
// 반복 지출 후보는 등록한 정기 항목을 빼고 고른다. 예전에는 목록을 못 읽으면 빈 목록으로 골라(너그러운 읽기 fetchRecurring)
// 이미 등록한 '월세'가 새 후보(무료 리포트는 등록 단추)로 보였고, 백업센터는 '고정항목 0개'였다.
const adminLogin = async (fx) => {
  fx.env.ADMIN_PASSWORD = "qa-admin-123";
  fx.env.ADMIN_SESSION_SECRET = "qa-admin-session";
  const login = await post(fx, "/login", { password: "qa-admin-123" }, { cookie: "" });
  return (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
};
const NO_LIST = "정기 항목 목록을 불러오지 못해 반복 지출 후보를 고르지 않았어요";
const RENT_CANDIDATE = /월세 주거\/관리 · (최근 3개월 중 )?3개월 반복/;
for (const [mode, categoriesPresent] of MODES) {
  await withClock("2026-10-26", () => fixture(async (fx) => {
    // 등록된 정기 항목 '월세 650,000원'(픽스처)과 같은 이름·금액의 기록이 8~10월에 있다.
    for (const date of ["2026-08-05", "2026-09-05", "2026-10-05"]) fx.db.transactions.push({ id: `f3-rent-${date}`, household_id: HH, user_id: "user-bin", transaction_date: date, type: "expense", amount: 650000, category: "주거/관리", memo: "월세", payment_method: "계좌이체", source: "web", raw_text: `월세 650000 ${date}`, created_at: `${date}T03:00:00Z` });
    const admin = `${fx.cookie}; ${await adminLogin(fx)}`;
    const views = async () => {
      const out = {};
      for (const [name, path, cookie] of [["report", `/my/analysis?view=report&${Q}`, fx.cookie], ["premium", `/my/premium?${Q}`, fx.cookie], ["pc", `/analysis?${Q}`, admin], ["backup", `/backup?${Q}`, admin]]) {
        const res = await page(fx, path, { cookie });
        out[name] = { status: res.status, text: strip(res.html) };
      }
      return out;
    };
    const fine = await views();
    ok(Object.values(fine).every((view) => view.status === 200), `F3 ${mode} 네 화면이 열린다 (${Object.entries(fine).map(([name, view]) => `${name}:${view.status}`).join(" ")})`);
    ok(!RENT_CANDIDATE.test(fine.report.text) && !RENT_CANDIDATE.test(fine.pc.text) && !fine.premium.text.includes("매월 5일 제안"), `F3 ${mode} 목록을 읽으면 등록한 월세는 반복 후보가 아니다`);
    ok(![fine.report, fine.premium, fine.pc].some((view) => view.text.includes(NO_LIST)) && fine.backup.text.includes("고정항목 1개"), `F3 ${mode} 목록을 읽으면 '확인 불가'가 없고 백업센터는 고정항목 1개다`);
    const restore = listFails();
    let broken;
    try { broken = await views(); } finally { restore(); }
    ok(Object.values(broken).every((view) => view.status === 200), `F3 ${mode} 목록을 못 읽어도 네 화면이 열린다 (${Object.entries(broken).map(([name, view]) => `${name}:${view.status}`).join(" ")})`);
    ok(broken.report.text.includes(NO_LIST) && !RENT_CANDIDATE.test(broken.report.text) && !broken.report.text.includes("반복된 지출을 찾지 못했습니다"), `F3 ${mode} 종합 리포트는 등록한 월세를 새 후보로 보이지 않고 후보를 확인할 수 없다고 알린다 (예전: 월세가 후보)`);
    ok(broken.premium.text.includes("반복지출 후보 확인 불가") && broken.premium.text.includes(NO_LIST) && !broken.premium.text.includes("매월 5일 제안"), `F3 ${mode} 무료 리포트는 반복지출 후보 '확인 불가'이고 월세 등록 단추를 보이지 않는다 (예전: 1건·등록 단추)`);
    ok(broken.pc.text.includes(NO_LIST) && !RENT_CANDIDATE.test(broken.pc.text), `F3 ${mode} PC 분석 화면도 후보를 확인할 수 없다고 알린다`);
    ok(broken.backup.text.includes("고정항목 확인 불가") && !broken.backup.text.includes("고정항목 0개"), `F3 ${mode} 백업센터는 고정항목 0개가 아니라 '확인 불가'다`);
  }, { categoriesPresent }));
}

done();
