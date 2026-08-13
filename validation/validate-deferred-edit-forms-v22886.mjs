// V22.8.86 — 통합 작업지시서 4.5(지연 로드 계약) 검사.
//
// 홈 초기 HTML 이 실사용 부하에서 43,432 B 였고 그중 13.2 KiB 가 거래 행의 수정
// 폼이었다. 열어 보지도 않는 폼을 첫 응답에 실어 보내던 셈이다. 이 릴리스는 그것을
// <details> 를 열 때 받도록 옮긴다.
//
// 이 검사가 지켜야 하는 것은 크기만이 아니다. 초기 HTML 에서 뺀 기능은 JS 가 없거나
// 늦으면 도달할 수 없게 되기 쉽고, 새로 생긴 GET 경로는 남의 기록을 보여 줄 수 있다.
// 크기 · 도달 가능성 · 권한 셋을 함께 본다.

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

const fixture = await createV2265QaFixture();
try {
  const householdId = "house-home";
  const month = new Date().toISOString().slice(0, 7);
  const get = async (path, cookie = fixture.cookie) => {
    const headers = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" };
    if (cookie) headers.cookie = cookie;
    const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers }), fixture.env, {});
    return { response, text: await response.text() };
  };

  // 실사용 부하를 만든다. 6행 픽스처는 폼이 6개뿐이라 예산에 늘 들어가서,
  // 회귀를 잡으려면 실제로 사람들이 보는 밀도로 재야 한다.
  const categories = ["식비", "카페/간식", "교통/차량", "장보기", "주거/관리", "쇼핑", "의료/건강", "구독"];
  const payments = ["국민카드", "현대카드", "카카오페이", "현금", "계좌이체"];
  for (let index = 0; index < 200; index += 1) {
    const day = String((index % 28) + 1).padStart(2, "0");
    fixture.db.transactions.push({ id: `defer-${index}`, household_id: householdId, user_id: "user-bin", transaction_date: `${month}-${day}`, type: index % 9 === 0 ? "income" : "expense", amount: 1000 + (index * 137) % 90000, category: categories[index % categories.length], memo: `실사용 기록 ${index} 항목`, payment_method: payments[index % payments.length], source: "web", created_at: `${month}-${day}T09:00:00.000Z` });
  }

  // 1. PR2 통과 조건: 실사용 홈 초기 HTML 34 KiB 이하.
  const home = await get(`/app?month=${month}&household_id=${householdId}`);
  eq(home.response.status, 200, "실사용 부하에서 홈이 렌더된다");
  const homeBytes = Buffer.byteLength(home.text);
  ok(homeBytes <= 34 * 1024, `홈 초기 HTML 이 34 KiB 이하다 (${homeBytes} bytes, 예산 ${34 * 1024})`);

  // 2. 뺀 것이 실제로 빠졌는지. 폼이 하나라도 남아 있으면 예산은 다시 오른다.
  eq((home.text.match(/class="v8-edit"/g) || []).length, 0, "초기 HTML 에 수정 폼이 하나도 없다");
  eq((home.text.match(/formaction="\/admin\/delete"/g) || []).length, 0, "초기 HTML 에 삭제 버튼이 없다");

  // 3. 대신 지연 로드 계약과 JS 없는 대체 경로가 행마다 있어야 한다.
  const slots = (home.text.match(/data-ab-edit-src="/g) || []).length;
  const links = (home.text.match(/class="v8-editOpen"/g) || []).length;
  ok(slots > 0, `지연 로드 슬롯이 있다 (${slots}개)`);
  eq(links, slots, "슬롯마다 JS 없이 쓸 링크가 하나씩 있다");

  // 4. 스크립트는 이미 받고 있던 내비 자산에 넣었다. 홈 HTML 에 <script> 가
  //    늘지 않아야 "초기 HTML 증가 0" 이 성립한다.
  eq((home.text.match(/<script\b[^>]*\bsrc="/g) || []).length, 4, "홈이 부르는 외부 스크립트 수가 그대로다");
  ok(home.text.includes('src="/assets/accountbook-nav-v22893.js"'), "지연 로드 처리가 들어간 내비 자산을 새 주소로 받는다");
  const navAsset = await get("/assets/accountbook-nav-v22893.js", "");
  eq(navAsset.response.status, 200, "새 내비 자산이 서빙된다");
  ok(navAsset.text.includes("data-ab-edit-src"), "내비 자산이 지연 로드 처리를 담고 있다");
  ok(navAsset.text.includes("fragment=1"), "내비 자산이 조각을 요청한다");

  const target = fixture.db.transactions.find((row) => row.household_id === householdId);
  const editPath = `/transactions/edit?id=${encodeURIComponent(target.id)}`;

  // 5. 조각 응답. 개인 기록이므로 캐시에 남기지 않는다.
  const fragment = await get(`${editPath}&fragment=1`);
  eq(fragment.response.status, 200, "조각이 200 으로 온다");
  eq(fragment.response.headers.get("cache-control"), "no-store", "조각은 캐시에 남지 않는다");
  ok(fragment.text.startsWith("<form"), "조각은 슬롯에 그대로 넣을 수 있는 폼이다");
  ok(!fragment.text.includes("<html"), "조각에 문서 껍데기가 섞여 있지 않다");

  // 6. JS 없이 링크로 여는 온전한 화면. 이것이 없으면 초기 HTML 에서 뺀 순간
  //    기능이 사라진 것과 같다.
  const page = await get(editPath);
  eq(page.response.status, 200, "링크로 여는 수정 화면이 열린다");
  ok(page.text.includes('class="v8-edit"'), "그 화면에 수정 폼이 있다");
  ok(page.text.includes('data-nav-scope="user"'), "그 화면이 공통 내비를 쓴다");
  ok(page.text.includes('href="/assets/accountbook-shell-v22891.css"'), "그 화면이 공통 셸을 받는다");

  // 7. 권한. 새 GET 경로는 쓰기 경로와 같은 판정을 써야 한다 — 느슨하면 폼을 막는
  //    것이 아니라 남의 기록 내용을 보여 준다.
  const anonFragment = await get(`${editPath}&fragment=1`, "");
  eq(anonFragment.response.status, 403, "로그인 없이 조각을 받을 수 없다");
  ok(!anonFragment.text.includes(target.memo || "실사용"), "거부 응답이 기록 내용을 흘리지 않는다");

  const anonPage = await get(editPath, "");
  ok([302, 303].includes(anonPage.response.status), `로그인 없이 화면을 열면 로그인으로 보낸다 (${anonPage.response.status})`);

  const ghost = await get("/transactions/edit?id=does-not-exist&fragment=1");
  eq(ghost.response.status, 403, "없는 기록에 대해 폼을 만들지 않는다");

  // 8. return_to 는 앱 안 주소만 받는다(열린 리다이렉트·주입 방지).
  const evil = await get(`${editPath}&return_to=${encodeURIComponent("https://evil.example/steal")}`);
  eq(evil.response.status, 200, "바깥 주소를 넣어도 화면 자체는 열린다");
  ok(!evil.text.includes("evil.example"), "바깥 주소가 폼에 실리지 않는다");
  ok(evil.text.includes('name="return_to" value="/app'), "돌아갈 주소가 앱 안 경로로 대체된다");

  // 9. 검사가 결함을 잡는지 확인한다(작업지시서 11장). 폼을 만드는 함수가 한 곳이라
  //    삭제 버튼 계약이 조각·화면 양쪽에서 같아야 한다.
  for (const [name, html] of [["조각", fragment.text], ["화면", page.text]]) {
    const at = html.indexOf('formaction="/admin/delete"');
    ok(at > 0, `${name}에 삭제 버튼이 있다`);
    ok(html.slice(0, at).lastIndexOf("<form") > html.slice(0, at).lastIndexOf("</form>"), `${name}의 삭제 버튼 앞에 열린 폼이 있다`);
    ok(html.indexOf("</form>", at) > at, `${name}의 삭제 버튼이 소유 폼 안에 있다`);
  }
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.86 deferred edit forms (${checks} checks)`);
