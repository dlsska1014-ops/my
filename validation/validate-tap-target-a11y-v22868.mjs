import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.9.0-UX-REPAIR"'), "runtime exposes the tap target release");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v2290.css"'), "shell asset moved to a fresh immutable path");
ok(source.includes('"accountbook-shell-v2290-css"'), "shell asset has a fresh immutable ETag");

// 조작 영역 규칙은 셸 스타일시트에만 넣는다. 사용자 화면 HTML 바이트가 늘면 홈 예산을 깎아먹는다.
const TAP_RULES = [
  "body.abV22812Shell details>summary{min-height:44px",
  "body.abV22812Shell .abNavMobileTop>a{min-height:44px",
  "body.abV22812Shell .hhActions>a{min-height:44px}",
  "body.abV22812Shell .reportChallengeToggle{min-height:44px",
];
for (const rule of TAP_RULES) ok(source.includes(rule), `shell stylesheet declares: ${rule.slice(0, 52)}`);
// 접기 헤더는 목록 표시를 잃으면 안 되므로 display 를 바꾸지 않는다.
ok(!/body\.abV22812Shell details>summary\{[^}]*display:/.test(source), "summary rows keep their list-item display and marker");

const ORIGIN = "https://ttokttok-accountbook.com";

async function request(fixture, path, { cookie = fixture.cookie } = {}) {
  const response = await app.fetch(new Request(`${ORIGIN}${path}`, {
    headers: { "user-agent": "Mozilla/5.0", cookie },
  }), fixture.env, {});
  return { status: response.status, headers: response.headers, text: await response.text() };
}

// ── HTML 구조 접근성 검사 ───────────────────────────────────────
// 브라우저 없이도 확인할 수 있는 항목만 다룬다. 실제 렌더 크기는 별도 브라우저 점검에서 봤다.
const stripped = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<!--[\s\S]*?-->/g, "");

const attrOf = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? "";
};

const collectIds = (html) => {
  const counts = new Map();
  for (const m of html.matchAll(/<[a-z][^>]*\sid="([^"]+)"/gi)) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  return counts;
};

const fixture = await createV2265QaFixture();
try {
  const month = "2026-07";
  const q = `month=${month}&household_id=house-home`;
  const PAGES = [
    ["홈", `/app?${q}`],
    ["거래 내역", `/app?${q}&tab=transactions`],
    ["캘린더", `/app?${q}&view=calendar`],
    ["정기지출", `/reserve-plans?${q}`],
    ["가져오기", `/my/backup?${q}&mode=import`],
    ["영수증 기록", `/receipts?${q}`],
    ["자산·계좌", `/payment-methods?${q}`],
    ["저축·목표", `/goals?${q}`],
    ["통계", `/my/analysis?${q}`],
    ["종합 리포트", `/my/analysis?${q}&view=report`],
    ["예산", `/budgets?${q}`],
    ["월 마감", `/reports?${q}`],
    ["연간 리포트", `/annual?year=2026&household_id=house-home`],
    ["스마트 도구", `/smart-tools?${q}`],
    ["예산 알림", `/budget-alerts?${q}`],
    ["부부 정산", `/settlement-summary?${q}`],
    ["참여자·초대", `/my/members?${q}`],
    ["단톡방 연결", `/my/groups?${q}`],
    ["가계부 전환·추가", `/my/households?${q}`],
    ["분류·키워드", `/keyword-guide?${q}`],
    ["백업·복구", `/my/backup?${q}&mode=backup`],
    ["설정", `/my/settings?${q}`],
    ["전체 메뉴", `/menu?${q}`],
    ["처음 사용 가이드", `/start-guide?${q}`],
  ];

  for (const [name, path] of PAGES) {
    const page = await request(fixture, path);
    eq(page.status, 200, `${name} 화면이 열린다`);
    const html = stripped(page.text);

    // 문서 수준
    ok(/<html[^>]*\slang="ko"/i.test(page.text), `${name}: html lang="ko"`);
    ok(/<title>[^<]*\S[^<]*<\/title>/i.test(page.text), `${name}: 제목이 비어 있지 않다`);
    ok(/<h1[\s>]/i.test(html), `${name}: h1 이 있다`);
    ok(/<main[\s>]|role="main"/i.test(html), `${name}: main 랜드마크가 있다`);

    // 중복 id — 라벨 연결과 앵커 이동을 조용히 망가뜨린다.
    const dupes = [...collectIds(html)].filter(([, n]) => n > 1).map(([id]) => id);
    eq(dupes.join(","), "", `${name}: 중복 id 가 없다 (${dupes.join(", ") || "없음"})`);

    // for / list 참조가 실제 id 를 가리키는지
    const ids = new Set(collectIds(html).keys());
    const dangling = [];
    for (const m of html.matchAll(/<(?:label|input)[^>]*\s(for|list)="([^"]+)"/gi)) {
      if (!ids.has(m[2])) dangling.push(`${m[1]}=${m[2]}`);
    }
    eq(dangling.join(","), "", `${name}: for·list 참조가 모두 실제 id 를 가리킨다 (${dangling.join(", ") || "없음"})`);

    // tabindex 양수는 키보드 순서를 예측 불가능하게 만든다.
    const positiveTabindex = [...html.matchAll(/\stabindex="(\d+)"/gi)].filter((m) => Number(m[1]) > 0);
    eq(positiveTabindex.length, 0, `${name}: 양수 tabindex 가 없다`);

    // 보이는 입력에 접근 가능한 이름이 있는지
    const labelledIds = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]+)"/gi)].map((m) => m[1]));
    const unnamed = [];
    for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
      const tag = m[0];
      const type = (attrOf(tag, "type") || "").toLowerCase();
      if (type === "hidden") continue;
      if (attrOf(tag, "aria-label") || attrOf(tag, "aria-labelledby") || attrOf(tag, "title")) continue;
      const id = attrOf(tag, "id");
      if (id && labelledIds.has(id)) continue;
      // <label>…<input>…</label> 형태는 여는 label 태그가 앞에 있고 아직 닫히지 않은 상태다.
      const before = html.slice(0, m.index);
      const openLabel = before.lastIndexOf("<label");
      const closeLabel = before.lastIndexOf("</label>");
      if (openLabel > closeLabel) continue;
      if (attrOf(tag, "placeholder")) continue;
      unnamed.push(`${m[1]}[${attrOf(tag, "name") || type || "?"}]`);
    }
    eq(unnamed.join(","), "", `${name}: 이름 없는 입력이 없다 (${unnamed.slice(0, 4).join(", ") || "없음"})`);

    // alt 없는 img
    const noAlt = [...html.matchAll(/<img\b([^>]*)>/gi)].filter((m) => attrOf(m[0], "alt") === null);
    eq(noAlt.length, 0, `${name}: alt 없는 이미지가 없다`);

    // 셸을 쓰는 화면은 새 스타일시트를 정확히 한 번 참조한다.
    if (page.text.includes("abV22812Shell")) {
      eq((page.text.match(/href="\/assets\/accountbook-shell-v2290\.css"/g) || []).length, 1, `${name}: 새 셸 스타일시트를 한 번만 부른다`);
    }
  }

  // 셸 자원 자체
  const shell = await request(fixture, "/assets/accountbook-shell-v2290.css");
  eq(shell.status, 200, "새 셸 스타일시트가 제공된다");
  ok((shell.headers.get("content-type") || "").includes("text/css"), "셸 스타일시트 MIME 이 text/css");
  ok((shell.headers.get("cache-control") || "").includes("immutable"), "셸 스타일시트가 immutable 로 캐시된다");
  ok(shell.text.includes("min-height:44px"), "셸 스타일시트에 조작 영역 규칙이 담겨 있다");
  const oldShell = await request(fixture, "/assets/accountbook-shell-v22865.css");
  eq(oldShell.status, 404, "이전 셸 주소는 더 이상 응답하지 않는다");

  // 홈 HTML 예산 — 조작 영역 보정으로 마크업이 늘어나면 안 된다.
  const home = await request(fixture, `/app?${q}`);
  const homeBytes = Buffer.byteLength(home.text);
  ok(homeBytes <= 35 * 1024, `기준 홈 HTML 이 35KiB 예산 안에 있다 (${homeBytes}B)`);
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.68 tap target accessibility (${checks} checks)`);
