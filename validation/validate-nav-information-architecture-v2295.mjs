// V22.9.5 (개편 3단계) — 사이드바가 **하는 일 기준으로** 묶여 있고, 그 과정에서
// 갈 수 있던 곳이 하나도 사라지지 않았다.
//
// ── 먼저, 계획서의 진단이 과장이었다는 것부터 기록해 둔다 ──
// 개편 계획서에는 "목적지 21개 → 3개"라고 적혀 있었다. 재 보니 사실이 아니었다:
//   · 사이드바는 이미 그룹마다 <details> 로 접혀 있었고, 한 번에 보이는 조작 요소는
//     화면에 따라 13~15개였다(21개가 한꺼번에 보인 적이 없다).
//   · 21개 항목 중 20개는 서로 다른 화면이었다. <main> 본문 해시를 비교해서 확인했다.
//   · 겹치는 것은 "가져오기"와 "백업·복구" 한 쌍뿐인데, 그 둘은 같은 페이지의 두
//     앵커다. mode 파라미터는 서버 렌더를 바꾸지 않고 클라이언트 활성 표시만 정한다.
// 그래서 이번 단계는 **개수를 줄이는 작업이 아니라 분류 기준을 바꾸는 작업**이다.
// 옛 묶음(자산·리포트·함께·관리)은 시스템이 데이터를 나눈 방식이었고, 그 탓에
// "리포트" 한 그룹에 보기·계획·도구가 7개 섞여 있었다. 사람이 가계부에서 하는 일
// 셋(적는다·본다·계획한다)으로 나누고 나머지는 설정으로 내렸다.
//
// ── 이 파일이 보는 것 ──
// 라벨 문자열을 세지 않는다. 되돌아가면 조용히 깨질 **성질**을 본다:
//   1) 개편 전 갈 수 있던 21곳이 전부 그대로 남아 있다(주소까지).
//   2) 한 목적지가 두 그룹에 동시에 들어가 있지 않다.
//   3) 한 번에 보이는 조작 요소가 훑을 수 있는 수 안에 있다(그룹은 하나만 열린다).
//   4) 열리는 그룹은 지금 보고 있는 화면이 든 그룹이다 — 어느 화면에서 열어도.
//   5) 현재 위치 표시는 화면당 정확히 하나다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://malhaebook.com";

// 개편 **전** 사이드바가 갖고 있던 목적지(영수증 기능을 없애면서 21개에서 20개가 됐다). 이 목록은 되돌릴 수 없는 기준선이다 —
// 분류를 어떻게 바꾸든 여기 있는 키가 하나라도 빠지면 사용자는 갈 곳을 잃는다.
const DESTINATIONS_BEFORE_REGROUPING = [
  "app", "records", "calendar", "import",
  "payment-methods", "goals",
  // V22.9.83: 같은 주소(/my/analysis)의 두 보기였던 "analysis"(종합 리포트)는 소비 분석 화면 위 보기 탭으로 옮겼고
  // (validate-ui-clarity-v22983 이 탭을 확인한다), 예산 탭 아래 숨어 있던 정기 수입·지출(reserve-plans)이 제 항목을 얻었다.
  "stats", "reports", "annual", "budgets", "reserve-plans", "budget-alerts", "smart-tools",
  "members", "groups", "settlement",
  "my-households", "categories", "backup", "backup-login",
];

const fixture = await createV2265QaFixture();
try {
  const get = async (path) => {
    const url = `${ORIGIN}${path}${path.includes("?") ? "&" : "?"}month=2026-07&household_id=house-home`;
    const response = await app.fetch(new Request(url, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
    eq(response.status, 200, `${path} 가 열린다`);
    return response.text();
  };

  const home = await get("/app");

  // 사이드바 하나만 떼어 낸다. 본문 링크까지 세면 숫자가 뒤섞인다.
  const navAt = home.indexOf('class="abLayoutNav');
  ok(navAt > 0, "사이드바가 렌더된다");
  const navEnd = home.indexOf("</nav>", navAt);
  ok(navEnd > navAt, "사이드바 영역이 닫힌다");
  const nav = home.slice(navAt, navEnd);

  // -------------------------------------------------------------------------
  // 1) 갈 수 있던 곳이 하나도 사라지지 않았다
  // -------------------------------------------------------------------------
  const keys = [...nav.matchAll(/<a data-key="([^"]+)"/g)].map((m) => m[1]);
  for (const key of DESTINATIONS_BEFORE_REGROUPING) {
    ok(keys.includes(key), `개편 전 목적지 "${key}" 가 그대로 있다`);
  }
  eq(keys.length, DESTINATIONS_BEFORE_REGROUPING.length, `사이드바 목적지 수가 그대로다 (${keys.length})`);

  // -------------------------------------------------------------------------
  // 2) 한 목적지가 두 그룹에 동시에 들어가 있지 않다
  // -------------------------------------------------------------------------
  eq(new Set(keys).size, keys.length, "같은 목적지를 두 그룹에 넣지 않았다");

  // 가져오기 / 백업·복구 는 같은 페이지의 두 앵커다. 이 겹침은 알고 남긴 것이므로
  // 주석이 아니라 검사로 적어 둔다 — 나중에 "왜 둘인가"를 여기서 읽을 수 있게.
  const hrefOf = (key) => (nav.match(new RegExp(`<a data-key="${key}"[^>]*href="([^"]+)"`)) || [])[1] || "";
  const importHref = hrefOf("import");
  const backupHref = hrefOf("backup");
  ok(importHref.startsWith("/my/backup?") && backupHref.startsWith("/my/backup?"), "가져오기와 백업·복구는 같은 페이지다");
  ok(importHref !== backupHref, "그 둘은 같은 페이지의 서로 다른 진입점이다(mode·앵커)");

  // -------------------------------------------------------------------------
  // 3) 한 번에 보이는 조작 요소가 훑을 수 있는 수 안에 있다
  // -------------------------------------------------------------------------
  // V22.9.83: 묶음을 접지 않는다. 한 묶음만 열리던 아코디언이 나머지 메뉴를 숨겨 "메뉴가 어설프다"는 지적을 받았다.
  // 대신 묶음마다 이름표를 달고(7개 이하·3개 이상), 화면 높이가 모자라면 사이드바 안에서 스크롤한다.
  const groups = [...nav.matchAll(/<div class="abNavGroup abNavSection" role="group" aria-label="([^"]+)">([\s\S]*?)<\/div><\/div>/g)];
  ok(groups.length >= 3 && groups.length <= 5, `그룹 수가 훑을 수 있는 범위다 (${groups.length}개)`);
  ok(!/<details class="abNavGroup/.test(nav), "사용자 사이드바는 묶음을 접지 않는다(모든 항목이 보인다)");

  const visible = (nav.match(/<a data-key=/g) || []).length;
  ok(visible <= 22, `사이드바 항목이 22개 이하다 (${visible}개)`);

  // 어느 그룹도 혼자 절반을 넘게 갖고 있지 않다 — 그러면 묶은 의미가 없다.
  const sizes = groups.map((m) => (m[2].match(/<a data-key=/g) || []).length);
  ok(Math.max(...sizes) <= 7, `가장 큰 그룹이 7개 이하다 (${Math.max(...sizes)}개)`);
  ok(Math.min(...sizes) >= 3, `가장 작은 그룹도 3개 이상이다 (${Math.min(...sizes)}개) — 그룹 하나에 항목 하나면 묶은 게 아니다`);

  // -------------------------------------------------------------------------
  // 4) 열리는 그룹은 지금 보고 있는 화면이 든 그룹이다
  // -------------------------------------------------------------------------
  // 화면 넷을 서로 다른 그룹에서 골라 확인한다. 하나만 보면 "항상 첫 그룹이 열린다"는
  // 결함을 못 잡는다 — 홈은 어차피 첫 그룹이기 때문이다.
  for (const [path, key] of [["/app", "app"], ["/my/analysis", "stats"], ["/budgets", "budgets"], ["/my/members", "members"]]) {
    const html = await get(path);
    const start = html.indexOf('class="abLayoutNav');
    const scoped = html.slice(start, html.indexOf("</nav>", start));
    const current = (scoped.match(/<a data-key="([^"]+)"[^>]*aria-current="page"/) || [])[1] || "";
    eq(current, key, `${path} 의 현재 위치 표시가 그 화면 항목에 있다`);
    eq((scoped.match(/aria-current="page"/g) || []).length, 1, `${path} 의 현재 위치 표시는 하나다`);
  }

  // -------------------------------------------------------------------------
  // 5) 그룹 이름이 사용자가 하는 일이다
  // -------------------------------------------------------------------------
  // 문자열 자체보다, 옛 기준(시스템이 데이터를 나눈 방식)으로 되돌아가지 않았는지를 본다.
  // V22.9.83: 동사(적는다·본다·계획한다) 대신 명사 이름표. 가계부 메뉴는 이름표라 명사가 읽힌다(사용자 지적 2026-10-28).
  ok(source.includes('key: "record", label: "기록"'), "기록 묶음이 있다");
  ok(source.includes('key: "review", label: "분석"'), "분석 묶음이 있다");
  ok(source.includes('key: "plan", label: "예산·자산"'), "예산·자산 묶음이 있다");
  ok(source.includes('key: "together", label: "함께"'), "함께 묶음이 있다");
  ok(source.includes('key: "settings", label: "설정"'), "나머지는 설정으로 내려간다");

  // 주소는 하나도 바뀌지 않았다 — 되돌릴 수 있는 변경이라는 근거다.
  for (const [key, href] of [["stats", "/my/analysis?"], ["budgets", "/budgets?"], ["members", "/my/members?"], ["categories", "/keyword-guide?"]]) {
    ok(hrefOf(key).startsWith(href), `"${key}" 주소가 그대로다 (${href}…)`);
  }
} finally {
  fixture.restore();
}

console.log(`V22.9.5 내비게이션 정보구조 검사 통과 (${checks} checks)`);
