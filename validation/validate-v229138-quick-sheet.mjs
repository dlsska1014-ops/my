// 빠른 입력 시트 3층(작업 지시서 7단계 U-16 · U-01 의 남은 몫)과 그 시트·알림·첫 안내의 다듬기(V136:S-9·S-10, V137:H-7·H-9).
// 작업 지시: 사용자 2026-11-21 "모두 이번주 부터"(남은 UI/UX 를 이번 주부터 — 반영 여부·순서는 Claude 가 정한다, 사용자 10-29).
//  A. 홈 HTML: 자주 쓰는 칩은 자주 쓴 순 다섯까지(옛 여섯 — 시트에서 두 줄), ‘자세히’ 요약 줄의 날짜는 ‘오늘’·‘어제’·‘7월 10일’·‘2025년 12월 31일’,
//     빠른 입력 칸(#add)의 글에 ISO 날짜가 없다, 홈이 새 자산 주소를 부른다.
//  B. 1년 캐시 자산: 새 주소 여섯(v5·빠른 입력·홈 스크립트 둘·알림·홈 스타일시트)은 1년 캐시·새 ETag, 옛 주소는 옛 바이트(바탕 a2f45ca2 의 sha256),
//     홈 스타일시트의 세 규칙(큰 금액 칸 56px·숫자 폭 고정, 자주 쓰는 칩 한 줄 가로 넘기기), v5 가 빠른 입력 자산을 새 주소로 부른다.
//  C. 날짜 글의 꼴 하나: 서버 요약·홈 스크립트 요약(abQuickSyncMore)·빠른 입력 자산의 미리보기 줄·시트 머리 설명(v5 quickDayLabel)이 같은 날짜에 같은 글이다.
//     오늘·어제는 기기 시간대와 상관없이 한국 시각으로 센다(UTC 날짜가 다른 한국 자정 직후 포함).
//  D. 시트(v5): 머리 설명·날짜가 엇갈린 안내의 날짜 글, 입력칸이 없는 시트(방 전용 보기·조회 전용)를 열면 초점이 시트의 [닫기]로 간다(S-10).
//  E. 알림(S-9): 방 전용 보기로 부른 알림 API 는 그 세션으로 열 수 없는 화면의 링크에만 closed: true, 보통 세션의 응답에는 그 키가 없다.
//     알림 패널·배너는 closed 인 링크에 data-ab-rv-off·aria-disabled="true"·title(서버의 링크 표시와 같은 글)을 단다.
//  F. 첫 사용 안내(H-9): 캘린더 단계가 홈의 ‘최근 내역’ 머리 링크(a.homeFeedCalendar)를 찾는다(옛 큰 단추 .homeCalendarToggle 은 V22.9.137 에 없어졌다).
// 해석 결과 한 줄과 [고치기]의 동작(빈 칸·형식·구분·분류·결제수단·날짜 글, 초점 순서, 금액 단축 단추의 자리)은 validate-lucian-a-v22949 가 가짜 화면으로 본다.
// 브라우저로만 잴 수 있는 것(390×844 에서 시트 첫 화면에 ‘기록 저장’, 1280 홈 #add 높이, 방 전용 보기에서 시트를 열 때 실제 초점)은 증거 폴더의 측정 도구가 본다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음). 판 이름 글자는 적지 않는다. 바탕 코드(이 판 앞)에서는 대부분이 실패한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { app, BASE, counter, fixture, page, withClock } from "./lib-audit-v22934.mjs";
import { createInputBrowser } from "./lib-lucian-a-browser.mjs";
import { quickAmountFieldState, quickSmartInputController } from "../src/modules/client/shared-input-parsers.js";

const { ok, eq, done } = counter("빠른 입력 시트 3층(미리보기 한 줄·자주 쓰는 칩 한 줄·큰 금액 칸)·날짜 글·방 전용 보기의 알림 링크와 시트 초점·첫 안내의 캘린더 단계 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };
const checkAsync = async (fn, label) => { try { await fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };
const sha = (text) => createHash("sha256").update(text).digest("hex");
const ctx = { waitUntil() {}, passThroughOnException() {} };
async function asset(path, env = {}) {
  const response = await app.fetch(new Request(`${BASE}${path}`), env, ctx);
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, etag: response.headers.get("etag") || "", cache: response.headers.get("cache-control") || "", text: body.toString("utf8"), sha: sha(body) };
}
const ISO = /\b\d{4}-\d{2}-\d{2}\b/;
const textOf = (html) => String(html || "").replace(/<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>/gi, "").replace(/<[^>]*>/g, " ");
const addSection = (html) => (String(html || "").match(/<section id="add"[\s\S]*?<\/section>/) || [""])[0];
const summaryOf = (html) => ((addSection(html).match(/data-ab-quick-summary[^>]*>([^<]*)</) || [])[1] || "");

// ── B. 자산 주소 ────────────────────────────────────────────────────────────
const MOVED = [
  ["/assets/accountbook-v5-v22993.js", "/assets/accountbook-v5-v229138.js", "789af0f9b7e58fc29dfa55e3962eed7ab6f1f4ff04f99ccf712ee23483777d28"],
  ["/assets/accountbook-quick-input-v22951.js", "/assets/accountbook-quick-input-v229138.js", "59dd629ed042aa52e2c3e6be5f143d327d4a8e5e65bac7ebf3da8821fd722e82"],
  ["/assets/mobile-home-v22995.js", "/assets/mobile-home-v229138.js", "df0d2cdfdcd8015b870f308787ad396241108f5218ebf8a56883464c32b515b7"],
  ["/assets/mobile-home-shell-v22995.js", "/assets/mobile-home-shell-v229138.js", "b3c5d96634f6d5fe406c45879dd3ff09ca1b7d00765019721ec17bf5f0984b70"],
  ["/assets/accountbook-notif-v22937.js", "/assets/accountbook-notif-v229138.js", "84a5d43252c9ff9986e552fa0352dcf67036a9332ba117f8848151b87040687d"],
  ["/assets/mobile-home-v229137.css", "/assets/mobile-home-v229138.css", "714a77f120d5ba9da6f4a57b59bf1ee7c2c2ead0484d61921b89af23fea3322c"],
];
const served = {};
for (const [oldPath, newPath, oldSha] of MOVED) {
  const fresh = await asset(newPath);
  served[newPath] = fresh.text;
  const etag = `"${newPath.slice(8).replace(/\.(js|css)$/, "-$1")}"`;
  check(() => ok(fresh.status === 200 && fresh.etag === etag && /max-age=31536000/.test(fresh.cache) && /immutable/.test(fresh.cache), `B-1 ${newPath} 가 1년 캐시·ETag ${etag} 로 내려간다(${fresh.status} ${fresh.etag})`), `serve ${newPath}`);
  const old = await asset(oldPath);
  check(() => ok(old.status === 200 && old.sha === oldSha, `B-2 옛 주소 ${oldPath} 는 옛 바이트 그대로다(운영 V22.9.137 이하 화면이 쓴다 — ${old.status} ${old.sha.slice(0, 12)})`), `old ${oldPath}`);
  check(() => ok(fresh.sha !== oldSha, `B-2 ${newPath} 는 옛 바이트와 다르다(주소를 올린 까닭)`), `changed ${newPath}`);
}
const v5 = served["/assets/accountbook-v5-v229138.js"] || "";
const quick = served["/assets/accountbook-quick-input-v229138.js"] || "";
const homeCss = served["/assets/mobile-home-v229138.css"] || "";
const shellJs = served["/assets/mobile-home-shell-v229138.js"] || "";
const homeJs = served["/assets/mobile-home-v229138.js"] || "";
const notif = served["/assets/accountbook-notif-v229138.js"] || "";
check(() => ok(v5.includes('script.src = "/assets/accountbook-quick-input-v229138.js";') && !v5.includes("accountbook-quick-input-v22951"), "B-3 시트를 열 때 v5 가 빠른 입력 자산을 새 주소로 부른다"), "v5 loads quick input");
for (const rule of [
  "html body #add .amountInput{min-height:56px!important;font-variant-numeric:tabular-nums!important}",
  "html body #add #freqChips{flex-wrap:nowrap!important;overflow-x:auto;overflow-y:hidden;max-height:none;padding-bottom:4px;scrollbar-width:thin;overscroll-behavior-x:contain}",
  "html body #add #freqChips>button{flex:none;max-width:none;white-space:nowrap}",
  // 독립 검토: 가로로 넘기는 칩 줄이 공통 초점 테두리(바깥 3px)를 잘랐다 → 칩 줄 안의 칩만 테두리를 안쪽에 그린다(브라우저 측정 work/chip-ring-*.txt).
  "html body #add #freqChips>button:focus-visible{outline-offset:-3px!important}",
]) check(() => ok(homeCss.includes(rule), `B-4 홈 스타일시트 규칙: ${rule.slice(0, 70)}`), `home css ${rule.slice(0, 30)}`);
check(() => ok(/\.amountInput\{font-size:24px!important;font-weight:800!important;/.test(homeCss), "B-4 큰 금액 칸의 글자 24px·굵기 800 은 그대로다(U-01)"), "amount type");
check(() => ok(quick.includes('preview.id = "abInputPreview"') && quick.includes('fix.textContent = "고치기"') && !quick.includes("abInputField") && !quick.includes("항목을 눌러 내용을 확인하고 고치세요."), "B-5 빠른 입력 자산은 해석 칩 다섯 대신 미리보기 줄과 [고치기]를 만든다"), "quick asset shape");
for (const [name, source] of [["mobile-home", homeJs], ["mobile-home-shell", shellJs]]) {
  check(() => ok(source.includes("parts.push(dv===kstDay(0)?'오늘':dv===kstDay(-1)?'어제':") && !source.includes("parts.push(dv===kstDay(0)?'오늘':(dv||'날짜'));"), `B-6 ${name}: 두 홈 스크립트 주소가 같은 요약 줄 날짜 글을 싣는다`), `home script ${name}`);
}

// ── C. 날짜 글의 꼴 하나 ─────────────────────────────────────────────────────
const fixedDateSource = (ms) => `(() => { const Real = Date; const FIXED = ${ms}; globalThis.Date = class extends Real { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); } static now() { return FIXED; } }; })()`;
function withTz(tz, task) {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try { return task(); } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
}
// 홈 스크립트의 abQuickSyncMore(요약 줄 첫 조각)
function runtimeLabel(nowMs, value, tz) {
  const start = shellJs.indexOf("function abQuickSyncMore(){");
  const end = shellJs.indexOf("function abQuickSyncAfter(", start);
  if (start < 0 || end < 0) throw new Error("abQuickSyncMore 가 없다");
  const out = { textContent: "" };
  const fields = { txDate: { value }, payInput: { value: "" }, catInput: { value: "" } };
  const document = { getElementById: (id) => fields[id] || null, querySelectorAll: () => [], querySelector: (s) => (s === "[data-ab-quick-summary]" ? out : null) };
  return withTz(tz, () => {
    const context = vm.createContext({ document, abQuickTypeLabels() {} });
    vm.runInContext(fixedDateSource(nowMs), context);
    vm.runInContext(`${shellJs.slice(start, end)}abQuickSyncMore();`, context);
    return out.textContent.split(" · ")[0];
  });
}
// 시트 머리 설명의 quickDayLabel(v5 — 같은 묶음 안의 validDate 와 함께 꺼낸다)
const v5DayLabelSource = (() => {
  const at = v5.indexOf("function quickDayLabel(value) {");
  const valid = v5.lastIndexOf("function validDate(value) {", at);
  const end = v5.indexOf('+ "일";', at);
  if (at < 0 || valid < 0 || end < 0) return "";
  return v5.slice(valid, v5.indexOf("}", end) + 1);
})();
function v5Label(nowMs, value, tz) {
  if (!v5DayLabelSource) throw new Error("v5 quickDayLabel 이 없다");
  return withTz(tz, () => {
    const context = vm.createContext({});
    vm.runInContext(fixedDateSource(nowMs), context);
    return vm.runInContext(`${v5DayLabelSource}\nquickDayLabel(${JSON.stringify(value)});`, context);
  });
}
// 빠른 입력 자산의 미리보기 줄(마지막 조각)
function previewLabel(nowMs, value, tz) {
  return withTz(tz, () => {
    const b = createInputBrowser({ now: nowMs });
    b.run(`${quickAmountFieldState.toString()}\n${quickSmartInputController.toString()}\nquickSmartInputController({date:value=>value});`);
    b.fields.txDate.value = value;
    b.run(quick);
    const text = b.preview() || "";
    return text.split(" · ").at(-1);
  });
}
const KST = (iso) => Date.parse(`${iso}+09:00`);
const DATE_CASES = [
  ["2026-07-15T12:00:00", "2026-07-15", "오늘"],
  ["2026-07-15T12:00:00", "2026-07-14", "어제"],
  ["2026-07-15T12:00:00", "2026-07-10", "7월 10일"],
  ["2026-07-15T12:00:00", "2026-07-16", "7월 16일"],
  ["2026-07-15T12:00:00", "2026-01-05", "1월 5일"],
  ["2026-07-15T12:00:00", "2025-12-31", "2025년 12월 31일"],
  // 한국 자정 직후(UTC 로는 아직 전날): 오늘·어제·해 바뀜을 한국 날짜로 센다.
  ["2026-01-01T00:30:00", "2026-01-01", "오늘"],
  ["2026-01-01T00:30:00", "2025-12-31", "어제"],
  ["2026-01-01T00:30:00", "2025-12-30", "2025년 12월 30일"],
];
for (const [now, value, expected] of DATE_CASES) {
  for (const tz of ["Asia/Seoul", "America/Los_Angeles"]) {
    check(() => eq(runtimeLabel(KST(now), value, tz), expected, `C-1 홈 스크립트 요약 ${now} KST · ${value} · 기기 ${tz}`), `runtime ${now} ${value} ${tz}`);
    check(() => eq(v5Label(KST(now), value, tz), expected, `C-2 시트 머리 설명 ${now} KST · ${value} · 기기 ${tz}`), `v5 ${now} ${value} ${tz}`);
    check(() => eq(previewLabel(KST(now), value, tz), expected, `C-3 미리보기 줄 ${now} KST · ${value} · 기기 ${tz}`), `preview ${now} ${value} ${tz}`);
  }
}
check(() => eq(v5Label(KST("2026-07-15T12:00:00"), "2026-07-32", "Asia/Seoul"), "", "C-2 없는 날짜는 빈 글(설명은 ‘거래일을 확인한 뒤 저장해 주세요.’ 로 간다)"), "v5 invalid date");
check(() => eq(runtimeLabel(KST("2026-07-15T12:00:00"), "", "Asia/Seoul"), "날짜", "C-1 날짜 칸이 비면 요약 줄은 ‘날짜’(옛 글 그대로)"), "runtime empty");

// ── A·C-4. 홈 HTML ─────────────────────────────────────────────────────────
await checkAsync(() => fixture(async (fx) => {
  // 자주 쓰는 칩: 일곱 내용을 서로 다른 횟수(20~14번)로 적은 달 — 자주 쓴 순 다섯만 나온다.
  const memos = [["버스", 20, "교통"], ["택시", 19, "교통"], ["편의점", 18, "생활"], ["빵집", 17, "식비"], ["약국", 16, "의료/병원"], ["꽃집", 15, "생활"], ["서점", 14, "문화"]];
  let n = 0;
  for (const [memo, count, category] of memos) {
    for (let i = 0; i < count; i += 1) {
      n += 1;
      fx.db.transactions.push({ id: `v138-freq-${n}`, household_id: "house-home", user_id: "user-bin", transaction_date: `2026-07-${String(1 + (i % 9)).padStart(2, "0")}`, type: "expense", amount: 1000 + i, category, memo, payment_method: "", source: "web", created_at: `2026-07-01T0${i % 9}:00:00.000Z` });
    }
  }
  for (const [now, query, expected] of [
    ["2026-07-15", "", "오늘"],
    ["2026-07-15", "&date=2026-07-14", "어제"],
    ["2026-07-15", "&date=2026-07-10", "7월 10일"],
  ]) {
    const home = await withClock(now, () => page(fx, `/app?month=2026-07&household_id=house-home${query}`));
    check(() => eq(home.status, 200, `A 홈 ${query || "(오늘)"}`), `home ${query}`);
    const add = addSection(home.html);
    check(() => ok(add.length > 0, "A 빠른 입력 칸이 있다"), `add ${query}`);
    check(() => eq(summaryOf(home.html).split(" · ")[0], expected, `A-2·C-4 ‘자세히’ 요약 줄(서버)의 날짜 ${query || "(오늘)"}`), `summary ${query}`);
    check(() => ok(!ISO.test(textOf(add)), `A-3 빠른 입력 칸의 글에 ISO 날짜가 없다 ${query || "(오늘)"}(${(textOf(add).match(ISO) || [""])[0]})`), `no iso ${query}`);
    if (!query) {
      const chips = [...((add.match(/<div class="chipRow" id="freqChips">[\s\S]*?<\/div>/) || [""])[0]).matchAll(/<button type="button" data-memo="([^"]*)"/g)].map((m) => m[1]);
      check(() => eq(chips.join(","), "버스,택시,편의점,빵집,약국", "A-1 자주 쓰는 칩은 자주 쓴 순 다섯까지(꽃집·서점은 빠진다)"), "freq chips");
      check(() => ok(home.html.includes('href="/assets/mobile-home-v229138.css"') && home.html.includes('src="/assets/mobile-home-shell-v229138.js"') && home.html.includes("/assets/accountbook-v5-v229138.js") && !/mobile-home-v229137\.css|mobile-home-shell-v22995\.js|accountbook-v5-v22993\.js/.test(home.html), "A-4 홈이 새 자산 주소를 부른다"), "home asset links");
      // F. 첫 사용 안내의 캘린더 단계가 찾는 링크가 홈에 꼭 하나 있다.
      check(() => eq((home.html.match(/<a class="homeFeedCalendar" href="/g) || []).length, 1, "F-1 홈에 ‘최근 내역’ 머리의 캘린더 링크(a.homeFeedCalendar)가 하나"), "calendar link");
    }
  }
  // 다른 해의 날짜(지난해 12월 31일)도 해까지 적는다.
  const lastYear = await withClock("2026-07-15", () => page(fx, "/app?month=2025-12&household_id=house-home&date=2025-12-31"));
  check(() => eq(summaryOf(lastYear.html).split(" · ")[0], "2025년 12월 31일", "A-2·C-4 다른 해의 날짜는 해까지"), "summary last year");
  check(() => ok(!ISO.test(textOf(addSection(lastYear.html))), "A-3 다른 해의 날짜도 ISO 글이 아니다"), "no iso last year");
  // 기록이 적은 가계부(자주 쓰는 내용이 셋 미만)는 기본 칩 다섯 그대로다.
  const empty = await withClock("2026-07-15", () => page(fx, "/app?month=2026-09&household_id=house-home"));
  const defaults = [...((addSection(empty.html).match(/<div class="chipRow" id="freqChips">[\s\S]*?<\/div>/) || [""])[0]).matchAll(/<button type="button" data-memo="([^"]*)"/g)].map((m) => m[1]);
  check(() => ok(defaults.length <= 5, `A-1 기본 칩도 다섯을 넘지 않는다(${defaults.join(",")})`), "default chips");
}), "홈 장면");

// ── D. 시트(v5) ────────────────────────────────────────────────────────────
// V22.9.138(독립 검토): 입력칸이 없는 시트(방 전용 보기·조회 전용)의 머리 설명은 비운다 — 시트 안에 기록할 수 없는 까닭이 있어 ‘거래일을 확인한 뒤 저장해 주세요.’ 가 맞지 않는다.
check(() => ok(v5.includes('if (description) description.textContent = !input ? "" : (validDate(input.value) ? quickDayLabel(input.value) + " 기록을 현재 가계부에 추가합니다." : "거래일을 확인한 뒤 저장해 주세요.") + (dateConflict ? " " + dateConflict : "");'), "D-1 시트 머리 설명의 날짜는 quickDayLabel 글이고(‘오늘 기록을 현재 가계부에 추가합니다.’) 입력칸이 없으면 비운다"), "sheet description");
check(() => ok(v5.includes('dateConflict = "달력에서 선택한 날짜는 " + (quickDayLabel(selectedDate) || selectedDate) + "입니다. 초안의 거래일(" + (quickDayLabel(draft.transaction_date) || draft.transaction_date || "미입력") + ")을 유지했습니다. 날짜를 확인해 주세요.";'), "D-2 날짜가 엇갈렸다는 안내의 두 날짜도 같은 글(조사는 ‘거래일(…)을’ 로 날짜 글과 상관없이 맞다)"), "conflict text");
check(() => ok(!/input\.value \+ " 기록을 현재 가계부에 추가합니다\."/.test(v5), "D-1 옛 ISO 날짜 설명 글이 남지 않았다"), "old description gone");
check(() => ok(v5.includes('var target = section.querySelector("#smartInput") || section.querySelector("#amountInput") || section.querySelector("input:not([type=hidden]),select,button") || (panel && (panel.querySelector(".abQuickInputClose") || panel));'), "D-3 입력칸이 없는 시트는 [닫기]로(없으면 대화상자로) 초점을 옮긴다(S-10)"), "focus fallback");
check(() => ok(v5.includes('<button type="button" class="abQuickInputClose" data-ab-quick-close aria-label="닫기"></button>') && v5.includes('role="dialog" aria-modal="true" aria-labelledby="abQuickInputTitle" aria-describedby="abQuickInputDescription" tabindex="-1"'), "D-3 초점이 갈 [닫기]와 대화상자(tabindex=-1)가 시트 머리에 있다"), "close button");
check(() => ok(v5.includes('if (event.key === "Escape") { event.preventDefault(); close(); return; }') && v5.includes("var DRAFT_KEY = \"abQuickInputDraft\";"), "D-4 Esc 닫기와 초안 키는 그대로다"), "escape and draft");

// ── D'. 독립 검토 반영(빠른 입력 자산·공용 입력 컨트롤러) — 동작은 validate-lucian-a-v22949·validate-lucian-a-native-contract-v22950 이 본다 ──
check(() => ok(homeJs.includes('after.setAttribute("data-ab-quick-block", foreignNeeded() ? "foreign" : splitNeeded() ? "split" : confirmType && !manual.type ? "type" : invalidAmount ? "amount" : invalidDate ? "date" : !(cleanNumber() && validAmount()) ? "amount" : !String(memoField?.value || "").trim() ? "memo" : "");'), "D-5 공용 입력 컨트롤러가 저장을 막는 까닭을 안내 글과 같은 차례로 적는다"), "controller block");
check(() => ok(homeJs.includes('after.setAttribute("data-ab-quick-category", classificationPending ? "pending" : classificationFailed ? "failed" : "");'), "D-5 분류를 묻는 중인지도 값으로 적는다"), "controller category state");
check(() => ok(!quick.includes("수입 또는 지출을 직접") && !quick.includes("분류를 확인하고"), "D-5 빠른 입력 자산은 컨트롤러의 안내 글을 읽지 않는다"), "no hint-text coupling");
check(() => ok(!quick.includes("amount.focus("), "D-6 금액 단축 단추는 금액 칸으로 초점을 옮기지 않는다(3층 끝 → 1층으로 뛰지 않는다)"), "shortcut keeps focus");
check(() => ok(!/more\.open\s*=\s*true/.test(quick),"D-7 [고치기]는 3층을 늘 열지 않는다(그 칸이 3층에 있을 때만 — focusField 가 조상 details 를 연다)"), "fix opens only its tier");
check(() => ok(quick.includes("#add .seg[data-ab-fix-target]{outline:2px solid var(--ab12-accent);outline-offset:3px}"), "D-7 [고치기]가 구분으로 보낼 때 구분 묶음에 보이는 표시"), "type mark style");
check(() => ok(!/\.abInputFix\{[^}]*font-weight/.test(quick),"D-8 [고치기]의 굵기 선언은 없다(옛 단추 규칙 600 이 이긴다 — 먹지 않는 700 을 두지 않는다)"), "no dead font weight");

// ── E. 알림(방 전용 보기) ───────────────────────────────────────────────────
const SECRET = "validate-v229138-quick-sheet-secret";
const DAY = "2026-11-21";
const hex66 = (label) => createHash("sha256").update(`v229138-${label}`).digest("hex") + "ab";
const ROOM = hex66("room"), U1 = hex66("user-1"), U2 = hex66("user-2"), U_ALIAS = hex66("alias");
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const ROOM_HOUSEHOLD_NAME = "이 방의 공동 가계부";
const WEB_USER = "user-wifi";
function resetIsolateState() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_TRAFFIC_BUCKETS", "__AB_SKILL_RATE_BUCKETS"]) globalThis[name]?.clear?.();
  const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (cache) { cache.at = 0; cache.value = null; }
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}
async function say(fx, utterance, user) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } }, chat: { id: ROOM, type: "botGroupKey", properties: { botGroupKey: ROOM } } };
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET },
    body: JSON.stringify({ bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await response.text();
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
}
class Jar {
  constructor() { this.items = new Map(); }
  take(lines) {
    for (const line of lines) {
      const [pair, ...attrs] = line.split(";").map((item) => item.trim());
      const at = pair.indexOf("=");
      const name = pair.slice(0, at), value = pair.slice(at + 1);
      const maxAge = attrs.find((item) => /^max-age=/i.test(item));
      if (!value || (maxAge && Number(maxAge.split("=")[1]) <= 0)) this.items.delete(name); else this.items.set(name, value);
    }
  }
  header() { return [...this.items].map(([name, value]) => `${name}=${value}`).join("; "); }
  scope() { const raw = this.items.get("ab_user") || ""; const token = raw ? decodeURIComponent(raw) : ""; return token ? (token.slice(0, token.lastIndexOf(".")).split("|")[3] || "").replace(/^r:/, "") : ""; }
}
async function go(fx, path, { jar = null, cookie = "", accept = "text/html", navigate = true } = {}) {
  const jobs = [];
  const line = jar ? jar.header() : cookie;
  const headers = { "user-agent": PC, accept, ...(navigate ? { "sec-fetch-mode": "navigate", "sec-fetch-site": "none" } : { "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin" }), ...(line ? { cookie: line } : {}) };
  const response = await app.fetch(new Request(new URL(path, BASE).href, { headers }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (jar) jar.take(cookies);
  return { status: response.status, location: response.headers.get("location") || "", text: await response.text() };
}
const { PUBLIC_CONTENT_PATHS } = await import("../src/modules/public/site-config.js");
const roomSource = readFileSync(new URL("../src/modules/auth/kakao-room-open.js", import.meta.url), "utf8");
const allowBlock = (() => { const at = roomSource.indexOf("const ROOM_VIEW_PATHS_V229130 = new Set(["); return at < 0 ? "" : roomSource.slice(at, roomSource.indexOf("]);", at) + 3); })();
const ALLOW = new Set([...allowBlock.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]));
const opensInRoomView = (href) => { const pathname = new URL(String(href || ""), BASE).pathname; return ALLOW.has(pathname) || PUBLIC_CONTENT_PATHS.includes(pathname) || pathname === "/start-guide" || pathname.startsWith("/assets/"); };

await checkAsync(() => withClock(DAY, () => fixture(async (fx) => {
  resetIsolateState();
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  Object.assign(fx.env, KAKAO_ENV);
  delete fx.env.KAKAO_ROOM_VIEW_DISABLED;
  delete fx.env.KAKAO_ROOM_QUIET_LOGIN;
  try {
    await say(fx, "별빛국수 12000원", U1);
    await say(fx, "달빛라떼 4500원", U2);
    const u1 = fx.db.users.find((user) => user.kakao_user_key === U1);
    const household = fx.db.households.find((row) => row.name === ROOM_HOUSEHOLD_NAME && fx.db.household_members.some((m) => m.user_id === u1?.id && m.household_id === row.id && m.role === "owner"));
    if (!u1 || !household) throw new Error("room fixture not ready");
    const hh = String(household.id);
    const links = JSON.parse(fx.db.accountbook_settings.find((row) => row.key === "user_identity_links")?.value || "{}");
    links[`skill_identity:${U_ALIAS}`] = { user_id: WEB_USER, source: "skill", linked_at: `${DAY}T01:00:00Z` };
    const row = fx.db.accountbook_settings.find((item) => item.key === "user_identity_links");
    if (row) row.value = JSON.stringify(links); else fx.db.accountbook_settings.push({ key: "user_identity_links", value: JSON.stringify(links) });
    fx.db.household_members.push({ household_id: household.id, user_id: WEB_USER, role: "member", created_at: `${DAY}T01:00:00Z` });
    // 알림이 생기게: 이 방 가계부의 이번 달 전체 예산을 작게(넘침 → /budget-alerts 링크), 분류 없는 지출 한 건(→ /app 링크).
    fx.db.accountbook_budgets.push({ id: "v138-rv-total", household_id: household.id, month: "2026-11", category: "__total", amount: 1000, created_at: "2026-11-01T00:00:00.000Z" });
    fx.db.transactions.push({ id: "v138-rv-uncat", household_id: household.id, user_id: u1.id, transaction_date: "2026-11-20", type: "expense", amount: 3000, category: "", memo: "무언가", payment_method: "", source: "kakao", created_at: "2026-11-20T03:00:00.000Z" });
    resetIsolateState();
    const jar = new Jar();
    await go(fx, `/my?botUserKey=${U_ALIAS}&appUserId=1801267359&botGroupKey=${ROOM}`, { jar });
    if (jar.scope() !== hh) throw new Error(`no room view session (${jar.scope() || "none"})`);
    const roomHome = await go(fx, `/app?household_id=${hh}`, { jar });
    check(() => ok(roomHome.status === 200 && roomHome.text.includes('id="abRoomViewBand"'), `E 방 전용 보기 홈(띠) ${roomHome.status}`), "room home");
    // 방 전용 보기의 빠른 입력 칸에는 입력칸이 없다(시트를 열면 D-3 의 [닫기]로 초점이 간다).
    const roomAdd = addSection(roomHome.text);
    check(() => ok(roomAdd.includes("방 전용 보기에서는 기록할 수 없어요.") && !/<(input|select|textarea)\b(?![^>]*type="hidden")/.test(roomAdd) && !/<button\b/.test(roomAdd), "E·D-3 방 전용 보기의 빠른 입력 칸에는 입력칸·단추가 없다(초점이 갈 곳이 [닫기])"), "room add empty");
    const api = await go(fx, `/u/api/notifications?household=${hh}&month=2026-11`, { jar, accept: "application/json", navigate: false });
    let body = null;
    try { body = JSON.parse(api.text); } catch (_) { body = null; }
    check(() => ok(api.status === 200 && body?.ok === true && Array.isArray(body.notifications), `E-1 방 전용 보기로 알림을 읽는다(${api.status})`), "room notif api");
    const list = Array.isArray(body?.notifications) ? body.notifications : [];
    const over = list.find((n) => n.key === "budget-over:2026-11");
    const uncat = list.find((n) => n.key === "uncat:2026-11");
    check(() => ok(over && /^\/budget-alerts\?/.test(over.href) && over.closed === true, `E-1 열 수 없는 화면(/budget-alerts)의 알림에 closed: true (${JSON.stringify(over || null).slice(0, 160)})`), "closed on budget alerts");
    check(() => ok(uncat && /^\/app\?/.test(uncat.href) && !Object.prototype.hasOwnProperty.call(uncat, "closed"), `E-1 열리는 화면(/app)의 알림에는 closed 가 없다(${JSON.stringify(uncat || null).slice(0, 160)})`), "open on app");
    const wrong = list.filter((n) => (n.closed === true) === opensInRoomView(n.href));
    check(() => ok(list.length >= 2 && wrong.length === 0, `E-1 모든 알림의 closed 가 화면 링크 표시와 같은 기준이다(${list.length}건, 어긋남 ${wrong.map((n) => n.key).join(",") || 0})`), "closed rule");
  } finally {
    resetIsolateState();
  }
})), "방 전용 보기 알림 장면");

await checkAsync(() => withClock("2026-07-15", () => fixture(async (fx) => {
  // 넘침 알림(/budget-alerts 링크)을 만든다: 분류별 예산이 있으면 그 합이 전체 예산이라(budgetSummary) 기준 픽스처의 이번 달 분류별 예산을 빼고
  // 전체 예산(2,500,000원)을 1,000원으로 낮춘다(수입 예산 줄은 그대로).
  const budgets = fx.db.accountbook_budgets;
  for (let i = budgets.length - 1; i >= 0; i -= 1) {
    const row = budgets[i];
    if (row.household_id === "house-home" && row.month === "2026-07" && !String(row.category).startsWith("__")) budgets.splice(i, 1);
  }
  const total = budgets.find((row) => row.household_id === "house-home" && row.month === "2026-07" && row.category === "__total");
  if (!total) throw new Error("fixture total budget missing");
  total.amount = 1000;
  const api = await go(fx, "/u/api/notifications?household=house-home&month=2026-07", { cookie: fx.cookie, accept: "application/json", navigate: false });
  let body = null;
  try { body = JSON.parse(api.text); } catch (_) { body = null; }
  const list = Array.isArray(body?.notifications) ? body.notifications : [];
  check(() => ok(api.status === 200 && list.some((n) => /^\/budget-alerts\?/.test(n.href)), `E-2 보통 세션에도 /budget-alerts 알림이 있다(${api.status}, ${list.length}건)`), "normal notif api");
  check(() => ok(list.every((n) => !Object.prototype.hasOwnProperty.call(n, "closed")), "E-2 보통 세션의 알림에는 closed 키가 없다(응답 모양 그대로)"), "normal no closed");
})), "보통 세션 알림 장면");

// 알림 패널·배너(클라이언트): markClosed 를 원본 글 그대로 꺼내 돌린다.
for (const [name, source] of [["v5", v5], ["알림 자산", notif]]) {
  const at = source.indexOf("function markClosed(a, n) {");
  const end = source.indexOf("\n  }", at);
  check(() => {
    if (at < 0 || end < 0) throw new Error("markClosed 가 없다");
    const markClosed = new Function(`${source.slice(at, end + 4)}\nreturn markClosed;`)();
    const element = () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } });
    const closed = element(); markClosed(closed, { closed: true, href: "/budget-alerts" });
    eq(JSON.stringify(closed.attrs), JSON.stringify({ "data-ab-rv-off": "", "aria-disabled": "true", title: "로그인해야 열 수 있어요" }), `E-3 ${name}: closed 인 링크는 흐리게·aria-disabled·title`);
    for (const n of [{ href: "/app" }, { closed: false }, { closed: "true" }, null]) {
      const open = element(); markClosed(open, n);
      eq(Object.keys(open.attrs).length, 0, `E-3 ${name}: closed 가 true 가 아니면 그대로 (${JSON.stringify(n)})`);
    }
  }, `markClosed ${name}`);
  check(() => ok(source.includes('a.href = n.href || "#";\n      markClosed(a, n);') && source.includes('var a = document.createElement("a"); a.href = top.href || "#";\n    markClosed(a, top);'), `E-3 ${name}: 패널 목록과 배너 모두 markClosed 를 부른다`), `markClosed calls ${name}`);
}
check(() => ok(roomSource.includes(`const title = /\\stitle\\s*=/i.test(names) ? "" : ' title="로그인해야 열 수 있어요"';`), "E-3 서버의 링크 표시와 같은 title 글이다"), "same title");

// ── F. 첫 사용 안내 ─────────────────────────────────────────────────────────
check(() => ok(v5.includes("['a.homeFeedCalendar', '캘린더에서 날짜별 기록을 확인하세요.']") && !v5.includes("'.homeCalendarToggle a'"), "F-2 첫 사용 안내의 캘린더 단계는 a.homeFeedCalendar 를 찾는다(옛 .homeCalendarToggle 아님)"), "tour selector");

if (failures.length) {
  console.error(`빠른 입력 시트 3층 검사 실패 ${failures.length}건:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
done();
