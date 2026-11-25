// V22.9.145 카카오톡 문장 사전(/kakao-sentences — 애드센스 마지막 신청 계획 B3): 쪽에 실린 결과가 실제 봇의 결과다.
//  이 검사가 보는 것(판 이름 글자는 적지 않는다):
//  1. 문장마다 운영과 같은 코드(픽스처 + /skill)에 카카오 1:1 채팅·단톡방 두 길로 보낸다(새 픽스처, 기준 2026-11-20 12:00 KST).
//     - 저장되는 문장: 두 길에서 저장된 행(구분·금액·분류·결제수단·메모·날짜)이 같고, 여러 건 갈래가 아니면 꼭 한 건이다.
//     - 답 갈래(다시 묻는 문장·다른 일을 하는 말): 두 길 모두 저장하지 않고 답의 첫 줄이 같다(단톡방 답이 예시 앞에 붙이는 ‘@말해가계부 ’ 만 빼고 본다).
//     - 그 값이 src/modules/public/kakao-sentences-results-v229145.js 와 같다. 결과 파일에 쪽에 없는 문장이 남지 않는다.
//     - `node validation/validate-v229145-kakao-sentences.mjs --write` 는 결과 파일을 다시 만든다(그 뒤 빌드·이 검사).
//  2. /kakao-sentences 가 200 이고, 표마다 행의 칸이 결과에서 만든 값과 같다. 제목·소개의 문장 수 = 실린 문장 수.
//  3. 길: 사이트맵(sitemap.xml)·/site-map·/guides·/kakao-guide·/demo 에서 이 쪽으로 가는 링크가 있고, 광고 화면 목록(AD_PAGE_KEYS)에 있다.
//  4. 문구 규칙: 이 쪽에 ‘무료’ 가 없다.
//  오프라인: DB·바깥 요청 없음.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { app, BASE, ctx, counter, withClock } from "./lib-audit-v22934.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const RESULTS_PATH = "src/modules/public/kakao-sentences-results-v229145.js";
// 빌드는 모듈의 내보내기 묶음에 다른 모듈이 쓰는 이름만 남긴다. 갈래 목록·기준 시각은 이 검사만 쓰므로 원본을 임시 파일로 옮겨 읽는다
// (결과 파일 없이도 읽히게 가져오기 묶음은 빈 결과로 바꾼다 — --write 가 새 문장의 결과를 만들 수 있게).
async function loadSentenceModule() {
  const source = read("src/modules/public/kakao-sentences-v229145.js");
  const importStart = source.indexOf("// @build:imports-start"), importEnd = source.indexOf("// @build:imports-end");
  const exportStart = source.indexOf("// @build:exports-start");
  if (importStart < 0 || importEnd < importStart || exportStart < importEnd) throw new Error("kakao-sentences-v229145.js: build markers not found");
  const body = "const KAKAO_SENTENCE_RESULTS_V229145 = {};\n" + source.slice(source.indexOf("\n", importEnd) + 1, exportStart)
    + "export { KAKAO_SENTENCE_GROUPS_V229145, KAKAO_SENTENCE_REFERENCE_V229145, kakaoSentenceSectionsV229145 as sectionsWithoutResultsV229145, kakaoSentenceCountV229145 as countWithoutResultsV229145 };\n";
  const dir = mkdtempSync(join(tmpdir(), "v229145-sentences-"));
  try {
    const file = join(dir, "sentences.mjs");
    writeFileSync(file, body);
    return await import(pathToFileURL(file).href);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const { KAKAO_SENTENCE_GROUPS_V229145, KAKAO_SENTENCE_REFERENCE_V229145, sectionsWithoutResultsV229145, countWithoutResultsV229145 } = await loadSentenceModule();
const kakaoSentenceCountV229145 = () => KAKAO_SENTENCE_GROUPS_V229145.reduce((sum, group) => sum + group.sentences.length, 0);
const WRITE = process.argv.includes("--write");

// ── 카카오 요청(1:1 직접·단톡방) — validate-v22995-guide 의 kakao() 와 같다. 방 준비 말은 사전 문장과 겹치지 않는 ‘우표 430원’.
const clearGuards = () => { for (const name of ["__AB_SKILL_RATE_BUCKETS", "__AB_TRAFFIC_BUCKETS", "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_INFLIGHT"]) globalThis[name]?.clear(); };
async function kakao(fx, utterance, room) {
  const key = room ? "room-owner-v229145" : "kakao_login:2265";
  const user = { id: key, type: "botUserKey", properties: { botUserKey: key } };
  const headers = { "content-type": "application/json" };
  let body;
  if (room) {
    headers["x-kakao-skill-secret"] = fx.env.KAKAO_SKILL_SECRET;
    body = { bot: { id: "667e5382f2b2f84cb555091c", name: "말해가계부" }, intent: { id: "synthetic-fallback", name: "폴백 블록" }, userRequest: { utterance, user, chat: { id: "room-v229145", type: "botGroupKey", properties: { botGroupKey: "room-v229145" } } } };
  } else {
    const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user };
    body = { intent: { id: "i1", name: "블록" }, userRequest, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
  }
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(body) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  return response.json();
}
const walk = (node, visit) => { if (Array.isArray(node)) node.forEach((item) => walk(item, visit)); else if (node && typeof node === "object") { visit(node); Object.values(node).forEach((item) => walk(item, visit)); } };
const replyTexts = (data) => { const out = []; walk(data?.template?.outputs || [], (node) => { for (const key of ["text", "description", "title"]) if (typeof node[key] === "string") out.push(node[key]); }); return out; };
const keyOf = (row) => row.id ?? row;
const liveRow = (row) => !row.deleted_at && !row.is_deleted;
async function send(text, room) {
  return withClock(KAKAO_SENTENCE_REFERENCE_V229145.date, async () => {
    const fx = await createV2265QaFixture();
    const savedFetch = globalThis.fetch;
    try {
      fx.env.SKILL_RATE_LIMIT = 10000;
      if (room) fx.env.KAKAO_SKILL_SECRET = "validate-v229145-secret";
      for (const warm of room ? ["우표 430원"] : ["오늘기록", "2"]) { clearGuards(); await kakao(fx, warm, room); }
      const before = new Set(fx.db.transactions.filter(liveRow).map(keyOf));
      clearGuards();
      const data = await kakao(fx, text, room);
      const saved = fx.db.transactions.filter(liveRow).filter((row) => !before.has(keyOf(row)))
        .map((row) => [row.type, row.amount, row.category || "", row.payment_method || "", row.memo || "", row.transaction_date]);
      return { saved, reply: (replyTexts(data)[0] || "").split("\n")[0] };
    } finally { globalThis.fetch = savedFetch; fx.restore(); }
  });
}

const { ok, eq, deepEq, done } = counter("V22.9.145 카카오톡 문장 사전: 실린 결과 = 1:1·단톡방 실제 결과, 쪽의 표·링크·광고 화면 목록 검사 통과");

// ── 1. 두 길로 다시 보내 결과 만들기 ─────────────────────────────────────
const fresh = {};
const problems = [];
for (const group of KAKAO_SENTENCE_GROUPS_V229145) {
  for (const text of group.sentences) {
    if (Object.hasOwn(fresh, text)) { problems.push(`문장이 두 번 실림: ${JSON.stringify(text)}`); continue; }
    const direct = await send(text, false);
    const room = await send(text, true);
    if (!isDeepStrictEqual(direct.saved, room.saved)) problems.push(`1:1·방 저장 결과가 다름: ${JSON.stringify(text)} 1:1 ${JSON.stringify(direct.saved)} · 방 ${JSON.stringify(room.saved)}`);
    if (group.reply) {
      if (direct.saved.length || room.saved.length) problems.push(`답 갈래인데 저장됨: ${JSON.stringify(text)} ${JSON.stringify(direct.saved)}`);
      if (direct.reply !== room.reply.split("@말해가계부 ").join("")) problems.push(`1:1·방 답 첫 줄이 다름: ${JSON.stringify(text)} 1:1 ${JSON.stringify(direct.reply)} · 방 ${JSON.stringify(room.reply)}`);
      if (!direct.reply) problems.push(`답이 비었음: ${JSON.stringify(text)}`);
      fresh[text] = { reply: direct.reply };
    } else {
      if (!direct.saved.length) problems.push(`저장되지 않음: ${JSON.stringify(text)} — 답 ${JSON.stringify(direct.reply)}`);
      if (!group.multi && direct.saved.length !== 1) problems.push(`한 건이 아님(${direct.saved.length}건): ${JSON.stringify(text)}`);
      if (group.multi && direct.saved.length < 2) problems.push(`여러 건 갈래인데 ${direct.saved.length}건: ${JSON.stringify(text)}`);
      fresh[text] = { saved: direct.saved };
    }
  }
}
eq(problems.join("\n"), "", "문장마다 1:1·단톡방 결과가 같고 갈래의 모양(저장 한 건·여러 건·답)과 맞다");

if (WRITE) {
  const lines = Object.entries(fresh).map(([text, result]) => `  ${JSON.stringify(text)}: ${result.reply !== undefined ? `{ reply: ${JSON.stringify(result.reply)} }` : `{ saved: [${result.saved.map((row) => JSON.stringify(row).replace(/,/g, ", ")).join(", ")}] }`},`);
  const out = [
    "// 생성 파일 — `node validation/validate-v229145-kakao-sentences.mjs --write` 가 만든다. 손으로 고치지 않는다(그 검사가 다시 보내 대조한다).",
    `// 문장 → { saved: [[구분, 금액, 분류, 결제수단, 메모, 날짜], …] } 또는 { reply: 봇 답의 첫 줄 }(저장하지 않은 문장). 기준 ${KAKAO_SENTENCE_REFERENCE_V229145.date} 12:00 KST, 1:1·단톡방 같음.`,
    "const KAKAO_SENTENCE_RESULTS_V229145 = Object.freeze({",
    ...lines,
    "});",
    "// @build:exports-start",
    "export { KAKAO_SENTENCE_RESULTS_V229145 };",
    "// @build:exports-end",
    "",
  ].join("\n");
  writeFileSync(new URL(RESULTS_PATH, root), out);
  console.log(`wrote ${RESULTS_PATH} (${Object.keys(fresh).length} sentences) — 이제 npm run build:worker 뒤 이 검사를 --write 없이 돌린다`);
  process.exit(0);
}

const { KAKAO_SENTENCE_RESULTS_V229145 } = await import("../src/modules/public/kakao-sentences-results-v229145.js");
deepEq(Object.keys(KAKAO_SENTENCE_RESULTS_V229145).sort(), Object.keys(fresh).sort(), "결과 파일의 문장 = 쪽에 실린 문장(남거나 빠진 문장 없음)");
for (const [text, result] of Object.entries(fresh)) deepEq(KAKAO_SENTENCE_RESULTS_V229145[text], result, `결과 파일 = 실제 결과: ${JSON.stringify(text)} (다르면 --write 로 다시 만들고 note·facts 를 본다)`);
const shown = (text) => String(text).split("\n").join(" ⏎ ");

// ── 1-2. 갈래 설명(note)이 말하는 사실 = 실제 결과 ─────────────────────────────
// 결과를 --write 로 다시 만들어도 설명은 그대로 남으므로, 설명의 사실을 갈래의 facts 로 두고 여기서 대조한다(독립 검토 P2-4).
// 표에 없는 문장(설명 속 예)은 그 갈래의 note 에 그대로 적혀 있어야 하고, 두 길로 다시 보내 같을 때만 쓴다.
const FACT_FIELDS = { type: 0, amount: 1, category: 2, payment: 3, memo: 4, date: 5 };
const FACT_KEYS = new Set(["text", "asks", "records", "dates", "reply", ...Object.keys(FACT_FIELDS)]);
const factProblems = [];
let factCount = 0;
for (const group of KAKAO_SENTENCE_GROUPS_V229145) {
  const facts = Array.isArray(group.facts) ? group.facts : [];
  if (!facts.length) factProblems.push(`${group.key}: 설명을 받치는 facts 가 없음`);
  for (const fact of facts) {
    factCount += 1;
    const label = `${group.key} ${JSON.stringify(fact.text)}`;
    for (const key of Object.keys(fact)) if (!FACT_KEYS.has(key)) factProblems.push(`${label}: 모르는 열쇠 ${key}`);
    if (Object.keys(fact).length < 2) factProblems.push(`${label}: 기대값이 없음`);
    let result = fresh[fact.text];
    if (!result) {
      if (!group.note.includes(shown(fact.text))) factProblems.push(`${label}: 표에 없는 예인데 note 에 적혀 있지 않음`);
      const direct = await send(fact.text, false), room = await send(fact.text, true);
      // 저장된 문장은 값만, 저장하지 않은 문장은 답 첫 줄까지 비교한다(위 1. 과 같다 — 저장 확인 답은 1:1·방이 다를 수 있다).
      if (!isDeepStrictEqual(direct.saved, room.saved) || (!direct.saved.length && direct.reply !== room.reply.split("@말해가계부 ").join(""))) { factProblems.push(`${label}: 1:1·방 결과가 다름 — 1:1 ${JSON.stringify(direct.saved.length ? direct.saved : direct.reply)} · 방 ${JSON.stringify(room.saved.length ? room.saved : room.reply)}`); continue; }
      result = direct.saved.length ? { saved: direct.saved } : { reply: direct.reply };
    }
    const saved = result.saved || [];
    if ("asks" in fact && (fact.asks ? (saved.length !== 0 || !result.reply) : saved.length === 0)) factProblems.push(`${label}: asks ${fact.asks} — 실제 ${saved.length ? `저장 ${saved.length}건` : `답 ${JSON.stringify(result.reply)}`}`);
    if ("records" in fact && saved.length !== fact.records) factProblems.push(`${label}: records ${fact.records} — 실제 ${saved.length}`);
    if ("dates" in fact && !isDeepStrictEqual(saved.map((row) => row[5]), fact.dates)) factProblems.push(`${label}: dates ${JSON.stringify(fact.dates)} — 실제 ${JSON.stringify(saved.map((row) => row[5]))}`);
    for (const [key, index] of Object.entries(FACT_FIELDS)) if (key in fact && (saved.length < 1 || saved[0][index] !== fact[key])) factProblems.push(`${label}: ${key} ${JSON.stringify(fact[key])} — 실제 ${JSON.stringify(saved[0]?.[index])}`);
    if ("reply" in fact && result.reply !== fact.reply) factProblems.push(`${label}: reply ${JSON.stringify(fact.reply)} — 실제 ${JSON.stringify(result.reply)}`);
  }
}
eq(factProblems.join("\n"), "", `갈래 설명의 사실 ${factCount}개 = 실제 결과(표에 없는 예는 note 에 적혀 있고 1:1·방 같음)`);
ok(factCount >= 60, `설명의 사실이 60개 이상이다 (${factCount})`);
// 결과 파일과 갈래 목록이 어긋나도 그 문장만 쪽에서 빠지고 예외를 던지지 않는다 — 공개 쪽들의 내용을 한꺼번에 만들므로 예외는 첫 화면·/faq 까지 500 으로 번진다.
// 임시 사본은 결과가 하나도 없는 모듈이다(위 loadSentenceModule).
let sectionsWithoutResults;
try { sectionsWithoutResults = sectionsWithoutResultsV229145(); } catch (error) { sectionsWithoutResults = error; }
ok(Array.isArray(sectionsWithoutResults) && sectionsWithoutResults.length === 1 && sectionsWithoutResults[0].title === "이 표를 만든 방법", "결과가 없는 문장은 표에서만 빠진다(결과가 하나도 없으면 ‘이 표를 만든 방법’ 절만, 예외 없음)");
eq(countWithoutResultsV229145(), 0, "결과가 없는 문장은 문장 수에도 들지 않는다");

// ── 2. 쪽 ─────────────────────────────────────────────────────────────
const count = kakaoSentenceCountV229145();
eq(count, Object.keys(fresh).length, "실린 문장 수 = 결과 수");
ok(count > 100, `문장이 100개가 넘는다 (${count}) — 업데이트 소식의 ‘100개가 넘는 문장’`);
const fetchPage = async (path) => { const response = await app.fetch(new Request(`${BASE}${path}`, { headers: { accept: "text/html" } }), {}, ctx); return { status: response.status, text: await response.text() }; };
const pageRes = await fetchPage("/kakao-sentences");
eq(pageRes.status, 200, "/kakao-sentences 가 열린다");
const html = pageRes.text;
ok(html.includes(`<h1>카카오톡 가계부 문장 사전: 보낸 문장 ${count}개와 실제 저장 결과</h1>`), "제목(h1)에 실린 문장 수가 있다");
ok(html.includes(`아래 ${count}개 문장의 결과는 예상해서 적은 값이 아닙니다.`), "소개의 문장 수 = 실린 문장 수");
ok(html.includes(`${KAKAO_SENTENCE_REFERENCE_V229145.label}에 보냈다고 보고 계산했습니다.`), "기준 시각을 밝힌다");
ok(html.includes('<link rel="canonical" href="https://malhaebook.com/kakao-sentences"'), "정본 주소");
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const weekday = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return `${m}월 ${d}일(${"일월화수목금토"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`; };
const cells = ([type, amount, category, payment, memo, date]) => [type === "income" ? "수입" : "지출", `${Number(amount).toLocaleString("ko-KR")}원`, category || "-", payment || "-", memo || "-", weekday(date)];
const rowHtml = (cellsOfRow) => `<tr>${cellsOfRow.map((cell, index) => index === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join("")}</tr>`;
let rows = 0;
for (const group of KAKAO_SENTENCE_GROUPS_V229145) {
  ok(html.includes(`<h2>${esc(group.title)}</h2>`), `절 제목: ${group.title}`);
  for (const text of group.sentences) {
    const result = fresh[text];
    let expected;
    if (group.reply) expected = [shown(text), result.reply];
    else if (group.multi) expected = [shown(text), result.saved.map((record, index) => { const [kind, won, category, payment, memo, date] = cells(record); return `${index + 1}) ${kind} ${won} · ${category} · ${payment === "-" ? "" : `${payment} · `}${memo} · ${date}`; }).join(" / ")];
    else expected = [shown(text), ...cells(result.saved[0])];
    ok(html.includes(rowHtml(expected)), `표의 행 = 실제 결과: ${JSON.stringify(text)}`);
    rows += 1;
  }
}
eq((html.match(/<tbody>[\s\S]*?<\/tbody>/g) || []).reduce((sum, body) => sum + (body.match(/<tr>/g) || []).length, 0), rows, "표의 행 수 = 실린 문장 수(다른 표 없음)");
ok(!html.includes("무료"), "이 쪽에 ‘무료’ 가 없다");
const updates = await fetchPage("/updates");
ok(updates.text.includes("<div class=\"pubUpdate\" id=\"v229145\">") && updates.text.includes("보낸 100개가 넘는 문장이 어떻게 저장되는지"), "업데이트 소식의 이 판 묶음은 문장 수를 ‘100개가 넘는’ 으로 적는다(위 문장 수 확인과 짝)");

// ── 3. 길 ─────────────────────────────────────────────────────────────
const sitemap = await fetchPage("/sitemap.xml");
ok(sitemap.text.includes("<loc>https://malhaebook.com/kakao-sentences</loc>"), "사이트맵에 있다");
for (const path of ["/site-map", "/guides", "/kakao-guide", "/demo"]) {
  const res = await fetchPage(path);
  eq(res.status, 200, `${path} 가 열린다`);
  ok(res.text.includes('href="/kakao-sentences"'), `${path} 에서 문장 사전으로 가는 링크가 있다`);
}
const siteConfig = read("src/modules/public/site-config.js");
const adKeys = siteConfig.slice(siteConfig.indexOf("const AD_PAGE_KEYS = Object.freeze(["), siteConfig.indexOf("]);", siteConfig.indexOf("const AD_PAGE_KEYS = Object.freeze([")));
ok(adKeys.includes('"/kakao-sentences"'), "광고 화면 목록(AD_PAGE_KEYS)에 있다");
const contentPaths = siteConfig.slice(siteConfig.indexOf("const PUBLIC_CONTENT_PATHS = Object.freeze(["), siteConfig.indexOf("]);", siteConfig.indexOf("const PUBLIC_CONTENT_PATHS = Object.freeze([")));
ok(contentPaths.includes('"/kakao-sentences"'), "공개 정본 목록(PUBLIC_CONTENT_PATHS)에 있다");

done();
