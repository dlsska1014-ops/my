// @build:imports-start
import { appName } from "../public/site-config.js";
import { dashboardQuery } from "./transactions-households.js";
import { renderSpenderOptions } from "../data/households-members-rows.js";
import { formatDate, nowKstDate } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function renderPublicShareCardHtml(url, env) {
  const p = url.searchParams;
  const rarity = String(p.get("rarity") || "R").slice(0, 12);
  const emoji = String(p.get("emoji") || "🃏").slice(0, 20);
  const title = String(p.get("title") || "소비몬 카드").slice(0, 80);
  const line = String(p.get("line") || "오늘의 소비 패턴 카드가 등장했습니다.").slice(0, 180);
  const sub = String(p.get("sub") || "").slice(0, 180);
  const share = String(p.get("share") || "나 소비몬 카드 떴다 ㅋㅋ").slice(0, 220);
  const power = String(p.get("power") || "0").slice(0, 20);
  const month = String(p.get("month") || "").slice(0, 10);
  const date = String(p.get("date") || "").slice(0, 12);
  const type = p.get("type") === "daily" ? "일별 카드" : "월간 대표 카드";
  const app = escapeHtml(appName(env));
  const cleanUrl = escapeHtml(url.href);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta property="og:title" content="${escapeHtml(title)} · ${escapeHtml(rarity)}"/><meta property="og:description" content="${escapeHtml(share)}"/><title>${escapeHtml(title)} · ${app}</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 10% 0,#fff7ed,#e0f2fe 35%,#fdf2f8 80%);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;padding:20px}.wrap{width:min(520px,100%)}.sharePage{border-radius:34px;padding:22px;color:#fff;min-height:640px;box-shadow:0 24px 80px rgba(15,23,42,.25);position:relative;overflow:hidden;border:3px solid rgba(255,255,255,.5)}.rarity-N,.rarity-C{background:linear-gradient(135deg,#64748b,#334155)}.rarity-R,.rarity-B{background:linear-gradient(135deg,#0ea5e9,#2563eb)}.rarity-SR,.rarity-A{background:linear-gradient(135deg,#7c3aed,#9333ea)}.rarity-SSR,.rarity-S{background:linear-gradient(135deg,#db2777,#f97316)}.rarity-UR,.rarity-SS{background:linear-gradient(135deg,#14b8a6,#06b6d4,#3b82f6)}.rarity-LEGEND,.rarity-SSS{background:linear-gradient(135deg,#f59e0b,#ef4444,#db2777)}.sharePage:before{content:"";position:absolute;inset:-20%;background:linear-gradient(120deg,transparent 20%,rgba(255,255,255,.33) 45%,transparent 65%);animation:sweep 3.4s linear infinite}.sharePage>*{position:relative;z-index:1}.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.badge{border-radius:999px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);padding:8px 12px;font-size:13px;font-weight:950}.emoji{text-align:center;font-size:96px;margin:42px 0 16px;filter:drop-shadow(0 10px 22px rgba(0,0,0,.18));animation:bounce 1.5s ease-in-out infinite alternate}.title{font-size:40px;font-weight:1000;letter-spacing:-.06em;line-height:1.03;text-align:center}.line{font-size:20px;font-weight:900;line-height:1.45;text-align:center;margin-top:18px}.sub{font-size:15px;line-height:1.55;text-align:center;opacity:.95;margin-top:12px}.share{margin-top:26px;border-radius:22px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.32);padding:16px;font-size:17px;line-height:1.55;font-weight:900}.power{display:flex;justify-content:space-between;align-items:center;margin-top:18px;font-weight:950}.brand{text-align:center;font-size:13px;opacity:.9;margin-top:24px}.actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:16px}.actions button,.actions a{border:0;border-radius:999px;background:#0f172a;color:#fff;padding:12px 14px;font-weight:950;text-decoration:none;cursor:pointer}.hint{text-align:center;font-size:12px;color:#475569;margin-top:12px}@keyframes sweep{0%{transform:translateX(-120%) rotate(10deg)}100%{transform:translateX(120%) rotate(10deg)}}@keyframes bounce{from{transform:translateY(0) rotate(-2deg)}to{transform:translateY(-8px) rotate(2deg)}}@media print{body{padding:0;background:#fff}.actions,.hint{display:none}.wrap{width:100%}.sharePage{border-radius:0;box-shadow:none;min-height:100vh}}</style></head><body><main class="wrap"><section id="card" class="sharePage rarity-${escapeHtml(rarity)}"><div class="top"><span class="badge">${escapeHtml(type)}</span><span class="badge">${escapeHtml(rarity)}</span></div><div class="emoji">${escapeHtml(emoji)}</div><div class="title">${escapeHtml(title)}</div><div class="line">${escapeHtml(line)}</div>${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ""}<div class="share">${escapeHtml(share)}</div><div class="power"><span>${escapeHtml(month || date || "소비몬")}</span><span>전투력 ${escapeHtml(power)}</span></div><div class="brand">${app} · 소비몬 도감</div></section><div class="actions"><button onclick="navigator.clipboard&&navigator.clipboard.writeText('${cleanUrl}').then(()=>alert('공유 링크를 복사했습니다.')).catch(()=>prompt('링크를 복사하세요', '${cleanUrl}'))">링크 복사</button><button onclick="window.print()">이미지처럼 저장/인쇄</button><a href="/">내 가계부 보기</a></div><div class="hint">카톡/인스타 공유는 이 화면을 캡처하거나 인쇄 저장을 사용하세요. 다음 버전에서 PNG 저장을 붙이면 더 좋아집니다.</div></main></body></html>`;
}

function renderInsightCards(a) {
  const cards = [];
  const forecastClass = a.income > 0 && a.burnForecast > a.income ? "danger" : a.burnForecast > a.expense ? "warn" : "good";
  cards.push({ cls: forecastClass, title: "월말 예상 지출", value: `${numberWithCommas(a.burnForecast)}원`, desc: a.income > 0 ? `현재 속도 기준 수입 대비 ${Math.round(a.burnForecast / Math.max(1, a.income) * 100)}%` : "수입 기록을 넣으면 위험도가 더 정확해집니다." });
  cards.push({ cls: a.fixedRate >= 50 ? "danger" : a.fixedRate >= 35 ? "warn" : "good", title: "고정비 압박도", value: `${a.fixedRate}%`, desc: `고정비 ${numberWithCommas(a.fixedExpense)}원. 50% 이상이면 예산 여유가 급격히 줄어듭니다.` });
  cards.push({ cls: a.concentration >= 45 ? "danger" : a.concentration >= 30 ? "warn" : "good", title: "카테고리 쏠림", value: `${a.concentration}%`, desc: `TOP 분류: ${a.topCategory.category}. 특정 항목 쏠림을 확인하세요.` });
  cards.push({ cls: a.maxDayRate >= 35 ? "danger" : a.maxDayRate >= 20 ? "warn" : "good", title: "하루 집중 지출", value: `${a.maxDayRate}%`, desc: a.maxDay.date ? `${a.maxDay.date}에 ${numberWithCommas(a.maxDay.expense)}원 사용` : "지출 기록이 없습니다." });
  cards.push({ cls: a.weekendRate >= 45 ? "warn" : "good", title: "주말 소비 비중", value: `${a.weekendRate}%`, desc: `주말 지출 ${numberWithCommas(a.weekendExpense)}원. 외식/여가 패턴을 확인하세요.` });
  cards.push({ cls: a.missingAny > 0 ? "danger" : "good", title: "데이터 정리도", value: `${a.missingAny}건`, desc: "미분류/결제수단 미입력은 통계 정확도를 떨어뜨립니다." });
  return cards.map((c) => `<div class="insight ${c.cls}"><b>${escapeHtml(c.title)}</b><div style="font-size:24px;font-weight:950;letter-spacing:-.04em">${escapeHtml(c.value)}</div><div class="muted">${escapeHtml(c.desc)}</div></div>`).join("");
}

function buildCustomStats(rows, groupBy) {
  const map = Object.create(null);
  const weekdays = ["일요일","월요일","화요일","수요일","목요일","금요일","토요일"];
  for (const r of rows) {
    let key = r.category || "미분류";
    if (groupBy === "payment_method") key = r.payment_method || "미입력";
    if (groupBy === "transaction_date") key = r.transaction_date || "날짜없음";
    if (groupBy === "weekday") { const d = new Date(String(r.transaction_date || "").replace(/-/g, "/")); key = weekdays[d.getDay()] || "요일없음"; }
    if (groupBy === "type") key = r.type === "income" ? "수입" : "지출";
    if (groupBy === "source") key = r.source || "unknown";
    if (!map[key]) map[key] = { name: key, income: 0, expense: 0, count: 0 };
    const amount = Number(r.amount || 0);
    if (r.type === "income") map[key].income += amount; else map[key].expense += amount;
    map[key].count += 1;
  }
  return Object.values(map).map((x) => ({ ...x, balance: x.income - x.expense })).sort((a, b) => b.expense - a.expense || b.income - a.income || b.count - a.count).slice(0, 80);
}

function renderCustomStats(items) {
  if (!items.length) return `<div class="empty">조건에 맞는 통계가 없습니다.</div>`;
  const max = Math.max(1, ...items.map((x) => Math.max(x.expense, x.income)));
  return `<div class="tableWrap"><table class="statTable"><thead><tr><th>항목</th><th>건수</th><th>수입</th><th>지출</th><th>잔액</th><th>비중</th></tr></thead><tbody>${items.map((x) => { const pct = Math.round(Math.max(x.expense, x.income) / max * 100); return `<tr><td><b>${escapeHtml(x.name)}</b><div class="bar"><span style="width:${pct}%"></span></div></td><td>${x.count}건</td><td class="income">${numberWithCommas(x.income)}원</td><td class="expense">${numberWithCommas(x.expense)}원</td><td>${numberWithCommas(x.balance)}원</td><td>${pct}%</td></tr>`; }).join("")}</tbody></table></div>`;
}

function renderServerCalendar(days, month, householdId, selectedDate, type, q, quality, category, paymentMethod, groupBy) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const startWeek = new Date(y, m - 1, 1).getDay();
  const max = Math.max(1, ...days.map((d) => Number(d.expense || 0)));
  const today = formatDate(nowKstDate());
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  let out = `<div class="calendar">${names.map((n) => `<div class="weekday">${n}</div>`).join("")}`;
  for (let i = 0; i < startWeek; i++) out += `<div class="day blank"></div>`;
  for (const d of days) {
    const exp = Number(d.expense || 0);
    const inc = Number(d.income || 0);
    const level = exp <= 0 ? 0 : Math.min(5, Math.ceil((exp / max) * 5));
    const cls = `day calendarDay heat${level}${selectedDate === d.date ? " selected" : ""}${today === d.date ? " today" : ""}`;
    const href = `${dashboardQuery(month, householdId, { tab: "calendar", type, date: d.date, q, quality, category, payment_method: paymentMethod, group_by: groupBy })}#transactionsSection`;
    out += `<a class="${cls}" data-date="${escapeHtml(d.date)}" href="${escapeHtml(href)}"><div class="dateNo">${Number(d.date.slice(8))}</div>${exp ? `<div class="dayAmt expense">-${numberWithCommas(exp)}원</div>` : `<div class="dayAmt muted">무지출</div>`}${inc ? `<div class="dayAmt income">+${numberWithCommas(inc)}원</div>` : ""}<div class="dayCount">${d.count || 0}건</div></a>`;
  }
  return out + `</div>`;
}

function renderTransactionPager({ month, householdId, tab, total, page, perPage, type, q, quality, category, payment_method, date, groupBy }) {
  const pageCount = Math.max(1, Math.ceil(Number(total || 0) / Number(perPage || 50)));
  if (pageCount <= 1) return "";
  const baseExtra = { tab, type, q, quality, category, payment_method, date, group_by: groupBy, per_page: perPage };
  const mk = (p, label, cls = "") => `<a class="pagerBtn ${cls}" href="${escapeHtml(dashboardQuery(month, householdId, { ...baseExtra, page: p }))}#transactionsSection">${label}</a>`;
  const items = [];
  if (page > 1) items.push(mk(page - 1, "이전"));
  const around = new Set([1, page - 1, page, page + 1, pageCount].filter((p) => p >= 1 && p <= pageCount));
  let last = 0;
  for (const p of [...around].sort((a, b) => a - b)) {
    if (last && p - last > 1) items.push(`<span class="pagerDots">…</span>`);
    items.push(mk(p, String(p), p === page ? "active" : ""));
    last = p;
  }
  if (page < pageCount) items.push(mk(page + 1, "다음"));
  const sizeLinks = [30, 50, 100].map((n) => `<a class="pagerSize ${Number(perPage) === n ? "active" : ""}" href="${escapeHtml(dashboardQuery(month, householdId, { ...baseExtra, per_page: n, page: 1 }))}#transactionsSection">${n}개</a>`).join("");
  return `<nav class="txPager"><div>${items.join("")}</div><div class="pagerSizes">${sizeLinks}</div></nav>`;
}

// V22.9.34 감사 SIM-1: 목록 필터의 hidden 칸(type·category 등)을 수정 폼에 붙이면 서버가 마지막 type 을 받아
// 수입 기록의 메모만 고쳐도 지출로 바뀌었다. 필터 칸 대신 B14 충돌 확인용 원래 값(orig_*)을 싣는다.
function renderTransactionEditModal(members = [], filterHidden = "") {
  return `<div id="txEditModal" class="txModal" hidden><div class="txModalBackdrop" onclick="closeTxEdit()"></div><section class="txModalCard"><div class="txModalHead"><h3>거래 수정</h3><button class="ghost small" type="button" onclick="closeTxEdit()">닫기</button></div><form id="txEditModalForm" method="post" action="/admin/update" class="txModalGrid"><input type="hidden" name="id" id="txm_id"/><div class="formField"><label>구분</label><select name="type" id="txm_type"><option value="expense">지출</option><option value="income">수입</option></select></div><div class="formField"><label>날짜</label><input type="date" name="transaction_date" id="txm_date"/></div><div class="formField"><label>금액</label><input type="text" inputmode="numeric" name="amount" id="txm_amount" placeholder="예: 12,000"/></div><div class="formField"><label>분류</label><input name="category" id="txm_category" list="categoryList" placeholder="분류"/></div><div class="formField"><label>결제수단</label><input name="payment_method" id="txm_payment" list="paymentList" placeholder="결제수단"/></div><div class="formField"><label>수입자·지출자</label><select name="user_id" id="txm_user" required>${renderSpenderOptions(members, "", "참여자 선택")}</select></div><div class="formField full"><label>메모</label><input name="memo" id="txm_memo" placeholder="메모"/></div><div class="txModalActions"><button type="submit">저장</button><button class="ghost" type="button" onclick="closeTxEdit()">취소</button></div>${["type", "transaction_date", "amount", "category", "payment_method", "memo", "user_id"].map((field) => `<input type="hidden" name="orig_${field}" id="txm_orig_${field}" value=""/>`).join("")}</form></section></div>`;
}

function renderTransactionTurboScript() {
  return `<script>(function(){function qsa(s){return Array.prototype.slice.call(document.querySelectorAll(s))}function selectedCount(){return qsa('.txCheck:checked').length}function esc(v){return String(v==null?'':v)}window.setTxChecks=function(checked){qsa('.tx-row:not(.hiddenByLive) .txCheck').forEach(function(c){c.checked=!!checked});window.updateTxSelectedCount&&window.updateTxSelectedCount();};window.updateTxSelectedCount=function(){var n=selectedCount();var el=document.getElementById('txSelectedCount');if(el)el.textContent=n+'건 선택';};window.confirmBulkType=function(type){var n=selectedCount();if(!n){alert('먼저 수정할 거래를 선택하세요.');return false;}return confirm(n+'건을 '+(type==='income'?'수입':'지출')+'으로 변경할까요?');};window.confirmBulkDelete=function(){var n=selectedCount();if(!n){alert('먼저 삭제할 거래를 선택하세요.');return false;}return confirm(n+'건을 삭제할까요? 삭제 후 복구할 수 없습니다.');};window.openTxEdit=function(btn){var m=document.getElementById('txEditModal');if(!m)return;document.getElementById('txm_id').value=esc(btn.dataset.id);document.getElementById('txm_type').value=esc(btn.dataset.type)||'expense';document.getElementById('txm_date').value=esc(btn.dataset.date);document.getElementById('txm_amount').value=esc(btn.dataset.amount);document.getElementById('txm_category').value=esc(btn.dataset.category);document.getElementById('txm_payment').value=esc(btn.dataset.payment);document.getElementById('txm_memo').value=esc(btn.dataset.memo);document.getElementById('txm_user').value=esc(btn.dataset.user);[['type',esc(btn.dataset.type)||'expense'],['transaction_date',esc(btn.dataset.date)],['amount',esc(btn.dataset.amount)],['category',esc(btn.dataset.category)],['payment_method',esc(btn.dataset.payment)],['memo',esc(btn.dataset.memo)],['user_id',esc(btn.dataset.user)]].forEach(function(p){var o=document.getElementById('txm_orig_'+p[0]);if(o)o.value=p[1]||'';});m.hidden=false;document.body.classList.add('modalOpen');setTimeout(function(){var x=document.getElementById('txm_amount');if(x)x.focus();},0);};window.closeTxEdit=function(){var m=document.getElementById('txEditModal');if(m)m.hidden=true;document.body.classList.remove('modalOpen');};function updateCount(){var total=qsa('.tx-row').length;var visible=qsa('.tx-row:not(.hiddenByLive)').length;var el=document.getElementById('txLiveCount');if(el)el.textContent='현재 페이지 '+visible+'/'+total+'건 표시';}var timer=null;var live=document.getElementById('txLiveSearch');if(live){live.addEventListener('input',function(){clearTimeout(timer);var self=this;timer=setTimeout(function(){var q=self.value.toLowerCase().trim();qsa('.tx-row').forEach(function(r){var hit=!q||String(r.getAttribute('data-search')||'').toLowerCase().indexOf(q)>=0;r.classList.toggle('hiddenByLive',!hit);var cb=r.querySelector('.txCheck');if(cb&&!hit)cb.checked=false;});window.updateTxSelectedCount&&window.updateTxSelectedCount();updateCount();},180);});}document.addEventListener('change',function(e){if(e.target&&e.target.classList&&e.target.classList.contains('txCheck'))window.updateTxSelectedCount();});document.addEventListener('keydown',function(e){if(e.key==='Escape')window.closeTxEdit&&window.closeTxEdit();});function bindAmountFormat(input){if(!input)return;input.addEventListener('input',function(){var raw=this.value.replace(/[^0-9]/g,'');this.value=raw?raw.replace(/\B(?=(\d{3})+(?!\d))/g,','):'';});var f=input.closest('form');if(f){f.addEventListener('submit',function(){input.value=input.value.replace(/,/g,'');});}}bindAmountFormat(document.querySelector('.ledgerAmountInput'));var modalAmount=document.getElementById('txm_amount');bindAmountFormat(modalAmount);setTimeout(function(){window.updateTxSelectedCount&&window.updateTxSelectedCount();updateCount();},0);})();</script>`;
}

function renderDesktopTransactionTable(rows, filterHidden = "") {
  if (!rows.length) return `<div class="txEmpty">조건에 맞는 기록이 없습니다.</div>`;
  const body = rows.map((t) => {
    const typeLabel = t.type === "income" ? "수입" : "지출";
    const typeClass = t.type === "income" ? "income" : "expense";
    const memo = t.memo || t.raw_text || "-";
    const search = `${t.transaction_date || ""} ${t.spender_name || ""} ${t.category || ""} ${t.payment_method || ""} ${memo} ${t.amount || ""}`;
    const sign = t.type === "income" ? "+" : "-";
    return `<tr class="tx-row" data-date="${escapeHtml(t.transaction_date || "")}" data-search="${escapeHtml(search)}"><td class="checkCol"><input class="txCheck" form="bulkForm" type="checkbox" name="ids" value="${escapeHtml(t.id)}"/></td><td>${escapeHtml(t.transaction_date || "-")}</td><td><span class="badge ${typeClass}">${typeLabel}</span></td><td>${escapeHtml(t.category || "미분류")}</td><td>${escapeHtml(t.payment_method || "미입력")}</td><td><b>${escapeHtml(memo)}</b><span class="rowSub">${escapeHtml(t.spender_name || "미지정")}</span></td><td class="amountCell ${typeClass}">${sign}${numberWithCommas(t.amount)}원</td><td class="actionCell"><button class="ghost small" type="button" onclick="openTxEdit(this)" data-id="${escapeHtml(t.id)}" data-type="${escapeHtml(t.type || "expense")}" data-date="${escapeHtml(t.transaction_date || "")}" data-amount="${escapeHtml(t.amount || 0)}" data-category="${escapeHtml(t.category || "")}" data-payment="${escapeHtml(t.payment_method || "")}" data-memo="${escapeHtml(t.memo || "")}" data-user="${escapeHtml(t.user_id || "")}">수정</button><form method="post" action="/admin/delete" onsubmit="return confirm('이 기록을 삭제할까요?')" class="inlineDelete">${filterHidden}<input type="hidden" name="id" value="${escapeHtml(t.id)}"/><button class="danger small" type="submit">삭제</button></form></td></tr>`;
  }).join("");
  return `<div class="tableShell"><table class="ledgerTable"><thead><tr><th class="checkCol"><input type="checkbox" onclick="setTxChecks(this.checked)"/></th><th>일자</th><th>유형</th><th>분류</th><th>결제수단</th><th>내용 / 지출자</th><th class="amountHead">금액</th><th>관리</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

const DEFAULT_CATEGORIES = ["식비","외식","배달","카페/간식","장보기","편의점","교통","택시","주유/충전","차량관리","쇼핑","의류/잡화","생활용품","주거/월세","관리비","공과금","통신비","보험","의료/병원","약국","건강","교육/학습","도서","육아/자녀","문화/여가","여행","운동","구독","경조사/선물","반려동물","미용","세금/수수료","가족/용돈","저축/투자","대출/이자","급여","상여/보너스","용돈수입","환급","이자배당","부업/매출","기타"];
const DEFAULT_PAYMENTS = ["카드","신용카드","체크카드","현금","계좌이체","자동이체","삼성페이","카카오페이","네이버페이","토스","신한카드","현대카드","삼성카드","국민카드","우리카드","롯데카드","하나카드","농협카드"];
// @build:exports-start
export {
  DEFAULT_CATEGORIES, DEFAULT_PAYMENTS, buildCustomStats, renderCustomStats,
  renderDesktopTransactionTable, renderInsightCards, renderPublicShareCardHtml,
  renderServerCalendar, renderTransactionEditModal, renderTransactionPager,
  renderTransactionTurboScript,
};
// @build:exports-end
