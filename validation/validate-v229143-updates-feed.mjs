// V22.9.143 업데이트 소식·RSS·검색 제목 검사(2026-11-24 — 사용자 "11/30 전에 완료하도록 진행하자", 애드센스 마지막 신청 계획 D1·E3).
// 1. D1 /updates: 서비스 이름을 바꾼 V22.9.20 부터 지금 판까지 판 번호가 빠짐없이 한 번씩 묶음에 있고, 가장 새 묶음에 지금 판(APP_VERSION)이 있다
//    (새 판은 맨 앞에 제 묶음을 더해야 이 검사를 통과한다). 묶음은 날짜가 새것부터이고, 쪽 안 앵커 id 는 묶음의 가장 새 판 번호(v229143 꼴)로 겹치지
//    않는다. 묶음 날짜 = 그 판들의 CHANGELOG 머리 줄 날짜(머리 줄에 날짜가 없는 이른 판은 아래 표의 배포 기록 날짜, 기간 묶음은 그 기간 안) — V22.9.141
//    까지는 같은 날 만든 판이 한 묶음, V22.9.142 부터는 판마다 한 묶음. 바뀐 것 줄은 지난 일(…ㅆ습니다.)이고 제목은 명사형이며, ‘무료’·앞날 약속·
//    내부 이름(점검 도구·관제·관리자·배포·DB 등)·발견 번호가 없다. 사이트맵·공개 정본에 있고 광고 화면 목록에는 없으며, 공개 화면 꼬리말과 /site-map 에서
//    닿는다. 첫 단추는 쪽 안의 가장 새 달이고 RSS 는 주소가 보이는 둘째 단추다(브라우저가 RSS 를 내려받으므로). 공개 안내 화면이라 방문 측정 출처가
//    CSP 에 있다(V22.9.142 E4).
// 2. D1 /updates.xml: RSS 2.0 — 항목 수 = 묶음 수, 항목 링크는 /updates 의 앵커(쪽에 그 id 가 있다), guid 는 판 번호 표식, pubDate 는 그날 09:00 KST
//    (RFC 822 꼴), lastBuildDate 는 가장 새 묶음, 이스케이프되지 않은 & 가 없다. HEAD 는 몸 없이 200. /updates 머리에 RSS 알림 링크가 있다.
// 3. E3: 첫 화면 문서 제목은 ‘카카오톡 가계부·단톡방 가계부’ 로 시작하고 설명은 V22.9.140 의 공개 정산 예제 문장을 그대로 둔다. /kakao-guide 문서 제목은
//    V22.9.140 의 찾는 말 ‘카카오톡 가계부 입력 방법’ 으로 그대로 시작하고 ‘1:1 채팅과 단톡방’ 을 단다. 두 쪽 모두 화면의 h1 과 수정일(dateModified)은
//    그대로다(V22.9.143 기준 값 — 뒤 판이 그 쪽 본문을 바꾸면 이 값도 고친다).
// 바깥 요청은 0회여야 한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { stripBuildBlocks } from "../tools/build-worker.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };

const ORIGIN = "https://malhaebook.com";
const FIRST = 20; // V22.9.20(2026-09-30) — 서비스 이름을 말해가계부로 바꾼 판.
const siteConfig = stripBuildBlocks(readFileSync(new URL("../src/modules/public/site-config.js", import.meta.url), "utf8"));
const guideSource = readFileSync(new URL("../src/modules/public/guide-content.js", import.meta.url), "utf8");
const APP_VERSION = (siteConfig.match(/const APP_VERSION = "(V22\.9\.(\d+)[^"]*)";/) || [])[1] || "";
const CURRENT = Number((APP_VERSION.match(/^V22\.9\.(\d+)/) || [])[1]);
const listOf = (pattern) => [...((siteConfig.match(pattern) || ["", ""])[1]).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
// 원본의 묶음 목록을 그대로 읽는다(화면이 빠뜨린 묶음까지 잡으려고 원본과 화면을 따로 본다).
const dataBlock = (guideSource.match(/const PUBLIC_UPDATES_V229143 = Object\.freeze\(\[([\s\S]*?)\n\]\);/) || ["", ""])[1];
const ENTRIES = Function(`"use strict"; return [${dataBlock}];`)();
const versionNumber = (v) => Number(String(v).split(".")[2]);
const idOf = (entry) => `v${String([...entry.versions].sort((a, b) => versionNumber(b) - versionNumber(a))[0]).replace(/[^0-9]/g, "")}`;
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// 화면·RSS 의 판 번호 표시(번들과 따로 계산): 셋 이상 이어지면 ‘V22.9.45~V22.9.62’, 둘이거나 떨어져 있으면 ‘ · ’ 로 잇는다.
const versionsLabel = (versions) => {
  const runs = [];
  for (const n of versions.map(versionNumber).sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]);
  }
  return runs.map(([a, b]) => (b - a >= 2 ? `V22.9.${a}~V22.9.${b}` : a === b ? `V22.9.${a}` : `V22.9.${a} · V22.9.${b}`)).join(" · ");
};
// 옛 서비스 이름도 공개 화면에 적지 않는다(봇의 옛 이름 부르기 처리에만 남아 있다).
const INTERNAL = /Codex|Gemini|Claude|Aside|Lucian|Astra|관제|관리자|배포|Supabase|하네스|Cloudflare|\bDB\b|\bD1\b|\bRPC\b|\bCSP\b|똑똑한|\b[A-Z]{1,3}-\d+[a-z]?\b|\bP[1-3]\b/;
const PROMISE = /무료|예정|곧 |앞으로 .*(하겠|드리겠)|약속/;
// 바뀐 것 줄은 지난 일로 적는다: ‘습니다.’ 앞 글자의 받침이 ㅆ(했·었·았·였·됐 …).
const pastTense = (text) => { const m = text.match(/(.)습니다\.$/); const code = m ? m[1].charCodeAt(0) - 0xac00 : -1; return code >= 0 && code < 11172 && code % 28 === 20; };
const RFC822 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d\d (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} 00:00:00 GMT$/;
// CHANGELOG 머리 줄(‘## V22.9.N …’)의 날짜. 한 판에 머리 줄이 둘 이상일 수 있다.
const heads = new Map();
for (const line of readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^##\s+(V22\.9\.(\d+))(?!\d)(.*)$/);
  if (!m) continue;
  if (!heads.has(m[1])) heads.set(m[1], []);
  heads.get(m[1]).push((m[3].match(/20\d\d-\d\d-\d\d/) || [])[0] || "");
}
// 머리 줄에 날짜가 없는 이른 판: 배포 기록(docs/deployments·운영 기록)의 날짜. "range" = 2026-10-14~18 에 이어 만든 기간 묶음 안.
const HEADERLESS = Object.freeze({
  22: "2026-10-01", 23: "2026-10-01", 29: "2026-10-08", 30: "2026-10-08", 31: "2026-10-08", 32: "2026-10-09", 33: "2026-10-09", 34: "2026-10-09",
  35: "2026-10-10", 36: "2026-10-10", 37: "2026-10-10", 38: "2026-10-10", 39: "2026-10-11", 40: "2026-10-12",
  41: "2026-10-13", 42: "2026-10-13", 43: "2026-10-13", 44: "2026-10-13",
  45: "range", 46: "range", 47: "range", 48: "range", 49: "range", 50: "range", 51: "range", 52: "range", 53: "range", 54: "range", 59: "range", 60: "range", 61: "range",
});

const realFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = async (input) => { outbound += 1; throw new Error(`V22.9.143 검사는 바깥 요청을 하지 않는다: ${String(input?.url || input)}`); };
const fx = await createV2265QaFixture();

async function get(target, { method = "GET", env = {} } = {}) {
  const res = await app.fetch(new Request(`${ORIGIN}${target}`, {
    method,
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", accept: "text/html" },
  }), { ...fx.env, ...env }, { waitUntil() {} });
  return { status: res.status, headers: res.headers, html: await res.text() };
}

try {
  // ── 1. 묶음 원본 ──
  ok(APP_VERSION && Number.isInteger(CURRENT) && CURRENT >= 143, `APP_VERSION 을 읽었다 (${APP_VERSION})`);
  ok(ENTRIES.length >= 20, `묶음이 있다 (${ENTRIES.length})`);
  const seen = new Map();
  for (const entry of ENTRIES) for (const v of entry.versions) seen.set(v, (seen.get(v) || 0) + 1);
  for (let n = FIRST; n <= CURRENT; n += 1) eq(seen.get(`V22.9.${n}`), 1, `V22.9.${n}: 묶음에 한 번 있다`);
  eq([...seen.keys()].filter((v) => !/^V22\.9\.\d+$/.test(v) || versionNumber(v) < FIRST || versionNumber(v) > CURRENT), [], "묶음의 판 번호는 V22.9.20 ~ 지금 판 꼴뿐이다");
  ok(ENTRIES[0].versions.includes(`V22.9.${CURRENT}`), `가장 새 묶음에 지금 판(V22.9.${CURRENT})이 있다`);
  const ids = ENTRIES.map(idOf);
  eq(new Set(ids).size, ids.length, "쪽 안 앵커 id 가 겹치지 않는다");
  for (let i = 1; i < ENTRIES.length; i += 1) ok(ENTRIES[i - 1].date >= ENTRIES[i].date, `묶음 날짜가 새것부터다 (${ENTRIES[i - 1].date} ≥ ${ENTRIES[i].date})`);
  for (let i = 1; i < ENTRIES.length; i += 1) ok(Math.max(...ENTRIES[i].versions.map(versionNumber)) < Math.min(...ENTRIES[i - 1].versions.map(versionNumber)), `묶음 ${ids[i]} 의 판은 앞 묶음보다 앞 판이다`);
  for (const entry of ENTRIES) {
    const id = idOf(entry);
    ok(/^2026-(09|1[0-2])-\d\d$/.test(entry.date) && !Number.isNaN(Date.parse(`${entry.date}T00:00:00Z`)), `${id}: 날짜 꼴 (${entry.date})`);
    ok(typeof entry.title === "string" && entry.title.length >= 6 && entry.title.length <= 40, `${id}: 제목 6~40자 (${entry.title})`);
    ok(Array.isArray(entry.items) && entry.items.length <= 5, `${id}: 바뀐 것 0~5줄`);
    ok(!/(다|\.)$/.test(entry.title), `${id}: 제목은 명사형이다 — ${entry.title}`);
    for (const text of [entry.title, ...entry.items]) {
      ok(text.length <= 90, `${id}: 한 줄 90자 이내 — ${text.slice(0, 30)}`);
      ok(!INTERNAL.test(text), `${id}: 내부 이름·발견 번호가 없다 — ${text.slice(0, 30)}`);
      ok(!PROMISE.test(text), `${id}: ‘무료’·앞날 약속이 없다 — ${text.slice(0, 30)}`);
    }
    for (const text of entry.items) ok(pastTense(text), `${id}: 바뀐 것 줄은 지난 일로 적는다(…ㅆ습니다.) — ${text.slice(0, 30)}`);
    if (entry.label !== undefined) ok(typeof entry.label === "string" && /^\d+월 \d+~\d+일$/.test(entry.label), `${id}: 기간 표시 꼴 (${entry.label})`);
  }
  // 묶음 날짜 = CHANGELOG 머리 줄 날짜(운영에 함께 나간 날로 옮기지 않는다). 머리 줄에 날짜가 없는 판은 HEADERLESS 표의 날짜, 기간 묶음은 그 기간 안.
  for (const entry of ENTRIES) {
    const id = idOf(entry);
    let start = entry.date;
    if (entry.label) {
      const [, month, from, to] = entry.label.match(/^(\d+)월 (\d+)~(\d+)일$/) || [];
      eq([Number(month), Number(to)], [Number(entry.date.slice(5, 7)), Number(entry.date.slice(8, 10))], `${id}: 기간의 끝날 = 묶음 날짜 (${entry.label})`);
      start = `${entry.date.slice(0, 8)}${String(from).padStart(2, "0")}`;
    }
    for (const v of entry.versions) {
      const n = versionNumber(v);
      const dated = (heads.get(v) || []).filter(Boolean);
      if (Object.hasOwn(HEADERLESS, n)) {
        eq(dated, [], `${v}: 머리 줄에 날짜가 없는 판이다(예외 표에 있다)`);
        ok(HEADERLESS[n] === "range" ? Boolean(entry.label) : HEADERLESS[n] === entry.date, `${v}: 배포 기록의 날짜 묶음 (${HEADERLESS[n]} → ${entry.label || entry.date})`);
      } else {
        ok(dated.length >= 1, `${v}: CHANGELOG 머리 줄에 날짜가 있다`);
        ok(entry.label ? dated.some((d) => d >= start && d <= entry.date) : dated.includes(entry.date), `${v}: 묶음 날짜 = 머리 줄 날짜 (${dated.join("/") || "없음"} → ${entry.label || entry.date})`);
      }
    }
  }
  const oldEntries = ENTRIES.filter((e) => Math.max(...e.versions.map(versionNumber)) <= 141);
  eq(new Set(oldEntries.map((e) => e.date)).size, oldEntries.length, "V22.9.141 까지는 같은 날 만든 판이 한 묶음이다(날짜가 겹치는 묶음이 없다)");
  for (const e of ENTRIES.filter((x) => Math.max(...x.versions.map(versionNumber)) >= 142)) eq(e.versions.length, 1, `${idOf(e)}: V22.9.142 부터는 판마다 한 묶음`);

  // ── 1-2. /updates 화면 ──
  const page = await get("/updates");
  eq(page.status, 200, "/updates 200");
  eq((page.html.match(/<h1>([^<]+)<\/h1>/) || [])[1], "업데이트 소식", "/updates 제목");
  ok(page.html.includes(`<link rel="canonical" href="${ORIGIN}/updates"/>`), "/updates 정본 주소");
  ok(page.html.includes(`<link rel="alternate" type="application/rss+xml" title="말해가계부 업데이트 소식" href="${ORIGIN}/updates.xml"/>`), "/updates 머리에 RSS 알림 링크");
  const blocks = [...page.html.matchAll(/<div class="pubUpdate" id="(v\d+)"><h3><time datetime="([^"]+)">([^<]+)<\/time> · ([^<]+)<\/h3><p class="pubMeta">([^<]+)<\/p>(?:<ul>([\s\S]*?)<\/ul>)?<\/div>/g)];
  eq(blocks.map((m) => m[1]), ids, "화면의 묶음과 앵커 id 가 원본 순서 그대로다");
  for (const [i, m] of blocks.entries()) {
    const entry = ENTRIES[i];
    eq([m[2], decode(m[4]), decode(m[5])], [entry.label ? entry.date.slice(0, 7) : entry.date, entry.title, versionsLabel(entry.versions)], `${ids[i]}: 날짜(기간 묶음은 그 달)·제목·판 번호`);
    eq(decode(m[3]), entry.label || `${Number(entry.date.slice(5, 7))}월 ${Number(entry.date.slice(8, 10))}일`, `${ids[i]}: 보이는 날짜`);
    eq([...(m[6] || "").matchAll(/<li>([^<]*)<\/li>/g)].map((x) => decode(x[1])), entry.items, `${ids[i]}: 바뀐 것 줄`);
  }
  const months = [...new Set(ENTRIES.map((e) => e.date.slice(0, 7)))];
  eq([...page.html.matchAll(/<section class="pubSection pubUpdates" id="m-(\d{4}-\d\d)"><h2>(\d{4})년 (\d+)월<\/h2>/g)].map((m) => m[1]), months, "달마다 절 하나(새 달부터)");
  ok(!page.html.includes("무료") && !page.html.includes("똑똑한"), "/updates 에 ‘무료’·옛 서비스 이름이 없다");
  ok(page.html.includes("날짜는 그 판을 만든 날이고, 운영에는 대개 그날이나 며칠 안에 반영했습니다.") && page.html.includes("한 묶음에 판이 여럿이면 그날(또는 적힌 기간)에 만든 판들입니다.") && page.html.includes("RSS 리더에 malhaebook.com/updates.xml 주소를 등록하면"), "/updates 읽는 방법(날짜 = 만든 날·묶음·RSS 주소) 문단이 화면에 있다");
  ok(!page.html.includes("날짜순") && decode((page.html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "").includes("최신순으로 모았습니다"), "/updates 설명은 ‘최신순’(새것이 위)");
  ok(/class="pubEyebrow">판마다 바뀐 것<\/span>/.test(page.html), "/updates 눈썹 글은 h1 과 다르다");
  const newestMonth = ENTRIES[0].date.slice(0, 7);
  ok(page.html.includes(`<div class="pubHeroActions"><a class="pubBtn" href="#m-${newestMonth}">가장 최근 소식 보기</a><a class="pubBtn secondary" href="/updates.xml">RSS 주소 malhaebook.com/updates.xml</a></div>`) && page.html.includes(`id="m-${newestMonth}"`), "/updates 첫 단추는 쪽 안의 가장 새 달, 둘째 단추는 주소가 보이는 RSS");
  const ranged = ENTRIES.filter((e) => e.label);
  for (const entry of ranged) ok(page.html.includes(`<time datetime="${entry.date.slice(0, 7)}">${entry.label}</time>`) && page.html.includes(`<p class="pubMeta">${versionsLabel(entry.versions)}</p>`), `${idOf(entry)}: 기간 묶음은 기간과 줄인 판 번호로 보인다 (${entry.label} · ${versionsLabel(entry.versions)})`);
  ok(ranged.some((e) => e.versions.length >= 3) && blocks.every((m) => m[5].length <= 60), "줄인 판 번호 표시는 60자를 넘지 않는다(이어진 판은 ‘~’ 로)");
  ok(page.html.includes(`수정 <time datetime="${ENTRIES[0].date}">`), "/updates 수정일 = 가장 새 묶음의 날짜");
  ok(page.html.includes(".pubUpdate h3{margin:0 0 4px;font-size:18px;font-weight:700;line-height:1.5}"), "/updates 의 규칙은 V22.9.125 눈금 안(18px·700)");
  const csp = String(page.headers.get("content-security-policy") || "");
  ok(csp.includes("https://static.cloudflareinsights.com") && csp.includes("https://cloudflareinsights.com"), "/updates 는 공개 안내 화면이라 방문 측정 출처가 CSP 에 있다");

  // 사이트맵·정본·광고 목록·꼬리말·/site-map
  const publicPaths = listOf(/const PUBLIC_CONTENT_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  const adKeys = listOf(/const AD_PAGE_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  ok(publicPaths.includes("/updates") && !adKeys.includes("/updates"), "/updates 는 공개 정본에 있고 광고 화면 목록에는 없다");
  eq(publicPaths.length, 53, "공개 정본 53개(V22.9.142 의 51 + /updates + V22.9.145 /kakao-sentences)");
  eq(adKeys.filter((key) => publicPaths.includes(key)).length, 45, "광고 허용 공개 화면은 45쪽(/updates 는 빠지고 V22.9.145 /kakao-sentences 가 더해짐)");
  const sitemap = (await get("/sitemap.xml")).html;
  const lastmod = (sitemap.match(/<loc>https:\/\/malhaebook\.com\/updates<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/) || [])[1];
  eq(lastmod, ENTRIES[0].date, "사이트맵에 /updates 가 있고 lastmod 는 가장 새 묶음의 날짜");
  eq((sitemap.match(/<url>/g) || []).length, 53, "사이트맵 53개(V22.9.145 카카오톡 문장 사전 + 1)");
  for (const p of ["/", "/articles", "/about", "/updates"]) ok((await get(p)).html.includes('<a href="/support">후원하기</a>') && (await get(p)).html.includes('<a href="/site-map">사이트맵</a><a href="/updates">업데이트 소식</a>'), `${p}: 꼬리말에 업데이트 소식`);
  const siteMap = (await get("/site-map")).html;
  ok(siteMap.includes('href="/updates"') && siteMap.includes('href="/updates.xml"'), "/site-map 에서 업데이트 소식과 RSS 로 닿는다");

  // ── 2. RSS ──
  const feed = await get("/updates.xml");
  eq(feed.status, 200, "/updates.xml 200");
  eq(feed.headers.get("content-type"), "application/rss+xml; charset=utf-8", "RSS 내용 형식");
  ok(feed.html.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">'), "RSS 2.0 머리");
  ok(feed.html.includes(`<atom:link href="${ORIGIN}/updates.xml" rel="self" type="application/rss+xml"/>`) && feed.html.includes(`<link>${ORIGIN}/updates</link>`), "채널 링크·자기 주소");
  ok(!/&(?!amp;|lt;|gt;|quot;|#39;)/.test(feed.html), "이스케이프되지 않은 & 가 없다");
  eq((feed.html.match(/<channel>/g) || []).length, 1, "채널 하나");
  const items = [...feed.html.matchAll(/<item>\s*<title>([^<]*)<\/title>\s*<link>([^<]*)<\/link>\s*<guid isPermaLink="false">([^<]*)<\/guid>\s*<pubDate>([^<]*)<\/pubDate>\s*<description>([^<]*)<\/description>\s*<\/item>/g)];
  eq(items.length, ENTRIES.length, "RSS 항목 수 = 묶음 수");
  eq((feed.html.match(/<item>/g) || []).length, ENTRIES.length, "모든 <item> 이 같은 꼴이다");
  for (const [i, m] of items.entries()) {
    const entry = ENTRIES[i];
    eq(decode(m[1]), `${entry.title} (${versionsLabel(entry.versions)})`, `${ids[i]}: RSS 제목`);
    eq(m[2], `${ORIGIN}/updates#${ids[i]}`, `${ids[i]}: RSS 링크는 쪽 안 앵커`);
    ok(page.html.includes(`id="${ids[i]}"`), `${ids[i]}: 그 앵커가 화면에 있다`);
    eq(m[3], `malhaebook-update-${ids[i]}`, `${ids[i]}: guid`);
    ok(RFC822.test(m[4]), `${ids[i]}: pubDate 는 RFC 822 꼴 (${m[4]})`);
    eq(new Date(m[4]).toISOString(), `${entry.date}T00:00:00.000Z`, `${ids[i]}: pubDate 는 그날 09:00 KST`);
    eq(decode(m[5]), entry.items.join(" "), `${ids[i]}: RSS 설명`);
  }
  const lastBuild = (feed.html.match(/<lastBuildDate>([^<]+)<\/lastBuildDate>/) || [])[1] || "";
  ok(RFC822.test(lastBuild), `lastBuildDate 는 RFC 822 꼴 (${lastBuild})`);
  eq(new Date(lastBuild).toISOString(), `${ENTRIES[0].date}T00:00:00.000Z`, "lastBuildDate = 가장 새 묶음");
  ok(feed.html.includes("<description>말해가계부가 판마다 바꾼 것 가운데 이용자가 보게 되는 변화를 최신순으로 적습니다.</description>") && !feed.html.includes("날짜순"), "채널 설명은 ‘최신순’");
  const head = await get("/updates.xml", { method: "HEAD" });
  eq([head.status, head.html, head.headers.get("content-type")], [200, "", "application/rss+xml; charset=utf-8"], "HEAD /updates.xml 는 몸 없이 200");

  // ── 3. E3 ──
  const home = (await get("/")).html;
  eq((home.match(/<title>([^<]*)<\/title>/) || [])[1], "카카오톡 가계부·단톡방 가계부 · 말해가계부", "첫 화면 문서 제목");
  ok(home.includes('<meta property="og:title" content="카카오톡 가계부·단톡방 가계부 · 말해가계부"/>'), "첫 화면 공유 제목도 같다");
  const homeDesc = decode((home.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");
  ok(homeDesc.startsWith("카카오톡에 ‘점심 12000원’처럼 보내면 기록되고, 단톡방 가계부로 여럿이 함께 씁니다.") && homeDesc.length >= 70 && homeDesc.length <= 110, `첫 화면 설명은 카카오톡·단톡방 가계부로 시작한다 (${homeDesc.length}자)`);
  ok(homeDesc.endsWith("가입하지 않아도 세 사람의 공동 생활비 예제로 정산을 직접 계산해 볼 수 있습니다."), "첫 화면 설명은 V22.9.140 의 공개 정산 예제 문장을 그대로 둔다");
  eq((home.match(/<h1>([^<]*)<\/h1>/) || [])[1], "말한 기록이, 함께 보는 생활비가 됩니다", "첫 화면 h1 은 그대로");
  const modifiedOf = (html) => JSON.parse((html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || ["", "{}"])[1]).dateModified;
  eq(modifiedOf(home), "2026-11-22", "첫 화면 수정일은 그대로(문서 제목·설명만 바꿈 — V22.9.140 의 날짜)");
  const guide = (await get("/kakao-guide")).html;
  eq((guide.match(/<title>([^<]*)<\/title>/) || [])[1], "카카오톡 가계부 입력 방법: 1:1 채팅과 단톡방 · 말해가계부", "/kakao-guide 문서 제목은 ‘카카오톡 가계부 입력 방법’ 으로 시작하고 단톡방을 함께 적는다");
  const guideDesc = decode((guide.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");
  ok(guideDesc.startsWith("카카오톡 1:1 채팅과 단톡방에서 가계부에 기록하는 문장") && guideDesc.length >= 70 && guideDesc.length <= 110, `/kakao-guide 설명 (${guideDesc.length}자)`);
  eq((guide.match(/<h1>([^<]*)<\/h1>/) || [])[1], "카카오톡 가계부 입력 방법: 보낸 문장과 저장 결과", "/kakao-guide h1 은 그대로");
  ok(guide.includes("<h2>단톡방에서 호출할 때</h2>"), "/kakao-guide 에 단톡방 절이 있다(제목이 말하는 내용)");
  ok(/updated: KAKAO_GUIDE_COPY_REVISION_DATE \}\),/.test(guideSource), "/kakao-guide 수정일은 그대로(본문을 바꾸지 않음 — 계획 A6)");
  eq(modifiedOf(guide), "2026-11-16", "/kakao-guide 화면의 수정일(dateModified)도 그대로");
} finally {
  fx.restore?.();
  globalThis.fetch = realFetch;
}
eq(outbound, 0, "바깥 요청 0회");
console.log(`V22.9.143 업데이트 소식·RSS·검색 제목 검사 통과 (${checks} checks)`);
