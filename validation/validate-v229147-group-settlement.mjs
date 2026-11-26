#!/usr/bin/env node
// V22.9.147 모임 정산 계산기(사용자 2026-11-26 물음 창 "모임 정산 계산기" — 수익화 전략과 함께 가는 업데이트의 첫 판).
// 공개 화면 /group-settlement 의 계산기를 본다.
//   1. 계산 = 웹 정산 = 정확한 값: 계산기(group-settlement-v229147.js groupSettlementComputeV229147)와 웹 정산(features/settlement-ops-pages.js
//      buildSettlementModel)에 같은 모임을 넣으면 사람별 낸 돈·몫·차액·차례, 송금 제안, 합계·인원·1인 평균이 같고, 사람별 몫은 BigInt 로
//      다시 나눈 정답(내림, 남는 원은 나눈 사람 가운데 마지막)과 같다. 예제 네 개와 시드를 고정한 무작위 모임 800개(1~12명, 지출 1~14건,
//      1원짜리부터 10억 원까지, 네 방식, 1·1000 경계의 정수 몫)를 넣는다. 품목별 참여자는 웹 화면처럼 구성원 차례로 넘긴다.
//      (웹 정산은 소수 몫(0.7 : 0.3 등)에서 1~3원 어긋난다 — 추적표 V147:G-2. 계산기는 소수 몫을 받지 않는다.)
//   2. 어느 모임이든: 몫의 합 = 지출 합계, 송금을 마치면 모두 0, 송금 횟수 ≤ 인원 − 1, 송금 금액은 1원 이상.
//   3. 다시 적어 달라는 말: 웹 정산이 말없이 고쳐 쓰는 값(몫 0·1000 초과)과 소수 몫·소수 인원수, 금액의 모양(숫자와 세 자리 쉼표만 —
//      브라우저의 글자 칸 원문 ‘1/2’·‘50%’·‘1.5’·‘1e3’ 등), 빠진 값·없는 이름·같은 이름·쉼표 든 이름·41자 이름·쉼표가 아닌 구분·
//      이름 없는 함께한 사람 칸·한도(30명·60건·10억 원 = 설정의 행 한도). 오류에는 틀린 칸의 위치(field)가 붙는다. 빈 행은 건너뛴다.
//      방식에 쓰지 않는 칸에 값이 있으면 알린다. 인원수 방식은 ‘N팀(모두 M명)·1명당’ 으로 적는다.
//   4. 화면(번들): 200, 계산기가 목차 바로 아래(첫 절 앞)·제목 h2, 목차 첫 링크가 계산기, 화면 스크립트 = 이 계산기의 브라우저 스크립트 +
//      1 의 계산 함수(toString 그대로, ‘</’ 없음, 새 맥락에서 돌려도 같은 결과), 스크립트로 넘기는 설정 = GROUP_SETTLEMENT_SPEC_V229147,
//      서버가 먼저 그린 폼(잠김·방식 표식·번호 붙은 행)과 표 = 예제 계산 결과, 저장·네트워크 호출 없음, 쪽 글의 숫자(방식 표·예제 풀이 표·
//      검산·남는 원·송금 횟수 사례·자주 묻는 경우) = 계산, 다른 계산표의 남는 원 규칙 = 그 계산표의 설명, ‘무료’·앞날 약속 없음.
//   5. 연결: 사이트맵(수정일 = GROUP_SETTLEMENT_UPDATED_V229147)·공개 정본·광고 후보 목록에 있고 /guides·/site-map·/group-accountbook·
//      /shared-living-cost-rules(함께 읽을 글) 가 링크한다. /demo#tour-settle 이 있다.
// 실제 브라우저에서 입력을 바꿔 다시 계산하는 길은 이 검사가 돌리지 않는다(Chrome 이 필요하다 — 판 폴더의 머리 없는 Chrome 확인).
import { app, BASE, ctx } from "./lib-audit-v22934.mjs";
import { buildSettlementModel } from "../src/modules/features/settlement-ops-pages.js";
import { GROUP_SETTLEMENT_SPEC_V229147, groupSettlementComputeV229147 } from "../src/modules/public/group-settlement-v229147.js";
import { groupSettlementClientV229147 } from "../src/modules/public/group-settlement-client-v229147.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// 쪽 수정일 상수는 다른 모듈이 쓰지 않아 빌드가 내보내기 목록에서 뺀다 — 원본 글에서 읽는다.
const moduleSource = readFileSync(new URL("../src/modules/public/group-settlement-v229147.js", import.meta.url), "utf8");
const GROUP_SETTLEMENT_UPDATED_V229147 = moduleSource.match(/^const GROUP_SETTLEMENT_UPDATED_V229147 = "(\d{4}-\d{2}-\d{2})";$/m)?.[1];
if (!GROUP_SETTLEMENT_UPDATED_V229147) throw new Error("GROUP_SETTLEMENT_UPDATED_V229147 not found");

let checks = 0;
const failures = [];
const ok = (condition, message) => { checks += 1; if (!condition) failures.push(message); };
const eq = (actual, expected, message) => ok(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
const compute = (input) => groupSettlementComputeV229147("group-settlement", input);
// 광고 후보·공개 정본 목록은 모듈이 내보내지 않아 원본 글에서 읽는다(validate-v229142-adsense-week1 과 같은 방법).
const siteConfig = readFileSync(new URL("../src/modules/public/site-config.js", import.meta.url), "utf8");
const listOf = (pattern) => [...((siteConfig.match(pattern) || ["", ""])[1]).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const PUBLIC_CONTENT_PATHS = listOf(/const PUBLIC_CONTENT_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/);
const AD_PAGE_KEYS = listOf(/const AD_PAGE_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/);
const fmt = (n) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const amountOf = (value) => Number(String(value ?? "").trim().replace(/,/g, ""));

// ── 1·2. 계산 = 웹 정산 = 정확한 값 ──────────────────────────────────────
function parsed(input, mode) {
  const names = input.members.map((m) => String(m.name ?? "").trim()).filter(Boolean);
  const weights = Object.fromEntries(input.members.filter((m) => String(m.name ?? "").trim()).map((m) => [String(m.name).trim(), mode === "ratio" || mode === "headcount" ? Number(String(m.weight ?? "").trim() || "1") : 1]));
  const expenses = input.expenses.filter((e) => [e.item, e.amount, e.payer, e.with].some((v) => String(v ?? "").trim())).map((e) => {
    const picked = String(e.with ?? "").split(/[,，、]/).map((v) => v.trim()).filter(Boolean);
    return { amount: amountOf(e.amount), payer: String(e.payer).trim(), together: mode === "item" ? names.filter((name) => picked.includes(name)) : [] };
  });
  return { names, weights, expenses };
}
function webModel(input, mode) {
  const { names, weights, expenses } = parsed(input, mode);
  const members = names.map((name, index) => ({ user_id: name, nickname: name, role: index ? "member" : "owner", created_at: `2026-11-01T00:00:${String(index).padStart(2, "0")}Z` }));
  const rows = [];
  const itemParticipants = {};
  expenses.forEach((expense, index) => {
    const id = `row-${index}`;
    rows.push({ id, type: "expense", amount: expense.amount, user_id: expense.payer });
    if (mode === "item") itemParticipants[id] = expense.together;
  });
  return buildSettlementModel(rows, members, { mode, weights: mode === "ratio" || mode === "headcount" ? weights : {}, itemParticipants });
}
// 정답: 몫을 BigInt 로 나눈다(내림, 남는 원은 나눈 사람 가운데 마지막).
function exactShares(input, mode) {
  const { names, weights, expenses } = parsed(input, mode);
  const owed = new Map(names.map((name) => [name, 0n]));
  const allocate = (amount, targets, weightOf) => {
    const sum = targets.reduce((total, name) => total + BigInt(weightOf(name)), 0n);
    let used = 0n;
    targets.forEach((name, index) => {
      const value = index === targets.length - 1 ? amount - used : (amount * BigInt(weightOf(name))) / sum;
      owed.set(name, owed.get(name) + value);
      used += value;
    });
  };
  if (mode === "item") for (const expense of expenses) allocate(BigInt(expense.amount), expense.together.length ? expense.together : names, () => 1);
  else allocate(expenses.reduce((total, expense) => total + BigInt(expense.amount), 0n), names, (name) => weights[name]);
  return Object.fromEntries([...owed].map(([name, value]) => [name, Number(value)]));
}
function sameAsWeb(input, label) {
  const mine = compute(input);
  const web = webModel(input, mine.mode);
  eq(mine.people.map((p) => [p.name, p.paid, p.share, p.balance]), web.people.map((p) => [p.name, p.paid, p.share, p.balance]), `${label}: 사람별 낸 돈·몫·차액·차례 = 웹 정산`);
  eq(mine.transfers, web.transfers.map((t) => ({ from: t.from, to: t.to, amount: t.amount })), `${label}: 송금 제안 = 웹 정산`);
  eq([mine.totalExpense, mine.participantCount, mine.share, mine.mode], [web.totalExpense, web.participantCount, web.share, web.mode], `${label}: 합계·인원·1인 평균·방식 = 웹 정산`);
  const byName = (object) => Object.entries(object).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  eq(byName(Object.fromEntries(mine.people.map((p) => [p.name, p.share]))), byName(exactShares(input, mine.mode)), `${label}: 사람별 몫 = BigInt 정답`);
  const shares = mine.people.reduce((sum, p) => sum + p.share, 0);
  eq(shares, mine.totalExpense, `${label}: 몫의 합 = 지출 합계`);
  const balance = Object.fromEntries(mine.people.map((p) => [p.name, p.balance]));
  for (const t of mine.transfers) { balance[t.from] += t.amount; balance[t.to] -= t.amount; }
  ok(Object.values(balance).every((v) => v === 0), `${label}: 송금을 마치면 모두 0 (${JSON.stringify(balance)})`);
  ok(mine.transfers.length <= Math.max(0, mine.participantCount - 1), `${label}: 송금 ${mine.transfers.length}번 ≤ 인원 − 1`);
  ok(mine.transfers.every((t) => Number.isInteger(t.amount) && t.amount >= 1), `${label}: 송금 금액은 1원 이상 정수`);
  return mine;
}

const spec = GROUP_SETTLEMENT_SPEC_V229147;
const examples = [{ label: spec.exampleLabel, input: spec.example }, ...spec.otherExamples];
const exampleResults = examples.map((e) => sameAsWeb(e.input, `예제 ‘${e.label}’`));

function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const random = rng(20261126);
const pick = (list) => list[Math.floor(random() * list.length)];
const POOL = ["민지", "준호", "서연", "도윤", "하준", "지우", "예린", "현우", "수아", "태윤", "나연", "시우"];
const RATIO = ["1", "2", "3", "7", "10", "33", "333", "999", "1000", ""];
const amount = () => {
  const value = pick([
    () => 1 + Math.floor(random() * 30), () => 1000 + Math.floor(random() * 199000), () => Math.floor(random() * 10000) * 100 + 1,
    () => 1 + Math.floor(random() * 9999999), () => pick([1, 2, 3, 7, 10, 99, 100001, 999999999, 1000000000]),
  ])();
  return random() < 0.5 ? String(value) : value.toLocaleString("en-US");
};
for (let index = 0; index < 800; index += 1) {
  const size = 1 + Math.floor(random() * (index % 5 === 0 ? 12 : 8));
  const names = [...POOL].sort(() => random() - 0.5).slice(0, size);
  const mode = pick(["equal", "ratio", "headcount", "item"]);
  const members = names.map((name) => ({ name, weight: mode === "ratio" ? pick(RATIO) : mode === "headcount" ? String(1 + Math.floor(random() * 12)) : "1" }));
  const expenses = Array.from({ length: 1 + Math.floor(random() * 14) }, (_, k) => {
    const together = random() < 0.35 ? "" : names.filter(() => random() < 0.5).sort(() => random() - 0.5).join(", ");
    return { item: `지출 ${k + 1}`, amount: amount(), payer: pick(names), with: mode === "item" ? together : "" };
  });
  sameAsWeb({ settings: { title: `무작위 ${index + 1}`, mode }, members, expenses }, `무작위 모임 ${index + 1}(${mode}, ${size}명)`);
}

// ── 3. 다시 적어 달라는 말·빈 행·쓰지 않는 칸 ─────────────────────────────
const base = () => ({ settings: { title: "확인", mode: "ratio" }, members: [{ name: "민지", weight: "1" }, { name: "준호", weight: "1" }], expenses: [{ item: "식사", amount: "30000", payer: "민지", with: "" }] });
const errorOf = (input) => { try { compute(input); return null; } catch (error) { return error; } };
const throwsLike = (mutate, pattern, label, field) => {
  const input = base(); mutate(input);
  const error = errorOf(input);
  const message = String(error?.message || "");
  ok(pattern.test(message), `${label}: 다시 적어 달라는 말(${pattern}) — 받은 말 ‘${message}’`);
  ok(!/지출 지출|이\(가\)|을\(를\)/.test(message), `${label}: 조사가 겹치거나 괄호 조사가 없다 — ‘${message}’`);
  if (field) eq(error?.field, field, `${label}: 틀린 칸의 위치`);
};
// 몫·인원수: 1부터 1000까지의 정수만(웹 정산이 고쳐 쓰는 값과 소수 몫).
throwsLike((i) => { i.members[1].weight = "0"; }, /준호의 몫은 1부터 1000까지 적을 수 있어요/, "비율 몫 0", { group: "members", index: 1, key: "weight" });
throwsLike((i) => { i.members[1].weight = "1001"; }, /1부터 1000까지 적을 수 있어요/, "비율 몫 1000 초과");
throwsLike((i) => { i.members[1].weight = "-2"; }, /정수로 적어 주세요\. 반 몫이면/, "비율 몫 음수");
throwsLike((i) => { i.members[1].weight = "0.05"; }, /정수로 적어 주세요/, "비율 몫 0.1 미만");
throwsLike((i) => { i.members[1].weight = "1000.5"; }, /정수로 적어 주세요/, "비율 몫 소수");
throwsLike((i) => { i.members[0].weight = "0.7"; i.members[1].weight = "0.3"; i.expenses[0].amount = "90000"; }, /민지의 몫은 1부터 1000까지의 정수로 적어 주세요\. 반 몫이면 다른 사람을 2, 그 사람을 1처럼/, "소수 비율 0.7 : 0.3(웹 정산은 62,999 / 27,001)", { group: "members", index: 0, key: "weight" });
throwsLike((i) => { i.members[0].weight = "1,000"; }, /정수로 적어 주세요/, "쉼표 든 몫");
throwsLike((i) => { i.settings.mode = "headcount"; i.members[1].weight = "1.5"; }, /준호의 인원수는 1부터 1000까지의 정수로/, "소수 인원수");
throwsLike((i) => { i.settings.mode = "headcount"; i.members[1].weight = "0"; }, /준호의 인원수는 1부터 1000까지 적을 수 있어요/, "인원수 0");
{
  const input = base(); input.members[0].weight = ""; input.members[1].weight = "1000";
  eq(compute(input).people.map((p) => p.share), [29, 29971], "빈 몫은 1, 1000 까지 받는다(30,000원 × 1 ÷ 1001 = 29.97… → 29)");
}
// 이름.
throwsLike((i) => { i.members.push({ name: "민지", weight: "1" }); }, /같은 이름이 두 번 있어요: 민지/, "같은 이름", { group: "members", index: 2, key: "name" });
throwsLike((i) => { i.members = [{ name: "", weight: "" }]; }, /참여자를 한 명 이상/, "참여자 없음");
throwsLike((i) => { i.members.push({ name: "", weight: "3" }); }, /^3번째 참여자 행에 몫만 있어요\. 이름도 적어 주세요\.$/, "이름 없이 몫만", { group: "members", index: 2, key: "name" });
throwsLike((i) => { i.members = Array.from({ length: 31 }, (_, k) => ({ name: `사람${k + 1}`, weight: "1" })); }, /참여자는 30명까지/, "31명", { group: "members", index: 30, key: "name" });
throwsLike((i) => { i.members[1].name = "가".repeat(41); }, /^2번째 참여자의 이름은 40자까지/, "41자 이름");
throwsLike((i) => { i.members[1].name = "김,철수"; }, /이름에 쉼표를 쓸 수 없어요/, "쉼표 든 이름");
{
  const input = base(); input.settings.mode = "item"; input.members[1].name = "가".repeat(40); input.expenses[0].payer = "가".repeat(40); input.expenses[0].with = `민지, ${"가".repeat(40)}`;
  eq(errorOf(input), null, "40자 이름은 낸 사람·함께한 사람에 그대로 적어도 받는다");
}
// 지출.
throwsLike((i) => { i.expenses = []; }, /지출을 한 건 이상/, "지출 없음");
throwsLike((i) => { i.expenses[0].amount = ""; }, /^‘식사’ 지출의 금액을 적어 주세요\.$/, "금액 빈칸", { group: "expenses", index: 0, key: "amount" });
throwsLike((i) => { i.expenses[0].amount = "0"; }, /1원 이상이어야/, "금액 0");
for (const raw of ["삼만원", "30000원", "1/2", "50%", "1.5", "30000.5", "1e3", "0x10", "-300", "+300", "30,00", "3,0000", "2,40,000", "30 000", "３００００", "Infinity"]) {
  throwsLike((i) => { i.expenses[0].amount = raw; }, /금액은 원 단위 숫자로만 적어 주세요\(예: 240000 또는 240,000\)/, `금액 모양 ‘${raw}’`, { group: "expenses", index: 0, key: "amount" });
}
for (const [raw, value] of [["30,000", 30000], [" 30000 ", 30000], ["030000", 30000], ["1,000,000,000", 1000000000], ["7", 7]]) {
  const input = base(); input.expenses[0].amount = raw;
  eq(compute(input).totalExpense, value, `금액 ‘${raw}’ 를 ${value} 로 읽는다`);
}
throwsLike((i) => { i.expenses[0].amount = "1000000001"; }, /10억 원까지/, "10억 원 초과");
throwsLike((i) => { i.expenses[0].amount = "1,000,000,001"; }, /10억 원까지/, "10억 원 초과(쉼표)");
throwsLike((i) => { i.expenses[0].payer = ""; }, /^‘식사’ 지출을 낸 사람을 적어 주세요\.$/, "낸 사람 빈칸", { group: "expenses", index: 0, key: "payer" });
throwsLike((i) => { i.expenses[0].payer = "최씨네"; }, /^‘식사’ 지출을 낸 사람\(최씨네\)이 참여자 목록에 없어요\./, "목록에 없는 낸 사람(받침 없는 이름)");
throwsLike((i) => { i.expenses.push({ item: "", amount: "", payer: "민지", with: "" }); }, /^2번째 지출의 금액을 적어 주세요\.$/, "항목 없는 행", { group: "expenses", index: 1, key: "amount" });
throwsLike((i) => { i.settings.mode = "item"; i.expenses[0].with = "민지, 하준"; }, /없는 이름이 있어요: 하준\. 이름은 쉼표로 나눠 적어 주세요/, "목록에 없는 함께한 사람", { group: "expenses", index: 0, key: "with" });
throwsLike((i) => { i.settings.mode = "item"; i.expenses[0].with = "민지·준호"; }, /없는 이름이 있어요: 민지·준호\. 이름은 쉼표로 나눠/, "가운뎃점으로 나눈 함께한 사람");
throwsLike((i) => { i.settings.mode = "item"; i.expenses[0].with = "민지 준호"; }, /없는 이름이 있어요: 민지 준호\./, "빈칸으로 나눈 함께한 사람");
throwsLike((i) => { i.settings.mode = "item"; i.expenses[0].with = " , ，"; }, /함께한 사람 칸에 이름이 없어요\. 참여자 모두가 나누면 칸을 비워 두세요/, "쉼표만 적은 함께한 사람", { group: "expenses", index: 0, key: "with" });
throwsLike((i) => { i.expenses = Array.from({ length: 61 }, (_, k) => ({ item: `지출${k + 1}`, amount: "1000", payer: "민지", with: "" })); }, /지출은 60건까지/, "61건", { group: "expenses", index: 60, key: "item" });
{
  const members = spec.groups.find((g) => g.key === "members"), expenses = spec.groups.find((g) => g.key === "expenses");
  eq([members.max, expenses.max], [30, 60], "설정의 행 한도(30·60) = 계산 함수의 한도");
  const input = base();
  input.members = Array.from({ length: members.max }, (_, k) => ({ name: `사람${k + 1}`, weight: "1" }));
  input.expenses = Array.from({ length: expenses.max }, (_, k) => ({ item: `지출${k + 1}`, amount: "1,000,000,000", payer: `사람${(k % 30) + 1}`, with: "" }));
  const full = errorOf(input) ? null : compute(input);
  eq(full && [full.participantCount, full.totalExpense, full.people.reduce((s, p) => s + p.share, 0)], [30, 60000000000, 60000000000], "30명·60건·건당 10억 원을 받고 몫의 합이 정확하다");
}
{
  const input = base();
  input.settings.mode = "equal";
  input.members[1].weight = "3";
  input.expenses.push({ item: "", amount: "", payer: "", with: "" }, { item: "커피", amount: "9,000", payer: "준호", with: "민지" });
  const result = compute(input);
  eq([result.totalExpense, result.people.map((p) => p.share)], [39000, [19500, 19500]], "빈 행은 건너뛰고 쉼표 금액(9,000)을 읽는다");
  ok(result.notes.some((n) => n.includes("몫 칸은 비율 분배·인원수 분배 방식에서만")), "동일 분배에서 몫 칸 값은 쓰지 않는다고 알린다");
  ok(result.notes.some((n) => n.includes("함께한 사람 칸은 품목별 참여자 방식에서만")), "동일 분배에서 함께한 사람 칸 값은 쓰지 않는다고 알린다");
  const clean = compute(base());
  ok(!clean.notes.some((n) => n.includes("방식에서만")), "쓰지 않는 칸이 비어 있으면 그 알림이 없다");
  input.settings.mode = "없는방식";
  eq(compute(input).mode, "equal", "모르는 방식은 동일 분배");
}
// 결과 표·설명·결산 문구의 모양(인원수 방식은 팀·명).
const [mt, dinner, club, families] = exampleResults;
const person = (result, name) => result.people.find((p) => p.name === name);
// 받침이 있으면 ‘은’, 없으면 ‘는’(한글 음절의 끝소리).
const topic = (word) => { const code = word.charCodeAt(word.length - 1) - 0xac00; return code >= 0 && code < 11172 && code % 28 ? "은" : "는"; };
eq(mt.tables[0].headers, ["이름", "낸 돈", "부담할 몫", "받거나 보낼 돈"], "사람별 표는 네 칸");
eq(mt.tables[0].rows, [["민지", 240000, 95500, "144,500 받기"], ["준호", 86000, 95500, "9,500 보내기"], ["도윤", 42000, 104500, "62,500 보내기"], ["서연", 18000, 90500, "72,500 보내기"]], "사람별 표: MT 예제");
ok(dinner.tables[0].rows.some((row) => row[3] === "없음") === dinner.people.some((p) => p.balance === 0), "받거나 보낼 돈이 0 이면 ‘없음’");
eq(families.notes[0], `총 지출 ${fmt(families.totalExpense)}원, 3팀(모두 9명), 1명당 평균 ${fmt(Math.round(families.totalExpense / 9))}원.`, "인원수 방식 설명: 3팀(모두 9명)·1명당");
ok(families.shareText.split("\n")[1] === `총 ${fmt(families.totalExpense)}원 · 3팀 9명 · 인원수 분배(김씨네 3명, 이씨네 2명, 박씨네 4명)`, `인원수 방식 결산 문구 둘째 줄: ${families.shareText.split("\n")[1]}`);
ok(!families.shareText.includes(" · 3명 · "), "인원수 방식 결산 문구에 ‘3명’ 이라고 적지 않는다");
ok(club.shareText.split("\n")[1] === `총 ${fmt(club.totalExpense)}원 · 5명 · 비율 분배(민지 2 : 준호 2 : 서연 1 : 도윤 1 : 하준 1)`, `비율 방식 결산 문구에 비율: ${club.shareText.split("\n")[1]}`);
ok(!club.notes[0].includes("평균"), "비율 방식 설명에 1인 평균을 적지 않는다");
eq(dinner.notes[0], `총 지출 ${fmt(dinner.totalExpense)}원, 참여 5명, 1인 평균 ${fmt(dinner.share)}원.`, "동일 분배 설명");
const mtLines = mt.shareText.split("\n");
eq(mtLines.slice(-2), ["말해가계부 모임 정산 계산기로 계산했어요.", "https://malhaebook.com/group-settlement"], "결산 문구 끝 두 줄(계산기 주소는 따로 한 줄)");
ok(mt.transfers.every((t) => mt.shareText.includes(`- ${t.from} → ${t.to} ${fmt(t.amount)}원`)), "결산 문구에 송금 줄");

// ── 4. 화면(번들) ──────────────────────────────────────────────────────
const get = async (path) => { const response = await app.fetch(new Request(BASE + path), {}, ctx); return { response, text: await response.text() }; };
const page = await get("/group-settlement");
eq(page.response.status, 200, "/group-settlement 200");
const html = page.text;
eq(html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1], "모임 정산 계산기: 여행·회식 비용의 사람별 몫과 송금 순서", "제목(h1)");
ok(/<title>모임 정산 계산기: 여행·회식 더치페이와 송금 계산 · 말해가계부<\/title>/.test(html), "문서 제목(title)");
const toolAt = html.indexOf('<section class="pubInlineTool" id="inline-worksheet"');
const sectionAt = html.indexOf('id="section-1"');
ok(toolAt > 0 && sectionAt > toolAt, `계산기가 첫 절 앞에 있다(${toolAt} < ${sectionAt})`);
ok(html.slice(toolAt, toolAt + 600).includes('<h2 class="pubToolHeading">모임 정산 계산기</h2>'), "계산기 제목은 h2(머리 h1 바로 아래)");
eq(html.match(/<nav class="pubToc"[^>]*><b>이 페이지에서<\/b><a href="([^"]+)"/)?.[1], "#inline-worksheet", "목차 첫 링크 = 계산기");
eq((html.match(/id="inline-worksheet"/g) || []).length, 1, "계산기는 한 번만");
const script = html.match(/<script>\(function groupSettlementClientV229147[\s\S]*?<\/script>/)?.[0] || "";
const clientText = groupSettlementClientV229147.toString();
const computeText = groupSettlementComputeV229147.toString();
ok(script.startsWith(`<script>(${clientText})("group-settlement",`), "화면 스크립트 = 이 계산기의 브라우저 스크립트(검사한 함수 글)");
ok(script.endsWith(`,${computeText});</script>`), "화면 스크립트의 계산 함수 = 검사한 함수 글");
ok(!/worksheetComputeV229106|worksheetClientV229106/.test(html), "화면에 생활비 계산표 공용 스크립트가 없다");
ok(!clientText.includes("</") && !computeText.includes("</"), "쪽 안 스크립트의 두 함수 글에 ‘</’ 가 없다");
// 새 맥락(바깥 이름 없음)에서 계산 함수 글을 돌려도 같은 결과다.
const isolated = vm.runInNewContext(`(${computeText})`, {});
for (const [index, e] of examples.entries()) eq(JSON.parse(JSON.stringify(isolated("group-settlement", e.input))), JSON.parse(JSON.stringify(exampleResults[index])), `새 맥락의 계산 함수: 예제 ‘${e.label}’`);
let isolatedError = null;
try { isolated("group-settlement", { settings: { mode: "ratio" }, members: [{ name: "민지", weight: "0.5" }], expenses: [{ item: "a", amount: "1", payer: "민지", with: "" }] }); } catch (error) { isolatedError = error; }
eq(isolatedError && [isolatedError.message.includes("정수로"), isolatedError.field], [true, { group: "members", index: 0, key: "weight" }], "새 맥락의 계산 함수: 소수 몫 오류와 칸 위치");
ok(clientText.includes('node.type = "text";') && !/\.type = (?:type|"number")|step = /.test(clientText), "브라우저 스크립트가 만드는 입력칸은 글자 칸이다(type=number 없음)");
ok(!/\b(?:escapeHtml|GROUP_SETTLEMENT_[A-Z0-9_]+|groupSettlementComputeV229147|worksheet\w*V2291\d\d|PUBLIC_[A-Z_]+)\b/.test(clientText.replace(/^function groupSettlementClientV229147/, "")), "브라우저 스크립트가 모듈 바깥 이름을 쓰지 않는다");
const specJson = script.match(/\)\("group-settlement",(\{[\s\S]*\}),function groupSettlementComputeV229147\(/)?.[1];
let shipped = null;
try { shipped = JSON.parse(specJson); } catch {}
eq(shipped, JSON.parse(JSON.stringify(spec)), "스크립트로 넘기는 설정 = GROUP_SETTLEMENT_SPEC_V229147");
ok(script.length > 1000 && !/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|\bconfirm\s*\(|\balert\s*\(|\bprompt\s*\(/.test(script), "계산기 스크립트에 저장·네트워크 호출·확인 창이 없다");
ok(html.includes('<form id="worksheet-form" action="#inline-worksheet" novalidate data-mode="item"><fieldset disabled>'), "스크립트 전 입력칸은 잠겨 있고, 폼은 쪽 안으로만 가며 예제 방식(품목별) 표식이 있다");
const form = html.slice(html.indexOf('<form id="worksheet-form"'), html.indexOf("</form>"));
eq([...form.matchAll(/<legend>([^<]+)<\/legend>/g)].map((m) => m[1]), ["기본 예제 입력값", "참여자 1", "참여자 2", "참여자 3", "참여자 4", "지출 1", "지출 2", "지출 3", "지출 4"], "서버가 먼저 그린 행: 번호 붙은 legend");
eq((form.match(/<label for="row-\d+-weight" data-col="weight" data-modes="ratio headcount">/g) || []).length, 4, "몫 칸은 비율·인원수 방식에서만 보이는 표식");
eq((form.match(/<label for="row-\d+-with" data-col="with" data-modes="item" class="wsWide">/g) || []).length, 4, "함께한 사람 칸은 품목별 방식에서만 보이는 표식");
eq((form.match(/ type="number"/g) || []).length, 0, "숫자 칸(type=number)이 없다");
eq((form.match(/<input id="row-\d+-amount" name="amount" type="text" value="[0-9,]+" maxlength="13" inputmode="numeric" placeholder="240,000" autocomplete="off"\/>/g) || []).length, 4, "금액 칸은 글자 칸 + 숫자 자판");
ok(html.includes('label[data-modes]{display:none}') && html.includes('#worksheet-form[data-mode="item"] label[data-modes~="item"]{display:flex}'), "방식에 쓰지 않는 칸을 숨기는 CSS");
const region = html.slice(html.indexOf('<div id="worksheet-result">'), html.indexOf('<div class="actions">', toolAt));
const strip = (text) => text.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const expectedTables = mt.tables.map((t) => [t.caption, ...t.headers, ...t.rows.flat().map((v) => (typeof v === "number" ? fmt(v) : String(v)))].join(" ")).join(" ");
eq(strip(region.slice(0, region.indexOf("<p>"))), expectedTables, "서버가 먼저 그린 표 = 예제 계산 결과");
for (const note of mt.notes) ok(region.includes(`<p>${note}</p>`), `서버가 먼저 그린 설명: ${note.slice(0, 30)}…`);
const body = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
ok(body.length > 5000 && !/무료|평생|언제나|영원히|앞으로도|반드시 이득/.test(body), "쪽 본문에 ‘무료’·앞날 약속 낱말이 없다");
// 쪽 글의 숫자 = 계산(예제를 바꾸면 글도 함께 고친다).
ok(html.includes(`회식 1차·2차 ${fmt(dinner.totalExpense)}원을 다섯 명이 나누면 한 사람 ${fmt(dinner.share)}원`) && dinner.participantCount === 5 && dinner.people.every((p) => p.share === dinner.share), "방식 표: 동일 분배 예제");
ok(html.includes(`선배 2 : 후배 1로 ${fmt(club.totalExpense)}원이면 선배 ${fmt(person(club, "민지").share)}원, 후배 ${fmt(person(club, "서연").share)}원`) && person(club, "준호").share === person(club, "민지").share && person(club, "하준").share === person(club, "서연").share, "방식 표: 비율 분배 예제");
ok(html.includes(`3·2·4명 세 가족이 ${fmt(families.totalExpense)}원이면 ${["김씨네", "이씨네", "박씨네"].map((n) => `${fmt(person(families, n).share)}원`).join(", ")}`), "방식 표: 인원수 분배 예제");
// 예제 풀이 표: 지출마다 함께한 사람끼리 나눈 한 사람 몫(나누어떨어지는 예제다).
const mtNames = spec.example.members.map((m) => m.name);
const walkRows = spec.example.expenses.map((e) => {
  const picked = e.with ? e.with.split(",").map((v) => v.trim()) : mtNames;
  const each = amountOf(e.amount) / picked.length;
  ok(Number.isInteger(each), `예제 풀이: ${e.item} 은 나누어떨어진다`);
  return `<tr><th scope="row">${e.item}</th><td>${fmt(amountOf(e.amount))}</td><td>${e.payer}</td><td>${e.with ? picked.join("·") : "네 명 모두"}</td><td>${fmt(each)}</td></tr>`;
});
ok(walkRows.every((row) => html.includes(row)), "예제 풀이 표 = 지출마다 나눈 몫");
ok(html.includes(`민지와 준호는 60,000 + 21,500 + 14,000 = ${fmt(person(mt, "민지").share)}원, 서연은 60,000 + 21,500 + 9,000 = ${fmt(person(mt, "서연").share)}원, 도윤은 네 지출에 모두 함께해 ${fmt(person(mt, "도윤").share)}원입니다. 네 사람의 몫을 더하면 ${fmt(mt.totalExpense)}원으로 지출 합계와 같습니다.`)
  && person(mt, "준호").share === person(mt, "민지").share && person(mt, "도윤").share === 60000 + 21500 + 9000 + 14000, "예제 풀이: 사람별 몫의 합");
ok(html.includes(`민지는 ${fmt(person(mt, "민지").balance)}원을 받고, ${mt.transfers.map((t) => `${t.from}${topic(t.from)} ${fmt(t.amount)}원`).join(", ")}을 보냅니다. 그래서 세 사람이 민지에게 한 번씩, 세 번 보내면 끝납니다.`)
  && mt.transfers.length === 3 && mt.transfers.every((t) => t.to === "민지"), "예제 풀이: 받는 돈·보내는 돈·세 번");
ok(spec.checks.some((line) => line.includes(`민지의 몫은 60,000 + 21,500 + 14,000 = ${fmt(person(mt, "민지").share)}원`)) && html.includes("민지의 몫은 60,000 + 21,500 + 14,000 = 95,500원"), "검산: 민지의 몫");
ok(html.includes(mt.transfers.map((t, i) => `${t.from}${i === 2 ? "가" : "이"} ${i === 0 ? `${t.to}에게 ` : ""}${fmt(t.amount)}원`).join(", ")), "검산: 송금 세 줄");
ok(html.includes(`${fmt(person(mt, "민지").paid)}원을 냈고 몫이 ${fmt(person(mt, "민지").share)}원이라 ${fmt(person(mt, "민지").balance)}원을 돌려받습니다`), "검산: 민지가 돌려받는 돈");
ok(html.includes(`남는 1원은 참여자 칸에 마지막으로 적은 박씨네(${fmt(person(families, "박씨네").share)}원)가 맡습니다`)
  && html.includes(`이씨네 몫 ${fmt(families.totalExpense)} × 2 ÷ 9 = 69,333.3…원을 ${fmt(person(families, "이씨네").share)}원으로 내리고, 남는 1원은 마지막에 적은 박씨네가 맡아 ${fmt(person(families, "박씨네").share)}원이 됩니다`)
  && person(families, "이씨네").share === Math.floor(families.totalExpense * 2 / 9) && person(families, "박씨네").share - Math.floor(families.totalExpense * 4 / 9) === 1, "남는 1원: 인원수 분배 예제");
// 다른 계산표의 남는 원 규칙(그 계산표의 설명 글과 같다).
const neighbor = readFileSync(new URL("../src/modules/public/worksheet-calculations.js", import.meta.url), "utf8");
ok(html.includes("공동 생활비 계산표는 소수 부분이 큰 사람부터, 모임 회비 정산표의 택시비는 먼저 적은 사람부터 1원씩 맡습니다")
  && neighbor.includes("원 미만을 버리고 소수 부분이 큰 순서로 남은 원을 배정하며, 동률이면 참여자 입력 순서를 따릅니다")
  && neighbor.includes("1원씩 남으면 목록에서 먼저 적은 탑승자부터 부담합니다"), "다른 계산표의 남는 원 규칙 = 그 계산표의 설명");
// 송금 횟수가 늘 가장 적지는 않다: 비율 3·3·4·3·3, A 90,000원·B 70,000원.
{
  const result = compute({ settings: { mode: "ratio" }, members: [["A", "3"], ["B", "3"], ["C", "4"], ["D", "3"], ["E", "3"]].map(([name, weight]) => ({ name, weight })), expenses: [{ item: "가", amount: "90000", payer: "A", with: "" }, { item: "나", amount: "70000", payer: "B", with: "" }] });
  eq(result.people.map((p) => [p.name, p.balance]), [["A", 60000], ["B", 40000], ["C", -40000], ["D", -30000], ["E", -30000]], "송금 횟수 사례: 받을 돈·보낼 돈");
  eq(result.transfers.map((t) => `${t.from}→${t.to} ${fmt(t.amount)}원`).join(", "), "C→A 40,000원, D→A 20,000원, D→B 10,000원, E→B 30,000원", "송금 횟수 사례: 이 계산기의 네 번");
  ok(html.includes("받을 돈 A 60,000원·B 40,000원, 보낼 돈 C 40,000원·D 30,000원·E 30,000원으로 끝났다면 이 계산기는 C→A 40,000원, D→A 20,000원, D→B 10,000원, E→B 30,000원의 네 번을 제안합니다. C가 B에게 40,000원, D와 E가 A에게 30,000원씩 보내면 세 번에 끝납니다."), "송금 횟수 사례: 쪽 글");
  const alternative = { A: 60000 - 30000 - 30000, B: 40000 - 40000, C: -40000 + 40000, D: -30000 + 30000, E: -30000 + 30000 };
  ok(Object.values(alternative).every((v) => v === 0), "송금 횟수 사례: 세 번짜리 대안도 모두 0 으로 끝난다");
}
// 자주 묻는 경우의 숫자.
{
  const left = compute({ settings: { mode: "item" }, members: ["민지", "준호", "서연", "도윤", "하준"].map((name) => ({ name, weight: "1" })), expenses: [{ item: "1차", amount: "213,000", payer: "민지", with: "" }, { item: "2차", amount: "87,500", payer: "준호", with: "민지, 준호, 서연, 도윤" }] });
  ok(person(left, "하준").share === 42600 && ["민지", "준호", "서연", "도윤"].every((n) => person(left, n).share === 64475)
    && html.includes("회식 1차 213,000원은 다섯 명이, 2차 87,500원은 하준을 뺀 네 명이 나누면 하준은 42,600원, 나머지 네 사람은 64,475원씩 부담합니다."), "자주 묻는 경우: 먼저 간 사람");
  const half = compute({ settings: { mode: "ratio" }, members: [["어른1", "2"], ["어른2", "2"], ["아이", "1"]].map(([name, weight]) => ({ name, weight })), expenses: [{ item: "나들이", amount: "120000", payer: "어른1", with: "" }] });
  ok([person(half, "어른1").share, person(half, "어른2").share, person(half, "아이").share].join() === "48000,48000,24000"
    && html.includes("어른 둘과 아이 하나가 120,000원을 나누면 어른은 48,000원씩, 아이는 24,000원입니다. 0.5 같은 소수 몫은 받지 않습니다."), "자주 묻는 경우: 아이 반 몫");
}
ok(html.includes("단톡방에서 ‘@말해가계부 정산’이라고 보내면") && !html.includes("단톡방에서 ‘정산’이라고"), "단톡방 정산 명령은 봇 부르기와 함께");
ok(!html.includes("웹 정산에서 같은 결과를 다시 확인할 수 있습니다") && !/회비의 사람별 몫/.test(html), "지나친 말(같은 결과를 다시 확인)·제목의 ‘회비’ 를 뺐다");

// ── 5. 연결 ─────────────────────────────────────────────────────────────
ok(PUBLIC_CONTENT_PATHS.includes("/group-settlement") && AD_PAGE_KEYS.includes("/group-settlement"), "공개 정본·광고 후보 목록");
const sitemap = (await get("/sitemap.xml")).text;
ok(new RegExp(`<loc>[^<]*/group-settlement</loc>\\s*<lastmod>${GROUP_SETTLEMENT_UPDATED_V229147}</lastmod>`).test(sitemap), "사이트맵: 주소와 수정일");
ok(new RegExp(`"dateModified":"${GROUP_SETTLEMENT_UPDATED_V229147}"`).test(html), "구조화 데이터 수정일");
for (const path of ["/guides", "/site-map", "/group-accountbook"]) {
  const linked = (await get(path)).text;
  ok(/<a [^>]*href="\/group-settlement"/.test(linked), `${path} 가 계산기를 링크한다`);
}
{
  const living = (await get("/shared-living-cost-rules")).text;
  const related = living.match(/<aside class="pubRelated"><b>함께 읽을 글<\/b>([\s\S]*?)<\/aside>/)?.[1] || "";
  ok(related.includes('href="/group-settlement">여행·회식 한 번의 정산은 모임 정산 계산기로<'), "/shared-living-cost-rules 의 함께 읽을 글이 계산기를 링크한다");
  ok(html.includes('href="/shared-living-cost-rules"'), "계산기 쪽이 /shared-living-cost-rules 를 링크한다");
}
ok((await get("/demo")).text.includes('id="tour-settle"') && html.includes('href="/demo#tour-settle"'), "/demo#tour-settle 이 있고 계산기 쪽이 그곳을 링크한다");

if (failures.length) {
  for (const failure of failures.slice(0, 30)) console.error(`FAIL ${failure}`);
  console.log(`V22.9.147 모임 정산 계산기 검사 실패 — ${failures.length}/${checks}`);
  process.exit(1);
}
console.log(`V22.9.147 모임 정산 계산기 검사 통과 (${checks} checks)`);
