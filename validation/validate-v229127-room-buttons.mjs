// 수입·지출을 고르는 두 단추([지출로 기록]·[수입으로 기록])를 "눌렀을 때 카카오가 실제로 보내는 글" 로 따라가 본다(2026-11-17 시험 단톡방에서 찾은 결함).
//  1:1 은 바로가기(quickReplies)의 messageText 를, 단톡방은 카드 단추의 이름(label)을 보낸다 — 단톡방의 메시지 단추는 보낼 글이 아니라 이름을 보낸다.
//  R-1 단톡방: 두 단추는 이름이 명령이 아니다. 보낼 글(‘수입 <원래 문장>’)이 14자를 넘으면 단추를 내지 않고 ‘기록하기’(봇 부르기) 하나를 단다.
//      14자 이하이면 이름이 보낼 글로 바뀌어, 누르면 그 구분의 한 건으로 저장된다.
//  R-2 1:1: 단추가 보낼 글이 바로가기에 온전히 실릴 때(앞말까지 80자)만 단추를 낸다. 더 긴 문장은 글이 잘려 금액이 달라졌다(84자 → 12,500원, 85자 → 1,250원, 87자 → 12원).
//  R-3 예전 답 카드에 남은 두 단추의 이름만 온 말: 저장하지 않고 무엇을 다시 보내면 되는지 알려 준다. 그 예시는 그대로 보내면 저장된다.
//  늦은 답(응답 예산을 넘긴 답)의 단추도 같은 규칙이다. 다른 되묻기 답의 단추(‘오늘기록’)와 다른 흐름의 단추는 그대로다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음), 시계 2026-11-10 12:00 KST. 판 이름 글자는 적지 않는다.
// 바탕 코드에서는 R-1(단톡방에서 단추 이름이 입력 안내로 끝남)·R-2(잘린 글이 틀린 금액으로 저장)·R-3 단언이 실패한다.
import crypto from "node:crypto";
import { app, BASE, counter, fixture, intercept, putSetting, withClock } from "./lib-audit-v22934.mjs";

const TODAY = "2026-11-10";
const SECRET = "validate-v229127-room-buttons-secret";
const USER = "kakao_login:2265";
const roomKey = (id) => crypto.createHash("sha256").update(`v229127-room-buttons-${id}`).digest("hex");
const { ok, eq, done } = counter("카카오 수입·지출 고르기 단추: 단톡방은 단추 이름, 1:1 은 온전한 글만 보내는지 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };

const KEEP_GLOBALS = new Set(["__AB_QA_FIXED_NOW_MS", "__AB_CATEGORY_TABLE_ABSENT_UNTIL"]);
function resetIsolateState() {
  for (const name of Object.keys(globalThis)) {
    if (!name.startsWith("__AB_") || KEEP_GLOBALS.has(name)) continue;
    const value = globalThis[name];
    if (value instanceof Map || value instanceof Set) value.clear();
    else if (Array.isArray(value)) value.length = 0;
  }
}
const clearGuards = () => { for (const name of ["__AB_SKILL_RATE_BUCKETS", "__AB_TRAFFIC_BUCKETS", "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_INFLIGHT"]) globalThis[name]?.clear?.(); };
const payloadFor = (utterance, room) => {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: USER, type: "botUserKey", properties: { botUserKey: USER } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
};
const textOf = (body) => (body?.template?.outputs || []).map((o) => o.simpleText?.text || [o.textCard?.title, o.textCard?.description].filter(Boolean).join("\n") || "").join("\n");
async function say(fx, utterance, room) {
  clearGuards();
  globalThis.__AB_QA_FIXED_NOW_MS += 60_000;
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(payloadFor(utterance, room)),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  for (let round = 0; round < 6 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  let body = null;
  try { body = JSON.parse(raw); } catch (_) {}
  const quick = (body?.template?.quickReplies || []).map((q) => ({ label: q.label, action: q.action, messageText: q.messageText, where: "quick" }));
  const cards = (body?.template?.outputs || []).flatMap((o) => o?.textCard?.buttons || []).map((b) => ({ label: b.label, action: b.action, messageText: b.messageText, where: "card" }));
  return { text: body ? textOf(body) : raw.slice(0, 300), buttons: [...quick, ...cards], hasQuickReplies: Array.isArray(body?.template?.quickReplies), result: response.headers.get("x-accountbook-nlu-result") || "" };
}
// 누르면 카카오가 보내는 글: 1:1 바로가기는 messageText, 단톡방 카드의 메시지 단추는 이름. 봇 부르기·링크 단추는 글을 보내지 않는다.
const pressed = (path, button) => (button.action !== "message" ? null : path === "room" ? button.label : button.messageText);
const view = (r) => [String(r.transaction_date), Number(r.amount), r.type === "income" ? "i" : "e"].join("|");
// 장면 하나: 새 픽스처. 단톡방 경로는 ‘시작’ 으로 방 가계부를 먼저 만든다. talk(말) 은 답과 그 말로 새로 생긴 기록을 돌려준다.
async function scene(id, path, script, { late = false } = {}) {
  return withClock(TODAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
    const room = path === "room" ? roomKey(id) : "";
    if (room) await say(fx, "시작", room);
    const restore = late ? intercept(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); return null; }) : () => {};
    if (late) fx.env.KAKAO_RESPONSE_BUDGET_MS = "200";
    const talk = async (utterance, { plain = false } = {}) => {
      const before = new Set(fx.db.transactions.map((r) => r.id));
      if (plain) { restore(); delete fx.env.KAKAO_RESPONSE_BUDGET_MS; }
      const reply = await say(fx, utterance, room);
      return { reply, added: fx.db.transactions.filter((r) => !before.has(r.id)).map(view) };
    };
    try { return await script(talk); } finally { restore(); delete fx.env.KAKAO_RESPONSE_BUDGET_MS; }
  }));
}

const ASK = "수입인지 지출인지 헷갈려서 아직 저장하지 않았어요.";
const TYPE_LABELS = ["지출로 기록", "수입으로 기록"];
const flatOf = (utterance) => utterance.replace(/\s+/g, " ").trim();
// 이 판의 규칙으로 기대하는 단추 이름(메시지·봇 부르기 단추만 본다).
const QR_MAX = 80;
const ROOM_LABEL_MAX = 14;
function expectedLabels(path, flat) {
  const fits = flat.length + 3 <= QR_MAX;
  if (!fits) return [];
  if (path === "direct") return TYPE_LABELS;
  return flat.length + 3 <= ROOM_LABEL_MAX ? [`지출 ${flat}`, `수입 ${flat}`] : ["기록하기"];
}

// 두 단추로 되묻는 문장 [보낸 말, 금액]. 앞 여섯은 안전망(type_conflict), 마지막 둘은 해석기가 섞인 말로 막는 문장(skill-handler.js 의 확인 답).
const CHOICE = [
  ["지원금 3만 입금됨", 30000], ["지원금 30만원 입금됨", 300000], ["아빠가 차비 2만원 줌", 20000], ["네일아트 받음 현금 45000 냈음", 45000],
  ["용돈 받아서 커피 4500원 삼", 4500], ["디자인 외주 작업비 80만원 오늘 드디어 입금됐어 ㅎㅎ 이번 달은 진짜 열심히 일했다", 800000],
  ["월급 받아서 카드값 냈어 50만원", 500000], ["월급 받아서 카드값 냈어 50만원 오늘은 정말 바쁜 하루였고 저녁은 집에서 먹음", 500000],
];

for (const path of ["direct", "room"]) {
  for (const [utterance, amount] of CHOICE) {
    const flat = flatOf(utterance);
    const want = expectedLabels(path, flat);
    const first = await scene(`ask-${utterance}`, path, async (talk) => talk(utterance));
    const labels = first.reply.buttons.filter((b) => b.action === "message" || b.action === "mention").map((b) => b.label);
    check(() => ok(first.added.length === 0 && first.reply.text.startsWith(ASK), `${path} ‘${utterance.slice(0, 24)}’: 저장 없이 되묻는다 — ${JSON.stringify(first.reply.text.slice(0, 40))}`), "ask");
    check(() => eq(JSON.stringify(labels), JSON.stringify(want), `${path} ‘${utterance.slice(0, 24)}’(${flat.length}자): 단추 이름`), "ask");
    check(() => ok(path !== "room" || !first.reply.buttons.some((b) => TYPE_LABELS.includes(b.label)), `${path} ‘${utterance.slice(0, 24)}’: 단톡방 답에 이름만 나가는 두 단추가 없다`), "ask");
    check(() => ok(path !== "room" || !first.reply.hasQuickReplies, `${path} ‘${utterance.slice(0, 24)}’: 단톡방 답에 바로가기가 없다`), "ask");
    check(() => ok(!/https?:\/\//.test(first.reply.text), `${path} ‘${utterance.slice(0, 24)}’: 글에 주소 없음`), "ask");
    // 단추마다: 누르면 실제로 나가는 글을 다시 보내, 고른 구분의 같은 금액 한 건으로 저장되는지 본다.
    const sendable = first.reply.buttons.filter((b) => pressed(path, b));
    check(() => eq(sendable.length, want.includes("기록하기") ? 0 : want.length, `${path} ‘${utterance.slice(0, 24)}’: 글을 보내는 단추 수`), "press");
    for (const [index, button] of sendable.entries()) {
      const type = index === 0 ? "e" : "i";
      const word = index === 0 ? "지출" : "수입";
      const text = pressed(path, button);
      check(() => eq(text, `${word} ${flat}`, `${path} ‘${utterance.slice(0, 24)}’ [${button.label}]: 누르면 나가는 글이 온전한 ‘${word} …’ 문장이다`), "press");
      const again = await scene(`press-${index}-${utterance}`, path, async (talk) => { await talk(utterance); return talk(text); });
      check(() => eq(JSON.stringify(again.added), JSON.stringify([`${TODAY}|${amount}|${type}`]), `${path} ‘${utterance.slice(0, 24)}’ [${button.label}] 누름: ${word} ${amount}원 한 건 — ${again.reply.text.split("\n")[0].slice(0, 50)}`), "press");
    }
    // 단추가 없거나 봇 부르기뿐일 때: 안내 글대로 앞에 구분을 붙여 다시 보내면 그 구분의 한 건으로 저장된다(단톡방·긴 문장의 길).
    if (!sendable.length) {
      for (const [word, type] of [["지출", "e"], ["수입", "i"]]) {
        const again = await scene(`typed-${word}-${utterance}`, path, async (talk) => { await talk(utterance); return talk(`${word} ${flat}`); });
        check(() => eq(JSON.stringify(again.added), JSON.stringify([`${TODAY}|${amount}|${type}`]), `${path} ‘${word} ${flat.slice(0, 20)}…’ 를 직접 보냄: ${word} 한 건 — ${again.reply.text.split("\n")[0].slice(0, 50)}`), "typed");
      }
      check(() => ok(first.reply.text.includes("앞에 구분을 붙여 다시 보내 주세요") || first.reply.text.includes("앞에 ‘지출’ 이나 ‘수입’ 을 붙여 다시 보내 주세요"), `${path} ‘${utterance.slice(0, 24)}’: 단추가 없으면 글이 다시 보내는 법을 알려 준다`), "typed");
    }
    // 봇 부르기 단추의 모양(단톡방): 이름 ‘기록하기’, 동작 mention, 보낼 글 없음.
    if (want.includes("기록하기")) {
      const mention = first.reply.buttons.find((b) => b.label === "기록하기");
      check(() => ok(mention && mention.action === "mention" && !mention.messageText && mention.where === "card", `${path} ‘${utterance.slice(0, 24)}’: ‘기록하기’ 는 봇 부르기 단추다 — ${JSON.stringify(mention)}`), "ask");
    }
  }
}

// R-2 길이 훑기: 같은 문장을 70~92자로 늘려 가며 1:1·단톡방에서 본다. 단추가 있으면 누른 글이 온전하고 1,250,000원으로 저장되며, 80자에 실리지 않는 길이에는 단추가 없다.
{
  const lead = "구청 청년 월세 지원 사업으로 신청했던 지원금이 드디어 승인돼서 오늘 오전에 내 생활비 통장으로";
  const tail = "1250000원 입금됨";
  const base = `${lead} ${tail}`.length;
  const pad = (extra) => { for (let a = 0; 3 * a <= extra; a += 1) if ((extra - 3 * a) % 2 === 0) return `${"아주 ".repeat(a)}${"꼭 ".repeat((extra - 3 * a) / 2)}`; return null; };
  const seen = { direct: { with: [], without: [] }, room: { with: [], without: [] } };
  for (let length = 70; length <= 92; length += 1) {
    const filler = pad(length - base);
    if (filler === null) continue;
    const utterance = `${lead} ${filler}${tail}`;
    check(() => eq(utterance.length, length, `길이 훑기: 만든 문장이 ${length}자`), "sweep");
    for (const path of ["direct", "room"]) {
      const first = await scene(`sweep-${length}`, path, async (talk) => talk(utterance));
      check(() => ok(first.added.length === 0 && first.reply.text.startsWith(ASK), `${path} ${length}자: 저장 없이 되묻는다 — ${JSON.stringify(first.reply.text.slice(0, 40))}`), "sweep");
      const sendable = first.reply.buttons.filter((b) => pressed(path, b) && /^(?:지출|수입)/.test(pressed(path, b)));
      (sendable.length ? seen[path].with : seen[path].without).push(length);
      check(() => eq(sendable.length, path === "direct" && length + 3 <= QR_MAX ? 2 : 0, `${path} ${length}자: 수입·지출 단추 수`), "sweep");
      for (const button of sendable) {
        const text = pressed(path, button);
        const word = text.slice(0, 2);
        check(() => eq(text, `${word} ${utterance}`, `${path} ${length}자 [${button.label}]: 누른 글이 잘리지 않았다(${text.length}자)`), "sweep");
        const again = await scene(`sweep-press-${word}-${length}`, path, async (talk) => { await talk(utterance); return talk(text); });
        check(() => eq(JSON.stringify(again.added), JSON.stringify([`${TODAY}|1250000|${word === "수입" ? "i" : "e"}`]), `${path} ${length}자 [${button.label}] 누름: ${word} 1,250,000원 한 건 — ${JSON.stringify(again.added)}`), "sweep");
      }
      // 어떤 단추든 누르면 나가는 글이 원래 문장을 잘라 낸 조각이어서는 안 된다(조각이 다른 금액으로 저장된다).
      for (const button of first.reply.buttons) {
        const text = pressed(path, button) || "";
        const cut = /^(?:지출|수입) /.test(text) && text.length < utterance.length + 3 && `수입 ${utterance}`.slice(3).startsWith(text.slice(3));
        check(() => ok(!cut, `${path} ${length}자 [${button.label}]: 잘린 글을 보내는 단추가 없다 — ‘…${text.slice(-16)}’`), "sweep");
      }
    }
  }
  check(() => ok(Math.max(...seen.direct.with) === 77 && Math.min(...seen.direct.without) === 78, `1:1 길이 훑기: 77자까지 단추가 있고 78자부터 없다 — 있음 ${seen.direct.with.join(",")} / 없음 ${seen.direct.without.join(",")}`), "sweep");
  check(() => ok(seen.room.with.length === 0 && seen.room.without.length >= 20, `단톡방 길이 훑기: 이 길이에는 수입·지출 단추가 없다 — 있음 ${seen.room.with.join(",")}`), "sweep");
}

// R-3 예전 답 카드의 단추 이름만 온 말. 예시(‘수입 지원금 30만원’)는 그대로 보내면 저장된다.
for (const path of ["direct", "room"]) {
  for (const label of TYPE_LABELS) {
    const r = await scene(`old-${label}`, path, async (talk) => { const asked = await talk("지원금 30만원 입금됨"); const old = await talk(label); const example = await talk("수입 지원금 30만원"); return { asked, old, example }; });
    check(() => ok(r.asked.added.length === 0 && r.old.added.length === 0, `${path} 예전 단추 이름 ‘${label}’: 저장 없음 — ${JSON.stringify(r.old.added)}`), "old");
    check(() => eq(r.old.reply.text.split("\n").slice(0, 3).join("\n"), "이 단추만으로는 어떤 기록인지 알 수 없어요.\n앞에 ‘지출’ 이나 ‘수입’ 을 붙여 한 문장으로 다시 보내 주세요.\n예) 수입 지원금 30만원", `${path} 예전 단추 이름 ‘${label}’: 다시 보내는 법 안내`), "old");
    check(() => ok(!r.old.reply.buttons.some((b) => TYPE_LABELS.includes(b.label)) && !/https?:\/\//.test(r.old.reply.text), `${path} 예전 단추 이름 ‘${label}’: 답에 그 단추·주소가 없다`), "old");
    check(() => eq(JSON.stringify(r.example.added), JSON.stringify([`${TODAY}|300000|i`]), `${path} 안내의 예시 ‘수입 지원금 30만원’: 그대로 보내면 수입 한 건 — ${r.example.reply.text.split("\n")[0].slice(0, 40)}`), "old");
  }
  // 단추 이름이 든 평범한 기록은 그대로 기록이다(이름만 온 말일 때만 안내한다).
  const plain = await scene("old-plain", path, async (talk) => talk("수입으로 기록 알바비 5만원"));
  check(() => ok(!plain.reply.text.startsWith("이 단추만으로는"), `${path} ‘수입으로 기록 알바비 5만원’: 단추 안내가 아니다 — ${JSON.stringify(plain.reply.text.slice(0, 40))}`), "old");
}

// 늦은 답(응답 예산을 넘겨 나가는 답)도 같은 단추 규칙이다. 단추를 누를 때는 평소 속도로 보낸다.
for (const path of ["direct", "room"]) {
  for (const [utterance, amount] of [["지원금 30만원 입금됨", 300000], ["지원금 3만 입금됨", 30000]]) {
    const flat = flatOf(utterance);
    const want = expectedLabels(path, flat);
    const r = await scene(`late-${utterance}`, path, async (talk) => {
      const asked = await talk(utterance);
      const button = asked.reply.buttons.filter((b) => pressed(path, b))[1] || null;
      const next = button ? await talk(pressed(path, button), { plain: true }) : null;
      return { asked, button, next };
    }, { late: true });
    const labels = r.asked.reply.buttons.filter((b) => b.action === "message" || b.action === "mention").map((b) => b.label);
    check(() => ok(r.asked.reply.result === "deferred" && r.asked.added.length === 0 && r.asked.reply.text.startsWith(ASK), `${path} 늦은 답 ‘${utterance}’: ${r.asked.reply.result}, 저장 없이 되묻는다 — ${JSON.stringify(r.asked.reply.text.slice(0, 30))}`), "late");
    check(() => eq(JSON.stringify(labels), JSON.stringify(want), `${path} 늦은 답 ‘${utterance}’: 단추 이름`), "late");
    if (want.includes("기록하기")) check(() => ok(!r.button, `${path} 늦은 답 ‘${utterance}’: 글을 보내는 단추가 없다`), "late");
    else check(() => ok(r.button && JSON.stringify(r.next.added) === JSON.stringify([`${TODAY}|${amount}|i`]), `${path} 늦은 답 ‘${utterance}’ [${r.button?.label}] 누름: 수입 ${amount}원 한 건 — ${JSON.stringify(r.next?.added)}`), "late");
  }
}

// 다른 되묻기 답과 다른 흐름의 단추는 그대로다: 할인 되묻기의 ‘오늘기록’, 예산 흐름의 분류 단추(이름이 그 흐름의 답이다), 빈 요약의 ‘기록하기’.
for (const path of ["direct", "room"]) {
  const discount = await scene("other-discount", path, async (talk) => talk("치킨 18000 쿠폰 2000"));
  check(() => ok(discount.added.length === 0 && JSON.stringify(discount.reply.buttons.filter((b) => b.action === "message").map((b) => b.label)) === JSON.stringify(["오늘기록"]), `${path} 할인 되묻기: 단추는 ‘오늘기록’ 하나 — ${JSON.stringify(discount.reply.buttons.map((b) => b.label))}`), "other");
  const budget = await scene("other-budget", path, async (talk) => talk("예산 정하기"));
  const budgetButtons = budget.reply.buttons.filter((b) => b.action === "message");
  check(() => ok(budgetButtons.length >= 2 && budgetButtons.every((b) => pressed(path, b)), `${path} 예산 흐름: 메시지 단추가 그대로 있다(${budgetButtons.length}개) — ${JSON.stringify(budgetButtons.map((b) => b.label))}`), "other");
  const saved = await scene("other-save", path, async (talk) => talk("점심 12000원"));
  check(() => eq(JSON.stringify(saved.added), JSON.stringify([`${TODAY}|12000|e`]), `${path} 평소 기록 ‘점심 12000원’: 그대로 저장`), "other");
}

if (failures.length) {
  console.error(`실패 ${failures.length}건:`);
  for (const line of failures.slice(0, Number(process.env.AB_SHOW_FAILURES) || 80)) console.error(`  - ${line}`);
  process.exit(1);
}
done();
