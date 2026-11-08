// V22.9.113 ①(Gemini 감사) 예산 명령이 '예산' 든 일반 지출을 가로채던 것 수정 검사.
//  파서 parseDirectBudgetSetCommand 의 조기 반환을 빼고, skill-handler 백스톱을 '예산 바로 뒤 숫자(budget-shape)'로 좁혔다.
//  그래서 '동아리 예산 회식 50000원'은 지출로 기록되고, '식비 예산 30만원'·'예산 50만원'은 예산 설정 그대로다.
// 판 이름 글자는 적지 않는다('판 번호 정본' 검사). 오프라인: 모듈 직접 호출 + 카카오 스킬 끝단(픽스처), DB·바깥 요청 없음.
import { readFileSync } from "node:fs";
import { counter, fixture, skill, withClock } from "./lib-audit-v22934.mjs";
import { parseDirectBudgetSetCommand } from "../src/modules/kakao/household-budget-commands.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { ok, eq, done } = counter("V22.9.113 예산 명령이 '예산' 든 지출을 가로채던 것 수정 검사 통과");

// ── 파서: 예산 명령은 받고, '예산' 든 지출은 null ───────────────────
const b = (t) => { const r = parseDirectBudgetSetCommand(t); return r ? `${r.category} ${r.amount}` : null; };
eq(b("예산 50만원"), "__total 500000", "'예산 50만원' → 전체 예산");
eq(b("식비 예산 30만원"), "식비 300000", "'식비 예산 30만원' → 식비 예산");
eq(b("식비 예산설정 30만원"), "식비 300000", "'식비 예산설정 30만원' → 식비 예산");
eq(b("월 예산 200만원"), "__total 2000000", "'월 예산 200만원' → 전체(예전엔 분류 '월' 버그)");
eq(b("식비 예산 300.000원"), "식비 300000", "'식비 예산 300.000원' → 300000(Q-2 점 천단위 회귀 없음)");
eq(b("이번달 식비 예산 30만원"), "식비 300000", "달 힌트 붙은 예산 명령도 받는다");
eq(b("동아리 예산 회식 50000원"), null, "'동아리 예산 회식 50000원' → null(지출로 넘어감)");
eq(b("예산 회의 커피 4500원"), null, "'예산 회의 커피 4500원' → null(지출)");
eq(b("회사 예산 회의 5000"), null, "'회사 예산 회의 5000' → null(지출)");
eq(b("예산 세미나 참가비 30000원"), null, "'예산 세미나 참가비 30000원' → null(지출)");

// ── 카카오 스킬 끝단: 실제 기록·예산 분기 ───────────────────────────
await withClock("2026-07-15", () => fixture(async (fx) => {
  fx.db.accountbook_settings.push({ id: "sel-v113", key: "kakao_selected_household_v2251:user-bin", value: "house-home", created_at: "2026-07-01T00:00:00Z" });
  async function run(utterance) {
    const before = (fx.db.transactions || []).length;
    const r = await skill(fx, utterance);
    const added = (fx.db.transactions || []).length - before;
    const last = added > 0 ? fx.db.transactions[fx.db.transactions.length - 1] : null;
    return { text: String(r == null ? "" : r), added, last };
  }
  // '예산' 든 지출: 기록된다
  const expense = await run("동아리 예산 회식 50000원");
  eq(expense.added, 1, "① '동아리 예산 회식 50000원' 이 지출로 저장된다");
  ok(expense.last && expense.last.type === "expense" && expense.last.amount === 50000, "① 저장된 거래가 50000원 지출이다");
  ok(/저장|지출/.test(expense.text), "① 응답이 저장/지출 확인이다");

  const expense2 = await run("예산 회의 커피 4500원");
  eq(expense2.added, 1, "① '예산 회의 커피 4500원' 도 지출로 저장된다");

  // 예산 명령: 기록 안 되고 예산 설정 응답
  const budget = await run("식비 예산 30만원");
  eq(budget.added, 0, "'식비 예산 30만원' 은 거래를 만들지 않는다");
  ok(/예산을 설정했어요|예산은 가계부 소유자/.test(budget.text), "'식비 예산 30만원' 은 예산 설정(또는 권한) 응답이다");

  const total = await run("예산 50만원");
  eq(total.added, 0, "'예산 50만원' 은 거래를 만들지 않는다");
  ok(/예산을 설정했어요|예산은 가계부 소유자/.test(total.text), "'예산 50만원' 은 전체 예산 설정 응답이다");

  // budget-shape + 꼬리: 예산 안내(기록 아님)
  const guide = await run("식비 예산 50000 추가");
  eq(guide.added, 0, "'식비 예산 50000 추가'(budget-shape)는 거래를 만들지 않는다");

  // 대조군: 예산 없는 지출
  const plain = await run("점심 12000원");
  eq(plain.added, 1, "대조군 '점심 12000원' 은 지출로 저장된다");
}));

// ── 소스 대조: 조기 반환 제거 + 백스톱 좁힘 ─────────────────────────
const hb = read("src/modules/kakao/household-budget-commands.js");
ok(hb.includes("if (!/\\s/.test(withoutAmount)) return"), "파서 조기 반환에 '분류가 두 낱말 이상이면(메모에 묻힌 지출) 안 받는' 가드가 있다");
const sk = read("src/modules/kakao/skill-handler.js");
ok(sk.includes("예산\\s*(?:설정|저장|등록|변경|수정)?\\s*(?:은|을|를)?\\s*\\d"), "백스톱이 '예산 바로 뒤 숫자'(budget-shape)로 좁혀졌다");

// 판 단일 출처
const versionTxt = read("VERSION.txt").trim();
const appVersion = (read("src/index.js").match(/const APP_VERSION = "([^"]+)"/) || [])[1];
ok(versionTxt === appVersion, `VERSION.txt 와 번들 APP_VERSION 이 같다 (${appVersion})`);

done();
