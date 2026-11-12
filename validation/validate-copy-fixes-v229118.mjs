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
// 독립 검토(2026-11-12, P2 2·P3 6)를 반영해 더 본다:
//   - 단톡방에서 가장 흔한 첫 호출(봇만 부른 빈 멘션·설명서 첫 화면)은 답 뒤에 들여 약관 안내를 못 봤다 → 이 두 답에는 늘 단다(예전 ‘알려진 한계’ 단언을 바꿈).
//     조정자 결정(2026-11-12): 빈 멘션은 카드를 따로 붙이지 않고 인사 카드 한 말풍선 안에 짧은 한 줄 + ‘이용약관’ 링크 단추(글 전체 96자 이하),
//     설명서 첫 화면은 끝에 약관 카드(한 줄 + 단추 둘) 그대로. ‘이용약관’ 단추를 누른 주소(카카오가 채팅 키를 붙임)도 실행으로 따라가 본다.
//   - 약관 3절에 해제·삭제 이력 방·‘초대’ 예외가 없었다, 2절에 챗봇 답에서 약관을 볼 수 있다는 말이 없었다(실행으로 예외 확인).
//   - 저장 실패 답에도 안내가 붙었다 → 성공이 정해진 뒤에만. 안내가 빠지는 길(지연 답·자리 없음·저장 실패·답 뒤 참여)은 운영 이벤트 한 건.
//   - 계정 잇기 문장이 1:1 계정과 ‘한쪽이 비면 바로 잇는다’ 를 빠뜨렸다. 수정일 날짜가 쪽마다 따로 적혀 있었다 → 상수 하나.
// 재검토(후속 4, P3 넷)를 반영해 더 본다:
//   - 약관 3절은 ‘초대’ 만 예외로 적었지만 가계부 만들기·참여·연결·전환(어느 가계부를 쓸지 정하는 명령)과 메뉴·개인정보 같은 일부 안내 명령도 방 가계부를 준비하거나
//     참여시키지 않는다(skill-handler 의 들이기 블록보다 앞에서 답한다) → 소유자 = ‘방 가계부가 준비되는 호출을 처음 한 사람’, 예외를 사실대로 적고 실행으로 확인한다.
//   - 약관 2절·방침 12절은 늘 참인 것(단톡방 설명서 첫 화면·인사)과 대체로 참인 것(처음 쓸 때의 답 — 늦은 답 등 일부에는 없다)을 나눈다(동작은 그대로).
//   - 안내 쪽 수정일 상수가 공고일과 같다는 단언은 다음 개정 때 함정이라 뺀다(6곳이 상수에서 나오는지 + 이번 판 값만).
//   - 늦은 답이 나간 요청은 버려지는 최종 답이 먼저 남긴 빠짐 이유보다 ‘deferred’ 가 앞선다(요청마다 한 건).
// 고친 뒤 화면(실제 /terms·/privacy·/·/how-it-works·/group-accountbook·/faq·/kakao-guide·/support·/kakao-commands·/chatbot-edit-guide·/robots.txt·
// /sitemap.xml)과 카카오 스킬 답(1:1·단톡방, 지연 답 포함)을 픽스처로 그려 본다. 고친 것을 보는 단언은 옛 코드에서 실패하고(옛 문장이 남아 있거나 새 문장·단추가 없다),
// 그대로여야 하는 것(설명서 카드의 글·단추, 인사 카드의 예전 글·단추 순서, 답 전 저장소 호출 수, 말풍선 수)을 지키는 단언도 함께 둔다.
// 판 이름 글자와 배포 날짜 글자는 적지 않는다(날짜는 site-config.js 상수에서 읽는다 — 배포일이 바뀌어도 이 검사는 고치지 않는다).
// 예외 하나: 0절의 ‘이번 판에서는 안내 쪽 수정일 2026-11-13’ 한 줄(V118 범위 — 배포일이 밀리면 같이 고치고, 다음 개정 때 지워도 된다).
//
// ── 실행 ──
//   node validation/validate-copy-fixes-v229118.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { app, BASE, ctx, failure, fixture, intercept, page, skill, withClock } from "./lib-audit-v22934.mjs";
import { POLICY_NOTICE_DATE, POLICY_REVISION_DATE, PUBLIC_COPY_REVISION_DATE } from "../src/modules/public/site-config.js";
import { kakaoGroupCompatibleResponse, kakaoGroupEmptyMentionReply, kakaoTermsNoticeResponseV229118, noteKakaoTermsNoticeDroppedV229118 } from "../src/modules/kakao/response-builders.js";
import { kakaoGroupFirstKeys } from "../src/modules/kakao/group-links-first-record.js";

let checks = 0;
const failures = [];
const ok = (value, message) => { checks += 1; if (!value) { failures.push(message); console.log(`FAIL: ${message}`); } };
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const count = (text, needle) => text.split(needle).length - 1;
const hex66 = (label) => createHash("sha256").update(label).digest("hex") + "ab";
const DAY = "2026-11-12";
// 개정 공고일·시행일·안내 쪽 수정일은 코드 상수에서 읽는다. 한국어 표기는 이 검사가 따로 만든다(코드의 policyDateLabel 을 쓰지 않는다).
const NOTICE = String(POLICY_NOTICE_DATE || "");
const REVISION = String(POLICY_REVISION_DATE || "");
const COPY_DATE = String(PUBLIC_COPY_REVISION_DATE || "");
const korean = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return `${y}년 ${m}월 ${d}일`; };
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
  ok(/^\d{4}-\d{2}-\d{2}$/.test(NOTICE) && NOTICE === REVISION && NOTICE >= DAY, `0 C2 개정 공고일 = 시행일(불리하지 않은 변경)이고 점검일(${DAY}) 이후다 (공고 ${NOTICE}, 시행 ${REVISION}) — 배포일이 바뀌면 site-config.js 두 줄만 고친다`);
  // 재검토 P3(후속 4): ‘수정일 상수 = 공고일’ 단언은 뺐다 — 다음 개정에서 약관 날짜만 바꾸고 안내 쪽은 그대로 둘 때 site-config.js 주석대로 이 상수를 그 전
  // 날짜로 고정하는 것을 막았다. 여기서는 6곳이 이 상수에서 나오는지와 이번 판 값만 본다.
  const guide = read("src/modules/public/guide-content.js");
  const support = read("src/modules/public/support-page.js");
  ok(count(guide, "updated: PUBLIC_COPY_REVISION_DATE") === 5 && count(support, "updated: PUBLIC_COPY_REVISION_DATE") === 1, "0 C2 안내 쪽 6곳(첫 화면·/how-it-works·/kakao-guide·/group-accountbook·/faq·/support)의 수정일은 상수에서 나온다");
  ok(/^\d{4}-\d{2}-\d{2}$/.test(COPY_DATE) && !new RegExp(`updated: "${COPY_DATE}"`).test(guide + support), "0 C2 안내 쪽 6곳에 수정일 날짜 글자를 따로 적지 않는다");
  // V118 범위 — 다음 개정 때 지워도 됨(배포일이 밀려 site-config.js 날짜를 바꾸면 이 줄도 같이 고친다).
  eq(COPY_DATE, "2026-11-13", "0 C2 이번 판에서는 안내 쪽 수정일 상수(PUBLIC_COPY_REVISION_DATE)가 2026-11-13");
  const builders = read("src/modules/kakao/response-builders.js");
  const start = builders.indexOf("async function kakaoTermsNoticeResponseV229118(response, env = {}, origin = \"\", payload = {}) {");
  const body = start >= 0 ? builders.slice(start, builders.indexOf("\n}\n", start)) : "";
  ok(start >= 0, "0 C4 약관 안내를 붙이는 함수가 있다(단톡방인지 보려고 payload 를 받는다)");
  ok(body && !/supabase\(|fetch\(|saveSetting|deferKakaoAfterReply/.test(body), "0 C4 약관 안내는 저장소를 부르지 않는다(DB 호출 수 그대로)");
  ok(body.includes('kakaoLinkButton("이용약관", `${origin}/terms`)') && body.includes('kakaoLinkButton("개인정보처리방침", `${origin}/privacy`)'), "0 C4 단추 둘 = 이용약관(/terms)·개인정보처리방침(/privacy) 링크 단추");
  ok(body.includes("const always = group && outputs.some((output) => output?.textCard?.title === KAKAO_MANUAL_HOME_TITLE);") && read("src/modules/kakao/manual-guides.js").includes("title: KAKAO_MANUAL_HOME_TITLE,"), "0 C4 단톡방 설명서 첫 화면 답은 제목으로 알아본다(상태를 읽지 않는다)");
  // 조정자 결정(2026-11-12): 빈 멘션 인사는 안내를 카드 안에 담으므로 이 함수는 인사 답에 아무것도 더하지 않는다(첫 사용 표시가 켜져 있어도).
  ok(body.includes("if (group && outputs.some((output) => output?.textCard?.title === KAKAO_GROUP_EMPTY_MENTION_TITLE)) return response;") && body.indexOf("KAKAO_GROUP_EMPTY_MENTION_TITLE)) return response;") < body.indexOf("const always"), "0 C4 빈 멘션 인사 답에는 카드를 더하지 않는다(표시를 보기 전에 돌려준다)");
  const greetingStart = builders.indexOf("function kakaoGroupEmptyMentionReply(origin = \"\") {");
  const greetingBody = greetingStart >= 0 ? builders.slice(greetingStart, builders.indexOf("\n}\n", greetingStart)) : "";
  ok(builders.includes('const KAKAO_GROUP_EMPTY_MENTION_TERMS_LINE_V229118 = "이용하면 이용약관에 동의한 것으로 봐요.";') && builders.includes("  \"예) @말해가계부 점심 12000원\",\n  KAKAO_GROUP_EMPTY_MENTION_TERMS_LINE_V229118,\n].join(\"\\n\");"), "0 C4 인사 글 끝 줄 = 짧은 약관 안내(상수, 예전 두 줄 뒤)");
  // 조정자 결정(2026-11-12, 후속 3): 단추 순서는 V22.9.72 규칙대로 ‘기록하기’ 맨 아래, 링크는 멘션 앞(kakaoPlaceLeftLinks 와 같은 순서).
  const linkAt = greetingBody.indexOf('...(origin ? [kakaoLinkButton("이용약관", `${origin}/terms`)] : []),');
  const mentionAt = greetingBody.indexOf("{ ...KAKAO_RECORD_MENTION_BUTTON },\n");
  ok(linkAt > 0 && mentionAt > linkAt && greetingBody.indexOf("{ label: KAKAO_MANUAL_HOME_GROUP_LABEL, action: \"message\"") < linkAt && !greetingBody.includes("/privacy") && !/supabase\(|fetch\(|getCookie|__AB_KAKAO_REQUEST/.test(greetingBody), "0 C4 인사 단추 = 도움말 보기 → ‘이용약관’ 링크(주소는 단추에만) → 기록하기(맨 아래), 개인정보처리방침 단추 없음, 상태·저장소를 읽지 않는다");
  const skillHandler = read("src/modules/kakao/skill-handler.js");
  ok(skillHandler.includes("if (botGroupKey) { await deferRoomJoinOnCall(\"mention\", { noticeShown: true }); return kakaoGroupEmptyMentionReply(origin); }"), "0 C4 스킬은 인사 답에 공개 주소(origin)를 넘긴다(단추 주소용)");
  ok(skillHandler.includes("const safeResponse = await kakaoTermsNoticeResponseV229118(await kakaoGroupCompatibleResponse(normalizedResponse, payload, origin), env, origin, payload);"), "0 C4 응답 마무리 뒤 최종 답에 붙인다");
  ok(skillHandler.includes("const deferred = await kakaoTermsNoticeResponseV229118(await kakaoGroupCompatibleResponse(kakaoDeferredReply(utterance, payload), payload, origin), env, origin, payload);"), "0 C4 지연 답에도 붙인다");
  const chatFirst = read("src/modules/kakao/identity-chat-first.js");
  const onSavedAt = chatFirst.indexOf("onSaved: async () => {", chatFirst.indexOf("async function tryKakaoChatFirstRecord"));
  ok(count(chatFirst, "env.__AB_KAKAO_REQUEST.termsNoticeV229118 = true;") === 1 && onSavedAt > 0 && chatFirst.indexOf("env.__AB_KAKAO_REQUEST.termsNoticeV229118 = true;") > chatFirst.indexOf("recordSaved = true;", onSavedAt), "0 C4 1:1 첫 기록은 기록이 저장된 뒤(onSaved)에만 표시를 켠다");
  const links = read("src/modules/kakao/group-links-first-record.js");
  ok(links.includes("if (joinOnly) {\n            markTermsNotice();") && links.includes("onSaved: async () => { recordSaved = true; markTermsNotice(); }") && count(links, "termsNoticeV229118 = true") === 1, "0 C4 방 첫 호출·첫 참여는 참여가 정해진 뒤, 방 첫 기록은 저장된 뒤에만 표시를 켠다");
  ok(builders.includes('const event = rememberOpsEvent({ kind: "kakao_terms_notice_dropped", severity: "info", path: "/skill", method: "POST", detail: why });'), "0 C4 안내가 빠지면 운영 이벤트(info, 이유 낱말만)");
  const bundle = read("src/index.js");
  for (const needle of ["kakaoTermsNoticeResponseV229118", "말해가계부를 이용하면 이용약관에 동의한 것으로 봐요.", 'const KAKAO_GROUP_EMPTY_MENTION_TERMS_LINE_V229118 = "이용하면 이용약관에 동의한 것으로 봐요.";', "return kakaoGroupEmptyMentionReply(origin); }", "Disallow: /support/go/", "kakao_terms_notice_dropped"]) ok(bundle.includes(needle), `0 번들에 ${needle} 가 있다`);
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
  // 재검토 P3(후속 4): 소유자는 ‘봇을 처음 부른 사람’ 이 아니라 ‘방 가계부가 준비되는 호출을 처음 한 사람’ 이다(처음 부른 말이 가계부 만들기·개인정보 같은 명령이면
  // 그 사람은 소유자가 아니다 — 아래 3절에서 실행으로 확인).
  ok(terms.includes("가계부가 연결되지 않은 단톡방에서는 그 방의 공동 가계부가 준비되는 호출을 처음 한 사람이 소유자가 되고, 그 뒤 같은 방에서 봇을 부르거나 기록한 사람은 승인 없이 구성원이 됩니다."), "1 C1 약관 3절: 방 가계부가 준비되는 호출을 처음 한 사람이 소유자, 그 뒤 부른 사람은 구성원");
  // 독립 검토 P2 + 재검토 P3: 준비·참여하지 않는 명령(어느 가계부를 쓸지 정하는 명령·일부 안내 명령, 가계부 없는 방의 ‘초대’)과 해제·삭제 이력 방을 사실대로 적는다
  // (아래 3절에서 새 방·가계부 있는 방 모두 실행으로 확인). ‘설정’ 이라고 넓게 쓰지 않는다 — ‘예산설정’·‘구성원 권한’ 은 준비·참여한다.
  ok(terms.includes("기록뿐 아니라 조회나 설명서 보기로 불러도 가계부를 준비하거나 참여하지만, 가계부 만들기·참여·연결·전환처럼 어느 가계부를 쓸지 정하는 명령이나 메뉴·개인정보 안내처럼 안내만 보는 일부 명령을 보낸 경우에는 준비하거나 참여하지 않습니다(가계부가 아직 없는 방에서는 ‘초대’ 명령으로도 준비하지 않으며, 삭제·연결 해제 이력이 있는 방은 자동으로 다시 만들지 않습니다)."), "1 C1 약관 3절: 준비·참여하지 않는 명령과 해제·삭제 이력 방을 사실대로 적는다");
  ok(!terms.includes("봇을 처음 부른 사람") && !terms.includes("무엇으로 불렀든") && !terms.includes("‘초대’ 명령만 보낸 경우에는 준비하지 않습니다"), "1 C1 약관 3절: 실제보다 넓던 ‘봇을 처음 부른 사람’·‘무엇으로 불렀든’·‘‘초대’ 만 예외’ 문장이 없다");
  ok(visible(html["/group-accountbook"]).includes("삭제·연결 해제 이력이 있는 방은 자동으로 다시 만들지 않으며"), "1 C1 /group-accountbook 도 같은 예외(해제·삭제 이력 방)를 말한다");
  ok(terms.includes("그 뒤 같은 방에서 봇을 부르거나 기록한 사람은 승인 없이 구성원이 됩니다.") && terms.includes("소유자는 웹 ‘참여자·초대’에서 관리자·구성원에게 소유자를 넘길 수 있습니다."), "1 C1 약관 3절: 부르기만 해도 구성원·소유자 양도");
  ok(terms.includes("나갔거나 내보내진 사람은 자동으로 다시 참여하지 않으며"), "1 C1 약관 3절: 나간 사람은 자동 재참여 없음");
  ok(!terms.includes("명확한 첫 거래를 보내면") && !terms.includes("첫 기록자가 소유자"), "1 C1 약관 3절: 옛 ‘명확한 첫 거래 → 첫 기록자 소유자’ 문장이 없다");
  // 독립 검토 P3: 약관 2절 — 챗봇 답에서도 약관·방침을 볼 수 있다(아래 3절의 실제 답과 같은 범위). 1:1 ‘가계부만들기’ 로 만든 가계부의 답에는
  // 안내가 없으므로 ‘처음 가계부가 만들어지거나’ 처럼 넓게 쓰지 않고 ‘1:1 첫 기록으로 개인 가계부를 준비할 때’ 로 적는다.
  // 조정자 결정(2026-11-12): 빈 멘션 인사에는 이용약관 단추만 있으므로 ‘(인사에는 이용약관만)’ 을 붙여 인사에 두 문서 단추가 다 있다고 읽히지 않게 한다.
  // 재검토 P3(후속 4): 늘 참인 것(단톡방 설명서 첫 화면·봇만 부른 인사 — 상태와 상관없이 단다)과 대체로 참인 것(처음 쓸 때의 답 — 늦은 답·자리 없음·저장 실패·답 뒤 참여
  // 에는 없다, 빠짐 이벤트로 셈)을 두 문장으로 나눈다. 동작은 그대로다.
  ok(terms.includes("로그인 화면과 가계부 홈의 안내 줄, 단톡방의 설명서 첫 화면과 봇만 불렀을 때의 인사(인사에는 이용약관만)에서 이용약관과 개인정보처리방침을 볼 수 있습니다."), "1 C4 약관 2절(늘 참): 로그인·홈 안내 줄과 단톡방 설명서 첫 화면·인사(인사에는 이용약관만)에서 약관·방침을 볼 수 있다");
  ok(terms.includes("카카오톡 챗봇을 처음 쓸 때의 답(1:1 첫 기록으로 개인 가계부를 준비할 때, 단톡방 가계부를 준비하거나 그 가계부에 들어갈 때)에도 같은 안내를 붙이지만, 답이 늦어지는 등 일부 답에는 붙지 않을 수 있습니다."), "1 C4 약관 2절(대체로 참): 처음 쓸 때의 답에도 붙이지만 늦은 답 등 일부에는 없을 수 있다");
  ok(!terms.includes("처음 가계부가 만들어지거나") && !terms.includes("인사·설명서 첫 화면에서 이용약관과 개인정보처리방침을") && !terms.includes("그 가계부에 들어갈 때)과 단톡방에서 봇만 불렀을 때"), "1 C4 약관 2절: 처음 쓸 때의 답에 늘 있다고 읽히던 문장·‘처음 가계부가 만들어지거나’·‘인사에서도 두 문서’ 가 없다");
  // C1 약관 4절
  ok(terms.includes("웹과 카카오톡에서 기록 한 건을 지우면 확인 단계 없이 바로 지워지며") && terms.includes("‘복구 01번’") && terms.includes("가계부를 영구 삭제할 때는 본인 확인을 거칩니다."), "1 C1 약관 4절: 한 건 삭제는 바로 + 되살리기, 가계부 삭제는 본인 확인");
  ok(!terms.includes("삭제와 복구는 확인 절차를 제공"), "1 C1 약관 4절: 옛 ‘삭제와 복구는 확인 절차’ 문장이 없다");
  // C1 방침 1절, C2 12절
  const privacy = visible(html["/privacy"]);
  ok(privacy.includes("단톡방 연결키는 봇을 불러 준비하거나 직접 연결한 공동 가계부") && !privacy.includes("첫 기록으로 준비하거나") && !privacy.includes("봇을 처음 불렀을 때 준비하거나"), "1 C1 방침 1절: 단톡방 연결키 = 봇을 불러 준비하거나 직접 연결한 가계부(‘처음 불렀을 때’ 로 좁히지 않는다)");
  // 재검토 P3(후속 4): 12절도 늘 참(단톡방 설명서 첫 화면·인사에 늘 둔다)과 대체로 참(처음 쓸 때의 답에도 붙이되 늦은 답 등 일부에는 없다)을 나눈다.
  ok(privacy.includes(`이 개정 방침은 ${korean(NOTICE)}에 알리고 같은 날부터 시행합니다.`) && privacy.includes("이번 개정은 단톡방에서 기록뿐 아니라 조회나 설명서 보기로 봇을 불러도 그 방의 공동 가계부를 준비하는 지금의 동작에 맞춰 1절의 단톡방 연결키 설명을 고치고, 이용약관·개인정보처리방침 안내를 단톡방의 설명서 첫 화면과 봇만 불렀을 때의 인사(인사에는 이용약관 안내만)에 늘 두고 카카오톡 챗봇을 처음 쓸 때의 답(1:1 첫 기록으로 개인 가계부를 준비하는 답, 단톡방 가계부를 준비하거나 그 가계부에 들어가는 답)에도 붙인 것이어서, 처리하는 개인정보 항목과 목적이 그대로인 이용자에게 불리하지 않은 변경입니다. 다만 처음 쓸 때의 답이 늦어지는 등 일부 답에는 안내가 붙지 않을 수 있습니다."), "1 C2 방침 12절: 이번 개정(늘 두는 곳·처음 쓸 때의 답과 그 한계) + 공고·시행일(상수)");
  ok(!privacy.includes("카카오톡 챗봇을 처음 쓰는 답에 이용약관") && !privacy.includes("처음 가계부가 만들어지거나") && !privacy.includes("첫 화면에 이용약관·개인정보처리방침 안내를 더한") && !privacy.includes("봇을 처음 부른 사람이 그 방의 공동 가계부를 준비하는") && !privacy.includes("이용약관 안내만)를 더한 것"), "1 C2 방침 12절: 실제보다 넓던 ‘챗봇을 처음 쓰는 답에’·‘처음 가계부가 만들어지거나’·‘봇을 처음 부른 사람이’·‘답에 (늘) 더한 것’ 문장이 없다");
  for (const path of ["/terms", "/privacy"]) {
    ok(html[path].includes(`개정 공고 ${korean(NOTICE)} · 개정 시행 ${korean(REVISION)}`), `1 C2 ${path} 머리: 개정 공고·시행일 = 상수(${NOTICE})`);
  }
  // C1 첫 화면 표
  const home = visible(html["/"]);
  // 재검토 P3(후속 4): 안내 쪽의 ‘봇을 처음 부른 사람이 소유자’ 도 약관 3절과 같은 뜻(가계부를 처음 준비한 사람)으로 맞췄다.
  ok(home.includes("그 방의 공동 가계부를 준비합니다. 이렇게 가계부를 처음 준비한 사람이 소유자가 되고, 그 뒤 봇을 부른 참여자는 구성원이 됩니다.") && !home.includes("첫 기록자는 소유자가 됩니다"), "1 C1 첫 화면 표: 가계부를 처음 준비한 사람이 소유자");
  // C1·C5 /how-it-works
  const how = visible(html["/how-it-works"]);
  ok(how.includes("기록이 아니라 조회나 설명서 보기로 불러도 해당 방의 공동 가계부를 준비하며, 이렇게 가계부를 처음 준비한 사람이 소유자가 됩니다.") && how.includes("봇을 방에 추가한 것만으로는 가계부를 만들지 않고, 거래는 명확한 기록을 보낼 때만 저장합니다."), "1 C1 /how-it-works: 부르기만 해도 준비·소유자, 거래는 명확한 기록만");
  ok(!how.includes("처음 기록한 사람이 소유자") && !how.includes("도움말을 보거나 봇을 추가한 것만으로는 가계부를 만들지 않습니다"), "1 C1 /how-it-works: 옛 ‘처음 기록한 사람이 소유자’·‘도움말로는 만들지 않음’ 이 없다");
  // 독립 검토 P3: 계정 잇기 — 대상은 1:1·단톡방 계정 모두, 같은 카카오 계정 + 한쪽이 비면 로그인할 때 바로, 그 밖에는 확인 화면 단추(auth/kakao-account-link.js 분기).
  const LINK_RULE = "(한쪽 계정에 가계부·기록이 없고 카카오톡과 같은 카카오 계정으로 로그인했으면 그때 바로 잇고, 그 밖에는 확인 화면에서 단추를 눌러야 잇습니다)";
  ok(how.includes(`카카오톡(1:1·단톡방)에서 쓴 계정과 웹 계정이 따로 있으면 웹에서 카카오로 로그인해 같은 사람의 카카오 계정임을 확인한 뒤에만 하나로 잇습니다${LINK_RULE}`) && !how.includes("다른 계정과 자동 병합하지 않습니다") && !how.includes("단톡방에서 기록한 계정과 웹 계정은"), "1 C5 /how-it-works: 계정 잇기 규칙 한 문장(1:1 계정 포함·바로 잇는 조건)");
  // C1 /group-accountbook
  const group = visible(html["/group-accountbook"]);
  ok(group.includes("봇을 호출(기록·조회·설명서 보기 모두)") && group.includes("조회나 설명서 보기로 불러도 참여하며") && group.includes("새 방에서는 봇을 불러 그 방 가계부를 처음 준비한 사람이 소유자가 되고"), "1 C1 /group-accountbook: 표·첫 절이 ‘부르기만 해도’ 규칙, 소유자 = 가계부를 처음 준비한 사람");
  ok(!group.includes("일반 대화와 조회만으로는 자동 참여하지 않습니다") && !group.includes("명확한 첫 거래를 입력") && !group.includes("첫 기록자가 소유자"), "1 C1 /group-accountbook: 옛 ‘조회만으로는 참여하지 않음’·‘명확한 첫 거래’ 가 없다");
  // C1·C5 /faq + FAQPage JSON-LD
  const faq = visible(html["/faq"]);
  const faqLd = jsonLd(html["/faq"]).find((item) => item["@type"] === "FAQPage");
  const answer = (question) => faqLd?.mainEntity?.find((entry) => entry.name === question)?.acceptedAnswer?.text || "";
  const roomAnswer = answer("단톡방에 봇만 추가하면 바로 기록되나요?");
  ok(roomAnswer.includes("새 미연결 방에서는 기록·조회·설명서 보기로 봇을 불러 공동 가계부를 처음 준비한 사람이 소유자가 되고, 그 뒤 봇을 부르거나 기록한 사람은 승인 없이 구성원이 됩니다.") && faq.includes("기록·조회·설명서 보기로 봇을 불러 공동 가계부를 처음 준비한 사람이 소유자가 되고") && faq.includes("그 뒤 봇을 부르거나 기록한 사람은 승인 없이 구성원이 됩니다."), "1 C1 /faq(화면·FAQPage JSON-LD): 단톡방 답이 V22.9.115 규칙(소유자 = 가계부를 처음 준비한 사람, ‘무엇으로 불렀든’ 없음)");
  const webAnswer = answer("카카오에서 기록했는데 웹에 보이지 않아요.");
  ok(webAnswer.includes(`서로 다른 두 계정은 웹에서 카카오로 로그인해 같은 사람의 카카오 계정임을 확인한 뒤에만 하나로 잇습니다${LINK_RULE}.`) && faq.includes(LINK_RULE) && !webAnswer.includes("자동 병합하지는 않습니다") && !webAnswer.includes("두 계정 모두 기록이 있으면"), "1 C5 /faq(화면·JSON-LD): 계정 잇기 규칙 한 문장(바로 잇는 조건)");
  ok(!faq.includes("명확한 첫 거래를 보내면 공동 가계부를 준비합니다") && !faq.includes("서로 다른 계정을 자동 병합하지는 않습니다"), "1 C1·C5 /faq 화면에 옛 문장이 없다");
  // C1 /kakao-guide ‘방금 거 지워줘’
  ok(visible(html["/kakao-guide"]).includes("마지막 기록을 저장한 뒤 다른 기록을 고쳤다면 지우지 않고 두 기록을 번호와 함께 다시 물어요."), "1 C1 /kakao-guide: ‘방금 거 지워줘’ 줄에 V22.9.116 되묻기");
  // 옛 규칙 문장이 공개 화면 어디에도 없다
  for (const path of ["/", "/terms", "/privacy", "/how-it-works", "/group-accountbook", "/faq", "/kakao-guide"]) {
    const text = visible(html[path]);
    ok(!/첫 기록자|처음 기록한 사람이 소유자|명확한 첫 거래|조회만으로는 자동 참여|자동 병합하지|처음 부른 사람|무엇으로 불렀든/.test(text), `1 C1 ${path} 에 옛 참여·소유자·병합 규칙 문장(‘처음 부른 사람’·‘무엇으로 불렀든’ 포함)이 없다`);
  }
  // C2 수정일(화면 time·JSON-LD dateModified·사이트맵 lastmod) — 상수에서 나온 날짜와 같다
  const sitemap = html["/sitemap.xml"];
  const lastmod = (path) => sitemap.match(new RegExp(`<loc>${BASE.replace(/[.]/g, "\\.")}${path === "/" ? "/" : path}</loc>\\s*<lastmod>([^<]+)</lastmod>`))?.[1] || "";
  for (const [path, date] of [["/", COPY_DATE], ["/how-it-works", COPY_DATE], ["/group-accountbook", COPY_DATE], ["/faq", COPY_DATE], ["/kakao-guide", COPY_DATE], ["/support", COPY_DATE], ["/terms", NOTICE], ["/privacy", NOTICE]]) {
    ok(html[path].includes(`<time datetime="${date}">`), `1 C2 ${path} 수정일 표시 = 상수(${date})`);
    ok(jsonLd(html[path]).some((item) => item.dateModified === date), `1 C2 ${path} JSON-LD dateModified = 상수(${date})`);
    eq(lastmod(path), date, `1 C2 ${path} sitemap lastmod = 상수`);
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
// 운영 이벤트는 isolate 메모리에 220건까지만 남으므로(오래된 것부터 빠짐) 개수 차이가 아니라 ‘전에 없던 이벤트’ 로 센다.
const opsMark = () => new Set(globalThis.__AB_OPS_EVENTS || []);
const droppedSince = (mark) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => !mark.has(event) && event.kind === "kakao_terms_notice_dropped").map((event) => `${event.severity}:${event.detail}`);
function resetIsolate() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD"]) globalThis[name]?.clear?.();
}
function payloadFor(utterance, { user, room = "" }) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}
// noCtx: waitUntil 이 없는 실행(답 뒤 일을 답 전에 그 자리에서 한다 — 첫 사용 표시가 답 전에 켜진다).
async function say(fx, utterance, opts) {
  resetIsolate();
  const jobs = [];
  fx.trace = [];
  fx.replied = false;
  const mark = opsMark();
  const runCtx = opts?.noCtx ? { passThroughOnException() {} } : { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(payloadFor(utterance, opts)) }), fx.env, runCtx);
  const before = fx.trace.length;
  fx.replied = true;
  const body = JSON.parse(await response.text());
  for (let round = 0; round < 8 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  const outputs = body?.template?.outputs || [];
  const texts = outputs.flatMap((output) => [output.simpleText?.text, output.textCard?.title, output.textCard?.description]).filter((text) => typeof text === "string");
  return { body, outputs, texts, text: texts.join("\n"), before, total: fx.trace.length, dropped: droppedSince(mark) };
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
// 끝 말풍선이 약관 안내 카드(한 줄만 + 단추 둘)인가
const endsWithTermsCard = (reply) => reply.outputs.at(-1)?.textCard?.description === LINE && termsButtonsOk(reply.outputs.at(-1)?.textCard);
function shapeOk(label, reply) {
  ok(reply.outputs.length >= 1 && reply.outputs.length <= 3, `3 ${label}: 말풍선 1~3개 (${reply.outputs.length})`);
  ok(reply.texts.every((text) => !URL_TEXT.test(text)), `3 ${label}: 답 글에 주소가 없다(링크는 단추)`);
  ok(reply.outputs.every((output) => (output.textCard?.buttons || []).length <= 5), `3 ${label}: 카드 단추 5개 이하`);
  ok(count(JSON.stringify(reply.outputs), LINE) <= 1, `3 ${label}: 약관 안내는 한 번만`);
}
const roomHouseholds = (fx) => fx.db.households.length;

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
  // 1:1 설명서 첫 화면은 그대로(늘 안내를 두는 것은 단톡방의 빈 멘션 인사(카드 안)·설명서 첫 화면(끝 카드)만)
  const directStart = await say(fx, "시작", { user: A });
  ok(directStart.outputs.length === 1 && !directStart.text.includes(LINE) && directStart.outputs[0]?.textCard?.title === "말해가계부 도움말", "3 1:1 ‘시작’(설명서 첫 화면)은 예전 모양 그대로");

  // 방: 가계부 없는 방의 첫 기록 → 소유자 + 약관 안내
  const roomFirst = await say(fx, "점심 12000원", { user: B, room: ROOM });
  shapeOk("방 첫 기록", roomFirst);
  ok(roomFirst.text.includes("첫 호출자인 내가 소유자예요") && termsButtonsOk(termsCard(roomFirst)), "3 방 첫 기록(소유자) 답에 약관 안내 + 단추 둘");
  ok(!(await say(fx, "커피 4500원", { user: B, room: ROOM })).text.includes(LINE), "3 방 두 번째 기록에는 약관 안내가 없다");
  // 같은 방의 다른 사람 첫 기록 → 참여 + 약관 안내
  const joinRecord = await say(fx, "택시 8000원", { user: C, room: ROOM });
  ok(joinRecord.text.includes("이 방의 공동 가계부에 참여했어요.") && termsButtonsOk(termsCard(joinRecord)), "3 방 첫 기록으로 참여한 답에 약관 안내 + 단추 둘");
  // 시작(참여): 설명서 카드의 단추는 그대로, 끝에 약관 카드. 설명서 첫 화면은 단톡방에서 늘 안내를 단다(두 번째 ‘시작’ 에도).
  const startJoin = await say(fx, "시작", { user: D, room: ROOM });
  const startAgain = await say(fx, "시작", { user: D, room: ROOM });
  shapeOk("방 시작(참여)", startJoin);
  shapeOk("방 두 번째 시작", startAgain);
  ok(startJoin.text.includes("방금 이 방 가계부에 참여했어요") && endsWithTermsCard(startJoin) && startJoin.outputs.length === 2, "3 방 ‘시작’ 으로 참여한 답 끝에 약관 카드");
  ok(JSON.stringify(startJoin.outputs[0].textCard?.buttons) === JSON.stringify(startAgain.outputs[0]?.textCard?.buttons) && startJoin.outputs[0].textCard?.buttons?.length === 5 && startJoin.outputs[0].textCard?.buttons?.at(-1)?.action === "mention", "3 설명서 카드의 단추 다섯(맨 아래 ‘기록하기’)은 밀려나지 않는다");
  ok(endsWithTermsCard(startAgain) && startAgain.outputs.length === 2, "3 독립 검토 P2: 단톡방 설명서 첫 화면(두 번째 ‘시작’)에도 늘 약관 카드");
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
  // 독립 검토 P2: 설명서 첫 화면으로 처음 부른 사람(답 뒤 참여)도 그 답에서 약관 안내를 본다. 답 전 저장소 호출은 그대로 0회.
  const manual = await say(fx, "사용설명서", { user: H, room: ROOM });
  shapeOk("방 설명서 첫 화면(첫 호출)", manual);
  ok(manual.outputs.length === 2 && manual.outputs[0]?.textCard?.title === "말해가계부 도움말" && manual.outputs[0]?.textCard?.buttons?.length === 5 && endsWithTermsCard(manual), "3 설명서 첫 화면 답(답 뒤 참여): 설명서 카드 그대로 + 끝에 약관 카드");
  ok(manual.before === 0, "3 설명서 답 전에는 저장소를 부르지 않는다");
  ok(manual.total > 0 && fx.db.household_members.some((row) => fx.db.users.find((user) => String(user.id) === String(row.user_id))?.kakao_user_key === H), "3 설명서로 부른 사람은 답 뒤에 이 방 가계부 구성원이 된다");
  eq(manual.dropped.length, 0, "3 설명서 첫 화면으로 처음 들인 경우는 안내가 붙었으므로 빠짐 이벤트가 없다");
});

// 독립 검토 P2 + 조정자 결정(2026-11-12): 단톡방에서 봇만 부른 빈 멘션 답(새 방의 첫 호출 포함)에는 늘 약관 안내 — 말풍선 하나, 인사 카드 안에.
// 예전 인사 글 두 줄은 그대로 앞에 두고 마지막 줄에 짧은 안내, 단추는 ‘도움말 보기’ → ‘이용약관’ 링크 → ‘기록하기’(V22.9.72 규칙대로 맨 아래,
// 후속 3 결정). 글 전체(제목 + 설명)는 예전 시작 안내의
// 절반(96자) 이하 — validate-kakao-group 의 ‘절반 이하’ 단언과 같은 셈(`${title}\n${description}` 의 길이).
const GREETING_TITLE = "안녕하세요 😊 말해가계부예요";
const GREETING_OLD = "친구와 함께 말 한마디로 간단히 기록하는 가계부 챗봇이에요.\n예) @말해가계부 점심 12000원";
const GREETING_LINE = "이용하면 이용약관에 동의한 것으로 봐요.";
const GREETING_TERMS_BUTTON = { label: "이용약관", action: "webLink", webLinkUrl: `${BASE}/terms` };
const GREETING_BUTTONS = [{ label: "도움말 보기", action: "message", messageText: "도움말 보기" }, GREETING_TERMS_BUTTON, { label: "기록하기", action: "mention" }];
function greetingOk(label, reply) {
  shapeOk(label, reply);
  const card = reply.outputs[0]?.textCard;
  const description = String(card?.description || "");
  eq(reply.outputs.length, 1, `3 ${label}: 말풍선 하나(뒤에 붙이던 약관 카드 없음)`);
  ok(card?.title === GREETING_TITLE && description.startsWith(`${GREETING_OLD}\n`), `3 ${label}: 인사 제목·예전 글 두 줄이 그대로 앞에 있다`);
  eq(description.split("\n").at(-1), GREETING_LINE, `3 ${label}: 글 마지막 줄 = 짧은 약관 안내`);
  eq(description, `${GREETING_OLD}\n${GREETING_LINE}`, `3 ${label}: 글은 예전 두 줄 + 안내 한 줄뿐`);
  eq(JSON.stringify(card?.buttons), JSON.stringify(GREETING_BUTTONS), `3 ${label}: 단추 셋 = 도움말 보기 → 이용약관(/terms 링크) → 기록하기(맨 아래)`);
  ok(card?.buttons?.at(-1)?.action === "mention" && card.buttons.findIndex((button) => button.action === "webLink") < card.buttons.length - 1, `3 ${label}: ‘기록하기’(멘션)는 맨 아래, 링크는 그 앞(V22.9.72 규칙)`);
  // 그룹 챗봇 안내서: 가로 배열은 단추 2개까지만 보이고 세로 배열은 5개까지 — 단추 셋이 다 보이려면 세로여야 한다.
  eq(card?.buttonLayout, "vertical", `3 ${label}: 단추 셋이 다 보이게 세로 배열`);
  const whole = `${card?.title || ""}\n${description}`;
  ok(whole.length <= 96, `3 ${label}: 글 전체(제목 + 설명) ${whole.length}자 ≤ 96(예전 시작 안내의 절반)`);
  ok(!reply.text.includes(LINE) && !JSON.stringify(reply.outputs).includes("/privacy") && !(card?.buttons || []).some((button) => button.label === "개인정보처리방침"), `3 ${label}: 따로 붙던 약관 카드·개인정보처리방침 단추가 없다`);
}
await kakaoFixture(async (fx) => {
  const ROOM = hex66("v118-copy-mention-room"), M1 = hex66("v118-copy-m1"), M2 = hex66("v118-copy-m2");
  const before = roomHouseholds(fx);
  const firstMention = await say(fx, "", { user: M1, room: ROOM });
  greetingOk("빈 멘션(새 방 첫 호출)", firstMention);
  ok(firstMention.before === 0, "3 빈 멘션 답 전에는 저장소를 부르지 않는다");
  eq(roomHouseholds(fx), before + 1, "3 빈 멘션으로 부른 사람은 답 뒤에 이 방 공동 가계부를 준비한다(예전 동작 그대로)");
  eq(firstMention.dropped.length, 0, "3 새 방 첫 빈 멘션(답 뒤 소유자 준비)에 빠짐 이벤트가 없다(안내는 이 답 안에 있다)");
  const again = await say(fx, "", { user: M1, room: ROOM });
  greetingOk("두 번째 빈 멘션", again);
  ok(JSON.stringify(again.outputs) === JSON.stringify(firstMention.outputs) && again.before === 0, "3 두 번째 빈 멘션도 같은 말풍선 하나(상태를 읽지 않고 늘), 답 전 저장소 0회");
  const other = await say(fx, "", { user: M2, room: ROOM });
  greetingOk("다른 사람의 첫 빈 멘션", other);
  ok(JSON.stringify(other.outputs) === JSON.stringify(firstMention.outputs) && other.before === 0 && other.dropped.length === 0, "3 다른 사람의 첫 빈 멘션(답 뒤 참여)도 같은 말풍선 하나, 답 전 저장소 0회, 빠짐 이벤트 없음");
  ok(fx.db.household_members.some((row) => fx.db.users.find((user) => String(user.id) === String(row.user_id))?.kakao_user_key === M2), "3 그 사람은 답 뒤에 이 방 가계부 구성원이 된다(예전 동작 그대로)");
  // ‘이용약관’ 단추를 누르면 카카오가 주소 뒤에 botUserKey·appUserId·botGroupKey 를 붙인다(response-builders.js V22.9.105 설명). 공개 문서라 V22.9.105
  // room-open 이 저장소를 읽지 않고 값만 뺀 /terms 로 보낸다 → 채팅 키가 주소·화면에 남지 않고, 세션 쿠키도 주지 않는다. 카카오톡 인앱 이동으로 흉내 낸다.
  const inApp = { accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-site": "none", "user-agent": "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36;KAKAOTALK 2511020" };
  const tapUrl = `${GREETING_TERMS_BUTTON.webLinkUrl}?botUserKey=${M1}&appUserId=${hex66("v118-copy-app-user")}&botGroupKey=${ROOM}`;
  const traceBefore = fx.trace.length;
  const tapped = await app.fetch(new Request(tapUrl, { headers: inApp }), fx.env, ctx);
  eq(tapped.status, 303, "3 ‘이용약관’ 단추 주소(카카오가 채팅 키를 붙임)는 값을 뺀 주소로 보낸다(303)");
  eq(tapped.headers.get("location"), "/terms", "3 보내는 곳은 채팅 키가 없는 /terms");
  ok(!tapped.headers.get("set-cookie") && tapped.headers.get("referrer-policy") === "no-referrer" && fx.trace.length === traceBefore, "3 그때 쿠키 없음·Referrer-Policy no-referrer·저장소 호출 0회");
  const opened = await app.fetch(new Request(`${BASE}/terms`, { headers: inApp }), fx.env, ctx);
  const openedHtml = await opened.text();
  ok(opened.status === 200 && !opened.headers.get("set-cookie") && visible(openedHtml).includes("사용자 책임") && !openedHtml.includes(M1) && !openedHtml.includes(ROOM), "3 따라간 /terms 는 200 약관 화면(쿠키 없음, 채팅 키 없음)");
  // 설명서의 다른 화면(기록하는 법)은 그대로다. 그 화면으로 처음 불러 답 뒤에 들인 경우만 빠짐 이벤트 한 건(동작은 그대로).
  const M3 = hex66("v118-copy-m3");
  const topic = await say(fx, "기록방법", { user: M3, room: ROOM });
  ok(topic.outputs.length === 1 && topic.outputs[0]?.textCard?.title === "기록하는 법" && !topic.text.includes(LINE), "3 설명서의 다른 화면(기록하는 법) 답은 그대로");
  ok(JSON.stringify(topic.dropped) === JSON.stringify(["info:after_reply"]), `3 그 화면으로 처음 불러 답 뒤에 들였으면 빠짐 이벤트 한 건(info, after_reply) (${JSON.stringify(topic.dropped)})`);
  eq((await say(fx, "기록방법", { user: M3, room: ROOM })).dropped.length, 0, "3 이미 구성원이면 같은 화면에 빠짐 이벤트가 없다");
});

// waitUntil 이 없는 실행: 들이기가 답 전에 그 자리에서 돌아 첫 사용 표시가 켜져도 빈 멘션 답은 같은 말풍선 하나(카드를 더하지 않는다).
await kakaoFixture(async (fx) => {
  const ROOM = hex66("v118-copy-mention-noctx"), N1 = hex66("v118-copy-n1");
  const before = roomHouseholds(fx);
  const reply = await say(fx, "", { user: N1, room: ROOM, noCtx: true });
  greetingOk("빈 멘션(waitUntil 없는 실행 — 답 전에 들임)", reply);
  ok(roomHouseholds(fx) === before + 1 && reply.before > 0, "3 그 실행은 답 전에 이 방 공동 가계부를 준비한다(예전 동작 그대로)");
  eq(reply.dropped.length, 0, "3 그때도 빠짐 이벤트가 없다");
});

// 약관 3절 예외(독립 검토 P2)를 실행으로 확인: 가계부 없는 방의 ‘초대’ 는 준비하지 않고, 해제·삭제 이력 방은 어떤 호출로도 다시 만들지 않는다.
await kakaoFixture(async (fx) => {
  const ROOM = hex66("v118-copy-invite-room"), I1 = hex66("v118-copy-i1"), RETIRED = hex66("v118-copy-retired"), R1 = hex66("v118-copy-r1");
  const before = roomHouseholds(fx);
  for (const text of ["초대", "초대코드"]) {
    const reply = await say(fx, text, { user: I1, room: ROOM });
    eq(roomHouseholds(fx), before, `3 약관 3절: 가계부 없는 방에서 ‘${text}’ 만 보내면 가계부를 준비하지 않는다`);
    ok(!reply.text.includes("소유자예요") && !reply.text.includes(LINE), `3 ‘${text}’ 답에 소유자·약관 안내가 없다`);
  }
  const keys = await kakaoGroupFirstKeys(RETIRED);
  fx.db.accountbook_settings.push({ id: "setting-v118-copy-retired", key: keys.retired, value: JSON.stringify({ version: 1, group_hash: keys.hash }), created_at: `${DAY}T00:00:00.000Z` });
  const transactions = fx.db.transactions.length;
  for (const text of ["", "사용설명서", "시작", "오늘기록", "웹가계부", "점심 12000원"]) await say(fx, text, { user: R1, room: RETIRED });
  ok(roomHouseholds(fx) === before && fx.db.transactions.length === transactions, "3 약관 3절: 해제·삭제 이력 방은 빈 멘션·설명서·시작·조회·웹가계부·기록 어느 것으로도 다시 만들지 않는다(기록도 저장하지 않음)");
});

// 재검토 P3(후속 4): 약관 3절의 나머지 예외를 실행으로 확인한다. skill-handler 의 들이기 블록보다 앞에서 답하는 명령 — 어느 가계부를 쓸지 정하는 명령(만들기·참여·
// 참여 취소·전환·연결)과 일부 안내 명령(메뉴·명령어·개인정보·키워드·수정·알림) — 은 가계부 없는 방에서 준비하지 않고 가계부 있는 방에서 참여시키지 않는다. 그래서
// 처음 부른 말이 그런 명령이면 그 사람은 소유자가 아니고, 뒤에 기록·조회·설명서로 부른 사람이 준비해 소유자가 된다(소유자 = 방 가계부가 준비되는 호출을 처음 한 사람).
const NO_PREPARE_SETTINGS = ["가계부만들기", "가계부참여", "참여 ABC123", "참여취소", "가계부전환", "단톡방연결", "단톡방 정보", "단톡방연결 ABC123"];
const NO_PREPARE_INFO = ["메뉴", "명령어", "개인정보", "키워드", "수정", "알림"];
const rolesOf = (fx, kakaoKey) => {
  const user = fx.db.users.find((row) => row.kakao_user_key === kakaoKey);
  return user ? fx.db.household_members.filter((row) => String(row.user_id) === String(user.id)).map((row) => String(row.role)) : [];
};
await kakaoFixture(async (fx) => {
  for (const [index, text] of [...NO_PREPARE_SETTINGS, ...NO_PREPARE_INFO].entries()) {
    const room = hex66(`v118-copy-noprep-room-${index}`), user = hex66(`v118-copy-noprep-user-${index}`);
    const households = roomHouseholds(fx), members = fx.db.household_members.length;
    const reply = await say(fx, text, { user, room });
    ok(roomHouseholds(fx) === households && fx.db.household_members.length === members && !reply.text.includes("소유자예요"), `3 약관 3절: 가계부 없는 새 방의 첫 호출 ‘${text}’ 는 방 가계부를 준비하지 않는다 (${reply.text.split("\n")[0].slice(0, 40)})`);
  }
  const ROOM = hex66("v118-copy-owner-room"), FIRST = hex66("v118-copy-owner-first"), LATER = hex66("v118-copy-owner-later");
  await say(fx, "가계부만들기", { user: FIRST, room: ROOM });
  await say(fx, "개인정보", { user: FIRST, room: ROOM });
  const households = roomHouseholds(fx);
  const later = await say(fx, "오늘기록", { user: LATER, room: ROOM });
  ok(roomHouseholds(fx) === households + 1 && JSON.stringify(rolesOf(fx, LATER)) === JSON.stringify(["owner"]) && rolesOf(fx, FIRST).length === 0 && later.text.includes("첫 호출자인 내가 소유자예요"), "3 약관 3절: 방 가계부가 준비되는 호출(조회)을 처음 한 사람이 소유자 — 먼저 ‘가계부만들기’·‘개인정보’ 만 보낸 사람은 소유자도 구성원도 아니다");
  for (const [index, text] of [...NO_PREPARE_SETTINGS, ...NO_PREPARE_INFO].entries()) {
    const user = hex66(`v118-copy-nojoin-user-${index}`);
    const members = fx.db.household_members.length;
    await say(fx, text, { user, room: ROOM });
    ok(fx.db.household_members.length === members && rolesOf(fx, user).length === 0, `3 약관 3절: 가계부 있는 방에서 ‘${text}’ 만 보낸 사람은 구성원이 되지 않는다`);
  }
  // ‘초대’ 는 가계부 있는 방에서는 부른 사람을 들인다 — 약관 괄호가 ‘가계부가 아직 없는 방에서는’ 으로 한정한 까닭.
  const INVITER = hex66("v118-copy-invite-linked");
  const invited = await say(fx, "초대", { user: INVITER, room: ROOM });
  ok(JSON.stringify(rolesOf(fx, INVITER)) === JSON.stringify(["member"]) && invited.text.includes("참여했어요"), "3 약관 3절: 가계부 있는 방의 ‘초대’ 는 부른 사람을 구성원으로 들인다");
  // ‘설정’ 이라고 넓게 쓰지 않은 까닭: 예산설정·구성원 권한은 준비한다. 설명서 보기(사용설명서·도움말·기록방법)도 준비하고 부른 사람이 소유자다.
  for (const [index, text] of ["예산설정", "구성원 권한", "사용설명서", "도움말", "기록방법"].entries()) {
    const room = hex66(`v118-copy-prep-room-${index}`), user = hex66(`v118-copy-prep-user-${index}`);
    const before = roomHouseholds(fx);
    await say(fx, text, { user, room });
    ok(roomHouseholds(fx) === before + 1 && JSON.stringify(rolesOf(fx, user)) === JSON.stringify(["owner"]), `3 약관 3절: 가계부 없는 새 방의 첫 호출 ‘${text}’ 는 방 가계부를 준비하고 부른 사람이 소유자`);
  }
});

// 독립 검토 P3: 저장 실패 답에는 약관 안내가 없다(성공이 정해진 뒤에만 켠다).
await kakaoFixture(async (fx) => {
  const P = hex66("v118-copy-fail-direct"), Q = hex66("v118-copy-fail-room"), ROOM = hex66("v118-copy-fail-room-key");
  const failInsert = () => intercept(async ({ url, method }) => method === "POST" && url.pathname === "/rest/v1/transactions" ? failure(400, "qa insert rejected") : null);
  let stop = failInsert();
  let failed;
  try { failed = await say(fx, "점심 12000원", { user: P }); } finally { stop(); }
  ok(failed.text.includes("저장하지 못했") && !failed.text.includes(LINE) && !termsCard(failed), `3 1:1 첫 기록 저장 실패 답에는 약관 안내가 없다 (${failed.text.split("\n")[0]})`);
  const retried = await say(fx, "점심 12000원", { user: P });
  ok(retried.text.includes("저장했어요") && termsButtonsOk(termsCard(retried)), "3 같은 사람이 다시 보내 저장되면 그 답에 약관 안내(첫 기록 길을 다시 탄다)");
  stop = failInsert();
  let roomFailed;
  try { roomFailed = await say(fx, "점심 12000원", { user: Q, room: ROOM }); } finally { stop(); }
  ok(roomFailed.text.includes("저장하지 못했") && !roomFailed.text.includes(LINE), `3 방 첫 기록 저장 실패 답에는 약관 안내가 없다 (${roomFailed.text.split("\n")[0]})`);
  ok(JSON.stringify(roomFailed.dropped) === JSON.stringify(["info:not_saved"]), `3 방을 준비한 뒤 기록이 저장되지 않았으면 빠짐 이벤트 한 건(info, not_saved) (${JSON.stringify(roomFailed.dropped)})`);
});

// 지연 답: 4초 예산 안에 첫 사용이 정해졌으면 지연 답에 같은 약관 안내가 붙는다.
await kakaoFixture(async (fx) => {
  fx.env.KAKAO_RESPONSE_BUDGET_MS = "1000";
  const G = hex66("v118-copy-deferred");
  // 기록 저장(POST transactions) 뒤의 마무리 쓰기를 늦춘다 — 저장이 정해진 뒤 예산이 지난다.
  fx.delayAfter = { ms: 450, armed: false, when: (url, method) => method === "POST" && url.pathname === "/rest/v1/transactions" };
  const deferred = await say(fx, "점심 12000원", { user: G });
  fx.delayAfter = null;
  shapeOk("1:1 첫 기록 지연 답(저장 뒤 지연)", deferred);
  ok(deferred.text.includes("기록 저장 확인이 조금 늦어지고 있어요"), `3 지연 답이다 (${deferred.text.slice(0, 40)})`);
  ok(termsButtonsOk(termsCard(deferred)), "3 지연 답에도 약관 안내 + 단추 둘");
  eq(deferred.dropped.length, 0, "3 지연 답에 안내가 붙었으면 빠짐 이벤트가 없다");
  const user = fx.db.users.find((row) => row.kakao_user_key === G);
  ok(fx.db.transactions.some((row) => String(row.user_id) === String(user?.id) && Number(row.amount) === 12000), "3 지연 답 뒤에도 기록은 저장된다");
});
// 지연 답: 첫 사용이 4초 뒤에 정해지면 지연 답에는 안내가 없다(동작 그대로) — 운영 이벤트 한 건(info, deferred)으로 빈도를 본다.
await kakaoFixture(async (fx) => {
  fx.env.KAKAO_RESPONSE_BUDGET_MS = "1000";
  const G = hex66("v118-copy-deferred-late");
  fx.delayAfter = { ms: 450, armed: false, when: (url, method) => method === "POST" && url.pathname === "/rest/v1/households" };
  const deferred = await say(fx, "점심 12000원", { user: G });
  fx.delayAfter = null;
  shapeOk("1:1 첫 기록 지연 답(저장 전 지연)", deferred);
  ok(deferred.text.includes("기록 저장 확인이 조금 늦어지고 있어요") && !deferred.text.includes(LINE), "3 저장 전에 예산이 지난 지연 답에는 안내가 없다");
  ok(JSON.stringify(deferred.dropped) === JSON.stringify(["info:deferred"]), `3 그때는 빠짐 이벤트 한 건(info, deferred) (${JSON.stringify(deferred.dropped)})`);
  const user = fx.db.users.find((row) => row.kakao_user_key === G);
  ok(fx.db.transactions.some((row) => String(row.user_id) === String(user?.id) && Number(row.amount) === 12000), "3 그 뒤에도 기록은 저장된다");
});

// 말풍선 셋이 다 찬 답: 예전처럼 글 말풍선 끝에 한 줄만, 그 자리도 없으면 그대로 + 빠짐 이벤트 한 건(요청마다 한 건).
{
  const card = (text) => ({ textCard: { description: text, buttons: [1, 2, 3, 4, 5].map((n) => ({ label: `단추${n}`, action: "message", messageText: `단추${n}` })), buttonLayout: "vertical" } });
  const reply = (outputs) => new Response(JSON.stringify({ version: "2.0", template: { outputs } }), { status: 200, headers: { "content-type": "application/json" } });
  const state = { termsNoticeV229118: true };
  const env = { __AB_KAKAO_REQUEST: state };
  const mark = opsMark();
  const full = await (await kakaoTermsNoticeResponseV229118(reply([card("가"), card("나"), card("다")]), env, BASE, {})).json();
  ok(!JSON.stringify(full).includes(LINE) && full.template.outputs.length === 3 && full.template.outputs.every((output) => output.textCard.buttons.length === 5), "3 말풍선 셋이 단추 찬 카드면 답은 그대로(기존 단추를 밀어내지 않는다)");
  await kakaoTermsNoticeResponseV229118(reply([card("가"), card("나"), card("다")]), env, BASE, {});
  ok(JSON.stringify(droppedSince(mark)) === JSON.stringify(["info:no_room"]), `3 그때 빠짐 이벤트는 요청마다 한 건(info, no_room) (${JSON.stringify(droppedSince(mark))})`);
  // 재검토 P3(후속 4): 늦은 답이 나간 요청은 버려질 최종 답이 먼저 남긴 이유(no_room·not_saved)를 지연 답 경로의 ‘deferred’ 가 덮는다(같은 이벤트, 요청마다 한 건).
  // 첫 사용이 정해진 최종 답이 말풍선 셋으로 다 차는 경우는 픽스처의 실제 답으로 만들 수 없어 함수로 본다. 지연 답 경로가 ‘deferred’ 로 부르는 것은 위 ‘저장 전
  // 지연’ 장면이 실행으로 본다.
  const lateState = { termsNoticeV229118: true };
  const lateEnv = { __AB_KAKAO_REQUEST: lateState };
  const lateMark = opsMark();
  await kakaoTermsNoticeResponseV229118(reply([card("가"), card("나"), card("다")]), lateEnv, BASE, {});
  const firstReason = JSON.stringify(droppedSince(lateMark));
  noteKakaoTermsNoticeDroppedV229118(lateEnv, "deferred");
  noteKakaoTermsNoticeDroppedV229118(lateEnv, "no_room");
  noteKakaoTermsNoticeDroppedV229118(lateEnv, "after_reply");
  const lateReasons = JSON.stringify(droppedSince(lateMark));
  ok(firstReason === JSON.stringify(["info:no_room"]) && lateReasons === JSON.stringify(["info:deferred"]) && lateState.termsNoticeDroppedV229118 === "deferred", `3 늦은 답이 나간 요청: 먼저 남은 no_room 을 ‘deferred’ 로 고쳐 쓰고 이벤트는 한 건, 그 뒤 다른 이유는 무시 (${firstReason} → ${lateReasons})`);
  const savedMark = opsMark();
  const savedEnv = { __AB_KAKAO_REQUEST: { termsNoticeV229118: true } };
  noteKakaoTermsNoticeDroppedV229118(savedEnv, "not_saved");
  noteKakaoTermsNoticeDroppedV229118(savedEnv, "deferred");
  eq(JSON.stringify(droppedSince(savedMark)), JSON.stringify(["info:deferred"]), "3 앞선 이유가 not_saved 여도 늦은 답이 나간 요청이면 ‘deferred’ 한 건");
  const withText = await (await kakaoTermsNoticeResponseV229118(reply([card("가"), { simpleText: { text: "글" } }, card("다")]), { __AB_KAKAO_REQUEST: { termsNoticeV229118: true } }, BASE, {})).json();
  eq(withText.template.outputs[1]?.simpleText?.text, `글\n\n${LINE}`, "3 셋 중 글 말풍선이 있으면 그 끝에 한 줄만(예전 동작)");
  // 조정자 결정(2026-11-12): 인사 카드는 응답 마무리(kakaoGroupCompatibleResponse — 글 속 주소 → 단추, 단톡방 모양 맞춤)를 지나도 그대로이고(단추 셋·‘이용약관’
  // 링크 주소 그대로), 첫 사용 표시가 켜진 요청이어도 약관 함수가 카드를 더하지 않는다.
  const groupPayload = payloadFor("", { user: hex66("v118-copy-unit-user"), room: hex66("v118-copy-unit-room") });
  const raw = await kakaoGroupEmptyMentionReply(BASE).json();
  eq(JSON.stringify(raw.template.outputs[0]?.textCard?.buttons), JSON.stringify(GREETING_BUTTONS), "3 인사 답 단추 셋(도움말 보기 → ‘이용약관’ = 공개 주소 + /terms → 기록하기)");
  const compat = await (await kakaoGroupCompatibleResponse(kakaoGroupEmptyMentionReply(BASE), groupPayload, BASE)).json();
  eq(JSON.stringify(compat.template.outputs), JSON.stringify(raw.template.outputs), "3 응답 마무리(kakaoGroupCompatibleResponse)는 인사 카드의 글·단추를 바꾸지 않는다(링크 단추가 앞으로 옮겨지거나 빠지지 않음)");
  const flaggedMark = opsMark();
  const flagged = await (await kakaoTermsNoticeResponseV229118(kakaoGroupEmptyMentionReply(BASE), { __AB_KAKAO_REQUEST: { termsNoticeV229118: true } }, BASE, groupPayload)).json();
  ok(flagged.template.outputs.length === 1 && JSON.stringify(flagged.template.outputs) === JSON.stringify(raw.template.outputs) && droppedSince(flaggedMark).length === 0, "3 첫 사용 표시가 켜져 있어도 인사 답에는 카드를 더하지 않고 빠짐 이벤트도 없다(안내는 인사 안에)");
}

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
    const total = fx.db.transactions.filter((row) => !row.deleted_at).length;
    const asked = await send("방금 거 지워줘");
    eq(fx.db.transactions.filter((row) => !row.deleted_at).length, total, "4 C1 직전에 다른 기록을 고쳤으면 ‘방금 거 지워줘’ 는 지우지 않는다");
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
