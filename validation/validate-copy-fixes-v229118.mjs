// V22.9.118 copy — 약관·안내·후원 문구와 챗봇 첫 사용 답의 약관 안내 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 2026-11-12 전체 점검(보고서 7절 P-1~P-14)에서 공개 안내가 운영 동작과 달랐다.
//   P-1  약관 3절·첫 화면 표·/how-it-works·/group-accountbook·/faq 가 V22.9.115 전 규칙(‘명확한 첫 거래’·‘첫 기록자가 소유자’·‘조회만으로는 참여하지 않음’)을 말했다.
//        약관 4절은 ‘삭제…는 확인 절차’ 라고 했지만 기록 한 건 삭제는 바로 지워지고 잠깐 되살릴 수 있다. /kakao-guide ‘방금 거 지워줘’ 에 V22.9.116 동작이 없었다.
//   P-2  /support 가 아직 없는 창구를 ‘준비하고 있어요(출시 뒤 안내)’·‘열리면’ 으로 약속했다(사용자 원칙: 미래 약속 금지).
//   P-3  챗봇만 쓰는 사람은 약관·방침을 볼 기회 없이 사용자 행·가계부가 생겼다(V95:E-1).
//   P-4  /kakao-commands 의 ‘베타 운영’ 문구, /chatbot-edit-guide 의 ‘삭제 확인을 한 번 더 받습니다’(실제로는 바로 지움).
//   P-11 ‘다른 계정과 자동 병합하지 않습니다’ 가 V22.9.117 계정 잇기 규칙과 달랐다.
//   P-13·P-14 robots 에 후원 경유 주소가 없었고, 봇 ‘개인정보’ 답이 ‘탈퇴 기능은 아직 없습니다’ 라고 했다.
// 고친 뒤 화면(실제 /terms·/privacy·/·/how-it-works·/group-accountbook·/faq·/kakao-guide·/support·/kakao-commands·/chatbot-edit-guide·/robots.txt·
// /sitemap.xml)과 카카오 스킬 답(1:1·단톡방, 지연 답 포함)을 픽스처로 그려 본다. 단언마다 옛 코드에서는 실패한다(옛 문장이 남아 있거나 새 문장·단추가 없다).
// 판 이름 글자는 적지 않는다(판 번호 정본 검사).
//
// ── 실행 ──
//   node validation/validate-copy-fixes-v229118.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { app, BASE, fixture, intercept, page, skill, withClock } from "./lib-audit-v22934.mjs";

let checks = 0;
const failures = [];
const ok = (value, message) => { checks += 1; if (!value) { failures.push(message); console.log(`FAIL: ${message}`); } };
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hex66 = (label) => createHash("sha256").update(label).digest("hex") + "ab";
const DAY = "2026-11-12";
const NEW_DATE = "2026-11-13";
const URL_TEXT = /https?:\/\//i;

// 화면의 JSON-LD(@graph 포함)를 펼친다.
function jsonLd(html) {
  const out = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : Array.isArray(data?.["@graph"]) ? data["@graph"] : [data];
      out.push(...items);
    } catch (_) {}
  }
  return out;
}
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");

// ── 0. 소스: 날짜 상수·약관 안내 함수·표시 자리 ───────────────────────────────────────
{
  const config = read("src/modules/public/site-config.js");
  ok(config.includes(`const POLICY_NOTICE_DATE = "${NEW_DATE}";`) && config.includes(`const POLICY_REVISION_DATE = "${NEW_DATE}";`), "0 C2 공고일 = 시행일 = 2026-11-13(배포일이 바뀌면 두 줄을 그날로)");
  const builders = read("src/modules/kakao/response-builders.js");
  const start = builders.indexOf("async function kakaoTermsNoticeResponseV229118(response, env = {}, origin = \"\") {");
  const body = start >= 0 ? builders.slice(start, builders.indexOf("\n}\n", start)) : "";
  ok(start >= 0, "0 C4 약관 안내를 붙이는 함수가 있다");
  ok(body && !/supabase\(|fetch\(|saveSetting|deferKakaoAfterReply/.test(body), "0 C4 약관 안내는 저장소를 부르지 않는다(DB 호출 수 그대로)");
  ok(body.includes('kakaoLinkButton("이용약관", `${origin}/terms`)') && body.includes('kakaoLinkButton("개인정보처리방침", `${origin}/privacy`)'), "0 C4 단추 둘 = 이용약관(/terms)·개인정보처리방침(/privacy) 링크 단추");
  const skillHandler = read("src/modules/kakao/skill-handler.js");
  ok(skillHandler.includes("const safeResponse = await kakaoTermsNoticeResponseV229118(await kakaoGroupCompatibleResponse(normalizedResponse, payload, origin), env, origin);"), "0 C4 응답 마무리 뒤 최종 답에 붙인다");
  ok(skillHandler.includes("const deferred = await kakaoTermsNoticeResponseV229118(await kakaoGroupCompatibleResponse(kakaoDeferredReply(utterance, payload), payload, origin), env, origin);"), "0 C4 지연 답에도 붙인다");
  ok(read("src/modules/kakao/identity-chat-first.js").includes("env.__AB_KAKAO_REQUEST.termsNoticeV229118 = true;"), "0 C4 1:1 첫 기록(개인 가계부 준비)이 표시를 켠다");
  ok(read("src/modules/kakao/group-links-first-record.js").includes("env.__AB_KAKAO_REQUEST.termsNoticeV229118 = true;"), "0 C4 방 첫 호출·첫 참여가 표시를 켠다");
  const bundle = read("src/index.js");
  for (const needle of ["kakaoTermsNoticeResponseV229118", "말해가계부를 이용하면 이용약관에 동의한 것으로 봐요.", "Disallow: /support/go/"]) ok(bundle.includes(needle), `0 번들에 ${needle} 가 있다`);
}

// ── 1. 공개 화면(C1·C2·C5·C6·C11) ────────────────────────────────────────────────
await withClock(DAY, () => fixture(async (fx) => {
  const html = {};
  for (const path of ["/", "/terms", "/privacy", "/how-it-works", "/group-accountbook", "/faq", "/kakao-guide", "/support", "/kakao-commands", "/chatbot-edit-guide", "/robots.txt", "/sitemap.xml"]) {
    const res = await page(fx, path, { cookie: "" });
    eq(res.status, 200, `1 ${path} 200`);
    html[path] = res.html;
  }
  const terms = visible(html["/terms"]);
  // C1 약관 3절
  ok(terms.includes("가계부가 연결되지 않은 단톡방에서 봇을 처음 부른 사람은 기록·조회·설명서 보기 중 무엇으로 불렀든 그 방의 공동 가계부를 준비하고 소유자가 됩니다."), "1 C1 약관 3절: 봇을 처음 부른 사람이 소유자(기록·조회·설명서 모두)");
  ok(terms.includes("그 뒤 같은 방에서 봇을 부르거나 기록한 사람은 승인 없이 구성원이 됩니다.") && terms.includes("소유자는 웹 ‘참여자·초대’에서 관리자·구성원에게 소유자를 넘길 수 있습니다."), "1 C1 약관 3절: 부르기만 해도 구성원·소유자 양도");
  ok(terms.includes("나갔거나 내보내진 사람은 자동으로 다시 참여하지 않으며"), "1 C1 약관 3절: 나간 사람은 자동 재참여 없음");
  ok(!terms.includes("명확한 첫 거래를 보내면") && !terms.includes("첫 기록자가 소유자"), "1 C1 약관 3절: 옛 ‘명확한 첫 거래 → 첫 기록자 소유자’ 문장이 없다");
  // C1 약관 4절
  ok(terms.includes("웹과 카카오톡에서 기록 한 건을 지우면 확인 단계 없이 바로 지워지며") && terms.includes("‘복구 01번’") && terms.includes("가계부를 영구 삭제할 때는 본인 확인을 거칩니다."), "1 C1 약관 4절: 한 건 삭제는 바로 + 되살리기, 가계부 삭제는 본인 확인");
  ok(!terms.includes("삭제와 복구는 확인 절차를 제공"), "1 C1 약관 4절: 옛 ‘삭제와 복구는 확인 절차’ 문장이 없다");
  // C1 방침 1절, C2 12절
  const privacy = visible(html["/privacy"]);
  ok(privacy.includes("단톡방 연결키는 봇을 처음 불렀을 때 준비하거나 직접 연결한 공동 가계부") && !privacy.includes("첫 기록으로 준비하거나"), "1 C1 방침 1절: 단톡방 연결키 = 봇을 처음 불렀을 때 준비한 가계부");
  ok(privacy.includes("이 개정 방침은 2026년 11월 13일에 알리고 같은 날부터 시행합니다.") && privacy.includes("1절의 단톡방 연결키 설명을 고치고, 카카오톡 챗봇을 처음 쓰는 답에 이용약관·개인정보처리방침 안내를 더한 것"), "1 C2 방침 12절: 이번 개정 한 줄 + 공고·시행 2026-11-13");
  for (const path of ["/terms", "/privacy"]) {
    ok(html[path].includes("개정 공고 2026년 11월 13일 · 개정 시행 2026년 11월 13일"), `1 C2 ${path} 머리: 개정 공고·시행 2026년 11월 13일`);
  }
  // C1 첫 화면 표
  const home = visible(html["/"]);
  ok(home.includes("그 방의 공동 가계부를 준비합니다. 봇을 처음 부른 사람이 소유자가 되고, 그 뒤 봇을 부른 참여자는 구성원이 됩니다.") && !home.includes("첫 기록자는 소유자가 됩니다"), "1 C1 첫 화면 표: 봇을 처음 부른 사람이 소유자");
  // C1·C5 /how-it-works
  const how = visible(html["/how-it-works"]);
  ok(how.includes("기록이 아니라 조회나 설명서 보기로 불러도 해당 방의 공동 가계부를 준비하며, 봇을 처음 부른 사람이 소유자가 됩니다.") && how.includes("봇을 방에 추가한 것만으로는 가계부를 만들지 않고, 거래는 명확한 기록을 보낼 때만 저장합니다."), "1 C1 /how-it-works: 부르기만 해도 준비·소유자, 거래는 명확한 기록만");
  ok(!how.includes("처음 기록한 사람이 소유자") && !how.includes("도움말을 보거나 봇을 추가한 것만으로는 가계부를 만들지 않습니다"), "1 C1 /how-it-works: 옛 ‘처음 기록한 사람이 소유자’·‘도움말로는 만들지 않음’ 이 없다");
  ok(how.includes("같은 사람의 카카오 계정임을 확인한 뒤에만 하나로 잇습니다(두 계정 모두 기록이 있으면 확인 화면에서 단추를 눌러야 잇습니다)") && !how.includes("다른 계정과 자동 병합하지 않습니다"), "1 C5 /how-it-works: 계정 잇기 규칙 한 문장(옛 ‘자동 병합하지 않습니다’ 없음)");
  // C1 /group-accountbook
  const group = visible(html["/group-accountbook"]);
  ok(group.includes("봇을 호출(기록·조회·설명서 보기 모두)") && group.includes("조회나 설명서 보기로 불러도 참여하며"), "1 C1 /group-accountbook: 표·첫 절이 ‘부르기만 해도’ 규칙");
  ok(!group.includes("일반 대화와 조회만으로는 자동 참여하지 않습니다") && !group.includes("명확한 첫 거래를 입력") && !group.includes("첫 기록자가 소유자"), "1 C1 /group-accountbook: 옛 ‘조회만으로는 참여하지 않음’·‘명확한 첫 거래’ 가 없다");
  // C1·C5 /faq + FAQPage JSON-LD
  const faq = visible(html["/faq"]);
  const faqLd = jsonLd(html["/faq"]).find((item) => item["@type"] === "FAQPage");
  const answer = (question) => faqLd?.mainEntity?.find((entry) => entry.name === question)?.acceptedAnswer?.text || "";
  const roomAnswer = answer("단톡방에 봇만 추가하면 바로 기록되나요?");
  ok(roomAnswer.includes("새 미연결 방에서는 봇을 처음 부른 사람이 기록·조회·설명서 보기 중 무엇으로 불렀든 공동 가계부를 준비해 소유자가 되고") && faq.includes("그 뒤 봇을 부르거나 기록한 사람은 승인 없이 구성원이 됩니다."), "1 C1 /faq(화면·FAQPage JSON-LD): 단톡방 답이 V22.9.115 규칙");
  const webAnswer = answer("카카오에서 기록했는데 웹에 보이지 않아요.");
  ok(webAnswer.includes("같은 사람의 카카오 계정임을 확인한 뒤에만 하나로 잇고, 두 계정 모두 기록이 있으면 확인 화면에서 단추를 눌러야 잇습니다.") && !webAnswer.includes("자동 병합하지는 않습니다"), "1 C5 /faq(JSON-LD): 계정 잇기 규칙 한 문장");
  ok(!faq.includes("명확한 첫 거래를 보내면 공동 가계부를 준비합니다") && !faq.includes("서로 다른 계정을 자동 병합하지는 않습니다"), "1 C1·C5 /faq 화면에 옛 문장이 없다");
  // C1 /kakao-guide ‘방금 거 지워줘’
  ok(visible(html["/kakao-guide"]).includes("마지막 기록을 저장한 뒤 다른 기록을 고쳤다면 지우지 않고 두 기록을 번호와 함께 다시 물어요."), "1 C1 /kakao-guide: ‘방금 거 지워줘’ 줄에 V22.9.116 되묻기");
  // 옛 규칙 문장이 공개 화면 어디에도 없다
  for (const path of ["/", "/terms", "/privacy", "/how-it-works", "/group-accountbook", "/faq", "/kakao-guide"]) {
    const text = visible(html[path]);
    ok(!/첫 기록자|처음 기록한 사람이 소유자|명확한 첫 거래|조회만으로는 자동 참여|자동 병합하지/.test(text), `1 C1 ${path} 에 옛 참여·소유자·병합 규칙 문장이 없다`);
  }
  // C2 수정일(화면 time·JSON-LD dateModified·사이트맵 lastmod)
  const sitemap = html["/sitemap.xml"];
  const lastmod = (path) => sitemap.match(new RegExp(`<loc>${BASE.replace(/[.]/g, "\\.")}${path === "/" ? "/" : path}</loc>\\s*<lastmod>([^<]+)</lastmod>`))?.[1] || "";
  for (const path of ["/", "/how-it-works", "/group-accountbook", "/faq", "/kakao-guide", "/support", "/terms", "/privacy"]) {
    ok(html[path].includes(`<time datetime="${NEW_DATE}">`), `1 C2 ${path} 수정일 표시 ${NEW_DATE}`);
    ok(jsonLd(html[path]).some((item) => item.dateModified === NEW_DATE), `1 C2 ${path} JSON-LD dateModified ${NEW_DATE}`);
    eq(lastmod(path), NEW_DATE, `1 C2 ${path} sitemap lastmod`);
  }
  // C6
  const commands = visible(html["/kakao-commands"]);
  ok(!commands.includes("베타") && commands.includes("카카오톡에서 자주 쓰는 문장과 처리 결과입니다."), "1 C6 /kakao-commands: 베타 문구가 없다");
  const editGuide = visible(html["/chatbot-edit-guide"]);
  ok(editGuide.includes("확인 없이 바로 지웁니다. 답에 나온 ‘복구 01번’을 보내면 되살릴 수 있습니다.") && !editGuide.includes("삭제 확인을 한 번 더 받습니다"), "1 C6 /chatbot-edit-guide: 삭제는 바로 + ‘복구 01번’");
  // C11
  const robots = html["/robots.txt"];
  ok(robots.includes("\nDisallow: /support/go/\n") && robots.includes("\nDisallow: /kakao-login-check\n") && robots.includes(`Sitemap: ${BASE}/sitemap.xml`), "1 C11 robots: /support/go/ 막기(다른 줄 그대로)");
}));

// ── 2. /support 의 미래 약속(C3) ─────────────────────────────────────────────────
const SUPPORT_VARS = ["SUPPORT_KAKAOPAY_URL", "SUPPORT_BANK_ACCOUNT", "SUPPORT_TOSS_URL", "COMMUNITY_OPENCHAT_URL", "SUPPORTER_OPENCHAT_URL"];
async function supportPage(vars, path = "/support") {
  return withClock(DAY, () => fixture(async (fx) => {
    for (const name of SUPPORT_VARS) delete fx.env[name];
    Object.assign(fx.env, vars);
    return page(fx, path, { cookie: "" });
  }));
}
{
  const promise = /준비|열리면|출시 뒤|출시 후/;
  // 지금 운영: COMMUNITY_OPENCHAT_URL 하나만 있다.
  const live = await supportPage({ COMMUNITY_OPENCHAT_URL: "https://open.kakao.com/o/sQaCommunity1" });
  const liveText = visible(live.html);
  eq(live.status, 200, "2 C3 /support(운영 변수) 200");
  ok(!promise.test(liveText), `2 C3 운영 변수로 그린 /support 에 ‘준비’·‘열리면’·‘출시 뒤’ 가 없다 (${(liveText.match(new RegExp(`.{0,30}(?:${promise.source}).{0,30}`)) || [""])[0]})`);
  ok(!liveText.includes("후원자 오픈채팅방 초대") && !liveText.includes("이야기 나누는 곳이에요") && liveText.includes("보상은 화면에 보이는 표시예요."), "2 C3 후원자 오픈채팅방이 없으면 그 보상 줄과 문장을 뺀다");
  ok(liveText.includes("누구나 들어올 수 있는 말해가계부 오픈채팅방이 있어요.") && live.html.includes('href="/support/go/openchat"'), "2 C3 공개 오픈채팅 안내·경유 링크는 그대로");
  // 후원자 오픈채팅방이 생기면 예전처럼 보인다.
  const both = visible((await supportPage({ COMMUNITY_OPENCHAT_URL: "https://open.kakao.com/o/sQaCommunity1", SUPPORTER_OPENCHAT_URL: "https://open.kakao.com/o/sQaSupporter1" })).html);
  ok(both.includes("후원자 오픈채팅방 초대(운영 소식을 먼저 듣고 의견을 나누는 곳)") && both.includes("후원자 오픈채팅방은 후원을 확인한 분께"), "2 C3 SUPPORTER_OPENCHAT_URL 이 있으면 보상 줄·안내 문장이 보인다");
  ok(!promise.test(both), "2 C3 변수가 다 있어도 미래 약속 말이 없다");
  // 변수가 하나도 없을 때도 약속하지 않는다.
  const none = visible((await supportPage({})).html);
  ok(none.includes("지금은 열려 있는 후원 창구가 없어요.") && none.includes("지금은 열려 있는 오픈채팅방이 없어요.") && !promise.test(none), "2 C3 변수가 없으면 ‘지금은 열려 있는 … 없어요’ 사실 문장만");
  // 없는 경유 주소의 404 화면
  const missing = await supportPage({ COMMUNITY_OPENCHAT_URL: "https://open.kakao.com/o/sQaCommunity1" }, "/support/go/kakaopay");
  eq(missing.status, 404, "2 C3 없는 후원 창구 경유 주소는 404");
  ok(missing.html.includes("이 후원 창구는 지금 열려 있지 않아요.") && !promise.test(visible(missing.html)), "2 C3 404 화면에 ‘아직 준비 중’ 이 없다");
}

// ── 3. 챗봇 첫 사용 답의 약관 안내(C4) ───────────────────────────────────────────
const SECRET = "copy-fixes-secret-v229118";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const LINE = "말해가계부를 이용하면 이용약관에 동의한 것으로 봐요.";
function resetIsolate() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD"]) globalThis[name]?.clear?.();
}
function payloadFor(utterance, { user, room = "" }) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}
async function say(fx, utterance, opts) {
  resetIsolate();
  const jobs = [];
  fx.trace = [];
  fx.replied = false;
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(payloadFor(utterance, opts)) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const before = fx.trace.length;
  fx.replied = true;
  const body = JSON.parse(await response.text());
  for (let round = 0; round < 8 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  const outputs = body?.template?.outputs || [];
  const texts = outputs.flatMap((output) => [output.simpleText?.text, output.textCard?.title, output.textCard?.description]).filter((text) => typeof text === "string");
  return { body, outputs, texts, text: texts.join("\n"), before, total: fx.trace.length };
}
async function kakaoFixture(task) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolate();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    Object.assign(fx.env, KAKAO_ENV);
    const mock = globalThis.fetch;
    fx.trace = [];
    fx.delayAfter = null;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.hostname !== "mock.supabase.co") throw new Error(`unexpected network in V22.9.118 copy QA: ${url.hostname}`);
      const method = String(init.method || "GET").toUpperCase();
      fx.trace.push({ path: url.pathname + url.search, method, afterReply: !!fx.replied });
      if (fx.delayAfter?.armed) await new Promise((resolve) => setTimeout(resolve, fx.delayAfter.ms));
      const result = await mock(input, init);
      if (fx.delayAfter && !fx.delayAfter.armed && fx.delayAfter.when(url, method)) fx.delayAfter.armed = true;
      return result;
    };
    try { return await task(fx); } finally { globalThis.fetch = mock; resetIsolate(); }
  }));
}
// 약관 안내 카드(단추 둘) 찾기
const termsCard = (reply) => reply.outputs.map((output) => output.textCard).find((card) => card?.description?.includes(LINE));
function termsButtonsOk(card) {
  const buttons = card?.buttons || [];
  return buttons.length === 2 && buttons[0].label === "이용약관" && buttons[0].action === "webLink" && buttons[0].webLinkUrl === `${BASE}/terms`
    && buttons[1].label === "개인정보처리방침" && buttons[1].action === "webLink" && buttons[1].webLinkUrl === `${BASE}/privacy`;
}
function shapeOk(label, reply) {
  ok(reply.outputs.length >= 1 && reply.outputs.length <= 3, `3 ${label}: 말풍선 1~3개 (${reply.outputs.length})`);
  ok(reply.texts.every((text) => !URL_TEXT.test(text)), `3 ${label}: 답 글에 주소가 없다(링크는 단추)`);
  ok(reply.outputs.every((output) => (output.textCard?.buttons || []).length <= 5), `3 ${label}: 카드 단추 5개 이하`);
}

await kakaoFixture(async (fx) => {
  const A = hex66("v118-copy-a"), B = hex66("v118-copy-b"), C = hex66("v118-copy-c"), D = hex66("v118-copy-d"), E = hex66("v118-copy-e"), F = hex66("v118-copy-f"), H = hex66("v118-copy-h");
  const ROOM = hex66("v118-copy-room"), ROOM2 = hex66("v118-copy-room-2");

  // 1:1 첫 기록 → 개인 가계부 준비 + 약관 안내
  const first = await say(fx, "점심 12000원", { user: A });
  shapeOk("1:1 첫 기록", first);
  ok(first.text.includes("웹 로그인 없이 내 개인 가계부를 준비했어요.") && first.text.includes("저장했어요"), "3 1:1 첫 기록 답은 예전 글 그대로(준비 안내 + 저장)");
  ok(termsButtonsOk(termsCard(first)) && first.outputs.at(-1)?.textCard === termsCard(first), "3 1:1 첫 기록 답 끝에 약관 안내 한 줄 + 이용약관·개인정보처리방침 단추");
  const second = await say(fx, "커피 4500원", { user: A });
  ok(!second.text.includes(LINE) && second.outputs.length === 1, "3 1:1 두 번째 기록에는 약관 안내가 없다");

  // 방: 가계부 없는 방의 첫 기록 → 소유자 + 약관 안내
  const roomFirst = await say(fx, "점심 12000원", { user: B, room: ROOM });
  shapeOk("방 첫 기록", roomFirst);
  ok(roomFirst.text.includes("첫 호출자인 내가 소유자예요") && termsButtonsOk(termsCard(roomFirst)), "3 방 첫 기록(소유자) 답에 약관 안내 + 단추 둘");
  ok(!(await say(fx, "커피 4500원", { user: B, room: ROOM })).text.includes(LINE), "3 방 두 번째 기록에는 약관 안내가 없다");
  // 같은 방의 다른 사람 첫 기록 → 참여 + 약관 안내
  const joinRecord = await say(fx, "택시 8000원", { user: C, room: ROOM });
  ok(joinRecord.text.includes("이 방의 공동 가계부에 참여했어요.") && termsButtonsOk(termsCard(joinRecord)), "3 방 첫 기록으로 참여한 답에 약관 안내 + 단추 둘");
  // 시작(참여): 설명서 카드의 단추는 그대로, 끝에 약관 카드
  const startJoin = await say(fx, "시작", { user: D, room: ROOM });
  const startAgain = await say(fx, "시작", { user: D, room: ROOM });
  shapeOk("방 시작(참여)", startJoin);
  ok(startJoin.text.includes("방금 이 방 가계부에 참여했어요") && termsButtonsOk(termsCard(startJoin)) && startJoin.outputs.length === 2, "3 방 ‘시작’ 으로 참여한 답 끝에 약관 카드");
  ok(JSON.stringify(startJoin.outputs[0].textCard?.buttons) === JSON.stringify(startAgain.outputs[0]?.textCard?.buttons) && startJoin.outputs[0].textCard?.buttons?.length === 5, "3 설명서 카드의 단추 다섯은 밀려나지 않는다(두 번째 ‘시작’ 과 같다)");
  ok(!startAgain.text.includes(LINE) && startAgain.outputs.length === 1, "3 두 번째 ‘시작’ 에는 약관 안내가 없다");
  // 웹가계부(참여): 참여 한 줄 말풍선을 약관 카드로 바꾸고 웹 가계부 카드는 그대로
  const webJoin = await say(fx, "웹가계부", { user: E, room: ROOM });
  shapeOk("방 웹가계부(참여)", webJoin);
  eq(webJoin.outputs.length, 2, "3 방 ‘웹가계부’ 참여 답 말풍선 수는 그대로(2)");
  eq(webJoin.outputs[0]?.textCard?.description, `이 방 가계부 ‘이 방의 공동 가계부’에 참여했어요.\n${LINE}`, "3 참여 한 줄과 약관 안내가 한 말풍선");
  ok(termsButtonsOk(webJoin.outputs[0]?.textCard), "3 그 말풍선에 이용약관·개인정보처리방침 단추");
  const ledgerButton = webJoin.outputs[1]?.textCard?.buttons || [];
  ok(ledgerButton.length === 1 && ledgerButton[0].label === "웹 가계부 열기" && ledgerButton[0].webLinkUrl === `${BASE}/my`, "3 웹 가계부 카드의 단추(/my)는 그대로");
  // 조회 명령(참여)
  const queryJoin = await say(fx, "오늘기록", { user: F, room: ROOM });
  eq(queryJoin.outputs.length, 2, "3 방 조회로 참여한 답 말풍선 수는 그대로(2)");
  ok(queryJoin.outputs[0]?.textCard?.description?.startsWith("이 방 가계부 ‘이 방의 공동 가계부’에 참여했어요.\n") && termsButtonsOk(queryJoin.outputs[0]?.textCard), "3 방 조회로 참여한 답: 참여 한 줄 + 약관 안내 + 단추");
  ok(!(await say(fx, "오늘기록", { user: F, room: ROOM })).text.includes(LINE), "3 구성원의 두 번째 조회에는 약관 안내가 없다");
  // 가계부 없는 방의 첫 호출(조회) → 소유자 + 약관 안내
  const ownerQuery = await say(fx, "이번달 요약", { user: A, room: ROOM2 });
  ok(ownerQuery.outputs[0]?.textCard?.description === `이 방의 공동 가계부를 준비했어요. 첫 호출자인 내가 소유자예요.\n${LINE}` && termsButtonsOk(ownerQuery.outputs[0]?.textCard), "3 가계부 없는 방의 첫 조회(소유자) 답에 약관 안내");
  // 설명서는 답 뒤에 들이므로 답은 그대로다(알려진 한계: 이 사람은 이 답에서 약관 안내를 보지 못한다)
  const manual = await say(fx, "사용설명서", { user: H, room: ROOM });
  ok(manual.outputs.length === 1 && !manual.text.includes(LINE), "3 설명서 답(답 뒤 참여)은 모양이 그대로다");
  ok(manual.before === 0, "3 설명서 답 전에는 저장소를 부르지 않는다");
});

// 지연 답: 첫 사용이 정해진 뒤 4초 예산이 지나면 지연 답에 같은 약관 안내가 붙는다.
await kakaoFixture(async (fx) => {
  fx.env.KAKAO_RESPONSE_BUDGET_MS = "1000";
  const G = hex66("v118-copy-deferred");
  fx.delayAfter = { ms: 450, armed: false, when: (url, method) => method === "POST" && url.pathname === "/rest/v1/households" };
  const deferred = await say(fx, "점심 12000원", { user: G });
  fx.delayAfter = null;
  shapeOk("1:1 첫 기록 지연 답", deferred);
  ok(deferred.text.includes("기록 저장 확인이 조금 늦어지고 있어요"), `3 지연 답이다 (${deferred.text.slice(0, 40)})`);
  ok(termsButtonsOk(termsCard(deferred)), "3 지연 답에도 약관 안내 + 단추 둘");
  const user = fx.db.users.find((row) => row.kakao_user_key === G);
  ok(fx.db.transactions.some((row) => String(row.user_id) === String(user?.id) && Number(row.amount) === 12000), "3 지연 답 뒤에도 기록은 저장된다");
});

// ── 4. 실행으로 확인한 안내 문장(C1 /kakao-guide, C6 /chatbot-edit-guide) ───────────
await withClock(DAY, () => fixture(async (fx) => {
  const send = async (text) => { resetIsolate(); return skill(fx, text); };
  await send("오늘기록");
  await send("2");
  await send("점심 12000원");
  const deleted = await send("01번 삭제");
  ok(deleted.includes("01번 기록을 삭제했어요") && deleted.includes("되돌리려면: 복구 01번") && !/삭제할까요|정말|확인해 주세요/.test(deleted), `4 C6 ‘01번 삭제’ 는 확인 없이 바로 지우고 ‘복구 01번’ 을 알려 준다 (${deleted.split("\n")[0]})`);
  const listed = await send("오늘기록");
  ok(!listed.includes("12,000원"), "4 C6 지운 기록은 오늘 목록에서 빠진다");
  const restored = await send("복구 01번");
  ok(restored.includes("복구했어요"), `4 C6 ‘복구 01번’ 으로 되살린다 (${restored.split("\n")[0]})`);
}));
await withClock(DAY, () => fixture(async (fx) => {
  const send = async (text) => { resetIsolate(); return skill(fx, text); };
  const byMemo = (memo) => fx.db.transactions.find((row) => String(row.memo || "").includes(memo));
  await send("오늘기록");
  await send("2");
  await send("점심 12000원");
  await send("커피 4500원");
  // 운영 DB 는 저장 때 created_at = updated_at, 고칠 때 트리거(set_transactions_updated_at)가 updated_at 을 적는다. 픽스처는 그 시각을 손으로 적는다
  // (validate-prelaunch-p1-v229116 과 같은 흉내).
  for (const [memo, at] of [["점심", "2026-11-12T01:00:00+00:00"], ["커피", "2026-11-12T01:05:00+00:00"]]) { const row = byMemo(memo); if (row) { row.created_at = at; row.updated_at = at; } }
  const stop = intercept(async ({ url, method, init, forward }) => {
    const rpc = url.pathname.endsWith("/rest/v1/rpc/accountbook_update_transaction_v227");
    const patch = method === "PATCH" && url.pathname.endsWith("/rest/v1/transactions");
    if (!rpc && !patch) return null;
    const response = await forward();
    const id = rpc ? String(JSON.parse(String(init.body || "{}")).p_transaction_id || "") : String(url.searchParams.get("id") || "").replace(/^eq\./, "");
    const row = fx.db.transactions.find((item) => String(item.id) === id);
    if (response.ok && row) row.updated_at = "2026-11-12T01:10:00+00:00";
    return response;
  });
  try {
    await send("수정 01번 금액 2000");
    const count = fx.db.transactions.filter((row) => !row.deleted_at).length;
    const asked = await send("방금 거 지워줘");
    eq(fx.db.transactions.filter((row) => !row.deleted_at).length, count, "4 C1 직전에 다른 기록을 고쳤으면 ‘방금 거 지워줘’ 는 지우지 않는다");
    ok(asked.includes("01번") && asked.includes("02번") && !asked.includes("삭제했어요"), `4 C1 두 기록을 번호와 함께 되묻는다 (${asked.split("\n").slice(0, 2).join(" / ")})`);
  } finally { stop(); }
}));

// ── 5. 봇 ‘개인정보’ 답(C9 일부, P-14): ‘아직 없습니다’ 는 미래 약속처럼 읽힌다 → 지금 사실 문장 ──────────
await withClock(DAY, () => fixture(async (fx) => {
  resetIsolate();
  const reply = await skill(fx, "개인정보");
  ok(reply.includes("화면에서 바로 하는 계정 탈퇴 기능은 없습니다.") && reply.includes("개인정보처리방침에 적힌 문의 경로로 요청해 주세요."), "5 C9 봇 ‘개인정보’ 답이 탈퇴를 지금 사실로 말한다");
  ok(!reply.includes("아직 없습니다") && !reply.includes("탈퇴하면"), "5 C9 봇 ‘개인정보’ 답에 ‘아직 없습니다’·없는 탈퇴 약속이 없다");
}));

if (failures.length) {
  console.log(`FAILED: V22.9.118 copy fixes — ${failures.length} of ${checks} checks failed`);
  process.exitCode = 1;
} else {
  console.log(`PASS: V22.9.118 copy fixes — terms/guides/support wording, first-use terms notice (${checks} checks)`);
}
