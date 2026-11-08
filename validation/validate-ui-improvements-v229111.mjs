// V22.9.111 UI 개선(V110 점검 후속 수정) 검사.
//  #9 홈 요약 필터 범위: 홈에서 맞지 않는 검색어(필터)를 넣어도 상단 '최근 7일' 속도 요약은 월 전체 기준 그대로다(피드 수만 바뀐다).
//     예전에는 mobile-home 이 rows=feedSource 로 바꿔 속도 카드가 0원이 됐다.
//  F-A 분석 세그먼트: '한눈에 보기/종합 리포트' 고른 탭에 강조색 인라인 스타일(공용 셸 1년 캐시 CSS 안 건드림).
//  가계부 전환: 활성 카드가 디자인 토큰 CSS 에 덮여 비활성과 같아 보이던 것을 인라인 !important 로 가른다.
// 판 이름 글자는 적지 않는다('판 번호 정본' 검사). 오프라인: 픽스처 + app.fetch, DB·바깥 요청 없음.
import { readFileSync } from "node:fs";
import { counter, fixture, page, withClock } from "./lib-audit-v22934.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { ok, eq, done } = counter("V22.9.111 UI 개선(홈 요약 필터 범위·분석 탭 대비·가계부 활성 카드) 검사 통과");

// 홈 HTML 에서 '…속도입니다' 요약 문장만 뽑는다(피드 아래 #v8Feed 전까지).
function paceSentence(html) {
  const head = html.split('id="v8Feed"')[0];
  const m = head.match(/(마지막 7일[^<]*?속도[^<]*?|직전 7일[^<]*?속도입니다|[^<]*?같은 속도입니다)/);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

await withClock("2026-07-15", () => fixture(async (fx) => {
  const H = "household_id=house-home";

  // ── #9 홈 요약 필터 범위 ───────────────────────────────────────────
  const home = await page(fx, `/app?month=2026-07&${H}`);
  const homeFiltered = await page(fx, `/app?month=2026-07&${H}&q=zzzznomatch`);
  eq(home.status, 200, "홈(필터 없음) 200");
  eq(homeFiltered.status, 200, "홈(검색 불일치) 200");

  const paceA = paceSentence(home.html);
  const paceB = paceSentence(homeFiltered.html);
  ok(paceA.length > 0, "홈에 '최근 7일' 속도 요약 문장이 있다");
  eq(paceB, paceA, "필터를 넣어도 '최근 7일' 속도 요약이 월 전체 기준 그대로다(#9)");
  ok(homeFiltered.html.includes("조건에 맞는 기록이 없습니다"), "필터로 빈 피드는 '조건에 맞는 기록이 없습니다'(V110 #10 그대로)");
  // 피드 '전체 N건 조회' 수는 feedSource(필터 결과) 기준이라, 불일치 검색에서는 '전체 … 건 조회' 링크가 없다(0건).
  ok(!/전체 \d[\d,]*건 조회/.test(homeFiltered.html.split('id="v8Feed"')[1] || ""), "필터 0건이면 '전체 N건 조회' 링크가 없다(피드 수는 feedSource 기준)");

  // ── F-A 분석 세그먼트 고른 탭 ─────────────────────────────────────
  const analysis = await page(fx, `/my/analysis?month=2026-07&${H}`);
  eq(analysis.status, 200, "소비 분석 200");
  ok(analysis.html.includes('aria-current="true" style="background:var(--ab12-accent-soft'), "분석 '한눈에 보기' 고른 탭에 강조색 인라인 면이 있다(F-A)");
  ok(analysis.html.includes("box-shadow:inset 0 0 0 1px var(--ab12-accent"), "분석 고른 탭에 자리 안 밀리는 안쪽 1px 강조 테두리가 있다");
  const report = await page(fx, `/my/analysis?view=report&month=2026-07&${H}`);
  ok(report.html.includes('aria-current="true" style="background:var(--ab12-accent-soft'), "분석 '종합 리포트' 고른 탭도 강조색 면을 쓴다");

  // ── 가계부 전환 활성 카드 ─────────────────────────────────────────
  const hh = await page(fx, "/my/households");
  eq(hh.status, 200, "가계부 전환·추가 200");
  const activeTag = (hh.html.match(/<article class="hhCard[^"]*active[^"]*"[^>]*>/) || [])[0] || "";
  ok(activeTag.includes("border-color:#0f766e!important"), "활성 가계부 카드가 강조 테두리 인라인(!important)으로 가려진다(디자인 토큰 CSS override 를 이김)");
  ok(activeTag.includes("box-shadow:inset 0 0 0 2px #0f766e!important"), "활성 카드에 안쪽 2px 강조 링이 있다");
  // 비활성 카드에는 이 인라인이 없다.
  ok(/<article class="hhCard ">/.test(hh.html) || /<article class="hhCard">/.test(hh.html) || hh.html.split("hhCard").length > 2, "비활성 가계부 카드도 렌더된다");
}));

// 판 단일 출처(글자 박지 않고 파일에서 읽어 비교)
const versionTxt = read("VERSION.txt").trim();
const appVersion = (read("src/index.js").match(/const APP_VERSION = "([^"]+)"/) || [])[1];
ok(versionTxt === appVersion, `VERSION.txt 와 번들 APP_VERSION 이 같다 (${appVersion})`);

done();
