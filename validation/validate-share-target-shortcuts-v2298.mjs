// V22.9.8 — 카드 결제 알림을 공유하면 기록이 반쯤 적혀 있다.
//
// 이 앱의 강점은 이미 있는 한 줄 파서다. 카카오톡으로 "커피 4500 카카오페이" 를 보내면
// 금액·분류·결제수단이 붙는다. 그런데 사용자가 실제로 받는 것은 그 문장이 아니라
// 카드사 결제 알림이고, 그걸 옮기려면 앱을 열고 손으로 다시 쳐야 했다.
//
// 매니페스트에 share_target 을 두면 그 알림을 공유 시트에서 가계부로 넘길 수 있다.
// 새 파서가 필요 없다 — 이미 있는 것에 배선만 하면 된다.
//
// method 를 GET 으로 둔 이유: POST 공유는 multipart 라 서비스워커가 그 요청을 받아야
// 하는데, 이 앱에는 서비스워커가 없고 그것만을 위해 하나 들이면 캐시 수명·업데이트
// 문제를 새로 떠안는다. 텍스트 공유는 GET 으로 충분하다. (영수증 **사진** 공유는
// 그래서 범위 밖이다.)
//
// ── 이 검사가 보는 것 ──
// 매니페스트에 필드가 있는지가 아니라, **공유된 텍스트가 실제로 쓸 만한 값이 되는지**
// 를 본다. 필드만 확인하면 "공유는 되는데 빈칸으로 열리는" 상태를 통과시킨다.

import assert from "node:assert/strict";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const ORIGIN = "https://ttokttok-accountbook.com";

// ---------------------------------------------------------------------------
// 1) 매니페스트가 공유 대상과 바로가기를 알린다
// ---------------------------------------------------------------------------
const manifestResponse = await app.fetch(new Request(`${ORIGIN}/manifest.json`), {}, {});
eq(manifestResponse.status, 200, "매니페스트가 서빙된다");
eq(manifestResponse.headers.get("etag"), '"ab-manifest-v2298"', "내용이 바뀌었으므로 ETag 도 올라갔다");
const manifest = JSON.parse(await manifestResponse.text());

eq(manifest.share_target.method, "GET", "텍스트 공유는 GET 이다 — 서비스워커 없이 서버가 바로 받는다");
eq(manifest.share_target.action, "/app", "공유는 홈으로 들어온다");
ok(manifest.share_target.params.text && manifest.share_target.params.title, "제목과 본문을 모두 받는다");
ok(!manifest.share_target.enctype && !manifest.share_target.params.files,
  "파일 공유를 선언하지 않는다 — 서비스워커 없이 받을 수 없는 것을 받는 척하지 않는다");

eq(manifest.shortcuts.length, 3, "홈 화면 바로가기가 셋이다");
for (const [name, url] of [["빠른 입력", "/app#add"], ["이번 달 예산", "/budgets"], ["영수증 찍기", "/receipts"]]) {
  const shortcut = manifest.shortcuts.find((entry) => entry.name === name);
  ok(shortcut && shortcut.url === url, `바로가기 "${name}" 이 ${url} 로 간다`);
  ok(shortcut.short_name && shortcut.short_name.length <= 4, `"${name}" 은 좁은 자리용 짧은 이름을 갖는다`);
}

const fixture = await createV2265QaFixture();
try {
  const openHome = async (query = "") => {
    const url = `${ORIGIN}/app?month=2026-07&household_id=house-home${query}`;
    const response = await app.fetch(new Request(url, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone)" } }), fixture.env, {});
    eq(response.status, 200, `홈이 열린다${query ? " (공유 포함)" : ""}`);
    return response.text();
  };
  const smartInputOf = (html) => (html.match(/<input id="smartInput"[^>]*>/) || [""])[0];

  // -------------------------------------------------------------------------
  // 2) 공유된 텍스트가 입력칸에 들어온다 — 그리고 없으면 들어오지 않는다
  // -------------------------------------------------------------------------
  const notice = "[Web발신] 국민카드 승인 김OO 15,000원 스타벅스 강남점";
  const shared = smartInputOf(await openHome(`&share_text=${encodeURIComponent(notice)}`));
  ok(shared.includes(`value="${notice}"`), "공유된 알림이 한 줄 입력에 그대로 들어온다");
  ok(shared.includes('data-ab-shared="1"'), "공유로 들어왔다는 표시가 붙는다(입력 이벤트가 없으므로 스스로 파싱해야 한다)");

  const plain = smartInputOf(await openHome());
  ok(!plain.includes("value=") && !plain.includes("data-ab-shared"),
    "평소에는 입력칸이 비어 있다 — 공유가 없을 때도 뭔가 채워지면 안 된다");

  // 제목에만 담아 보내는 앱도 있다. 둘 중 하나만 와도 살아야 한다.
  const titleOnly = smartInputOf(await openHome(`&share_title=${encodeURIComponent("메가커피 4,500원")}`));
  ok(titleOnly.includes('value="메가커피 4,500원"'), "제목에만 담겨 와도 받는다");

  // 주소는 붙이지 않는다 — 금액·가맹점과 섞여 파서를 헷갈린다.
  const withUrl = smartInputOf(await openHome(`&share_text=${encodeURIComponent("커피 4500")}&share_url=${encodeURIComponent("https://example.com/promo/12345")}`));
  ok(!withUrl.includes("example.com"), "공유된 주소는 입력칸에 섞이지 않는다");

  // 넘어온 텍스트가 그대로 HTML 에 박히므로 따옴표가 속성을 깨면 안 된다.
  const nasty = smartInputOf(await openHome(`&share_text=${encodeURIComponent('커피 4500" onfocus="alert(1)')}`));
  ok(!/\sonfocus="/.test(nasty), "공유 텍스트가 속성이 되어 붙지 않는다");
  ok(nasty.includes("&quot; onfocus=&quot;"), "따옴표가 이스케이프돼 값 안에 그대로 남는다");
  // 값 밖으로 새지 않았는지: value 속성을 떼어내고 나면 위험한 글자가 남지 않아야 한다.
  eq((nasty.replace(/value="[^"]*"/, "").match(/onfocus/g) || []).length, 0, "value 밖에는 그 글자가 없다");

  // 길이 상한 — 긴 알림을 통째로 실어도 홈이 부풀지 않는다.
  const long = smartInputOf(await openHome(`&share_text=${encodeURIComponent("가".repeat(600))}`));
  const value = (long.match(/value="([^"]*)"/) || ["", ""])[1];
  ok(value.length <= 200, `아주 긴 공유 텍스트는 잘린다 (${value.length}자)`);

  // -------------------------------------------------------------------------
  // 3) 들어온 텍스트가 **쓸 만한 값**이 된다
  // -------------------------------------------------------------------------
  // 여기가 이 기능의 값어치다. 입력칸에 글자만 들어가고 금액·분류가 안 붙으면
  // 사용자는 어차피 손으로 다시 쳐야 한다.
  const rulesJs = await (await app.fetch(new Request(`${ORIGIN}/assets/ab-category-rules-v22915.js`), {}, {})).text();
  const shellJs = await (await app.fetch(new Request(`${ORIGIN}/assets/mobile-home-shell-v22915.js`), {}, {})).text();
  const win = {};
  new Function("window", rulesJs)(win);
  const start = shellJs.indexOf("function parseKoreanAmount(text){");
  const end = shellJs.indexOf("function applySmart(clearInput)");
  ok(start >= 0 && end > start, "홈이 받는 자산에서 파서를 떼어낼 수 있다");
  const parse = new Function("window", "document", shellJs.slice(start, end)
    + "\nreturn function(t){var ty=detectQuickType(t);return {amount:parseKoreanAmount(t),type:ty,category:inferQuickCategory(t,ty),payment:detectQuickPayment(t)};};")(win, { querySelectorAll: () => [] });

  // 실제 카드사 알림 모양 그대로다.
  for (const [text, expected] of [
    ["[Web발신] 국민카드 승인 김OO 15,000원 스타벅스 강남점", { amount: 15000, type: "expense", category: "카페/간식", payment: "국민카드" }],
    ["현대카드 승인 32,000원 이마트 일시불", { amount: 32000, type: "expense", category: "장보기", payment: "현대카드" }],
    ["카카오페이 8,900원 결제 배달의민족", { amount: 8900, type: "expense", category: "배달", payment: "카카오페이" }],
    ["[Web발신] KB국민 12/03 홍길동 급여 3,200,000원 입금", { amount: 3200000, type: "income", category: "급여", payment: "" }],
  ]) {
    const got = parse(text);
    eq(got.amount, expected.amount, `"${text.slice(0, 24)}…" 금액을 읽는다`);
    eq(got.type, expected.type, `"${text.slice(0, 24)}…" 수입·지출을 가른다`);
    eq(got.category, expected.category, `"${text.slice(0, 24)}…" 분류를 찾는다`);
    eq(got.payment, expected.payment, `"${text.slice(0, 24)}…" 결제수단을 찾는다`);
  }

  // 공유된 값이 들어왔을 때 스스로 한 번 파싱하는 배선이 살아 있는지.
  // 입력 이벤트가 한 번도 나지 않으므로 이 줄이 없으면 값만 있고 아무것도 안 채워진다.
  ok(shellJs.includes("data-ab-shared") && shellJs.includes("applySmart(false)"),
    "공유로 값이 들어오면 입력 이벤트 없이도 한 번 파싱한다");
} finally {
  fixture.restore();
}

console.log(`V22.9.8 공유 기록·바로가기 검사 통과 (${checks} checks)`);
