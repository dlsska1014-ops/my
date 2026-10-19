
// 분석 스튜디오 클라이언트. /my/analysis/app.js 로 toString() 직렬화되어 그대로 서빙되므로
// 외부 함수/변수를 절대 참조하지 말 것 (완전 자급자족 함수).
function budgetExpenseRows(rows = [], categories = [], basis = "total") {
  const covered = new Set(categories.map(row => Array.isArray(row) ? row[0] : row.category));
  return rows.filter(row => !row.income && row.type !== "income" && (basis !== "category" || covered.has(row.cat || row.category)));
}

// V22.9.57: shared by the actual bundle and the pure-model regression. Receipt
// completeness describes the existing paged read, not an atomic DB snapshot.
function insightPeriodCoverage({ start, end, dataStart, dataEnd, receipt, truncated = false }) {
  if (!start || !end || start > end || start < dataStart || end > dataEnd) return "unreceived";
  if (truncated) return "limit";
  return receipt && receipt.status === "complete" ? "complete" : receipt && receipt.status || "unknown";
}

function insightObservedWindow({ start, end, today, dataStart, dataEnd, receipt, truncated = false }) {
  if (start > today) return { start, end: null, span: 0, status: "before" };
  const observedEnd = end > today ? today : end;
  const span = Math.round((Date.parse(observedEnd + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000) + 1;
  return { start, end: observedEnd, span, status: insightPeriodCoverage({ start, end: observedEnd, dataStart, dataEnd, receipt, truncated }) };
}

function insightPaceComparison({ month, today, rows = [], budget = {}, dataStart, dataEnd, receipt, truncated = false }) {
  const year = Number(month.slice(0, 4)), monthNumber = Number(month.slice(5, 7));
  const previousMonth = new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const previousDays = new Date(Date.UTC(year, monthNumber - 1, 0)).getUTCDate();
  const covered = budgetExpenseRows(rows, budget.cats || [], budget.basis);
  const sums = Object.create(null);
  covered.forEach(row => { sums[row.date] = (sums[row.date] || 0) + row.amount; });
  let currentSum = 0, previousSum = 0;
  const points = [];
  for (let day = 1; day <= days; day++) {
    const suffix = "-" + String(day).padStart(2, "0");
    const date = month + suffix, previousDate = day <= previousDays ? previousMonth + suffix : null;
    currentSum += sums[date] || 0;
    if (previousDate) previousSum += sums[previousDate] || 0;
    const currentStatus = date > today ? "before" : insightPeriodCoverage({ start: month + "-01", end: date, dataStart, dataEnd, receipt, truncated });
    const previousStatus = !previousDate ? "no-date" : date > today ? "before" : insightPeriodCoverage({ start: previousMonth + "-01", end: previousDate, dataStart, dataEnd, receipt, truncated });
    const current = currentStatus === "complete" ? currentSum : null;
    const previous = previousStatus === "complete" ? previousSum : null;
    const difference = current !== null && previous !== null ? current - previous : null;
    points.push({ day, date, previousDate, current, previous, difference,
      percent: difference !== null && previous > 0 ? Math.round(difference / previous * 100) : null,
      currentStatus, previousStatus, status: currentStatus !== "complete" ? currentStatus : previousStatus,
      pace: Math.round(Number(budget.total || 0) * day / days) });
  }
  return { month, previousMonth, days, points, basis: budget.basis || "total",
    categories: (budget.cats || []).map(row => Array.isArray(row) ? row[0] : row.category),
    observedDay: month > today.slice(0, 7) ? 0 : month === today.slice(0, 7) ? Number(today.slice(8, 10)) : days };
}

function insightClientMain() {
  "use strict";
  var DATA = window.__INSIGHT__ || {};
  var SVGNS = "http://www.w3.org/2000/svg";
  var C = {
    ex: "#2a78d6", in_: "#1baf7a",
    cat: ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"],
    other: "#B0B8C1", ink: "#191F28", sub: "#4E5968", muted: "#8B95A1",
    grid: "#EEF1F4", axis: "#D9DEE4", track: "#EFF3F8",
    good: "#006300", bad: "#D03B3B", warn: "#eda100", crit: "#d03b3b",
  };
  var WEEK = ["일", "월", "화", "수", "목", "금", "토"];

  // ---------- 유틸
  function fmt(n) { n = Math.round(Number(n) || 0); return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function won(n) { return fmt(n) + "원"; }
  function trim1(x) { var v = Math.round(x * 10) / 10; return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1); }
  function shortWon(n) {
    var a = Math.abs(Number(n) || 0);
    if (a >= 100000000) return trim1(n / 100000000) + "억";
    if (a >= 1000000) return fmt(Math.round(n / 10000)) + "만";
    if (a >= 10000) return trim1(n / 10000) + "만";
    return fmt(n);
  }
  function s2d(s) { return new Date(s + "T00:00:00Z"); }
  function d2s(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = s2d(s); d.setUTCDate(d.getUTCDate() + n); return d2s(d); }
  function dayDiff(a, b) { return Math.round((s2d(b) - s2d(a)) / 86400000); }
  function dow(s) { return s2d(s).getUTCDay(); }
  function ymOf(s) { return s.slice(0, 7); }
  function addMonthsYm(ym, delta) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + delta;
    var d = new Date(Date.UTC(y, m, 1));
    return d.toISOString().slice(0, 7);
  }
  function monthEnd(ym) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
    return ym + "-" + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0");
  }
  function fmtMD(s) { return Number(s.slice(5, 7)) + "/" + Number(s.slice(8, 10)); }
  function fmtDateK(s) { return Number(s.slice(5, 7)) + "월 " + Number(s.slice(8, 10)) + "일 (" + WEEK[dow(s)] + ")"; }
  function fmtRangeK(a, b) {
    if (a === b) return fmtDateK(a);
    return a.slice(0, 4) + "." + a.slice(5, 7) + "." + a.slice(8, 10) + " ~ " + b.slice(0, 4) + "." + b.slice(5, 7) + "." + b.slice(8, 10);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function debounce(fn, ms) {
    var t = null;
    return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
  }
  function niceCeil(v) {
    if (v <= 0) return 1000;
    var pow = Math.pow(10, Math.floor(Math.log10(v)));
    var f = v / pow;
    var step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return step * pow;
  }
  function $(id) { return document.getElementById(id); }

  // ---------- 데이터 준비
  var ROWS = (DATA.rows || []).map(function (a) {
    return {
      date: String(a[0] || ""), income: a[1] === 1, amount: Number(a[2] || 0),
      cat: String(a[3] || "") || "미분류", pay: String(a[4] || "") || "미지정",
      memo: String(a[5] || ""), who: String(a[6] || "") || "미지정",
    };
  }).filter(function (r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.amount > 0; });
  ROWS.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

  var MONTH = String(DATA.month || "").slice(0, 7) || new Date(Date.now() + 32400000).toISOString().slice(0, 7);
    var TODAY = /^\d{4}-\d{2}-\d{2}$/.test(String(DATA.today || "")) ? DATA.today : new Date(Date.now()+32400000).toISOString().slice(0, 10);
  var DATA_START = /^\d{4}-\d{2}-\d{2}$/.test(String(DATA.start || "")) ? DATA.start : addMonthsYm(MONTH, -11) + "-01";
  var DATA_END = monthEnd(MONTH);
  var IS_CUR = MONTH === ymOf(TODAY);
  var BUDGET = DATA.budget || { total: 0, cats: [] };
  var RECEIPT = DATA.receipt || { status: "unknown" };
  var paceState = { day: null, showTip: false, restoreFocus: "", tableOpen: false, scrollLeft: 0 };

  // 분류 색상: 현재 조회 결과의 금액 순위 기준으로 배정.
  // 전체 기간 고정 배정은 이번 달 상위 분류가 장기 순위 밖이면 전부 회색이 되는 문제가 있어,
  // 화면 안에서 항상 구분되는 것을 우선한다 (범례가 항상 붙어 있어 식별은 범례가 담당).
  var viewCatColors = Object.create(null);
  function rebuildViewColors() {
    viewCatColors = {};
    var by = Object.create(null);
    compRows(viewRows()).forEach(function (r) { by[r.cat] = (by[r.cat] || 0) + r.amount; });
    Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).forEach(function (c2, i) {
      viewCatColors[c2] = i < C.cat.length ? C.cat[i] : C.other;
    });
  }
  function catColor(c) { return viewCatColors[c] || C.other; }

  function dimValues(field, incomeToo) {
    var m = Object.create(null);
    ROWS.forEach(function (r) {
      if (!incomeToo && r.income) return;
      m[r[field]] = (m[r[field]] || 0) + 1;
    });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).map(function (k) { return { v: k, n: m[k] }; });
  }
  var CATS = dimValues("cat", true), PAYS = dimValues("pay", false), WHOS = dimValues("who", true);

  // ---------- 상태
  var PRESETS = [
    { id: "month", label: IS_CUR ? "이번 달" : Number(MONTH.slice(5, 7)) + "월", range: function () { return [MONTH + "-01", DATA_END]; } },
    { id: "prevMonth", label: IS_CUR ? "지난달" : "전월", range: function () { var pm = addMonthsYm(MONTH, -1); return [pm + "-01", monthEnd(pm)]; } },
    { id: "d7", label: "최근 7일", range: function () { return [addDays(TODAY, -6), TODAY]; } },
    { id: "d30", label: "최근 30일", range: function () { return [addDays(TODAY, -29), TODAY]; } },
    { id: "d90", label: "최근 90일", range: function () { return [addDays(TODAY, -89), TODAY]; } },
    { id: "m6", label: "최근 6개월", range: function () { return [addMonthsYm(MONTH, -5) + "-01", DATA_END]; } },
    { id: "m12", label: "최근 12개월", range: function () { return [DATA_START, DATA_END]; } },
    { id: "custom", label: "직접 선택", range: null },
  ];
  function clampRange(r) {
    var a = r[0] < DATA_START ? DATA_START : r[0];
    var b = r[1] > DATA_END ? DATA_END : r[1];
    if (b < a) b = a;
    return [a, b];
  }
  var state = {
    preset: "month", start: MONTH + "-01", end: DATA_END,
    type: "expense", cats: [], pays: [], whos: [],
    min: null, max: null, q: "", shown: 80,
  };
  function setPreset(id, start, end) {
    state.preset = id;
    if (id === "custom") { state.start = start; state.end = end; }
    else {
      var p = null;
      PRESETS.forEach(function (x) { if (x.id === id) p = x; });
      if (!p || !p.range) p = PRESETS[0];
      var r = clampRange(p.range());
      state.start = r[0]; state.end = r[1];
    }
    state.shown = 80;
  }

  // URL → 상태 복원 (공유/새로고침 대응)
  (function readUrl() {
    var sp = new URLSearchParams(location.search);
    var t = sp.get("t"); if (t === "all" || t === "income" || t === "expense") state.type = t;
    var p = sp.get("p");
    var s = sp.get("s"), e = sp.get("e");
    if (p === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(s || "") && /^\d{4}-\d{2}-\d{2}$/.test(e || "")) {
      var r = clampRange([s, e]); setPreset("custom", r[0], r[1]);
    } else if (p) {
      var ok = false; PRESETS.forEach(function (x) { if (x.id === p && x.range) ok = true; });
      if (ok) setPreset(p);
    }
    function list(key) {
      var v = sp.get(key);
      if (!v) return [];
      return v.split("|").filter(Boolean).map(function (x) {
        try { return decodeURIComponent(x); } catch (e) { return x; }
      });
    }
    state.cats = list("c"); state.pays = list("pm"); state.whos = list("w");
    var mn = Number(sp.get("min")), mx = Number(sp.get("max"));
    if (sp.get("min") && isFinite(mn) && mn > 0) state.min = mn;
    if (sp.get("max") && isFinite(mx) && mx > 0) state.max = mx;
    state.q = sp.get("q") || "";
  })();
  var syncUrl = debounce(function () {
    var sp = new URLSearchParams(location.search);
    ["t", "p", "s", "e", "c", "pm", "w", "min", "max", "q"].forEach(function (k) { sp.delete(k); });
    if (state.type !== "expense") sp.set("t", state.type);
    if (state.preset !== "month") sp.set("p", state.preset);
    if (state.preset === "custom") { sp.set("s", state.start); sp.set("e", state.end); }
    function pack(list2) { return list2.map(encodeURIComponent).join("|"); }
    if (state.cats.length) sp.set("c", pack(state.cats));
    if (state.pays.length) sp.set("pm", pack(state.pays));
    if (state.whos.length) sp.set("w", pack(state.whos));
    if (state.min) sp.set("min", String(state.min));
    if (state.max) sp.set("max", String(state.max));
    if (state.q) sp.set("q", state.q);
    history.replaceState(null, "", location.pathname + "?" + sp.toString());
  }, 250);

  // ---------- 필터링
  function dimPass(r) {
    if (state.cats.length && state.cats.indexOf(r.cat) < 0) return false;
    if (state.pays.length && state.pays.indexOf(r.pay) < 0) return false;
    if (state.whos.length && state.whos.indexOf(r.who) < 0) return false;
    if (state.min != null && r.amount < state.min) return false;
    if (state.max != null && r.amount > state.max) return false;
    if (state.q) {
      var hay = (r.memo + " " + r.cat + " " + r.pay + " " + r.who).toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
    }
    return true;
  }
  function rowsIn(start, end, withType) {
    return ROWS.filter(function (r) {
      if (r.date < start || r.date > end) return false;
      if (withType && state.type === "expense" && r.income) return false;
      if (withType && state.type === "income" && !r.income) return false;
      return dimPass(r);
    });
  }
  function rangeRows() { return rowsIn(state.start, state.end, false); }
  function viewRows() { return rowsIn(state.start, state.end, true); }
  function compRows(rows) {
    var wantIncome = state.type === "income";
    return rows.filter(function (r) { return r.income === wantIncome; });
  }
  function sumAmt(rows) { var s = 0; rows.forEach(function (r) { s += r.amount; }); return s; }
  function compLabel() { return state.type === "income" ? "수입" : "지출"; }
  function dayEditHref(date) {
    return "/app?month=" + encodeURIComponent(ymOf(date)) + "&household_id=" + encodeURIComponent(DATA.hid || "") + "&date=" + encodeURIComponent(date) + "&feed=all#feed";
  }

  // ---------- 툴팁
  function makeTip(box) {
    var tip = el("div", "tt");
    box.appendChild(tip);
    return {
      show: function (px, py, dateLabel, rows) {
        tip.textContent = "";
        tip.appendChild(el("b", null, dateLabel));
        rows.forEach(function (r) {
          var line = el("div", "row");
          var key = el("span", "key");
          key.style.background = r.color;
          line.appendChild(key);
          line.appendChild(el("span", "val", r.value));
          line.appendChild(el("span", null, r.label));
          tip.appendChild(line);
        });
        tip.style.opacity = "1";
        var bw = box.clientWidth, tw = tip.offsetWidth;
        var x = Math.max(4, Math.min(bw - tw - 4, px - tw / 2));
        tip.style.left = x + "px";
        tip.style.top = Math.max(0, py - tip.offsetHeight - 12) + "px";
      },
      hide: function () { tip.style.opacity = "0"; },
    };
  }

  // ---------- KPI
  function pct(cur, prev) { return prev > 0 ? Math.round((cur - prev) / prev * 100) : null; }
  // 비교 기간: 캘린더 월 조회면 지난달 같은 기간, 아니면 직전 동일 길이 기간.
  // 진행 중인 기간은 경과일만큼만 비교해 공정하게 계산한다.
  function prevWindow() {
    var effEnd = state.end > TODAY && state.start <= TODAY ? TODAY : state.end;
    var span = dayDiff(state.start, effEnd) + 1;
    if (state.start.slice(8) === "01" && state.end === monthEnd(ymOf(state.start))) {
      var pm = addMonthsYm(ymOf(state.start), -1);
      var ps = pm + "-01";
      var pe = addDays(ps, span - 1);
      var pme = monthEnd(pm);
      if (pe > pme) pe = pme;
      return { start: ps, end: pe, span: span, label: "지난달 같은 기간" };
    }
    return { start: addDays(state.start, -span), end: addDays(state.start, -1), span: span, label: "이전 기간" };
  }
  function kpiTile(label, value, deltaPct, upIsBad, extra, deltaLabel) {
    var d = el("div", "kpi");
    d.appendChild(el("span", null, label));
    d.appendChild(el("b", null, value));
    if (deltaPct != null) {
      var cls = deltaPct === 0 ? "" : (deltaPct > 0) === upIsBad ? "up" : "down";
      var sign = deltaPct > 0 ? "+" : "";
      d.appendChild(el("small", cls, (deltaLabel || "이전 기간") + " 대비 " + sign + deltaPct + "%"));
    } else if (extra) {
      d.appendChild(el("small", null, extra));
    }
    return d;
  }
  function observationReason(status) {
    var reasons = {
      before: "관측 전입니다. 기간이 시작된 뒤 확인해 주세요.",
      unreceived: "조회 범위 밖의 자료입니다. 기준 월을 바꿔 주세요.",
      limit: "최신 9,000건만 수신하여 비교를 보류합니다. 기록 범위를 확인해 주세요.",
      "response-cap": "응답 제한으로 일부 자료만 수신했습니다. 새로고침한 뒤 다시 확인해 주세요.",
      inconsistent: "수신 자료가 서로 맞지 않아 비교를 보류합니다. 새로고침해 주세요.",
      unknown: "자료 완전성을 확인하지 못했습니다. 새로고침해 주세요.",
      "no-date": "비교할 날짜 없음: 지난달에는 해당 날짜가 없습니다.",
    };
    return reasons[status] || reasons.unknown;
  }
  function observedPeriod() {
    var observed = insightObservedWindow({ start: state.start, end: state.end, today: TODAY, dataStart: DATA_START, dataEnd: DATA_END, receipt: RECEIPT, truncated: DATA.truncated });
    var pw = prevWindow();
    var previousStatus = observed.status === "before" ? "before" : insightPeriodCoverage({ start: pw.start, end: pw.end, dataStart: DATA_START, dataEnd: DATA_END, receipt: RECEIPT, truncated: DATA.truncated });
    return { observed: observed, previous: pw, previousStatus: previousStatus,
      rows: observed.status === "complete" ? rowsIn(observed.start, observed.end, false) : [],
      previousRows: previousStatus === "complete" ? rowsIn(pw.start, pw.end, false) : [],
      comparable: observed.status === "complete" && previousStatus === "complete" };
  }
  function renderKpis() {
    var box = $("kpis");
    box.textContent = "";
    if (state.start < DATA_START || state.end > DATA_END) {
      ["지출", "수입", "수입-지출", "관측 기간 하루 평균 지출", "기록"].forEach(function (label) { box.appendChild(kpiTile(label, "미수신", null, false, observationReason("unreceived"))); });
      return;
    }
    var rows = rangeRows();
    var ex = sumAmt(rows.filter(function (r) { return !r.income; }));
    var inc = sumAmt(rows.filter(function (r) { return r.income; }));
    var model = observedPeriod(), ow = model.observed, pw = model.previous;
    function totalFor(rows2, income) { return sumAmt(rows2.filter(function (r) { return r.income === income; })); }
    function amountTile(label, monthly, income, bad) {
      var current = totalFor(model.rows, income), previous = totalFor(model.previousRows, income);
      var extra = model.comparable ? previous === 0 ? current === 0 ? "관측 기간도 같은 금액" : "관측 기간 금액 증가 " + won(current) + " (지난 기간 0원)" : "" : observationReason(ow.status !== "complete" ? ow.status : model.previousStatus);
      var tile = kpiTile(label, won(monthly), model.comparable ? pct(current, previous) : null, bad, extra, "관측 기간 · " + pw.label);
      if (model.comparable) tile.appendChild(el("small", "comparisonPeriod", "비교: " + ow.start + " ~ " + ow.end + " " + won(current) + " / " + pw.start + " ~ " + pw.end + " " + won(previous)));
      return tile;
    }
    box.appendChild(amountTile("지출", ex, false, true));
    box.appendChild(amountTile("수입", inc, true, false));
    var net = inc - ex;
    box.appendChild(kpiTile("수입-지출", (net < 0 ? "-" : "") + won(Math.abs(net)), null, false, inc > 0 ? "저축률 " + Math.round(net / inc * 100) + "%" : ""));
    var observedExpense = totalFor(model.rows, false);
    box.appendChild(kpiTile("관측 기간 하루 평균 지출", ow.status === "complete" ? won(Math.round(observedExpense / ow.span)) : "확인 보류", null, false,
      ow.status === "complete" ? ow.start + " ~ " + ow.end + " (" + ow.span + "일 · 지출 " + won(observedExpense) + " 기준)" : observationReason(ow.status)));
    box.appendChild(kpiTile("기록", fmt(viewRows().length) + "건", null, false, compLabel() + " 기준 목록"));
  }

  // ---------- 인사이트 칩
  function renderInsights() {
    var box = $("insights");
    box.textContent = "";
    var rows = viewRows();
    var comp = compRows(rows);
    var model = observedPeriod();
    if (!model.comparable) box.appendChild(el("span", "iChip", observationReason(model.observed.status !== "complete" ? model.observed.status : model.previousStatus)));
    if (!comp.length) return;
    var total = sumAmt(comp);
    var pw = model.previous;
    var span = model.observed.span;
    if (model.comparable) {
      var prev = sumAmt(compRows(model.previousRows));
      var observedTotal = sumAmt(compRows(model.rows));
      var d = pct(observedTotal, prev);
      if (d != null && d !== 0) {
        var bad = state.type === "income" ? d < 0 : d > 0;
        box.appendChild(el("span", "iChip " + (bad ? "bad" : "good"), pw.label + "보다 관측 " + compLabel() + " " + Math.abs(d) + "% " + (d > 0 ? "증가" : "감소") + " (" + model.observed.start + " ~ " + model.observed.end + " / " + pw.start + " ~ " + pw.end + ")"));
      }
    }
    var byCat = Object.create(null);
    comp.forEach(function (r) { byCat[r.cat] = (byCat[r.cat] || 0) + r.amount; });
    var top = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; })[0];
    if (top && !state.cats.length) box.appendChild(el("span", "iChip", top + " " + Math.round(byCat[top] / total * 100) + "%"));
    var byDay = Object.create(null);
    comp.forEach(function (r) { byDay[r.date] = (byDay[r.date] || 0) + r.amount; });
    var maxDay = Object.keys(byDay).sort(function (a, b) { return byDay[b] - byDay[a]; })[0];
    if (maxDay) box.appendChild(el("span", "iChip", "최대 " + compLabel() + "일 " + fmtMD(maxDay) + " · " + shortWon(byDay[maxDay]) + "원"));
    if (state.type !== "income" && model.observed.status === "complete" && span <= 62) {
      var endCount = state.end > TODAY ? TODAY : state.end;
      if (endCount >= state.start) {
        var days = dayDiff(state.start, endCount) + 1;
        var noSpend = days - Object.keys(byDay).filter(function (d2) { return d2 <= endCount; }).length;
        if (noSpend > 0) box.appendChild(el("span", "iChip", "무지출 " + noSpend + "일 (" + state.start + " ~ " + endCount + ")"));
      }
    }
  }

  // ---------- 흐름 차트
  function granOf(span) { return span <= 42 ? "day" : span <= 224 ? "week" : "month"; }
  function bucketStart(dateStr, gran) {
    if (gran === "day") return dateStr;
    if (gran === "week") return addDays(dateStr, -((dow(dateStr) + 6) % 7));
    return dateStr.slice(0, 7) + "-01";
  }
  function nextBucket(b, gran) {
    if (gran === "day") return addDays(b, 1);
    if (gran === "week") return addDays(b, 7);
    return addMonthsYm(ymOf(b), 1) + "-01";
  }
  function bucketLabel(b, gran, isFirst) {
    if (gran === "day") {
      return Number(b.slice(8, 10)) === 1 || isFirst ? fmtMD(b) : String(Number(b.slice(8, 10)));
    }
    if (gran === "week") return fmtMD(b) + "~";
    return Number(b.slice(5, 7)) === 1 || isFirst ? b.slice(2, 4) + "." + Number(b.slice(5, 7)) + "월" : Number(b.slice(5, 7)) + "월";
  }
  function buildBuckets() {
    var span = dayDiff(state.start, state.end) + 1;
    var gran = granOf(span);
    var list = [], b = bucketStart(state.start, gran);
    while (b <= state.end) {
      var nb = nextBucket(b, gran);
      list.push({ start: b < state.start ? state.start : b, end: addDays(nb, -1) > state.end ? state.end : addDays(nb, -1), key: b, ex: 0, in_: 0, n: 0 });
      b = nb;
    }
    var idx = Object.create(null);
    list.forEach(function (x, i) { idx[x.key] = i; });
    rangeRows().forEach(function (r) {
      var k = bucketStart(r.date, gran);
      var i = idx[k];
      if (i == null) return;
      if (r.income) list[i].in_ += r.amount; else list[i].ex += r.amount;
      list[i].n += 1;
    });
    return { gran: gran, list: list };
  }
  function renderTrend() {
    var box = $("trendChart");
    box.textContent = "";
    var titles = { all: "수입·지출 흐름", expense: "지출 흐름", income: "수입 흐름" };
    $("trendTitle").textContent = titles[state.type];
    var legend = $("trendLegend");
    legend.textContent = "";
    var bb = buildBuckets(), buckets = bb.list, gran = bb.gran;
    var both = state.type === "all";
    var series = both ? ["ex", "in_"] : state.type === "income" ? ["in_"] : ["ex"];
    if (both) {
      [["지출", C.ex], ["수입", C.in_]].forEach(function (p) {
        var s = el("span", null, p[0]);
        var i = el("i"); i.style.background = p[1];
        s.insertBefore(i, s.firstChild);
        legend.appendChild(s);
      });
    }
    var maxVal = 0;
    buckets.forEach(function (bkt) { series.forEach(function (s) { if (bkt[s] > maxVal) maxVal = bkt[s]; }); });
    if (!buckets.length || maxVal <= 0) {
      box.appendChild(el("div", "emptyBox", "조건에 맞는 기록이 없어요. 필터를 조정해 보세요."));
      $("trendTable").textContent = "";
      return;
    }
    var W = Math.max(320, box.clientWidth || 640), H = 236;
    var padL = 46, padR = 8, padT = 22, padB = 26;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var yMax = niceCeil(maxVal * 1.05);
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H, role: "img" });
    svg.setAttribute("aria-label", titles[state.type] + " 차트, " + buckets.length + "개 구간, 최대 " + shortWon(yMax) + "원");
    [0, 0.5, 1].forEach(function (f) {
      var y = padT + plotH - plotH * f;
      svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: f === 0 ? C.axis : C.grid, "stroke-width": 1 }));
      var t = svgEl("text", { x: padL - 6, y: y + 4, "text-anchor": "end", "font-size": 10, fill: C.muted });
      t.textContent = f === 0 ? "0" : shortWon(yMax * f);
      svg.appendChild(t);
    });
    var n = buckets.length;
    var band = plotW / n;
    var barW = Math.min(24, Math.max(3, band * (both ? 0.32 : 0.55)));
    var tip = makeTip(box);
    var labelStep = Math.max(1, Math.ceil(n / (W < 480 ? 5 : 8)));
    var maxIdx = -1, maxSeen = -1;
    buckets.forEach(function (bkt, i) {
      var main = state.type === "income" ? bkt.in_ : bkt.ex;
      if (main > maxSeen) { maxSeen = main; maxIdx = i; }
    });
    function barPath(x, yTop, w, hgt) {
      var r = Math.min(4, w / 2, hgt);
      var yb = yTop + hgt;
      return "M" + x + " " + yb + " V" + (yTop + r) + " Q" + x + " " + yTop + " " + (x + r) + " " + yTop +
        " H" + (x + w - r) + " Q" + (x + w) + " " + yTop + " " + (x + w) + " " + (yTop + r) + " V" + yb + " Z";
    }
    buckets.forEach(function (bkt, i) {
      var cx = padL + band * i + band / 2;
      var g = svgEl("g");
      var offsets = both ? [-barW - 1, 1] : [-barW / 2, 0];
      series.forEach(function (s, si) {
        var v = bkt[s];
        if (v <= 0) return;
        var hgt = Math.max(1.5, v / yMax * plotH);
        var x = cx + (both ? offsets[si] : offsets[0]);
        g.appendChild(svgEl("path", { d: barPath(x, padT + plotH - hgt, barW, hgt), fill: s === "ex" ? C.ex : C.in_, opacity: 0.92 }));
      });
      svg.appendChild(g);
      if (i === maxIdx && maxSeen > 0) {
        var mv = state.type === "income" ? bkt.in_ : bkt.ex;
        var lt = svgEl("text", { x: cx, y: padT + plotH - Math.max(1.5, mv / yMax * plotH) - 6, "text-anchor": "middle", "font-size": 10, "font-weight": 700, fill: C.sub });
        lt.textContent = shortWon(mv);
        svg.appendChild(lt);
      }
      if (i % labelStep === 0) {
        var xl = svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle", "font-size": 10, fill: C.muted });
        xl.textContent = bucketLabel(bkt.key, gran, i === 0);
        svg.appendChild(xl);
      }
      var hit = svgEl("rect", { x: padL + band * i, y: padT, width: band, height: plotH, fill: "transparent", tabindex: 0, cursor: "pointer" });
      var dateLabel = gran === "day" ? fmtDateK(bkt.key) : fmtRangeK(bkt.start, bkt.end);
      function liftBars(on) {
        var paths = g.querySelectorAll("path");
        for (var pi = 0; pi < paths.length; pi++) paths[pi].setAttribute("opacity", on ? "1" : "0.92");
      }
      function showTip() {
        liftBars(true);
        var rows = [];
        if (state.type !== "income") rows.push({ color: C.ex, label: "지출", value: won(bkt.ex) });
        if (state.type !== "expense") rows.push({ color: C.in_, label: "수입", value: won(bkt.in_) });
        rows.push({ color: "transparent", label: "건수", value: fmt(bkt.n) + "건" });
        var rect = box.getBoundingClientRect();
        var sr = hit.getBoundingClientRect();
        tip.show(sr.left - rect.left + sr.width / 2, sr.top - rect.top + 8, dateLabel, rows);
      }
      function hideTip() { liftBars(false); tip.hide(); }
      hit.addEventListener("pointerenter", showTip);
      hit.addEventListener("pointerleave", hideTip);
      hit.addEventListener("focus", showTip);
      hit.addEventListener("blur", hideTip);
      hit.addEventListener("click", function () {
        if (bkt.start === state.start && bkt.end === state.end) return;
        setPreset("custom", bkt.start, bkt.end);
        renderAll();
      });
      svg.appendChild(hit);
    });
    box.appendChild(svg);
    // 표 트윈 (차트 없이도 값 접근 가능)
    var tbl = $("trendTable");
    tbl.textContent = "";
    var t = el("table"), thead = el("thead"), tr = el("tr");
    ["구간", "지출", "수입", "건수"].forEach(function (h) { tr.appendChild(el("th", null, h)); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = el("tbody");
    buckets.forEach(function (bkt) {
      var r = el("tr");
      r.appendChild(el("td", null, gran === "day" ? fmtDateK(bkt.key) : fmtRangeK(bkt.start, bkt.end)));
      r.appendChild(el("td", null, won(bkt.ex)));
      r.appendChild(el("td", null, won(bkt.in_)));
      r.appendChild(el("td", null, fmt(bkt.n)));
      tb.appendChild(r);
    });
    t.appendChild(tb);
    tbl.appendChild(t);
  }

  // ---------- 분류 도넛
  function toggleList(list, v) {
    var i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1); else list.push(v);
  }
  function renderCat() {
    var box = $("catChart");
    box.textContent = "";
    $("catTitle").textContent = compLabel() + " 구성";
    var comp = compRows(viewRows());
    var total = sumAmt(comp);
    $("catSub").textContent = total ? "합계 " + won(total) : "";
    if (!comp.length) { box.appendChild(el("div", "emptyBox", "조건에 맞는 " + compLabel() + " 기록이 없어요.")); return; }
    var byCat = Object.create(null);
    comp.forEach(function (r) { byCat[r.cat] = (byCat[r.cat] || 0) + r.amount; });
    var names = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    var segs = [];
    names.slice(0, 6).forEach(function (c2) { segs.push({ name: c2, amt: byCat[c2], color: catColor(c2) }); });
    if (names.length > 6) {
      var rest = 0;
      names.slice(6).forEach(function (c2) { rest += byCat[c2]; });
      segs.push({ name: "그 외 " + (names.length - 6) + "개", amt: rest, color: C.other, rest: true });
    }
    var wrap = el("div", "donutWrap");
    var size = 170, cx = size / 2, cy = size / 2, R = 80, r0 = 52;
    var svg = svgEl("svg", { viewBox: "0 0 " + size + " " + size, width: size, height: size, role: "img" });
    svg.setAttribute("aria-label", compLabel() + " 구성 도넛 차트, 합계 " + won(total));
    var selected = state.cats.length === 1 ? state.cats[0] : "";
    if (segs.length === 1) {
      svg.appendChild(svgEl("circle", { cx: cx, cy: cy, r: (R + r0) / 2, fill: "none", stroke: segs[0].color, "stroke-width": R - r0 }));
    } else {
      var a0 = -Math.PI / 2;
      segs.forEach(function (s) {
        var frac = s.amt / total;
        var a1 = a0 + frac * Math.PI * 2;
        var large = a1 - a0 > Math.PI ? 1 : 0;
        var p = "M" + (cx + R * Math.cos(a0)) + " " + (cy + R * Math.sin(a0)) +
          " A" + R + " " + R + " 0 " + large + " 1 " + (cx + R * Math.cos(a1)) + " " + (cy + R * Math.sin(a1)) +
          " L" + (cx + r0 * Math.cos(a1)) + " " + (cy + r0 * Math.sin(a1)) +
          " A" + r0 + " " + r0 + " 0 " + large + " 0 " + (cx + r0 * Math.cos(a0)) + " " + (cy + r0 * Math.sin(a0)) + " Z";
        var path = svgEl("path", { d: p, fill: s.color, stroke: "#fff", "stroke-width": 2 });
        if (selected && s.name !== selected) path.setAttribute("fill-opacity", "0.3");
        svg.appendChild(path);
        a0 = a1;
      });
    }
    var ct = svgEl("text", { x: cx, y: cy - 2, "text-anchor": "middle", "font-size": 19, "font-weight": 800, fill: C.ink });
    ct.textContent = shortWon(total);
    svg.appendChild(ct);
    var cl = svgEl("text", { x: cx, y: cy + 16, "text-anchor": "middle", "font-size": 11, fill: C.muted });
    cl.textContent = compLabel() + " 합계";
    svg.appendChild(cl);
    wrap.appendChild(svg);
    var legend = el("div", "dLegend");
    segs.forEach(function (s) {
      var row = el("button", "dRow");
      row.type = "button";
      if (selected && s.name === selected) row.classList.add("sel");
      else if (selected) row.classList.add("dim");
      var sw = el("i"); sw.style.background = s.color;
      row.appendChild(sw);
      row.appendChild(el("b", null, s.name));
      row.appendChild(el("span", "pct", Math.round(s.amt / total * 100) + "%"));
      row.appendChild(el("span", "amt", won(s.amt)));
      if (!s.rest) {
        row.addEventListener("click", function () {
          state.cats = state.cats.length === 1 && state.cats[0] === s.name ? [] : [s.name];
          state.shown = 80;
          renderAll();
        });
        row.setAttribute("aria-label", s.name + " " + Math.round(s.amt / total * 100) + "% " + won(s.amt) + ", 누르면 이 분류만 필터");
      } else { row.style.cursor = "default"; }
      legend.appendChild(row);
    });
    wrap.appendChild(legend);
    box.appendChild(wrap);
  }

  // ---------- 요일 패턴
  function renderWeek() {
    var box = $("weekChart");
    box.textContent = "";
    var comp = compRows(viewRows());
    $("weekSub").textContent = compLabel() + " 합계 기준";
    if (!comp.length) { box.appendChild(el("div", "emptyBox", "기록이 없어요.")); return; }
    var sums = [0, 0, 0, 0, 0, 0, 0], cnts = [0, 0, 0, 0, 0, 0, 0];
    comp.forEach(function (r) { var i = dow(r.date); sums[i] += r.amount; cnts[i] += 1; });
    var maxVal = Math.max.apply(null, sums);
    var W = Math.max(280, box.clientWidth || 320), H = 150;
    var padT = 20, padB = 22, plotH = H - padT - padB;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H, role: "img" });
    svg.setAttribute("aria-label", "요일별 " + compLabel() + " 패턴");
    var band = W / 7, barW = Math.min(24, band * 0.5);
    var tip = makeTip(box);
    var peak = sums.indexOf(maxVal);
    sums.forEach(function (v, i) {
      var cx = band * i + band / 2;
      var hgt = maxVal > 0 ? Math.max(v > 0 ? 2 : 0, v / maxVal * plotH) : 0;
      var y = padT + plotH - hgt;
      if (hgt > 0) {
        var rr = Math.min(4, barW / 2, hgt);
        svg.appendChild(svgEl("path", {
          d: "M" + (cx - barW / 2) + " " + (padT + plotH) + " V" + (y + rr) + " Q" + (cx - barW / 2) + " " + y + " " + (cx - barW / 2 + rr) + " " + y +
            " H" + (cx + barW / 2 - rr) + " Q" + (cx + barW / 2) + " " + y + " " + (cx + barW / 2) + " " + (y + rr) + " V" + (padT + plotH) + " Z",
          fill: i === peak ? C.ex : "#9ec5f4",
        }));
      }
      if (i === peak && v > 0) {
        var lt = svgEl("text", { x: cx, y: y - 5, "text-anchor": "middle", "font-size": 10, "font-weight": 700, fill: C.sub });
        lt.textContent = shortWon(v);
        svg.appendChild(lt);
      }
      var xl = svgEl("text", { x: cx, y: H - 6, "text-anchor": "middle", "font-size": 11, fill: i === 0 ? C.bad : C.muted });
      xl.textContent = WEEK[i];
      svg.appendChild(xl);
      var hit = svgEl("rect", { x: band * i, y: 0, width: band, height: H, fill: "transparent", tabindex: 0 });
      function showTip() {
        var rect = box.getBoundingClientRect(), sr = hit.getBoundingClientRect();
        tip.show(sr.left - rect.left + sr.width / 2, padT + 10, WEEK[i] + "요일", [
          { color: state.type === "income" ? C.in_ : C.ex, label: compLabel(), value: won(v) },
          { color: "transparent", label: "건수", value: fmt(cnts[i]) + "건" },
        ]);
      }
      function hideTip() { tip.hide(); }
      hit.addEventListener("pointerenter", showTip);
      hit.addEventListener("pointerleave", hideTip);
      hit.addEventListener("focus", showTip);
      hit.addEventListener("blur", hideTip);
      svg.appendChild(hit);
    });
    box.appendChild(svg);
    var baseline = svgEl("line", { x1: 0, x2: W, y1: padT + plotH, y2: padT + plotH, stroke: C.axis, "stroke-width": 1 });
    svg.insertBefore(baseline, svg.firstChild);
  }

  // ---------- 가로 막대 목록 (결제수단/구성원)
  function renderHBars(boxId, field, filterKey, titleId, titleText) {
    var box = $(boxId);
    box.textContent = "";
    if (titleId) $(titleId).textContent = titleText;
    var comp = compRows(viewRows());
    if (!comp.length) { box.appendChild(el("div", "emptyBox", "기록이 없어요.")); return; }
    var by = Object.create(null);
    comp.forEach(function (r) { by[r[field]] = (by[r[field]] || 0) + r.amount; });
    var names = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
    var total = sumAmt(comp);
    var items = names.slice(0, 7).map(function (nm) { return { name: nm, amt: by[nm] }; });
    if (names.length > 7) {
      var rest = 0;
      names.slice(7).forEach(function (nm) { rest += by[nm]; });
      items.push({ name: "그 외 " + (names.length - 7) + "개", amt: rest, rest: true });
    }
    var maxVal = items[0] ? Math.max(items[0].amt, 1) : 1;
    var sel = state[filterKey].length === 1 ? state[filterKey][0] : "";
    var wrap = el("div", "hRows");
    items.forEach(function (it) {
      var row = el("button", "hRow");
      row.type = "button";
      if (sel && it.name === sel) row.classList.add("sel");
      else if (sel && !it.rest) row.classList.add("dim");
      var top = el("div", "hTop");
      top.appendChild(el("b", null, it.name));
      var right = el("span", null, won(it.amt));
      var share = el("small", null, Math.round(it.amt / total * 100) + "%");
      right.appendChild(share);
      top.appendChild(right);
      row.appendChild(top);
      var track = el("div", "hTrack");
      var fill = el("i", "hFill");
      fill.style.width = Math.max(2, Math.round(it.amt / maxVal * 100)) + "%";
      if (it.rest) fill.style.background = C.other;
      track.appendChild(fill);
      row.appendChild(track);
      if (!it.rest) {
        row.addEventListener("click", function () {
          state[filterKey] = state[filterKey].length === 1 && state[filterKey][0] === it.name ? [] : [it.name];
          state.shown = 80;
          renderAll();
        });
        row.setAttribute("aria-label", it.name + " " + won(it.amt) + " " + share.textContent + ", 누르면 필터 적용");
      } else { row.style.cursor = "default"; }
      wrap.appendChild(row);
    });
    box.appendChild(wrap);
  }

  // ---------- 예산 (이번 달 전체 기준, 필터 무관)
  function renderBudget() {
    var card = $("budgetCard");
    var focusId = document.activeElement && document.activeElement.id;
    paceState.restoreFocus = ["paceDate", "paceTableSummary", "paceTableScroll"].indexOf(focusId) >= 0 ? focusId : "";
    var oldTable = $("paceTable");
    if (oldTable) paceState.tableOpen = oldTable.open;
    var oldScroll = $("paceTableScroll");
    if (oldScroll) paceState.scrollLeft = oldScroll.scrollLeft;
    var inMonth = ymOf(state.start) === MONTH && ymOf(state.end) === MONTH;
    // 총액이 없으면 그릴 페이스 곡선도 없다. 분류만 있는 예산은 한눈에 보기가 맡는다.
    var hasBudget = BUDGET && Number(BUDGET.total) > 0;
    if (!inMonth || !hasBudget || state.type === "income") { card.hidden = true; paceState.showTip = false; return; }
    card.hidden = false;
    var box = $("budgetBox");
    box.textContent = "";
    var monthRows = budgetExpenseRows(ROWS.filter(function (r) { return !r.income && ymOf(r.date) === MONTH; }), BUDGET.cats, BUDGET.basis);
    var spent = sumAmt(monthRows);
    var total = Number(BUDGET.total) || 0;
    if (total > 0) {
      var rate = Math.round(spent / total * 100);
      var head = el("div", "hTop");
      head.appendChild(el("b", null, "전체 예산 " + won(total)));
      var rt = el("span", null, won(spent));
      rt.appendChild(el("small", null, rate + "% 사용"));
      head.appendChild(rt);
      box.appendChild(head);
      var meter = el("div", "meterBig");
      var fill = el("i");
      var color = spent > total ? C.crit : rate >= 85 ? C.warn : C.ex;
      var trackColor = spent > total ? "#f5d4d4" : rate >= 85 ? "#faeccb" : "#cde2fb";
      meter.style.background = trackColor;
      fill.style.width = Math.min(100, rate) + "%";
      fill.style.background = color;
      meter.appendChild(fill);
      box.appendChild(meter);
      var remain = total - spent;
      box.appendChild(el("div", "iChip", remain >= 0 ? "남은 예산 " + won(remain) : "예산 초과 " + won(-remain)));
      renderPaceChart(box, monthRows, total);
    }
    // 분류별 사용률은 바로 위 "한눈에 보기"가 이미 보여준다. 같은 화면에서 두 번
    // 그리면 어느 쪽이 최신인지 헷갈리므로 여기서는 페이스 곡선만 맡는다.
  }

  // ---------- One date model for the graph, selection, tooltip and table.
  function renderPaceChart(host, monthRows, total) {
    var model = insightPaceComparison({ month: MONTH, today: TODAY, rows: ROWS, budget: BUDGET, dataStart: DATA_START, dataEnd: DATA_END, receipt: RECEIPT, truncated: DATA.truncated });
    var daysIn = model.days;
    if (daysIn < 2 || total <= 0) return;
    var box = el("div", "chartBox paceChart");
    box.style.marginTop = "14px";
    host.appendChild(box);
    var scope = model.basis === "category" ? "선택 월 예산의 대상 분류 지출: " + model.categories.join(", ") + ". 기준 월과 지난달에 같은 분류를 적용합니다." : "월 전체 지출을 비교합니다.";
    scope += " 기간·분류·구성원·결제수단·금액·검색 필터와 무관합니다.";
    box.appendChild(el("p", "dataNote paceScope", scope));
    if (RECEIPT.status !== "complete" || DATA.truncated) box.appendChild(el("p", "dataNote paceUnavailable", observationReason(DATA.truncated ? "limit" : RECEIPT.status) + " 위 사용액·잔액과 다른 그래프도 현재 수신한 자료의 범위입니다."));
    if (!monthRows.length && RECEIPT.status === "complete" && model.observedDay) box.appendChild(el("p", "dataNote", "이 월의 예산 대상 지출 기록이 없습니다. 다른 기준 월을 선택하거나 기록을 확인해 주세요."));
    var legend = el("div", "paceLegend");
    [["current", MONTH + " 누적 지출 · 실선"], ["previous", model.previousMonth + " 누적 지출 · 긴 점선"], ["budget", "예산 페이스 · 짧은 점선"]].forEach(function (item) {
      var entry = el("span"), swatch = el("i", item[0]); swatch.setAttribute("aria-hidden", "true"); entry.appendChild(swatch); entry.appendChild(el("span", null, item[1])); legend.appendChild(entry);
    });
    box.appendChild(legend);
    var W = Math.max(280, host.clientWidth || 560), H = 210;
    var padL = 48, padR = 16, padT = 22, padB = 26;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var displayed = [total];
    model.points.forEach(function (p) { if (p.current !== null) displayed.push(p.current); if (p.previous !== null) displayed.push(p.previous); });
    var yMax = niceCeil(Math.max.apply(null, displayed) * 1.08);
    function xOf(day) { return padL + (day - 1) / (daysIn - 1) * plotW; }
    function yOf(value) { return padT + plotH - value / yMax * plotH; }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H, role: "img", "data-pace-chart": "", "data-pace-y-max": yMax });
    svg.setAttribute("aria-label", MONTH + "과 " + model.previousMonth + "의 같은 날짜 누적 지출 및 예산 페이스. 아래 날짜 선택과 표에서 같은 값을 확인할 수 있습니다.");
    [0, 0.5, 1].forEach(function (fraction) {
      var y = padT + plotH - plotH * fraction;
      svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: "var(--pace-grid)", "stroke-width": 1 }));
      var text = svgEl("text", { x: padL - 6, y: y + 4, "text-anchor": "end", "font-size": 11, fill: "var(--pace-ink)", "data-ab-num-unit": "원" });
      text.textContent = fraction === 0 ? "0" : shortWon(yMax * fraction); svg.appendChild(text);
    });
    [1, 10, 20, daysIn].forEach(function (day) {
      var text = svgEl("text", { x: xOf(day), y: H - 6, "text-anchor": "middle", "font-size": 11, fill: "var(--pace-ink)" });
      text.textContent = day + "일"; svg.appendChild(text);
    });
    svg.appendChild(svgEl("line", { x1: xOf(1), y1: yOf(total / daysIn), x2: xOf(daysIn), y2: yOf(total), stroke: "var(--pace-budget)", "stroke-width": 1.5, "stroke-dasharray": "3 4", "data-pace-series": "budget" }));
    var paceLabel = svgEl("text", { x: W - padR, y: Math.max(padT, yOf(total) - 6), "text-anchor": "end", "font-size": 11, fill: "var(--pace-ink)" });
    paceLabel.textContent = "예산 페이스"; svg.appendChild(paceLabel);
    function drawSeries(key, color, dash) {
      var path = "", segment = false, valid = [];
      model.points.forEach(function (p) {
        if (p[key] === null) { segment = false; return; }
        path += (segment ? "L" : "M") + xOf(p.day) + " " + yOf(p[key]); segment = true; valid.push(p);
      });
      if (!valid.length) return;
      var last = valid[valid.length - 1];
      if (key === "current") svg.appendChild(svgEl("path", { d: "M" + xOf(valid[0].day) + " " + (padT + plotH) + "L" + path.slice(1) + "L" + xOf(last.day) + " " + (padT + plotH) + "Z", fill: color, opacity: 0.10 }));
      svg.appendChild(svgEl("path", { d: path, fill: "none", stroke: color, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-dasharray": dash || "none", "data-pace-series": key }));
      svg.appendChild(svgEl("circle", { cx: xOf(last.day), cy: yOf(last[key]), r: 4, fill: color }));
      if (key === "current") {
        var label = svgEl("text", { x: Math.min(xOf(last.day), W - padR - 4), y: Math.max(padT + 10, yOf(last[key]) - 10), "text-anchor": xOf(last.day) > W - 80 ? "end" : "middle", "font-size": 12, "font-weight": 700, fill: "var(--pace-ink)", "data-ab-num-unit": "원", "data-pace-end": "" });
        label.textContent = shortWon(last[key]); svg.appendChild(label);
      }
    }
    drawSeries("previous", "var(--pace-previous)", "8 5");
    drawSeries("current", "var(--pace-current)", "");
    var hair = svgEl("line", { y1: padT, y2: padT + plotH, stroke: "var(--pace-ink)", "stroke-width": 1, "stroke-dasharray": "2 3" });
    svg.appendChild(hair);
    var hit = svgEl("rect", { x: padL, y: padT, width: plotW, height: plotH, fill: "transparent", "data-pace-hit": "" });
    svg.appendChild(hit); box.appendChild(svg);
    var instruction = el("p", "dataNote", "날짜를 터치하거나 아래 날짜 선택에서 방향키·Home·End로 이동하세요. 현재 월은 오늘까지만 관측합니다. 월 전체 예산 사용액에는 미래 날짜의 기록도 포함됩니다.");
    instruction.id = "paceInstructions"; box.appendChild(instruction);
    var label = el("label", "paceDateLabel", "비교 날짜 선택"); label.htmlFor = "paceDate"; box.appendChild(label);
    var slider = el("input", "paceDate"); slider.id = "paceDate"; slider.type = "range"; slider.min = "1"; slider.max = String(daysIn); slider.step = "1";
    slider.setAttribute("aria-describedby", "paceInstructions paceReadout"); box.appendChild(slider);
    var readout = el("div", "paceSelection"); readout.id = "paceReadout"; readout.setAttribute("aria-live", "off"); box.appendChild(readout);
    var tip = el("div", "tt paceTip"); tip.setAttribute("aria-hidden", "true"); box.appendChild(tip);
    function amountOrReason(value, status) { return value === null ? observationReason(status) : won(value); }
    function differenceText(point) {
      if (point.difference === null) return observationReason(point.status);
      if (point.difference === 0) return "같은 금액 (차액 0원)";
      return "지출 " + (point.difference > 0 ? "증가 " : "감소 ") + won(Math.abs(point.difference)) + (point.percent === null ? " · 지난달 0원으로 증감률을 계산하지 않습니다." : " (" + (point.percent > 0 ? "+" : "") + point.percent + "%)");
    }
    function selectionLines(point) {
      return [point.date + " 누적 지출: " + amountOrReason(point.current, point.currentStatus), (point.previousDate || "지난달 대응 날짜 없음") + " 누적 지출: " + amountOrReason(point.previous, point.previousStatus), differenceText(point), "예산 페이스: " + won(point.pace)];
    }
    function choose(day, showTip) {
      day = Math.max(1, Math.min(daysIn, day)); paceState.day = day; paceState.showTip = showTip;
      var point = model.points[day - 1], lines = selectionLines(point);
      slider.value = String(day); slider.setAttribute("aria-valuetext", lines.join(". "));
      readout.textContent = ""; readout.setAttribute("data-pace-day", String(day));
      lines.forEach(function (line) { readout.appendChild(el("p", null, line)); });
      hair.setAttribute("x1", xOf(day)); hair.setAttribute("x2", xOf(day));
      tip.textContent = ""; lines.forEach(function (line) { tip.appendChild(el("p", null, line)); });
      tip.style.opacity = showTip ? "1" : "0";
      var rect = svg.getBoundingClientRect();
      tip.style.left = Math.max(4, Math.min(box.clientWidth - tip.offsetWidth - 4, xOf(day) / W * rect.width - tip.offsetWidth / 2)) + "px";
      tip.style.top = Math.max(0, svg.offsetTop - tip.offsetHeight) + "px";
    }
    function showPointer(event) {
      var rect = svg.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * W;
      choose(Math.round((x - padL) / plotW * (daysIn - 1) + 1), true);
    }
    hit.addEventListener("pointermove", function (event) { if (event.pointerType !== "touch") showPointer(event); });
    hit.addEventListener("pointerdown", showPointer);
    hit.addEventListener("pointerleave", function () { paceState.showTip = false; tip.style.opacity = "0"; });
    slider.addEventListener("input", function () { choose(Number(slider.value), false); });
    slider.addEventListener("keydown", function (event) {
      var next = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
      if (next || event.key === "Home" || event.key === "End") { event.preventDefault(); choose(event.key === "Home" ? 1 : event.key === "End" ? daysIn : paceState.day + next, false); }
    });
    choose(paceState.day === null ? Math.max(1, model.observedDay) : paceState.day, false);
    var twin = el("details", "twin paceTable"); twin.id = "paceTable"; twin.open = paceState.tableOpen;
    twin.addEventListener("toggle", function () { paceState.tableOpen = twin.open; });
    var summary = el("summary", null, "표로 보기"); summary.id = "paceTableSummary"; twin.appendChild(summary);
    var scroll = el("div", "paceTableScroll"); scroll.id = "paceTableScroll"; scroll.tabIndex = 0; scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "누적 비교 표. 가로로 이동하여 모든 열을 확인하세요.");
    var table = el("table"), caption = el("caption", null, scope); table.appendChild(caption);
    var thead = el("thead"), th = el("tr");
    ["기준 날짜", "지난달 대응 날짜", "기준 월 누적 지출", "지난달 누적 지출", "차액·증감", "예산 페이스", "비교 상태"].forEach(function (heading) { var cell = el("th", null, heading); cell.setAttribute("scope", "col"); th.appendChild(cell); });
    thead.appendChild(th); table.appendChild(thead);
    var tbody = el("tbody");
    model.points.forEach(function (point) {
      var tr = el("tr"); tr.setAttribute("data-pace-date", point.date);
      [point.date, point.previousDate || "해당 날짜 없음", amountOrReason(point.current, point.currentStatus), amountOrReason(point.previous, point.previousStatus), differenceText(point), won(point.pace), point.status === "complete" ? "관측 완료" : observationReason(point.status)].forEach(function (value) { tr.appendChild(el("td", null, value)); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); scroll.appendChild(table); twin.appendChild(scroll); box.appendChild(twin);
    scroll.scrollLeft = paceState.scrollLeft;
    if (paceState.restoreFocus) $(paceState.restoreFocus).focus({ preventScroll: true });
  }


  // ---------- 큰 금액 TOP
  function renderTop() {
    var box = $("topList");
    box.textContent = "";
    $("topTitle").textContent = "큰 " + compLabel() + " TOP";
    var comp = compRows(viewRows()).slice().sort(function (a, b) { return b.amount - a.amount; }).slice(0, 8);
    $("topSub").textContent = comp.length ? "금액 순 상위 " + comp.length + "건" : "";
    if (!comp.length) { box.appendChild(el("div", "emptyBox", "기록이 없어요.")); return; }
    comp.forEach(function (r) {
      var row = el("a", "txRow");
      row.href = dayEditHref(r.date);
      row.title = "이 날 기록 열기·수정";
      var dot = el("span", "dot");
      dot.style.background = r.income ? C.in_ : catColor(r.cat);
      row.appendChild(dot);
      var mid = el("div", "mid");
      mid.appendChild(el("b", null, r.memo || r.cat));
      mid.appendChild(el("span", null, fmtMD(r.date) + " · " + r.cat + (r.pay !== "미지정" ? " · " + r.pay : "")));
      row.appendChild(mid);
      row.appendChild(el("span", "amt" + (r.income ? " in" : ""), (r.income ? "+" : "") + won(r.amount)));
      box.appendChild(row);
    });
  }

  // ---------- 기록 목록
  function renderList() {
    var box = $("txList");
    box.textContent = "";
    var rows = viewRows().slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    $("txCount").textContent = fmt(rows.length) + "건";
    var more = $("moreBtn");
    if (!rows.length) {
      box.appendChild(el("div", "emptyBox", "조건에 맞는 기록이 없어요."));
      more.hidden = true;
      return;
    }
    var shown = rows.slice(0, state.shown);
    var curDate = "", group = null;
    shown.forEach(function (r) {
      if (r.date !== curDate) {
        curDate = r.date;
        group = el("div", "txGroup");
        var head = el("div", "txDate");
        head.appendChild(el("b", null, fmtDateK(r.date)));
        var dayRows = rows.filter(function (x) { return x.date === r.date; });
        var dex = sumAmt(dayRows.filter(function (x) { return !x.income; }));
        var din = sumAmt(dayRows.filter(function (x) { return x.income; }));
        head.appendChild(el("span", null, (dex ? "지출 " + won(dex) : "") + (dex && din ? " · " : "") + (din ? "수입 " + won(din) : "")));
        group.appendChild(head);
        box.appendChild(group);
      }
      var row = el("a", "txRow");
      row.href = dayEditHref(r.date);
      row.title = "이 날 기록 열기·수정";
      var dot = el("span", "dot");
      dot.style.background = r.income ? C.in_ : catColor(r.cat);
      row.appendChild(dot);
      var mid = el("div", "mid");
      mid.appendChild(el("b", null, r.memo || r.cat));
      var meta = [r.cat];
      if (r.pay !== "미지정") meta.push(r.pay);
      if (r.who !== "미지정" && WHOS.length > 1) meta.push(r.who);
      mid.appendChild(el("span", null, meta.join(" · ")));
      row.appendChild(mid);
      row.appendChild(el("span", "amt" + (r.income ? " in" : ""), (r.income ? "+" : "−") + won(r.amount)));
      group.appendChild(row);
    });
    more.hidden = rows.length <= state.shown;
    more.textContent = "더 보기 (" + fmt(rows.length - state.shown) + "건 남음)";
  }
  function downloadCsv() {
    var rows = viewRows().slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var head = ["날짜", "구분", "금액", "분류", "내용", "결제수단", "입력자"];
    function cell(v) {
      v = String(v == null ? "" : v);
      if (/^[=+\-@]/.test(v)) v = "'" + v;
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var lines = [head.join(",")];
    rows.forEach(function (r) {
      lines.push([r.date, r.income ? "수입" : "지출", r.amount, r.cat, r.memo, r.pay, r.who].map(cell).join(","));
    });
    var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "analysis_" + state.start.replace(/-/g, "") + "-" + state.end.replace(/-/g, "") + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
  }

  // ---------- 필터 UI
  function renderPeriodChips() {
    var box = $("periodChips");
    box.textContent = "";
    PRESETS.forEach(function (p) {
      var b = el("button", "pchip" + (state.preset === p.id ? " on" : ""), p.label);
      b.type = "button";
      b.setAttribute("aria-pressed", state.preset === p.id ? "true" : "false");
      b.addEventListener("click", function () {
        if (p.id === "custom") {
          state.preset = "custom";
          $("customRange").hidden = false;
          $("startDate").value = state.start;
          $("endDate").value = state.end;
          renderPeriodChips();
          return;
        }
        $("customRange").hidden = true;
        setPreset(p.id);
        renderAll();
      });
      box.appendChild(b);
    });
    $("customRange").hidden = state.preset !== "custom";
    if (state.preset === "custom") {
      if (!$("startDate").value) $("startDate").value = state.start;
      if (!$("endDate").value) $("endDate").value = state.end;
    }
  }
  function renderTypeSeg() {
    var box = $("typeSeg");
    box.textContent = "";
    [["expense", "지출"], ["income", "수입"], ["all", "전체"]].forEach(function (p) {
      var b = el("button", state.type === p[0] ? "on" : "", p[1]);
      b.type = "button";
      b.setAttribute("aria-pressed", state.type === p[0] ? "true" : "false");
      b.addEventListener("click", function () {
        if (state.type === p[0]) return;
        state.type = p[0];
        state.shown = 80;
        renderAll();
      });
      box.appendChild(b);
    });
  }
  function renderDimChips(boxId, items, key) {
    var box = $(boxId);
    box.textContent = "";
    items.forEach(function (it) {
      var on = state[key].indexOf(it.v) >= 0;
      var b = el("button", "tchip" + (on ? " on" : ""), it.v);
      b.type = "button";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.appendChild(el("small", null, fmt(it.n)));
      b.addEventListener("click", function () {
        toggleList(state[key], it.v);
        state.shown = 80;
        renderAll();
      });
      box.appendChild(b);
    });
  }
  function renderPanel() {
    renderDimChips("catChips", CATS, "cats");
    renderDimChips("payChips", PAYS, "pays");
    if (WHOS.length > 1) renderDimChips("whoChips", WHOS, "whos");
    else $("whoGroup").hidden = true;
    $("minAmt").value = state.min != null ? state.min : "";
    $("maxAmt").value = state.max != null ? state.max : "";
    var anyDim = state.cats.length || state.pays.length || state.whos.length || state.min != null || state.max != null;
    $("panelBtn").className = "fBtn" + (anyDim ? " on" : "");
  }
  function renderActiveChips() {
    var box = $("activeChips");
    box.textContent = "";
    function chip(label, onRemove) {
      var b = el("button", "aChip", label + " ");
      b.type = "button";
      b.appendChild(el("i", null, "✕"));
      b.addEventListener("click", function () { onRemove(); state.shown = 80; renderAll(); });
      box.appendChild(b);
    }
    if (state.preset === "custom") chip(fmtRangeK(state.start, state.end), function () { setPreset("month"); $("customRange").hidden = true; });
    state.cats.slice().forEach(function (c2) { chip(c2, function () { toggleList(state.cats, c2); }); });
    state.pays.slice().forEach(function (c2) { chip(c2, function () { toggleList(state.pays, c2); }); });
    state.whos.slice().forEach(function (c2) { chip(c2, function () { toggleList(state.whos, c2); }); });
    if (state.min != null || state.max != null) {
      chip((state.min != null ? fmt(state.min) : "0") + "원~" + (state.max != null ? fmt(state.max) + "원" : ""), function () { state.min = null; state.max = null; });
    }
    if (state.q) chip("검색: " + state.q, function () { state.q = ""; $("searchInput").value = ""; });
  }

  // ---------- 전체 렌더
  function renderUnreceivedRange() {
    var outside = state.start < DATA_START || state.end > DATA_END;
    $("csvBtn").disabled = outside;
    $("csvBtn").title = outside ? "수신 범위 안의 기간을 선택한 뒤 내려받을 수 있습니다." : "";
    if (!outside) return false;
    var message = "선택 기간의 자료를 수신하지 못했습니다. 기준 월을 바꾸거나 조회 기간을 다시 선택해 주세요.";
    ["insights", "trendChart", "trendTable", "catChart", "weekChart", "payChart", "whoChart", "topList", "txList"].forEach(function (id) { var box = $(id); box.textContent = ""; box.appendChild(el("div", "emptyBox", message)); });
    ["catSub", "weekSub", "topSub", "txCount"].forEach(function (id) { $(id).textContent = "미수신"; });
    $("trendLegend").textContent = "";
    $("moreBtn").hidden = true;
    $("budgetCard").hidden = true;
    paceState.showTip = false;
    return true;
  }
  function renderAll() {
    rebuildViewColors();
    renderPeriodChips();
    renderTypeSeg();
    renderPanel();
    renderActiveChips();
    renderKpis();
    if (renderUnreceivedRange()) { syncUrl(); return; }
    renderInsights();
    renderTrend();
    renderCat();
    renderWeek();
    renderHBars("payChart", "pay", "pays", "payTitle", "결제수단별 " + compLabel());
    if (WHOS.length > 1) renderHBars("whoChart", "who", "whos", "whoTitle", "구성원별 " + compLabel());
    else $("whoCard").hidden = true;
    renderBudget();
    renderTop();
    renderList();
    syncUrl();
  }

  // ---------- 이벤트
  $("panelBtn").addEventListener("click", function () {
    var p = $("filterPanel");
    p.hidden = !p.hidden;
  });
  $("resetBtn").addEventListener("click", function () {
    setPreset("month");
    state.type = "expense";
    state.cats = []; state.pays = []; state.whos = [];
    state.min = null; state.max = null; state.q = "";
    $("searchInput").value = "";
    $("customRange").hidden = true;
    $("filterPanel").hidden = true;
    renderAll();
  });
  $("rangeApply").addEventListener("click", function () {
    var s = $("startDate").value, e = $("endDate").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return;
    var r = clampRange(s <= e ? [s, e] : [e, s]);
    setPreset("custom", r[0], r[1]);
    renderAll();
  });
  $("amtApply").addEventListener("click", function () {
    var mn = Number($("minAmt").value), mx = Number($("maxAmt").value);
    state.min = $("minAmt").value !== "" && isFinite(mn) && mn > 0 ? mn : null;
    state.max = $("maxAmt").value !== "" && isFinite(mx) && mx > 0 ? mx : null;
    state.shown = 80;
    renderAll();
  });
  $("searchInput").value = state.q;
  $("searchInput").addEventListener("input", debounce(function () {
    state.q = $("searchInput").value.trim();
    state.shown = 80;
    renderAll();
  }, 250));
  $("moreBtn").addEventListener("click", function () {
    state.shown += 120;
    renderList();
  });
  $("csvBtn").addEventListener("click", downloadCsv);
  window.addEventListener("resize", debounce(function () { if (renderUnreceivedRange()) return; renderTrend(); renderWeek(); renderBudget(); }, 180));

  // ---------- 초기 진입
  if (!ROWS.length) {
    var kb = $("kpis");
    kb.textContent = "";
    var empty = el("div", "kpi");
    empty.appendChild(el("span", null, "아직 분석할 기록이 없어요"));
    empty.appendChild(el("b", null, "첫 기록을 남겨보세요"));
    empty.appendChild(el("small", null, "카카오톡에서 '점심 12000원 국민카드'처럼 보내거나 홈에서 입력하면 이곳에 차트가 채워집니다."));
    kb.appendChild(empty);
  }
  renderAll();
}
// @build:exports-start
export {
  budgetExpenseRows, insightClientMain, insightObservedWindow, insightPaceComparison,
  insightPeriodCoverage,
};
// @build:exports-end
