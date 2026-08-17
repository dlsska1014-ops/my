// V22.8.93 — 통합 작업지시서 8.2(저장 직후 영향 피드백) + 9장(숫자 전환) 검사.
//
// 11장이 건 통과 조건은 셋이다:
//   · JS 를 끈 상태에서 모든 금액이 **완성된 글자**로 보인다
//   · 동작 줄이기를 켜면 회전 없이 최종 값
//   · 초기 HTML 증가가 라이브러리 때문이 아니다
//
// 9.3 이 이 장의 핵심이다. <number-flow> 는 JS 가 실행되기 전까지 비어 있으므로,
// 서버가 처음부터 <number-flow> 를 보내면 홈 P0 의 대표 숫자가 빈칸으로 뜬다 —
// 지금 구조에서 가장 큰 후퇴다. 그래서 서버는 완성된 글자 + data-ab-num 만 보내고,
// 스크립트는 **값이 처음 바뀌는 순간에만** 그 자리를 엘리먼트로 바꾼다.
// 이 파일은 그 계약이 지켜지는지를 렌더 결과와 소스 양쪽에서 본다.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";

// ---------------------------------------------------------------------------
// 9.4 로드 방식 — 버전 주소로 배포하고, 초기 HTML 에는 넣지 않는다
// ---------------------------------------------------------------------------
ok(source.includes('const NUMBER_FLOW_ASSET_PATH = "/assets/number-flow-v22893.mjs";'), "라이브러리를 버전 주소로 배포한다");
// CDN 을 런타임에 참조하지 않는다 — 카카오톡 인앱에서 외부 도메인이 막히는 경우가
// 있다. (영수증 OCR 의 tesseract 는 이 장 밖의 오래된 외부 의존이라 여기서 보지
// 않는다. 여기서 지키는 것은 "숫자 전환이 외부 도메인에 기대지 않는다"뿐이다.)
// (자산 본문 자체는 라이브러리 코드라 여기서 훑지 않는다. 주소를 정하는 두 자리 —
// 상수 선언과 어댑터의 import() — 만 보면 충분하다.)
const assetPathLine = (source.match(/^const NUMBER_FLOW_ASSET_PATH = .*$/m) || [""])[0];
eq(/https?:\/\//.test(assetPathLine), false, `자산 주소가 외부 도메인이 아니다 (${assetPathLine})`);
ok(assetPathLine.includes('"/assets/'), "자산은 같은 출처의 /assets 아래에 있다");
// 정적 import 로 바꾸면 이 자산이 초기 번들에 섞인다.
eq(/^import .*number-flow/m.test(source), false, "라이브러리를 정적으로 import 하지 않는다");

// ---------------------------------------------------------------------------
// 9.5 값 — 라이브러리의 기본값과 다른 것만 명시한다
// ---------------------------------------------------------------------------
const navStart = source.indexOf("function accountbookStage4NavClientMain");
const nav = source.slice(navStart, source.indexOf("\nfunction accountbookStage4NavJsAsset", navStart));
ok(nav.includes('var spin = { duration: 620, easing: "cubic-bezier(.2,.8,.2,1)" };'), "transform/spin 은 620ms · 지정 이징이다");
ok(nav.includes("flow.transformTiming = spin;") && nav.includes("flow.spinTiming = spin;"), "두 타이밍이 같은 값을 쓴다");
ok(nav.includes('flow.opacityTiming = { duration: 340, easing: "ease-out" };'), "opacityTiming 은 340ms ease-out 이다");
// 설정 시점: 업그레이드 후 · update() 전. 정의되기 전에 대입하면 죽은 속성이 된다.
ok(nav.indexOf('customElements.whenDefined("number-flow")') < nav.indexOf("flow.transformTiming"), "타이밍은 엘리먼트가 정의된 뒤에 대입한다");
ok(nav.indexOf("flow.transformTiming") < nav.indexOf("flow.update("), "타이밍은 첫 update() 전에 대입한다");
// 퍼센트는 비율을 받는다. 29 를 넘기면 Intl 이 다시 100 을 곱해 2,900% 가 된다.
ok(nav.includes('flow.format = { style: "percent" }'), "퍼센트는 Intl 의 percent 스타일로 그린다");
ok(source.includes("const budgetUsedRatio = Math.round(Math.max(0, budgetPercent || 0)) / 100;"), "서버는 퍼센트를 비율로 넘긴다");
ok(nav.includes('flow.style.lineHeight = "0.85"'), "line-height 0.85");
ok(nav.includes('flow.style.fontVariantNumeric = "tabular-nums"'), "자릿수가 늘어도 옆이 밀리지 않게 tabular-nums 를 쓴다");
// 기본값을 유지해야 하는 둘 — 건드리면 동작 줄이기가 무시되거나 중간 값이 실제 값처럼 읽힌다.
eq(/respectMotionPreference\s*=/.test(nav), false, "respectMotionPreference 를 끄지 않는다");
eq(/flow\.plugins\s*=/.test(nav), false, "plugins 를 쓰지 않는다(continuous 는 금액에서 중간 값이 실제 값처럼 읽힌다)");
eq(/flow\.trend\s*=/.test(nav), false, "trend 는 기본값(부호 따라)을 쓴다");
// 단위는 옆에 놓는 보통 글자다. numberPrefix/numberSuffix 는 숫자 데이터 안으로
// 들어가 자릿수와 함께 굴러가므로 "원"에는 쓰지 않는다.
eq(/numberSuffix|numberPrefix/.test(nav), false, "단위를 숫자 데이터 안에 넣지 않는다");
ok(nav.includes('host.setAttribute("aria-label", abFlowLabel('), "값이 바뀔 때마다 완성 문장을 다시 붙인다");
ok(nav.includes('(host.getAttribute("data-ab-num-unit") || "")'), "aria 문장에 단위까지 포함한다");
// 값이 그대로면 굴리지 않는다 — 바뀌지 않은 숫자가 구르면 거짓 신호가 된다.
ok(nav.includes("if (abNumValue(host) === Number(next)) return;"), "값이 그대로면 아무것도 하지 않는다");

// ---------------------------------------------------------------------------
// 8.2 게이지 — 숫자와 같은 620ms · 같은 이징, 동작 줄이기면 전환 없음
// ---------------------------------------------------------------------------
ok(source.includes(".homeProgress i{display:block;height:100%;background:#FEE500;border-radius:999px;transition:width 620ms cubic-bezier(.2,.8,.2,1)}"), "게이지는 숫자와 같은 620ms · 같은 이징으로 움직인다");
ok(source.includes("@media(prefers-reduced-motion:reduce){.homeProgress i{transition:none}}"), "동작 줄이기를 켜면 게이지 전환이 없다");
ok(nav.includes("function bindGaugeHandoff("), "게이지가 이전 값에서 출발하는 처리가 있다");
ok(nav.includes('bar.style.width = bar.getAttribute("data-ab-prev-used") + "%";'), "서버가 담아 준 이전 값에서 시작한다");

// ---------------------------------------------------------------------------
// 9.2 붙이지 않는 자리 — 목록·표·건수·날짜
// ---------------------------------------------------------------------------
// 거래 한 줄을 그리는 함수 안에 data-ab-num 이 들어가면 한 화면에서 30~50개가
// 한꺼번에 회전한다. 읽을 수 없고 스크롤이 걸린다.
const cards = source.slice(source.indexOf("function renderV8TxCards("), source.indexOf("function lastNDaysExpense("));
eq(cards.includes("data-ab-num"), false, "목록 안의 금액에는 붙이지 않는다");

const month = "2026-07";
const householdId = "house-home";
const fixture = await createV2265QaFixture();
try {
  const call = async (path) => {
    const response = await app.fetch(new Request(`${ORIGIN}${path}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
    return { status: response.status, text: await response.text(), headers: response.headers };
  };

  // -------------------------------------------------------------------------
  // 9.4 자산이 실제로 그 주소에서, 불변 캐시로, 바이트 그대로 내려온다
  // -------------------------------------------------------------------------
  const assetResponse = await app.fetch(new Request(`${ORIGIN}/assets/number-flow-v22893.mjs`), fixture.env, {});
  eq(assetResponse.status, 200, "라이브러리가 버전 주소에서 내려온다");
  const assetBytes = Buffer.from(await assetResponse.arrayBuffer());
  eq(assetResponse.headers.get("content-type"), "text/javascript; charset=utf-8", "모듈로 내려온다");
  eq(assetResponse.headers.get("cache-control"), "public, max-age=31536000, immutable", "1년 불변 캐시다");
  eq(assetResponse.headers.get("etag"), '"number-flow-v22893-mjs"', "ETag 가 주소와 맞는다");
  // 바이트 고정 — 내용이 바뀌면 주소를 함께 올려야 한다(불변 자산 규칙).
  eq(createHash("sha256").update(assetBytes).digest("hex"), "90e66faa389d74080139dbf264e87f1496138388940afab6bbef079f1a6407fd", "라이브러리 바이트가 고정돼 있다");
  eq(assetBytes.length, 23300, `번들 크기가 그대로다 (${assetBytes.length} bytes)`);
  // 원본 그대로인지 — 라이선스 표시와 커스텀 엘리먼트 등록이 살아 있어야 한다.
  const assetText = assetBytes.toString("utf8");
  ok(assetText.includes("number-flow v0.6.2") && assetText.includes("MIT"), "라이선스 표시가 남아 있다");
  ok(assetText.includes('customElements.define(n, t)'), "커스텀 엘리먼트 등록이 살아 있다");
  eq(/^import\s/m.test(assetText), false, "한 파일로 합쳐져 상대 경로 import 가 남아 있지 않다");

  // -------------------------------------------------------------------------
  // 통과 조건 1 — JS 를 끈 상태에서 모든 금액이 완성된 글자
  // -------------------------------------------------------------------------
  // 서버 응답이 곧 "JS 끈 상태"다. 여기에 빈 <number-flow> 가 하나라도 있으면
  // 그 숫자는 스크립트가 도착할 때까지 빈칸으로 보인다.
  for (const [label, path] of [
    ["홈", `/app?month=${month}&household_id=${householdId}`],
    ["소비 분석", `/my/analysis?month=${month}&household_id=${householdId}`],
    ["자산", `/budgets?month=${month}&household_id=${householdId}`],
  ]) {
    const page = await call(path);
    eq(page.status, 200, `${label} 화면이 열린다`);
    eq(page.text.includes("<number-flow"), false, `${label} 은 빈 엘리먼트를 보내지 않는다`);
    for (const match of page.text.matchAll(/<(b|span)([^>]*\bdata-ab-num=[^>]*)>([^<]*)</g)) {
      const text = match[3].trim();
      ok(text.length > 0, `${label}: data-ab-num 자리에 완성된 글자가 있다`);
      ok(/[\d,]/.test(text), `${label}: 완성된 글자가 실제 숫자다 (${text})`);
    }
  }

  // 값과 글자가 어긋나면 스크립트가 엉뚱한 값에서 출발한다.
  const home = await call(`/app?month=${month}&household_id=${householdId}`);
  const nums = [...home.text.matchAll(/<(?:b|span)[^>]*\bdata-ab-num="([^"]*)"(?:[^>]*?)>([^<]*)</g)];
  ok(nums.length >= 2, `홈 P0 의 숫자에 값이 실려 있다 (${nums.length}개)`);
  for (const [, raw, text] of nums) {
    const value = Number(raw);
    ok(isFinite(value), `data-ab-num 이 숫자다 (${raw})`);
    const shown = Number(text.replace(/[^\d]/g, ""));
    // 퍼센트는 비율로 실리므로(0.26 ↔ "26%") 100 을 곱해 견준다.
    const expected = raw.includes(".") ? Math.round(value * 100) : value;
    eq(shown, expected, `실린 값과 보이는 글자가 같다 (${raw} ↔ ${text})`);
  }
  // 9.1 이 정한 자리만 — 홈에서 세 자리를 넘기면 화면이 다시 시끄러워진다.
  ok(nums.length <= 3, `홈의 전환 대상은 9.1 이 정한 자리뿐이다 (${nums.length}개)`);

  // -------------------------------------------------------------------------
  // 통과 조건 3 — 초기 HTML 이 라이브러리 때문에 커지지 않는다
  // -------------------------------------------------------------------------
  eq(home.text.includes("number-flow"), false, "초기 HTML 은 라이브러리를 언급조차 하지 않는다");
  eq(home.text.includes("/assets/number-flow"), false, "초기 HTML 에 라이브러리 주소가 없다");
  // 어댑터도 초기 HTML 이 아니라 이미 내려가던 내비 자산 안에 있다.
  ok(source.includes('const ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH = "/assets/accountbook-nav-v22893.js";'), "어댑터는 이미 내려가던 자산에 실린다");
  const navAsset = await app.fetch(new Request(`${ORIGIN}/assets/accountbook-nav-v22893.js`), fixture.env, {});
  eq(navAsset.status, 200, "내비 자산이 새 주소에서 내려온다");
  ok((await navAsset.text()).includes('import("/assets/number-flow-v22893.mjs")'), "어댑터가 그 자산 안에 들어 있다");

  // -------------------------------------------------------------------------
  // 8.2 — 저장하고 돌아왔을 때만 게이지가 이전 값을 들고 온다
  // -------------------------------------------------------------------------
  const plain = await call(`/app?month=${month}&household_id=${householdId}`);
  eq(/data-ab-prev-used/.test(plain.text), false, "그냥 열었을 때는 이전 값이 없다(움직일 이유가 없다)");
  const saved = await call(`/app?month=${month}&household_id=${householdId}&msg=added`);
  eq(saved.status, 200, "저장하고 돌아온 화면이 열린다");
  const prev = saved.text.match(/data-ab-prev-used="(\d+)"/);
  ok(prev, "저장하고 돌아오면 이전 값이 실린다");
  const target = saved.text.match(/<div class="homeProgress"><i style="width:(\d+)%"/);
  ok(target, "게이지의 실제 값이 여전히 style 로 그려진다");
  ok(Number(prev[1]) <= Number(target[1]), `이전 값은 실제 값보다 작거나 같다 (${prev[1]}% → ${target[1]}%)`);
  ok(Number(prev[1]) >= 0 && Number(prev[1]) <= 100, "이전 값이 0~100% 안에 있다");
  // 이전 값은 방금 저장한 기록을 뺀 값이어야 한다 — 새 질의 없이 계산한다.
  const monthExpense = fixture.db.transactions
    .filter((t) => t.household_id === householdId && String(t.transaction_date).startsWith(month) && t.type !== "income");
  const newest = monthExpense.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  ok(newest, "이번 달에 지출 기록이 있다");
  eq(saved.text.includes("<number-flow"), false, "저장하고 돌아온 화면도 완성된 글자로 온다");

  // -------------------------------------------------------------------------
  // 9.2 — 첫 진입의 모든 숫자는 0 에서 올라오지 않는다
  // -------------------------------------------------------------------------
  // 서버가 완성된 글자를 보내고 스크립트가 값이 바뀔 때만 교체하므로, 첫 진입에서
  // 굴릴 이전 값 자체가 없다. 그 성질을 코드로 고정한다.
  eq(nav.includes("flow.update(0)"), false, "0 에서 올라오는 카운트업을 만들지 않는다");
  ok(nav.includes("flow.update(abNumValue(host));"), "첫 교체는 지금 화면에 있는 값에서 출발한다");
} finally {
  fixture.restore();
}

console.log(`V22.8.93 저장 직후 영향 피드백·숫자 전환 검사 통과 (${checks} checks)`);
