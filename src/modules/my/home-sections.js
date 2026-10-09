// @build:imports-start
import { abEditOriginalFields } from "../admin/transactions-households.js";
import { memberNameMap, renderSpenderOptions } from "../data/households-members-rows.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { memeCollectionFor } from "../features/meme-cards.js";
import { addDays, currentMonthKst, formatDate, nowKstDate } from "../nlu/date-payment.js";
import { calculateStats, escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function memeHash(input = "") {
  let h = 0;
  const text = String(input || "");
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function memePick(list = [], seed = 0) {
  if (!list.length) return "";
  return list[Math.abs(seed) % list.length];
}

function memeTpl(text = "", vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (_, key) => String(vars?.[key] ?? ""));
}

function memeAmountByRegex(rows = [], regex) {
  return rows.filter((r) => r.type !== "income" && regex.test(`${r.category || ""} ${r.memo || ""}`)).reduce((a, r) => a + Number(r.amount || 0), 0);
}

function memeCountByRegex(rows = [], regex) {
  return rows.filter((r) => r.type !== "income" && regex.test(`${r.category || ""} ${r.memo || ""}`)).length;
}

function longestNoSpendStreak(rows = [], month = currentMonthKst()) {
  const expenseDays = new Set(rows.filter((r) => r.type !== "income" && String(r.transaction_date || "").slice(0, 7) === month).map((r) => String(r.transaction_date || "")));
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return 0;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let best = 0, cur = 0;
  for (let d = 1; d <= lastDay; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    if (expenseDays.has(key)) cur = 0;
    else { cur += 1; if (cur > best) best = cur; }
  }
  return best;
}

function makeMemeCard(def = {}, vars = {}, base = {}) {
  const seed = memeHash(`${base.month || ''}|${base.expense || 0}|${base.topCategory || ''}|${def.id || ''}|${vars.seed || ''}`);
  return {
    id: def.id || `card-${seed}`,
    rarity: def.rarity || 'R',
    level: def.level || '밈',
    theme: def.theme || 'chaos',
    emoji: def.emoji || '😶',
    title: memeTpl(memePick(def.titles || ['오늘의 소비몬'], seed), vars),
    line: memeTpl(memePick(def.lines || ['지갑이 상황을 지켜보고 있습니다.'], seed + 7), vars),
    subtitle: memeTpl(memePick(def.subtitles || ['소비몬 자동 판정'], seed + 13), vars),
    shareTag: def.shareTag || '#소비몬 #가계부밈',
    ...base,
  };
}

function memeCardFor({ rows = [], stats = calculateStats([]), budget = null, month = currentMonthKst() }) {
  const cards = memeCollectionFor(rows, stats, budget, month);
  return cards[0] || { id: 'default', rarity: 'N', level: '평온', title: '오늘의 소비몬', line: '지갑이 아직 숨을 쉽니다.', emoji: '😌', expense: 0, balance: 0, topCategory: '기타', month };
}

// V22.8.86 통합 작업지시서 4.5(지연 로드 계약).
// 수정 폼은 행마다 1,356 B 이고 홈에 10행이 붙어 13.2 KiB 를 차지했다. 열어 보지도 않는
// 폼을 첫 응답에 실어 보내던 셈이라, 초기 HTML 에서 빼고 <details> 를 열 때 받는다.
// 폼 마크업 자체는 한 곳(renderV8TxEditForm)에만 두고 카드·조각·전체 화면이 모두
// 그것을 쓴다 — 삭제 버튼이 소유 폼 안에 있어야 한다는 V22.8.66 의 계약이 세 갈래로
// 갈라지면 다시 깨진다.
function txEditPath(id = "", returnTo = "") {
  const params = new URLSearchParams({ id: String(id || "") });
  const back = String(returnTo || "");
  if (back) params.set("return_to", back);
  return `/transactions/edit?${params.toString()}`;
}

function renderV8TxEditForm(t = {}, currentPath = "", members = [], canEditSpender = false) {
  const memo = t.memo || t.raw_text || "-";
  const spenderLabel = t.type === "income" ? "수입자" : "지출자";
  const names = memberNameMap(members);
  const spenderName = t.user_id ? (names[String(t.user_id)] || "이전 참여자") : "미지정";
  const spenderEditor = canEditSpender
    ? `<label class="v8-edit-field"><span>${spenderLabel}</span><select name="user_id" required>${renderSpenderOptions(members, String(t.user_id || ""), `${spenderLabel} 선택`)}</select></label>`
    : `<div class="v8-spender-readonly"><span>${spenderLabel}</span><b>${escapeHtml(spenderName)}</b></div>`;
  return `<form class="v8-edit" method="post" action="/admin/update"><input type="hidden" name="id" value="${escapeHtml(t.id)}"/>${abEditOriginalFields(t)}<input type="hidden" name="return_to" value="${escapeHtml(currentPath)}"/><input type="hidden" name="month" value="${escapeHtml(String(t.transaction_date || "").slice(0, 7) || currentMonthKst())}"/><input type="hidden" name="household_id" value="${escapeHtml(t.household_id || "")}"/><select name="type" aria-label="기록 구분"><option value="expense"${t.type !== "income" ? " selected" : ""}>지출</option><option value="income"${t.type === "income" ? " selected" : ""}>수입</option></select><input type="date" name="transaction_date" value="${escapeHtml(t.transaction_date || "")}" aria-label="거래 날짜"/><input type="number" name="amount" value="${escapeHtml(t.amount || 0)}" required min="1" aria-label="금액"/><input name="memo" value="${escapeHtml(t.memo || "")}" placeholder="${escapeHtml(t.raw_text || "내용")}" aria-label="내용"/><input name="category" value="${escapeHtml(t.category || "")}" placeholder="분류" aria-label="분류"/><input name="payment_method" value="${escapeHtml(t.payment_method || "")}" placeholder="결제수단" aria-label="결제수단"/>${spenderEditor}<button type="submit">수정 저장</button><button class="danger" type="submit" formaction="/admin/delete" formnovalidate onclick="return confirm('삭제할까요?')">삭제</button></form>`;
}

// V22.8.91 통합 작업지시서 4.3 — "이번 달 리포트" 4장.
//
// 네 장은 각각 한 가지 질문에만 답한다: 어디에 썼나 · 쓰는 속도 · 예산 항목 ·
// 앞으로 나갈 돈. 카드 하단 한 줄은 숫자를 다시 적지 않고 그 숫자의 뜻을 말한다 —
// 같은 값을 두 번 적으면 읽는 사람이 어느 쪽을 봐야 할지 다시 고민하게 된다.
//
// 새 질의는 없다. 넘겨받는 값은 전부 홈이 이미 계산해 둔 것이다(통과 조건).
// 데스크톱은 2×2 로 넷, 모바일은 앞의 둘만 보여 준다(5장 M2 의 "리포트 2칸").
// 같은 마크업을 CSS 로 나누므로 모바일이 안 쓰는 카드의 바이트만 부담한다.
// V22.8.94 (8.4) 위젯형 홈 커스터마이즈 — 새 표 없이 accountbook_settings 키-값
// 저장소에 (가계부·사용자)별로 담는다(즐겨찾기와 같은 방식).
//
// 대상은 리포트 4장(P1)과 바로가기(P3)뿐이다. **P0 와 최근 내역은 고정**한다 —
// 홈의 뼈대를 사용자가 지울 수 있으면 "홈이 비었어요" 문의에 답할 방법이 없다.
const HOME_LAYOUT_REPORTS = [
  ["where", "어디에 썼나"],
  ["pace", "쓰는 속도"],
  ["budget", "예산 항목"],
  ["reserve", "앞으로 나갈 돈"],
];
const HOME_LAYOUT_SHORTCUTS = [
  ["add", "입력"],
  ["budgets", "예산"],
  ["reserve-plans", "정기 수입·지출"],
  ["smart-tools", "스마트"],
  ["categories", "분류"],
  ["menu", "전체"],
];
function homeLayoutKey(householdId, userKey) {
  return `home-layout:v1:${String(householdId || "default").trim() || "default"}:${String(userKey || "shared").trim() || "shared"}`;
}
// 저장된 값이 없거나 깨졌으면 기본 순서를 돌려준다. 이 폴백이 없으면 홈이 비어
// 보인다 — 설정을 한 번도 연 적 없는 계정이 대다수라 여기가 정상 경로다.
function normalizeHomeLayoutSection(value, catalogue) {
  const ids = catalogue.map(([id]) => id);
  const raw = safeObject(value);
  const requested = safeArray(raw.order).map((id) => String(id || "").trim());
  const order = [];
  for (const id of requested) {
    // 모르는 id 는 버린다. 빠진 id 는 뒤에 붙인다 — 나중에 카드가 하나 늘어도
    // 예전 설정을 가진 계정에서 그 카드가 조용히 사라지지 않는다.
    if (ids.includes(id) && !order.includes(id)) order.push(id);
  }
  for (const id of ids) if (!order.includes(id)) order.push(id);
  const hiddenRaw = safeArray(raw.hidden).map((id) => String(id || "").trim());
  const hidden = ids.filter((id) => hiddenRaw.includes(id));
  return { order, hidden };
}
function normalizeHomeLayout(value) {
  let raw = value;
  if (typeof raw === "string") { try { raw = raw ? JSON.parse(raw) : {}; } catch (error) { raw = {}; } }
  const object = safeObject(raw);
  return {
    reports: normalizeHomeLayoutSection(object.reports, HOME_LAYOUT_REPORTS),
    shortcuts: normalizeHomeLayoutSection(object.shortcuts, HOME_LAYOUT_SHORTCUTS),
  };
}
function defaultHomeLayout() {
  return normalizeHomeLayout({});
}
// 순서·표시 여부를 실제 조각에 입히는 한 곳. 리포트와 바로가기가 같은 규칙을 쓴다.
function applyHomeLayoutSection(section, parts) {
  return safeArray(section?.order)
    .filter((id) => !safeArray(section?.hidden).includes(id))
    .map((id) => parts[id] || "")
    .join("");
}

function renderHomeReportCards(options = {}) {
  const {
    month = "", householdId = "", rows = [], stats = null, budgetAlerts = [],
    reserveHeadline = "", reserveHref = "", reserveCount = 0, isCurrentMonth = false,
    layout = null, layoutHref = "",
  } = options;
  const hh = householdId ? `&household_id=${encodeURIComponent(householdId)}` : "";
  const analysisHref = `/my/analysis?month=${encodeURIComponent(month)}${hh}`;
  const reportHref = `/my/analysis?view=report&month=${encodeURIComponent(month)}${hh}`;
  const budgetsHref = `/budgets?month=${encodeURIComponent(month)}${hh}`;
  const totalExpense = Number(stats?.totals?.expense || 0);

  // 1. 어디에 썼나 — 가장 큰 분류 하나와 그 비중.
  const cats = safeArray(stats?.categories).filter((c) => Number(c.expense || 0) > 0);
  const topCat = cats[0] || null;
  const topShare = topCat && totalExpense > 0 ? Math.round((Number(topCat.expense || 0) / totalExpense) * 100) : 0;
  const catBars = cats.slice(0, 3).map((c) => {
    const pct = totalExpense > 0 ? Math.max(2, Math.round((Number(c.expense || 0) / totalExpense) * 100)) : 0;
    return `<i style="width:${pct}%"></i>`;
  }).join("");
  const whereCard = `<article class="homeReport"><div class="homeReportTop"><span>어디에 썼나</span><a href="${escapeHtml(analysisHref)}">소비 분석</a></div><b>${topCat ? `${escapeHtml(topCat.category || "미분류")} ${numberWithCommas(topCat.expense || 0)}원` : "아직 기록 없음"}</b><div class="homeReportBars">${catBars}</div><small>${topCat ? `가장 많이 쓴 곳이고 이번 달 지출의 ${topShare}%를 차지합니다` : "기록을 남기면 어디에 쓰는지 보여드려요"}</small></article>`;

  // 2. 쓰는 속도 — 지난 4주. 이번 달 주차로 그리면 1주차가 부분 주간이라 비교가 틀린다.
  //    다만 이 화면이 받아 둔 기록은 보고 있는 달뿐이라, 그 달 시작보다 앞선 주는
  //    자료가 없다. 그런 주를 0원으로 그리면 "안 썼다"는 거짓말이 되므로 비워 둔다.
  const monthStart = `${month}-01`;
  const todayDate = nowKstDate();
  const weeks = [3, 2, 1, 0].map((back) => {
    const end = addDays(todayDate, -7 * back);
    const start = addDays(end, -6);
    const startKey = formatDate(start);
    const endKey = formatDate(end);
    if (startKey < monthStart) return { covered: false, amount: 0 };
    const amount = safeArray(rows)
      .filter((r) => r.type !== "income" && String(r.transaction_date || "") >= startKey && String(r.transaction_date || "") <= endKey)
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return { covered: true, amount };
  });
  const coveredWeeks = weeks.filter((w) => w.covered);
  const peak = Math.max(1, ...coveredWeeks.map((w) => w.amount));
  const paceBars = weeks.map((w) => w.covered
    ? `<i style="height:${Math.max(4, Math.round((w.amount / peak) * 100))}%"></i>`
    : `<i class="isBlank" aria-hidden="true"></i>`).join("");
  const thisWeek = weeks[3];
  const lastWeek = weeks[2];
  const paceDelta = thisWeek.covered && lastWeek.covered ? thisWeek.amount - lastWeek.amount : null;
  const paceRead = paceDelta === null
    ? `이 달에 쌓인 주만 보여드려요. 4주가 모이면 견줄 수 있어요`
    : paceDelta > 0
      ? `지난주보다 ▲ ${numberWithCommas(paceDelta)}원 더 쓰는 속도입니다`
      : paceDelta < 0
        ? `지난주보다 ▼ ${numberWithCommas(Math.abs(paceDelta))}원 덜 쓰는 속도입니다`
        : `지난주와 같은 속도입니다`;
  const paceCard = `<article class="homeReport"><div class="homeReportTop"><span>쓰는 속도</span><a href="${escapeHtml(reportHref)}">종합 리포트</a></div><b>${numberWithCommas(thisWeek.covered ? thisWeek.amount : 0)}원</b><div class="homeReportPace" role="img" aria-label="지난 4주 주간 지출 추이">${paceBars}</div><small>${escapeHtml(paceRead)}</small></article>`;

  // 3. 예산 항목 — 넘겼거나 곧 넘길 분류가 있는지.
  const alerts = safeArray(budgetAlerts);
  const over = alerts.filter((b) => Number(b.spent || 0) > Number(b.budget || 0));
  const near = alerts.filter((b) => Number(b.rate || 0) >= 85 && Number(b.spent || 0) <= Number(b.budget || 0));
  const worst = alerts.slice().sort((a, b) => Number(b.rate || 0) - Number(a.rate || 0))[0] || null;
  const budgetRead = !alerts.length
    ? "분류별 예산을 정하면 넘치는 항목을 미리 알려드려요"
    : over.length
      ? `${escapeHtml(over[0].category || "한 항목")} 등 ${over.length}개가 예산을 넘었습니다`
      : near.length
        ? `${escapeHtml(near[0].category || "한 항목")} 등 ${near.length}개가 예산에 가까워졌습니다`
        : "아직 예산을 넘긴 분류가 없습니다";
  // 막대는 100% 에서 멈춘다. "식비 384%" 와 "식비 100%" 가 같은 길이로 보이므로
  // 색이 유일한 구별 수단인데, 상태가 없어 둘 다 강조색이었다. P0 게이지와 같은 규칙.
  const worstRate = Number(worst?.rate || 0);
  const budgetCardState = !worst ? "" : worstRate > 100 ? " isOver" : worstRate >= 85 ? " isWarn" : "";
  const budgetCard = `<article class="homeReport${budgetCardState}"><div class="homeReportTop"><span>예산 항목</span><a href="${escapeHtml(budgetsHref)}">예산 설정</a></div><b>${worst ? `${escapeHtml(worst.category || "미분류")} ${worstRate}%` : "미설정"}</b><div class="homeReportBars">${worst ? `<i style="width:${Math.max(2, Math.min(100, worstRate))}%"></i>` : ""}</div><small>${budgetRead}</small></article>`;

  // 4. 앞으로 나갈 돈 — 정기지출·준비금.
  const reserveCard = `<article class="homeReport"><div class="homeReportTop"><span>앞으로 나갈 돈</span><a href="${escapeHtml(reserveHref)}">정기지출</a></div><b>${reserveCount ? escapeHtml(String(reserveHeadline).split(" · ")[0] || `${reserveCount}건`) : "등록 없음"}</b><div class="homeReportBars"></div><small>${reserveCount ? escapeHtml(String(reserveHeadline)) : "세금·보험처럼 큰돈이 나가는 달을 미리 준비합니다"}</small></article>`;

  const heading = isCurrentMonth ? "이번 달 리포트" : `${Number(String(month).slice(5, 7))}월 리포트`;
  // 8.4: 순서와 표시 여부는 사용자 설정을 따르고, 설정이 없으면 기본 순서다.
  const section = (layout || defaultHomeLayout()).reports;
  const cards = applyHomeLayoutSection(section, { where: whereCard, pace: paceCard, budget: budgetCard, reserve: reserveCard });
  // 네 장을 다 껐다면 섹션째 비운다 — 제목만 남은 빈 상자가 더 이상하다.
  if (!cards) return "";
  const edit = layoutHref ? `<a class="homeReportsEdit" href="${escapeHtml(layoutHref)}">홈 구성</a>` : "";
  return `<section class="homeReports" aria-labelledby="homeReportsTitle"><div class="homeReportsHead"><h2 id="homeReportsTitle">${escapeHtml(heading)}</h2>${edit}</div><div class="homeReportGrid">${cards}</div></section>`;
}

function renderV8TxCards(rows = [], currentPath = "", canEditRow = null, members = [], canEditSpender = false) {
  if (!rows.length) return `<div class="v8-empty">아직 기록이 없습니다. 아래 입력 버튼으로 첫 거래를 기록해보세요.</div>`;
  if (!members.length) members = safeArray(rows[0]?.__spenderMembers);
  const names = memberNameMap(members);
  return rows.slice(0, 80).map((t) => {
    const memo = t.memo || t.raw_text || "-";
    const sign = t.type === "income" ? "+" : "-";
    const cls = t.type === "income" ? "income" : "expense";
    const spenderLabel = t.type === "income" ? "수입자" : "지출자";
    const spenderName = t.user_id ? (names[String(t.user_id)] || "이전 참여자") : "미지정";
    // V22.9.18: 행마다 따로 붙던 "수정/삭제" 접기 줄을 없애고 행 본문을 그 접기의 summary 로 쓴다.
    // 행 어디를 눌러도 같은 편집 칸이 열리고(지연 로드 계약은 그대로), 행 높이가 한 줄 준다.
    const body = `<div><b>${escapeHtml(memo)}</b><span>${escapeHtml(t.transaction_date || "")} · ${escapeHtml(t.category || "미분류")} · ${escapeHtml(t.payment_method || "미입력")}</span><span class="v8-spender">${spenderLabel} ${escapeHtml(spenderName)}</span></div><strong class="${cls}">${sign}${numberWithCommas(t.amount)}원</strong>`;
    const editable = !canEditRow || canEditRow(t);
    return `<article class="v8-tx" id="tx-${escapeHtml(t.id)}" data-type="${escapeHtml(t.type || "")}">${editable ? `<details class="v8-editWrap" data-ab-edit-src="${escapeHtml(txEditPath(t.id, currentPath))}"><summary class="v8-tx-main">${body}<i class="srOnly">수정·삭제</i></summary><div class="v8-editSlot"><a class="v8-editOpen" href="${escapeHtml(txEditPath(t.id, currentPath))}">수정·삭제 화면 열기</a></div></details>` : `<div class="v8-tx-main">${body}</div>`}</article>`;
  }).join("");
}

// V22.8.92 (7.2): 거래내역 탭은 카드 스택 대신 날짜 헤더 + 구분선 목록으로 읽는다.
// 헤더 오른쪽에 그날 합계를 두면 "이 날 얼마 썼나"를 행을 더하지 않고 알 수 있다.
function txDayHeadLabel(date = "") {
  const key = String(date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key || "날짜 없음";
  const week = ["일", "월", "화", "수", "목", "금", "토"];
  return `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일 (${week[new Date(`${key}T00:00:00Z`).getUTCDay()]})`;
}

// V22.8.97 (M2 블록 3): 최근 7일 스트립. 요일 · 날짜 · 3px 막대뿐이고, 막대 높이는
// 그날 지출 ÷ 그 7일 중 최대 지출이다. 숫자를 일곱 칸에 넣지 않는다 — 그러면 P0 의
// 대표 숫자와 경쟁한다.
//
// 상호작용을 만들지 않는다. 지시서가 이 블록에 요구한 것은 "요일 · 날짜 · 3px 막대"
// 뿐이고, 일곱 칸을 링크로 두면 그것만으로 탭 정지점이 일곱 개 늘어난다(달력에서
// 이미 같은 실수를 했다). 날짜로 가는 길은 캘린더와 최근 내역이 이미 갖고 있다.
// 서버가 완성해 보내므로 JS 도 필요 없다.
function renderHomeWeekStrip(rows = [], isCurrentMonth = true) {
  if (!isCurrentMonth) return "";
  const today = nowKstDate();
  const days = [];
  for (let back = 6; back >= 0; back -= 1) days.push(formatDate(addDays(today, -back)));
  const spend = Object.create(null);
  for (const row of safeArray(rows)) {
    if (row.type === "income") continue;
    const key = String(row.transaction_date || "");
    if (days.includes(key)) spend[key] = (spend[key] || 0) + Number(row.amount || 0);
  }
  const peak = Math.max(0, ...days.map((key) => Number(spend[key] || 0)));
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  const todayKey = formatDate(today);
  const cells = days.map((key) => {
    const amount = Number(spend[key] || 0);
    // 막대는 최대 지출 대비 비율이다. 쓴 날인데 막대가 0이 되지 않도록 하한을 둔다.
    const height = peak > 0 && amount > 0 ? Math.max(8, Math.round((amount / peak) * 100)) : 0;
    const weekday = names[new Date(`${key}T00:00:00Z`).getUTCDay()];
    return `<li${key === todayKey ? ' class="isToday" aria-current="date"' : ""}${height ? ` style="--v:${height}%"` : ""}><b>${weekday}</b><i></i><em>${Number(key.slice(8, 10))}</em></li>`;
  }).join("");
  return `<ol class="homeWeek" aria-label="최근 7일 지출">${cells}</ol>`;
}

function renderV8TxDayGroups(rows = [], currentPath = "", canEditRow = null, members = [], canEditSpender = false) {
  if (!rows.length) return "";
  const groups = [];
  for (const row of rows.slice(0, 80)) {
    const date = String(row.transaction_date || "");
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.rows.push(row);
    else groups.push({ date, rows: [row] });
  }
  return groups.map((group) => {
    const expense = group.rows.filter((r) => r.type !== "income").reduce((a, r) => a + Number(r.amount || 0), 0);
    const income = group.rows.filter((r) => r.type === "income").reduce((a, r) => a + Number(r.amount || 0), 0);
    const sum = income
      ? `+${numberWithCommas(income)}원${expense ? ` · -${numberWithCommas(expense)}원` : ""}`
      : `-${numberWithCommas(expense)}원`;
    return `<section class="txDayGroup"><h3 class="txDayHead"><span>${escapeHtml(txDayHeadLabel(group.date))}</span><b>${escapeHtml(sum)}</b></h3>${renderV8TxCards(group.rows, currentPath, canEditRow, members, canEditSpender)}</section>`;
  }).join("");
}

function lastNDaysExpense(rows = [], days = 7) {
  const today = nowKstDate();
  const start = addDays(today, -(days - 1));
  const startKey = formatDate(start);
  return rows.filter((r) => r.type !== "income" && String(r.transaction_date || "") >= startKey).reduce((a, r) => a + Number(r.amount || 0), 0);
}

function todayExpense(rows = []) {
  const today = formatDate(nowKstDate());
  return rows.filter((r) => r.type !== "income" && r.transaction_date === today).reduce((a, r) => a + Number(r.amount || 0), 0);
}
// @build:exports-start
export {
  HOME_LAYOUT_REPORTS, HOME_LAYOUT_SHORTCUTS, applyHomeLayoutSection, homeLayoutKey,
  lastNDaysExpense, longestNoSpendStreak, makeMemeCard, memeAmountByRegex, memeCardFor,
  memeCountByRegex, normalizeHomeLayout, renderHomeReportCards, renderHomeWeekStrip,
  renderV8TxCards, renderV8TxDayGroups, renderV8TxEditForm, todayExpense,
};
// @build:exports-end
