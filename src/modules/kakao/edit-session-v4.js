// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { quickInputDate } from "../client/shared-input-parsers.js";
import { parseStrictSettingsObject, safeError, withSettingsRmwLease } from "../runtime/leases.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { refundLinkCountForRow } from "../features/settlement-refund-links.js";
import { isDefiniteStorageFailure, isUncertainStorageWrite } from "./response-builders.js";
import { SESSION_TTL_MS, isSessionExpired } from "./edit-state-machine.js";
import { getKakaoBotGroupKey } from "./group-links-first-record.js";
import { stableShortHash } from "./identity-chat-first.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { formatDate, nowKstDate } from "../nlu/date-payment.js";
import { deleteTransactionWithAudit, numberWithCommas } from "../domain/transactions-core.js";
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

async function getKakaoEditSessionV4(env, kakaoUserKey = "", payload = {}, snapshotRaw = undefined) {
  // Failed state reads must not reroute a numeric edit reply into a new transaction.
  const raw = snapshotRaw === undefined ? await getSettingValueStrict(env, kakaoEditSessionKeyV4(kakaoUserKey, payload)) : snapshotRaw;
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || !obj.entryNo || !obj.entryId || !obj.step) return null;
    // T6: 시간이 지난 세션은 반복 가드를 끄는 힌트를 다시 켜지 않는다. 호출부가 없는 것으로 보고 지운다.
    if (!isSessionExpired(obj)) AB_KAKAO_EDIT_SESSION_HINTS.set(kakaoEditSessionHintKey(kakaoUserKey, payload), Date.now());
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
// V22.9.37 감사 NEW-4·NEW-9: 카카오 수정·삭제도 웹과 같은 감사 RPC 를 타며, 행위자는 요청한 사용자이고 종류는 "kakao" 다.
// (웹은 "user"·"admin", 예전 카카오 수정은 행위자 없는 "system" 이었다.)
const KAKAO_AUDIT_ACTOR_KIND = "kakao";
// T12: 복구는 지울 때 읽은 칸으로 행을 다시 만든다. source·household_id 가 빠지면 되살린 행의 출처가 사라진다.
const KAKAO_TX_SELECT_V4 = "id,household_id,user_id,source,source_user_key,type,amount,category,memo,payment_method,transaction_date,created_at,raw_text";
const KAKAO_TX_RESTORE_COLUMNS_V4 = KAKAO_TX_SELECT_V4.split(",");

// 옛 버퍼는 `{ row, seq }` 한 건이었다. 배포 직후에도 그 값이 남아 있으므로 함께 읽는다.
function kakaoEditUndoItemsV4(obj) {
  if (!obj) return [];
  if (Array.isArray(obj.items)) return obj.items.filter((item) => item?.row?.id);
  return obj?.row?.id ? [{ row: obj.row, seq: Number(obj.seq || 0), expires_at: Number(obj.expires_at || 0) }] : [];
}

// S1: 복구 버퍼는 엄격하게 읽는다. 읽기 실패나 깨진 값을 빈 버퍼로 보면 다음 삭제가 버퍼를 새 항목
// 하나로 덮어써, 앞서 지운 기록을 되살릴 길이 사라진다(카카오 삭제는 실제 DELETE 다). 실패는 호출자까지 올린다.
async function readKakaoEditUndoItemsV4(env, kakaoUserKey = "", payload = {}) {
  const raw = await getSettingValueStrict(env, kakaoEditUndoKeyV4(kakaoUserKey, payload));
  const obj = parseStrictSettingsObject(raw, "kakao_edit_undo");
  const now = Date.now();
  return kakaoEditUndoItemsV4(obj).filter((item) => {
    const expires = Number(item.expires_at || obj?.expires_at || 0);
    return !expires || now <= expires;
  });
}

// S1: 같은 사람·같은 방의 삭제와 복구는 버퍼 하나를 읽고-고쳐-쓴다. 잠금 없이 두 삭제가 겹치면 한 건이 버퍼에서 빠진다.
function withKakaoEditUndoLeaseV4(env, kakaoUserKey = "", payload = {}, task) {
  return withSettingsRmwLease(env, `kakao-edit-undo-rmw:${stableShortHash(kakaoEditConversationScope(payload))}:${String(kakaoUserKey || "").slice(0, 120)}`, task);
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

// S1: 잠금 안에서 버퍼에 먼저 담고, 담긴 것을 확인한 뒤에만 지운다. 버퍼를 읽거나 쓰지 못하면 지우지 않는다.
// DELETE 단계의 오류에는 kakaoDeletePhase 를 달아 "결과 모름"과 "지우지 않음"을 호출부가 구분하게 한다.
async function deleteKakaoRowWithUndoV4(env, { kakaoUserKey = "", payload = {}, householdId = "", householdName = "", userId = "" } = {}, row = {}, seq = 0) {
  return withKakaoEditUndoLeaseV4(env, kakaoUserKey, payload, async ({ assertFresh }) => {
    // V22.9.80 T-13: 환불 연결이 켜져 있으면 지우기 전에 이 기록의 연결 수를 함께 읽어 버퍼에 적는다(같은 단계라 왕복이 늘지 않는다).
    // 지우면 연결은 함께 지워지고 복구해도 되살아나지 않으므로 삭제·복구 답장이 그 사실을 말한다. 플래그가 꺼져 있으면 칸이 없다.
    const [previous, refundLinks] = await Promise.all([
      readKakaoEditUndoItemsV4(env, kakaoUserKey, payload),
      refundLinkCountForRow(env, String(row.household_id || householdId), row),
    ]);
    const entry = { row: { ...row, household_id: row.household_id || householdId }, seq: Number(seq || 0), household_name: String(householdName || "").slice(0, 60), expires_at: Date.now() + KAKAO_EDIT_UNDO_TTL_MS, ...(refundLinks === undefined ? {} : { refund_links: refundLinks }) };
    // 같은 기록을 두 번 담지 않는다. 나머지는 최근 삭제가 앞에 오도록 쌓는다.
    const items = [entry, ...previous.filter((item) => String(item?.row?.id || "") !== String(row.id || ""))].slice(0, KAKAO_EDIT_UNDO_MAX);
    assertFresh();
    await writeKakaoEditUndoItemsV4(env, kakaoUserKey, payload, items);
    assertFresh();
    try {
      // V22.9.37 감사 NEW-4: 직접 DELETE 대신 웹과 같은 감사 RPC 로 지운다. accountbook_transaction_audit 에 지운 행과
      // 행위자가 남는다. RPC 도 실제 DELETE 이므로 복구는 예전처럼 버퍼의 행을 같은 id 로 다시 넣는다.
      await deleteTransactionWithAudit(env, row.id, String(row.household_id || householdId), { actorUserId: userId || null, actorKind: KAKAO_AUDIT_ACTOR_KIND });
    } catch (err) {
      throw Object.assign(new Error(`kakao_delete_failed: ${safeError(err)}`, { cause: err }), { kakaoDeletePhase: true });
    }
    return entry;
  });
}

function twoDigitSeq(n = 0) {
  return String(Math.max(0, Number(n || 0))).padStart(2, "0");
}

// T2: 오늘이 아닌 기록은 번호 앞에 날짜를 붙여 안내한다. 수정·삭제 명령이 이 접두를 그대로 받아들인다.
function kakaoEditDayPrefixV4(date = "") {
  const today = formatDate(nowKstDate());
  const m = String(date || "").match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!m || date === today) return "";
  return m[1] === today.slice(0, 4) ? `${Number(m[2])}월 ${Number(m[3])}일 ` : `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일 `;
}

// N1·D4: 풀리지 않는 날짜 접두와 01 미만 번호는 아무것도 바꾸지 않고 거절한다.
function kakaoEditTargetRejectTextV4(target = {}) {
  if (target.dateError) return `‘${target.prefix || "날짜"}’ 날짜를 알아듣지 못해서 아무것도 바꾸지 않았어요.\n달력에 있는 날짜로 다시 보내 주세요.\n예: 그제 삭제 01번 · 7월 13일 수정 01번 금액 13000`;
  if (!target.latest && !(Number(target.seq) >= 1)) return "번호는 01번부터예요. 아무것도 바꾸지 않았어요.\n‘오늘기록’로 번호를 확인해 주세요.";
  return "";
}

// T2: 무엇을 지웠는지 답장에 적는다. 번호는 지운 뒤 밀리므로 이름이 있어야 확인할 수 있다.
function kakaoEditDeletedTextV4(row = {}, seq = 0, refundLinks = undefined) {
  // V22.9.81 U-13: 번호를 모르는 기록(그날 목록 밖의 ‘방금 삭제’)은 번호 없이 적고 번호 없는 ‘복구’(가장 최근 삭제)로 안내한다.
  const numbered = Number(seq) >= 1;
  return `🗑️ ${kakaoEditDayPrefixV4(row.transaction_date)}${numbered ? `${twoDigitSeq(seq)}번 ` : ""}기록을 삭제했어요.\n${kakaoRowLabel(row, seq)}\n되돌리려면: ${numbered ? `복구 ${twoDigitSeq(seq)}번` : "복구"}${kakaoRefundLinkUndoNoteV4(refundLinks, "delete")}`;
}

// V22.9.80 T-13: 버퍼에 적은 환불 연결 수(refund_links)로 삭제·복구 답장에 붙일 한 줄. 칸이 없거나 0 이면 "".
function kakaoRefundLinkUndoNoteV4(refundLinks = undefined, phase = "delete") {
  if (refundLinks === undefined || refundLinks === 0) return "";
  if (refundLinks === null) {
    return phase === "delete"
      ? "\n환불 연결이 있었는지 확인하지 못했어요. 연결이 있었다면 함께 풀렸어요."
      : "\n환불 연결은 확인 불가예요. 연결이 있었다면 웹 정산 화면의 ‘환불·환급’에서 다시 연결해 주세요.";
  }
  const count = Math.max(0, Number(refundLinks) || 0);
  if (!count) return "";
  return phase === "delete"
    ? `\n이 기록에 있던 환불 연결 ${count}건도 함께 풀렸어요. 복구해도 연결은 되살아나지 않아요.`
    : `\n이 기록에 있던 환불 연결 ${count}건은 되살리지 않았어요. 웹 정산 화면의 ‘환불·환급’에서 다시 연결해 주세요.`;
}

// T2·S1: DELETE 결과를 모르면 다시 보내라고 하지 않는다. 다시 보내면 밀린 다음 번호가 지워진다.
function kakaoEditDeleteFailedTextV4(err, row = {}, seq = 0) {
  const listCommand = `${kakaoEditDayPrefixV4(row.transaction_date) || "오늘 "}기록 보기`;
  if (err?.kakaoDeletePhase && isUncertainStorageWrite(err)) {
    return `삭제 결과를 확인하지 못했어요.\n${kakaoRowLabel(row, seq)}\n같은 명령을 다시 보내면 다른 기록이 지워질 수 있어요. ‘${listCommand}’로 먼저 확인해 주세요.\n지워져 있으면 ‘${Number(seq) >= 1 ? `복구 ${twoDigitSeq(seq)}번` : "복구"}’로 되돌릴 수 있어요.`;
  }
  // NEW-4: 감사 RPC 가 분명히 거절(4xx)했으면 지워진 것이 없다. 버퍼 준비 실패와 구분해 말한다.
  if (err?.kakaoDeletePhase) {
    return `기록을 지우지 않았어요. 저장소가 삭제 요청을 거절했어요.\n${kakaoRowLabel(row, seq)}\n잠시 뒤 ‘${listCommand}’로 번호를 확인하고 다시 보내 주세요.`;
  }
  return `기록을 지우지 않았어요. 삭제를 되돌릴 준비를 하지 못했어요.\n잠시 뒤 ‘${listCommand}’로 번호를 확인하고 다시 보내 주세요.`;
}

// T2: 수정 답장에 바뀐 기록을 적는다.
function kakaoEditRecordLineV4(row = {}) {
  const memo = row.memo || row.raw_text || row.category || "기록";
  return `기록: ${memo} / ${kakaoIncomeMarkV4(row)}${numberWithCommas(row.amount)}원 / ${row.transaction_date || "-"}`;
}

// T12: 지울 때 읽은 칸으로 행을 다시 만든다. 예전 버퍼에 source 가 없으면 카카오 기록으로 본다.
function kakaoRestoreRowV4(row = {}, fallbackHouseholdId = "") {
  const out = Object.create(null);
  for (const key of KAKAO_TX_RESTORE_COLUMNS_V4) if (row[key] !== undefined && row[key] !== null) out[key] = row[key];
  out.household_id = String(row.household_id || fallbackHouseholdId);
  out.source = String(row.source || "kakao_skill");
  return out;
}

// V22.9.76 카카오 감사 12: 목록 줄에서 수입을 지출과 구별한다. 예전에는 "01번 - 월급 / 2,500,000원 / - / 급여"처럼
// 지출과 똑같이 보였다. 금액 칸에 ‘수입’을 붙인다("01번 - 월급 / 수입 2,500,000원 / - / 급여"). 지출 줄의 모양은 그대로다.
function kakaoIncomeMarkV4(row = {}) { return row.type === "income" ? "수입 " : ""; }

function kakaoRowLabel(row = {}, seq = 0) {
  const memo = row.memo || row.raw_text || row.category || "기록";
  const pay = row.payment_method || "-";
  const cat = row.category || (row.type === "income" ? "수입" : "지출");
  // V22.9.81 U-13: 번호를 모르면(0) ‘00번’을 붙이지 않고 번호 없이 적는다.
  return `${Number(seq) >= 1 ? `${twoDigitSeq(seq)}번 - ` : ""}${memo} / ${kakaoIncomeMarkV4(row)}${numberWithCommas(row.amount)}원 / ${pay} / ${cat}`;
}

function isKakaoRowOwnedByRequesterV2254(row = {}, userId = "", kakaoUserKey = "") {
  const sourceKey = String(row?.source_user_key || "").trim();
  if (sourceKey) return !!kakaoUserKey && sourceKey === String(kakaoUserKey);
  return String(row?.user_id || "") === String(userId || "");
}

// V22.9.80 T-10: 그날 가계부 기록을 오래된 순으로 500건까지만 읽는다(내 기록은 읽은 뒤 거른다). 정확히 500건이 돌아오면 그날 뒤쪽 기록이 목록에
// 없을 수 있으므로, 돌려주는 배열의 dailyLimit 에 그 한도(500)를 달아 답장이 한 줄로 말하게 한다 — 더 읽는 요청은 하지 않는다(답장 4초 안).
const KAKAO_DAILY_ROW_LIMIT_V22980 = 500;
async function getDailyKakaoRows(env, householdId, userId, kakaoUserKey, date) {
  const params = new URLSearchParams();
  params.set("select", KAKAO_TX_SELECT_V4);
  params.set("household_id", `eq.${householdId}`);
  params.set("transaction_date", `eq.${date}`);
  params.set("order", "created_at.asc,id.asc");
  params.set("limit", String(KAKAO_DAILY_ROW_LIMIT_V22980));
  const rows = (await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" })) || [];
  const own = rows.filter((row) => isKakaoRowOwnedByRequesterV2254(row, userId, kakaoUserKey));
  own.dailyLimit = rows.length >= KAKAO_DAILY_ROW_LIMIT_V22980 ? KAKAO_DAILY_ROW_LIMIT_V22980 : 0;
  return own;
}

async function getKakaoRowById(env, householdId, userId, kakaoUserKey, id) {
  const params = new URLSearchParams();
  params.set("select", KAKAO_TX_SELECT_V4);
  params.set("id", `eq.${id}`);
  params.set("household_id", `eq.${householdId}`);
  params.set("limit", "1");
  const rows = (await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" })) || [];
  const row = rows[0] || null;
  return row && isKakaoRowOwnedByRequesterV2254(row, userId, kakaoUserKey) ? row : null;
}

async function findDailyKakaoRowBySeq(env, householdId, userId, kakaoUserKey, date, seq) {
  // N1: 번호는 01 부터다. 00번을 01번으로, 빈 날짜를 오늘로 읽지 않는다.
  if (!(Number(seq) >= 1) || !date) return { row: null, rows: [] };
  const rows = await getDailyKakaoRows(env, householdId, userId, kakaoUserKey, date);
  return { row: rows[Number(seq) - 1] || null, rows };
}

async function dailySeqForKakaoRow(env, householdId, userId, kakaoUserKey, row = {}) {
  const rows = await getDailyKakaoRows(env, householdId, userId, kakaoUserKey, row.transaction_date || formatDate(nowKstDate()));
  const idx = rows.findIndex((r) => String(r.id) === String(row.id));
  return idx >= 0 ? idx + 1 : 0;
}

// V22.9.79: PostgREST 논리 조건의 값은 큰따옴표로 감싼다(쉼표·점·콜론·괄호가 든 키도 값 그대로 읽힌다). 따옴표와 역슬래시만 이스케이프한다.
function postgrestQuotedValueV22979(value = "") {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

// V22.9.79: isKakaoRowOwnedByRequesterV2254 와 같은 규칙을 서버 조건으로 쓴다 — 기록에 source_user_key 가 있으면 그 키가 내 카카오 키일 때만 내 것이고,
// source_user_key 가 비어 있으면(null 또는 빈 문자열) user_id 가 나일 때 내 것이다. 서버 쪽 조건이라 limit 이 내 기록에만 걸린다.
// 반환은 [쿼리 이름, 값] 이거나, 가릴 기준이 하나도 없으면 null 이다(그때는 예전처럼 서버가 거르지 않는다).
function kakaoOwnerFilterV22979(userId = "", kakaoUserKey = "") {
  const byUser = userId ? `user_id.eq.${postgrestQuotedValueV22979(userId)},or(source_user_key.is.null,source_user_key.eq."")` : "";
  if (kakaoUserKey) return ["or", `(source_user_key.eq.${postgrestQuotedValueV22979(kakaoUserKey)}${byUser ? `,and(${byUser})` : ""})`];
  return byUser ? ["and", `(${byUser})`] : null;
}

// V22.9.79: 최근 기록 조회('최근 기록'·'내 기록'·'마지막', '방금 삭제·수정·지출자 변경'의 대상). 예전에는 가계부 전체의 최근 max(20, 5×개수)건을
// 읽은 뒤 내 것만 걸러서, 같은 가계부의 다른 구성원이 그 뒤로 20~50건을 넘게 저장했으면 내 기록이 창 밖이라 "아직 내가 기록한 내역이 없어요"/
// "삭제할 최근 기록이 없어요"가 나왔다. 이제 내 기록만 서버가 거르고 limit 이 그 위에 걸린다 — 조회는 한 번 그대로이고 읽는 줄은 더 적다.
// 서버가 조건을 거절하면(4xx — 운영 PostgREST 에서 이 문법을 실제로 돌려 본 적이 없다) 운영 이벤트를 남기고 예전 조회로 한 번 더 읽는다.
// 어느 쪽이든 마지막에 같은 규칙으로 한 번 더 거른다(서버 조건과 어긋난 줄이 있어도 남의 기록이 나가지 않는다).
async function getRecentKakaoOwnedTransactionsV2254(env, householdId, userId, kakaoUserKey, limit = 5) {
  const wanted = Math.max(1, Number(limit || 5));
  const query = (extra) => {
    const params = new URLSearchParams();
    params.set("select", KAKAO_TX_SELECT_V4);
    params.set("household_id", `eq.${householdId}`);
    params.set("order", "created_at.desc");
    if (extra) params.set(extra[0], extra[1]);
    params.set("limit", String(extra ? wanted : Math.max(20, wanted * 10)));
    return `/rest/v1/transactions?${params.toString()}`;
  };
  const ownerFilter = kakaoOwnerFilterV22979(userId, kakaoUserKey);
  let rows;
  try {
    rows = (await supabase(env, query(ownerFilter), { method: "GET" })) || [];
  } catch (error) {
    if (!ownerFilter || !isDefiniteStorageFailure(error)) throw error;
    rememberOpsEvent({ kind: "kakao_recent_owner_filter_rejected", severity: "warn", path: "/skill", method: "GET", detail: safeError(error) });
    rows = (await supabase(env, query(null), { method: "GET" })) || [];
  }
  return rows.filter((row) => isKakaoRowOwnedByRequesterV2254(row, userId, kakaoUserKey)).slice(0, wanted);
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

// V22.9.76 카카오 감사 3: "어제수정 01번 금액 5000"·"그제삭제 01번"·"10월20일수정 01번 …"처럼 띄어 쓰지 않은 날짜 접두도
// 뗀다. 예전에는 날짜를 못 떼서 수정 명령으로 알아보지 못했고, 금액이 있으면 새 지출로 저장됐다. 날짜 숫자 바로 뒤에
// 번호가 붙은 "10월 12번 삭제"는 "10월 1" + "2번"으로 잘못 떼지 않도록 일·띄어쓰기·수정 낱말이 있을 때만 뗀다.
function stripKakaoEditDatePrefixV4(text = "") {
  return normalizeText(text)
    .replace(/^(오늘|어제|그제|그저께|엊그제)\s+/, "")
    .replace(/^(오늘|어제|그제|그저께|엊그제)(?=수정|삭제|복구|\d{1,2}\s*번)/, "")
    .replace(/^(?:20\d{2}[.\-/년\s]+)?\d{1,2}\s*[월.\-/]\s*\d{1,2}(?:\s*일\s*|\s+|(?=수정|삭제|복구))(?=수정|삭제|복구|\d{1,2}\s*번)/, "")
    .trim();
}

// 날짜 힌트는 명령 "앞"에 붙은 접두부에서만 읽는다. 문장 전체에서 읽으면
// "수정 01번 날짜 어제"의 `어제`가 바꿀 값이 아니라 대상 기록의 날짜로 잡혀
// 어제의 01번을 건드리고도 "변경했어요"라고 답한다.
// N1·D4·N4: 날짜 접두와 수정 날짜 값은 같은 엄격한 해석기로 푼다. 달력에 없거나("6월 31일") 모르는 말
// ("엊그제", "7-10")이면 ""이다. 호출부는 ""를 오늘로 바꾸지 않고 거절하거나 다시 묻는다.
// V22.9.34: 새 기록은 "엊그제"를 이틀 전으로 읽지만, 기록을 고치거나 지우는 명령에서는 날짜가 모호하면
// 다른 날의 기록을 건드린다. 수정·삭제·복구의 날짜로는 "엊그제"를 받지 않고 다시 묻는다.
function resolveKakaoEditDateV4(text = "") {
  const raw = normalizeText(text);
  if (!raw || /엊그제/.test(raw)) return "";
  return quickInputDate(raw, formatDate(nowKstDate()));
}

function splitKakaoEditDatePrefixV4(text = "") {
  const raw = normalizeText(text);
  const body = stripKakaoEditDatePrefixV4(raw);
  const prefix = body && raw.endsWith(body) ? raw.slice(0, raw.length - body.length).trim() : "";
  const date = prefix ? resolveKakaoEditDateV4(prefix) : "";
  return { body, prefix, date, dateError: !!prefix && !date };
}

function parseKakaoDeleteCommandV4(text = "") {
  const raw = normalizeText(text);
  if (!raw) return null;
  const { body, prefix, date: explicitDate, dateError } = splitKakaoEditDatePrefixV4(raw);
  const date = dateError ? "" : (explicitDate || formatDate(nowKstDate()));
  const m = body.match(/^(?:삭제|지워|지우기)\s*(\d{1,2})\s*번$/) || body.match(/^(\d{1,2})\s*번\s*(?:삭제|제거|지워줘?)(?:해줘)?$/);
  if (m) return { seq: Number(m[1]), latest: false, date, prefix, dateError };
  if (/^(방금 삭제|방금삭제|최근 입력 삭제|최근입력삭제|마지막 삭제|마지막삭제|방금 거 삭제|방금거삭제)$/.test(body)) {
    return { seq: 0, latest: true, date, prefix, dateError };
  }
  return null;
}

function parseKakaoRestoreCommandV4(text = "") {
  const raw = normalizeText(text);
  const m = raw.match(/^복구\s*(\d{1,2})?\s*번?$/) || raw.match(/^(\d{1,2})\s*번\s*복구$/);
  if (!m) return null;
  // "복구"만 보내면 가장 최근 삭제다. "복구 00번"은 그 뜻이 아니므로 따로 표시한다.
  return { seq: m[1] ? Number(m[1]) : 0, invalidSeq: m[1] !== undefined && !(Number(m[1]) >= 1) };
}

// V22.9.76 감사 B-2: 수정 세션의 메뉴·선택지에 "1번"·"6번 WIFI♥"·"1번 13000"처럼 답하는 말인지 본다.
// 옛 문법("N번 …" = 오늘의 N번 기록 수정)과 모양이 같아서, 열린 세션이 있으면 이 말을 세션에 먼저 넘긴다.
// 수정·삭제·복구 말이 들어 있거나 날짜로 시작하는 말은 기록을 고르는 명령이라 여기에 들지 않는다.
function isKakaoSessionSeqReplyV4(text = "") {
  const raw = normalizeText(text);
  return /^\d{1,2}\s*번(?:\s|$)/.test(raw) && !/(?:수정|삭제|제거|지워|지우기|복구)/.test(raw);
}

function parseKakaoEditCommandV4(text = "") {
  const raw = normalizeText(text);
  if (!raw || parseKakaoDeleteCommandV4(raw) || parseKakaoRestoreCommandV4(raw)) return null;
  const { body, prefix, date: explicitDate, dateError } = splitKakaoEditDatePrefixV4(raw);
  let seq = 0;
  let latest = false;
  let rest = "";
  const m = body.match(/^수정\s*(\d{1,2})\s*번\s*(.*)$/) || body.match(/^(\d{1,2})\s*번\s*(.*)$/);
  if (m) {
    seq = Number(m[1]);
    rest = m[2] || "";
  } else if (/^(방금|최근|마지막)/.test(body) && /(수정|변경|바꿔|고쳐|금액|가격|분류|카테고리|결제수단|내용|메모|날짜|일자|지출자|결제자|수입자|구분)/.test(body)) {
    latest = true;
    rest = body.replace(/^(방금|최근|마지막)\s*(거|것|기록|입력)?\s*/, "");
  } else {
    return null;
  }
  // "01번 수정해줘"류의 동사만 남은 나머지는 메뉴 요청으로 정규화한다.
  rest = normalizeText(rest).replace(/^(내용\s*수정|수정해줘|수정|변경해줘|변경|바꿔줘|바꿔|고쳐줘|고쳐|해줘|해주세요)$/, "");
  // V22.9.63 감사(1:1 1): "금액을 13000원으로 바꿔줘", "가격 13200", "13300원으로"처럼 조사·동사가 붙은 한 줄 수정도 값으로 읽는다.
  rest = normalizeText(rest)
    .replace(/^(금액|가격|얼마|액수|돈|값|분류|카테고리|항목|결제수단|결재수단|수단|지불수단|지불방법|결제방법|내용|이름|품목|제목|메모|날짜|일자|날자|지출자|결제자|결재자|지불자|수입자|구분)(?:을|를|은|는|이|가)(?=\s|$)/, "$1")
    .replace(/^(.+?)\s+(?:바꿔줘|바꿔|변경해줘|변경|수정해줘|수정|고쳐줘|고쳐|해줘|해주세요)$/, "$1")
    .replace(/(\d)\s*(?:원)?\s*(?:으로|로)$/, "$1원");
  return { seq, latest, date: dateError ? "" : (explicitDate || formatDate(nowKstDate())), prefix, dateError, rest: normalizeText(rest) };
}

function isKakaoTransactionSpenderChangeCommand(text = "") {
  const t = normalizeText(text).replace(/\s+/g, " ").trim();
  return /(?:^|\s)(지출자|결제자|수입자)(?:\s*이름)?\s*(?:변경|수정|바꾸기|바꿔|바꿔줘|변경해줘|수정해줘)(?:\s|$)/.test(t) || /(?:^|\s)(지출자|결제자|수입자)(?:\s*이름)?\s+[가-힣A-Za-z0-9._-]{1,30}(?:\s*(?:으로|로))?(?:\s*(?:변경|수정|바꿔|바꿔줘|해줘))?$/.test(t);
}

function parseKakaoSpenderChoiceValue(text = "") {
  let t = normalizeText(text).replace(/\s+/g, " ").trim();
  t = t.replace(/(?:^|\s)\d{1,2}\s*번/g, " ").replace(/방금|최근|마지막/g, " ");
  t = t.replace(/^(?:지출자|결제자|수입자)(?:\s*이름)?\s*/, "");
  t = t.replace(/(?:지출자|결제자|수입자)(?:\s*이름)?\s*/, "");
  t = t.replace(/\s*(?:으로|로)?\s*(?:변경|수정|바꾸기|바꿔|바꿔줘|변경해줘|수정해줘|해줘|해주세요)\s*$/g, "");
  return t.trim();
}

function kakaoActiveSpenderMembers(members = []) {
  return safeArray(members).filter((m) => m?.user_id && ["owner", "admin", "member"].includes(String(m.role || "member")));
}

// V4 메뉴 (지침서 1-1장): 안내되는 모든 예시 입력은 selfTest 케이스에 존재한다.
// V22.9.76 카카오 감사 8: 수입 기록의 메뉴는 ‘수입자’라고 쓴다(‘지출자’라고 보내도 같은 칸이다).
// V22.9.77 감사 K-4: 8번 ‘구분’으로 수입↔지출을 바꾼다(예전에는 지우고 다시 기록해야 했다). 1~7번은 그대로다.
function kakaoEditMenuTextV4(row = {}, seq = 0) {
  const person = row.type === "income" ? "수입자" : "지출자";
  const other = row.type === "income" ? "지출" : "수입";
  return [
    kakaoRowLabel(row, seq),
    "무엇을 바꿀까요? 번호를 보내주세요.",
    `1. 금액  2. 분류  3. 결제수단  4. 내용  5. 날짜  6. ${person}  7. 삭제  8. 구분(수입↔지출)`,
    `한 줄로도 돼요: ${person} 엄마 / 금액 13000 / 구분 ${other}`,
    "(그만하려면: 취소)",
  ].join("\n");
}

function kakaoEditGuideText(origin = "") {
  return [
    "✏️ 챗봇 수정 방법",
    "",
    "저장된 기록은 매일 00시 기준으로 01번부터 번호가 붙습니다.",
    "번호는 ‘오늘기록’로 확인해요.",
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
    "(수입 기록은 ‘수정 01번 수입자 엄마’)",
    "수정 01번 구분 수입  ← 지출을 수입으로(반대는 ‘구분 지출’)",
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
  KAKAO_AUDIT_ACTOR_KIND, dailySeqForKakaoRow, deleteKakaoRowWithUndoV4, findDailyKakaoRowBySeq,
  getDailyKakaoRows, getKakaoEditSessionV4, getKakaoRowById, getRecentKakaoOwnedTransactionsV2254,
  hasKakaoEditSessionHint, isKakaoDailyListCommand, isKakaoEditCancelCommand,
  isKakaoEditGuideCommand, isKakaoSessionSeqReplyV4, isKakaoTransactionSpenderChangeCommand,
  kakaoActiveSpenderMembers, kakaoEditDayPrefixV4, kakaoEditDeleteFailedTextV4,
  kakaoEditDeletedTextV4, kakaoEditGuideText, kakaoEditMenuTextV4, kakaoEditRecordLineV4,
  kakaoEditSessionKeyV4, kakaoEditTargetRejectTextV4, kakaoRefundLinkUndoNoteV4, kakaoRestoreRowV4,
  kakaoRowLabel, parseKakaoDeleteCommandV4, parseKakaoEditCommandV4, parseKakaoRestoreCommandV4,
  parseKakaoSpenderChoiceValue, readKakaoEditUndoItemsV4, resolveKakaoEditDateV4,
  saveKakaoEditSessionV4, stripKakaoEditDatePrefixV4, twoDigitSeq, withKakaoEditUndoLeaseV4,
  writeKakaoEditUndoItemsV4,
};
// @build:exports-end
