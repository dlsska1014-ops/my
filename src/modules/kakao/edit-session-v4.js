// @build:imports-start
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { SESSION_TTL_MS } from "./edit-state-machine.js";
import { getKakaoBotGroupKey } from "./group-links-first-record.js";
import { stableShortHash } from "./identity-chat-first.js";
import { supabase } from "../data/supabase-client.js";
import { hasDateHint } from "../nlu/transaction-parser.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { extractDate, formatDate, nowKstDate } from "../nlu/date-payment.js";
import { numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function kakaoEditConversationScope(payload = {}) {
  return getKakaoBotGroupKey(payload) || "direct";
}

// 세션 키는 방(단톡방 또는 1:1)과 카카오 사용자 조합. 같은 방의 다른 가족이
// 동시에 다른 항목을 수정해도 세션이 충돌하지 않는다.
function kakaoEditSessionKeyV4(kakaoUserKey = "", payload = {}) {
  return `kakao_edit_v4:${stableShortHash(kakaoEditConversationScope(payload))}:${String(kakaoUserKey || "").slice(0, 120)}`;
}

// 반복 가드(checkKakaoRepeatGuard)가 세션 중 입력을 삼키지 않도록 하는
// 인메모리 힌트. 가드 맵과 같은 isolate 수명을 가지므로 신뢰 수준이 동일하다.
const AB_KAKAO_EDIT_SESSION_HINTS = new Map();

function kakaoEditSessionHintKey(kakaoUserKey = "", payload = {}) {
  return `${String(kakaoUserKey || "").slice(0, 80)}|${stableShortHash(kakaoEditConversationScope(payload))}`;
}

function hasKakaoEditSessionHint(kakaoUserKey = "", payload = {}) {
  const at = AB_KAKAO_EDIT_SESSION_HINTS.get(kakaoEditSessionHintKey(kakaoUserKey, payload)) || 0;
  return !!at && Date.now() - at < SESSION_TTL_MS + 60 * 1000;
}

async function getKakaoEditSessionV4(env, kakaoUserKey = "", payload = {}) {
  // Failed state reads must not reroute a numeric edit reply into a new transaction.
  const raw = await getSettingValueStrict(env, kakaoEditSessionKeyV4(kakaoUserKey, payload));
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || !obj.entryNo || !obj.entryId || !obj.step) return null;
    AB_KAKAO_EDIT_SESSION_HINTS.set(kakaoEditSessionHintKey(kakaoUserKey, payload), Date.now());
    return obj;
  } catch (err) {
    return null;
  }
}

// I6: reply 전송과 세션 저장은 원자적 쌍 — 저장 실패를 조용히 삼키면
// lastBotMsg·repeatCount가 무력화되어 루프가 재발하므로 여기서는 throw를 허용한다.
async function saveKakaoEditSessionV4(env, kakaoUserKey = "", payload = {}, session = null) {
  const hintKey = kakaoEditSessionHintKey(kakaoUserKey, payload);
  if (session) AB_KAKAO_EDIT_SESSION_HINTS.set(hintKey, Date.now());
  else AB_KAKAO_EDIT_SESSION_HINTS.delete(hintKey);
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: kakaoEditSessionKeyV4(kakaoUserKey, payload), value: session ? JSON.stringify(session) : "" }),
  });
}

function kakaoEditUndoKeyV4(kakaoUserKey = "", payload = {}) {
  return `kakao_edit_undo_v4:${stableShortHash(kakaoEditConversationScope(payload))}:${String(kakaoUserKey || "").slice(0, 120)}`;
}

const KAKAO_EDIT_UNDO_TTL_MS = 24 * 60 * 60 * 1000;
// 삭제할 때마다 "복구 NN번"이라고 안내하므로, 여러 건을 지운 사람은 안내받은 번호를
// 하나씩 되돌릴 수 있다고 믿는다. 버퍼가 한 칸이면 두 번째 삭제가 첫 번째를 덮어써
// 첫 기록이 안내와 달리 영영 복구되지 않는다. 최근 삭제분을 쌓아 둔다.
const KAKAO_EDIT_UNDO_MAX = 10;

// 옛 버퍼는 `{ row, seq }` 한 건이었다. 배포 직후에도 그 값이 남아 있으므로 함께 읽는다.
function kakaoEditUndoItemsV4(obj) {
  if (!obj) return [];
  if (Array.isArray(obj.items)) return obj.items.filter((item) => item?.row?.id);
  return obj?.row?.id ? [{ row: obj.row, seq: Number(obj.seq || 0), expires_at: Number(obj.expires_at || 0) }] : [];
}

async function readKakaoEditUndoItemsV4(env, kakaoUserKey = "", payload = {}) {
  try {
    const raw = await getSettingValue(env, kakaoEditUndoKeyV4(kakaoUserKey, payload));
    if (!raw) return [];
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    const now = Date.now();
    return kakaoEditUndoItemsV4(obj).filter((item) => {
      const expires = Number(item.expires_at || obj?.expires_at || 0);
      return !expires || now <= expires;
    });
  } catch (err) {
    return [];
  }
}

async function writeKakaoEditUndoItemsV4(env, kakaoUserKey = "", payload = {}, items = []) {
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      key: kakaoEditUndoKeyV4(kakaoUserKey, payload),
      value: items.length ? JSON.stringify({ items, expires_at: Date.now() + KAKAO_EDIT_UNDO_TTL_MS }) : "",
    }),
  });
}

async function saveKakaoEditUndoV4(env, kakaoUserKey = "", payload = {}, data = {}) {
  // 복구 버퍼 저장이 실패한 상태에서 삭제를 진행하면 사용자가 안내받은
  // 되돌리기를 실행할 수 없다. 호출자까지 오류를 전달해 삭제 자체를 중단한다.
  const previous = await readKakaoEditUndoItemsV4(env, kakaoUserKey, payload);
  const entry = { row: data.row, seq: Number(data.seq || 0), expires_at: Date.now() + KAKAO_EDIT_UNDO_TTL_MS };
  // 같은 기록을 두 번 담지 않는다. 나머지는 최근 삭제가 앞에 오도록 쌓는다.
  const items = [entry, ...previous.filter((item) => String(item?.row?.id || "") !== String(entry.row?.id || ""))].slice(0, KAKAO_EDIT_UNDO_MAX);
  await writeKakaoEditUndoItemsV4(env, kakaoUserKey, payload, items);
}

// 번호가 겹치면 가장 최근에 지운 것부터 되돌린다. 지운 순서의 역순이 사용자가 기대하는 순서다.
async function takeKakaoEditUndoV4(env, kakaoUserKey = "", payload = {}, seq = 0) {
  const items = await readKakaoEditUndoItemsV4(env, kakaoUserKey, payload);
  if (!items.length) return null;
  const hit = seq ? items.find((item) => Number(item.seq || 0) === Number(seq)) : items[0];
  return hit || null;
}

// 복구가 확인된 한 건만 버퍼에서 뺀다. 나머지 삭제분은 안내한 대로 계속 복구할 수 있어야 한다.
async function clearKakaoEditUndoV4(env, kakaoUserKey = "", payload = {}, undo = null) {
  if (!undo) {
    await writeKakaoEditUndoItemsV4(env, kakaoUserKey, payload, []);
    return;
  }
  const items = await readKakaoEditUndoItemsV4(env, kakaoUserKey, payload);
  await writeKakaoEditUndoItemsV4(env, kakaoUserKey, payload, items.filter((item) => String(item?.row?.id || "") !== String(undo?.row?.id || "")));
}

function twoDigitSeq(n = 0) {
  return String(Math.max(0, Number(n || 0))).padStart(2, "0");
}

function kakaoRowLabel(row = {}, seq = 0) {
  const memo = row.memo || row.raw_text || row.category || "기록";
  const pay = row.payment_method || "-";
  const cat = row.category || (row.type === "income" ? "수입" : "지출");
  return `${twoDigitSeq(seq)}번 - ${memo} / ${numberWithCommas(row.amount)}원 / ${pay} / ${cat}`;
}

function isKakaoRowOwnedByRequesterV2254(row = {}, userId = "", kakaoUserKey = "") {
  const sourceKey = String(row?.source_user_key || "").trim();
  if (sourceKey) return !!kakaoUserKey && sourceKey === String(kakaoUserKey);
  return String(row?.user_id || "") === String(userId || "");
}

async function getDailyKakaoRows(env, householdId, userId, kakaoUserKey, date) {
  const params = new URLSearchParams();
  params.set("select", "id,user_id,source_user_key,type,amount,category,memo,payment_method,transaction_date,created_at,raw_text");
  params.set("household_id", `eq.${householdId}`);
  params.set("transaction_date", `eq.${date}`);
  params.set("order", "created_at.asc,id.asc");
  params.set("limit", "500");
  const rows = (await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" })) || [];
  return rows.filter((row) => isKakaoRowOwnedByRequesterV2254(row, userId, kakaoUserKey));
}

async function getKakaoRowById(env, householdId, userId, kakaoUserKey, id) {
  const params = new URLSearchParams();
  params.set("select", "id,user_id,source_user_key,type,amount,category,memo,payment_method,transaction_date,created_at,raw_text");
  params.set("id", `eq.${id}`);
  params.set("household_id", `eq.${householdId}`);
  params.set("limit", "1");
  const rows = (await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" })) || [];
  const row = rows[0] || null;
  return row && isKakaoRowOwnedByRequesterV2254(row, userId, kakaoUserKey) ? row : null;
}

async function deleteKakaoRowById(env, id) {
  await supabase(env, `/rest/v1/transactions?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

async function findDailyKakaoRowBySeq(env, householdId, userId, kakaoUserKey, date, seq) {
  const rows = await getDailyKakaoRows(env, householdId, userId, kakaoUserKey, date);
  const idx = Math.max(0, Number(seq || 0) - 1);
  return { row: rows[idx] || null, rows };
}

async function dailySeqForKakaoRow(env, householdId, userId, kakaoUserKey, row = {}) {
  const rows = await getDailyKakaoRows(env, householdId, userId, kakaoUserKey, row.transaction_date || formatDate(nowKstDate()));
  const idx = rows.findIndex((r) => String(r.id) === String(row.id));
  return idx >= 0 ? idx + 1 : 0;
}

async function getRecentKakaoOwnedTransactionsV2254(env, householdId, userId, kakaoUserKey, limit = 5) {
  const params = new URLSearchParams();
  params.set("select", "id,user_id,source_user_key,type,amount,category,memo,payment_method,transaction_date,created_at,raw_text");
  params.set("household_id", `eq.${householdId}`);
  params.set("order", "created_at.desc");
  params.set("limit", String(Math.max(20, Number(limit || 5) * 10)));
  const rows = (await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" })) || [];
  return rows.filter((row) => isKakaoRowOwnedByRequesterV2254(row, userId, kakaoUserKey)).slice(0, Math.max(1, Number(limit || 5)));
}

function isKakaoDailyListCommand(text = "") {
  const raw = normalizeText(text);
  return /^(오늘|어제|그제|그저께|이번\s*달\s*\d{1,2}일|이달\s*\d{1,2}일|\d{1,2}\s*월\s*\d{1,2}\s*일?|20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}일?)\s*(기록|내역|목록)(?:\s*보기)?$/.test(raw) || /^(오늘기록보기|오늘기록|오늘내역|어제기록보기|어제기록|어제내역)$/.test(raw.replace(/\s+/g, ""));
}

function isKakaoEditGuideCommand(text = "") {
  return /^(수정가이드|수정 가이드|번호수정|번호 수정|챗봇수정|챗봇 수정)$/i.test(normalizeText(text));
}

function isKakaoEditCancelCommand(text = "") {
  return /^(취소|수정취소|수정 취소|그만|취소취소|선택취소|선택 취소)$/i.test(normalizeText(text));
}

// ---- V4 최상위 명령 파서 (지침서 3장 1·2단계) ----
// "수정 NN번 [나머지]"가 표준 문법이고, 안내되어 온 레거시 "NN번 [나머지]"와
// 날짜 접두("어제 01번 …")도 같은 단일 경로로 흡수한다.

function stripKakaoEditDatePrefixV4(text = "") {
  return normalizeText(text)
    .replace(/^(오늘|어제|그제|그저께|엊그제)\s+/, "")
    .replace(/^(?:20\d{2}[.\-/년\s]+)?\d{1,2}\s*[월.\-/]\s*\d{1,2}\s*일?\s+(?=수정|삭제|복구|\d{1,2}\s*번)/, "")
    .trim();
}

// 날짜 힌트는 명령 "앞"에 붙은 접두부에서만 읽는다. 문장 전체에서 읽으면
// "수정 01번 날짜 어제"의 `어제`가 바꿀 값이 아니라 대상 기록의 날짜로 잡혀
// 어제의 01번을 건드리고도 "변경했어요"라고 답한다.
function splitKakaoEditDatePrefixV4(text = "") {
  const raw = normalizeText(text);
  const body = stripKakaoEditDatePrefixV4(raw);
  const prefix = body && raw.endsWith(body) ? raw.slice(0, raw.length - body.length).trim() : "";
  return { body, date: prefix && hasDateHint(prefix) ? extractDate(prefix) : "" };
}

function parseKakaoDeleteCommandV4(text = "") {
  const raw = normalizeText(text);
  if (!raw) return null;
  const { body, date: explicitDate } = splitKakaoEditDatePrefixV4(raw);
  const m = body.match(/^(?:삭제|지워|지우기)\s*(\d{1,2})\s*번$/) || body.match(/^(\d{1,2})\s*번\s*(?:삭제|제거|지워줘?)(?:해줘)?$/);
  if (m) return { seq: Number(m[1]), latest: false, date: explicitDate || formatDate(nowKstDate()) };
  if (/^(방금 삭제|방금삭제|최근 입력 삭제|최근입력삭제|마지막 삭제|마지막삭제|방금 거 삭제|방금거삭제)$/.test(body)) {
    return { seq: 0, latest: true, date: explicitDate || formatDate(nowKstDate()) };
  }
  return null;
}

function parseKakaoRestoreCommandV4(text = "") {
  const raw = normalizeText(text);
  const m = raw.match(/^복구\s*(\d{1,2})?\s*번?$/) || raw.match(/^(\d{1,2})\s*번\s*복구$/);
  if (!m) return null;
  return { seq: m[1] ? Number(m[1]) : 0 };
}

function parseKakaoEditCommandV4(text = "") {
  const raw = normalizeText(text);
  if (!raw || parseKakaoDeleteCommandV4(raw) || parseKakaoRestoreCommandV4(raw)) return null;
  const { body, date: explicitDate } = splitKakaoEditDatePrefixV4(raw);
  let seq = 0;
  let latest = false;
  let rest = "";
  const m = body.match(/^수정\s*(\d{1,2})\s*번\s*(.*)$/) || body.match(/^(\d{1,2})\s*번\s*(.*)$/);
  if (m) {
    seq = Number(m[1]);
    rest = m[2] || "";
  } else if (/^(방금|최근|마지막)/.test(body) && /(수정|변경|바꿔|고쳐|금액|가격|분류|카테고리|결제수단|내용|메모|날짜|일자|지출자|결제자)/.test(body)) {
    latest = true;
    rest = body.replace(/^(방금|최근|마지막)\s*(거|것|기록|입력)?\s*/, "");
  } else {
    return null;
  }
  // "01번 수정해줘"류의 동사만 남은 나머지는 메뉴 요청으로 정규화한다.
  rest = normalizeText(rest).replace(/^(내용\s*수정|수정해줘|수정|변경해줘|변경|바꿔줘|바꿔|고쳐줘|고쳐|해줘|해주세요)$/, "");
  return { seq, latest, date: explicitDate || formatDate(nowKstDate()), rest: normalizeText(rest) };
}

function isKakaoTransactionSpenderChangeCommand(text = "") {
  const t = normalizeText(text).replace(/\s+/g, " ").trim();
  return /(?:^|\s)(지출자|결제자)(?:\s*이름)?\s*(?:변경|수정|바꾸기|바꿔|바꿔줘|변경해줘|수정해줘)(?:\s|$)/.test(t) || /(?:^|\s)(지출자|결제자)(?:\s*이름)?\s+[가-힣A-Za-z0-9._-]{1,30}(?:\s*(?:으로|로))?(?:\s*(?:변경|수정|바꿔|바꿔줘|해줘))?$/.test(t);
}

function parseKakaoSpenderChoiceValue(text = "") {
  let t = normalizeText(text).replace(/\s+/g, " ").trim();
  t = t.replace(/(?:^|\s)\d{1,2}\s*번/g, " ").replace(/방금|최근|마지막/g, " ");
  t = t.replace(/^(?:지출자|결제자)(?:\s*이름)?\s*/, "");
  t = t.replace(/(?:지출자|결제자)(?:\s*이름)?\s*/, "");
  t = t.replace(/\s*(?:으로|로)?\s*(?:변경|수정|바꾸기|바꿔|바꿔줘|변경해줘|수정해줘|해줘|해주세요)\s*$/g, "");
  return t.trim();
}

function kakaoActiveSpenderMembers(members = []) {
  return safeArray(members).filter((m) => m?.user_id && ["owner", "admin", "member"].includes(String(m.role || "member")));
}

// V4 메뉴 (지침서 1-1장): 안내되는 모든 예시 입력은 selfTest 케이스에 존재한다.
function kakaoEditMenuTextV4(row = {}, seq = 0) {
  return [
    kakaoRowLabel(row, seq),
    "무엇을 바꿀까요? 번호를 보내주세요.",
    "1. 금액  2. 분류  3. 결제수단  4. 내용  5. 날짜  6. 지출자  7. 삭제",
    "한 줄로도 돼요: 지출자 엄마 / 금액 13000",
    "(그만하려면: 취소)",
  ].join("\n");
}

function kakaoEditGuideText(origin = "") {
  return [
    "✏️ 챗봇 수정 방법",
    "",
    "저장된 기록은 매일 00시 기준으로 01번부터 번호가 붙습니다.",
    "번호는 ‘오늘 기록 보기’로 확인해요.",
    "",
    "메뉴로 차근차근:",
    "수정 01번",
    "",
    "한 줄로 바로:",
    "수정 01번 금액 13000",
    "수정 01번 분류 카페/간식",
    "수정 01번 결제수단 현금",
    "수정 01번 내용 점심",
    "수정 01번 날짜 어제",
    "수정 01번 지출자 엄마",
    "",
    "삭제: 삭제 01번",
    "되돌리기: 복구 01번",
    "",
    "날짜가 다르면 이렇게 입력하세요.",
    "어제 01번 금액 13000",
    "",
    origin ? `자세한 가이드\n${origin}/chatbot-edit-guide` : "",
  ].filter(Boolean).join("\n");
}
// @build:exports-start
export {
  clearKakaoEditUndoV4, dailySeqForKakaoRow, deleteKakaoRowById, findDailyKakaoRowBySeq,
  getDailyKakaoRows, getKakaoEditSessionV4, getKakaoRowById, getRecentKakaoOwnedTransactionsV2254,
  hasKakaoEditSessionHint, isKakaoDailyListCommand, isKakaoEditCancelCommand,
  isKakaoEditGuideCommand, isKakaoTransactionSpenderChangeCommand, kakaoActiveSpenderMembers,
  kakaoEditConversationScope, kakaoEditGuideText, kakaoEditMenuTextV4, kakaoRowLabel,
  parseKakaoDeleteCommandV4, parseKakaoEditCommandV4, parseKakaoRestoreCommandV4,
  parseKakaoSpenderChoiceValue, saveKakaoEditSessionV4, saveKakaoEditUndoV4, takeKakaoEditUndoV4,
  twoDigitSeq,
};
// @build:exports-end
