// V22.9.124 — UI/UX 기준 점검: 좁은 화면의 터치 영역·표·폼 라벨·포커스.
//
// ── 이 파일이 왜 생겼는지 ──
// 2026-11-15 사용자가 준 네 가지 UI/UX 점검 기준(390·768·1440 반응형과 44px 터치 영역, 768 아래에서는 표를 쌓은 카드로, 가로 스크롤 없음,
// 폼은 입력칸 위 라벨, WCAG 2.2 AA 대비·포커스·이름·움직임 줄이기)으로 화면 36곳을 헤드리스 Chrome 으로 쟀다
// (review-artifacts/v124-prelaunch-polish-2026-11-15/audit/ux-criteria-audit.mjs). 가로 스크롤·대비 미달·이름 없는 조작 요소·움직임 줄이기 미적용은 0 이었고
// 남은 것은 아래였다. 이 검사는 고친 것이 그대로인지, 데스크톱 배치와 공개 화면의 글·표 마크업을 건드리지 않았는지를 오프라인으로 본다
// (실제 크기·겹침은 위 도구로 잰다).
//   P-1 좁은 화면(1023px 이하)에서 44px 에 못 미치던 조작 영역: 안내문 끝 ‘접기’ 34×17, 거래 탭 ‘홈으로’ 57×36, 조회 폼 고르기 칸·단추 40px,
//       키워드 삭제 40×44, 캘린더 ‘닫기’ 48×36·달 이동 76×38, 연간 ‘이전 해’ 34×40, 가계부 전환·모임 화면 단추 42px 등 → 셸 CSS 한 블록.
//       ‘접기’ 는 글줄 높이를 늘리지 않으려고 만든 단추라 높이는 그대로 두고 보이지 않는 덧칸(::after)으로 누르는 자리만 넓힌다.
//   P-2 정산(참여자별·송금 제안)·오늘 예산(분류별)·결제수단별 흐름 표는 390px 에서 옆으로 밀어야 부담액·정산 상태·송금 금액이 보였다
//       → 767px 이하에서 줄마다 카드로 쌓는다(.abStackTable, 칸 위에 data-label).
//   P-3 가로로 밀리는 표 상자(tabindex)의 포커스 표시가 약했다 → 윤곽선.
//   P-4 /goals 목표 추가 폼: 다섯 칸 가운데 둘만 입력칸 위에 이름이 있었다 → 다섯 칸 모두 위에 이름, 자리표시는 예시로.
//   P-5 공개 화면: 열이 넷 이상인 표(개인정보 항목·위탁 표 등)는 600px 이하에서 카드로(표·칸 마크업은 그대로 두고 감싸개 표식과 CSS 로만),
//       /demo 계산 입력칸 16px(13px 이라 iOS 가 확대), 머리의 서비스 이름 링크 높이 44px. 공개 화면의 글자는 바꾸지 않았다.
//   P-6 셸 CSS 가 바뀌어 주소를 v22993 → v229124 로 올렸다. 옛 주소는 옛 바이트로 계속 내려간다(이미 받아 간 화면용).
// 독립 검토 1회(2026-11-15, P1·P2 없음·P3 6) 반영: 목표 폼 입력칸이 이름 칸 안으로 들어가며 700px 위에서 13px 로 줄던 것(16px 규칙),
// 공개 표 쌓기 규칙의 :is() 를 풀어 씀(모르는 브라우저에서 머리글 줄만 사라지고 칸은 표 그대로 잘리던 것), 900~1023px 에서 링크가 든 표 줄이 커지던 것(바깥 여백),
// 쌓인 카드의 빈 줄이 굵게 나오던 것, 연간 해 이동의 못 누르는 쪽 크기, 그리고 이 검사의 빈틈 셋(폭 조건 밖 규칙을 모든 줄로 셈 · 공개 화면을 사이트맵 전체로 · 목표 폼 16px).
//
// ── 실행 ──
//   node validation/validate-prelaunch-polish-v229124.mjs
//   V229124_SOFT=1 은 옛 번들에 이 검사를 돌려 실패 수를 셀 때만 쓴다(실패를 모아 끝에 센다).
import { createHash } from "node:crypto";
import { app, BASE, ctx, counter, fixture, page, withClock } from "./lib-audit-v22934.mjs";

const t = counter("PASS: V22.9.124 prelaunch polish");
const SOFT = process.env.V229124_SOFT === "1";
const softFailures = [];
const ok = (value, message) => { if (SOFT && !value) { softFailures.push(message); return; } t.ok(!!value, message); };
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const H = "household_id=house-home";
const NL = String.fromCharCode(10);
const BLOCK_CLOSE = `${NL}}${NL}`;
const count = (text, needle) => text.split(needle).length - 1;
const sha = (text) => createHash("sha256").update(text).digest("hex");
const asset = async (path) => {
  const response = await app.fetch(new Request(`${BASE}${path}`), {}, ctx);
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, text: body.toString("utf8"), sha: sha(body), cache: String(response.headers.get("cache-control") || ""), etag: String(response.headers.get("etag") || "") };
};
async function scene(name, task) {
  try { await task(); } catch (error) { if (!SOFT) throw error; softFailures.push(`${name}: ${error && error.message}`); }
}

// SHELL = 지금 화면이 부르는 셸 CSS 주소(뒤 판에서 올라간다). V124_SHELL = 이 판이 만든 주소 — V22.9.125 부터는 옛 주소로 보관되어
// 이 판의 바이트를 그대로 낸다. ‘블록을 빼면 옛 스타일시트와 같다’ 는 이 판의 바이트(V124_SHELL)로 본다.
const SHELL = "/assets/accountbook-shell-v229136.css";
const V124_SHELL = "/assets/accountbook-shell-v229124.css";
const OLD_SHELL = "/assets/accountbook-shell-v22993.css";
const MARK = "/* ── V22.9.124 (UI/UX 기준 점검";
const M1023 = "@media(max-width:1023px){";
const M767 = "@media(max-width:767px){";
const FOCUS_RULE = "body.abV22812Shell .tableWrap:focus-visible{outline:2px solid var(--ab12-action,#2457d6);outline-offset:2px}";

// ── P-6 주소 ──
const css = await asset(SHELL);
const old = await asset(OLD_SHELL);
const blockAt = css.text.indexOf(MARK);
const blockEnd = blockAt < 0 ? -1 : css.text.indexOf(BLOCK_CLOSE, css.text.indexOf(M767, blockAt)) + BLOCK_CLOSE.length;
const block = blockAt < 0 ? "" : css.text.slice(blockAt, blockEnd);
const css124 = await asset(V124_SHELL);
const blockAt124 = css124.text.indexOf(MARK);
const blockEnd124 = blockAt124 < 0 ? -1 : css124.text.indexOf(BLOCK_CLOSE, css124.text.indexOf(M767, blockAt124)) + BLOCK_CLOSE.length;
await scene("P-6", async () => {
  eq(css.status, 200, "P-6 새 셸 CSS 주소가 내려간다");
  ok(css.cache.includes("immutable") && css.etag.includes(SHELL.match(/-(v\d+)\.css$/)[1]), "P-6 새 주소는 불변 자산이고 ETag 가 같은 판이다");
  eq(css124.status, 200, "P-6 이 판이 만든 주소(v229124)도 계속 내려간다");
  ok(css124.cache.includes("immutable") && css124.etag.includes("v229124"), "P-6 v229124 주소는 불변 자산이고 ETag 가 같은 판이다");
  eq(old.status, 200, "P-6 옛 셸 CSS 주소도 계속 내려간다(이미 받아 간 화면용)");
  eq(old.sha, "e5da88f98b1404f6f932820648077e75a1d7ee513f09934ca54217308a965e56", "P-6 옛 주소의 바이트는 운영 V22.9.93~123 이 쓰던 그대로다");
  ok(!old.text.includes("abStackTable") && !old.text.includes(MARK), "P-6 옛 주소에는 이번 판 규칙이 없다");
  eq(count(css.text, MARK), 1, "P-6 새 주소에 이번 판 블록이 한 번 있다");
  eq(count(css124.text, MARK), 1, "P-6 v229124 주소에 이번 판 블록이 한 번 있다");
  ok(blockAt > 0 && blockEnd > blockAt, "P-6 블록의 처음과 끝을 찾는다");
  ok(blockAt124 > 0 && blockEnd124 > blockAt124, "P-6 v229124 주소에서도 블록의 처음과 끝을 찾는다");
  // 이번 블록을 빼면 옛 주소와 바이트까지 같다(다른 규칙은 건드리지 않았다). V22.9.125 가 다른 규칙의 값을 바꿨으므로 이 판의 바이트(v229124 주소)로 본다.
  eq(sha(css124.text.slice(0, blockAt124) + css124.text.slice(blockEnd124)), old.sha, "P-6 블록을 빼면 옛 스타일시트와 바이트까지 같다");
  // 블록은 V22.9.40 (C) 점진적 최신 규칙 블록 앞에 있다(그 블록은 셸 CSS 맨 끝에 있어야 한다 — validate-ui-perf-v22940).
  ok(blockEnd <= css.text.indexOf("/* ── V22.9.40 (C) 점진적 최신 규칙 ──"), "P-6 블록은 V22.9.40 (C) 블록 앞에 있다");
});

// ── P-1·P-2·P-3 셸 CSS 블록 ──
const media1023End = block.indexOf(BLOCK_CLOSE, block.indexOf(M1023));
const media1023 = block.slice(block.indexOf(M1023), media1023End);
const media767 = block.slice(block.indexOf(M767));
const stripComments = (text) => { let out = text; for (let at = out.indexOf("/*"); at >= 0; at = out.indexOf("/*")) { const end = out.indexOf("*/", at); if (end < 0) return out.slice(0, at); out = out.slice(0, at) + out.slice(end + 2); } return out; };
await scene("P-1", async () => {
  ok(media1023.startsWith(M1023) && media767.startsWith(M767) && block.indexOf(M1023) < block.indexOf(M767), "P-1 좁은 화면 규칙은 두 폭 조건 안에 있다");
  eq(count(block, "@media"), 2, "P-1 블록의 폭 조건은 둘뿐이다");
  // 폭 조건 밖에 있는 것은 표 상자 포커스 표시 하나뿐이다(데스크톱 배치를 건드리지 않는다). 주석을 뺀 모든 줄을 센다.
  const outside = block.slice(0, block.indexOf(M1023)) + block.slice(media1023End + BLOCK_CLOSE.length, block.indexOf(M767));
  const outsideLines = stripComments(outside).split(NL).map((line) => line.trim()).filter(Boolean);
  eq(JSON.stringify(outsideLines), JSON.stringify([FOCUS_RULE]), "P-1·P-3 폭 조건 밖의 규칙은 표 상자 포커스 윤곽선 하나뿐이다");
  // 폭 조건 안의 줄은 모두 셸 화면에만 걸리는 규칙이다(다른 선택자가 끼어들지 않는다).
  for (const [name, media] of [["1023px", media1023], ["767px", media767]]) {
    const lines = stripComments(media).split(NL).map((line) => line.trim()).filter(Boolean);
    const body = lines.slice(1).filter((line) => line !== "}");
    ok(body.length >= 10 && body.every((line) => line.startsWith("body.abV22812Shell ") && line.endsWith("}")), `P-1 ${name} 조건 안의 줄은 모두 ‘body.abV22812Shell …{…}’ 한 줄 규칙이다`);
  }
  for (const rule of [
    "body.abV22812Shell .abHeadNote .abHeadNoteToggle{position:relative}",
    'body.abV22812Shell .abHeadNote .abHeadNoteToggle::after{content:"";position:absolute;left:-5px;right:-5px;top:50%;height:44px;transform:translateY(-50%)}',
    "body.abV22812Shell .txTabHead .txTabHome{min-height:44px!important}",
    "body.abV22812Shell .yearNav>a,body.abV22812Shell .yearNav>span{min-width:44px!important;min-height:44px!important;justify-content:center}",
    "body.abV22812Shell .accountSecurity>a,body.abV22812Shell .dangerZone .reauthButton,body.abV22812Shell .tmpl .templateStart{min-height:44px!important}",
    "body.abV22812Shell .miniRow .mini{min-width:48px;min-height:44px!important}",
    "body.abV22812Shell .ckList>li>a{padding-top:10px!important;padding-bottom:10px!important}",
    "body.abV22812Shell form.filters.abV5ControlBar :is(select,button,input:not([type=hidden])){min-height:44px!important}",
    "body.abV22812Shell .kwChip .kwRemove{width:44px!important;height:44px!important;min-height:44px!important}",
    "body.abV22812Shell .homeCalendar .calHead .calClose{display:inline-flex!important;align-items:center;min-height:44px}",
    "body.abV22812Shell .homeCalendar .calNav>a{min-height:44px!important}",
    "body.abV22812Shell .abAnalysisViews>a,body.abV22812Shell .abV5HeaderActions>a{min-height:44px!important}",
    "body.abV22812Shell .loginOptional>summary{min-height:44px!important}",
    "body.abV22812Shell .loginLegal>a{min-width:44px;justify-content:center}",
    // 표 안의 링크: 누르는 자리는 44px, 줄 높이는 바깥 여백(-12px)으로 그대로 둔다(900~1023px 에서 줄이 커지지 않게 — 독립 검토).
    "body.abV22812Shell table.abStackTable>tbody>tr>td>a:not(.regLink):not(.mini){display:inline-flex;align-items:center;min-width:44px;min-height:44px;margin-block:-12px}",
    "body.abV22812Shell .abLinkRow>a{display:inline-flex;align-items:center;min-height:44px}",
  ]) ok(media1023.includes(`${NL}${rule}`), `P-1 1023px 이하: ${rule.slice(19, 80)}`);
  // ‘접기’ 는 글줄 높이를 늘리지 않는다: 예전 규칙(문장 끝에 이어 붙는 글자 단추, min-height:0)은 그대로이고 이번 블록은 그 단추의 높이·표시 방식을 바꾸지 않는다.
  ok(css.text.includes("body.abV22812Shell .abHeadNote .abHeadNoteToggle{display:inline-block!important;vertical-align:baseline;margin:0 0 0 6px!important;padding:0 6px!important;min-height:0!important;height:auto!important;"), "P-1 ‘접기’ 의 글줄 규칙은 그대로다");
  ok(!/abHeadNoteToggle\{[^}]*(?:min-height|display|height:44)/.test(media1023), "P-1 ‘접기’ 단추 자체의 높이는 바꾸지 않고 덧칸으로만 넓힌다");
});
await scene("P-2 css", async () => {
  for (const rule of [
    "body.abV22812Shell .tableWrap.abStackWrap{overflow:visible!important;",
    "body.abV22812Shell .tableWrap.abStackWrap::before{display:none!important;content:none!important}",
    "body.abV22812Shell table.abStackTable,body.abV22812Shell table.abStackTable>tbody{display:block!important;",
    "body.abV22812Shell table.abStackTable>thead{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%)!important;",
    "body.abV22812Shell table.abStackTable>tbody>tr{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));",
    "body.abV22812Shell table.abStackTable>tbody>tr>td[data-label]::before{content:attr(data-label);display:block;",
    "body.abV22812Shell table.abStackTable>tbody>tr>td:first-child,body.abV22812Shell table.abStackTable>tbody>tr>td[colspan],body.abV22812Shell table.abStackTable>tbody>tr>td:last-child:nth-child(even){grid-column:1/-1}",
    // 굵은 글씨는 줄의 이름 칸에만 — 한 칸짜리 안내 줄(colspan)은 굵게 하지 않는다(독립 검토).
    "body.abV22812Shell table.abStackTable>tbody>tr>td:first-child:not([colspan]){font-weight:700}",
    "body.abV22812Shell table.abStackTable>tbody>tr>td>.regLink{margin:0!important}",
  ]) ok(media767.includes(`${NL}${rule}`), `P-2 767px 이하: ${rule.slice(19, 90)}`);
  ok(!media767.includes("td:first-child{font-weight"), "P-2 한 칸짜리 안내 줄까지 굵게 하는 옛 규칙은 없다");
  // 머리글 줄은 지우지 않고 화면에서만 감춘다(display:none 이면 읽어 주는 도구에서도 사라진다).
  ok(!/abStackTable>thead\{[^}]*display:none/.test(media767), "P-2 머리글 줄을 display:none 으로 지우지 않는다");
  // 쌓는 규칙은 표식이 있는 표에만 걸린다(다른 표는 그대로).
  const selectors = media767.split(NL).filter((line) => line.startsWith("body.abV22812Shell")).map((line) => line.slice(0, line.indexOf("{")));
  ok(selectors.length >= 10 && selectors.every((selector) => selector.split(",").every((part) => part.includes(".abStackTable") || part.includes(".abStackWrap"))), "P-2 767px 규칙은 모두 표식(.abStackTable·.abStackWrap)이 있는 표에만 걸린다");
});

// ── P-2 화면: 표식과 data-label ──
const cellsOf = (html, tableStart) => {
  const table = html.slice(tableStart, html.indexOf("</table>", tableStart));
  const headers = [...table.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]);
  const rows = [...table.slice(table.indexOf("<tbody>")).matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td(?: data-label="([^"]*)")?[^>]*>/g)].map((cell) => cell[1] ?? null));
  return { headers, rows };
};
const STACK_TABLE = '<table class="abStackTable">';
const stackTables = (html) => { const out = []; for (let at = html.indexOf(STACK_TABLE); at >= 0; at = html.indexOf(STACK_TABLE, at + 1)) out.push(cellsOf(html, at)); return out; };
const labelsMatch = (table) => table.rows.length > 0 && table.rows.every((row) => (row.length === 1 && row[0] === null) || (row.length === table.headers.length && row.every((label, index) => label === table.headers[index])));
// 픽스처의 자료는 2026-07 에 있다 — 표에 줄이 있으려면 그 달로 그린다.
await scene("P-2 pages", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const settle = (await page(fx, `/split-summary?${H}`)).html;
  eq(count(settle, `<div class="tableWrap abStackWrap">${STACK_TABLE}`), 2, "P-2 고급 정산의 두 표(참여자별·송금 제안)에 쌓기 표식");
  const [people, transfers] = stackTables(settle);
  eq(JSON.stringify(people?.headers), JSON.stringify(["참여자", "낸 금액", "부담액", "정산 상태"]), "P-2 참여자별 정산 표의 머리글");
  ok(people && people.rows.some((row) => row.length === 4) && labelsMatch(people), "P-2 참여자별 정산의 칸마다 그 열의 머리글이 data-label 로 있다");
  eq(JSON.stringify(transfers?.headers), JSON.stringify(["보낼 사람", "받을 사람", "금액"]), "P-2 송금 제안 표의 머리글");
  ok(transfers && labelsMatch(transfers), "P-2 송금 제안의 칸마다 data-label(줄이 없으면 한 칸짜리 안내 줄)");
  ok(settle.includes('<p class="abLinkRow">'), "P-1 ‘환급 연결 미리보기’ 줄은 누르는 높이를 주는 표식을 단다");
  for (const path of ["/settlement-summary", "/meeting-settlement"]) eq(count((await page(fx, `${path}?${H}`)).html, STACK_TABLE), 2, `P-2 ${path} 도 같은 화면이다`);
  // 기록이 없는 달: 한 칸짜리 안내 줄(colspan)은 머리글 속성 없이 그대로다.
  const emptySettle = stackTables((await page(fx, `/split-summary?month=2026-01&${H}`)).html);
  ok(emptySettle.length === 2 && emptySettle.every((table) => labelsMatch(table)) && emptySettle.some((table) => table.rows.some((row) => row.length === 1 && row[0] === null)), "P-2 기록 없는 달의 안내 줄에는 data-label 을 달지 않는다");

  const today = (await page(fx, `/today-budget?${H}`)).html;
  eq(count(today, `<div class="tableWrap abStackWrap">${STACK_TABLE}`), 1, "P-2 오늘 예산의 분류별 표에 쌓기 표식");
  const [alerts] = stackTables(today);
  eq(JSON.stringify(alerts?.headers), JSON.stringify(["분류", "예산", "사용", "남음", "게이지", "상태"]), "P-2 분류별 초과/주의 표의 머리글");
  ok(alerts && alerts.rows.some((row) => row.length === 6) && labelsMatch(alerts), "P-2 분류별 표의 칸마다 data-label");
  eq(count((await page(fx, `/budget-alerts?${H}`)).html, STACK_TABLE), 1, "P-2 /budget-alerts 도 같은 화면이다");

  const payment = (await page(fx, `/payment-methods?${H}`)).html;
  ok(payment.includes(`<div class="tableWrap abStackWrap" tabindex="0" aria-label="결제수단별 흐름 표">${STACK_TABLE}<thead>`), "P-2 결제수단별 흐름 표에 쌓기 표식(글쇠로 들어가는 자리·이름은 그대로)");
  const [flow] = stackTables(payment);
  eq(JSON.stringify(flow?.headers), JSON.stringify(["결제수단", "지출 건수", "지출", "수입", "상태"]), "P-2 결제수단별 흐름 표의 머리글");
  ok(flow && flow.rows.some((row) => row.length === 5) && labelsMatch(flow), "P-2 결제수단 표의 칸마다 data-label");

  // 화면마다 새 셸 CSS 주소를 부르고 옛 주소는 부르지 않는다.
  for (const [name, html] of [["정산", settle], ["오늘 예산", today], ["결제수단", payment], ["홈", (await page(fx, `/app?month=2026-07&${H}`)).html], ["소비 분석", (await page(fx, `/my/analysis?month=2026-07&${H}`)).html]]) {
    ok(html.includes(`href="${SHELL}"`) && !html.includes(OLD_SHELL), `P-6 ${name} 화면은 새 셸 CSS 주소를 부른다`);
  }
})));

// ── P-4 목표 추가 폼 ──
await scene("P-4", () => fixture(async (fx) => {
  const goals = (await page(fx, `/goals?${H}`)).html;
  const formAt = goals.indexOf('<form id="goalAddForm"');
  const form = goals.slice(formAt, goals.indexOf("</form>", formAt));
  const fields = [...form.matchAll(/<label class="goalField (goalField[A-Za-z]+)"><span>([^<]+)<\/span><input name="([a-z]+)"/g)].map((m) => `${m[1]}|${m[2]}|${m[3]}`);
  eq(JSON.stringify(fields), JSON.stringify(["goalFieldName|목표 이름|name", "goalFieldEmoji|이모지|emoji", "goalFieldTarget|목표 금액|target", "goalFieldMonthly|월 납입액(선택)|monthly", "goalFieldDeadline|마감월(선택)|deadline"]), "P-4 다섯 칸 모두 입력칸 위에 보이는 이름이 있다");
  eq(count(form, "<input "), 5, "P-4 입력칸은 다섯 개이고 모두 이름 칸 안에 있다");
  ok(!form.includes("aria-label="), "P-4 보이는 이름이 있으니 숨은 이름(aria-label)을 겹쳐 두지 않는다");
  ok(form.includes('placeholder="예: 여행자금"') && form.includes('placeholder="예: 3,000,000"') && form.includes('placeholder="예: 200,000"'), "P-4 자리표시는 이름이 아니라 예시다(쉼표 든 금액은 서버가 받는다)");
  ok(goals.includes(".goalForm .goalFieldName{flex:2 1 210px}.goalForm .goalFieldTarget,.goalForm .goalFieldMonthly{flex:1 1 130px}"), "P-4 넓은 화면에서 이름 칸은 예전 입력칸과 같은 비율로 놓인다");
  ok(goals.includes('.goalForm input[name="name"],.goalForm button{grid-column:1/-1}.goalForm .goalFieldName{grid-column:1/-1}'), "P-4 좁은 화면에서 목표 이름 칸은 한 줄을 다 쓴다");
  // 이름 칸(label) 안의 입력칸은 옛 스타일의 ‘label 13px + input inherit’ 로 13px 이 된다 — 어느 폭에서나 16px 로 되돌린다(독립 검토, iOS 확대).
  ok(goals.includes('#goalAddForm label>input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]){font-size:16px!important}'), "P-4 이름 칸 안의 입력칸은 어느 폭에서나 16px 이다");
  ok(goals.includes('<button type="submit">추가</button>'), "P-4 추가 단추는 그대로다");
  // 조회 전용 가계부는 폼 카드를 감춘다 — 그 바꿔치기가 여전히 폼을 찾는다.
  ok(goals.includes('<section class="card"><h2>목표 추가</h2><form id="goalAddForm" class="goalForm" autocomplete="off">'), "P-4 폼 카드의 머리(조회 전용에서 감추는 자리)는 그대로다");
}));

// ── P-5 공개 화면 ──
await scene("P-5", () => fixture(async (fx) => {
  const open = async (path) => (await page(fx, path, { cookie: "" })).html;
  const styleOf = (html) => html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  const STACK_OPEN = "@media(max-width:600px){.pubTableWrap[data-stack]{overflow:visible;";
  const CELL = ".pubTableWrap[data-stack] .pubTable tbody ";
  const DEMO_RULE = '.pubDemo .pubDemoInputs label>input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]){font-size:16px!important}';
  const TABLE_RE = /<div class="pubTableWrap" role="region" aria-labelledby="([^"]+)" tabindex="0"( data-stack="1")?><table class="pubTable"><caption id="([^"]+)">[^<]*<\/caption><thead><tr>([\s\S]*?)<\/tr><\/thead><tbody>([\s\S]*?)<\/tbody><\/table><\/div>/g;
  const tablesOf = (html) => [...html.matchAll(TABLE_RE)].map((m) => ({
    id: m[1], captionId: m[3], stack: !!m[2], headers: [...m[4].matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((h) => h[1]),
    rows: [...m[5].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<(th|td)([^>]*)>/g)].map((cell) => cell[1])),
    // 칸 마크업은 그대로다: 몸통에는 <tr>, <th scope="row">, <td> 꼴만 있고 속성을 더하지 않았다.
    plainCells: !m[5].includes("data-label") && [...m[5].matchAll(/<(tr|th|td)([^>]*)>/g)].every((tag) => tag[2] === "" || (tag[1] === "th" && tag[2] === ' scope="row"')),
  }));
  const labelRules = (table) => table.headers.map((label, index) => `.pubTableWrap[aria-labelledby="${table.id}"] tbody ${index === 0 ? "th" : `td:nth-child(${index + 1})`}::before{content:"${label}"}`);
  // 사이트맵의 공개 화면 전부를 본다.
  const sitemap = await open("/sitemap.xml");
  const paths = [...sitemap.matchAll(/<loc>https:\/\/malhaebook\.com([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
  ok(paths.length >= 55 && paths.includes("/privacy") && paths.includes("/demo") && paths.includes("/"), `P-5 사이트맵에서 공개 화면 ${paths.length}곳을 읽는다`);
  let stacked = 0, plain = 0, pagesWithTables = 0, pagesWithStack = 0;
  for (const path of paths) {
    const html = await open(path);
    const style = styleOf(html);
    const tables = tablesOf(html);
    eq(tables.length, count(html, '<table class="pubTable">'), `P-5 ${path} 공개 표는 모두 같은 꼴(감싸개 + 표)이다`);
    if (tables.length) pagesWithTables += 1;
    for (const table of tables) {
      const wide = table.headers.length >= 4;
      eq(table.stack, wide, `P-5 ${path} 표 ${table.id}(${table.headers.length}열)는 열이 넷 이상일 때만 쌓기 표식을 단다`);
      ok(table.id === table.captionId && table.plainCells, `P-5 ${path} 표 ${table.id} 의 칸 마크업은 그대로다(속성을 더하지 않는다)`);
      // 줄마다 첫 칸은 th, 나머지는 td 이고 칸 수가 머리글 수와 같다(머리글 규칙이 이 꼴에 기댄다).
      ok(table.rows.length > 0 && table.rows.every((row) => row.length === table.headers.length && row[0] === "th" && row.slice(1).every((tag) => tag === "td")), `P-5 ${path} 표 ${table.id} 의 줄은 th 하나 + td 들이고 칸 수가 머리글 수와 같다`);
      if (wide) { stacked += 1; ok(labelRules(table).every((rule) => style.includes(rule)), `P-5 ${path} 표 ${table.id} 의 칸마다 그 열의 머리글을 보이는 규칙이 있다`); }
      else { plain += 1; ok(!style.includes(`.pubTableWrap[aria-labelledby="${table.id}"]`), `P-5 ${path} 표 ${table.id}(좁은 표)에는 머리글 규칙이 없다`); }
    }
    const anyWide = tables.some((table) => table.stack);
    if (anyWide) pagesWithStack += 1;
    eq(count(style, STACK_OPEN), anyWide ? 1 : 0, `P-5 ${path} 쌓기 규칙은 넓은 표가 있는 화면에만 싣는다`);
    eq(count(html, 'data-stack="1"'), tables.filter((table) => table.stack).length, `P-5 ${path} 쌓기 표식은 넓은 표의 감싸개에만 있다`);
    eq(style.includes(DEMO_RULE), path === "/demo", `P-5 ${path} 계산 입력칸 16px 규칙은 /demo 에만 싣는다`);
    ok(style.includes(".pubBrand{display:flex;align-items:center;min-height:44px;"), `P-5 ${path} 머리의 서비스 이름 링크는 누르는 높이 44px`);
    if (anyWide) {
      const mediaAt = style.indexOf(STACK_OPEN);
      const mediaEnd = style.indexOf("}}", style.lastIndexOf(".pubTableWrap[aria-labelledby=")) + 2;
      const media = style.slice(mediaAt, mediaEnd);
      ok(media.includes(".pubTableWrap[data-stack] .pubTable thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);") && !/pubTable thead\{[^}]*display:none/.test(style), `P-5 ${path} 머리글 줄은 화면에서만 감춘다(display:none 아님)`);
      ok(media.includes(`${CELL}th,${CELL}td{display:block!important;`) && media.includes(`${CELL}th::before,${CELL}td::before{display:block;`), `P-5 ${path} 칸을 세로로 쌓고 칸 위에 머리글 자리를 둔다`);
      // :is() 를 모르는 브라우저가 칸 규칙만 버리면 머리글 줄은 감춰지고 칸은 표 그대로 잘린다 — 쌓기 규칙에는 :is() 를 쓰지 않는다(독립 검토).
      ok(!media.includes(":is("), `P-5 ${path} 쌓기 규칙에 :is() 를 쓰지 않는다`);
      // 머리글은 CSS 문자열 안에 들어간다: 따옴표·역슬래시·꺾쇠가 없어야 한다.
      const contents = [...media.matchAll(/::before\{content:"([^}]*)"\}/g)].map((m) => m[1]);
      ok(contents.length > 0 && contents.every((value) => value.length > 0 && !/["\\<>]/.test(value)), `P-5 ${path} 머리글 글자에 CSS 를 깨는 글자가 없다`);
      // 쌓기 규칙과 머리글 규칙은 600px 이하 조건 안에만 있다(넓은 화면의 표는 그대로다).
      ok(!style.slice(0, mediaAt).includes("[data-stack]") && !style.slice(mediaEnd).includes("[data-stack]") && !style.slice(0, mediaAt).includes(".pubTableWrap[aria-labelledby=") && !style.slice(mediaEnd).includes(".pubTableWrap[aria-labelledby="), `P-5 ${path} 쌓기 규칙은 600px 이하 조건 안에만 있다`);
    } else ok(!style.includes("[data-stack]") && !style.includes(".pubTableWrap[aria-labelledby="), `P-5 ${path} 넓은 표가 없으면 쌓기 규칙을 싣지 않는다`);
    ok(!html.includes("accountbook-shell-"), `P-5 ${path} 공개 화면은 셸 CSS 를 부르지 않는다`);
  }
  ok(pagesWithTables >= 40 && pagesWithStack >= 20 && stacked >= 40 && plain >= 40, `P-5 표가 있는 화면 ${pagesWithTables}곳(쌓는 표가 있는 화면 ${pagesWithStack}곳), 넓은 표 ${stacked}개·좁은 표 ${plain}개를 봤다`);
}));

if (SOFT) { console.log(`SOFT: 실패 ${softFailures.length}건`); for (const line of softFailures) console.log(`  - ${line}`); }
t.done();
