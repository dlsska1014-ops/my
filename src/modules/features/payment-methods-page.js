// @build:imports-start
import { cardPerformanceEnabled } from "../public/site-config.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import {
  PAYMENT_ASSET_GROUP_CATALOG, PAYMENT_ASSET_KIND_CATALOG, computePaymentAssetTotals,
  fetchAssetHistory, fetchPaymentAssets, isValidPaymentAssetKind, normalizePaymentAssetAmount,
  paymentAssetGroupMeta, paymentAssetKindMeta, paymentMethodsLocation,
} from "../settings/payment-assets.js";
import {
  fetchAdminRows, getScopedHouseholdsForPage, selectRequestedScopedHousehold,
} from "../data/households-members-rows.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { formatMessage } from "../kakao/reply-texts.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function shiftMonthKey(month = "", delta = 0) {
  const m = validMonth(month) || currentMonthKst();
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMoneyShortKo(n) {
  const v = Math.round(Number(n || 0));
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 100000000) {
    const eok = abs / 100000000;
    const num = eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : String(Math.round(eok * 10) / 10);
    return `${sign}${num}억`;
  }
  if (abs >= 10000) return `${sign}${Math.round(abs / 10000).toLocaleString("ko-KR")}만`;
  return `${sign}${abs.toLocaleString("ko-KR")}원`;
}

function paymentAssetFreshness(a = {}) {
  const t = Date.parse(a.balance_updated_at || a.updated_at || "");
  if (!Number.isFinite(t) || t < Date.parse("2001-01-01T00:00:00Z")) return { label: "잔액 업데이트 필요", stale: true };
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return { label: "오늘 업데이트", stale: false };
  if (days === 1) return { label: "어제 업데이트", stale: false };
  if (days < 31) return { label: `${days}일 전 업데이트`, stale: days >= 14 };
  return { label: `${Math.floor(days / 30)}달 전 업데이트`, stale: true };
}

function computeCardUsageMap(assets = [], rows = []) {
  const cards = safeArray(assets).filter((a) => paymentAssetKindMeta(a.kind).group === "card");
  const usage = {};
  for (const c of cards) usage[c.id] = { count: 0, amount: 0 };
  if (!cards.length) return usage;
  for (const r of safeArray(rows)) {
    if (String(r.type) === "income") continue;
    const pm = normalizeText(r.payment_method || "");
    if (!pm) continue;
    let best = null;
    let bestLen = 0;
    for (const c of cards) {
      const nm = normalizeText(c.name);
      const issuer = normalizeText(c.issuer || "");
      const hit = (nm && (pm === nm || pm.includes(nm))) || (issuer && issuer.length >= 2 && pm.includes(issuer) && /카드/.test(pm));
      if (hit && nm.length >= bestLen) { best = c; bestLen = nm.length; }
    }
    if (best) {
      usage[best.id].count += 1;
      usage[best.id].amount += Number(r.amount || 0);
    }
  }
  return usage;
}

function findPaymentAssetForMethod(methodName = "", assets = []) {
  const method = normalizeText(methodName);
  if (!method || method === "미지정") return null;
  const candidates = safeArray(assets).map((asset) => {
    const name = normalizeText(asset.name);
    const issuer = normalizeText(asset.issuer || "");
    let score = 0;
    if (name && method === name) score = 1000 + name.length;
    else if (name && (method.includes(name) || name.includes(method))) score = 500 + Math.min(name.length, method.length);
    else if (issuer.length >= 2 && method.includes(issuer)) score = 200 + issuer.length;
    return { asset, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  return candidates[0]?.asset || null;
}

function guessAssetKindFromMethodName(name = "") {
  const t = normalizeText(name);
  if (/체크/.test(t)) return "check_card";
  if (/카드/.test(t)) return "credit_card";
  if (/(페이|토스|포인트)/.test(t)) return "easy_pay";
  if (/현금/.test(t)) return "cash";
  if (/(통장|계좌|이체|은행|뱅크)/.test(t)) return "bank_account";
  return "credit_card";
}

const ASSET_QUICK_PRESETS = [
  { name: "생활비 통장", kind: "bank_account", issuer: "카카오뱅크" },
  { name: "비상금 통장", kind: "bank_account", issuer: "토스뱅크" },
  { name: "현금 지갑", kind: "cash", issuer: "" },
  { name: "적금", kind: "savings", issuer: "" },
  { name: "청약저축", kind: "savings", issuer: "" },
  { name: "주식 계좌", kind: "investment", issuer: "" },
  { name: "전세 보증금", kind: "real_estate", issuer: "" },
  { name: "신용카드", kind: "credit_card", issuer: "" },
  { name: "주택담보대출", kind: "loan", issuer: "" },
];

const ASSET_ISSUER_SUGGESTIONS = ["KB국민", "신한", "우리", "하나", "NH농협", "IBK기업", "카카오뱅크", "토스뱅크", "케이뱅크", "SC제일", "씨티", "우체국", "새마을금고", "신협", "수협", "부산은행", "대구은행", "광주은행", "삼성증권", "미래에셋증권", "키움증권", "NH투자증권", "한국투자증권", "토스증권", "카카오페이증권", "현대카드", "삼성카드", "롯데카드", "BC카드", "카카오페이", "네이버페이", "토스", "페이코"];

function renderAssetTrendSvg(points = []) {
  const known = points.filter((p) => p.value !== null && p.value !== undefined);
  if (known.length < 2) return "";
  const W = 640;
  const H = 210;
  const padT = 30;
  const padB = 28;
  const vals = known.map((p) => p.value);
  let min = Math.min(0, ...vals);
  let max = Math.max(0, ...vals);
  if (min === max) max = min + 1;
  const innerH = H - padT - padB;
  const slot = W / points.length;
  const barW = Math.min(64, Math.round(slot * 0.52));
  const y = (v) => padT + ((max - v) / (max - min)) * innerH;
  const zeroY = y(0);
  const parts = [`<line x1="0" y1="${zeroY.toFixed(1)}" x2="${W}" y2="${zeroY.toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>`];
  points.forEach((p, i) => {
    const cx = slot * i + slot / 2;
    parts.push(`<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="#94a3b8">${Number(String(p.month).slice(5, 7))}월</text>`);
    if (p.value === null || p.value === undefined) {
      parts.push(`<text x="${cx.toFixed(1)}" y="${(zeroY - 8).toFixed(1)}" text-anchor="middle" font-size="11" fill="#cbd5e1">기록없음</text>`);
      return;
    }
    const vy = y(p.value);
    const top = Math.min(vy, zeroY);
    const hgt = Math.max(2, Math.abs(zeroY - vy));
    const color = p.current ? (p.value < 0 ? "#ef4444" : "#3182F6") : (p.value < 0 ? "#fca5a5" : "#cbd5e1");
    parts.push(`<rect x="${(cx - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW}" height="${hgt.toFixed(1)}" rx="7" fill="${color}"/>`);
    parts.push(`<text x="${cx.toFixed(1)}" y="${(top - 7).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="${p.current ? "#1d4ed8" : "#64748b"}">${formatMoneyShortKo(p.value)}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 순자산 추이" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
}

function renderAssetDonutHtml(totals = {}) {
  const groupTotals = safeObject(totals.groupTotals);
  const segs = PAYMENT_ASSET_GROUP_CATALOG.filter((g) => g.id !== "debt" && g.id !== "card").map((g) => ({ ...g, amount: Math.max(0, Math.round(Number(groupTotals[g.id] || 0))) })).filter((s) => s.amount > 0);
  const total = segs.reduce((s, x) => s + x.amount, 0);
  if (total <= 0) return "";
  let acc = 0;
  const stops = segs.map((s) => {
    const from = (acc / total) * 100;
    acc += s.amount;
    return `${s.color} ${from.toFixed(2)}% ${((acc / total) * 100).toFixed(2)}%`;
  }).join(",");
  const legend = segs.slice().sort((a, b) => b.amount - a.amount).map((s) => `<li><i style="background:${s.color}"></i><span>${escapeHtml(s.label)}</span><b>${numberWithCommas(s.amount)}원</b><em>${Math.round((s.amount / total) * 100)}%</em></li>`).join("");
  return `<div class="donutWrap"><div class="donut" style="background:conic-gradient(${stops})"><i><b>${formatMoneyShortKo(total)}</b><small>포함 자산</small></i></div><ul class="assetLegend">${legend}</ul></div>`;
}

function renderPaymentAssetRow(a, ctx = {}) {
  const meta = paymentAssetKindMeta(a.kind);
  const group = paymentAssetGroupMeta(meta.group);
  const fresh = paymentAssetFreshness(a);
  const isCard = meta.side === "card";
  const isLoan = meta.side === "liability";
  const usage = safeObject(ctx.usageMap)[a.id] || { count: 0, amount: 0 };
  const excluded = meta.side === "asset" && a.include_in_asset === false;
  const subBits = [];
  if (a.issuer) subBits.push(escapeHtml(a.issuer));
  subBits.push(escapeHtml(meta.label));
  const freshHtml = isCard ? "" : ` · <em class="${fresh.stale ? "stale" : ""}">${escapeHtml(fresh.label)}</em>`;
  let valueMain = `${numberWithCommas(a.balance || 0)}원`;
  let valueSub = "";
  if (isCard) {
    valueMain = `${numberWithCommas(usage.amount)}원`;
    valueSub = usage.count ? `이번 달 ${numberWithCommas(usage.count)}건 사용` : "이번 달 사용 없음";
  } else if (isLoan) {
    valueSub = "남은 원금";
  } else if (excluded) {
    valueSub = "합계 제외";
  }
  const summaryInner = `<span class="rowIcon" style="background:${group.color}1f">${meta.icon}</span><span class="rowMain"><b>${escapeHtml(a.name)}</b><small>${subBits.join(" · ")}${freshHtml}</small></span><span class="rowVal${isLoan ? " loanVal" : ""}"><strong>${isLoan ? "-" : ""}${valueMain}</strong>${valueSub ? `<small>${valueSub}</small>` : ""}</span>`;
  if (!ctx.canManage) {
    return `<div class="assetRow${excluded ? " excluded" : ""}"><div class="rowStatic">${summaryInner}</div></div>`;
  }
  const hidden = `<input type="hidden" name="month" value="${escapeHtml(ctx.month)}"/><input type="hidden" name="household_id" value="${escapeHtml(ctx.householdId)}"/><input type="hidden" name="id" value="${escapeHtml(a.id)}"/>`;
  const kindOptions = PAYMENT_ASSET_KIND_CATALOG.map((k) => `<option value="${k.kind}"${k.kind === a.kind ? " selected" : ""}>${k.icon} ${escapeHtml(k.label)}</option>`).join("");
  const quickForm = isCard ? "" : `<form class="quickBal" method="post" action="/admin/payment-asset/update">${hidden}<input type="hidden" name="mode" value="balance"/><label>지금 잔액${isLoan ? " (남은 원금)" : ""}<input name="balance" inputmode="numeric" value="${Math.round(Number(a.balance || 0))}"/></label><button type="submit">잔액 저장</button></form>`;
  const cardLink = a.kind === "credit_card" && ctx.cardBenefitsEnabled ? `<a class="cardCalcLink" href="/card-benefits?month=${encodeURIComponent(ctx.month)}&household_id=${encodeURIComponent(ctx.householdId)}">이 카드 혜택·실적 계산 →</a>` : "";
  return `<details class="assetRow${excluded ? " excluded" : ""}"><summary>${summaryInner}<span class="chev">▾</span></summary><div class="rowBody">${quickForm}${cardLink}<details class="editBox"><summary>상세 정보 수정</summary><form class="editGrid" method="post" action="/admin/payment-asset/update">${hidden}<input type="hidden" name="mode" value="edit"/><label>이름<input name="name" required value="${escapeHtml(a.name)}"/></label><label>종류<select name="kind">${kindOptions}</select></label><label>은행·발급사<input name="issuer" value="${escapeHtml(a.issuer || "")}" list="assetIssuerList"/></label><label>잔액·평가액<input name="balance" inputmode="numeric" value="${normalizePaymentAssetAmount(a.balance)}"/></label><label>메모<input name="memo" value="${escapeHtml(a.memo || "")}"/></label><label class="chk"><input type="checkbox" name="include_in_asset" value="on"${a.include_in_asset !== false ? " checked" : ""}/> 자산 합계에 포함</label><button type="submit">수정 저장</button></form></details><form class="delForm" method="post" action="/admin/payment-asset/delete" onsubmit="return confirm('이 자산 항목을 삭제할까요?')">${hidden}<button class="delBtn" type="submit">삭제</button></form></div></details>`;
}

function renderAssetGroupCards(assets = [], ctx = {}) {
  const usageMap = safeObject(ctx.usageMap);
  const out = [];
  for (const g of PAYMENT_ASSET_GROUP_CATALOG) {
    const items = safeArray(assets).filter((a) => paymentAssetKindMeta(a.kind).group === g.id);
    if (!items.length) continue;
    const isCardGroup = g.id === "card";
    const sorted = items.slice().sort((x, y) => {
      if (isCardGroup) return (usageMap[y.id]?.amount || 0) - (usageMap[x.id]?.amount || 0);
      return Math.abs(Number(y.balance || 0)) - Math.abs(Number(x.balance || 0));
    });
    const subtotal = isCardGroup
      ? sorted.reduce((s, a) => s + (usageMap[a.id]?.amount || 0), 0)
      : sorted.reduce((s, a) => s + (paymentAssetKindMeta(a.kind).side === "asset" && a.include_in_asset === false ? 0 : Math.abs(Number(a.balance || 0))), 0);
    const gIcon = (PAYMENT_ASSET_KIND_CATALOG.find((k) => k.group === g.id) || {}).icon || "💼";
    const subLabel = isCardGroup ? "이번 달 사용" : g.id === "debt" ? "남은 부채" : "합계";
    out.push(`<section class="card groupCard"><div class="groupHead"><h3><i style="background:${g.color}1f">${gIcon}</i>${escapeHtml(g.label)}<span class="cnt">${items.length}</span></h3><div class="groupSum${g.id === "debt" ? " neg" : ""}"><small>${subLabel}</small><b>${g.id === "debt" ? "-" : ""}${numberWithCommas(subtotal)}원</b></div></div><div class="rowList">${sorted.map((a) => renderPaymentAssetRow(a, ctx)).join("")}</div>${isCardGroup ? `<p class="note">카드 사용액은 이번 달 거래내역에서 결제수단·카드사 이름이 일치하는 지출을 자동으로 더한 금액입니다.</p>` : ""}</section>`);
  }
  return out.join("");
}

function renderAssetQuickPresets(month = "", householdId = "", limit = ASSET_QUICK_PRESETS.length) {
  return ASSET_QUICK_PRESETS.slice(0, Math.max(0, Number(limit || 0))).map((p) => `<a class="preset" href="${escapeHtml(paymentMethodsLocation(month, householdId, { add_name: p.name, add_kind: p.kind, add_issuer: p.issuer }))}#add">${escapeHtml(p.name)}</a>`).join("");
}

function renderAssetAddSection(ctx = {}) {
  if (!ctx.canManage) {
    return `<section class="card" id="add"><h2>자산·결제수단 관리</h2><p class="note">추가·수정·삭제는 가계부 소유자와 관리자만 할 수 있습니다. 변경이 필요하면 가계부 관리자에게 요청해 주세요.</p><p class="privacyNote"><b>공유 범위</b> 이 화면의 금액과 별칭은 해당 가계부 참여자에게 공유됩니다.</p></section>`;
  }
  const pre = safeObject(ctx.prefill);
  const selectedKind = isValidPaymentAssetKind(pre.kind) ? pre.kind : "bank_account";
  const primaryKindIds = new Set(["bank_account", "cash", "savings", "investment", "credit_card", "loan"]);
  const renderKind = (k) => `<label class="kindChip"><input type="radio" name="kind" value="${k.kind}"${k.kind === selectedKind ? " checked" : ""}/><span><i aria-hidden="true">${escapeHtml(k.label.slice(0, 1))}</i>${escapeHtml(k.label)}</span></label>`;
  const primaryKinds = PAYMENT_ASSET_KIND_CATALOG.filter((k) => primaryKindIds.has(k.kind)).map(renderKind).join("");
  const moreKinds = PAYMENT_ASSET_KIND_CATALOG.filter((k) => !primaryKindIds.has(k.kind)).map(renderKind).join("");
  return `<section class="card assetAddCard" id="add"><div class="assetAddHead"><div><span class="sectionKicker">새 항목</span><h2>자산·결제수단 추가</h2><p class="note">필수 입력은 이름과 금액 두 가지뿐입니다. 카드라면 금액을 비워도 됩니다.</p></div><span class="timeBadge">약 1분</span></div><form method="post" action="/admin/payment-asset/create"><input type="hidden" name="month" value="${escapeHtml(ctx.month)}"/><input type="hidden" name="household_id" value="${escapeHtml(ctx.householdId)}"/><fieldset class="assetKindField"><legend>1. 종류를 선택하세요</legend><div class="kindChips primaryKinds">${primaryKinds}</div><details class="kindMore" ${primaryKindIds.has(selectedKind) ? "" : "open"}><summary>다른 자산 종류 보기</summary><div class="kindChips">${moreKinds}</div></details></fieldset><div class="assetFormStep"><h3>2. 이름과 현재 금액을 입력하세요</h3><div class="assetCoreGrid"><label>이름<input name="name" required autocomplete="off" placeholder="예: 생활비 통장, 신한카드" value="${escapeHtml(pre.name || "")}"/></label><label>현재 잔액·평가액<input name="balance" inputmode="numeric" autocomplete="off" placeholder="예: 500000"/><small>대출은 남은 원금을 양수로 입력하세요.</small></label></div><details class="assetOptional"><summary>은행·발급사와 메모 입력 <span>선택</span></summary><div class="assetOptionalGrid"><label>은행·발급사<input name="issuer" list="assetIssuerList" autocomplete="organization" placeholder="예: 카카오뱅크, 신한" value="${escapeHtml(pre.issuer || "")}"/></label><label>메모<input name="memo" autocomplete="off" placeholder="예: 생활비 주계좌"/></label><label class="chk"><input type="checkbox" name="include_in_asset" value="on" checked/> 자산 합계에 포함 <small>카드·부채는 자동 제외</small></label></div></details></div><div class="assetFormAction"><p>계좌번호·카드번호 전체는 입력하지 마세요.</p><button class="primaryBtn" type="submit">자산 추가하기</button></div></form><datalist id="assetIssuerList">${ASSET_ISSUER_SUGGESTIONS.map((x) => `<option value="${escapeHtml(x)}"></option>`).join("")}</datalist><details class="privacyDisclosure"><summary>누가 이 정보를 볼 수 있나요?</summary><p>금액과 별칭은 해당 가계부 참여자에게 공유됩니다. 계좌번호·카드번호 전체, 비밀번호, 인증번호는 저장하지 마세요.</p></details></section>`;
}

const PAYMENT_METHODS_PAGE_STYLE = `*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f4f6fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;overflow-x:hidden}.srOnly{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero{background:linear-gradient(135deg,#0b1220 0%,#1e3a8a 62%,#2563eb 100%);color:#fff;border-radius:28px;padding:24px 22px;margin:12px 0;box-shadow:0 18px 42px rgba(15,23,42,.22)}.heroLabel{margin:0;font-size:13px;font-weight:800;color:#bfdbfe;letter-spacing:.02em}.heroNet{font-size:38px;overflow-wrap:anywhere;font-weight:1000;letter-spacing:-.02em;margin:4px 0 2px}.heroDelta{margin:2px 0 0;font-size:14px;font-weight:800}.heroDelta.up{color:#6ee7b7}.heroDelta.down{color:#fca5a5}.heroDelta.flat{color:#cbd5e1;font-weight:600}.heroChips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.heroChips span{background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:7px 12px;font-size:13px;font-weight:800}.heroChips span.dim{background:transparent;color:#bfdbfe;font-weight:600}.filters{display:grid;grid-template-columns:1.4fr 1fr auto;gap:8px;margin-top:16px}.filters select,.filters input,.filters button{height:44px;border:1px solid rgba(255,255,255,.25);border-radius:14px;padding:0 12px;background:rgba(255,255,255,.95);font:inherit}.filters button{background:#fff;color:#1e3a8a;font-weight:1000;cursor:pointer}.card{background:#fff;border:1px solid #e7eaf0;border-radius:24px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.05);overflow:hidden;min-width:0}.card h2{margin:0 0 10px;font-size:18px}.note{color:#64748b;font-size:13px;line-height:1.55}.ok{background:#e8f6ec;color:#166534;border:1px solid #bbe3c8;border-radius:14px;padding:11px 13px;margin:10px 0;font-weight:700}.error{background:#fdeeea;color:#9a3412;border:1px solid #f5cbb9;border-radius:14px;padding:11px 13px;margin:10px 0;font-weight:700}.donutWrap{display:grid;grid-template-columns:190px 1fr;gap:18px;align-items:center}.donut{position:relative;width:180px;height:180px;border-radius:50%}.donut i{position:absolute;inset:34px;background:#fff;border-radius:50%;display:grid;place-content:center;text-align:center;font-style:normal}.donut i b{font-size:20px}.donut i small{display:block;color:#64748b;font-size:11px;margin-top:2px}.assetLegend{list-style:none;margin:0;padding:0;display:grid;gap:8px}.assetLegend li{display:grid;grid-template-columns:12px 1fr auto auto;gap:8px;align-items:center;font-size:13px}.assetLegend i{width:12px;height:12px;border-radius:4px;display:block}.assetLegend b{font-weight:900}.assetLegend em{font-style:normal;color:#64748b;width:38px;text-align:right}.trendWrap svg{width:100%;height:auto;display:block}.groupHead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}.groupHead h3{display:flex;align-items:center;gap:8px;margin:0;font-size:16px}.groupHead h3 i{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;font-style:normal;font-size:17px}.groupHead .cnt{color:#94a3b8;font-size:13px;font-weight:800}.groupSum{text-align:right}.groupSum small{display:block;color:#94a3b8;font-size:11px;font-weight:800}.groupSum b{font-size:17px}.groupSum.neg b{color:#dc2626}.rowList{display:grid}.assetRow{border-top:1px solid #f1f5f9}.assetRow>summary,.rowStatic{display:grid;grid-template-columns:40px 1fr auto 16px;gap:12px;align-items:center;padding:12px 2px;list-style:none}.rowStatic{grid-template-columns:40px 1fr auto}.assetRow>summary{cursor:pointer}.assetRow>summary::-webkit-details-marker{display:none}.rowIcon{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;font-size:19px}.rowMain{min-width:0}.rowMain b{display:block;font-size:15px;overflow-wrap:anywhere}.rowMain small{display:block;color:#64748b;font-size:12px;margin-top:2px}.rowMain em{font-style:normal}.rowMain em.stale{color:#b45309;font-weight:800}.rowVal{text-align:right}.rowVal strong{font-size:15px;white-space:nowrap}.rowVal small{display:block;color:#94a3b8;font-size:11px;margin-top:2px}.rowVal.loanVal strong{color:#dc2626}.excluded>summary,.excluded .rowStatic{opacity:.55}.chev{color:#cbd5e1;transition:transform var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}.assetRow[open]>summary .chev{transform:rotate(180deg)}.rowBody{background:#f8fafc;border:1px solid #eef2f7;border-radius:16px;padding:12px;margin:0 0 12px;display:grid;gap:10px}.quickBal{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.quickBal label{display:grid;gap:5px;font-size:12px;font-weight:900;color:#475569}.quickBal input{height:44px;border:1px solid #d1d5db;border-radius:12px;padding:0 12px;font:inherit;font-weight:800}.quickBal button{height:44px;border:0;border-radius:12px;background:#1d4ed8;color:#fff;font-weight:1000;padding:0 16px;cursor:pointer}.editBox>summary{cursor:pointer;color:#475569;font-weight:900;font-size:13px}.editGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px}.editGrid label{display:grid;gap:5px;font-size:12px;font-weight:900;color:#475569}.editGrid input,.editGrid select{height:42px;border:1px solid #d1d5db;border-radius:12px;padding:0 10px;font:inherit;background:#fff;width:100%}.editGrid .chk{display:flex;align-items:center;gap:8px;font-size:13px}.editGrid button{height:42px;border:0;border-radius:12px;background:#111827;color:#fff;font-weight:1000;cursor:pointer}.delForm{display:flex;justify-content:flex-end}.delBtn{height:34px;border:0;border-radius:10px;background:#fee2e2;color:#991b1b;font-weight:900;padding:0 12px;cursor:pointer}.cardCalcLink{font-size:13px;font-weight:900;color:#1d4ed8;text-decoration:none}.kindChips{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;margin:10px 0}.kindChip{position:relative}.kindChip input{position:absolute;opacity:0;pointer-events:none}.kindChip span{display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid #e2e8f0;border-radius:14px;padding:10px 6px;font-size:12px;font-weight:900;color:#475569;background:#fff;cursor:pointer;text-align:center}.kindChip span i{font-style:normal;font-size:19px}.kindChip input:checked+span{border-color:#1d4ed8;background:#eff6ff;color:#1d4ed8;box-shadow:0 0 0 3px rgba(29,78,216,.12)}.formGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}.formGrid label{display:grid;gap:5px;font-size:12px;font-weight:900;color:#475569}.formGrid input{height:44px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;font:inherit;width:100%}.formGrid .chk{display:flex;align-items:center;gap:8px;font-size:13px}.formGrid .chk small{color:#64748b;font-weight:700}.privacyNote{background:#fff7ed;border:1px solid #fed7aa;color:#92400e;border-radius:14px;padding:11px 12px;font-size:13px;line-height:1.55}.primaryBtn{height:44px;border:0;border-radius:13px;background:#1d4ed8;color:#fff;font-weight:1000;cursor:pointer}.presetRow{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px;align-items:center}.presetRow>span{color:#94a3b8;font-size:12px;font-weight:900}.preset{display:inline-flex;align-items:center;gap:4px;border:1px solid #dbe3ee;background:#f8fafc;border-radius:999px;padding:7px 11px;font-size:12.5px;font-weight:900;color:#334155;text-decoration:none}.preset.warn{background:#fff7ed;border-color:#fed7aa;color:#9a3412}.unregBox{background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:12px;margin-bottom:12px}.unregBox b{font-size:14px}.unregBox p{margin:4px 0 0;color:#92400e;font-size:12.5px;line-height:1.5}.steps{margin:8px 0 0;padding-left:18px;color:#475569;line-height:1.7;font-size:14px}.tableWrap{overflow-x:auto;-webkit-overflow-scrolling:touch}table{width:100%;border-collapse:collapse;min-width:680px}th,td{border-bottom:1px solid #eef2f7;padding:10px;text-align:left;font-size:13px}th{color:#64748b;font-size:12px}.badge{display:inline-flex;border-radius:999px;padding:4px 9px;font-size:11.5px;font-weight:900}.badge.okb{background:#dcfce7;color:#166534}:where(a,button,input,select,summary):focus-visible{outline:3px solid #93c5fd;outline-offset:2px}.regLink{color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:999px;padding:4px 9px;font-size:11.5px;font-weight:900;text-decoration:none}@media(max-width:760px){.groupSum{width:100%;text-align:left;padding-left:44px}.wrap{padding:12px 12px 90px}.heroNet{font-size:31px}.filters{grid-template-columns:1fr}.donutWrap{grid-template-columns:1fr;justify-items:center}.assetLegend{width:100%}.quickBal{grid-template-columns:1fr}.assetRow>summary{grid-template-columns:36px 1fr auto 12px;gap:8px}.rowStatic{grid-template-columns:36px 1fr auto;gap:8px}.rowIcon{width:36px;height:36px;font-size:17px}}`;

async function handlePaymentMethodsPage(request, env, url) {
  const scoped = await getScopedHouseholdsForPage(request, env);
  if (scoped.scope === "none") return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const monthLabel = `${Number(month.slice(5, 7))}월`;
  const households = scoped.households;
  const requestedHouseholdId = String(url.searchParams.get("household_id") || "").trim();
  const selected = selectRequestedScopedHousehold(households, requestedHouseholdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  const householdId = selected?.id || "";
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  const canManage = scoped.scope === "admin" || scoped.adminOk || ["owner", "admin"].includes(String(selected?.role || "").toLowerCase());
  const prefill = {
    name: String(url.searchParams.get("add_name") || "").slice(0, 80),
    kind: String(url.searchParams.get("add_kind") || ""),
    issuer: String(url.searchParams.get("add_issuer") || "").slice(0, 80),
  };
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  const rows = await fetchAdminRows(env, { month, householdId, type: "all" });
  const assets = await fetchPaymentAssets(env, householdId);
  const history = await fetchAssetHistory(env, householdId);
  const totals = computePaymentAssetTotals(assets);
  const usageMap = computeCardUsageMap(assets, rows);
  const cardUsageTotal = Object.values(usageMap).reduce((s, u) => s + Number(u.amount || 0), 0);
  const creditCardUsageTotal = assets.filter((asset) => asset.kind === "credit_card").reduce((sum, asset) => sum + Number(usageMap[asset.id]?.amount || 0), 0);
  const nowMonth = currentMonthKst();
  const methods = {};
  for (const r of rows) {
    const key = String(r.payment_method || "미지정").trim() || "미지정";
    if (!methods[key]) methods[key] = { name: key, count: 0, expense: 0, income: 0 };
    if (r.type === "income") methods[key].income += Number(r.amount || 0);
    else {
      methods[key].count += 1;
      methods[key].expense += Number(r.amount || 0);
    }
  }
  const prevKey = Object.keys(history).sort().filter((m) => m < nowMonth).pop() || "";
  const prev = prevKey ? history[prevKey] : null;
  let deltaHtml;
  if (prev) {
    const diff = totals.netWorth - prev.net_worth;
    const pctBase = Math.abs(prev.net_worth);
    const pct = pctBase > 0 ? Math.round((Math.abs(diff) / pctBase) * 1000) / 10 : null;
    const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "―";
    deltaHtml = `<p class="heroDelta ${dir}">${arrow} ${Number(prevKey.slice(5, 7))}월 대비 ${diff === 0 ? "변화 없음" : `${diff > 0 ? "+" : "-"}${numberWithCommas(Math.abs(diff))}원`}${pct !== null && diff !== 0 ? ` (${pct}%)` : ""}</p>`;
  } else {
    deltaHtml = `<p class="heroDelta flat">잔액을 저장하면 매달 순자산이 자동 기록되어 다음 달부터 증감을 보여드려요.</p>`;
  }
  const trendPoints = [];
  for (let d = -5; d <= 0; d += 1) {
    const m = shiftMonthKey(nowMonth, d);
    if (d === 0) trendPoints.push({ month: m, value: totals.netWorth, current: true });
    else trendPoints.push({ month: m, value: history[m] ? history[m].net_worth : null });
  }
  const trendSvg = renderAssetTrendSvg(trendPoints);
  const donutHtml = renderAssetDonutHtml(totals);
  const ctx = { month, householdId, usageMap, prefill, canManage, cardBenefitsEnabled: cardPerformanceEnabled(env) };
  const groupsHtml = renderAssetGroupCards(assets, ctx);
  const unregistered = Object.values(methods).filter((m) => m.name !== "미지정" && normalizeText(m.name) && !findPaymentAssetForMethod(m.name, assets));
  const unregChips = canManage ? unregistered.map((m) => `<a class="preset warn" href="${escapeHtml(paymentMethodsLocation(month, householdId, { add_name: m.name, add_kind: guessAssetKindFromMethodName(m.name) }))}#add">＋ ${escapeHtml(m.name)} 등록</a>`).join("") : "";
  const pmDrill = `/app?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}`;
  const methodRows = Object.values(methods).sort((a, b) => b.expense - a.expense).map((m) => {
    const matchedAsset = findPaymentAssetForMethod(m.name, assets);
    const isRegistered = !!matchedAsset;
    const nameCell = m.name === "미지정" ? escapeHtml(m.name) : `<a style="color:#2563eb;text-decoration:none;font-weight:1000" href="${escapeHtml(`${pmDrill}&payment_method=${encodeURIComponent(m.name)}&feed=all`)}#feed">${escapeHtml(m.name)}</a>`;
    const status = m.name === "미지정"
      ? `<span class="note">결제수단 없이 기록된 거래</span>`
      : isRegistered
        ? `<span class="badge okb">${escapeHtml(matchedAsset.name)} 연결</span>`
        : canManage
          ? `<a class="regLink" href="${escapeHtml(paymentMethodsLocation(month, householdId, { add_name: m.name, add_kind: guessAssetKindFromMethodName(m.name) }))}#add">＋ 빠른 등록</a>`
          : `<span class="note">필요 시 등록</span>`;
    return `<tr><td>${nameCell}</td><td>${numberWithCommas(m.count)}건</td><td>${numberWithCommas(m.expense)}원</td><td>${numberWithCommas(m.income)}원</td><td>${status}</td></tr>`;
  }).join("") || `<tr><td colspan="5">${escapeHtml(monthLabel)} 결제수단 데이터가 없습니다.</td></tr>`;
  const summarySections = assets.length
    ? `${donutHtml ? `<section class="card"><h2>자산 구성</h2>${donutHtml}</section>` : ""}<section class="card"><h2>순자산 추이</h2>${trendSvg ? `<div class="trendWrap">${trendSvg}</div>` : `<p class="note">아직 지난달 기록이 없습니다. 잔액을 저장할 때마다 이번 달 순자산이 자동 기록되고, 다음 달부터 막대 그래프로 추이를 보여드립니다.</p>`}</section>${groupsHtml}`
    : `<section class="card assetEmptyState"><div class="assetEmptyMain"><span class="assetEmptyMark" aria-hidden="true">＋</span><div><h2>아직 등록된 자산이 없어요</h2><p class="note">통장이나 카드 하나만 등록해도 순자산과 월별 변화를 확인할 수 있습니다.</p></div>${canManage ? `<a class="emptyCta" href="#add">첫 자산 등록하기</a>` : ""}</div>${canManage ? `<div class="presetRow compactPresets"><span>예시로 시작</span>${renderAssetQuickPresets(month, householdId, 3)}</div>` : `<p class="note">자산 등록은 가계부 소유자/관리자만 할 수 있습니다.</p>`}</section>`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>자산·결제수단</title><style>${PAYMENT_METHODS_PAGE_STYLE}</style></head><body>${renderUnifiedNav("payment-methods", { month, householdId, householdName: (households.find((h) => h.id === householdId) || {}).name })}<main class="wrap"><section class="hero"><p class="heroLabel">현재 순자산</p><div class="heroNet">${numberWithCommas(totals.netWorth)}원</div>${deltaHtml}<div class="heroChips"><span>자산 ${numberWithCommas(totals.assetTotal)}원</span><span>부채 ${numberWithCommas(totals.liabilityTotal)}원</span><span>${escapeHtml(monthLabel)} 카드 결제 ${numberWithCommas(cardUsageTotal)}원</span>${creditCardUsageTotal > 0 ? `<span class="dim">미결제 신용카드 반영 시 약 ${numberWithCommas(totals.netWorth - creditCardUsageTotal)}원</span>` : ""}</div><form class="filters" method="get" action="/payment-methods"><label class="srOnly" for="assetHousehold">가계부</label><select id="assetHousehold" name="household_id">${householdOptions}</select><label class="srOnly" for="assetMonth">조회 월</label><input id="assetMonth" type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section>${msg ? `<div class="ok" role="status">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error" role="alert">${escapeHtml(err)}</div>` : ""}${summarySections}${renderAssetAddSection(ctx)}<section class="card"><h2>${escapeHtml(monthLabel)} 결제수단별 흐름</h2>${unregChips ? `<div class="unregBox"><b>미등록 결제수단 ${numberWithCommas(unregistered.length)}개</b><p>거래에 나온 결제수단을 자산으로 등록하면 카드 사용액 계산과 자산 요약이 더 정확해집니다.</p><div class="presetRow">${unregChips}</div></div>` : ""}<div class="tableWrap" tabindex="0" aria-label="결제수단별 흐름 표"><table><thead><tr><th>결제수단</th><th>지출 건수</th><th>지출</th><th>수입</th><th>상태</th></tr></thead><tbody>${methodRows}</tbody></table></div></section></main></body></html>`);
}
// @build:exports-start
export { handlePaymentMethodsPage };
// @build:exports-end
