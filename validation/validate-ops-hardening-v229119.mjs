// 운영 견고화 검사(ops 담당, 보고서 O-1·O-2·O-3·O-5 + 독립 검토 후속). 오프라인 픽스처만 쓰고 바깥 요청은 막는다(보내면 실패).
//  O-1 같은 날 같은 문장: 운영 DB 에만 있는 유니크 인덱스 transactions_kakao_request_unique_idx 를 픽스처의 선택형 흉내(db.__kakao_request_unique)로
//      켜고, 121초 뒤 같은 문장·여러 건·한 글 안 반복·수정 명령이 ‘확실히 저장 안 됨’ 으로 사실대로 답하는지(대기 표식·잠금 0, 기록 그대로) 본다.
//      흉내를 끈 기본 상태(인덱스를 지운 뒤의 목표)에서는 둘째 기록이 저장되고, 120초 안 재전송은 두 상태 모두 지금처럼 ‘중복 저장 안 함’ 이다.
//  후속(독립 검토): A 120초 중복으로 건너뛴 줄과 인덱스에 걸린 줄이 섞인 글, B 별도 구매 추가·복구가 인덱스에 걸릴 때, C 예시 = 걸린 그 문장
//      + ‘두 번째’(이미 ‘두 번째’ 면 ‘세 번째’, 파서가 같은 날짜·금액·구분 한 건으로 읽을 때만), D 잘못된 예산 값의 운영 이벤트, E 날짜 수정 예시의
//      날짜 말, F 수입·지출 섞임·넷 이상 겹침·조회 실패, G 웹 수정·되돌리기, H 300자 문장(오류 글은 본문 500자에서 잘림), I 표식 정리 DELETE 실패
//      뒤(이 판 전부터 있던 동작 고정), J 백업 문서의 전제.
//  후속 2(재검토): L 290자 이상 원문은 ‘문장 앞에’(저장 칸이 300자에서 잘려 끝에 덧붙이면 또 걸림, 앞에 덧붙이면 저장), K 걸린 문장이 둘 이상이면
//      ‘걸린 문장마다’·한 글 안 반복은 ‘둘 중 하나에만’(그대로 다시 보내면 저장), E3b/E4 날짜 수정 예시 = 기록 칸(옮길 날짜 + 메모 + 금액 + ‘두 번째’,
//      파서가 날짜·금액·구분을 그대로 읽을 때만, 못 만들면 방법 문장 없이 사실만), N 복구가 걸리면 ‘복구 NN번’ 으로 다른 기록이 골라지는 번호만 안내,
//      G5·G6 관리자 API 수정이 걸리면 409 record_same_kakao_text(전: 500 ‘잠시 후 다시’), G7 /admin/bulk 문구 그대로, O-3i 실행 기록 db_budget.
//  O-3 예약 실행 예산 CRON_DB_CALL_BUDGET, O-5 요청 예산 DB_CALL_BUDGET: 없거나 50~900 정수 밖이면 50(지금과 같은 결과), 올리면 더 처리하고 넘지 않는다.
//  O-1 검토용 SQL(migrations/V22_9_119_DROP_KAKAO_REQUEST_UNIQUE_REVIEW_ONLY.sql)과 O-2 백업 절차 문서의 내용·비밀 값 없음.
// 옛 코드에서는 O-1 안내(‘저장하지 못했어요 … 잠시 후 다시’ 였다)·흉내·수정 안내, 예산 변수(무시됐다), SQL·문서 단언이 실패하고, 후속 단언은
// 7b71cd2(후속 전) 에서 A·B·C·D·E·G·J 가 실패하고, 후속 2 단언은 e050897(후속 2 전) 에서 L·K·E·N·G5·G6·O-3i 가 실패한다.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { app, BASE, counter, page, post, withClock } from "./lib-audit-v22934.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";

const c = counter("ops 견고화(같은 문장 재전송·DB 호출 예산 변수·백업 절차·검토용 SQL) 검사 통과");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const SECRET = "synthetic-skill-secret";
const DAY = "2026-11-12"; // withClock 으로 고정한 오늘(KST). 120초 창은 실제 시계라 created_at 을 밀어 맞춘다.
const clearGuards = () => { globalThis.__AB_KAKAO_REPEAT_GUARD?.clear(); globalThis.__AB_KAKAO_INFLIGHT?.clear(); };

async function withFx(task, options = {}) {
  const fx = await createV2265QaFixture(options);
  Object.assign(fx.env, { SKILL_RATE_LIMIT: "100000", KAKAO_SKILL_SECRET: SECRET, KAKAO_SKILL_AUTH_REQUIRED: "1" });
  fx.db.__honor_select = true;
  const fixtureFetch = globalThis.fetch;
  const state = { calls: 0, hook: null, tap: null, external: [] };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    if (url.hostname !== "mock.supabase.co") { state.external.push(`${method} ${url.hostname}`); throw new Error(`external request blocked: ${url.hostname}`); }
    state.calls += 1;
    const injected = state.hook ? await state.hook({ url, method, init }) : null;
    if (injected) return injected;
    const response = await fixtureFetch(input, init);
    if (state.tap) await state.tap({ url, method, response: response.clone() });
    return response;
  };
  fx.state = state;
  try { return await task(fx); }
  finally {
    clearGuards();
    globalThis.fetch = fixtureFetch;
    fx.restore();
    c.eq(state.external.join(","), "", "바깥 요청 0");
  }
}

async function say(fx, utterance, { key, room = "", properties = {} } = {}) {
  const userRequest = {
    timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr",
    user: { id: key, type: "botUserKey", properties: { botUserKey: key, ...(room ? { botGroupKey: room } : {}), ...properties } },
    ...(room ? { chat: { id: room, type: "groupChat", properties: { botGroupKey: room } } } : {}),
  };
  const body = { intent: { id: "i1", name: "블록" }, userRequest, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
  const jobs = [];
  fx.state.calls = 0;
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(body) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  const before = fx.state.calls;
  for (let done = 0; done < jobs.length;) { const batch = jobs.slice(done); done = jobs.length; await Promise.allSettled(batch); }
  let text = raw, json = null;
  try { json = JSON.parse(raw); text = (json.template?.outputs || []).map((o) => o?.simpleText?.text || o?.textCard?.description || o?.textCard?.title || "").join("\n"); } catch (_) {}
  const quick = (json?.template?.quickReplies || []).map((q) => String(q?.messageText || q?.label || ""));
  return { status: response.status, text, quick, before, total: fx.state.calls };
}

const rowsOf = (fx, key) => fx.db.transactions.filter((t) => t.source === "kakao_skill" && t.source_user_key === key);
const age = (fx, key, seconds) => { for (const t of rowsOf(fx, key)) t.created_at = new Date(Date.parse(t.created_at) - seconds * 1000).toISOString(); };
const markers = (fx) => fx.db.accountbook_settings.filter((r) => String(r.key).includes(":pending_write:")).length;
const liveLocks = (fx) => fx.db.accountbook_operation_locks.filter((row) => Date.parse(row.locked_until) > Date.now()).length;
const dates = (fx, key) => rowsOf(fx, key).map((t) => t.transaction_date).sort().join(",");
const opsEvents = () => globalThis.__AB_OPS_EVENTS || [];
const lastEvent = () => opsEvents()[opsEvents().length - 1];
const budgetEventsSince = (mark) => { const list = opsEvents(); const at = mark === undefined ? -1 : list.lastIndexOf(mark); return list.slice(at + 1).filter((e) => e.kind === "db_call_budget_invalid"); };

// 기대 답(후속 C: 예시는 걸린 그 문장 + ‘두 번째’; 파서가 같은 날짜·금액·구분 한 건으로 읽지 못하거나 60자를 넘으면 예시 없이 방법만).
const EXAMPLE = "버스 1500 두 번째";
const ADD = (word, example = "") => `같은 ${word}이 한 번 더 있었다면 문장 끝에 낱말을 하나 덧붙여 다시 보내 주세요.${example ? ` 예: ‘${example}’` : ""}`;
const ADD_ALL = (word, example = "") => `같은 ${word}이 한 번 더 있었다면 그 문장 끝에 낱말을 하나 덧붙여 전체를 다시 보내 주세요.${example ? ` 예: ‘${example}’` : ""}`;
// 후속 2(재검토): 걸린 문장이 둘 이상이면 ‘걸린 문장마다’, 한 글 안 반복이면 ‘둘 중 하나에만’, 290자 이상 문장이면 ‘문장 앞에’(예시 없음).
const ADD_EACH = (word, example = "") => `같은 ${word}이 한 번 더 있었다면 걸린 문장마다 끝에 낱말을 하나 덧붙여 전체를 다시 보내 주세요.${example ? ` 예: ‘${example}’` : ""}`;
const ADD_ONE_OF_TWO = (word, example = "") => `같은 ${word}이 한 번 더 있었다면 같은 문장 둘 중 하나에만, 문장 끝에 낱말을 하나 덧붙여 전체를 다시 보내 주세요.${example ? ` 예: ‘${example}’` : ""}`;
const ADD_FRONT = (word) => `같은 ${word}이 한 번 더 있었다면 문장 앞에 낱말을 하나 덧붙여 다시 보내 주세요.`;
const SINGLE_OF = (word, example = "") => ["이번 내용은 저장하지 않았어요.", "오늘 같은 문장으로 저장한 기록이 이미 있어요.", ADD(word, example)].join("\n");
const SINGLE_LONG = ["이번 내용은 저장하지 않았어요.", "오늘 같은 문장으로 저장한 기록이 이미 있어요.", ADD_FRONT("지출")].join("\n");
const SINGLE = SINGLE_OF("지출", EXAMPLE);
const SINGLE_INCOME = SINGLE_OF("수입", "용돈 50000원 받음 두 번째");
// 예시는 원문에서만 만든다(이 실패 경로에 조회를 더하지 않음) — 이 장면에서는 ‘버스 1500 두 번째’ 가 이미 저장돼 있어도 같은 예시가 나온다.
const MULTI = ["이번에 보낸 2건은 하나도 저장하지 않았어요.", "같은 날 같은 문장으로 이미 저장한 기록이 있는 내용: ‘버스 1500’", ADD_ALL("지출", EXAMPLE)].join("\n");
const REPEAT = ["이번에 보낸 2건은 하나도 저장하지 않았어요.", "이번에 보낸 글 안에 같은 문장이 두 번 있는 내용: ‘택시 8000’", ADD_ONE_OF_TWO("지출", "택시 8000 두 번째")].join("\n");
const MIXED = ["이번에 새로 저장한 것은 없어요.", "이미 저장돼 있어 건너뛴 내용: ‘커피 4500’", "같은 날 같은 문장으로 이미 저장한 기록이 있는 내용: ‘버스 1500’", `같은 지출이 한 번 더 있었다면 건너뛴 내용은 빼고, 그 문장 끝에 낱말을 하나 덧붙여 다시 보내 주세요. 예: ‘${EXAMPLE}’`].join("\n");
const KINDS = ["이번에 보낸 2건은 하나도 저장하지 않았어요.", "같은 날 같은 문장으로 이미 저장한 기록이 있는 내용: ‘용돈 50000원 받음’, ‘버스 1500’", ADD_EACH("기록", "용돈 50000원 받음 두 번째")].join("\n");
const FIVE = ["이번에 보낸 5건은 하나도 저장하지 않았어요.", "같은 날 같은 문장으로 이미 저장한 기록이 있는 내용: ‘김밥 3000’, ‘라면 4000’, ‘우유 1500’ 외 2개", ADD_EACH("지출", "김밥 3000 두 번째")].join("\n");
const LOOKUP_FAILED = ["이번에 보낸 2건은 하나도 저장하지 않았어요.", "그중에 같은 날 같은 문장으로 이미 저장한 기록이 있는 내용이 있어요.", ADD_ALL("기록")].join("\n");
const EDIT = (day) => ["01번 기록을 바꾸지 않았어요. 기록은 그대로예요.", `${day} 같은 문장·같은 금액으로 저장한 기록이 이미 있어서 바꿀 수 없어요.`, "서로 다른 지출이라면 이 기록을 지우고 문장을 조금 바꿔 다시 보내 주세요."].join("\n");
// 후속 2(재검토): 날짜 수정 예시는 기록 칸(메모·금액·구분) + 바꿀 날짜로 만든 문장이고 그 문장을 보내라고 한다. 못 만들면 사실 두 줄만.
const EDIT_DATE = (day, example = "") => ["01번 기록을 바꾸지 않았어요. 기록은 그대로예요.", `${day} 기록 중에 같은 문장·같은 금액으로 저장한 기록이 이미 있어서 바꿀 수 없어요.`, ...(example ? [`서로 다른 지출이라면 이 기록을 지우고 이 문장으로 다시 보내 주세요: ‘${example}’`] : [])].join("\n");
const SEPARATE = ["별도 구매를 추가하지 않았어요. 새 기록은 저장하지 않았어요.", "같은 날 같은 문장은 한 번 더 저장되지 않아요.", `서로 다른 구매라면 ‘별도 구매 추가’ 없이 문장 끝에 낱말을 하나 덧붙여 보내 주세요. 예: ‘${EXAMPLE}’`].join("\n");
const SEPARATE_LONG = ["별도 구매를 추가하지 않았어요. 새 기록은 저장하지 않았어요.", "같은 날 같은 문장은 한 번 더 저장되지 않아요.", "서로 다른 구매라면 ‘별도 구매 추가’ 없이 문장 앞에 낱말을 하나 덧붙여 보내 주세요."].join("\n");
const RESTORE = ["같은 내용의 기록이 이미 있어 복구하지 않았어요.", "복구하려던 기록: 01번 - 버스 / 1,500원 / - / 교통", "‘오늘 기록 보기’로 같은 내용의 기록을 확인해 주세요."].join("\n");
const RESTORE_OTHER = (label, numbers) => ["같은 내용의 기록이 이미 있어 복구하지 않았어요.", `복구하려던 기록: ${label}`, "‘오늘 기록 보기’로 같은 내용의 기록을 확인해 주세요.", ...(numbers ? [`이 기록은 복구 목록에 남아 있어요. 다른 삭제 기록은 ${numbers}으로 되살릴 수 있어요.`] : [])].join("\n");
const PENDING = ["앞서 보낸 기록의 저장 결과를 아직 확인하지 못해 이번 내용은 저장하지 않았어요. 앞 기록을 확인한 뒤 이번 내용은 잠시 뒤(길어야 10분) 다시 보내 주세요.", "‘오늘기록’에서 확인해 주세요. 목록에 없어도 아직 저장 중일 수 있어요."].join("\n");
const WEB_SAME = "같은 날·같은 문장·같은 금액의 카카오 기록이 이미 있어 바꾸지 못했습니다. 기존 기록은 그대로입니다.";
const WEB_RESTORE_FAILED = "지운 기록을 되살리지 못했습니다. 목록을 새로고침해 기록이 있는지 확인해 주세요.";
const PATHS = [["1:1", ""], ["단톡방", "room-ops-hardening"]];

// ── O-1 흉내 켬: 1:1·단톡방 ──
await withClock(DAY, async () => {
  for (const [name, room] of PATHS) await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = `ops-commuter-${room ? "room" : "direct"}`;
    const first = await say(fx, "버스 1500", { key, room });
    c.ok(/지출 저장했어요/.test(first.text) && rowsOf(fx, key).length === 1, `${name} O-1a 첫 ‘버스 1500’ 저장`);
    clearGuards();
    const resend = await say(fx, "버스 1500", { key, room });
    c.ok(/중복 저장 안 함 😊/.test(resend.text) && /중복 저장 안 함 1건/.test(resend.text) && rowsOf(fx, key).length === 1, `${name} O-1b 120초 안 같은 내용은 지금처럼 ‘중복 저장 안 함’(기록 1건)`);
    age(fx, key, 121); clearGuards();
    const again = await say(fx, "버스 1500", { key, room });
    c.eq(again.text, SINGLE, `${name} O-1c 121초 뒤 같은 문장 → 저장 안 함·이미 있음·그 문장 끝에 낱말을 덧붙인 예시(옛 코드: ‘잠시 후 같은 내용을 다시’)`);
    c.ok(again.status === 200 && rowsOf(fx, key).length === 1 && markers(fx) === 0 && liveLocks(fx) === 0, `${name} O-1d 기록 1건 그대로, 대기 표식·잠금 0`);
    c.ok(!/잠시 후|다시 시도|https?:\/\//.test(again.text), `${name} O-1e 틀린 ‘잠시 후 다시’ 안내와 주소가 없다`);
    clearGuards();
    const twice = await say(fx, "버스 1500", { key, room });
    c.ok(twice.text === SINGLE && rowsOf(fx, key).length === 1 && markers(fx) === 0, `${name} O-1f 다시 보내도 같은 안내(기록 1건, 표식 0)`);
    clearGuards();
    await say(fx, EXAMPLE, { key, room });
    const example = rowsOf(fx, key).find((t) => t.raw_text === EXAMPLE);
    c.ok(example && Number(example.amount) === 1500 && example.type === "expense" && /두 번째/.test(String(example.memo || "")), `${name} O-1g 안내의 예시 문장은 1,500원 지출·메모 ‘두 번째’로 저장된다`);
    clearGuards();
    const changed = await say(fx, "버스비 1500", { key, room });
    c.ok(/지출 저장했어요/.test(changed.text) && rowsOf(fx, key).length === 3, `${name} O-1h 문장을 바꾸면 저장된다`);
    age(fx, key, 121); clearGuards();
    const multi = await say(fx, "커피 4500 버스 1500", { key, room });
    c.eq(multi.text, MULTI, `${name} O-1i 여러 건 중 하나가 걸리면 한 건도 저장하지 않았고 어느 내용이 이미 있는지 말한다`);
    c.ok(rowsOf(fx, key).length === 3 && !rowsOf(fx, key).some((t) => /커피/.test(String(t.memo || ""))) && markers(fx) === 0 && liveLocks(fx) === 0, `${name} O-1j 여러 건 입력은 지금처럼 통째로 저장 안 됨(커피 0건), 표식·잠금 0`);
    clearGuards();
    const repeat = await say(fx, "택시 8000\n택시 8000", { key, room });
    c.ok(repeat.text === REPEAT && rowsOf(fx, key).length === 3 && markers(fx) === 0, `${name} O-1k 한 글 안에 같은 문장 두 번 → 그 사실을 말하고 아무것도 저장하지 않음`);
  });

  // 수정 명령: 날짜·금액을 바꾸면 같은 날 같은 문장·같은 금액의 내 기록이 둘이 되는 경우(1:1·단톡방)
  for (const [name, room] of PATHS) await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = `ops-editor-${room ? "room" : "direct"}`;
    await say(fx, "버스 1500", { key, room });
    for (const t of rowsOf(fx, key)) { t.transaction_date = "2026-11-11"; t.created_at = new Date(Date.now() - 86400000).toISOString(); }
    clearGuards();
    await say(fx, "버스 1500", { key, room });
    c.eq(dates(fx, key), "2026-11-11,2026-11-12", `${name} O-1l 다른 날의 같은 문장은 저장된다(인덱스는 같은 날만 막는다)`);
    clearGuards();
    const dateEdit = await say(fx, "수정 01번 날짜 어제", { key, room });
    c.eq(dateEdit.text, EDIT_DATE("11월 11일", "11월 11일 버스 1500원 두 번째"), `${name} O-1m(E1) ‘수정 01번 날짜 어제’ 가 걸리면 수정하지 않았다고 답하고, 기록 칸으로 만든 날짜 든 문장을 보내라고 한다(옛 코드: ‘잠시 후 다시’ / 후속 전: 날짜 없는 ‘문장을 조금 바꿔’ / 후속 2 전: ‘날짜를 넣고 문장 끝에 낱말을’ + 원문 예시)`);
    c.ok(rowsOf(fx, key).filter((t) => t.transaction_date === DAY).length === 1 && markers(fx) === 0, `${name} O-1n 날짜 수정이 거절되면 기록은 그대로`);
    clearGuards();
    const amountUp = await say(fx, "수정 01번 금액 2000", { key, room });
    c.ok(/금액을 2,000원으로 변경했어요/.test(amountUp.text), `${name} O-1o 걸리지 않는 수정은 그대로 된다`);
    age(fx, key, 200); clearGuards();
    await say(fx, "버스 1500", { key, room });
    clearGuards();
    const amountBack = await say(fx, "수정 01번 금액 1500", { key, room });
    c.ok(amountBack.text === EDIT("오늘") && rowsOf(fx, key).some((t) => t.transaction_date === DAY && Number(t.amount) === 2000), `${name} O-1p 금액 수정이 같은 날 같은 문장·같은 금액을 만들면 수정하지 않고 기록은 2,000원 그대로(금액·구분 수정 안내는 그대로)`);
  });

  // E2: 날짜 수정 안내대로 지우고 예시를 보내면 그 날짜·금액으로 저장된다
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-date-edit";
    await say(fx, "버스 1500", { key });
    for (const t of rowsOf(fx, key)) { t.transaction_date = "2026-11-11"; t.created_at = new Date(Date.now() - 86400000).toISOString(); }
    clearGuards(); await say(fx, "버스 1500", { key }); clearGuards();
    const refused = await say(fx, "수정 01번 날짜 어제", { key }); clearGuards();
    const removed = await say(fx, "삭제 01번", { key }); clearGuards();
    const follow = await say(fx, "11월 11일 버스 1500원 두 번째", { key });
    const saved = rowsOf(fx, key).find((t) => t.raw_text === "11월 11일 버스 1500원 두 번째");
    c.ok(refused.text === EDIT_DATE("11월 11일", "11월 11일 버스 1500원 두 번째") && /삭제했어요/.test(removed.text) && /지출 저장했어요/.test(follow.text)
      && saved?.transaction_date === "2026-11-11" && Number(saved?.amount) === 1500 && saved?.type === "expense" && dates(fx, key) === "2026-11-11,2026-11-11", "E2 날짜 수정 안내대로 지우고 그 문장을 보내면 11월 11일 1,500원 지출로 저장된다");
  });

  // E3: 원문에 날짜 말(‘어제’)이 있어도 예시는 기록 칸으로 만들어 그 날짜로 저장된다(후속 2 전: 예시를 숨기고 ‘날짜를 넣고 문장 끝에’ 만 말해,
  // 따라 쓴 ‘11월 10일 어제 버스 1500 두 번째’ 는 파서가 11월 11일로 읽었다)
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-date-word";
    await say(fx, "어제 버스 1500", { key });
    for (const t of rowsOf(fx, key)) { t.transaction_date = "2026-11-10"; t.created_at = new Date(Date.now() - 2 * 86400000).toISOString(); }
    clearGuards(); await say(fx, "어제 버스 1500", { key }); clearGuards();
    const refused = await say(fx, "11월 11일 수정 01번 날짜 11월 10일", { key }); clearGuards();
    c.ok(refused.text === EDIT_DATE("11월 10일", "11월 10일 버스 1500원 두 번째") && dates(fx, key) === "2026-11-10,2026-11-11", "E3 원문 ‘어제 버스 1500’ 의 날짜 수정이 걸리면 예시는 기록 칸으로 만든 ‘11월 10일 버스 1500원 두 번째’(기록 그대로)");
    const follow = await say(fx, "11월 10일 버스 1500원 두 번째", { key });
    const saved = rowsOf(fx, key).find((t) => t.raw_text === "11월 10일 버스 1500원 두 번째");
    c.ok(/지출 저장했어요/.test(follow.text) && saved?.transaction_date === "2026-11-10" && Number(saved?.amount) === 1500 && saved?.type === "expense"
      && dates(fx, key) === "2026-11-10,2026-11-10,2026-11-11", "E3b 그 예시를 그대로 보내면 11월 10일 1,500원 지출로 저장되고, 옮기려던 11월 11일 기록은 사용자가 지울 때까지 그대로");
  });

  // E4: 예시를 만들 수 없으면(메모에 날짜 말이 있어 파서가 다른 날로 읽음) 방법 문장 없이 사실 두 줄만
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-date-memo";
    await say(fx, "회식 30000", { key });
    for (const t of rowsOf(fx, key)) { t.transaction_date = "2026-11-10"; t.created_at = new Date(Date.now() - 2 * 86400000).toISOString(); }
    clearGuards(); await say(fx, "회식 30000", { key }); clearGuards();
    for (const t of rowsOf(fx, key).filter((row) => row.transaction_date === DAY)) t.memo = "어제 먹은 회식";
    const refused = await say(fx, "수정 01번 날짜 11월 10일", { key });
    c.ok(refused.text === ["01번 기록을 바꾸지 않았어요. 기록은 그대로예요.", "11월 10일 기록 중에 같은 문장·같은 금액으로 저장한 기록이 이미 있어서 바꿀 수 없어요."].join("\n")
      && dates(fx, key) === `2026-11-10,${DAY}`, "E4 예시를 못 만들면(‘11월 10일 어제 먹은 회식 30000원 두 번째’ 는 파서가 11월 11일로 읽음) ‘이 기록을 지우고 …’ 방법 문장 없이 바꾸지 않은 사실과 이유만(후속 2 전: ‘날짜를 넣고 문장 끝에 낱말을’)");
  });

  // 수입: 예시도 수입으로 저장되는 문장
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-income";
    await say(fx, "용돈 50000원 받음", { key });
    age(fx, key, 200); clearGuards();
    const again = await say(fx, "용돈 50000원 받음", { key });
    c.eq(again.text, SINGLE_INCOME, "O-1q 수입이면 ‘같은 수입’ 과 그 문장으로 만든 수입 예시");
    clearGuards();
    await say(fx, "용돈 50000원 받음 두 번째", { key });
    const example = rowsOf(fx, key).find((t) => t.raw_text === "용돈 50000원 받음 두 번째");
    c.ok(example && example.type === "income" && Number(example.amount) === 50000 && /두 번째/.test(String(example.memo || "")), "O-1r 수입 예시 문장은 50,000원 수입·메모 ‘두 번째’로 저장된다");
  });

  // H: 300자 문장 — supabase() 는 오류 글을 ‘Supabase 409: ’ + 본문 앞 500자로 만든다. 인덱스 이름이 잘려도 칸 목록으로 알아본다.
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-long";
    const text = `버스 1500 ${"가".repeat(292)}`;
    await say(fx, text, { key });
    c.ok(text.length === 300 && String(rowsOf(fx, key)[0]?.raw_text || "").length === 300, "O-1s 300자 문장 기록의 raw_text 가 300자");
    age(fx, key, 121); clearGuards();
    const bodies = [];
    fx.state.tap = async ({ response }) => { if (response.status === 409) bodies.push(await response.text()); };
    const again = await say(fx, text, { key });
    fx.state.tap = null;
    const head = String(bodies[0] || "").slice(0, 500);
    c.ok(bodies.length === 1 && !head.includes("transactions_kakao_request_unique_idx") && head.includes("(household_id, source_user_key, transaction_date, type, amount, raw_text)=(") && /"code":"23505"/.test(head), `H1 409 본문 ${String(bodies[0] || "").length}자 — 앞 500자에 인덱스 이름은 없고 23505·칸 목록은 있다`);
    c.ok(again.text === SINGLE_LONG && rowsOf(fx, key).length === 1 && markers(fx) === 0, "O-1t(H2) 인덱스 이름이 잘린 거절도 같은 사실 안내, 290자 이상 문장은 ‘문장 앞에’·예시 없음(표식 0; 후속 2 전: ‘문장 끝에’)");
    clearGuards();
    const tail = await say(fx, `${text} 두 번째`, { key }); clearGuards();
    c.ok(tail.text === SINGLE_LONG && rowsOf(fx, key).length === 1, "L1 끝에 덧붙이면 저장 원문이 300자에서 잘려 같은 문장이라 다시 거절된다(그래서 ‘앞에’ 라고 안내)");
    const front = await say(fx, `또 ${text}`, { key });
    const saved = rowsOf(fx, key).find((t) => String(t.raw_text).startsWith("또 버스 1500"));
    c.ok(/지출 저장했어요/.test(front.text) && saved && Number(saved.amount) === 1500 && saved.type === "expense" && saved.transaction_date === DAY && String(saved.raw_text).length === 300 && rowsOf(fx, key).length === 2,
      "L2 안내대로 문장 앞에 낱말(‘또’)을 붙여 보내면 오늘 1,500원 지출로 저장된다");
  });

  // L3·L4: 별도 구매 추가도 같은 규칙(290자 이상이면 ‘문장 앞에’)
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-separate-long";
    const text = `버스 1500 ${"가".repeat(292)}`;
    await say(fx, text, { key }); clearGuards();
    const prepare = await say(fx, `별도 구매 추가 ${text}`, { key }); clearGuards();
    const confirm = [...prepare.quick, ...prepare.text.split("\n")].find((line) => /^별도 구매 확인 [a-f0-9]{16}$/.test(line)) || "";
    const confirmed = confirm ? await say(fx, confirm, { key }) : { text: "" }; clearGuards();
    c.ok(confirm !== "" && confirmed.text === SEPARATE_LONG && rowsOf(fx, key).length === 1 && markers(fx) === 0, "L3 300자 문장의 별도 구매 확인이 걸리면 ‘문장 앞에 낱말을’·예시 없음(후속 2 전: ‘문장 끝에’), 기록 1건 그대로");
    const front = await say(fx, `또 ${text}`, { key });
    c.ok(/지출 저장했어요/.test(front.text) && rowsOf(fx, key).length === 2 && rowsOf(fx, key).filter((t) => Number(t.amount) === 1500 && t.transaction_date === DAY).length === 2, "L4 안내대로 앞에 낱말을 붙여 보내면 저장(1,500원 두 건)");
  });

  // A: 120초 중복으로 건너뛴 줄 + 인덱스에 걸린 줄이 섞인 글(1:1·단톡방)
  for (const [name, room] of PATHS) await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = `ops-mixed-${room ? "room" : "direct"}`;
    await say(fx, "버스 1500", { key, room }); age(fx, key, 4 * 3600); clearGuards();
    await say(fx, "커피 4500", { key, room }); clearGuards();
    const mixed = await say(fx, "커피 4500\n버스 1500", { key, room });
    c.eq(mixed.text, MIXED, `${name} A1 섞인 글 → ‘새로 저장한 것은 없어요’, 건너뛴 내용(커피)과 걸린 내용(버스)을 나눠 말하고 걸린 것만 다시 보내라고 한다(후속 전: ‘2건은 하나도 저장하지 않았어요’)`);
    c.ok(rowsOf(fx, key).length === 2 && markers(fx) === 0 && liveLocks(fx) === 0, `${name} A2 기록 2건 그대로(커피 1·버스 1), 표식·잠금 0`);
    clearGuards();
    const follow = await say(fx, EXAMPLE, { key, room });
    c.ok(/지출 저장했어요/.test(follow.text) && rowsOf(fx, key).length === 3 && rowsOf(fx, key).filter((t) => /커피/.test(String(t.raw_text || ""))).length === 1, `${name} A3 안내대로 걸린 내용만 낱말을 덧붙여 보내면 저장되고 커피는 한 건 그대로`);
  });

  // F: 수입·지출 섞임(‘기록’), 넷 이상 겹침(‘외 N개’), 겹침 조회 실패(대략 안내)
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-kinds";
    await say(fx, "용돈 50000원 받음", { key }); clearGuards();
    await say(fx, "버스 1500", { key }); age(fx, key, 200); clearGuards();
    const kinds = await say(fx, "용돈 50000원 받음\n버스 1500", { key }); clearGuards();
    c.eq(kinds.text, KINDS, "F1 수입과 지출이 함께 걸리면 ‘같은 기록’ 과 첫 걸린 문장의 예시");
    for (const line of ["김밥 3000", "라면 4000", "우유 1500", "빵 2800", "주스 2000"]) { await say(fx, line, { key }); clearGuards(); }
    age(fx, key, 200);
    const five = await say(fx, "김밥 3000\n라면 4000\n우유 1500\n빵 2800\n주스 2000", { key }); clearGuards();
    c.eq(five.text, FIVE, "F2 다섯 건이 걸리면 앞 세 건과 ‘외 2개’");
    fx.state.hook = ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/transactions" && url.searchParams.get("select") === "transaction_date,type,amount,raw_text"
      ? new Response(JSON.stringify({ code: "QA", message: "lookup down" }), { status: 503, headers: { "content-type": "application/json" } }) : null);
    const lookup = await say(fx, "김밥 3000\n라면 4000", { key });
    fx.state.hook = null;
    c.eq(lookup.text, LOOKUP_FAILED, "F3 겹친 내용을 찾는 조회가 실패하면 ‘그중에 … 있어요’ 와 방법만(예시 없음)");
    c.ok(rowsOf(fx, key).length === 7 && markers(fx) === 0 && liveLocks(fx) === 0, "F4 기록 7건 그대로, 표식·잠금 0");
  });

  // K: 여러 건이 걸리면 ‘걸린 문장마다’, 한 글 안 반복이면 ‘둘 중 하나에만’ — 안내대로 다시 보내면 저장(1:1·단톡방; 단톡방은 멘션을 붙여 보낸다)
  for (const [name, room] of PATHS) await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = `ops-each-${room ? "room" : "direct"}`;
    const at = room ? "@말해가계부 " : "";
    await say(fx, `${at}커피 4500`, { key, room }); clearGuards();
    await say(fx, `${at}버스 1500`, { key, room }); age(fx, key, 200); clearGuards();
    const both = await say(fx, `${at}커피 4500\n버스 1500`, { key, room }); clearGuards();
    c.eq(both.text, ["이번에 보낸 2건은 하나도 저장하지 않았어요.", "같은 날 같은 문장으로 이미 저장한 기록이 있는 내용: ‘커피 4500’, ‘버스 1500’", ADD_EACH("지출", "커피 4500 두 번째")].join("\n"),
      `${name} K1 두 문장이 모두 걸리면 ‘걸린 문장마다’(인용은 문장별, 멘션 없음; 후속 2 전: ‘그 문장 끝에’)`);
    const each = await say(fx, `${at}커피 4500 두 번째\n버스 1500 두 번째`, { key, room }); clearGuards();
    c.ok(/새로 저장 2건/.test(each.text) && rowsOf(fx, key).length === 4 && rowsOf(fx, key).filter((t) => /두 번째$/.test(String(t.raw_text))).length === 2 && markers(fx) === 0, `${name} K2 걸린 문장마다 낱말을 붙여 보내면 두 건 모두 저장`);
    const repeat = await say(fx, `${at}택시 8000\n택시 8000`, { key, room }); clearGuards();
    c.ok(repeat.text === REPEAT && rowsOf(fx, key).length === 4, `${name} K3 한 글 안 반복은 ‘같은 문장 둘 중 하나에만’(아무것도 저장 안 함; 후속 2 전: ‘그 문장 끝에’)`);
    const one = await say(fx, `${at}택시 8000\n택시 8000 두 번째`, { key, room });
    c.ok(/새로 저장 2건/.test(one.text) && rowsOf(fx, key).filter((t) => /^택시 8000/.test(String(t.raw_text))).length === 2 && rowsOf(fx, key).length === 6, `${name} K4 둘 중 하나에만 낱말을 붙여 보내면 택시 두 건 모두 저장`);
  });

  // C: 예시는 걸린 그 문장으로 만든다(‘두 번째’ → ‘세 번째’ …, ‘열 번째’ 다음은 예시 없음)
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-coffee";
    await say(fx, "커피 4500", { key }); age(fx, key, 200); clearGuards();
    const first = await say(fx, "커피 4500", { key }); clearGuards();
    c.eq(first.text, SINGLE_OF("지출", "커피 4500 두 번째"), "C1 ‘커피 4500’ 이 걸리면 예시는 ‘커피 4500 두 번째’(후속 전: 늘 ‘버스 1500 두 번째’)");
    const second = await say(fx, "커피 4500 두 번째", { key });
    const saved = rowsOf(fx, key).find((t) => t.raw_text === "커피 4500 두 번째");
    c.ok(/지출 저장했어요/.test(second.text) && saved && Number(saved.amount) === 4500 && saved.transaction_date === DAY && rowsOf(fx, key).length === 2, "C2 그 예시를 보내면 오늘 4,500원 지출로 저장");
    age(fx, key, 200); clearGuards();
    const plainAgain = await say(fx, "커피 4500", { key }); clearGuards();
    c.eq(plainAgain.text, SINGLE_OF("지출", "커피 4500 두 번째"), "C3a 같은 날 셋째 ‘커피 4500’ — 예시는 원문으로만 만들어(이 경로에 조회를 더하지 않음) 이미 있는 ‘두 번째’ 가 다시 나온다(보내면 아래처럼 ‘세 번째’ 로 이어진다)");
    const third = await say(fx, "커피 4500 두 번째", { key }); clearGuards();
    c.eq(third.text, SINGLE_OF("지출", "커피 4500 세 번째"), "C3 같은 날 세 번째 — ‘두 번째’ 로 끝난 문장이 걸리면 예시는 ‘세 번째’(같은 예시가 되풀이되지 않는다)");
    const fourth = await say(fx, "커피 4500 세 번째", { key });
    c.ok(/지출 저장했어요/.test(fourth.text) && rowsOf(fx, key).length === 3, "C4 ‘세 번째’ 예시도 저장된다");
    clearGuards();
    for (const word of ["아홉", "열"]) { await say(fx, `커피 4500 ${word} 번째`, { key }); clearGuards(); }
    age(fx, key, 200);
    const nine = await say(fx, "커피 4500 아홉 번째", { key }); clearGuards();
    const ten = await say(fx, "커피 4500 열 번째", { key });
    c.ok(nine.text === SINGLE_OF("지출", "커피 4500 열 번째") && ten.text === SINGLE_OF("지출") && rowsOf(fx, key).length === 5, "C5 ‘아홉 번째’ 다음은 ‘열 번째’, ‘열 번째’ 다음은 예시 없이 방법만");
  });

  // C6(후속 2 확인): 예시 확인(parseMultipleTransactions(예시, {}))과 실제 저장 경로가 같은 구분으로 읽는가 — 사용자 수입 분류 키워드가 있는 가계부.
  // 사용자 분류 설정은 분류·결제수단만 바꾸고 구분(수입·지출)은 바꾸지 않는다(동작 고정).
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-custom-category";
    await say(fx, "커피 4500", { key }); clearGuards();
    const hh = rowsOf(fx, key)[0]?.household_id;
    fx.db.accountbook_settings.push({ id: "ops-custom-category-setting", key: `custom_categories:${hh}`, value: JSON.stringify([{ name: "부수입", type: "income", keywords: ["알바"] }]), created_at: "2026-07-01T00:00:00Z" });
    await say(fx, "알바비 50000원 받음", { key }); age(fx, key, 200); clearGuards();
    const again = await say(fx, "알바비 50000원 받음", { key }); clearGuards();
    const example = (again.text.match(/예: ‘([^’]+)’/) || [])[1] || "";
    const sent = await say(fx, example || "(예시 없음)", { key });
    const saved = rowsOf(fx, key).find((t) => t.raw_text === example);
    c.ok(again.text === SINGLE_OF("수입", "알바비 50000원 받음 두 번째") && /수입 저장했어요/.test(sent.text) && saved?.type === "income" && Number(saved?.amount) === 50000 && saved?.transaction_date === DAY && saved?.category === "부수입",
      `C6 사용자 수입 분류(‘알바’ → 부수입) 가계부에서도 예시를 보내면 오늘 50,000원 수입·부수입으로 저장(예시 확인과 저장 경로가 같은 구분) (${saved?.type}/${saved?.category})`);
  });

  // B: 별도 구매 추가·복구가 인덱스에 걸릴 때(1:1·단톡방)
  for (const [name, room] of PATHS) await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = `ops-separate-${room ? "room" : "direct"}`;
    await say(fx, "버스 1500", { key, room }); clearGuards();
    const dup = await say(fx, "버스 1500", { key, room }); clearGuards();
    c.ok([dup.text, ...dup.quick].some((line) => line.includes("별도 구매 추가 버스 1500")), `${name} B0 120초 안 재전송 답은 지금처럼 ‘별도 구매 추가 버스 1500’ 을 권한다(인덱스를 지우기 전에는 아래처럼 거절된다)`);
    const prepare = await say(fx, "별도 구매 추가 버스 1500", { key, room }); clearGuards();
    const confirm = [...prepare.quick, ...prepare.text.split("\n")].find((line) => /^별도 구매 확인 [a-f0-9]{16}$/.test(line)) || "";
    c.ok(confirm !== "" && rowsOf(fx, key).length === 1, `${name} B1 별도 구매 후보와 확인 말(아직 저장 안 함)`);
    const confirmed = await say(fx, confirm, { key, room }); clearGuards();
    c.eq(confirmed.text, SEPARATE, `${name} B2 확인이 인덱스에 걸리면 추가하지 않았고 같은 날 같은 문장은 더 저장되지 않는다고 답한다(후속 전: ‘같은 확인 식별자로만 다시 시도’)`);
    c.ok(rowsOf(fx, key).length === 1 && markers(fx) === 0 && liveLocks(fx) === 0, `${name} B3 기록 1건 그대로, 표식·잠금 0`);
    const repeated = await say(fx, confirm, { key, room }); clearGuards();
    c.ok(repeated.text === SEPARATE && rowsOf(fx, key).length === 1, `${name} B4 같은 확인을 다시 보내도 같은 답(기록 1건)`);
    const follow = await say(fx, EXAMPLE, { key, room });
    c.ok(/지출 저장했어요/.test(follow.text) && rowsOf(fx, key).length === 2, `${name} B5 안내대로 낱말을 덧붙여 보내면 저장`);
  });
  for (const [name, room] of PATHS) await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = `ops-restore-${room ? "room" : "direct"}`;
    await say(fx, "버스 1500", { key, room }); clearGuards();
    const removed = await say(fx, "삭제 01번", { key, room }); clearGuards();
    const resaved = await say(fx, "버스 1500", { key, room }); clearGuards();
    c.ok(/01번 기록을 삭제했어요/.test(removed.text) && /복구 01번/.test(removed.text) && /지출 저장했어요/.test(resaved.text) && rowsOf(fx, key).length === 1, `${name} B6 지운 뒤 같은 문장을 다시 저장(기록 1건)`);
    const restore = await say(fx, "복구", { key, room }); clearGuards();
    c.eq(restore.text, RESTORE, `${name} B7 ‘복구’ 가 인덱스에 걸리면 같은 내용의 기록이 이미 있어 복구하지 않았다고 답하고 다시 보내라고 하지 않는다(후속 전: ‘잠시 후 같은 ‘복구’를 다시’)`);
    c.ok(rowsOf(fx, key).length === 1 && markers(fx) === 0 && liveLocks(fx) === 0, `${name} B8 기록 1건 그대로, 표식·잠금 0`);
    const again = await say(fx, "복구", { key, room });
    c.ok(again.text === RESTORE && rowsOf(fx, key).length === 1, `${name} B9 ‘복구’ 를 다시 보내도 같은 답(기록 1건)`);
  });
  // N: 걸린 기록은 복구 목록에 남아 번호 없는 ‘복구’ 는 늘 그 기록을 고른다 — 번호로 다른 기록이 골라지는 번호만 알린다(실행으로 확인)
  for (const [name, room] of PATHS) await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = `ops-restore-other-${room ? "room" : "direct"}`;
    for (const line of ["버스 1500", "커피 4500", "삭제 02번", "삭제 01번", "버스 1500"]) { await say(fx, line, { key, room }); clearGuards(); }
    const restore = await say(fx, "복구", { key, room }); clearGuards();
    c.eq(restore.text, RESTORE_OTHER("01번 - 버스 / 1,500원 / - / 교통", "‘복구 02번’"), `${name} N1 걸린 ‘복구’ 답에 ‘이 기록은 복구 목록에 남아 있어요. 다른 삭제 기록은 ‘복구 02번’으로’(후속 2 전: 그 줄 없음)`);
    const numbered = await say(fx, "복구 02번", { key, room }); clearGuards();
    c.ok(/기록을 복구했어요/.test(numbered.text) && /커피 \/ 4,500원/.test(numbered.text) && rowsOf(fx, key).length === 2 && rowsOf(fx, key).some((t) => /커피/.test(String(t.raw_text))), `${name} N2 그 번호(‘복구 02번’)로 커피가 되살아난다`);
    const last = await say(fx, "복구", { key, room });
    c.ok(last.text === RESTORE && rowsOf(fx, key).length === 2, `${name} N3 다른 삭제 기록이 없으면 그 줄 없이 예전 답`);
  });
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-restore-shadow";
    // 01 을 두 번 지우면 커피·버스 둘 다 ‘01번’ 이다. 커피를 다시 저장한 뒤 ‘복구 01번’ 도 걸린 커피를 먼저 고른다 → 알릴 번호가 없다.
    for (const line of ["버스 1500", "커피 4500", "삭제 01번", "삭제 01번", "커피 4500"]) { await say(fx, line, { key }); clearGuards(); }
    const restore = await say(fx, "복구", { key }); clearGuards();
    const numbered = await say(fx, "복구 01번", { key });
    const expected = RESTORE_OTHER("01번 - 커피 / 4,500원 / - / 카페/간식", "");
    c.ok(restore.text === expected && numbered.text === expected && rowsOf(fx, key).length === 1, "N4 같은 번호의 앞 기록이 걸린 기록이면 그 번호를 알리지 않는다(‘복구 01번’ 도 같은 답, 기록 1건)");
  });

  // I: 걸린 뒤 대기 표식 정리(DELETE)가 실패하면 — 이 판 전부터 있던 동작(확실한 저장 실패 뒤 정리 실패)을 그대로 고정한다
  await withFx(async (fx) => {
    fx.db.__kakao_request_unique = true;
    const key = "ops-marker";
    await say(fx, "버스 1500", { key }); age(fx, key, 200); clearGuards();
    let failed = 0;
    fx.state.hook = ({ url, method }) => {
      if (method !== "DELETE" || url.pathname !== "/rest/v1/accountbook_settings" || !String(url.searchParams.get("key") || "").includes(":pending_write:") || failed >= 1) return null;
      failed += 1;
      return new Response(JSON.stringify({ code: "QA", message: "delete down" }), { status: 503, headers: { "content-type": "application/json" } });
    };
    const blocked = await say(fx, "버스 1500", { key });
    fx.state.hook = null; clearGuards();
    c.ok(failed === 1 && blocked.text === SINGLE && rowsOf(fx, key).length === 1 && markers(fx) === 1, "I1 정리 DELETE 가 실패해도 답은 같은 사실 안내, 대기 표식 1개가 남는다");
    const next = await say(fx, "점심 12000", { key }); clearGuards();
    c.ok(next.text === PENDING && next.quick.includes("오늘기록") && rowsOf(fx, key).length === 1 && markers(fx) === 1, "I2 다른 문장도 표식이 낡기(10분) 전에는 저장하지 않고 ‘앞서 보낸 기록의 저장 결과를 아직 확인하지 못해’ 로 답한다(이 판 전부터 같은 동작)");
    for (const row of fx.db.accountbook_settings.filter((r) => String(r.key).includes(":pending_write:"))) { const value = JSON.parse(row.value); value.at -= 11 * 60 * 1000; row.value = JSON.stringify(value); }
    const later = await say(fx, "점심 12000", { key });
    c.ok(/지출 저장했어요/.test(later.text) && rowsOf(fx, key).length === 2 && markers(fx) === 0, "I3 표식이 10분을 넘기면 다음 문장이 저장되고 표식은 지워진다");
  });

  // ── O-1 흉내 끔(기본 = 인덱스를 지운 뒤의 목표): 둘째 기록 저장, 120초 안 재전송은 그대로 ──
  for (const [name, room] of PATHS) await withFx(async (fx) => {
    c.ok(fx.db.__kakao_request_unique !== true, `${name} O-1u 픽스처 흉내는 기본 꺼짐`);
    const key = `ops-default-${room ? "room" : "direct"}`;
    await say(fx, "버스 1500", { key, room });
    clearGuards();
    const resend = await say(fx, "버스 1500", { key, room });
    c.ok(/중복 저장 안 함 1건/.test(resend.text) && rowsOf(fx, key).length === 1, `${name} O-1v 기본 상태도 120초 안 재전송은 ‘중복 저장 안 함’`);
    age(fx, key, 121); clearGuards();
    const second = await say(fx, "버스 1500", { key, room });
    c.ok(/지출 저장했어요/.test(second.text) && /02번/.test(second.text) && rowsOf(fx, key).length === 2, `${name} O-1w 기본 상태에서 121초 뒤 같은 문장은 둘째 기록으로 저장`);
  });
});

// ── O-1 픽스처 흉내 자체(가짜 PostgREST 의 409/23505) ──
await withFx(async (fx) => {
  const url = `${fx.env.SUPABASE_URL}/rest/v1/transactions`;
  const headers = { apikey: "qa", authorization: "Bearer qa", "content-type": "application/json", Prefer: "return=representation" };
  const ignore = { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" };
  const row = (id, extra = {}) => ({ id, household_id: "hh-ops-emulation", user_id: "user-ops", source: "kakao_skill", source_user_key: "key-ops", transaction_date: DAY, type: "expense", amount: 1500, raw_text: "버스 1500", memo: "버스", category: "교통", payment_method: "", ...extra });
  const ids = Array.from({ length: 9 }, (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`);
  const send = (rows, h = headers) => fetch(url, { method: "POST", headers: h, body: JSON.stringify(rows) });
  const count = () => fx.db.transactions.filter((t) => t.household_id === "hh-ops-emulation").length;
  fx.db.__kakao_request_unique = true;
  c.ok((await send([row(ids[0])])).ok && count() === 1, "O-1x 흉내 켬: 첫 행 저장");
  const clash = await send([row(ids[1])], ignore);
  const body = await clash.json();
  c.ok(clash.status === 409 && body.code === "23505" && body.message === "duplicate key value violates unique constraint \"transactions_kakao_request_unique_idx\"" && String(body.details).startsWith("Key (household_id, source_user_key, transaction_date, type, amount, raw_text)=(") && count() === 1, "O-1y 같은 칸 여섯 개의 새 id → 실제 PostgREST 처럼 409/23505·인덱스 이름·Key 칸 목록, ignore-duplicates 여도 거절");
  c.ok((await send([row(ids[0])], ignore)).ok && count() === 1, "O-1z 같은 id 재전송(ignore-duplicates)은 거절 없이 건너뜀");
  c.ok((await send([row(ids[2], { raw_text: "택시 8000", amount: 8000 }), row(ids[3], { raw_text: "택시 8000", amount: 8000 })])).status === 409 && count() === 1, "O-1aa 한 번에 보낸 행끼리 같아도 409, 한 행도 저장하지 않음");
  c.ok((await send([row(ids[4], { source: "web" })])).ok && (await send([row(ids[5], { raw_text: null })])).ok && (await send([row(ids[6], { raw_text: null })])).ok && count() === 4, "O-1ab source 가 kakao_skill 이 아니거나 raw_text 가 NULL 이면 인덱스 밖");
  c.ok((await send([row(ids[7], { transaction_date: "2026-11-11" })])).ok, "O-1ac 다른 날은 저장");
  const patch = await fetch(`${url}?id=eq.${ids[7]}`, { method: "PATCH", headers, body: JSON.stringify({ transaction_date: DAY }) });
  c.ok(patch.status === 409 && fx.db.transactions.find((t) => t.id === ids[7])?.transaction_date === "2026-11-11", "O-1ad PATCH 가 같은 날 같은 문장을 만들면 409, 행은 그대로");
  const rpc = await fetch(`${fx.env.SUPABASE_URL}/rest/v1/rpc/accountbook_update_transaction_v227`, { method: "POST", headers, body: JSON.stringify({ p_transaction_id: ids[7], p_household_id: "hh-ops-emulation", p_actor_user_id: null, p_actor_kind: "kakao", p_patch: { transaction_date: DAY } }) });
  c.ok(rpc.status === 409 && fx.db.transactions.find((t) => t.id === ids[7])?.transaction_date === "2026-11-11", "O-1ae 감사 수정 함수의 UPDATE 도 409, 행은 그대로");
  fx.db.__kakao_request_unique = false;
  c.ok((await send([row(ids[8])])).ok && count() === 6, "O-1af 흉내 끔: 같은 칸의 새 id 도 저장(지금까지 검사들의 동작)");
});

// ── G 웹 수정·되돌리기가 인덱스에 걸릴 때(흉내 켬) ──
const follow = async (fx, location) => { let shown = await page(fx, location); for (let i = 0; i < 4 && shown.location; i += 1) shown = await page(fx, shown.location); return shown; };
await withClock(DAY, () => withFx(async (fx) => {
  fx.db.__kakao_request_unique = true;
  const key = "ops-web-key";
  const base = { household_id: "house-home", user_id: "user-bin", source: "kakao_skill", source_user_key: key, type: "expense", amount: 1500, raw_text: "버스 1500", memo: "버스", category: "교통", payment_method: "", created_at: "2026-11-11T03:00:00.000Z" };
  const [older, newer, again] = ["a001", "a002", "a003"].map((tail) => `00000000-0000-4000-8000-00000000${tail}`);
  fx.db.transactions.push({ ...base, id: older, transaction_date: "2026-11-11" }, { ...base, id: newer, transaction_date: DAY });
  const form = (extra = {}) => ({ id: newer, household_id: "house-home", month: "2026-11", transaction_date: "2026-11-11", amount: "1500", type: "expense", memo: "버스", category: "교통", payment_method: "", ...extra });
  const mine = await post(fx, "/my/update", form());
  const minePage = await follow(fx, mine.location);
  c.ok(mine.status === 303 && mine.decoded.includes("err=record_same_kakao_text") && minePage.html.includes(WEB_SAME) && !minePage.html.includes("새로고침 후 다시 시도"), "G1 웹 ‘내 기록’ 수정이 걸리면 같은 카카오 기록이 있어 바꾸지 못했다고 보인다(후속 전: ‘새로고침 후 다시 시도’)");
  const legacy = await post(fx, "/admin/update", form({ return_to: "/app?month=2026-11&household_id=house-home" }));
  const legacyPage = await follow(fx, legacy.location);
  c.ok(legacy.decoded.includes("err=record_same_kakao_text") && legacyPage.html.includes(WEB_SAME), "G2 가계부 화면(/admin/update) 수정도 같은 안내");
  c.eq(dates(fx, key), `2026-11-11,${DAY}`, "G3 웹 수정이 거절되면 기록 그대로");
  const removed = await post(fx, "/admin/delete", { id: newer, household_id: "house-home", month: "2026-11", return_to: "/app?month=2026-11&household_id=house-home" }, { accept: "application/json" });
  let location = removed.location;
  try { location = JSON.parse(removed.text).location || location; } catch (_) {}
  const ticket = new URL(location || "/", BASE).searchParams.get("restore") || "";
  fx.db.transactions.push({ ...base, id: again, transaction_date: DAY, created_at: new Date().toISOString() });
  const restored = await post(fx, "/my/restore", { ticket, month: "2026-11", return_to: "/app?month=2026-11&household_id=house-home" });
  const restoredPage = await follow(fx, restored.location);
  c.ok(ticket !== "" && restored.decoded.includes("err=restore_failed") && restoredPage.html.includes(WEB_RESTORE_FAILED) && !fx.db.transactions.some((t) => t.id === newer) && dates(fx, key) === `2026-11-11,${DAY}`, "G4 웹 되돌리기가 걸리면 지금 문구 그대로(‘되살리지 못했습니다 … 기록이 있는지 확인’ — 다시 하라고 하지 않아 바꾸지 않음), 기록 그대로");
}, { auditDeletes: true }));

// G5~G7(후속 2): 관리자 API·일괄 수정이 같은 인덱스에 걸릴 때. 운영 accountbook_bulk_transactions_v227 는 행마다 accountbook_update_transaction_v227 를
// 부르고 예외 처리가 없어(2026-11-10 운영 스키마 덤프) 23505 가 그대로 409 로 나온다 — 픽스처에 그 함수가 없어 같은 규칙으로 흉내 낸다(한 트랜잭션).
const uniqueKeyOf = (row) => (row && row.source === "kakao_skill" && row.source_user_key != null && row.raw_text != null
  ? JSON.stringify([String(row.household_id), String(row.source_user_key), String(row.transaction_date), String(row.type), Number(row.amount), String(row.raw_text)]) : null);
const bulkRpcHook = (fx) => ({ url, init }) => {
  if (url.pathname !== "/rest/v1/rpc/accountbook_bulk_transactions_v227") return null;
  const body = JSON.parse(String(init?.body || "{}"));
  const ids = (body.p_transaction_ids || []).map(String);
  const targets = fx.db.transactions.filter((t) => ids.includes(String(t.id)));
  const seen = new Set(fx.db.transactions.filter((t) => !ids.includes(String(t.id))).map(uniqueKeyOf).filter(Boolean));
  for (const row of targets.map((t) => ({ ...t, ...(body.p_patch || {}) }))) {
    const k = uniqueKeyOf(row);
    if (k && seen.has(k)) {
      return new Response(JSON.stringify({ code: "23505", details: `Key (household_id, source_user_key, transaction_date, type, amount, raw_text)=(${[row.household_id, row.source_user_key, row.transaction_date, row.type, row.amount, row.raw_text].join(", ")}) already exists.`, hint: null, message: "duplicate key value violates unique constraint \"transactions_kakao_request_unique_idx\"" }), { status: 409, headers: { "content-type": "application/json" } });
    }
    if (k) seen.add(k);
  }
  for (const t of targets) Object.assign(t, body.p_patch || {});
  return new Response(JSON.stringify({ processed: ids.length, deleted: false }), { status: 200, headers: { "content-type": "application/json" } });
};
const webRows = (fx, key) => {
  const base = { household_id: "house-home", user_id: "user-bin", source: "kakao_skill", source_user_key: key, type: "expense", amount: 1500, raw_text: "버스 1500", memo: "버스", category: "교통", payment_method: "", created_at: "2026-11-11T03:00:00.000Z" };
  const older = "00000000-0000-4000-8000-00000000d001", newer = "00000000-0000-4000-8000-00000000d002";
  fx.db.transactions.push({ ...base, id: older, transaction_date: "2026-11-11" }, { ...base, id: newer, transaction_date: DAY });
  return newer;
};
await withClock(DAY, () => withFx(async (fx) => {
  fx.db.__kakao_request_unique = true;
  const key = "ops-api-key";
  const newer = webRows(fx, key);
  fx.env.ADMIN_API_TOKEN = "qa-admin-api-ops-v229119";
  const patch = async (path, body) => {
    const response = await app.fetch(new Request(`${BASE}${path}`, { method: "PATCH", headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) }), fx.env, { waitUntil() {}, passThroughOnException() {} });
    let json = null;
    try { json = await response.json(); } catch (_) {}
    return { status: response.status, json };
  };
  const single = await patch(`/api/transactions/${newer}`, { transaction_date: "2026-11-11" });
  c.ok(single.status === 409 && single.json?.error === "record_same_kakao_text" && single.json?.message === WEB_SAME && dates(fx, key) === `2026-11-11,${DAY}`, `G5 관리자 API 한 건 수정이 걸리면 409·record_same_kakao_text·웹과 같은 문장, 기록 그대로(후속 2 전: 500 ‘잠시 후 다시 시도’) (${single.status} ${single.json?.error})`);
  fx.state.hook = bulkRpcHook(fx);
  const batch = await patch("/api/transactions/batch", { ids: [newer], transaction_date: "2026-11-11" });
  fx.state.hook = null;
  c.ok(batch.status === 409 && batch.json?.error === "record_same_kakao_text" && batch.json?.message === WEB_SAME && dates(fx, key) === `2026-11-11,${DAY}`, `G6 관리자 API 일괄 수정도 같은 409·문장, 기록 그대로(후속 2 전: 500) (${batch.status} ${batch.json?.error})`);
  const fine = await patch(`/api/transactions/${newer}`, { amount: 1600 });
  c.ok(fine.status === 200 && fine.json?.ok === true && fx.db.transactions.find((t) => t.id === newer)?.amount === 1600, "G6b 걸리지 않는 API 수정은 그대로 된다");
}));
await withClock(DAY, () => withFx(async (fx) => {
  fx.db.__kakao_request_unique = true;
  const key = "ops-admin-bulk-key";
  const newer = webRows(fx, key);
  fx.env.ADMIN_SESSION_SECRET = "qa-admin-session-ops-v229119";
  fx.env.ADMIN_PASSWORD = "qa-admin-pass-ops-v229119";
  const login = await app.fetch(new Request(`${BASE}/login`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": "198.51.100.119" }, body: new URLSearchParams({ password: fx.env.ADMIN_PASSWORD, return_to: "/?legacy=1" }).toString() }), fx.env, { waitUntil() {}, passThroughOnException() {} });
  const admin = ((login.headers.get("set-cookie") || "").match(/ab_admin=[^;]+/) || [""])[0];
  fx.state.hook = bulkRpcHook(fx);
  const res = await post(fx, "/admin/bulk", new URLSearchParams([["ids", newer], ["household_id", "house-home"], ["month", "2026-11"], ["bulk_transaction_date", "2026-11-11"]]), { cookie: admin });
  fx.state.hook = null;
  const err = new URL(res.location || "/", BASE).searchParams.get("err") || "";
  c.ok(admin !== "" && res.status === 303 && err === "선택한 거래내역을 수정하지 못했습니다. 기존 기록은 유지됩니다." && dates(fx, key) === `2026-11-11,${DAY}`, "G7 관리자 화면 일괄 수정(/admin/bulk)은 지금 문구 그대로(‘수정하지 못했습니다. 기존 기록은 유지됩니다’ — 사실이고 다시 하라고 하지 않아 바꾸지 않음), 기록 그대로");
}));

// ── O-3 예약 실행 예산 CRON_DB_CALL_BUDGET ──
const pad = (n, w = 4) => String(n).padStart(w, "0");
async function cronRun(budget, { households, tx = 0, rules = 0, day }) {
  return withFx(async (fx) => {
    if (budget !== undefined) fx.env.CRON_DB_CALL_BUDGET = budget;
    const created = "2026-10-01T00:00:00.000Z";
    fx.db.accountbook_recurring = [];
    for (let i = 0; i < households; i += 1) {
      const hid = `hh-cron-${pad(i)}`, uid = `u-cron-${pad(i)}`;
      fx.db.users.push({ id: uid, kakao_user_key: `kakao_login:8${pad(i, 6)}`, nickname: `사용자${i}`, created_at: created });
      fx.db.households.push({ id: hid, name: `가계부${i}`, invite_code: `OPS${pad(i, 5)}`, created_at: created });
      fx.db.household_members.push({ household_id: hid, user_id: uid, role: "owner", created_at: created });
      fx.db.accountbook_settings.push({ id: `pref-ops-${i}`, key: `free_report_preference:${hid}`, value: JSON.stringify({ household_id: hid, household_name: `가계부${i}`, enabled: true, weekly: true, monthly: true }), created_at: created });
      for (let k = 0; k < tx; k += 1) {
        const date = `2026-11-${String(1 + (k % 20)).padStart(2, "0")}`;
        fx.db.transactions.push({ id: `tx-ops-${i}-${k}`, household_id: hid, user_id: uid, transaction_date: date, type: "expense", amount: 1000 + k, category: "식비", memo: `m${k}`, payment_method: "카드", source: "kakao", raw_text: `m${k} ${1000 + k}`, created_at: `${date}T03:00:00.000Z` });
      }
      for (let r = 0; r < rules; r += 1) fx.db.accountbook_recurring.push({ id: `rec-ops-${i}-${r}`, household_id: hid, type: "expense", amount: 10000 + r, category: "주거/관리", memo: `정기${r}`, payment_method: "계좌이체", day_of_month: Number(day.slice(8, 10)), user_id: uid, is_active: true, last_applied_month: "2026-10", created_at: created });
    }
    const previous = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    fx.db.accountbook_settings.push({ id: "state-ops", key: "cron_recurring_state_v22976", value: JSON.stringify({ checked_date: previous, pending_month: "" }), created_at: created });
    fx.state.calls = 0;
    const jobs = [];
    await withClock(day, async () => {
      await app.scheduled({ scheduledTime: Date.parse(`${day}T00:10:00Z`), cron: "10 0 * * *" }, fx.env, { waitUntil(job) { jobs.push(job); } });
      await Promise.allSettled(jobs);
    });
    const log = JSON.parse(fx.db.accountbook_settings.find((r) => r.key === "cron_run_log_v22978")?.value || "[]")[0] || {};
    return { calls: fx.state.calls, status: log.status, errors: (log.errors || []).join(","), recurring: log.recurring || {}, reports: log.reports || {}, locks: liveLocks(fx), recurringRows: fx.db.transactions.filter((t) => t.source === "recurring_auto").length, dbBudget: log.db_budget };
  });
}
const shape = (r) => JSON.stringify([r.calls, r.status, r.reports.generated, r.reports.pending_scopes, r.recurring.applied, r.recurring.remaining]);

const reportsDefault = await cronRun(undefined, { households: 60, tx: 30, day: "2026-11-22" });
c.ok(reportsDefault.calls <= 50 && reportsDefault.reports.generated > 0 && reportsDefault.reports.generated < 60 && reportsDefault.locks === 0 && !reportsDefault.errors, `O-3a 변수 없음: 리포트 켠 가계부 60개 중 ${reportsDefault.reports.generated}개, 호출 ${reportsDefault.calls} ≤ 50(지금 그대로), 잠금 0`);
const reports400 = await cronRun("400", { households: 60, tx: 30, day: "2026-11-22" });
c.ok(reports400.reports.generated === 60 && reports400.reports.generated > reportsDefault.reports.generated && reports400.calls <= 400 && reports400.status === "ok" && reports400.locks === 0, `O-3b CRON_DB_CALL_BUDGET=400: 한 실행에 60개 모두(${reports400.reports.generated}), 호출 ${reports400.calls} ≤ 400, 잠금 0(옛 코드: 변수 무시 = 기본과 같음)`);
const cronMark = lastEvent();
c.eq(shape(await cronRun("50", { households: 60, tx: 30, day: "2026-11-22" })), shape(reportsDefault), "O-3c CRON_DB_CALL_BUDGET=50 은 변수 없음과 같다");
const CRON_BAD = ["49", "901", "5000", "abc", "", "120.5", "-100"];
const badBudgets = [];
for (const bad of CRON_BAD) {
  const run = await cronRun(bad, { households: 60, tx: 30, day: "2026-11-22" });
  badBudgets.push(run.dbBudget);
  c.eq(shape(run), shape(reportsDefault), `O-3d 범위 밖·숫자 아님 CRON_DB_CALL_BUDGET=${JSON.stringify(bad)} → 50 과 같은 결과`);
}
const cronEvents = budgetEventsSince(cronMark);
c.eq(cronEvents.map((e) => `${e.severity}|${e.path}|${e.method}|${e.detail}`).sort().join("\n"), CRON_BAD.filter(Boolean).map((v) => `warn|/config|SCHEDULED|CRON_DB_CALL_BUDGET=${v} default:50`).sort().join("\n"), "D1 예약 실행: 잘못된 값마다 운영 이벤트 db_call_budget_invalid(warn) 한 번, 50 과 빈 값은 이벤트 없음(후속 전: 이벤트 없음)");
const reports900 = await cronRun("900", { households: 60, tx: 30, day: "2026-11-22" });
c.ok(reports900.reports.generated === 60 && reports900.calls <= 900 && reports900.status === "ok", "O-3e 900(상한)도 받는다");
// 후속 2: 실행 기록(cron_run_log_v22978)에 그 실행이 실제로 쓴 상한 db_budget — 11-19 변수를 넣은 다음 날 기록으로 들어갔는지 본다.
c.eq(JSON.stringify([reportsDefault.dbBudget, reports400.dbBudget, reports900.dbBudget, ...badBudgets]), JSON.stringify([50, 400, 900, ...CRON_BAD.map(() => 50)]), "O-3i 실행 기록 db_budget = 그 실행이 쓴 상한(변수 없음 50·400·900, 범위 밖·숫자 아님은 50)(후속 2 전: 칸 없음)");
const rowsDefault = await cronRun(undefined, { households: 20, tx: 1000, day: "2026-11-22" });
const rows400 = await cronRun("400", { households: 20, tx: 1000, day: "2026-11-22" });
c.ok(rowsDefault.reports.generated < 20 && rows400.reports.generated === 20 && rows400.calls <= 400, `O-3f 읽는 기록 행 상한(2000)도 같은 비율로 커진다: 기본 ${rowsDefault.reports.generated}개 → 400 에서 20개 모두`);
const recurringDefault = await cronRun(undefined, { households: 10, rules: 30, day: "2026-11-23" });
const recurring400 = await cronRun("400", { households: 10, rules: 30, day: "2026-11-23" });
c.ok(recurringDefault.calls <= 50 && recurringDefault.recurring.remaining > 0 && recurringDefault.recurring.partial === true, `O-3g 변수 없음: 그날 정기 규칙 300개 중 ${recurringDefault.recurring.applied}개(단계 몫 30회), 나머지는 다음 실행`);
c.ok(recurring400.recurring.applied === 300 && recurring400.recurring.remaining === 0 && recurring400.recurringRows === 300 && recurring400.calls <= 400 && recurring400.locks === 0, `O-3h CRON_DB_CALL_BUDGET=400: 정기 규칙 300개를 한 실행에(호출 ${recurring400.calls} ≤ 400), 잠금 0`);

// ── O-5 요청 예산 DB_CALL_BUDGET: 1:1 처음 보는 사람의 첫 기록에 조회 전송 오류 2회(→ 재시도)를 끼운다 ──
async function firstRecord(budget, drops, appUserId, { next = "" } = {}) {
  return withClock(DAY, () => withFx(async (fx) => {
    Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1", NLU_METRICS_ENABLED: "1", CANONICAL_REDIRECT: "1" });
    if (budget !== undefined) fx.env.DB_CALL_BUDGET = budget;
    let seen = 0, dropped = 0;
    fx.state.hook = ({ method }) => {
      seen += 1;
      if (drops && method === "GET" && seen >= 30 && dropped < drops) { dropped += 1; throw new TypeError("simulated transport failure"); }
      return null;
    };
    const key = `ops-first-${appUserId}`;
    const r = await say(fx, "점심 12000", { key, properties: { appUserId } });
    const result = { before: r.before, total: r.total, dropped, saved: fx.db.transactions.filter((t) => /점심/.test(String(t.raw_text || ""))).length, markers: markers(fx), locks: liveLocks(fx), text: r.text };
    if (next) {
      fx.state.hook = null; clearGuards();
      const n = await say(fx, next, { key, properties: { appUserId } });
      Object.assign(result, { nextText: n.text, nextMarkers: markers(fx), nextLocks: liveLocks(fx), nextSaved: fx.db.transactions.filter((t) => t.raw_text === next).length });
    }
    return result;
  }));
}
await firstRecord(undefined, 0, "991000300"); // 격리 공간의 한 번만 하는 확인을 먼저 끝내 둔다(비교 대상끼리 같은 조건)
const firstDefault = await firstRecord(undefined, 2, "991000302");
c.ok(firstDefault.dropped === 2 && firstDefault.saved === 1 && firstDefault.total <= 50 && firstDefault.markers === 1 && firstDefault.locks === 0, `O-5a 변수 없음: 첫 기록 + 재시도 2회 = 호출 ${firstDefault.total} ≤ 50, 기록 저장, 답 뒤 정리가 예산에 막혀 대기 표식 ${firstDefault.markers}개가 남는다(이 판 전 9a646eb 도 같음)`);
const nextDefault = await firstRecord(undefined, 2, "991000302", { next: "커피 4500" });
c.ok(nextDefault.markers === 1 && /지출 저장했어요/.test(nextDefault.nextText) && nextDefault.nextSaved === 1 && nextDefault.nextMarkers === 0 && nextDefault.nextLocks === 0, "O-5a2 남은 표식은 저장이 확인된 표식이라 다음 말(‘커피 4500’)이 확인·정리하고 그 말도 저장된다");
const first200 = await firstRecord("200", 2, "991000302");
c.ok(first200.saved === 1 && first200.markers === 0 && first200.locks === 0 && first200.total <= 200, `O-5b DB_CALL_BUDGET=200: 재시도 2회를 끼워도 끝까지(호출 ${first200.total}, 대기 표식 0·잠금 0; 옛 코드: 50 에서 막혀 표식이 남음)`);
const fresh200 = await firstRecord("200", 0, "991000300");
c.ok(fresh200.saved === 1 && fresh200.markers === 0 && fresh200.locks === 0, "O-5c DB_CALL_BUDGET=200: 재시도 없는 첫 기록도 답 뒤 정리까지 끝난다");
const view = (r) => JSON.stringify([r.before, r.total, r.saved, r.markers, r.locks, r.text]);
for (const bad of ["49", "901", "abc", "", "12.5"]) {
  c.eq(view(await firstRecord(bad, 2, "991000302")), view(firstDefault), `O-5d 범위 밖·숫자 아님 DB_CALL_BUDGET=${JSON.stringify(bad)} → 50 과 같은 결과`);
}
c.eq(view(await firstRecord("50", 2, "991000302")), view(firstDefault), "O-5e DB_CALL_BUDGET=50 은 변수 없음과 같다");

// D: 요청 예산 변수의 잘못된 값은 격리 공간마다 이름=값 한 번만 운영 이벤트(없음·빈 값은 이벤트 없음, 원값은 40자까지)
await withClock(DAY, () => withFx(async (fx) => {
  let mark = lastEvent();
  delete fx.env.DB_CALL_BUDGET;
  await say(fx, "도움말", { key: "ops-budget-event" });
  fx.env.DB_CALL_BUDGET = "";
  await say(fx, "도움말", { key: "ops-budget-event" });
  c.eq(budgetEventsSince(mark).length, 0, "D2 변수가 없거나 빈 값이면 이벤트 없음");
  mark = lastEvent();
  fx.env.DB_CALL_BUDGET = "1000";
  await say(fx, "도움말", { key: "ops-budget-event" });
  await say(fx, "도움말", { key: "ops-budget-event" });
  const once = budgetEventsSince(mark);
  c.ok(once.length === 1 && once[0].severity === "warn" && once[0].path === "/config" && once[0].method === "FETCH" && once[0].detail === "DB_CALL_BUDGET=1000 default:50", `D3 DB_CALL_BUDGET=1000 → 요청 두 번에 이벤트 한 번(warn, ‘DB_CALL_BUDGET=1000 default:50’; 받은 ${once.length}개)`);
  mark = lastEvent();
  fx.env.DB_CALL_BUDGET = "x".repeat(100);
  await say(fx, "도움말", { key: "ops-budget-event" });
  const long = budgetEventsSince(mark);
  c.ok(long.length === 1 && long[0].detail === `DB_CALL_BUDGET=${"x".repeat(40)} default:50`, "D4 이벤트에 적는 원값은 40자까지");
}));

// ── O-1 검토용 SQL ──
const sqlPath = "../migrations/V22_9_119_DROP_KAKAO_REQUEST_UNIQUE_REVIEW_ONLY.sql";
c.ok(existsSync(new URL(sqlPath, import.meta.url)), "O-1ag 검토용 SQL 파일이 있다");
const sql = read(sqlPath);
const CREATE = "CREATE UNIQUE INDEX transactions_kakao_request_unique_idx ON public.transactions USING btree (household_id, source_user_key, transaction_date, type, amount, raw_text) WHERE ((source = 'kakao_skill'::text) AND (source_user_key IS NOT NULL) AND (raw_text IS NOT NULL));";
const raiseAt = sql.indexOf("DO $review_only$ BEGIN RAISE EXCEPTION 'v229119_review_only_");
const dropAt = sql.indexOf("\ndrop index if exists public.transactions_kakao_request_unique_idx;\n");
c.ok(sql.startsWith("-- 실행 금지(DO NOT RUN)") && raiseAt > 0 && dropAt > raiseAt && sql.indexOf("BEGIN;") < raiseAt && sql.indexOf("COMMIT;") > dropAt, "O-1ah 머리 경고·BEGIN 뒤 RAISE(검토용 잠금)·본문 drop index if exists·COMMIT 순서");
c.ok(sql.includes(`--   ${CREATE}`), "O-1ai 되돌리는 CREATE 문은 운영 스키마 덤프의 정의 그대로(주석)");
c.ok(["메시지 잠금", "대기 표식", "고정 UUID", "120초"].every((word) => sql.includes(word)) && sql.includes("사용자가 이 일을 직접 지목한 뒤에만") && sql.includes("적용 전 확인") && sql.includes("적용 뒤 확인"), "O-1aj 앱의 재전송 방어 네 가지·적용 조건·적용 전후 확인 질의를 적었다");
c.ok((sql.match(/^\s*(drop|create|alter|delete|update|insert|truncate|grant|revoke)\b/gim) || []).map((s) => s.trim().toLowerCase()).join(",") === "drop", "O-1ak 실행되는 바꾸는 문장은 drop index 하나뿐(되돌리기·확인은 주석이거나 읽기)");

// ── O-2 백업 절차 문서 ──
const runbook = read("../docs/BACKUP_RECOVERY_RUNBOOK.md");
for (const word of ["pg_dump", "PostgreSQL 17", "Session pooler", "pgpass.conf", "11-dump-auto.ps1", "12-restore-auto.ps1", "13-compare-auto.ps1", "20-daily-dump.ps1", "REGISTER-DAILY-DUMP.md", "2026-11-05", "2026-11-10", "2026-11-19", "relacl", "proacl", "pg_default_acl", "relrowsecurity", "자동 백업이 없다", "14벌", "저장소 밖", "새 빈 프로젝트"]) {
  c.ok(runbook.includes(word), `O-2a 백업 절차 문서에 ‘${word}’`);
}
c.ok(!/계획을 준비했으며 실제 dump/.test(runbook), "O-2b 옛 ‘계획만 준비’ 문장은 실제 절차로 바뀌었다");
c.ok(!/eyJ[A-Za-z0-9_-]{12,}|sb_secret_|sb_publishable_|postgres(?:ql)?:\/\/[^\s]*:[^\s]*@|password\s*=|pooler\.supabase\.com/i.test(runbook), "O-2c 문서에 키·비밀번호·접속 URI·pooler 주소가 없다");
c.ok((runbook.match(/\b[a-z]{20}\b/g) || []).every((ref) => ref === "jqzmpzdqvmzkxznnylkp"), "O-2d 프로젝트 ref 는 이미 문서에 있는 서울 ref 만");
// J: 문서의 전제 — 매일 덤프의 ‘20% 넘게 줄면 지우지 않음’ 은 스크립트(20-daily-dump.ps1) 비교식 그대로, Storage·Auth 미사용은 코드로 확인
c.ok(runbook.includes("새 값 < 직전 값 × 0.8") && runbook.includes("직전 매일 덤프에서 5행 이상인 표만") && runbook.includes("첫 매일 덤프는 견주지 않는다"), "J1 ‘20% 넘게 줄면’ 을 스크립트 비교식(새 값 < 직전 값 × 0.8, 직전 매일 덤프 5행 이상인 표만, 첫 매일 덤프 제외)으로 적었다");
c.ok(runbook.includes("`accountbook_meme_cards`") && runbook.includes("SVG"), "J2 소비 카드 이미지도 파일이 아니라 요청 때마다 그리는 SVG(공유 카드는 accountbook_meme_cards 행)라고 적었다");
const moduleFiles = readdirSync(new URL("../src/modules/", import.meta.url), { recursive: true }).map((name) => String(name).replace(/\\/g, "/")).filter((name) => name.endsWith(".js"));
const storageCallers = moduleFiles.filter((name) => /\/(?:storage|auth)\/v1\b/.test(read(`../src/modules/${name}`)));
c.ok(moduleFiles.length > 100 && storageCallers.length === 0, `J3 src/modules ${moduleFiles.length}개 파일에 Supabase Storage·Auth 호출(storage/v1·auth/v1)이 없다(문서 전제)`);

c.done();
