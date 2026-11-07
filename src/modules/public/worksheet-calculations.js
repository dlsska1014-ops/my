// Pure calculations shared by the public examples, offline worksheets and validation.
// Keep this function self-contained: the downloadable HTML serializes it.
function worksheetComputeV229106(slug, input) {
  const fail = (message) => { throw new Error(message); };
  const number = (value, signed = false) => {
    const text = String(value ?? "").trim();
    if (!(signed ? /^-?\d+$/ : /^\d+$/).test(text)) fail("금액과 비율은 빈칸 없이 정수로 입력해 주세요.");
    const result = Number(text);
    if (!Number.isSafeInteger(result) || Math.abs(result) > 1e12) fail("입력값은 1조 이하의 정수여야 합니다.");
    return result;
  };
  const sum = (values) => {
    const result = values.reduce((a, b) => a + b, 0);
    if (!Number.isSafeInteger(result)) fail("합계가 계산 가능한 범위를 넘었습니다.");
    return result;
  };
  const date = (value) => {
    const text = String(value ?? "");
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(text)) fail("날짜는 2000~2099년의 실제 날짜로 입력해 주세요.");
    const ms = Date.parse(text + "T00:00:00Z");
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== text) fail("달력에 없는 날짜가 있습니다.");
    return ms / 86400000;
  };
  const list = (name, max = 100) => {
    const rows = input[name];
    if (!Array.isArray(rows) || !rows.length || rows.length > max) fail(`입력 행은 1~${max}개로 작성해 주세요.`);
    return rows;
  };
  const nameOf = (value) => {
    const name = String(value ?? "").trim();
    if (!name || name.length > 60 || /[,\r\n]/.test(name)) fail("이름과 식별자는 쉼표 없이 1~60자로 입력해 주세요.");
    return name;
  };
  const allocate = (total, weights) => {
    if (weights.some((n) => !Number.isSafeInteger(n) || n < 0)) fail("배분 비율을 확인해 주세요.");
    const denom = weights.reduce((a, b) => a + BigInt(b), 0n);
    if (!denom) fail("참여자의 비율 합계는 0보다 커야 합니다.");
    const parts = weights.map((w, i) => ({ i, value: Number(BigInt(total) * BigInt(w) / denom), rest: BigInt(total) * BigInt(w) % denom }));
    let left = total - sum(parts.map((p) => p.value));
    const order = [...parts].sort((a, b) => a.rest === b.rest ? a.i - b.i : a.rest > b.rest ? -1 : 1);
    for (let i = 0; i < left; i++) order[i].value++;
    return parts.map((p) => p.value);
  };
  const table = (caption, headers, rows) => ({ caption, headers, rows });
  const setting = input.settings || {};
  if (slug === "shared-living-cost-rules") {
    const people = list("people", 12);
    const names = people.map((p) => nameOf(p.name));
    if (new Set(names).size !== names.length) fail("참여자 이름이 중복됩니다.");
    const paid = names.map(() => 0);
    const groups = new Map();
    for (const row of list("transactions")) {
      const payer = names.indexOf(nameOf(row.payer));
      if (payer < 0) fail("결제자를 참여자 목록에 먼저 추가해 주세요.");
      const amount = number(row.amount);
      const selected = String(row.participants ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!selected.length || new Set(selected).size !== selected.length || selected.some((n) => !names.includes(n))) fail("각 지출의 참여자를 중복 없이 쉼표로 구분해 적어 주세요.");
      const ids = selected.map((n) => names.indexOf(n)).sort((a, b) => a - b);
      const key = ids.join(",");
      const group = groups.get(key) || { ids, amount: 0 };
      group.amount = sum([group.amount, amount]); groups.set(key, group);
      paid[payer] = sum([paid[payer], amount]);
    }
    const methods = [["균등 분담", "equal"], ["소득 비율", "income"], ["이용량 비율", "use"], ["합의 비율", "agreed"]];
    const methodsOut = methods.map(([label, field]) => {
      const shares = names.map(() => 0);
      for (const { ids, amount } of groups.values()) {
        const values = allocate(amount, ids.map((i) => field === "equal" ? 1 : number(people[i][field])));
        ids.forEach((id, i) => { shares[id] = sum([shares[id], values[i]]); });
      }
      const net = paid.map((value, i) => value - shares[i]);
      const transfers = [];
      const balances = [...net];
      for (let from = 0; from < names.length; from++) for (let to = 0; to < names.length && balances[from] < 0; to++) {
        if (balances[to] <= 0) continue;
        const amount = Math.min(-balances[from], balances[to]);
        transfers.push([names[from], names[to], amount]); balances[from] += amount; balances[to] -= amount;
      }
      return { label, shares, net, transfers };
    });
    return { total: sum(paid), methods: methodsOut, tables: methodsOut.flatMap((m) => [table(m.label + " (원)", ["참여자", "결제액", "부담액", "받을 돈(+)/보낼 돈(-)"], names.map((n, i) => [n, paid[i], m.shares[i], m.net[i]])), table(m.label + " 송금 제안 (원)", ["보내는 사람", "받는 사람", "금액"], m.transfers.length ? m.transfers : [["추가 송금 없음", "", 0]])]), notes: ["참여자가 같은 지출을 합친 뒤 비율을 적용했습니다. 원 미만을 버리고 소수 부분이 큰 순서로 남은 원을 배정하며, 동률이면 참여자 입력 순서를 따릅니다.", "이는 합의용 계산표입니다. 실제 가계부의 자동 정산이나 송금을 실행하지 않으며, 환불은 원거래와 별도로 합의해 반영해 주세요."] };
  }
  if (slug === "roommate-shared-ledger") {
    const start = date(setting.start), end = date(setting.end), cost = number(setting.cost);
    if (end <= start || end - start > 366) fail("비용 기간은 시작일 이상·종료일 미만이며 1~366일이어야 합니다.");
    const people = list("people", 12).map((p) => ({ name: nameOf(p.name), start: date(p.start), end: date(p.end) }));
    if (new Set(people.map((p) => p.name)).size !== people.length) fail("거주자 이름이 중복됩니다.");
    if (people.some((p) => p.end <= p.start)) fail("퇴거일은 입주일보다 뒤여야 합니다. 퇴거일 당일은 제외합니다.");
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    let scale = 1;
    for (let i = 1; i <= people.length; i++) scale = scale * i / gcd(scale, i);
    const weights = people.map(() => 0).concat(0), days = people.map(() => 0);
    let vacantDays = 0;
    for (let d = start; d < end; d++) {
      const active = people.map((p, i) => p.start <= d && d < p.end ? i : -1).filter((i) => i >= 0);
      if (!active.length) { weights[people.length] += scale; vacantDays++; }
      for (const i of active) { weights[i] += scale / active.length; days[i]++; }
    }
    const daily = allocate(cost, weights);
    const personDays = sum(days) ? allocate(cost, days) : people.map(() => 0);
    return { daily: daily.slice(0, people.length), personDays, unassigned: daily[people.length], vacantDays, tables: [table("두 합의 방식 비교 (원)", ["거주자", "기간 안 거주 일수", "날짜별 분담", "거주 인일 비례"], people.map((p, i) => [p.name, days[i], daily[i], personDays[i]]).concat([["별도 합의가 필요한 비용", vacantDays, daily[people.length], sum(days) ? 0 : cost]]))], notes: ["입주일을 포함하고 퇴거일을 제외합니다. 날짜별 방식은 그날 거주자끼리 비용을 나누고, 인일 방식은 전체 비용을 총 거주 일수 비율로 나눕니다.", "보증금은 월 비용에 넣지 않습니다. 거주자가 없는 날의 날짜별 비용은 미배정으로 남깁니다. 두 방식 중 하나를 합의한 뒤 사용하세요."] };
  }
  if (slug === "cash-flow-table") {
    const accounts = String(setting.accounts || "").split(",").map((v) => v.trim()).filter(Boolean);
    if (!accounts.length || new Set(accounts).size !== accounts.length) fail("관리 계좌를 중복 없이 쉼표로 구분해 입력해 주세요.");
    const beginning = number(setting.beginning, true), ids = new Set();
    let cashIn = 0, livingOut = 0, savingOut = 0;
    const trace = list("transactions").map((r) => {
      const id = nameOf(r.id); if (ids.has(id)) fail("현금흐름표의 거래 ID가 중복됩니다."); ids.add(id);
      const amount = number(r.amount), from = String(r.from || "").trim(), to = String(r.to || "").trim();
      if (!from && !to) fail("보낸 계좌 또는 받은 계좌를 적어 주세요. 범위 밖 거래처는 ‘외부’로 적을 수 있습니다.");
      if (from && from === to) fail("보낸 계좌와 받은 계좌가 같습니다.");
      if (!["income", "living", "saving", "refund"].includes(r.kind)) fail("거래 구분을 선택해 주세요.");
      const out = accounts.includes(from), into = accounts.includes(to);
      let action = "범위 밖 거래", effect = 0;
      if (out && into) action = "내부 이체: 합산 효과 0";
      else if (into) { cashIn = sum([cashIn, amount]); effect = amount; action = r.kind === "refund" ? "환불 현금 유입(근로소득 아님)" : "현금 유입"; }
      else if (out) { effect = -amount; if (r.kind === "saving") { savingOut = sum([savingOut, amount]); action = "저축 이동 출금"; } else { livingOut = sum([livingOut, amount]); action = "생활 관련 출금"; } }
      return [id, from || "외부", to || "외부", amount, action, effect];
    });
    const net = cashIn - livingOut - savingOut, ending = sum([beginning, net]);
    return { beginning, cashIn, livingOut, savingOut, net, ending, tables: [table("현금흐름 여섯 줄 (원)", ["항목", "금액"], [["기초잔액", beginning], ["현금 유입", cashIn], ["생활 관련 출금", livingOut], ["저축 이동 출금", savingOut], ["순현금 증감", net], ["기말잔액", ending]]), table("원본에서 결과까지 (원)", ["거래 ID", "보낸 계좌", "받은 계좌", "금액", "판정", "증감"], trace)], notes: ["한 행은 확인된 입출금 또는 연결된 이체 한 건입니다. 이체의 출금·입금 내역을 각각 새 거래로 넣지 마세요. 양쪽 계좌와 금액을 확인한 뒤 한 행에 묶습니다.", "새 계좌를 범위에 포함하면 그 계좌의 기초잔액도 합산해야 합니다. 카드 구매액과 실제 카드대금 출금을 중복 입력하지 마세요. 환불 입금은 현금 유입이며 소비 분석의 순지출과 구별합니다."] };
  }
  if (slug === "sinking-fund-annual-expenses") {
    const target = number(setting.target), saved = number(setting.saved), basis = date(setting.basis), due = date(setting.due);
    if (!["saving", "paid"].includes(setting.status)) fail("납부 상태를 선택해 주세요.");
    const need = setting.status === "paid" ? 0 : Math.max(0, target - saved);
    if (!Array.isArray(input.dates) || input.dates.length > 100) fail("적립일은 100개 이하로 입력해 주세요.");
    const dates = input.dates.map((r) => date(r.date));
    if (new Set(dates).size !== dates.length) fail("같은 적립일이 두 번 입력되어 있습니다.");
    const eligible = dates.filter((d) => d >= basis && d <= due).sort((a, b) => a - b);
    const amounts = eligible.length ? allocate(need, eligible.map(() => 1)) : [];
    const shortage = eligible.length || !need ? 0 : need;
    return { need, shortage, excess: Math.max(0, saved - target), amounts, tables: [table("납부일까지 가능한 적립 (원)", ["적립일", "금액"], eligible.map((d, i) => [new Date(d * 86400000).toISOString().slice(0, 10), amounts[i]])), table("계획 상태 (원)", ["항목", "값"], [["추가 필요액", need], ["기한 안 적립일이 없어 남는 부족액", shortage], ["초과 적립액", Math.max(0, saved - target)]])], notes: [shortage ? "납부일까지 적립 가능한 날짜가 없습니다. 부족액을 해결할 방법과 일정을 다시 정해야 합니다." : "기준일부터 납부일까지 실제로 입금할 수 있다고 입력한 날짜만 계산했습니다. 납부 당일 적립은 출금 시각 전에 입금할 수 있을 때만 포함하세요.", "이 계획은 가상 배분이며 실제 이체나 납부를 실행하지 않습니다. 납부 완료 상태는 추가 적립을 요구하지 않습니다. 날짜가 지나면 기준일을 바꿔 다시 계산하세요."] };
  }
  if (slug === "monthly-closing-routine") {
    const beginning = number(setting.beginning, true), start = date(setting.start), end = date(setting.end);
    if (end <= start) fail("마감 종료일은 시작일보다 뒤여야 합니다.");
    let before = beginning, after = beginning; const seen = new Map(), trace = [];
    for (const row of list("transactions")) {
      const id = nameOf(row.id), day = date(row.date), amount = number(row.amount, true);
      if (!["yes", "no"].includes(row.recorded) || !["confirmed", "pending"].includes(row.status)) fail("기록 여부와 확정 상태를 선택해 주세요.");
      let reason = "반영";
      if (day < start || day >= end) reason = "기간 밖: 제외";
      else if (row.status !== "confirmed") reason = "미확정: 제외";
      else {
        if (row.recorded === "yes") before = sum([before, amount]);
        if (seen.has(id)) {
          const previous = seen.get(id);
          if (previous.day !== day || previous.amount !== amount) fail("같은 원거래 ID에 서로 다른 날짜나 금액이 있습니다. 원자료를 확인해 주세요.");
          reason = "같은 원거래 ID의 중복: 한 번만 반영";
        } else { seen.set(id, { day, amount }); after = sum([after, amount]); if (row.recorded === "no") reason = "확인한 누락: 추가"; }
      }
      trace.push([id, row.date, amount, reason]);
    }
    return { before, after, difference: after - before, tables: [table("수정 전후 잔액 (원)", ["단계", "잔액"], [["수정 전", before], ["수정 후", after], ["차이", after - before]]), table("거래별 판단 근거 (원)", ["원거래 ID", "날짜", "금액", "처리"], trace)], notes: ["원자료에서 같은 거래임을 확인한 경우에만 같은 ID를 사용하세요. 날짜와 금액이 같아도 ID가 다르면 별도 거래로 유지합니다.", "환불 입금은 별도 ID의 양수 거래입니다. 취소 표시만으로 입금액을 추가하지 마세요. 미확인 현금과 임시 승인은 확정 지출로 합산하지 않습니다."] };
  }
  if (slug === "subscription-cleanup") {
    const start = date(setting.basis), end = start + 30;
    let before = 0, after = 0;
    const rows = list("subscriptions").map((row) => {
      const name = nameOf(row.name), amount = number(row.amount), next = date(row.next);
      if (!["monthly", "annual"].includes(row.cycle) || !["active", "requested", "confirmed"].includes(row.cancel)) fail("결제 주기와 해지 상태를 선택해 주세요.");
      if (row.cancel !== "confirmed" && next < start) fail("유지 중이거나 해지를 요청한 구독의 다음 결제일이 지났습니다. 실제 다음 청구일을 확인해 입력해 주세요.");
      const confirmed = row.confirmed ? date(row.confirmed) : null;
      const until = row.until ? date(row.until) : null;
      if (row.cancel === "confirmed" && (confirmed === null || until === null || confirmed > start || until < confirmed)) fail("해지 완료일과 이용 종료일을 확인해 주세요. 기준일 뒤의 완료를 미리 반영할 수 없습니다.");
      const planned = next >= start && next < end ? amount : 0;
      const cancelled = row.cancel === "confirmed" && confirmed < next;
      before = sum([before, planned]); after = sum([after, cancelled ? 0 : planned]);
      return [name, row.cycle === "annual" ? amount / 12 : amount, planned, cancelled ? 0 : planned, row.cancel === "requested" ? "요청만 함: 청구 유지" : cancelled ? "갱신 해지 확인" : "다음 결제 확인", row.until || "미확인", number(row.refund)];
    });
    return { before, after, reduction: before - after, tables: [table("구독별 비교 (원)", ["구독", "월 환산 비용", "해지 반영 전 30일", "확인 반영 후 30일", "상태", "이용 종료일", "실제 환불 입금"], rows), table("30일 구간 합계 (원)", ["항목", "금액"], [["해지 반영 전 예정액", before], ["확인 반영 후 예정액", after], ["예정 결제 감소액", before - after]])], notes: ["기준일을 포함한 30일이며 마지막 날은 제외합니다. 각 구독의 입력한 다음 결제 한 건만 비교하므로, 구간 안에 두 번 청구되는 상품은 각각 별도 행으로 확인하세요.", "해지 요청만으로 예정액을 지우지 않습니다. 해지 완료와 다음 갱신 차단이 확인된 조건을 입력하세요. 결제일 당일 해지는 이미 청구됐을 수 있어 자동 제외하지 않습니다. 월 환산액·예정 감소액·실제 환불은 서로 다른 값입니다."] };
  }
  fail("지원하지 않는 계산표입니다.");
}

// @build:exports-start
export { worksheetComputeV229106 };
// @build:exports-end
