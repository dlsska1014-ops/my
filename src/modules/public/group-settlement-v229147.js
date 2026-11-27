
// V22.9.147 모임 정산 계산기(사용자 2026-11-26 물음 창 "모임 정산 계산기" — 수익화 전략의 병행 업데이트 첫 판).
// 공개 화면 /group-settlement 에서 브라우저가 계산하고 입력값을 서버로 보내지 않는다. 계산 규칙은 웹 정산
// (features/settlement-ops-pages.js buildSettlementModel)과 같다.
// - 네 방식: 동일 분배·비율 분배·인원수 분배·품목별 참여자.
// - 몫은 내림하고, 남는 원은 나눈 사람 가운데 참여자 칸에 가장 나중에 적은 사람이 맡는다.
// - 송금은 보낼 돈이 큰 사람과 받을 돈이 큰 사람부터 짝짓는다.
// validate-v229147-group-settlement 가 두 함수를 같은 입력으로 돌려 사람별 낸 돈·몫·차액과 송금 제안을 대조하고,
// 몫을 BigInt 로 다시 나눈 정답과도 대조한다.
// 웹 정산이 말없이 고쳐 쓰는 값(몫 0 → 1, 0.1 미만 → 0.1, 1000 초과 → 1000)과 소수 몫은 계산기가 받지 않고 다시 적어 달라고 한다.
// 소수 몫(0.7 : 0.3, 0.1 셋 등)을 실수로 나누면 2진 소수 오차로 나누어떨어지는 금액도 몇 원씩 어긋난다(어긋난 원은 마지막 사람에게 모인다 — 웹 정산은 V22.9.148 에 몫을
// 정수 단위로 바꿔 고쳤다 — 추적표 V147:G-2). 그래서 몫은 1부터 1000까지의 정수만 받는다(반 몫은 2 : 1). 받아들이는 입력의 결과는 웹 정산과 같고 정확하다.
// 금액·몫 칸은 글자 칸이다(type=number 는 브라우저가 ‘1/2’ 를 12 로, ‘50%’ 를 50 으로 말없이 바꾸거나 빈 값으로 넘긴다).
// 그래서 계산 함수가 원문의 모양을 보고 맞지 않으면 다시 적어 달라고 한다.
// groupSettlementComputeV229147 은 화면에 toString() 으로 그대로 실린다(worksheet-runtime.js renderInlineWorksheetV229139).
// 그래서 바깥 이름을 하나도 쓰지 않는다. 오류에는 틀린 칸의 위치(field)를 붙여 화면이 그 칸으로 초점을 옮긴다.

function groupSettlementComputeV229147(slug, input) {
  const MODES = { equal: "동일 분배", ratio: "비율 분배", headcount: "인원수 분배", item: "품목별 참여자" };
  const text = (value) => String(value ?? "").trim();
  const won = (value) => Math.round(Number(value) || 0).toLocaleString("ko-KR") + "원";
  const short = (value) => (value.length > 20 ? value.slice(0, 20) + "…" : value);
  const fail = (message, group, index, key) => {
    const error = new Error(message);
    if (group) error.field = { group, index, key };
    throw error;
  };
  const settings = input && input.settings ? input.settings : {};
  const mode = Object.prototype.hasOwnProperty.call(MODES, settings.mode) ? settings.mode : "equal";
  const title = text(settings.title).slice(0, 60);
  const weighted = mode === "ratio" || mode === "headcount";
  const unit = mode === "headcount" ? "인원수" : "몫";
  const names = [];
  const weights = Object.create(null);
  let weightUnused = false;
  const memberRows = Array.isArray(input && input.members) ? input.members : [];
  memberRows.forEach((row, index) => {
    const name = text(row && row.name);
    const rawWeight = text(row && row.weight);
    const where = `${index + 1}번째 참여자`;
    if (!name) {
      if (rawWeight && rawWeight !== "1") fail(`${where} 행에 ${unit}만 있어요. 이름도 적어 주세요.`, "members", index, "name");
      return;
    }
    if (name.length > 40) fail(`${where}의 이름은 40자까지 적을 수 있어요.`, "members", index, "name");
    if (/[,，、]/.test(name)) fail(`${where}의 이름에 쉼표를 쓸 수 없어요. 함께한 사람 칸에서 이름을 쉼표로 나누기 때문이에요.`, "members", index, "name");
    if (names.includes(name)) fail(`같은 이름이 두 번 있어요: ${short(name)}. 이름을 하나씩만 적어 주세요.`, "members", index, "name");
    if (names.length >= 30) fail("참여자는 30명까지 계산할 수 있어요.", "members", index, "name");
    let weight = 1;
    if (rawWeight) {
      if (weighted) {
        if (!/^[0-9]+$/.test(rawWeight)) {
          fail(mode === "headcount"
            ? `${short(name)}의 인원수는 1부터 1000까지의 정수로 적어 주세요.`
            : `${short(name)}의 몫은 1부터 1000까지의 정수로 적어 주세요. 반 몫이면 다른 사람을 2, 그 사람을 1처럼 적으면 돼요.`, "members", index, "weight");
        }
        weight = Number(rawWeight);
        if (weight < 1 || weight > 1000) fail(`${short(name)}의 ${mode === "headcount" ? "인원수는" : "몫은"} 1부터 1000까지 적을 수 있어요. 이번 정산에서 빼려면 그 참여자 행을 지우세요.`, "members", index, "weight");
      } else if (rawWeight !== "1") weightUnused = true;
    }
    names.push(name);
    weights[name] = weight;
  });
  if (!names.length) fail("참여자를 한 명 이상 적어 주세요.", "members", 0, "name");
  const expenses = [];
  let withUnused = false;
  const rows = Array.isArray(input && input.expenses) ? input.expenses : [];
  rows.forEach((row, index) => {
    const item = text(row && row.item);
    const rawAmount = text(row && row.amount);
    const payer = text(row && row.payer);
    const withText = text(row && row.with);
    if (!item && !rawAmount && !payer && !withText) return;
    // 오류 말은 늘 ‘지출’ 로 끝나는 이름으로 부른다(조사 ‘을’ 이 맞게).
    const where = item ? `‘${short(item)}’ 지출` : `${index + 1}번째 지출`;
    if (!rawAmount) fail(`${where}의 금액을 적어 주세요.`, "expenses", index, "amount");
    if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(rawAmount)) fail(`${where}의 금액은 원 단위 숫자로만 적어 주세요(예: 240000 또는 240,000).`, "expenses", index, "amount");
    const amount = Number(rawAmount.replace(/,/g, ""));
    if (amount < 1) fail(`${where}의 금액은 1원 이상이어야 해요.`, "expenses", index, "amount");
    if (amount > 1000000000) fail(`${where}의 금액은 10억 원까지 적을 수 있어요.`, "expenses", index, "amount");
    if (!payer) fail(`${where}을 낸 사람을 적어 주세요.`, "expenses", index, "payer");
    if (!names.includes(payer)) fail(`${where}을 낸 사람(${short(payer)})이 참여자 목록에 없어요. 참여자에 같은 이름으로 먼저 적어 주세요.`, "expenses", index, "payer");
    let together = [];
    if (withText) {
      if (mode === "item") {
        const picked = withText.split(/[,，、]/).map(text).filter(Boolean);
        if (!picked.length) fail(`${where}의 함께한 사람 칸에 이름이 없어요. 참여자 모두가 나누면 칸을 비워 두세요.`, "expenses", index, "with");
        const unknown = picked.filter((name) => !names.includes(name));
        if (unknown.length) fail(`${where}의 함께한 사람 가운데 참여자 목록에 없는 이름이 있어요: ${unknown.slice(0, 3).map(short).join(", ")}. 이름은 쉼표로 나눠 적어 주세요(예: 서연, 도윤).`, "expenses", index, "with");
        together = names.filter((name) => picked.includes(name));
      } else withUnused = true;
    }
    if (expenses.length >= 60) fail("지출은 60건까지 계산할 수 있어요.", "expenses", index, "item");
    expenses.push({ amount, payer, together });
  });
  if (!expenses.length) fail("지출을 한 건 이상 적어 주세요.", "expenses", 0, "item");

  // 아래는 buildSettlementModel 과 같은 순서·같은 식이다(대조 검사가 지킨다). 몫이 모두 정수라 합과 곱이 정확하다.
  const ids = names.slice();
  const paidBy = Object.create(null);
  let totalExpense = 0;
  for (const expense of expenses) {
    totalExpense += expense.amount;
    paidBy[expense.payer] = (paidBy[expense.payer] || 0) + expense.amount;
  }
  const participantCount = Math.max(1, ids.length || 1);
  const allocationWeights = Object.create(null);
  for (const id of ids) allocationWeights[id] = weighted ? weights[id] : 1;
  const owedBy = Object.create(null);
  for (const id of ids) owedBy[id] = 0;
  const allocate = (amount, selectedIds, selectedWeights) => {
    const targets = selectedIds.filter((id) => ids.includes(id));
    if (!targets.length) return;
    const sumWeight = targets.reduce((sum, id) => sum + Number(selectedWeights[id] || 1), 0) || targets.length;
    let allocated = 0;
    targets.forEach((id, index) => {
      const value = index === targets.length - 1 ? amount - allocated : Math.floor(amount * Number(selectedWeights[id] || 1) / sumWeight);
      owedBy[id] = (owedBy[id] || 0) + value;
      allocated += value;
    });
  };
  const ones = Object.create(null);
  for (const id of ids) ones[id] = 1;
  if (mode === "item") {
    for (const expense of expenses) allocate(expense.amount, expense.together.length ? expense.together : ids, ones);
  } else {
    allocate(totalExpense, ids, allocationWeights);
  }
  const share = Math.round(totalExpense / participantCount);
  const people = ids.map((id) => {
    const paid = Math.round(paidBy[id] || 0);
    const personShare = Math.round(owedBy[id] || 0);
    return { name: id, paid, share: personShare, balance: paid - personShare, weight: allocationWeights[id] };
  }).sort((a, b) => b.paid - a.paid);
  const creditors = people.filter((p) => p.balance > 0).map((p) => ({ name: p.name, remain: p.balance })).sort((a, b) => b.remain - a.remain);
  const debtors = people.filter((p) => p.balance < 0).map((p) => ({ name: p.name, remain: -p.balance })).sort((a, b) => b.remain - a.remain);
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].remain, creditors[j].remain);
    if (amount > 0) transfers.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(amount) });
    debtors[i].remain -= amount;
    creditors[j].remain -= amount;
    if (debtors[i].remain <= 0) i++;
    if (creditors[j].remain <= 0) j++;
  }

  const label = title || "모임 정산";
  const heads = ids.reduce((sum, id) => sum + allocationWeights[id], 0);
  const tables = [
    {
      caption: `${label}: 사람별 정산(${MODES[mode]}, 단위 원)`,
      headers: ["이름", "낸 돈", "부담할 몫", "받거나 보낼 돈"],
      rows: people.map((p) => [p.name, p.paid, p.share, p.balance > 0 ? `${p.balance.toLocaleString("ko-KR")} 받기` : p.balance < 0 ? `${(-p.balance).toLocaleString("ko-KR")} 보내기` : "없음"]),
    },
    {
      caption: "송금 제안(단위 원)",
      headers: ["보내는 사람", "받는 사람", "금액"],
      rows: transfers.length ? transfers.map((t) => [t.from, t.to, t.amount]) : [["보낼 돈 없음", "-", 0]],
    },
  ];
  const ratioText = ids.map((id) => `${id} ${allocationWeights[id]}`).join(" : ");
  const headText = ids.map((id) => `${id} ${allocationWeights[id]}명`).join(", ");
  const totalNote = {
    equal: `총 지출 ${won(totalExpense)}, 참여 ${participantCount}명, 1인 평균 ${won(share)}.`,
    ratio: `총 지출 ${won(totalExpense)}, 참여 ${participantCount}명, 몫의 합 ${heads}.`,
    headcount: `총 지출 ${won(totalExpense)}, ${participantCount}팀(모두 ${heads}명), 1명당 평균 ${won(Math.round(totalExpense / heads))}.`,
    item: `총 지출 ${won(totalExpense)}, 참여 ${participantCount}명. 사람별 몫은 자기가 함께한 지출의 몫을 더한 값이에요.`,
  }[mode];
  const modeNote = {
    equal: "모든 지출의 합계를 참여자 수로 똑같이 나눴어요.",
    ratio: `합계를 각자의 몫 비율(${ratioText})로 나눴어요.`,
    headcount: `합계를 인원수(${headText})로 나눴어요. 가족이나 팀처럼 한 줄이 여러 명분을 낼 때 써요.`,
    item: "지출마다 함께한 사람끼리 똑같이 나눴어요. 함께한 사람을 비워 둔 지출은 참여자 모두가 나눠요.",
  }[mode];
  const notes = [
    totalNote,
    modeNote,
    "나누어떨어지지 않는 원 단위는 내림하고, 남는 원은 그 돈을 나눈 사람 가운데 참여자 칸에 가장 나중에 적은 사람이 맡아요. 말해가계부 웹 정산과 같은 규칙이에요.",
    transfers.length
      ? `보낼 돈이 큰 사람과 받을 돈이 큰 사람부터 짝지어 송금 ${transfers.length}번으로 끝나게 했어요.`
      : "모두 낸 만큼 부담해서 보낼 돈이 없어요.",
  ];
  if (withUnused) notes.push("함께한 사람 칸은 품목별 참여자 방식에서만 써요. 적어 둔 이름은 이번 계산에 넣지 않았어요.");
  if (weightUnused) notes.push("몫 칸은 비율 분배·인원수 분배 방식에서만 써요. 적어 둔 몫은 이번 계산에 넣지 않았어요.");
  const shareLines = [
    `[${label}]`,
    `총 ${won(totalExpense)} · ${mode === "headcount" ? `${participantCount}팀 ${heads}명` : `${participantCount}명`} · ${mode === "ratio" ? `비율 분배(${ratioText})` : mode === "headcount" ? `인원수 분배(${headText})` : MODES[mode]}`,
    ...(transfers.length ? ["보낼 돈", ...transfers.map((t) => `- ${t.from} → ${t.to} ${won(t.amount)}`)] : ["보낼 돈 없음"]),
    `사람별 몫: ${people.map((p) => `${p.name} ${won(p.share)}`).join(", ")}`,
    "말해가계부 모임 정산 계산기로 계산했어요.",
    "https://malhaebook.com/group-settlement",
  ];
  return { tables, notes, shareText: shareLines.join("\n"), people, transfers, totalExpense, participantCount, share, mode, heads };
}

const GROUP_SETTLEMENT_MEMBERS_MT_V229147 = ["민지", "준호", "서연", "도윤"].map((name) => ({ name, weight: "1" }));

// 칸 설정의 다섯째 값은 이 계산기의 화면만 읽는다(worksheet-runtime.js·group-settlement-client-v229147.js): 글자 칸의 inputmode·
// 자리 표시·길이, 그 칸을 보이는 방식(modes), 방식마다 바뀌는 칸 이름(captions), 휴대폰에서 한 줄을 다 쓰는 칸(wide).
const GROUP_SETTLEMENT_SPEC_V229147 = Object.freeze({
  title: "모임 정산 계산기",
  outcome: "지출마다 낸 사람과 함께한 사람을 적으면 사람별로 부담할 몫과 누가 누구에게 얼마를 보내면 되는지 계산합니다.",
  instruction: "나누는 방식을 고르고 참여자와 지출을 고친 뒤 ‘결과 계산’을 누르세요. 비율·인원수 방식에서는 참여자마다 몫이나 인원수를 정수로 적고(비우면 1), 품목별 방식에서는 지출마다 함께한 사람을 쉼표로 나눠 적습니다(비우면 모두). 입력값은 이 브라우저 안에서만 계산하고 서버로 보내지 않습니다.",
  fields: [
    ["title", "정산 이름", "text", null, { maxLength: 60 }],
    ["mode", "나누는 방식", "select", [["item", "품목별 참여자"], ["equal", "동일 분배"], ["ratio", "비율 분배"], ["headcount", "인원수 분배"]]],
  ],
  groups: [
    { key: "members", label: "참여자", max: 30, columns: [
      ["name", "이름", "text", null, { maxLength: 40 }],
      ["weight", "몫", "text", null, { maxLength: 4, inputMode: "numeric", placeholder: "1", modes: ["ratio", "headcount"], captions: { ratio: "몫", headcount: "인원수" } }],
    ] },
    { key: "expenses", label: "지출", max: 60, columns: [
      ["item", "항목", "text", null, { maxLength: 40, wide: true }],
      ["amount", "금액(원)", "text", null, { maxLength: 13, inputMode: "numeric", placeholder: "240,000" }],
      ["payer", "낸 사람", "text", null, { maxLength: 40 }],
      ["with", "함께한 사람", "text", null, { maxLength: 400, placeholder: "비우면 모두", modes: ["item"], wide: true }],
    ] },
  ],
  // 예제 단추에는 짧은 이름(short)을, 불러온 뒤 알림에는 긴 이름(label)을 쓴다(휴대폰에서 단추 넷이 두 줄에 들어가게).
  exampleLabel: "1박 2일 MT(품목별 참여자)",
  exampleShort: "MT(품목별)",
  example: {
    settings: { title: "1박 2일 MT", mode: "item" },
    members: GROUP_SETTLEMENT_MEMBERS_MT_V229147,
    expenses: [
      { item: "숙소", amount: "240,000", payer: "민지", with: "" },
      { item: "장보기", amount: "86,000", payer: "준호", with: "" },
      { item: "택시", amount: "18,000", payer: "서연", with: "서연, 도윤" },
      { item: "술·안주", amount: "42,000", payer: "도윤", with: "민지, 준호, 도윤" },
    ],
  },
  otherExamples: [
    { label: "회식 1차·2차(동일 분배)", short: "회식(동일)", input: {
      settings: { title: "회식 1차·2차", mode: "equal" },
      members: ["민지", "준호", "서연", "도윤", "하준"].map((name) => ({ name, weight: "1" })),
      expenses: [
        { item: "1차", amount: "213,000", payer: "민지", with: "" },
        { item: "2차", amount: "87,500", payer: "준호", with: "" },
      ],
    } },
    { label: "동아리 회식, 선배 2 : 후배 1(비율 분배)", short: "동아리(비율)", input: {
      settings: { title: "동아리 회식", mode: "ratio" },
      members: [["민지", "2"], ["준호", "2"], ["서연", "1"], ["도윤", "1"], ["하준", "1"]].map(([name, weight]) => ({ name, weight })),
      expenses: [{ item: "회식", amount: "280,000", payer: "민지", with: "" }],
    } },
    { label: "세 가족 캠핑(인원수 분배)", short: "캠핑(인원수)", input: {
      settings: { title: "세 가족 캠핑", mode: "headcount" },
      members: [["김씨네", "3"], ["이씨네", "2"], ["박씨네", "4"]].map(([name, weight]) => ({ name, weight })),
      expenses: [
        { item: "캠핑장", amount: "150,000", payer: "김씨네", with: "" },
        { item: "장보기", amount: "117,000", payer: "박씨네", with: "" },
        { item: "기름값", amount: "45,000", payer: "이씨네", with: "" },
      ],
    } },
  ],
  checks: [
    "숙소·장보기는 네 명이, 택시는 서연·도윤이, 술·안주는 민지·준호·도윤이 나눕니다. 민지의 몫은 60,000 + 21,500 + 14,000 = 95,500원입니다.",
    "서연이 민지에게 72,500원, 도윤이 62,500원, 준호가 9,500원을 보내면 끝납니다. 민지는 240,000원을 냈고 몫이 95,500원이라 144,500원을 돌려받습니다.",
    "세 가족 캠핑 예제(인원수 3·2·4)에서 이씨네 몫은 312,000 × 2 ÷ 9 = 69,333.3…원을 내린 69,333원이고, 남는 1원은 참여자 칸에 마지막으로 적은 박씨네(138,667원)가 맡습니다.",
  ],
});

// 공개 안내 화면(guide-content.js 의 page 도우미로 만든다). 절의 숫자는 위 예제와 검사가 같은 조건으로 만든 사례(먼저 간 사람·반 몫·
// 송금 횟수)를 이 계산 함수로 계산한 값이다(validate-v229147-group-settlement 가 대조한다).
const GROUP_SETTLEMENT_UPDATED_V229147 = "2026-11-26";

function groupSettlementGuidePageV229147(page) {
  return page(
    "모임 정산 계산기: 여행·회식 비용의 사람별 몫과 송금 순서",
    "참여자와 지출을 적으면 동일·비율·인원수·품목별 네 방식으로 사람별 몫과 누가 누구에게 얼마를 보내면 되는지 계산합니다. 말해가계부 웹 정산과 같은 규칙으로 브라우저 안에서 계산하고, 입력값을 서버로 보내지 않습니다.",
    "여행·회식 정산",
    "먼저 결제한 사람과 그 비용을 함께 부담할 사람은 다를 때가 많습니다. 지출마다 낸 사람과 함께한 사람을 적으면 각자의 몫과 송금 순서를 한 번에 계산합니다.",
    [
      { title: "이 계산기로 할 수 있는 일", paragraphs: [
        "여행 숙소, 회식 1차·2차, 동아리 행사처럼 한 번의 모임에서 여러 사람이 번갈아 결제한 비용을 나눕니다. 결과는 사람별로 낸 돈과 부담할 몫, 받거나 보낼 돈, 그리고 누가 누구에게 얼마를 보내면 끝나는지입니다. 결과 아래의 결산 문구는 복사해서 단톡방에 바로 붙여 넣을 수 있습니다.",
        "함께 사는 사람끼리 매달 내는 관리비·장보기를 여러 방식으로 비교해 보고 싶다면 공동 생활비 글의 계산표가 더 맞습니다. 이 계산기는 한 번의 여행이나 모임을 끝내는 정산에 맞췄습니다.",
      ], links: [["공동 생활비, 나누는 방식 네 가지 비교", "/shared-living-cost-rules"]] },
      { title: "나누는 방식 네 가지", paragraphs: [
        "비율과 인원수는 1부터 1000까지의 정수로 적습니다. 아이를 반 몫으로 치려면 어른 2, 아이 1처럼 두 배로 적으면 같은 비율이 됩니다.",
      ], table: { caption: "방식별로 쓰는 상황과 계산", headers: ["방식", "이럴 때", "계산", "예제"], rows: [
        ["동일 분배", "모두가 모든 지출에 함께했을 때", "합계 ÷ 참여자 수", "회식 1차·2차 300,500원을 다섯 명이 나누면 한 사람 60,100원"],
        ["비율 분배", "미리 정한 비율이 있을 때", "합계 × 내 몫 ÷ 몫의 합", "선배 2 : 후배 1로 280,000원이면 선배 80,000원, 후배 40,000원"],
        ["인원수 분배", "가족·팀처럼 한 줄이 여러 명분을 낼 때", "합계 × 인원수 ÷ 전체 인원", "3·2·4명 세 가족이 312,000원이면 104,000원, 69,333원, 138,667원"],
        ["품목별 참여자", "지출마다 함께한 사람이 다를 때", "지출마다 함께한 사람끼리 나눈 뒤 사람별로 더함", "택시는 탄 사람만, 술·안주는 마신 사람만 나눔"],
      ] } },
      { title: "예제 풀이: 1박 2일 MT", paragraphs: [
        "계산기의 기본 예제입니다. 네 사람이 숙소와 장보기는 다 같이 썼고, 택시는 서연·도윤만 탔고, 술·안주는 서연을 뺀 세 사람만 먹었습니다. 지출마다 함께한 사람끼리 먼저 나눕니다.",
        "사람별 몫은 자기가 함께한 지출의 몫을 더한 값입니다. 민지와 준호는 60,000 + 21,500 + 14,000 = 95,500원, 서연은 60,000 + 21,500 + 9,000 = 90,500원, 도윤은 네 지출에 모두 함께해 104,500원입니다. 네 사람의 몫을 더하면 386,000원으로 지출 합계와 같습니다.",
        "낸 돈에서 몫을 빼면 민지는 144,500원을 받고, 서연은 72,500원, 도윤은 62,500원, 준호는 9,500원을 보냅니다. 그래서 세 사람이 민지에게 한 번씩, 세 번 보내면 끝납니다.",
      ], table: { caption: "지출마다 함께한 사람끼리 나눈 몫, 단위 원", headers: ["지출", "금액", "낸 사람", "함께한 사람", "한 사람 몫"], rows: [
        ["숙소", "240,000", "민지", "네 명 모두", "60,000"],
        ["장보기", "86,000", "준호", "네 명 모두", "21,500"],
        ["택시", "18,000", "서연", "서연·도윤", "9,000"],
        ["술·안주", "42,000", "도윤", "민지·준호·도윤", "14,000"],
      ] } },
      { title: "원 단위와 송금 순서는 이렇게 정해요", paragraphs: [
        "몫이 나누어떨어지지 않으면 원 단위를 내리고, 남는 원은 그 돈을 나눈 사람 가운데 참여자 칸에 가장 나중에 적은 사람이 맡습니다. 그래서 사람별 몫을 더하면 지출 합계와 같습니다. 세 가족 캠핑 예제에서는 이씨네 몫 312,000 × 2 ÷ 9 = 69,333.3…원을 69,333원으로 내리고, 남는 1원은 마지막에 적은 박씨네가 맡아 138,667원이 됩니다. 남는 원을 맡을 사람을 바꾸려면 참여자 순서를 바꾸세요.",
        "이 사이트의 다른 계산표는 남는 원을 다르게 나눕니다. 공동 생활비 계산표는 소수 부분이 큰 사람부터, 모임 회비 정산표의 택시비는 먼저 적은 사람부터 1원씩 맡습니다. 그래서 같은 금액을 나눠도 몇 원은 다른 사람이 맡을 수 있습니다. 이 계산기는 말해가계부 웹 정산과 같은 규칙을 따릅니다. 웹 정산에서는 가계부에 늦게 들어온 사람이 남는 원을 맡습니다.",
        "송금은 보낼 돈이 가장 큰 사람과 받을 돈이 가장 큰 사람부터 짝짓습니다. 한 번 보낼 때마다 적어도 한 사람의 정산이 끝나므로 송금 횟수는 많아야 참여자 수보다 하나 적습니다.",
        "다만 늘 가장 적은 횟수는 아닙니다. 다섯 사람의 정산이 받을 돈 A 60,000원·B 40,000원, 보낼 돈 C 40,000원·D 30,000원·E 30,000원으로 끝났다면 이 계산기는 C→A 40,000원, D→A 20,000원, D→B 10,000원, E→B 30,000원의 네 번을 제안합니다. C가 B에게 40,000원, D와 E가 A에게 30,000원씩 보내면 세 번에 끝납니다. 이렇게 금액이 딱 맞는 짝이 보이면 바꿔 보내도 됩니다. 사람마다 보내는 돈과 받는 돈의 합만 같으면 됩니다.",
      ] },
      { title: "자주 묻는 경우", bullets: [
        "먼저 간 사람이 있을 때: 품목별 참여자 방식에서 그 사람이 빠진 지출의 함께한 사람 칸에 남은 사람만 적습니다. 회식 1차 213,000원은 다섯 명이, 2차 87,500원은 하준을 뺀 네 명이 나누면 하준은 42,600원, 나머지 네 사람은 64,475원씩 부담합니다.",
        "아이를 반 몫으로 칠 때: 비율 분배에서 어른은 2, 아이는 1로 적습니다. 어른 둘과 아이 하나가 120,000원을 나누면 어른은 48,000원씩, 아이는 24,000원입니다. 0.5 같은 소수 몫은 받지 않습니다. 소수는 컴퓨터 계산에서 몇 원씩 어긋날 수 있어서이고, 정수로 바꿔 적어도 비율은 같습니다.",
        "할인이나 부분 환불을 받았을 때: 실제로 나간 금액(결제 금액에서 환불·할인 금액을 뺀 값)을 적습니다. 이 계산기는 빼는 금액(음수)을 따로 받지 않습니다.",
        "여러 날, 두 달에 걸친 여행일 때: 계산기는 날짜를 보지 않으므로 여행 전체의 지출을 한 번에 넣으면 됩니다. 말해가계부 웹 정산은 달마다 계산하므로, 달을 넘긴 여행을 웹에서 정산할 때는 두 달을 각각 확인합니다.",
        "회비를 걷는 모임일 때: 회비로 결제한 지출은 이 계산에 넣지 않고, 각자 자기 돈으로 먼저 낸 지출만 나눕니다. 공금 잔액과 개인 선결제를 함께 정리하려면 단톡방 정산 안내의 ‘모임 회비와 개인 선결제 정산표’를 씁니다.",
      ], links: [["단톡방 정산 방법과 모임 회비 정산표", "/group-accountbook"]] },
      { title: "정산 전에 확인할 것", bullets: [
        "카드 내역이나 영수증과 금액을 맞춥니다.",
        "먼저 결제한 사람(낸 사람)과 그 비용을 함께 쓴 사람(함께한 사람)을 따로 적습니다. 낸 사람도 그 지출을 함께했다면 함께한 사람 칸에 넣습니다.",
        "비율이나 빠지는 사람은 정산 전에 모두가 동의한 기준으로 적습니다.",
        "결과의 결산 문구를 단톡방에 올리고 송금 기한을 함께 정하면 정산이 늦어지는 일을 줄일 수 있습니다.",
      ] },
      { title: "단톡방에서 계속 기록하려면", paragraphs: [
        "모임이 이어진다면 단톡방에 말해가계부 봇을 부르고 각자 낸 돈을 ‘@말해가계부 숙소 240000원’처럼 보내 기록할 수 있습니다. 단톡방에서 ‘@말해가계부 정산’이라고 보내면 이번 달 지출을 똑같이 나눈 결과와 송금 제안을 답하고, 비율·인원수·품목별 참여자 방식은 웹 가계부의 정산 화면에서 고릅니다.",
      ], links: [["단톡방 정산 방법", "/group-accountbook"], ["카카오톡 가계부 입력 방법", "/kakao-guide"], ["예시 가계부의 정산 화면", "/demo#tour-settle"]] },
      { title: "입력한 값은 어디에도 저장하지 않아요", paragraphs: [
        "이 계산기는 지금 보고 있는 브라우저 안에서만 계산합니다. 입력한 이름과 금액을 말해가계부 서버로 보내지 않고 저장하지도 않습니다. CSV 저장과 인쇄도 이 기기에서만 일어납니다. 이름 대신 별명을 적어도 계산 결과는 같습니다.",
      ] },
    ],
    { htmlTitle: "모임 정산 계산기: 여행·회식 더치페이와 송금 계산 · 말해가계부", primary: ["바로 계산하기", "#inline-worksheet"], secondary: ["단톡방 정산 방법", "/group-accountbook"], updated: GROUP_SETTLEMENT_UPDATED_V229147, toolFirst: true },
  );
}

// @build:exports-start
export {
  GROUP_SETTLEMENT_SPEC_V229147, groupSettlementComputeV229147, groupSettlementGuidePageV229147,
};
// @build:exports-end
