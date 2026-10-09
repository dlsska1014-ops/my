
// 분석 스튜디오 클라이언트. /my/analysis/app.js 로 toString() 직렬화되어 그대로 서빙되므로
// 외부 함수/변수를 절대 참조하지 말 것 (완전 자급자족 함수).
function budgetExpenseRows(rows = [], categories = [], basis = "total") {
  const covered = new Set(categories.map(row => Array.isArray(row) ? row[0] : row.category));
  return rows.filter(row => !row.income && row.type !== "income" && (basis !== "category" || covered.has(row.cat || row.category)));
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

  // 분류 색상: 현재 조회 결과의 금액 순위 기준으로 배정.
  // 전체 기간 고정 배정은 이번 달 상위 분류가 장기 순위 밖이면 전부 회색이 되는 문제가 있어,
  // 화면 안에서 항상 구분되는 것을 우선한다 (범례가 항상 붙어 있어 식별은 범례가 담당).
  var viewCatColors = {};
  function rebuildViewColors() {
    viewCatColors = {};
    var by = {};
    compRows(viewRows()).forEach(function (r) { by[r.cat] = (by[r.cat] || 0) + r.amount; });
    Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).forEach(function (c2, i) {
      viewCatColors[c2] = i < C.cat.length ? C.cat[i] : C.other;
    });
  }
  function catColor(c) { return viewCatColors[c] || C.other; }

  function dimValues(field, incomeToo) {
    var m = {};
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
  function renderKpis() {
    var box = $("kpis");
    box.textContent = "";
    var rows = rangeRows();
    var ex = sumAmt(rows.filter(function (r) { return !r.income; }));
    var inc = sumAmt(rows.filter(function (r) { return r.income; }));
    var pw = prevWindow();
    var hasPrev = pw.start >= DATA_START;
    var pex = null, pinc = null;
    if (hasPrev) {
      var prows = rowsIn(pw.start, pw.end, false);
      pex = sumAmt(prows.filter(function (r) { return !r.income; }));
      pinc = sumAmt(prows.filter(function (r) { return r.income; }));
    }
    var elapsed = pw.span;
    box.appendChild(kpiTile("지출", won(ex), hasPrev ? pct(ex, pex) : null, true, "", pw.label));
    box.appendChild(kpiTile("수입", won(inc), hasPrev ? pct(inc, pinc) : null, false, "", pw.label));
    var net = inc - ex;
    box.appendChild(kpiTile("수입-지출", (net < 0 ? "-" : "") + won(Math.abs(net)), null, false, inc > 0 ? "저축률 " + Math.round(net / inc * 100) + "%" : ""));
    box.appendChild(kpiTile("조회기간 하루 평균 지출", won(elapsed > 0 ? Math.round(ex / elapsed) : 0), null, false, state.start + " ~ " + (state.end > TODAY && state.start <= TODAY ? TODAY : state.end) + " (" + elapsed + "일 기준)"));
    box.appendChild(kpiTile("기록", fmt(viewRows().length) + "건", null, false, compLabel() + " 기준 목록"));
  }

  // ---------- 인사이트 칩
  function renderInsights() {
    var box = $("insights");
    box.textContent = "";
    var rows = viewRows();
    var comp = compRows(rows);
    if (!comp.length) return;
    var total = sumAmt(comp);
    var pw = prevWindow();
    var span = pw.span;
    if (pw.start >= DATA_START) {
      var prev = sumAmt(compRows(rowsIn(pw.start, pw.end, true)));
      var d = pct(total, prev);
      if (d != null && d !== 0) {
        var bad = state.type === "income" ? d < 0 : d > 0;
        box.appendChild(el("span", "iChip " + (bad ? "bad" : "good"), pw.label + "보다 " + compLabel() + " " + Math.abs(d) + "% " + (d > 0 ? "증가" : "감소")));
      }
    }
    var byCat = {};
    comp.forEach(function (r) { byCat[r.cat] = (byCat[r.cat] || 0) + r.amount; });
    var top = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; })[0];
    if (top && !state.cats.length) box.appendChild(el("span", "iChip", top + " " + Math.round(byCat[top] / total * 100) + "%"));
    var byDay = {};
    comp.forEach(function (r) { byDay[r.date] = (byDay[r.date] || 0) + r.amount; });
    var maxDay = Object.keys(byDay).sort(function (a, b) { return byDay[b] - byDay[a]; })[0];
    if (maxDay) box.appendChild(el("span", "iChip", "최대 " + compLabel() + "일 " + fmtMD(maxDay) + " · " + shortWon(byDay[maxDay]) + "원"));
    if (state.type !== "income" && span <= 62) {
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
    var idx = {};
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
    var byCat = {};
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
        row.setAttribute("aria-label", s.name + " " + won(s.amt) + ", 누르면 이 분류만 필터");
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
    var by = {};
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
        row.setAttribute("aria-label", it.name + " " + won(it.amt) + ", 누르면 필터 적용");
      } else { row.style.cursor = "default"; }
      wrap.appendChild(row);
    });
    box.appendChild(wrap);
  }

  // ---------- 예산 (이번 달 전체 기준, 필터 무관)
  function renderBudget() {
    var card = $("budgetCard");
    var inMonth = ymOf(state.start) === MONTH && ymOf(state.end) === MONTH;
    // 총액이 없으면 그릴 페이스 곡선도 없다. 분류만 있는 예산은 한눈에 보기가 맡는다.
    var hasBudget = BUDGET && Number(BUDGET.total) > 0;
    if (!inMonth || !hasBudget || state.type === "income") { card.hidden = true; return; }
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

  // ---------- 예산 페이스 차트: 누적 지출 곡선 vs 일정 속도 기준선
  function renderPaceChart(host, monthRows, total) {
    var daysIn = Number(monthEnd(MONTH).slice(8, 10));
    if (daysIn < 2 || total <= 0) return;
    var byDay = {};
    monthRows.forEach(function (r) { byDay[r.date] = (byDay[r.date] || 0) + r.amount; });
    var cum = [], run = 0;
    for (var d = 1; d <= daysIn; d++) {
      run += byDay[MONTH + "-" + String(d).padStart(2, "0")] || 0;
      cum.push(run);
    }
    var todayDay = IS_CUR ? Math.max(1, Math.min(daysIn, Number(TODAY.slice(8, 10)))) : daysIn;
    var yMax = niceCeil(Math.max(total, cum[todayDay - 1] || 0) * 1.08);
    var box = el("div", "chartBox");
    box.style.marginTop = "14px";
    host.appendChild(box);
    var W = Math.max(300, host.clientWidth || 560), H = 190;
    var padL = 46, padR = 14, padT = 16, padB = 22;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    function xOf(day) { return padL + (day - 1) / (daysIn - 1) * plotW; }
    function yOf(v) { return padT + plotH - Math.min(1, v / yMax) * plotH; }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H, role: "img" });
    svg.setAttribute("aria-label", "이번 달 누적 지출과 예산 기준선 비교 차트");
    [0, 0.5, 1].forEach(function (f) {
      var y = padT + plotH - plotH * f;
      svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: f === 0 ? C.axis : C.grid, "stroke-width": 1 }));
      var t = svgEl("text", { x: padL - 6, y: y + 4, "text-anchor": "end", "font-size": 10, fill: C.muted });
      t.textContent = f === 0 ? "0" : shortWon(yMax * f);
      svg.appendChild(t);
    });
    [1, 10, 20, daysIn].forEach(function (d2) {
      var t = svgEl("text", { x: xOf(d2), y: H - 6, "text-anchor": "middle", "font-size": 10, fill: C.muted });
      t.textContent = d2 + "일";
      svg.appendChild(t);
    });
    // 기준선: 한 달 동안 일정한 속도로 쓸 때의 누적 예산
    svg.appendChild(svgEl("line", { x1: xOf(1), y1: yOf(total / daysIn), x2: xOf(daysIn), y2: yOf(total), stroke: "#C6CDD5", "stroke-width": 1.5 }));
    var paceLabel = svgEl("text", { x: W - padR, y: Math.max(padT + 10, yOf(total) - 6), "text-anchor": "end", "font-size": 10, "font-weight": 700, fill: C.muted });
    paceLabel.textContent = "예산 페이스";
    svg.appendChild(paceLabel);
    // 누적 지출 곡선 + 면 채움
    var lineP = "", areaP = "";
    for (var i = 1; i <= todayDay; i++) {
      var px = xOf(i), py = yOf(cum[i - 1]);
      lineP += (i === 1 ? "M" : "L") + px + " " + py;
      areaP += (i === 1 ? "M" + px + " " + (padT + plotH) + "L" : "L") + px + " " + py;
    }
    areaP += "L" + xOf(todayDay) + " " + (padT + plotH) + "Z";
    svg.appendChild(svgEl("path", { d: areaP, fill: C.ex, opacity: 0.1 }));
    svg.appendChild(svgEl("path", { d: lineP, fill: "none", stroke: C.ex, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    var endX = xOf(todayDay), endY = yOf(cum[todayDay - 1]);
    svg.appendChild(svgEl("circle", { cx: endX, cy: endY, r: 4.5, fill: C.ex, stroke: "#fff", "stroke-width": 2 }));
    var endLabel = svgEl("text", { x: Math.min(endX, W - padR - 4), y: Math.max(padT + 10, endY - 9), "text-anchor": endX > W - 80 ? "end" : "middle", "font-size": 11, "font-weight": 700, fill: C.sub });
    endLabel.textContent = shortWon(cum[todayDay - 1]);
    svg.appendChild(endLabel);
    // 세로 크로스헤어 + 툴팁
    var tip = makeTip(box);
    var hair = svgEl("line", { y1: padT, y2: padT + plotH, stroke: C.axis, "stroke-width": 1, opacity: 0 });
    svg.appendChild(hair);
    var hit = svgEl("rect", { x: padL, y: padT, width: plotW, height: plotH, fill: "transparent" });
    function showAt(clientX) {
      var rect = svg.getBoundingClientRect();
      var frac = (clientX - rect.left) / rect.width;
      var day = Math.max(1, Math.min(daysIn, Math.round(frac * W <= padL ? 1 : ((frac * W - padL) / plotW) * (daysIn - 1) + 1)));
      hair.setAttribute("x1", xOf(day));
      hair.setAttribute("x2", xOf(day));
      hair.setAttribute("opacity", "1");
      var pace = total * day / daysIn;
      var cv = day <= todayDay ? cum[day - 1] : null;
      var rows = [];
      if (cv != null) rows.push({ color: C.ex, label: "누적 지출", value: won(cv) });
      rows.push({ color: "#C6CDD5", label: "예산 페이스", value: won(Math.round(pace)) });
      if (cv != null) rows.push({ color: "transparent", label: cv > pace ? "기준보다 초과" : "기준보다 여유", value: won(Math.abs(Math.round(cv - pace))) });
      var bRect = box.getBoundingClientRect();
      var sRect = svg.getBoundingClientRect();
      tip.show(sRect.left - bRect.left + xOf(day) / W * sRect.width, sRect.top - bRect.top + padT, fmtDateK(MONTH + "-" + String(day).padStart(2, "0")), rows);
    }
    hit.addEventListener("pointermove", function (ev) { showAt(ev.clientX); });
    hit.addEventListener("pointerleave", function () { hair.setAttribute("opacity", "0"); tip.hide(); });
    svg.appendChild(hit);
    box.appendChild(svg);
    var twin = el("details", "twin");
    twin.appendChild(el("summary", null, "표로 보기"));
    var t2 = el("table"), th = el("tr");
    ["날짜", "누적 지출", "예산 페이스"].forEach(function (h2) { th.appendChild(el("th", null, h2)); });
    var thead = el("thead"); thead.appendChild(th); t2.appendChild(thead);
    var tb = el("tbody");
    for (var d3 = 1; d3 <= todayDay; d3++) {
      var tr = el("tr");
      tr.appendChild(el("td", null, d3 + "일"));
      tr.appendChild(el("td", null, won(cum[d3 - 1])));
      tr.appendChild(el("td", null, won(Math.round(total * d3 / daysIn))));
      tb.appendChild(tr);
    }
    t2.appendChild(tb);
    twin.appendChild(t2);
    box.appendChild(twin);
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
  function renderAll() {
    rebuildViewColors();
    renderPeriodChips();
    renderTypeSeg();
    renderPanel();
    renderActiveChips();
    renderKpis();
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
  window.addEventListener("resize", debounce(function () { renderTrend(); renderWeek(); renderBudget(); }, 180));

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
export { budgetExpenseRows, insightClientMain };
// @build:exports-end
