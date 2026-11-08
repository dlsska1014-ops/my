// V22.9.110 UI 점검 수정(Aside 운영 점검 + 오프라인 헤드리스 Chrome 전수 점검) 검사.
//  1. 홈 최근 피드가 필터·검색으로 비면 '첫 거래를 기록' 이 아니라 '조건에 맞는 기록이 없습니다' 를 띄운다(#10).
//     renderV8TxCards 의 여섯째 인자 { filtered } 로 가른다. 기존 호출(인자 5개 이하)은 예전 문구 그대로다(되돌림 없음).
//  2. /my/settings 정기 항목 추가 폼의 '일자' 칸에 보이는 라벨('매월 … 일')과 aria-label 을 둔다(F-B). 예전에는 값 '1' 만 보였다.
// 판 이름 글자는 적지 않는다('판 번호 정본' 검사). 오프라인: 픽스처 + app.fetch, DB·바깥 요청 없음.
import { readFileSync } from "node:fs";
import { counter, fixture, page, withClock } from "./lib-audit-v22934.mjs";
import { renderV8TxCards } from "../src/modules/my/home-sections.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { ok, eq, done } = counter("V22.9.110 UI 점검 수정(홈 필터 빈 상태 문구·정기 일자 라벨) 검사 통과");

const FILTERED = "조건에 맞는 기록이 없습니다";
const FIRST = "첫 거래를 기록";
const EMPTY = "아직 기록이 없습니다";

// ── 1. 홈 피드 빈 상태(#10): renderV8TxCards 단위 ──────────────────────
const txRow = { id: "t1", household_id: "house-home", user_id: "user-bin", type: "expense", amount: 1000, category: "카페/간식", memo: "커피", payment_method: "카드", transaction_date: "2026-07-10", __spenderMembers: [] };

const filteredEmpty = renderV8TxCards([], "", null, [], false, { filtered: true });
ok(filteredEmpty.includes(FILTERED), "필터로 빈 피드는 '조건에 맞는 기록이 없습니다' 를 띄운다");
ok(!filteredEmpty.includes(FIRST), "필터로 빈 피드는 '첫 거래를 기록' 을 띄우지 않는다");

const unfilteredEmpty = renderV8TxCards([], "", null, [], false, { filtered: false });
ok(unfilteredEmpty.includes(EMPTY) && unfilteredEmpty.includes(FIRST), "기록이 없어 빈 피드는 '아직 기록이 없습니다 … 첫 거래를 기록' 그대로다");

const defaultEmpty = renderV8TxCards([]);
ok(defaultEmpty.includes(EMPTY) && defaultEmpty.includes(FIRST), "여섯째 인자 없는 기존 호출은 예전 빈 상태 문구 그대로다(되돌림 없음)");
ok(!defaultEmpty.includes(FILTERED), "필터 인자 없는 빈 피드는 필터 문구를 쓰지 않는다");

const nonEmpty = renderV8TxCards([txRow], "", null, [], false, { filtered: true });
ok(!nonEmpty.includes(FILTERED) && !nonEmpty.includes(EMPTY), "행이 있으면 빈 상태 문구를 전혀 쓰지 않는다");
ok(nonEmpty.includes("커피"), "행이 있으면 그 기록을 그린다");

// ── 2. 판 단일 출처(글자 박지 않고 파일에서 읽어 비교) ─────────────────
const versionTxt = read("VERSION.txt").trim();
const appVersion = (read("src/index.js").match(/const APP_VERSION = "([^"]+)"/) || [])[1];
ok(versionTxt === appVersion, `VERSION.txt 와 번들 APP_VERSION 이 같다 (${appVersion})`);

await withClock("2026-07-15", () => fixture(async (fx) => {
  const HH = "household_id=house-home";

  // #10 종단: 홈에서 맞지 않는 검색어 → 필터 빈 상태 문구
  const homeFiltered = await page(fx, `/app?month=2026-07&${HH}&q=zzzznomatch`);
  eq(homeFiltered.status, 200, "홈(검색 불일치) 200");
  ok(homeFiltered.html.includes(FILTERED), "홈 피드가 필터로 비면 '조건에 맞는 기록이 없습니다' 를 띄운다");
  ok(!homeFiltered.html.includes(FIRST), "홈 피드가 필터로 비어도 '첫 거래를 기록' 을 띄우지 않는다");

  // 필터 없는 홈: 기록이 있으므로 필터 빈 상태 문구가 없다
  const homePlain = await page(fx, `/app?month=2026-07&${HH}`);
  eq(homePlain.status, 200, "홈(필터 없음) 200");
  ok(!homePlain.html.includes(FILTERED), "필터 없는 홈에는 필터 빈 상태 문구가 없다");

  // 거래 탭은 예전처럼 올바른 문구(회귀 아님 확인)
  const txTab = await page(fx, `/app?month=2026-07&${HH}&tab=transactions&q=zzzznomatch`);
  ok(txTab.html.includes(FILTERED), "거래 탭도 필터 빈 상태에 '조건에 맞는 기록이 없습니다' 를 띄운다(그대로)");

  // F-B: 정기 항목 추가 폼의 '일자' 라벨
  const settings = await page(fx, `/my/settings?${HH}&month=2026-07`);
  eq(settings.status, 200, "설정 화면 200");
  ok(settings.html.includes('class="recurDay"'), "정기 일자 칸이 recurDay 라벨로 감싸진다");
  ok(settings.html.includes('aria-label="반복 일자(매월 며칠)"'), "정기 일자 칸에 aria-label 이 있다");
  ok(settings.html.includes("<span>매월</span>") && settings.html.includes("<span>일</span>"), "정기 일자 칸에 보이는 '매월 … 일' 라벨이 있다");
  ok(settings.html.includes('name="day_of_month" type="number" min="1" max="31" value="1"'), "정기 일자 입력(1~31, 기본 1)은 그대로다");
  ok(/\.rowform\{display:grid;grid-template-columns:100px 1fr 150px 150px 150px 132px auto/.test(settings.html), "정기 폼 일자 열 너비가 라벨에 맞게 넓어졌다(132px)");
}));

done();
