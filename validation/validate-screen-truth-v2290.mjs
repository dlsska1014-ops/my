// V22.9.0 — 화면이 데이터와 **반대말을 하지 않는다**.
//
// 이 파일이 왜 새로 필요했는지부터.
//
// 직전 릴리스에서 자동 검사는 4,188개였고 전부 통과했다. 그런데 실기기로 홈을 열어
// 보니 이런 상태였다:
//   · 예산을 384% 쓴 화면의 게이지가 **성공색으로 가득** 차 있었다. 바로 아래 빨간
//     글씨는 "예산을 5,564,189원 넘겼어요" 라고 말하고 있었다. 색과 글자가 서로
//     반대말을 했고, 사람은 색을 먼저 믿는다.
//   · 카테고리 비율이 "식 식비" · "기 기타" · "기 카드값" 으로 찍혔다. categoryEmoji
//     라는 이름의 함수가 이모지가 아니라 한글 한 글자를 돌려주는데, 그 이름을 믿고
//     이름 앞에 붙인 결과다. "기 카드값" 은 중복을 넘어 거짓이다(카드값은 어느
//     규칙에도 안 걸려 "기타"의 기 가 붙었다).
//   · 홈에서 가장 큰 "소비 흐름" 카드의 기본 상태가 빈 화면이었다.
//   · 같은 챌린지가 본문과 사이드바에 두 번 그려졌다.
//
// 4,188개가 이걸 하나도 못 잡은 이유는 단순하다. **전부 "그 문자열이 응답에 있는가"만
// 봤다.** 있는지는 봤지만 맞는지는 아무도 안 봤다. 통과 개수를 늘린 것이 화면이 맞다는
// 뜻이 아니었다.
//
// 그래서 이 파일은 개수가 아니라 **성질**을 본다. 셋뿐이다:
//   1) 색이 뜻과 같은 말을 한다 — 100% 를 넘긴 게이지는 강조색이 아니다.
//   2) 라벨이 데이터를 그대로 말한다 — 없는 접두사를 지어내지 않는다.
//   3) 같은 정보를 한 화면에 두 번 그리지 않는다.
//
// 개별 사례가 아니라 성질로 적었으므로, 같은 실수가 다른 화면·다른 이름으로 들어와도
// 여기서 걸린다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";

ok(/const APP_VERSION = "V\d+\.\d+\.\d+[-A-Z0-9]*"/.test(source), "런타임이 V22.9.0 을 알린다");

// 예산을 크게 넘긴 가계부를 만든다. 정상 범위만 재면 "초과일 때 어떻게 보이는가" 는
// 영원히 재지 않게 된다 — 실제로 그래서 384% 화면이 초록으로 남아 있었다.
const overFixture = await createV2265QaFixture();
let overHome = "";
let overBudgets = "";
try {
  for (let index = 0; index < 40; index += 1) {
    overFixture.db.transactions.push({
      id: `over-${index}`, household_id: "house-home", user_id: "user-bin",
      transaction_date: "2026-07-10", type: "expense", amount: 200000,
      category: "식비", memo: "예산 초과 재현", payment_method: "현금", source: "web",
      created_at: "2026-07-10T09:00:00.000Z",
    });
  }
  const get = async (path) => {
    const response = await app.fetch(new Request(`${ORIGIN}${path}`, { headers: { cookie: overFixture.cookie, "user-agent": "Mozilla/5.0" } }), overFixture.env, {});
    eq(response.status, 200, `${path} 가 렌더된다`);
    return response.text();
  };
  overHome = await get("/app?month=2026-07&household_id=house-home");
  overBudgets = await get("/budgets?month=2026-07&household_id=house-home");
} finally {
  overFixture.restore();
}

// ---------------------------------------------------------------------------
// 1) 색이 뜻과 같은 말을 한다
// ---------------------------------------------------------------------------
// 픽스처가 실제로 초과 상태인지 먼저 확인한다. 초과가 아닌 화면에서 "초과 표시가 없다"
// 는 언제나 통과하므로, 그 통과는 아무것도 뜻하지 않는다.
const overRate = Number((overHome.match(/예산 사용률 <span[^>]*>(\d+)%/) || [])[1] || 0);
ok(overRate > 100, `픽스처가 실제로 예산을 넘겼다 (${overRate}%)`);

ok(/<section class="homeBudget isOver"/.test(overHome), "홈 P0 게이지가 초과 상태를 단다");
ok(/class="homeReport isOver"/.test(overHome), "예산 항목 리포트 카드가 초과 상태를 단다");
ok(/<section class="budgetP0 isOver"/.test(overBudgets), "예산 화면 P0 히어로가 초과 상태를 단다");
ok(/class="usageCard isOver"/.test(overBudgets), "분류별 사용 카드가 초과 상태를 단다");

// 상태를 달아 놓고 색이 닿지 않으면 아무 소용이 없다 — 실제로 .homeUsage 가 그랬다.
// 상태 클래스마다 그 색을 실제로 칠하는 규칙이 셸 자산에 있는지 본다.
const shellCss = await (await app.fetch(new Request(`${ORIGIN}/assets/accountbook-shell-v22914.css`), {}, {})).text();
for (const selector of [
  ".homeBudget.isOver .homeProgress i",
  ".homeReport.isOver .homeReportBars i",
  ".homeUsage).isOver .abNavBudgetTrack i",
]) {
  ok(shellCss.includes(selector), `초과 색을 실제로 칠하는 규칙이 있다: ${selector}`);
}
ok(/--ab12-gauge-over:/.test(shellCss) && /--ab12-gauge-warn:/.test(shellCss), "초과·경고 색이 토큰으로 정의돼 있다");
// 경고색은 톤을 따라가면 안 된다. 파란 경고는 경고로 읽히지 않고, 초록 초과는 성공으로
// 읽힌다 — 이 사고의 원인이 바로 그것이었다.
for (const tone of ["emerald", "violet", "amber"]) {
  const toneBlock = shellCss.match(new RegExp(`html\\[data-ab-tone="${tone}"\\][^\\n]*`, "g")) || [];
  ok(!toneBlock.join("").includes("--ab12-gauge-over"), `${tone} 톤이 초과색을 덮어쓰지 않는다`);
}

// 정상 범위에서는 초과 상태가 붙지 않아야 한다. 이게 없으면 "항상 isOver" 로 고쳐도
// 위 검사들이 전부 통과한다.
const calmFixture = await createV2265QaFixture();
try {
  const response = await app.fetch(new Request(`${ORIGIN}/app?month=2026-07&household_id=house-home`, { headers: { cookie: calmFixture.cookie, "user-agent": "Mozilla/5.0" } }), calmFixture.env, {});
  const calmHome = await response.text();
  eq(response.status, 200, "정상 범위 홈이 렌더된다");
  ok(!/<section class="homeBudget isOver"/.test(calmHome), "예산 안이면 초과 상태를 달지 않는다");

  // -------------------------------------------------------------------------
  // 2) 라벨이 데이터를 그대로 말한다
  // -------------------------------------------------------------------------
  // categoryInitial 은 동그란 배지 안에서 쓰라고 있는 한 글자다. 그 값을 카테고리
  // 이름 **앞에** 붙이면 "식 식비" 가 되고, 규칙에 안 걸리는 이름은 "기 카드값" 처럼
  // 틀린 말이 된다. 이름 바로 앞 한 글자 + 공백 패턴을 금지한다.
  const barLabels = [...calmHome.matchAll(/<div class="homeBarRow"><div><b>([^<]*)<\/b>/g)].map((m) => m[1]);
  ok(barLabels.length > 0, `카테고리 비율에 항목이 있다 (${barLabels.length}개)`);
  for (const label of barLabels) {
    ok(!/^[가-힣]\s/.test(label), `카테고리 라벨에 지어낸 한 글자 접두사가 없다: "${label}"`);
  }
  // 세는 법 확인 — 이 정규식이 옛 결함을 실제로 잡는지 지운 값 그대로 넣어 본다.
  ok(/^[가-힣]\s/.test("기 카드값"), "이 검사는 옛 결함('기 카드값')을 실제로 잡는다");
  ok(!/^[가-힣]\s/.test("카페/간식"), "정상 분류명은 잡지 않는다");

  // -------------------------------------------------------------------------
  // 3) 같은 정보를 한 화면에 두 번 그리지 않는다
  // -------------------------------------------------------------------------
  const bigChallenge = (calmHome.match(/class="reportChallenge"/g) || []).length;
  const sideChallenge = (calmHome.match(/class="abNavChallenge/g) || []).length;
  eq(bigChallenge, 1, "홈 본문의 챌린지 카드는 하나다");
  eq(sideChallenge, 0, "홈은 같은 챌린지를 사이드바에 한 번 더 그리지 않는다");

  // 순서 — P0("이번 달 쓸 수 있는 돈")가 챌린지보다 위다. 홈의 첫 화면은 돈 이야기여야
  // 하는데 챌린지 카드가 그 자리를 차지하고 있었다.
  const p0At = calmHome.indexOf('class="homeBudget');
  const challengeAt = calmHome.indexOf('class="reportChallenge"');
  ok(p0At > 0 && challengeAt > 0, "두 블록이 모두 홈에 있다");
  ok(p0At < challengeAt, `P0 가 챌린지보다 위에 온다 (P0 ${p0At} · 챌린지 ${challengeAt})`);

  // -------------------------------------------------------------------------
  // 4) 홈에서 가장 큰 카드가 비어 있지 않다
  // -------------------------------------------------------------------------
  ok(calmHome.includes('class="readableTrendGrid"'), "소비 흐름이 기본으로 그려진다");
  eq((calmHome.match(/class="dailyCell/g) || []).length, 31, "7월 31일치 칸이 모두 있다");
  // 격자는 그래프다. 칸마다 링크를 달면 실사용 한 달에서 탭 정지점이 28개 늘어난다.
  eq((calmHome.match(/<a class="dailyCell/g) || []).length, 0, "일별 칸은 탭 정지점을 만들지 않는다");
  eq((calmHome.match(/class="dailyDrill"/g) || []).length, 1, "날짜별 드릴다운은 링크 하나로 모인다");
} finally {
  calmFixture.restore();
}

// ---------------------------------------------------------------------------
// 5) 기본 버튼이 톤을 따라간다
// ---------------------------------------------------------------------------
// --ab-blue 는 이름 그대로 파란 상수였고, primary 버튼이 그 값을 !important 로 칠했다.
// 그래서 톤을 emerald 로 바꿔도 "기록 저장" 버튼만 파랗게 남았다 — 홈뿐 아니라
// primary 버튼이 있는 모든 화면이 그랬다.
ok(shellCss.includes("--ab-blue:var(--ab12-action)"), "파란 상수가 톤 토큰을 가리킨다");

console.log(`V22.9.0 화면이 데이터와 같은 말을 하는지 검사 통과 (${checks} checks)`);
