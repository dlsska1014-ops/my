// V22.8.89 — 통합 작업지시서 M4(빠른 입력 2단)·M6(토스트) 검사.
//
// M4 의 통과 조건은 "스크롤 없이 저장 버튼 도달"이다. 픽셀은 브라우저가 재야 하므로
// 여기서는 그 조건이 성립하게 만드는 구조를 확인한다 — 1단에 남는 필드 수를 줄이고,
// 저장 버튼을 시트 아래에 붙이고, 접힌 2단이 무엇을 담고 있는지 헤더로 말하는 것.
//
// M5(파싱 밑줄)는 이 릴리스에 없다. 통과 조건이 "한글 IME 정상"인데 그것은 실제
// 브라우저와 IME 없이는 확인할 수 없고, 확인하지 못한 채로 입력칸 위에 레이어를
// 얹는 것은 한글 입력을 끊을 수 있다(지시서 M5 가 직접 경고하는 위험이다).
// 다만 같은 위험이 이번 실시간 파싱에도 있으므로, 조합 중에는 건드리지 않는 가드를
// 여기서 확인한다.

import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  checks += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`);
  checks += 1;
}

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const month = new Date().toISOString().slice(0, 7);
const householdId = "house-home";
const fixture = await createV2265QaFixture();

try {
  fixture.db.accountbook_budgets.push({ id: "sheet-total", household_id: householdId, month, category: "__total", amount: 1000000, created_at: `${month}-01T00:00:00.000Z` });
  fixture.db.transactions.push({ id: "sheet-1", household_id: householdId, user_id: "user-bin", transaction_date: `${month}-02`, type: "expense", amount: 12000, category: "식비", memo: "점심", payment_method: "현금", source: "web", created_at: `${month}-02T09:00:00.000Z` });
  const get = async (path, cookie = fixture.cookie) => {
    const headers = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" };
    if (cookie) headers.cookie = cookie;
    const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers }), fixture.env, {});
    return { response, text: await response.text() };
  };

  const home = await get(`/app?month=${month}&household_id=${householdId}`);
  eq(home.response.status, 200, "홈이 렌더된다");
  const sheet = (home.text.match(/<section id="add"[\s\S]*?<\/section>/) || [""])[0];
  ok(sheet.length > 0, "빠른 입력 마크업이 렌더된다");
  const more = (sheet.match(/<details class="quickMore"[\s\S]*?<\/details>/) || [""])[0];
  ok(more.length > 0, "2단(자세히)이 있다");

  // 1. "채우기" 버튼을 없애고 적는 동안 채운다. 버튼을 눌러야 반영되는 구조가
  //    한 줄 입력의 이점을 지웠다는 것이 M4 의 지적이었다.
  eq(sheet.includes('id="smartApply"'), false, "채우기 버튼이 사라졌다");
  eq(source.includes("smartApply"), false, "채우기 버튼의 흔적이 소스에 남아 있지 않다");
  ok(sheet.includes('id="smartInput"'), "한 줄 입력칸은 그대로다");

  // 2. 한글 조합 중에는 파싱하지 않는다. 조합 중에 값을 건드리면 입력이 끊긴다.
  ok(source.includes("compositionstart"), "한글 조합 시작을 듣는다");
  ok(source.includes("compositionend"), "한글 조합 끝을 듣는다");
  ok(source.includes("if(abImeComposing)return;"), "조합 중에는 파싱을 건너뛴다");
  // 실시간 파싱은 입력칸을 비우지 않아야 한다. 비우면 적는 도중 글자가 사라진다.
  ok(source.includes("if(clearInput){smart.value='';"), "입력칸을 비우는 것은 Enter 로 확정할 때뿐이다");

  // 3. 2단 배치. 날짜·지출자·결제수단·분류가 접힘 안으로 들어간다.
  for (const [field, label] of [['id="txDate"', "날짜"], ['select name="user_id"', "지출자"], ['id="payInput"', "결제수단"], ['id="catInput"', "분류"]]) {
    ok(more.includes(field), `${label}가 2단 안에 있다`);
  }
  // 1단에 남는 것: 금액·내용·분류 제안 칩.
  const tier1 = sheet.slice(0, sheet.indexOf('<details class="quickMore"'));
  for (const [field, label] of [['id="amountInput"', "금액"], ['id="memoInput"', "내용"], ['id="freqChips"', "분류 제안 칩"]]) {
    ok(tier1.includes(field), `${label}는 1단에 남는다`);
  }

  // 4. 접힌 헤더가 요약을 든다. 요약이 없으면 접는 것이 곧 값을 숨기는 일이 된다.
  const summary = (more.match(/data-ab-quick-summary[^>]*>([^<]*)</) || [])[1] || "";
  ok(summary.length > 0, `접힌 헤더에 요약이 있다 (${summary})`);
  ok(summary.includes("·"), "요약이 여러 값을 한 줄로 잇는다");
  ok(source.includes("function abQuickSyncMore()"), "값이 바뀌면 요약이 따라간다");

  // 5. 저장 버튼은 시트 아래에 붙는다. 안전 영역도 함께 본다.
  ok(sheet.includes('class="quickSubmit"'), "저장 영역이 따로 묶여 있다");
  const shell = await get("/assets/accountbook-shell-v22911.css", "");
  eq(shell.response.status, 200, "셸이 서빙된다");
  const submitRule = (shell.text.match(/body\.abV22812Shell \.quickSubmit\{[^}]*\}/) || [""])[0];
  ok(submitRule.includes("position:sticky") && submitRule.includes("bottom:0"), "저장 버튼이 시트 하단에 고정된다");
  ok(submitRule.includes("env(safe-area-inset-bottom"), "저장 영역이 하단 안전 영역을 반영한다");
  ok(shell.text.includes("body.abV22812Shell .quickSubmit>button[type=\"submit\"]{width:100%;min-height:52px}"), "저장 버튼 높이가 52px 이다");

  // 6. 누르기 전에 결과가 보인다. 금액이 없으면 "저장하면"이라 말할 수 없으므로
  //    현재 값을 그대로 말한다 — JS 가 없어도 이 문장은 참이어야 한다.
  const after = (sheet.match(/data-ab-quick-after[^>]*>([^<]*)</) || [])[1] || "";
  ok(after.includes("남은 예산"), `저장 버튼 아래에 결과 줄이 있다 (${after})`);
  ok(/data-remaining="\d+"/.test(sheet) && /data-daily="\d+"/.test(sheet), "그 줄이 계산에 쓸 값을 들고 있다");
  ok(source.includes("function abQuickSyncAfter()"), "금액을 적으면 결과 줄이 다시 계산된다");
  ok(source.includes("'저장하면 남은 예산 '"), "금액이 있으면 저장 후 값으로 바꿔 말한다");

  // 7. 칩 선택 상태. 전부 파란 채움이라 무엇을 골랐는지 읽을 수 없었다.
  ok(shell.text.includes('body.abV22812Shell #add .chipRow button[aria-pressed="true"]'), "선택된 칩에만 채움이 붙는다");
  const chipOn = (shell.text.match(/body\.abV22812Shell #add \.chipRow button\[aria-pressed="true"\][^{]*\{[^}]*\}/) || [""])[0];
  ok(chipOn.includes("var(--ab12-accent-soft)") && chipOn.includes("var(--ab12-action)"), "선택은 accent-soft 바탕에 action 글자다");
  const chipBase = (shell.text.match(/body\.abV22812Shell #add \.chipRow button\{[^}]*\}/) || [""])[0];
  ok(chipBase.includes("min-height:44px"), "칩 높이가 44px 이다");
  ok(chipBase.includes("var(--ab12-surface)") && chipBase.includes("var(--ab12-line)"), "비선택은 surface 바탕에 line 테두리다");

  // 8. M6 토스트. 하단 탭 위에 뜨고, 성공했을 때 결과를 말한다.
  ok(source.includes("bottom:calc(76px + env(safe-area-inset-bottom,0px))"), "토스트가 하단 탭 위 12px 에 뜬다");
  ok(source.includes("const feedbackResultLine"), "성공 토스트가 결과 줄을 만든다");
  // 저장 성공은 msg=added 로 돌아온다. "saved" 는 이 앱이 쓰지 않는 이름이다.
  const saved = await get(`/app?month=${month}&household_id=${householdId}&msg=added`);
  eq(saved.response.status, 200, "저장 성공 화면이 열린다");
  const sliceToast = (html) => {
    const at = html.indexOf('class="abSaveFeedback');
    return at < 0 ? "" : html.slice(at, at + 700);
  };
  const toast = sliceToast(saved.text);
  ok(toast.includes("기록을 저장했습니다"), "저장했다는 사실을 말한다");
  ok(/남은 예산 [\d,]+원/.test(toast), `저장 결과를 함께 말한다 (${toast.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()})`);
  // 오류 토스트는 자동으로 사라지지 않고 닫기 버튼을 갖는다 — 현행 유지.
  const failed = await get(`/app?month=${month}&household_id=${householdId}&err=invalid_amount`);
  const errorToast = sliceToast(failed.text);
  ok(errorToast.includes('role="alert"'), "오류는 alert 로 알린다");
  ok(errorToast.includes("data-ab-feedback-close"), "오류 토스트에 닫기 버튼이 있다");
  eq(/남은 예산 [\d,]+원/.test(errorToast), false, "실패했을 때 저장 결과를 말하지 않는다");

  // 9. 초안 보존(V22.8.78)·저장 실패 복구(V22.8.76)는 그대로 살아 있어야 한다.
  ok(source.includes("function lockScroll()"), "시트 스크롤 잠금이 그대로다");
  ok(source.includes('input[name="return_to"]'), "돌아갈 주소 동기화가 그대로다");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.89 quick sheet two tier (${checks} checks)`);
