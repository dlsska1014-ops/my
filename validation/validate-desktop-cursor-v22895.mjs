// V22.8.95 — 통합 작업지시서 10장(데스크톱 커서) 검사.
//
// 통과 조건은 "10.5 전부"와 "되돌리기 가장 쉬운 커밋으로 유지"다.
//
// 이 효과는 **덧붙임이고 정보가 아니다.** 점이 꺼진 상태에서도 모든 상태가 그대로
// 읽혀야 하고, 이것 때문에 다른 규칙을 바꾸지 않는다. 그래서 이 파일은 "점이
// 예쁜가"가 아니라 **꺼졌을 때 아무것도 남지 않는가**를 주로 본다.
//
// 브라우저가 없으므로 실제 그려지는 모습은 확인할 수 없다. 확인할 수 있는 것은
// 켜는 조건·해제 경로·자산 경계이고, 그건 전부 여기서 잡는다.

import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";

const navStart = source.indexOf("function accountbookStage4NavClientMain");
const nav = source.slice(navStart, source.indexOf("\nfunction accountbookStage4NavJsAsset", navStart));
const assetStart = source.indexOf("const AB_CURSOR_ASSET_SOURCE = ");
const assetEnd = source.indexOf("\n// V22.8.93 (9.4)", assetStart);
const cursorSource = source.slice(assetStart, assetEnd);

// ---------------------------------------------------------------------------
// 10.1 켜는 조건 — 넷을 모두 만족할 때만
// ---------------------------------------------------------------------------
ok(nav.includes('window.matchMedia("(hover:hover) and (pointer:fine)").matches'), "진짜 마우스가 있는 기기에서만 켠다");
ok(nav.includes('window.matchMedia("(prefers-reduced-motion:reduce)")'), "동작 줄이기를 본다");
ok(nav.includes(">= 900"), "화면 폭 900px 이상에서만 켠다");
ok(nav.includes('fetch("/cursor-preference"'), "사용자가 끄지 않았는지 확인한다");
// 조건 판정은 로더가 한다 — 스크립트를 받은 뒤 판정하면 "내려오지 않음"이 깨진다.
ok(nav.indexOf("abCursorAllowed()") < nav.indexOf('import("/assets/ab-cursor-v22895.mjs")'), "조건을 먼저 보고 그 다음에 내려받는다");
// 값을 못 읽으면 켜지 않는다 — 꺼 둔 사람에게 잘못 켜는 쪽이 더 나쁘다.
ok(nav.includes('return response.ok ? response.json() : { on: false };'), "설정을 못 읽으면 켜지 않는다");
ok(nav.includes("if (!pref || pref.on === false || !abCursorAllowed()) return null;"), "내려받기 직전에 조건을 한 번 더 본다");

// ---------------------------------------------------------------------------
// 10.3 값과 로드 방식
// ---------------------------------------------------------------------------
ok(cursorSource.includes("(target.x - pos.x) / 10"), "따라오는 식은 원본과 같다(lag 10)");
ok(cursorSource.includes("(want - r) / 6"), "크기 변화는 6이다");
ok(cursorSource.includes("r, 0, Math.PI * 2") && cursorSource.includes("want = hit && !typing ? 22 : 9;"), "반지름은 9px / 22px 다");
ok(cursorSource.includes("alpha = hit && !typing ? 0.14 : 0.28;"), "알파는 0.28 / 0.14 다");
ok(cursorSource.includes("window.devicePixelRatio || 1"), "레티나에서 뿌옇지 않도록 devicePixelRatio 를 반영한다");
ok(cursorSource.includes("timer = setTimeout(sized, 150)"), "resize 는 150ms 디바운스다");
// 첫 mousemove 에서만 내려온다. 초기 HTML 증가 0바이트.
ok(nav.includes('window.addEventListener("mousemove", abCursorStart, { once: true });'), "첫 mousemove 에서 한 번만 내려받는다");

// ---------------------------------------------------------------------------
// 10.4 하지 않는 것
// ---------------------------------------------------------------------------
// 기본 커서를 숨기면 클릭 지점을 잃고 텍스트 선택이 어려워진다.
eq(/cursor\s*:\s*none/.test(cursorSource), false, "기본 커서를 숨기지 않는다");
// 꼬리·잔상은 이전 프레임을 지우지 않을 때 생긴다. 매 프레임 전부 지운다.
ok(cursorSource.includes("ctx.clearRect(0, 0, innerWidth, innerHeight);"), "매 프레임을 지워 꼬리·잔상을 만들지 않는다");
eq((cursorSource.match(/ctx\.arc\(/g) || []).length, 1, "점은 하나다");
for (const token of ["ripple", "magnet", "trail", "particles"]) {
  eq(cursorSource.includes(token), false, `${token} 을 만들지 않는다`);
}
// 이 효과가 상태 표시를 대체하지 않는다 — 포커스 링·호버 규칙을 건드리지 않았다.
eq(/:focus|:hover|outline/.test(cursorSource), false, "포커스·호버 표시를 이 점으로 대체하지 않는다");

const fixture = await createV2265QaFixture();
try {
  const get = async (path, cookie, headers = {}) => {
    const response = await app.fetch(new Request(`${ORIGIN}${path}`, { headers: { cookie, "user-agent": "Mozilla/5.0", ...headers } }), fixture.env, {});
    return { status: response.status, text: await response.text(), headers: response.headers };
  };

  // -------------------------------------------------------------------------
  // 10.5 · 자산 경계 — 스크립트는 별도 파일, 1.5 KB 이하
  // -------------------------------------------------------------------------
  const asset = await app.fetch(new Request(`${ORIGIN}/assets/ab-cursor-v22895.mjs`), fixture.env, {});
  eq(asset.status, 200, "커서 스크립트가 버전 주소에서 내려온다");
  const bytes = Buffer.from(await asset.arrayBuffer());
  eq(asset.headers.get("content-type"), "text/javascript; charset=utf-8", "모듈로 내려온다");
  eq(asset.headers.get("cache-control"), "public, max-age=31536000, immutable", "1년 불변 캐시다");
  eq(asset.headers.get("etag"), '"ab-cursor-v22895-mjs"', "ETag 가 주소와 맞는다");
  const gzipped = gzipSync(bytes).length;
  ok(gzipped <= 1536, `스크립트가 1.5 KB 이하다 (gzip ${gzipped} bytes, raw ${bytes.length})`);
  // 라이브러리를 가져오지 않고 직접 쓴다(원본은 React 컴포넌트다).
  eq(/^import\s/m.test(bytes.toString("utf8")), false, "다른 모듈을 끌어오지 않는다");

  // -------------------------------------------------------------------------
  // 10.5 · 초기 HTML 증가 0바이트, 그리고 모바일에는 아예 내려가지 않음
  // -------------------------------------------------------------------------
  for (const [label, path] of [["홈", "/app?month=2026-07&household_id=house-home"], ["전체 메뉴", "/menu?month=2026-07&household_id=house-home"]]) {
    const page = await get(path, fixture.cookie);
    eq(page.status, 200, `${label} 화면이 열린다`);
    eq(page.text.includes("ab-cursor"), false, `${label} 초기 HTML 에 커서 스크립트 주소가 없다`);
    eq(page.text.includes("abCursorCanvas"), false, `${label} 초기 HTML 에 캔버스가 없다`);
  }
  // 로더는 이미 내려가던 내비 자산 안에 있다 — 초기 HTML 이 늘지 않는 이유다.
  const navAsset = await app.fetch(new Request(`${ORIGIN}/assets/accountbook-nav-v22893.js`), fixture.env, {});
  const navText = await navAsset.text();
  ok(navText.includes('import("/assets/ab-cursor-v22895.mjs")'), "로더가 이미 내려가던 자산 안에 있다");
  ok(navText.includes('matchMedia("(hover:hover) and (pointer:fine)")'), "그 자산 안에서 조건을 판정한다");

  // -------------------------------------------------------------------------
  // 10.5 · 스위치를 끄면 캔버스가 DOM 에 남지 않는다
  // -------------------------------------------------------------------------
  ok(cursorSource.includes("if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);"), "해제할 때 캔버스를 DOM 에서 지운다");
  ok(cursorSource.includes("canvas = null; ctx = null;"), "해제 뒤 참조도 남기지 않는다");
  // 동작 줄이기를 켜면 즉시 해제한다.
  ok(nav.includes("if (abCursorMotion.matches) { abCursorStop(); abCursorModule = null; }"), "동작 줄이기를 켜면 즉시 해제한다");
  ok(nav.includes("abCursorModule = null"), "해제 뒤 다시 끄면 되살아날 수 있다");
  // 붙인 이벤트를 전부 떼야 "남지 않음"이 성립한다.
  const added = [...cursorSource.matchAll(/(?:^|\W)addEventListener\("([a-z]+)"/g)].map((m) => m[1]).sort();
  const removed = [...cursorSource.matchAll(/removeEventListener\("([a-z]+)"/g)].map((m) => m[1]).sort();
  eq(added.join(","), removed.join(","), `붙인 이벤트를 전부 뗀다 (${added.join(",")})`);

  // -------------------------------------------------------------------------
  // 10.5 · 배경 탭에서 rAF 가 0
  // -------------------------------------------------------------------------
  ok(cursorSource.includes("if (raf || document.hidden || !document.hasFocus()) return;"), "배경 탭·비활성 창에서는 루프를 걸지 않는다");
  ok(cursorSource.includes("const halt = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };"), "멈출 때 예약된 프레임까지 취소한다");
  ok(cursorSource.includes('addEventListener("blur", halt)'), "창이 blur 되면 멈춘다");
  ok(cursorSource.includes("const onLeave = () => { hide = true; loop(); halt(); };"), "마우스가 창을 떠나면 흐려지고 멈춘다");

  // -------------------------------------------------------------------------
  // 10.5 · 시트·토스트·상단바가 점 위에 그려진다
  // -------------------------------------------------------------------------
  ok(cursorSource.includes("position:fixed;inset:0;pointer-events:none;z-index:1"), "캔버스는 클릭을 먹지 않고 z-index 1 이다");
  // 이 화면들의 z-index 가 모두 캔버스보다 커야 점이 그 아래로 간다.
  for (const [label, rule] of [
    ["시트", /\.abDayDetailOverlay\{[^}]*z-index:(\d+)/],
    ["상단바", /\.abNavMobileTop\{[^}]*z-index:(\d+)/],
  ]) {
    const found = source.match(rule);
    ok(found && Number(found[1]) > 1, `${label} 가 점 위에 그려진다 (z-index ${found ? found[1] : "없음"})`);
  }
  // 입력 위에서는 점을 숨긴다 — I빔 커서와 겹치면 글자 위치를 가린다.
  ok(cursorSource.includes('at.closest("input,textarea,[contenteditable]")'), "입력 영역 위에서는 점을 숨긴다");
  ok(cursorSource.includes("hide = !!typing;"), "숨김 판정이 그리기에 반영된다");
  // 판정은 마우스가 움직일 때만 한다.
  eq(cursorSource.slice(cursorSource.indexOf("const draw"), cursorSource.indexOf("const loop")).includes("elementFromPoint"), false, "프레임마다 elementFromPoint 를 부르지 않는다");

  // -------------------------------------------------------------------------
  // 10.5 · 라이트·다크 × 톤 4종에서 점이 보인다
  // -------------------------------------------------------------------------
  // 색을 런타임에 토큰에서 읽으므로 테마·톤 전환을 그대로 따라간다.
  ok(cursorSource.includes('getComputedStyle(document.body).getPropertyValue("--ab12-brand")'), "색은 런타임에 토큰을 읽어 쓴다");
  eq(/#323232a6/.test(cursorSource), false, "토큰 밖 리터럴 색(원본 값)을 쓰지 않는다");
  // 8조합 모두에서 --ab12-brand 가 실제로 정의돼 있어야 점이 보인다.
  // 블루는 기본 톤이라 셸 선언부에 그대로 있고(라이트·다크 각 한 벌), 나머지 셋은
  // 톤 선택자에서 덮는다. 여덟 조합 어디서도 값이 비지 않아야 점이 보인다.
  eq((source.match(/body\.abV22812Shell\{--ab12-bg:[^}]*--ab12-brand:#[0-9a-f]{3,8}/g) || []).length, 2, "기본 톤(블루)의 브랜드 색이 라이트·다크 양쪽에 있다");
  for (const tone of ["emerald", "violet", "amber"]) {
    const rules = source.match(new RegExp(`data-ab-tone="${tone}"\\] body\\.abV22812Shell\\{--ab12-brand:#[0-9a-f]{3,8}`, "g")) || [];
    eq(rules.length, 2, `${tone} 톤의 브랜드 색이 라이트·다크 양쪽에 있다 (${rules.length})`);
  }

  // -------------------------------------------------------------------------
  // 스위치 — 기본 켜짐, 계정에 저장, 되돌릴 수 있음
  // -------------------------------------------------------------------------
  const pref = async (cookie) => JSON.parse((await get("/cursor-preference?household_id=house-home", cookie)).text);
  eq((await pref(fixture.cookie)).on, true, "설정이 없으면 기본은 켜짐이다");
  const menu = await get("/menu?month=2026-07&household_id=house-home", fixture.cookie);
  ok(menu.text.includes("마우스 따라오는 표시"), "화면 설정에 스위치가 있다");
  ok(/name="cursor" value="on" checked/.test(menu.text), "기본 상태가 켜짐으로 보인다");
  // 스위치 스타일은 페이지가 아니라 공유 셸 자산에 있다(그래서 주소를 함께 올렸다).
  const shell = await app.fetch(new Request(`${ORIGIN}/assets/accountbook-shell-v22913.css`), fixture.env, {});
  eq(shell.status, 200, "셸 스타일이 새 주소에서 내려온다");
  const shellCss = await shell.text();
  ok(shellCss.includes(".abCursorPick{display:flex;align-items:flex-start;gap:10px;min-height:44px"), "스위치가 44px 탭 영역을 갖는다");
  ok(shellCss.includes(".abCursorPref button{min-height:44px"), "저장 버튼도 44px 이다");
  // 동작 줄이기가 이 설정보다 우선한다는 사실을 화면이 말한다.
  ok(menu.text.includes("동작 줄이기를 켜 두면 이 설정과 무관하게 나타나지 않습니다"), "우선순위를 문구로 말한다");

  const save = async (cookie, on) => {
    const params = new URLSearchParams({ household_id: "house-home", month: "2026-07" });
    if (on) params.set("cursor", "on");
    const response = await app.fetch(new Request(`${ORIGIN}/cursor-preference/save`, {
      method: "POST",
      headers: { cookie, origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }), fixture.env, {});
    return response.status;
  };
  eq(await save(fixture.cookie, false), 303, "끄기는 리다이렉트로 끝난다");
  eq((await pref(fixture.cookie)).on, false, "끈 상태가 남는다");
  const off = await get("/menu?month=2026-07&household_id=house-home", fixture.cookie);
  eq(/name="cursor" value="on" checked/.test(off.text), false, "끈 상태가 화면에도 보인다");
  eq(await save(fixture.cookie, true), 303, "다시 켤 수 있다");
  eq((await pref(fixture.cookie)).on, true, "다시 켠 상태가 남는다");
  // 새 표를 만들지 않는다 — 홈 구성과 같은 키-값 저장소 한 줄이다.
  eq(fixture.db.accountbook_settings.filter((row) => row.key === "cursor:v1:house-home:user-bin").length, 1, "설정 한 줄에만 담긴다");
  // 내 설정이 남의 화면을 바꾸지 않는다.
  eq((await pref(await fixture.cookieFor("user-wifi"))).on, true, "다른 참여자에게는 기본값 그대로다");

  // 로그인하지 않은 요청은 설정을 읽지 못한다.
  const anon = await app.fetch(new Request(`${ORIGIN}/cursor-preference?household_id=house-home`), fixture.env, {});
  eq(anon.status, 401, "로그인 없이 설정을 읽지 못한다");
} finally {
  fixture.restore();
}

console.log(`V22.8.95 데스크톱 커서(10장) 검사 통과 (${checks} checks)`);
