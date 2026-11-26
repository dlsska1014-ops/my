#!/usr/bin/env node
// V22.9.146 (애드센스 마지막 신청 계획 B4·B5·‘가상’ 정리 — 사용자 2026-11-25 "애드센스 승인 목표를 우선으로 … 빠르게 검토하고 수정해서 재검토",
// 같은 날 "좋아 바로 진행하자"): 예시 데이터로 찍은 실제 웹 가계부 화면 사진, 그 기록을 만든 카카오톡 문장, 처리방침 이용 목적 추가 개정 알림,
// 공개 문구의 ‘가상’ → ‘예시’ 를 본다.
//   1. 사진 파일(src/modules/assets/real-screens-images-v229146.js — tools/build-real-screens.mjs 가 만든 생성 파일): 네 장(홈·내역·방 내역·정산)이
//      시나리오의 사진 목록과 같은 차례이고, base64 → 바이트 수·SHA-256·WebP 머리·크기(390×844 의 2배)·주소(/assets/real-screen-<key>-v229146.webp)가
//      맞으며, 넷을 합쳐 240,000 B 이하다. 생성 파일 머리의 시나리오 SHA-256 = 지금 시나리오 파일(빌드 블록 뺀 글) — 문장·기대값을 바꾸면 사진을
//      다시 찍어야 한다.
//   2. 사진 주소: GET 200·image/webp·1년 immutable·nosniff·CORP same-origin·ETag, 바이트 = 생성 파일. HEAD 는 빈 몸. 모르는 이름·다른 판 번호 404.
//   3. 시나리오를 지금 코드로 다시 보낸다(tools/build-real-screens.mjs 의 seedRealScreensScenario — 사진을 만든 것과 같은 함수): 문장마다 저장된
//      기록(날짜·구분·금액·분류·결제수단·메모·원문, 방은 보낸 사람) = 시나리오 expect, 기록 수, 정산 답의 송금 = transfers, 웹 정산 화면의 송금 제안 순서,
//      그 세션으로 연 네 화면(사진을 찍은 주소)의 HTML 에 checks 글이 모두 있고 대체 글(alt)의 금액·비율도 그 화면에 있다.
//   4. 공개 화면: 첫 화면(미리보기 절 = 홈·내역, 공동 가계부 묶음 = 정산), /kakao-guide(#real-screens 내역·홈 + 1:1 문장 11줄), /group-accountbook
//      (#real-screens-room 방 내역·정산 + 방 문장 9줄), /demo(#real-screens 네 장, 문장 목록 없음, 두 안내의 문장으로 가는 링크). img 의 크기·대체 글·
//      lazy, 그림 설명의 찍은 날 = 시나리오 시계, 문장 목록 = 시나리오(날짜·이름·문장·결과), 사진 CSS 는 사진이 있는 쪽에만.
//   5. B5 처리방침: 이용 목적 추가 개정 시행일 2027-01-04 − 이 판 CHANGELOG 머리 줄 날짜 ≥ 30일(12절), 가입 동의 version(POLICY_REVISION_DATE)·
//      현재 개정 공고일 그대로, 시행 전(머리 줄 날짜·2027-01-03)에는 /privacy 머리 아래 알림 상자, 시행일(2027-01-04)부터는 없음, 머리 줄·2절·12절
//      문단은 늘 있음, /terms 는 그대로, /updates 의 이 판 묶음에 알림.
//   6. ‘가상’: 사이트맵의 모든 쪽·로그인 화면·계산표 자산(지금 판)에 ‘가상’ 이 ‘가상자산’·‘감가상각’ 과 OG 이미지 대체 글(meta) 밖에 없다.
//      계산표 자산 주소는 지금 판 v229146(1년 캐시), 앞 판 v229140 은 같은 내용, 두 판 전 v229139 는 404.
//   7. 수정일: 새 내용이 생긴 다섯 쪽(/·/kakao-guide·/group-accountbook·/demo·/privacy)의 화면·구조화 데이터·사이트맵 = REAL_SCREENS_COPY_DATE_V229146,
//      그 날짜인 쪽은 이 다섯과 V22.9.145 의 /updates·/kakao-sentences 뿐이다(‘가상’ 낱말만 바뀐 글은 수정일을 올리지 않는다 — V22.9.140 규칙).
// 사진의 픽셀은 이 검사가 다시 그리지 않는다(Chrome 이 필요하다). 화면이 바뀌면 3 의 checks 가 먼저 떨어지고, 그때 tools/build-real-screens.mjs 로
// 다시 찍고 주소의 판 번호를 올린다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as audit from "./lib-audit-v22934.mjs";
import { AB_REAL_SCREENS_IMAGES_V229146 } from "../src/modules/assets/real-screens-images-v229146.js";
import * as scenario from "../src/modules/public/real-screens-scenario-v229146.js";
import { POLICY_NOTICE_DATE, POLICY_PURPOSE_REVISION_DATE_V229146, POLICY_REVISION_DATE, REAL_SCREENS_COPY_DATE_V229146 } from "../src/modules/public/site-config.js";
import { PUBLIC_WORKSHEETS_V229106 } from "../src/modules/public/worksheet-pages.js";
import { SHOTS, SHOT_HEIGHT, SHOT_SCALE, SHOT_WIDTH, realScreensScenarioHash, seedRealScreensScenario, webpSize } from "../tools/build-real-screens.mjs";

const { app, BASE, fixture, withClock } = audit;
const { REAL_SCREENS_CLOCK_V229146: CLOCK, REAL_SCREENS_PERSONAL_V229146: PERSONAL, REAL_SCREENS_ROOM_V229146: ROOM, REAL_SCREENS_SHOTS_V229146: SHOT_META } = scenario;
let checks = 0;
const failures = [];
const ok = (value, message) => { checks += 1; if (!value) { failures.push(message); console.log(`FAIL: ${message}`); } };
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const decode = (text) => String(text).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const visible = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const between = (text, start, end) => { const a = text.indexOf(start); if (a < 0) return ""; const b = text.indexOf(end, a + start.length); return b < 0 ? "" : text.slice(a, b + end.length); };
const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
const get = async (fx, path, headers = {}, method = "GET") => {
  const response = await app.fetch(new Request(`${BASE}${path}`, { method, headers: { accept: "text/html", ...headers } }), fx.env, ctx());
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, bytes, html: new TextDecoder().decode(bytes) };
};
const KEYS = ["home", "list", "room", "settle"];
const META = new Map(SHOT_META.map((shot) => [shot.key, shot]));
const won = (n) => `${Number(n).toLocaleString("en-US")}원`;
const dayLabel = (ymd) => { const [, m, d] = ymd.split("-").map(Number); return `${m}월 ${d}일`; };
const changelogHead = (read("CHANGELOG.md").split("\n").find((line) => /^## V22\.9\.146\b/.test(line)) || "");
const HEAD_DATE = (changelogHead.match(/ · (\d{4}-\d{2}-\d{2}) · /) || [])[1] || "";
const dayNumber = (ymd) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86400000);
const FIVE = ["/", "/kakao-guide", "/group-accountbook", "/demo", "/privacy"];

// ── 1. 사진 파일 ─────────────────────────────────────────────────────────────
{
  eq(AB_REAL_SCREENS_IMAGES_V229146.map((item) => item.key).join(","), KEYS.join(","), "1 사진 네 장(홈·내역·방 내역·정산)이 차례대로 있다");
  eq(SHOT_META.map((item) => item.key).join(","), KEYS.join(","), "1 시나리오의 사진 목록도 같은 차례다");
  eq(SHOTS.map((item) => item.key).join(","), KEYS.join(","), "1 도구가 찍는 화면 목록도 같은 차례다");
  let total = 0;
  for (const item of AB_REAL_SCREENS_IMAGES_V229146) {
    const bytes = Buffer.from(item.base64, "base64");
    total += bytes.length;
    eq(bytes.length, item.bytes, `1 ${item.key}: base64 를 풀면 적힌 바이트 수다`);
    eq(sha256(bytes), item.sha256, `1 ${item.key}: SHA-256 이 적힌 값이다`);
    let size = { width: 0, height: 0 };
    try { size = webpSize(bytes); } catch (error) { ok(false, `1 ${item.key}: WebP 머리 — ${error.message}`); }
    ok(size.width === SHOT_WIDTH * SHOT_SCALE && size.height === SHOT_HEIGHT * SHOT_SCALE && item.width === size.width && item.height === size.height, `1 ${item.key}: WebP 크기 ${size.width}×${size.height} = 390×844 의 2배`);
    ok(item.cssWidth === SHOT_WIDTH && item.cssHeight === SHOT_HEIGHT, `1 ${item.key}: 화면 크기는 390×844 다`);
    eq(item.path, `/assets/real-screen-${item.key}-v229146.webp`, `1 ${item.key}: 1년 캐시 주소`);
    ok(META.get(item.key) && META.get(item.key).label && META.get(item.key).alt.length >= 40 && Array.isArray(META.get(item.key).checks) && META.get(item.key).checks.length >= 3, `1 ${item.key}: 이름·대체 글·대조할 글이 시나리오에 있다`);
  }
  ok(total > 100000 && total <= 240000, `1 사진 네 장을 합친 크기 ${total} B 가 240,000 B 이하다`);
  const generated = read("src/modules/assets/real-screens-images-v229146.js");
  const header = generated.split("\n").slice(0, 6).join("\n");
  const recorded = (header.match(/시나리오 파일 SHA-256 ([0-9a-f]{64})/) || [])[1] || "";
  eq(recorded, realScreensScenarioHash(read("src/modules/public/real-screens-scenario-v229146.js")), "1 생성 파일 머리의 시나리오 SHA-256 = 지금 시나리오 파일(빌드 블록 뺀 글) — 다르면 tools/build-real-screens.mjs 로 다시 찍는다");
  ok(/그림 (?:HeadlessChrome|Chrome)\/\d+\.\d+\.\d+\.\d+/.test(header) && header.includes("WebP 품질 80"), "1 생성 파일 머리에 그린 Chrome 판·WebP 품질이 있다");
}

// ── 2·4·5·6·7: 공개 화면(로그인 없음) ─────────────────────────────────────────
await fixture(async (fx) => {
  // 2. 사진 주소
  for (const item of AB_REAL_SCREENS_IMAGES_V229146) {
    const response = await get(fx, item.path, { accept: "image/webp,*/*" });
    eq(response.status, 200, `2 ${item.key}: GET 200`);
    eq(response.headers.get("content-type"), "image/webp", `2 ${item.key}: image/webp`);
    eq(response.headers.get("cache-control"), "public, max-age=31536000, immutable", `2 ${item.key}: 1년 immutable`);
    ok(response.headers.get("x-content-type-options") === "nosniff" && response.headers.get("cross-origin-resource-policy") === "same-origin", `2 ${item.key}: nosniff·CORP same-origin`);
    eq(response.headers.get("etag"), `"ab-real-screen-${item.key}-v229146"`, `2 ${item.key}: ETag`);
    eq(sha256(response.bytes), item.sha256, `2 ${item.key}: 내려보낸 바이트 = 생성 파일`);
    const head = await get(fx, item.path, {}, "HEAD");
    ok(head.status === 200 && head.bytes.length === 0 && head.headers.get("content-type") === "image/webp", `2 ${item.key}: HEAD 200·빈 몸`);
  }
  for (const path of ["/assets/real-screen-nope-v229146.webp", "/assets/real-screen-home-v229145.webp", "/assets/real-screen-home-v229146.png"]) {
    const response = await get(fx, path, { accept: "image/webp,*/*" });
    ok(response.status === 404 && response.headers.get("content-type") !== "image/webp", `2 ${path}: 없는 사진은 404`);
  }
  const post = await get(fx, "/assets/real-screen-home-v229146.webp", { "content-type": "application/octet-stream" }, "POST");
  ok(!(post.status === 200 && post.headers.get("content-type") === "image/webp"), `2 POST 는 사진을 내지 않는다(${post.status})`);

  // 4. 공개 화면의 사진 절
  const pages = new Map();
  for (const path of ["/", "/kakao-guide", "/group-accountbook", "/demo", "/faq", "/budget-guide", "/privacy", "/terms", "/updates"]) pages.set(path, await get(fx, path));
  const figures = (html) => [...html.matchAll(/<figure class="pubShots"(?: id="([^"]+)")?>([\s\S]*?)<\/figure>/g)].map((m) => ({ id: m[1] || "", body: m[2] }));
  const images = (body) => [...body.matchAll(/<img ([^>]*)\/?>/g)].map((m) => {
    const attr = (name) => decode((m[1].match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] || "");
    return { src: attr("src"), width: attr("width"), height: attr("height"), alt: attr("alt"), loading: attr("loading"), decoding: attr("decoding") };
  });
  const keysOf = (body) => images(body).map((img) => (img.src.match(/^\/assets\/real-screen-([a-z]+)-v229146\.webp$/) || [])[1] || `?${img.src}`);
  const [cy, cm, cd] = CLOCK.split("-").map(Number);
  const method = `예시 데이터로 찍은 실제 웹 가계부 화면이에요(휴대폰 화면 폭 390px, ${cy}년 ${cm}월 ${cd}일 정오 기준).`;
  const expectFigures = {
    "/": [["", ["home", "list"]], ["", ["settle"]]],
    "/kakao-guide": [["real-screens", ["list", "home"]]],
    "/group-accountbook": [["real-screens-room", ["room", "settle"]]],
    "/demo": [["real-screens", ["home", "list", "room", "settle"]]],
  };
  for (const [path, expected] of Object.entries(expectFigures)) {
    const html = pages.get(path).html;
    const found = figures(html);
    eq(found.map((f) => `${f.id}:${keysOf(f.body).join("+")}`).join(" | "), expected.map(([id, keys]) => `${id}:${keys.join("+")}`).join(" | "), `4 ${path}: 사진 묶음과 차례`);
    for (const figure of found) {
      for (const img of images(figure.body)) {
        const key = (img.src.match(/real-screen-([a-z]+)-/) || [])[1];
        ok(img.width === String(SHOT_WIDTH) && img.height === String(SHOT_HEIGHT) && img.loading === "lazy" && img.decoding === "async", `4 ${path} ${key}: width 390·height 844·lazy·async`);
        eq(img.alt, META.get(key)?.alt, `4 ${path} ${key}: 대체 글 = 시나리오`);
      }
      const caption = decode((figure.body.match(/<figcaption>([\s\S]*?)<\/figcaption>/) || [])[1] || "");
      ok(caption.endsWith(method), `4 ${path}: 그림 설명이 찍은 방법·날(${CLOCK} 정오)로 끝난다 — ${caption.slice(-60)}`);
      ok(!/<a\b|<button|<form|<input|<script/.test(figure.body), `4 ${path}: 사진 묶음은 읽기 전용이다`);
    }
    ok(html.includes(".pubShots{") && html.includes(".pubShotLog{"), `4 ${path}: 사진 CSS 를 싣는다`);
    ok(!html.includes('class="pubFlow"'), `4 ${path}: 예전 화살표 그림이 없다`);
  }
  for (const path of ["/faq", "/budget-guide", "/privacy"]) ok(!pages.get(path).html.includes(".pubShots{") && !pages.get(path).html.includes('class="pubShots"'), `4 ${path}: 사진이 없는 쪽은 사진 CSS 를 싣지 않는다`);
  const home = pages.get("/").html;
  const preview = between(home, '<section class="pubLand pubLandPreview" id="app-preview"', "</section>");
  ok(preview.includes('<figure class="pubShots">') && preview.includes('href="/kakao-guide#real-screens"') && !home.includes('<figure class="pubPreview">'), "4 /: 미리보기 절은 사진이고 그 문장이 실린 안내(/kakao-guide#real-screens)로 이어진다");
  ok(between(home, '<section class="pubLand pubLandGroup"', "</section>").includes("real-screen-settle-v229146.webp"), "4 /: 공동 가계부 묶음에 정산 사진");
  const logItems = (html) => [...(between(html, '<ol class="pubShotLog">', "</ol>")).matchAll(/<li><span>([^<]*)<\/span><code>([^<]*)<\/code><em>([^<]*)<\/em><\/li>/g)].map((m) => [decode(m[1]), decode(m[2]), decode(m[3])]);
  const personalLog = PERSONAL.messages.map((msg) => [dayLabel(msg.day), msg.text, msg.expect ? `${msg.expect.category} · ${won(msg.expect.amount)}` : /예산/.test(msg.text) ? "예산 설정" : "이름 정하기"]);
  const roomLog = ROOM.messages.map((msg) => [`${dayLabel(msg.day)} · ${ROOM.members[msg.who]}`, msg.text, msg.expect ? `${ROOM.members[msg.who]} 지출 ${won(msg.expect.amount)}` : /정산$/.test(msg.text) ? "이번 달 정산 답" : `${ROOM.members[msg.who]} 이름 정하기`]);
  eq(JSON.stringify(logItems(pages.get("/kakao-guide").html)), JSON.stringify(personalLog), "4 /kakao-guide: 문장 목록 11줄 = 시나리오(날짜·문장·저장된 값)");
  eq(JSON.stringify(logItems(pages.get("/group-accountbook").html)), JSON.stringify(roomLog), "4 /group-accountbook: 문장 목록 9줄 = 시나리오(날짜·이름·문장·결과)");
  // 사진의 기록은 실제 이용자의 대화가 아니라 예시 문장을 봇과 같은 코드에 보내 만든 것이다 — 그렇게 밝히고, 카카오톡으로 ‘보내 넣었다’ 고 부풀리지 않는다(독립 검토).
  ok(pages.get("/kakao-guide").html.includes("<p class=\"pubShotLead\">이 화면의 기록은 아래 예시 문장을 1:1 채팅에서 보낸 것처럼 말해가계부 카카오톡 봇과 같은 코드에 보내 만들었어요. 날짜는 문장마다 정한 보낸 날이에요.</p>")
    && pages.get("/group-accountbook").html.includes("<p class=\"pubShotLead\">이 화면의 기록은 아래 예시 문장을 단톡방의 네 사람이 보낸 것처럼 말해가계부 카카오톡 봇과 같은 코드에 보내 만들었어요. 이름은 예시이고, 날짜는 문장마다 정한 보낸 날이에요.</p>"),
  "4 문장 목록 앞 문장이 예시 문장을 봇과 같은 코드에 보내 만들었다고 밝힌다(1:1 채팅·단톡방)");
  for (const path of ["/kakao-guide", "/group-accountbook"]) ok(visible(pages.get(path).html).includes("실제 이용자의 기록은 아니에요."), `4 ${path}: 사진 절 문단이 실제 이용자의 기록이 아님을 밝힌다`);
  for (const path of ["/", "/kakao-guide", "/group-accountbook", "/demo"]) ok(!/보내 넣었어요|채팅으로 보낸 문장 보기|단톡방에서 보낸 문장 보기|한 사람이 보낸 문장으로|사진 속 기록을 만든 카카오톡 문장/.test(visible(pages.get(path).html)), `4 ${path}: 사진 출처를 실제 대화처럼 적은 옛 문장이 없다`);
  // 첫 화면 PC(860px 이상): 사진을 오른쪽 열에(예전 그린 그림 자리), 두 장이 한 줄. 안내 글 쪽: .pubSection 의 ul·ol·li·p 규칙(0,1,1)을 이기는 선택자.
  ok(home.includes(".pubLandPreview>.pubShots{grid-column:2;grid-row:1/-1;margin:0}") && home.includes(".pubLandPreview>.pubShots img{width:170px}"), "4 /: PC 에서 미리보기 사진은 오른쪽 열(빈 열이 남지 않는다)");
  for (const path of ["/kakao-guide", "/group-accountbook"]) ok(pages.get(path).html.includes(".pubSection .pubShotLog li,.pubShotLog li{") && pages.get(path).html.includes(".pubSection .pubShotLead,.pubShotLead{") && pages.get(path).html.includes(".pubSection .pubShots ul,.pubShots ul{"), `4 ${path}: 문장 목록·사진 줄 CSS 가 안내 글 쪽 규칙보다 앞선다`);
  const demo = pages.get("/demo").html;
  ok(!demo.includes('<ol class="pubShotLog">') && demo.includes('href="/kakao-guide#real-screens"') && demo.includes('href="/group-accountbook#real-screens-room"'), "4 /demo: 문장 목록 대신 두 안내의 문장으로 가는 링크");
  ok(pages.get("/kakao-guide").html.includes('id="real-screens"') && pages.get("/group-accountbook").html.includes('id="real-screens-room"'), "4 링크가 가리키는 조각(id)이 그 쪽에 있다");
  ok(pages.get("/kakao-guide").html.includes("<h2>카톡 한 줄이 웹 가계부에 들어간 모습</h2>") && pages.get("/group-accountbook").html.includes("<h2>단톡방 기록이 공동 가계부와 정산이 되는 모습</h2>") && demo.includes("<h2>실제 웹 가계부 화면</h2>"), "4 사진 절 제목");

  // 5. B5 처리방침
  ok(/^\d{4}-\d{2}-\d{2}$/.test(HEAD_DATE), `5 CHANGELOG 에 V22.9.146 머리 줄과 날짜가 있다(${HEAD_DATE || "없음"})`);
  eq(POLICY_PURPOSE_REVISION_DATE_V229146, "2027-01-04", "5 이용 목적 추가 개정 시행일");
  ok(HEAD_DATE && dayNumber(POLICY_PURPOSE_REVISION_DATE_V229146) - dayNumber(HEAD_DATE) >= 30, `5 시행일은 이 판 날짜(${HEAD_DATE})부터 30일 넘게 뒤다(12절: 이용 목적이 늘어나는 변경은 시행 30일 전부터 알림)`);
  // 알림은 운영에 올린 때부터다. 2026-12-04 안에 올리면 12-05 0시 ~ 시행일 0시만으로 만 30일 — 12-05 낮에 올리면 모자란다(독립 검토).
  ok(dayNumber(POLICY_PURPOSE_REVISION_DATE_V229146) - dayNumber("2026-12-05") >= 30, "5 2026-12-04 까지(그날 안에) 운영에 올리면 시행일 0시까지 만 30일이 넘는다(배포가 밀릴 때의 마지막 날)");
  ok(POLICY_NOTICE_DATE === "2026-11-13" && POLICY_REVISION_DATE === "2026-11-13", "5 현재 개정 공고·시행일(가입 동의 기록 version)은 그대로다");
  const notice = (html) => decode((html.match(/<p class="pubNote" id="revision-notice" role="note">([\s\S]*?)<\/p>/) || [])[1] || "").replace(/<[^>]+>/g, "");
  const PURPOSE_2 = "2027년 1월 4일부터는 서비스 이용 기록과 가계부 기록을 개인을 알아볼 수 없게 집계한 통계(예: 카카오톡 기록 문장의 갈래별 비율, 분류별 기록 수의 비율)를 서비스 안내 글에 공개할 수 있습니다. 이용자가 보낸 문장, 가계부와 사람의 이름, 한 건 한 건의 금액과 날짜는 싣지 않으며, 해당하는 사람이 적어 누구인지 짐작할 수 있는 값은 공개하지 않습니다.";
  // 12절의 공고 통로는 이 방침 맨 위다(업데이트 소식의 날짜는 판을 만든 날이라 공고 통로로 적지 않는다 — 독립 검토).
  const CHANGE_12 = "2027년 1월 4일에 시행하는 개정은 처리 목적(1절)에 집계한 이용 통계를 서비스 안내 글에 공개하는 목적을 더하고 그 내용을 2절에 적은 것입니다. 이용 목적이 늘어나는 변경이라 시행 30일 전부터 이 방침 맨 위에 알리고, 시행 전에는 이 목적으로 통계를 공개하지 않습니다. 처리하는 항목과 보유기간은 그대로입니다.";
  const PURPOSE_1 = "개인을 알아볼 수 없게 집계한 이용 통계의 공개(2027년 1월 4일부터, 자세한 내용은 2절)";
  for (const [day, shown] of [[HEAD_DATE || "2026-11-25", true], ["2026-12-31", true], ["2027-01-03", true], ["2027-01-04", false], ["2027-06-01", false]]) {
    await withClock(day, async () => {
      const privacy = await get(fx, "/privacy");
      const html = privacy.html;
      const text = notice(html);
      if (shown) ok(text.startsWith("개정 알림 2027년 1월 4일부터 처리 목적(1절)에 ‘개인을 알아볼 수 없게 집계한 이용 통계를 서비스 안내 글에 공개’를 더합니다(자세한 내용은 2절).") && text.includes("12절에 따라 시행 30일 전부터 알리며, 그 전에는 이 목적으로 통계를 공개하지 않습니다.") && text.includes("이용자가 보낸 문장이나 이름, 한 건 한 건의 금액은 공개하지 않습니다."), `5 ${day}: /privacy 머리 아래 개정 알림 상자`);
      else ok(!html.includes('id="revision-notice"'), `5 ${day}: 시행일부터는 알림 상자가 없다`);
      ok(html.indexOf('id="revision-notice"') < 0 || (html.indexOf('id="revision-notice"') > html.indexOf("</header>") && html.indexOf('id="revision-notice"') < html.indexOf('id="section-1"')), `5 ${day}: 알림 상자는 머리와 1절 사이다`);
      ok(html.includes("시행일 2026년 7월 13일 · 개정 공고 2026년 11월 13일 · 개정 시행 2026년 11월 13일 · 이용 목적 추가 개정 시행 2027년 1월 4일"), `5 ${day}: 머리 줄에 이용 목적 추가 개정 시행일`);
      const s2 = between(html, '<section class="pubSection" id="section-2">', "</section>");
      const s12 = between(html, '<section class="pubSection" id="section-12">', "</section>");
      const s1 = between(html, '<section class="pubSection" id="section-1">', "</section>");
      ok(s1.includes("<h2>1. 처리하는 항목과 목적</h2>") && decode(s1).includes(`<li>${PURPOSE_1}</li>`), `5 ${day}: 1절 목적 목록에 새 목적(시행일부터, 2절)`);
      ok(s2.includes("<h2>2. 사용자 발화와 자연어 운영 로그</h2>") && decode(s2).includes(PURPOSE_2), `5 ${day}: 2절에 이용 목적 문단(시행일부터)`);
      // 실패 사례 설정 문장(‘…이 설정과 별개입니다’ 또는 켜진 설정의 보관 기준)이 통계 문단 앞에 온다 — ‘이 설정’ 이 통계 문단을 가리키지 않게.
      ok(decode(s2).indexOf("현재 별도 실패 사례") >= 0 && decode(s2).indexOf("현재 별도 실패 사례") < decode(s2).indexOf(PURPOSE_2), `5 ${day}: 2절의 통계 문단은 실패 사례 설정 문장 뒤다`);
      ok(s12.includes("<h2>12. 개인정보처리방침의 변경</h2>") && decode(s12).includes(CHANGE_12) && decode(s12).includes("수집 항목이나 이용 목적이 늘어나는 것처럼 이용자 권리에 중요한 변경은 시행 30일 전부터 알립니다."), `5 ${day}: 12절에 이번 개정의 성격과 30일 알림`);
      const terms = await get(fx, "/terms");
      ok(!terms.html.includes('id="revision-notice"') && !terms.html.includes("이용 목적 추가 개정") && terms.html.includes("시행일 2026년 7월 13일 · 개정 공고 2026년 11월 13일 · 개정 시행 2026년 11월 13일"), `5 ${day}: /terms 는 그대로다`);
    });
  }
  const updates = pages.get("/updates").html;
  const bundle = between(updates, '<div class="pubUpdate" id="v229146">', "</div>");
  ok(bundle.includes("V22.9.146") && bundle.includes("2027년 1월 4일") && bundle.includes("개인정보처리방침") && bundle.includes("이용 목적 개정"), "5 /updates 의 V22.9.146 묶음이 처리방침 이용 목적 개정(2027년 1월 4일 시행)을 적는다");
  ok(!/알렸습니다/.test(bundle), "5 /updates 의 V22.9.146 묶음은 알린 날을 말하지 않는다(묶음 날짜 = 판을 만든 날, 알림은 운영에 올린 때부터)");
  ok(bundle.includes("실제 웹 가계부 화면 사진") && bundle.indexOf("V22.9.146") === bundle.lastIndexOf("V22.9.146"), "5 /updates 의 V22.9.146 묶음이 실제 화면 사진도 알린다");

  // 6. ‘가상’
  const sitemap = (await get(fx, "/sitemap.xml")).html;
  const entries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((m) => ({ path: new URL(m[1]).pathname, lastmod: m[2] }));
  ok(entries.length >= 50, `6 사이트맵 쪽 ${entries.length}개`);
  const virtual = /(?<!감)가상(?!자산)/g;
  const withoutOgAlt = (html) => html.replace(/<meta (?:property|name)="(?:og|twitter):image:alt" content="[^"]*"\s*\/?>/g, "");
  const worksheetLinks = new Set();
  const left = [];
  for (const { path } of entries) {
    const response = await get(fx, path);
    if (response.status !== 200) { ok(false, `6 ${path}: 200 이 아니다(${response.status})`); continue; }
    const hits = withoutOgAlt(response.html).match(virtual) || [];
    if (hits.length) left.push(`${path} ${hits.length}`);
    for (const m of response.html.matchAll(/\/assets\/living-worksheet-(v\d+)-([a-z0-9-]+)\.html/g)) worksheetLinks.add(`${m[1]} ${m[2]}`);
  }
  eq(left.join(", "), "", "6 사이트맵의 모든 쪽에 ‘가상’ 이 없다(‘가상자산’·‘감가상각’·OG 대체 글 밖)");
  const og = (pages.get("/").html.match(/<meta property="og:image:alt" content="([^"]*)"/) || [])[1] || "";
  ok(og.includes("가상 데이터로 그린 웹 가계부 홈 화면 일부"), "6 OG 이미지 대체 글은 그림 속 글을 그대로 말한다(그림을 다시 만들 때 함께 고친다)");
  // 로그인 화면 = 로그인하지 않은 /my(200 — 옆에 예시 카드). /login 은 없는 주소다.
  const loginPage = await get(fx, "/my");
  eq(loginPage.status, 200, "6 로그인 화면(/my, 로그인 전)이 열린다");
  eq((withoutOgAlt(loginPage.html).match(virtual) || []).length, 0, "6 로그인 화면(/my, 로그인 전)에 ‘가상’ 이 없다");
  ok(loginPage.html.includes("카카오톡 대화 예시") && loginPage.html.includes("예시 예산 카드") && loginPage.html.includes('aria-label="대화 기록 예시"'), "6 로그인 화면 옆 예시 카드는 ‘예시’ 라고 밝힌다");
  const versions = new Set([...worksheetLinks].map((row) => row.split(" ")[0]));
  const slugs = [...new Set([...worksheetLinks].map((row) => row.split(" ")[1]))];
  eq([...versions].join(","), "v229146", "6 글이 가리키는 계산표 자산은 모두 지금 판(v229146) 주소다");
  eq(slugs.slice().sort().join(" "), Object.keys(PUBLIC_WORKSHEETS_V229106).sort().join(" "), `6 글이 가리키는 계산표 ${slugs.length}개 = 계산표 목록 전부`);
  for (const slug of slugs) {
    const now = await get(fx, `/assets/living-worksheet-v229146-${slug}.html`);
    ok(now.status === 200 && now.headers.get("cache-control") === "public, max-age=31536000, immutable" && !(now.html.match(virtual) || []).length && now.html.includes("예제로 되돌리기"), `6 ${slug}: v229146 계산표 200·1년 캐시·‘가상’ 없음`);
    const previous = await get(fx, `/assets/living-worksheet-v229140-${slug}.html`);
    ok(previous.status === 200 && sha256(previous.bytes) === sha256(now.bytes), `6 ${slug}: 앞 판 주소(v229140)는 같은 내용이다(5분 캐시 글의 옛 링크)`);
    eq((await get(fx, `/assets/living-worksheet-v229139-${slug}.html`)).status, 404, `6 ${slug}: 두 판 전 주소(v229139)는 404`);
  }

  // 7. 수정일
  ok(/^\d{4}-\d{2}-\d{2}$/.test(REAL_SCREENS_COPY_DATE_V229146) && (!HEAD_DATE || REAL_SCREENS_COPY_DATE_V229146 <= HEAD_DATE), `7 수정일 상수(${REAL_SCREENS_COPY_DATE_V229146})는 날짜 꼴이고 이 판 날짜(${HEAD_DATE}) 뒤가 아니다`);
  for (const path of FIVE) {
    const html = pages.has(path) ? pages.get(path).html : (await get(fx, path)).html;
    ok(html.includes(`"dateModified":"${REAL_SCREENS_COPY_DATE_V229146}"`) && html.includes(`<time datetime="${REAL_SCREENS_COPY_DATE_V229146}">`), `7 ${path}: 화면·구조화 데이터 수정일 = ${REAL_SCREENS_COPY_DATE_V229146}`);
    eq((entries.find((entry) => entry.path === path) || {}).lastmod, REAL_SCREENS_COPY_DATE_V229146, `7 ${path}: 사이트맵 lastmod`);
  }
  // V22.9.147: /updates 의 lastmod 는 가장 새 업데이트 소식 묶음의 날짜라 뒤 판이 묶음을 더하면 옮겨 간다 — 그 쪽은 따로 본다(이 판 또는 뒤 판).
  const updatesLastmod = (entries.find((entry) => entry.path === "/updates") || {}).lastmod || "";
  ok(updatesLastmod >= REAL_SCREENS_COPY_DATE_V229146, `7 /updates 의 lastmod(${updatesLastmod})는 이 날짜이거나 뒤 판의 업데이트 소식 날짜다`);
  const sameDay = entries.filter((entry) => entry.lastmod === REAL_SCREENS_COPY_DATE_V229146 && entry.path !== "/updates").map((entry) => entry.path).sort();
  eq(sameDay.join(" "), [...FIVE, "/kakao-sentences"].sort().join(" "), "7 그 날짜인 쪽은 다섯 쪽과 V22.9.145 의 /kakao-sentences 뿐이다(‘가상’ 낱말만 바뀐 글은 그대로, /updates 는 위에서 따로)");
  for (const [path, date] of [["/emergency-fund-basics", "2026-10-12"], ["/budget-ratio-guide", "2026-11-22"], ["/shared-living-cost-rules", "2026-11-22"]]) eq((entries.find((entry) => entry.path === path) || {}).lastmod, date, `7 ${path}: 낱말만 바뀐 글은 수정일 그대로`);
});

// ── 3. 시나리오를 지금 코드로 다시 보낸다 ────────────────────────────────────────
const clockBefore = globalThis.__AB_QA_FIXED_NOW_MS;
try {
  await fixture(async (fx) => {
    const seeded = await seedRealScreensScenario(audit, fx, scenario);
    const userOf = (who) => (fx.db.users.find((user) => user.kakao_user_key === seeded.keys[who]) || {}).id;
    const rowsOf = (household) => fx.db.transactions.filter((row) => row.household_id === household);
    const personalRows = rowsOf(seeded.ids.personal);
    const roomRows = rowsOf(seeded.ids.room);
    eq(personalRows.length, PERSONAL.messages.filter((msg) => msg.expect).length, "3 개인 가계부 기록 수 = 기록 문장 수(예산·이름 문장은 기록이 아니다)");
    eq(roomRows.length, ROOM.messages.filter((msg) => msg.expect).length, "3 방 가계부 기록 수 = 기록 문장 수");
    const compare = (rows, msg, label, who) => {
      const matches = rows.filter((row) => row.transaction_date === msg.day && row.memo === msg.expect.memo);
      eq(matches.length, 1, `3 ${label} ${msg.day} «${msg.text}»: 그날 그 메모의 기록이 하나다`);
      const row = matches[0] || {};
      eq(JSON.stringify([row.type, row.amount, row.category, row.payment_method || "", row.raw_text]), JSON.stringify([msg.expect.type, msg.expect.amount, msg.expect.category, msg.expect.payment, msg.text.replace(/^@말해가계부\s+/, "")]), `3 ${label} «${msg.text}»: 구분·금액·분류·결제수단·원문 = 시나리오`);
      if (who !== undefined) eq(row.user_id, userOf(who), `3 ${label} «${msg.text}»: 보낸 사람(${ROOM.members[who]})의 기록이다`);
    };
    for (const msg of PERSONAL.messages.filter((m) => m.expect)) compare(personalRows, msg, "1:1");
    for (const msg of ROOM.messages.filter((m) => m.expect)) compare(roomRows, msg, "방", msg.who);
    const budgetReply = seeded.replies.find((r) => r.scope === "personal" && /예산/.test(r.message.text));
    ok(JSON.stringify(budgetReply?.body || {}).includes("800,000"), "3 ‘월 예산 80만원’ 답에 800,000원");
    const settle = seeded.replies.find((r) => r.scope === "room" && /정산$/.test(r.message.text));
    const settleText = String(settle?.body?.template?.outputs?.find((o) => o.simpleText)?.simpleText?.text || "");
    const sendBlock = (settleText.split("💸 이렇게 보내면 돼요")[1] || "").split("\n\n")[0];
    eq([...sendBlock.matchAll(/• (\S+) → (\S+): ([\d,]+)원/g)].map((m) => `${m[1]}>${m[2]}:${m[3]}`).join(" "), ROOM.transfers.map(([from, to, amount]) => `${from}>${to}:${Number(amount).toLocaleString("en-US")}`).join(" "), "3 단톡방 정산 답의 송금 = 시나리오 transfers");
    const cookie = seeded.cookie;
    const pathsBy = { personal: seeded.ids.personal, room: seeded.ids.room };
    // 그 화면에만 있는 표식(독립 검토 — 홈 HTML 에도 최근 기록 9건이 있어 내역 사진의 글만으로는 탭이 열렸는지 모른다).
    // 내역 탭의 머리 줄 ‘거래내역 N건 · 수입 0원 · 지출 합계’ 는 시나리오의 기록 수·금액 합계로 만든다.
    const listHead = (messages) => { const rows = messages.filter((msg) => msg.expect); return `거래내역 ${rows.length}건 · 수입 0원 · 지출 ${won(rows.reduce((sum, msg) => sum + msg.expect.amount, 0))}`; };
    const HOME_MARK = "이번 달 쓸 수 있는 돈";
    const SCREEN_MARKS = {
      home: { has: [HOME_MARK, "예산 사용률"], not: ["거래내역 "] },
      list: { has: [listHead(PERSONAL.messages)], not: [HOME_MARK, "송금 횟수를 줄인 제안"] },
      room: { has: [listHead(ROOM.messages)], not: [HOME_MARK, "송금 횟수를 줄인 제안"] },
      settle: { has: ["송금 횟수를 줄인 제안"], not: [HOME_MARK, "거래내역 "] },
    };
    eq(Object.keys(SCREEN_MARKS).join(","), SHOTS.map((shot) => shot.key).join(","), "3 화면마다 표식이 있다");
    for (const shot of SHOTS) {
      const response = await get(fx, shot.path(pathsBy), { cookie, "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" });
      eq(response.status, 200, `3 ${shot.key}: 사진을 찍은 화면이 세션으로 열린다`);
      const screenText = visible(response.html);
      const marks = SCREEN_MARKS[shot.key] || { has: ["?"], not: [] };
      ok(marks.has.every((mark) => screenText.includes(mark)) && marks.not.every((mark) => !screenText.includes(mark)), `3 ${shot.key}: 사진을 찍은 주소가 그 화면(탭)을 연다 — 있어야 할 글 ${marks.has.join(" / ")}`);
      const meta = META.get(shot.key);
      const missing = meta.checks.filter((check) => !response.html.includes(check));
      eq(missing.join(" / "), "", `3 ${shot.key}: 지금 화면 HTML 에 사진의 글이 모두 있다(다르면 사진을 다시 찍는다)`);
      const altNumbers = [...meta.alt.matchAll(/([\d,]{4,})원|(\d+)%/g)].map((m) => m[1] || `${m[2]}%`);
      ok(altNumbers.length >= 2, `3 ${shot.key}: 대체 글에 금액·비율이 있다`);
      const absent = altNumbers.filter((n) => !response.html.includes(n));
      eq(absent.join(" "), "", `3 ${shot.key}: 대체 글의 금액·비율이 지금 화면에 있다`);
      if (shot.key === "settle") {
        const text = visible(response.html);
        const start = text.indexOf("송금 횟수를 줄인 제안");
        let at = start;
        const order = ROOM.transfers.every(([from, to, amount]) => {
          for (const piece of [from, to, Number(amount).toLocaleString("en-US")]) { const next = text.indexOf(piece, at + 1); if (next < 0) return false; at = next; }
          return true;
        });
        ok(start >= 0 && order, "3 settle: 웹 정산 화면의 송금 제안이 시나리오 차례(보낸 사람 → 받을 사람 → 금액)다");
      }
    }
  });
} finally {
  globalThis.__AB_QA_FIXED_NOW_MS = clockBefore;
}

if (failures.length) {
  console.log(`V22.9.146 실제 화면·처리방침 알림·‘가상’ 정리 검사 실패 — ${failures.length}/${checks}`);
  process.exit(1);
}
console.log(`V22.9.146 실제 화면·처리방침 알림·‘가상’ 정리 검사 통과 (${checks} checks)`);
