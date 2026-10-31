// @build:imports-start
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { sha256Hex } from "../auth/crypto-admin-session.js";
import {
  MAX_TRANSACTION_AMOUNT, isValidTransactionDateString,
} from "../admin/transactions-households.js";
import { fetchAdminRows, fetchHouseholdMembers } from "../data/households-members-rows.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import {
  buildSettlementModel, parseSettlementConditions, renderSettlementRows, renderTransferRows,
  settlementConditionPairs, settlementHistoryKey, settlementRoleAllowed,
} from "./settlement-ops-pages.js";
import { verifyUserSession } from "../auth/user-session.js";
import { parseJsonArraySettingStrict } from "../my/reports-premium.js";
import { canManageMyHousehold, getMySelectedHousehold } from "../my/access-control.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end
// Preview only: the current transaction RPCs do not atomically guard refund
// relationships, source revisions and settlement completion. No link is persisted.
function validateSettlementRefundLinks(rows, members, options) {
  if (!Array.isArray(rows) || !Array.isArray(members) || !options.householdId || !validMonth(options.month) || options.completed === true || !Array.isArray(options.refundLinks) || options.refundLinks.length > 100) throw new Error("refund_preview_scope_invalid");
  const eligible = new Set(members.filter(m => m.user_id && settlementRoleAllowed(m.role) && String(m.role || "") !== "pending").map(m => String(m.user_id)));
  const byId = new Map(rows.map(row => [String(row.id),row]));
  if (byId.size !== rows.length) throw new Error("refund_preview_records_invalid");
  const byExpense = new Map(), byRefund = new Map(), received = new Map(), seen = new Set();
  let total=0;
  for (const link of options.refundLinks) {
    const expense=byId.get(String(link.expense_id)), refund=byId.get(String(link.refund_id));
    const recipient=String(link.recipient_user_id || "");
    const key=JSON.stringify([link.expense_id,link.refund_id,recipient]);
    if (!expense || !refund || seen.has(key) || expense.type !== "expense" || refund.type !== "income" || refund.category !== "환급" ||
        [expense,refund].some(row => String(row.household_id) !== String(options.householdId) || String(row.transaction_date || "").slice(0,7) !== options.month || !isValidTransactionDateString(row.transaction_date) || !Number.isSafeInteger(Number(row.amount)) || Number(row.amount) <= 0 || Number(row.amount) > MAX_TRANSACTION_AMOUNT) ||
        !expense.user_id || !eligible.has(recipient) || String(refund.user_id) !== recipient || !Number.isSafeInteger(link.amount) || link.amount <= 0) throw new Error("refund_preview_link_invalid");
    const expenseAmount=(byExpense.get(String(expense.id))||0)+link.amount;
    const refundAmount=(byRefund.get(String(refund.id))||0)+link.amount;
    if (expenseAmount > Number(expense.amount) || refundAmount > Number(refund.amount)) throw new Error("refund_preview_amount_exceeded");
    seen.add(key);byExpense.set(String(expense.id),expenseAmount);byRefund.set(String(refund.id),refundAmount);
    received.set(recipient,(received.get(recipient)||0)+link.amount);total+=link.amount;
  }
  return {byExpense,byRefund,received,total};
}

function buildSettlementRefundPreview(rows, members, options) {
  validateSettlementRefundLinks(rows,members,options);
  const model=buildSettlementModel(rows,members,options);
  const sum=field=>model.people.reduce((total,person)=>total+person[field],0);
  if (sum("paid")!==model.totalExpense || sum("share")!==model.totalExpense || sum("balance")!==0) throw new Error("refund_preview_balance_invalid");
  return {...model,previewOnly:true};
}

async function settlementRefundPreviewDigest(rows,members,options) {
  return sha256Hex(JSON.stringify([
    options.householdId,options.month,options.mode,settlementConditionPairs(options.mode,options).sort(),
    members.map(m=>[m.user_id,m.role]).sort(),
    rows.map(r=>[r.id,r.household_id,r.user_id,r.type,r.amount,r.category,r.transaction_date,r.memo,r.payment_method]).sort(),
    options.refundLinks.map(link=>[link.expense_id,link.refund_id,link.recipient_user_id,link.amount]).sort(),
  ]));
}

async function handleSettlementRefundPreview(request,env,url) {
  const refundNotice="환급 계산은 미리보기로만 제공합니다. 일반 정산 금액과 완료 이력에는 반영하지 않습니다.";
  const userId=await verifyUserSession(request,env);
  if (!userId) return redirectResponse("/my");
  const params=request.method === "POST" ? await request.formData() : url.searchParams;
  const householdId=String(params.get("household_id")||"");
  const month=validMonth(params.get("month")) || (request.method === "GET" ? currentMonthKst() : "");
  const {selected}=await getMySelectedHousehold(env,userId,householdId);
  if (!selected || selected.id !== householdId || !canManageMyHousehold(selected.role)) return htmlResponse("<main><h1>환급 연결 미리보기</h1><p>이 가계부의 소유자·관리자 권한이 필요합니다.</p></main>",403);
  if (!month) return htmlResponse("<main><p>정산 월을 확인해 주세요.</p></main>",400);
  const [rows,members,historyRaw]=await Promise.all([
    fetchAdminRows(env,{month,householdId,type:"all"}),fetchHouseholdMembers(env,householdId),getSettingValueStrict(env,settlementHistoryKey(householdId)),
  ]);
  const history=parseJsonArraySettingStrict(historyRaw,"settlement_history_json_invalid");
  if (history.some(item=>item?.month===month)) return htmlResponse(`<main><h1>환급 연결 미리보기</h1><p>${refundNotice}</p><p>완료 이력이 있는 달은 환급을 다시 계산하지 않습니다. 기존 완료 이력은 그대로 유지됩니다.</p></main>`,409);
  const mode=["equal","ratio","headcount","item"].includes(params.get("mode"))?params.get("mode"):"equal";
  const conditions=parseSettlementConditions(params,members,rows.filter(r=>r.type==="expense"));
  const options={householdId,month,mode,...conditions,refundLinks:[]};
  let result="",error="",status=200;
  if (request.method === "POST") {
    try {
      const ids=params.getAll("expense_id"),refundIds=params.getAll("refund_id"),recipients=params.getAll("recipient_user_id"),amounts=params.getAll("amount");
      if (ids.length!==refundIds.length || ids.length!==recipients.length || ids.length!==amounts.length || ids.length>3) throw new Error("invalid");
      for(let i=0;i<ids.length;i++) {
        if ([ids[i],refundIds[i],recipients[i],amounts[i]].every(value=>!String(value||"").trim())) continue;
        if (!/^[1-9]\d{0,9}$/.test(String(amounts[i]||""))) throw new Error("invalid");
        options.refundLinks.push({expense_id:String(ids[i]),refund_id:String(refundIds[i]),recipient_user_id:String(recipients[i]),amount:Number(amounts[i])});
      }
      if (!options.refundLinks.length) throw new Error("invalid");
      const model=buildSettlementRefundPreview(rows,members,options);
      const digest=await settlementRefundPreviewDigest(rows,members,options);
      result=`<section aria-live="polite" data-refund-preview-digest="${digest}"><h2>계산 결과 미리보기</h2><p>순지출 ${numberWithCommas(model.totalExpense)}원 · 환급 ${numberWithCommas(model.refundTotal)}원</p><table><thead><tr><th>참여자</th><th>순지출</th><th>부담액</th><th>잔액</th></tr></thead><tbody>${renderSettlementRows(model)}</tbody></table><h3>송금 제안</h3><table><tbody>${renderTransferRows(model.transfers)}</tbody></table><p>${refundNotice} 환급 연결을 저장하거나 실제 정산·완료 이력에 반영하지 않았습니다.</p></section>`;
    } catch (_) {status=400;error="<p role=\"alert\">연결할 기록·실제 수령자·금액을 확인해 주세요. 같은 월의 환급 수입만 선택할 수 있으며 기록별 금액을 넘길 수 없습니다. 아무 내용도 저장하지 않았습니다.</p>";}
  }
  const expenses=rows.filter(r=>r.type==="expense");
  const refunds=rows.filter(r=>r.type==="income"&&r.category==="환급");
  const eligible=members.filter(m=>m.user_id&&settlementRoleAllowed(m.role)&&m.role!=="pending");
  const select=(name,label,items,index)=>`<label>${label}<select name="${name}"><option value="">선택해 주세요</option>${items.map(([value,text])=>`<option value="${escapeHtml(value)}"${String(params.getAll(name)[index]||"")===String(value)?" selected":""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
  const rowOptions=list=>list.map(r=>[r.id,`${r.transaction_date} · ${r.memo||r.category} · ${numberWithCommas(r.amount)}원`]);
  const fields=Array.from({length:3},(_,i)=>`<fieldset><legend>환급 연결 ${i+1}</legend>${select("expense_id","원래 지출",rowOptions(expenses),i)}${select("refund_id","기존 환급 기록",rowOptions(refunds),i)}${select("recipient_user_id","실제 환급 수령자",eligible.map(m=>[m.user_id,m.nickname||"구성원"]),i)}<label>미리보기에 적용할 환급액<input name="amount" inputmode="numeric" value="${escapeHtml(params.getAll("amount")[i]||"")}"/></label></fieldset>`).join("");
  const weightInputs=eligible.map(m=>`<label>${escapeHtml(m.nickname||"구성원")} 부담 비율·인원수<input type="number" name="weight_${escapeHtml(m.user_id)}" min="0.1" max="1000" step="0.1" value="${escapeHtml(conditions.weights[m.user_id]||1)}"/></label>`).join("");
  const itemInputs=expenses.slice(0,40).map(row=>`<fieldset><legend>${escapeHtml(row.memo||row.category)} 품목별 참여자</legend>${eligible.map(m=>`<label><input type="checkbox" name="item_${escapeHtml(row.id)}" value="${escapeHtml(m.user_id)}"${!conditions.itemParticipants[row.id]||conditions.itemParticipants[row.id].includes(m.user_id)?" checked":""}/> ${escapeHtml(m.nickname||"구성원")}</label>`).join("")}</fieldset>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>환급 연결 미리보기</title><style>main{max-width:900px;margin:auto;padding:24px;font-family:system-ui}label{display:block;margin:12px 0}input,select,button{min-height:44px;max-width:100%;font:inherit}fieldset,section{margin:20px 0;padding:16px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ccc;text-align:left}</style></head><body><main><h1>환급 연결 미리보기</h1><p>${escapeHtml(selected.name)} · ${escapeHtml(month)}</p><p>원래 지출과 기존 환급 수입, 실제 수령자, 미리보기에 적용할 환급액을 선택해 계산을 확인합니다. 수령자는 환급 기록에 지정된 사람과 같아야 합니다. 명시적으로 연결한 적격 환급만 이 미리보기에서 계산합니다. 일반 수입과 연결하지 않은 환급은 미리보기 계산에서 제외합니다.</p><p>${refundNotice} 교차 월과 완료 이력은 다시 계산하지 않습니다.</p>${error}${result}<form method="post" action="/my/settlement/refund-preview"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><label>정산 방식<select name="mode">${[["equal","동일 부담"],["ratio","비율"],["headcount","인원수"],["item","품목별"]].map(([value,text])=>`<option value="${value}"${mode===value?" selected":""}>${text}</option>`).join("")}</select></label>${fields}<details><summary>부담 조건</summary>${weightInputs}${itemInputs}</details><button type="submit">계산 미리보기</button></form><p><a href="/settlement-summary?household_id=${encodeURIComponent(householdId)}&month=${encodeURIComponent(month)}">정산 요약으로 돌아가기</a></p></main></body></html>`,status);
}
// @build:exports-start
export {
  buildSettlementRefundPreview, handleSettlementRefundPreview, settlementRefundPreviewDigest,
  validateSettlementRefundLinks,
};
// @build:exports-end
