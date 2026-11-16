// V22.9.126 결함 수정 판 — 화면 후처리·공개 화면·라우터·가져오기 읽기 묶음(shell) 검사.
//   FC-2  사용자 메모·분류의 ‘프리미엄’ 이 화면에서 ‘스마트 도구’ 로 바뀌던 것(web/html-postprocess.js normalizeUserFacingUi)
//   FC-3  www 주소의 308 이 `//example.org/x` 를 다른 사이트로 보내던 것(public/site-config.js canonicalRedirectResponse)
//   FC-5  예산 읽기가 잠깐 실패하면 홈·소비 분석이 ‘예산 미설정’ 이라고 하던 것(my/mobile-home.js·my/insight-page.js)
//   FC-6  가져오기 금액 칸 ‘12.000원’ 을 12원으로 읽던 것(import/flexible-import-parser.js parseImportAmountCell)
//   FC-7  구성원 빠른 입력의 지출자 고르기(서버는 본인으로 저장)(my/mobile-home.js)
//   FC-14 납부·입금 일정 금액에 상한이 없던 것(settings/reserve-plans.js)
//   FC-17 로그인 없이 보이는 스킬 호출자 확인 건수·시각·헤더 누락 추정과 요청 제한 값(worker/router.js) — 집계 전체는 관리자 /ops-snapshot.json(3차)
//   FC-18 옛 내부용 안내 화면의 검색 제외(X-Robots-Tag) — 고칠 것 없이 지금 머리가 있음을 고정한다
//   FC-23 공개 /start-guide 의 공유 이미지(og:image)
// 장면마다 고치기 전 결함이 생기던 조건을 그대로 만들고(사용자 글·예산 GET 500·구성원 세션·큰 금액·거부된 /skill 호출) 고친 동작을 확인한다.
// 네트워크를 쓰지 않는다(메모리 픽스처 + app.fetch). 시계는 장면마다 고정한다.
// 실행: node validation/validate-v229126-shell.mjs  (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
import { readFileSync } from "node:fs";
import { app, BASE, ctx, counter, fixture, intercept, failure, withClock, page, post, formFields } from "./lib-audit-v22934.mjs";
import { parseFlexibleImportRecords, addReservePlan, updateReservePlan } from "../src/index.js";

const t = counter("v229126 shell (FC-2·3·5·6·7·14·17·18·23)");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const count = (text, needle) => text.split(needle).length - 1;
const HOME = "house-home";
const Q = `month=2026-07&household_id=${HOME}`;

// ── FC-2 사용자 글은 어떤 낱말이 들어 있어도 그대로 보인다 ─────────────────────────────
// 고치기 전 장면(final-check premium-probe): 메모 ‘유튜브 프리미엄’ 이 ‘유튜브 스마트 도구’ 로, 분류 ‘프리미엄’ 이 ‘스마트 도구’ 로 보였고,
// 그 글이 있는 달에는 /smart-tools·/my/analysis 의 ‘월말 예상 지출’ 이 ‘약 117만’ 처럼 바뀌었다.
const USER_TEXT_ROWS = [
  { id: "v126-ut-1", amount: 14900, category: "구독", memo: "유튜브 프리미엄", date: "2026-07-06" },
  { id: "v126-ut-2", amount: 52000, category: "프리미엄", memo: "프리미엄 아울렛 신발", date: "2026-07-07" },
  { id: "v126-ut-3", amount: 3000, category: "기타", memo: "오늘 쓴 돈 ☀️ 메모", date: "2026-07-10" },
  { id: "v126-ut-4", amount: 4000, category: "기타", memo: "🌱 시작가이드 처음이라면 여기부터", date: "2026-07-11" },
  { id: "v126-ut-5", amount: 5000, category: "기타", memo: "/my/premium 나간 돈 💸 메모", date: "2026-07-12" },
];
// 같은 금액·날짜인데 낱말만 다른 기록(비교용). 분류 ‘프리미엄’ 자리는 같은 성격의 다른 이름이다.
const NEUTRAL_ROWS = USER_TEXT_ROWS.map((row, i) => ({ ...row, category: row.category === "프리미엄" ? "쇼핑" : row.category, memo: `비교 기록 ${i + 1}` }));
function addRows(fx, rows) {
  const stamp = "2026-07-06T03:00:00.000Z";
  for (const row of rows) fx.db.transactions.push({ id: row.id, household_id: HOME, user_id: "user-bin", transaction_date: row.date, type: "expense", amount: row.amount, category: row.category, memo: row.memo, payment_method: "신용카드", source: "web", raw_text: `${row.memo} ${row.amount}`, created_at: stamp, updated_at: stamp });
}
const FC2_PAGES = [`/app?${Q}`, `/app?tab=transactions&${Q}`, `/my/analysis?${Q}`, `/smart-tools?${Q}`, `/budgets?${Q}`];
async function renderSet(rows) {
  return withClock("2026-07-20", () => fixture(async (fx) => {
    addRows(fx, rows);
    const out = {};
    for (const path of FC2_PAGES) out[path] = await page(fx, path);
    out.edit = await page(fx, `/transactions/edit?id=v126-ut-2&return_to=${encodeURIComponent(`/app?${Q}`)}`);
    return out;
  }));
}
{
  const withWords = await renderSet(USER_TEXT_ROWS);
  const neutral = await renderSet(NEUTRAL_ROWS);
  for (const path of FC2_PAGES) {
    const html = withWords[path].html;
    t.eq(withWords[path].status, 200, `FC-2 ${path} 가 열린다`);
    t.ok(!html.includes("유튜브 스마트 도구") && !html.includes("스마트 도구 아울렛 신발") && !html.includes("/smart-tools 나간 돈"), `FC-2 ${path}: 메모의 ‘프리미엄’·주소 글이 바뀌지 않는다(고치기 전 결함 글이 없다)`);
    t.eq(count(html, "스마트 도구"), count(neutral[path].html, "스마트 도구"), `FC-2 ${path}: ‘스마트 도구’ 글자 수가 낱말 없는 같은 화면과 같다(사용자 글에서 늘지 않는다)`);
  }
  for (const path of [`/app?${Q}`, `/app?tab=transactions&${Q}`, `/my/analysis?${Q}`]) {
    const html = withWords[path].html;
    t.ok(html.includes("유튜브 프리미엄") && html.includes("프리미엄 아울렛 신발"), `FC-2 ${path}: 메모 ‘유튜브 프리미엄’·‘프리미엄 아울렛 신발’ 이 그대로 보인다`);
  }
  // /smart-tools 는 큰 지출만 보이므로 52,000원 기록(메모·분류)이 나온다.
  t.ok(withWords[`/smart-tools?${Q}`].html.includes("<b>프리미엄 아울렛 신발</b><span>2026-07-07 · 프리미엄 · "), "FC-2 /smart-tools: 큰 지출의 메모·분류 ‘프리미엄’ 이 그대로 보인다");
  const tx = withWords[`/app?tab=transactions&${Q}`].html;
  t.ok(tx.includes('<option value="프리미엄">프리미엄</option>') && tx.includes('<option value="프리미엄">'), "FC-2 거래내역의 분류 고르기·목록 값도 ‘프리미엄’ 그대로다");
  t.ok(withWords.edit.status === 200 && withWords.edit.html.includes('value="프리미엄 아울렛 신발"') && withWords.edit.html.includes('value="프리미엄"') && !withWords.edit.html.includes('value="스마트 도구'), "FC-2 기록 수정 화면의 폼 값(메모·분류)도 원문 그대로다");
  const home = withWords[`/app?${Q}`].html;
  for (const memo of ["오늘 쓴 돈 ☀️ 메모", "🌱 시작가이드 처음이라면 여기부터", "/my/premium 나간 돈 💸 메모"]) t.ok(home.includes(memo), `FC-2 홈: 메모 ‘${memo}’ 가 그대로 보인다(그림 글자·주소를 빼지 않는다)`);
  t.ok(home.includes("<span>들어온 돈</span>") && home.includes("<span>나간 돈</span>") && !home.includes("<span>들어온 돈 💰</span>") && !home.includes("<span>나간 돈 💸</span>"), "FC-2 홈 카드 이름의 그림 글자는 예전처럼 뺀다(템플릿 마크업만)");
  t.ok(withWords[`/my/analysis?${Q}`].html.includes('"프리미엄","신용카드","프리미엄 아울렛 신발"'), "FC-2 소비 분석 자료(window.__INSIGHT__)의 분류·메모도 원문이다");
  // 그런 기록이 있을 때와 없을 때 ‘월말 예상 지출’ 표기가 같다(고치기 전에는 있는 달만 ‘약 117만’).
  const outlookCell = (html) => (html.match(/<span>월말 예상 지출<\/span><b>[^<]*<\/b>/) || [""])[0];
  const cockpitCell = (html) => (html.match(/<span>월말 예상 지출[^<]*<\/span><b>[^<]*<\/b>/) || [""])[0];
  const smartWith = outlookCell(withWords[`/smart-tools?${Q}`].html);
  t.ok(/<b>[\d,]+원<\/b>$/.test(smartWith), `FC-2 /smart-tools 의 월말 예상 지출은 원 단위 숫자다(${smartWith})`);
  t.eq(smartWith, outlookCell(neutral[`/smart-tools?${Q}`].html), "FC-2 /smart-tools 월말 예상 지출 표기가 낱말 있는 달·없는 달 같다");
  const cockpitWith = cockpitCell(withWords[`/my/analysis?${Q}`].html);
  t.ok(!!cockpitWith && !cockpitWith.includes("약 "), `FC-2 /my/analysis 한눈에 보기의 월말 예상 지출에 ‘약’ 이 붙지 않는다(${cockpitWith})`);
  t.eq(cockpitWith, cockpitCell(neutral[`/my/analysis?${Q}`].html), "FC-2 /my/analysis 월말 예상 지출 표기가 낱말 있는 달·없는 달 같다");
  const smartNeutral = neutral[`/smart-tools?${Q}`].html;
  t.ok(!smartNeutral.includes('class="metricBasis"') && !withWords[`/smart-tools?${Q}`].html.includes('class="metricBasis"'), "FC-2 /smart-tools 에 사용자 글로만 들어가던 기준 줄이 어느 쪽에도 없다");
}
// 남겨 둔 치환은 템플릿 마크업에만 걸린다: 가져오기 안내는 예전처럼 JSON 을 적고, 같은 글을 담은 사용자 메모는 바뀌지 않는다.
await withClock("2026-07-20", () => fixture(async (fx) => {
  addRows(fx, [{ id: "v126-ut-csv", amount: 1000, category: "기타", memo: "CSV·TSV·TXT·엑셀의 여러 시트 정리", date: "2026-07-13" }]);
  const backup = (await page(fx, `/my/backup?${Q}`)).html;
  t.ok(backup.includes("<p>CSV·TSV·TXT·JSON·엑셀의 여러 시트") && backup.includes('class="fileStatus">CSV·TSV·TXT·JSON은 서버에서 바로 읽습니다.'), "FC-2 /my/backup 가져오기 안내 두 줄은 예전과 같다(JSON 포함)");
  const home = (await page(fx, `/app?${Q}`)).html;
  t.ok(home.includes("CSV·TSV·TXT·엑셀의 여러 시트 정리"), "FC-2 같은 글을 담은 사용자 메모는 바뀌지 않는다");
  const guide = await page(fx, "/subscription-cleanup", { cookie: "" });
  t.ok(guide.status === 200 && guide.html.includes("유료 전환되도록"), "FC-2 ‘유료 전환’ 이 든 공개 안내 글은 그대로다");
}));
// FC-2(2차) 성질 검사: 후처리가 찾는 글(남긴 치환·뺀 치환 모두)을 메모·분류·결제수단에 넣고 실제 화면을 그린다.
// 표식(M07x … M07y)이 나오는 모든 자리에서 그 사이 글이 원문이거나 원문을 이스케이프한 꼴이어야 한다(화면이 원래 자르는 곳은 자른 앞부분).
// 고치기 전 번들(9c3fa818)에서는 같은 장면에서 363자리의 사용자 글이 바뀌었다(‘프리미엄’→‘스마트 도구’, 옛 안내 문장, 뷰포트 글 등).
const FC2_KEYS = [
  "프리미엄 1차 베타", "프리미엄 베타", "프리미엄", "프리미엄 1차 개발 예정", "프리미엄 1차 개발 순서",
  "실제 데이터에서 가치와 정확도를 검증한 뒤 유료 전환합니다.", "유료 전환", "현재 결제 기능은 연결하지 않았습니다.", "월말 예상 지출", "절약 후보",
  "운영 원칙", "밈카드와 카드 실적 기능은", "현재 동작하는 스마트 도구", "컬럼: 날짜, 구분, 금액, 분류, 내용, 결제수단, 출처, 기록ID", "/my/premium",
  "🌱 시작가이드", "처음이라면 여기부터", "오늘 쓴 돈 ☀️",
  "CSV·TSV·TXT·엑셀의 여러 시트", "CSV·TSV·TXT는 서버에서 바로 읽습니다.", "들어온 돈 💰", "나간 돈 💸",
  ",maximum-scale=1", ".sep{text-align:center;color:#7b8494;", "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js",
  "카카오 로그인 없이도 이름과 개인 접속코드로 시작할 수 있습니다.", "가계부가 연결되면 시작가이드에서 월 수입, 예산, 분류·키워드, 카드·현금·통장, 정기지출을 순서대로 설정하면 됩니다.",
  "처음에는 기능을 많이 설명하기보다 “가계부 생성 → 예산 → 결제수단 → 정기지출 → 카카오 기록 → 분석 확인” 흐름만 안내합니다. 오류가 나면 안전화면과 백업 가이드를 먼저 보여줍니다.",
  "가계부에 접속하세요.", "현재 브라우저에 로그인 세션이 없으면 이 화면이 표시됩니다. 카카오 로그인이 아직 준비되지 않았으면 아래 이름 + 개인 접속코드로 접속하세요.",
  "로컬 설정 일치 · 로그인 버튼 표시", "이 화면에서는 카카오 관리자센터 등록 여부까지 자동 확인할 수 없습니다.",
  "일반 사용자가 매일 쓰는 메뉴만 모았습니다. 운영/점검/배포/진단 메뉴는 이 화면에 노출하지 않고 운영센터에서만 관리합니다.",
  "추천 흐름: 홈·입력 → 기록 보기 → 예산알림 → 분석 → 백업·복구. 새 모임이나 여행은 가계부 전환·추가에서 만드세요.",
  "재산세, 자동차세, 자동차보험처럼 반기·연단위로 나가는 큰돈을 미리 준비합니다. 3개월/2개월/1개월 전 기준으로 준비 알림을 보여줍니다.",
  "💛", "🏠", "📄", "📊", '<a class="btn" style="margin-top:10px" href=', "<span>들어온 돈 💰</span>", "<p>CSV·TSV·TXT·엑셀의 여러 시트",
  '<i>🏠</i>', '<button type="submit">이 가계부 영구 삭제</button>', 'id="budgetPlanForm">',
];
const FC2_FIELDS = { memo: "M", category: "C", payment_method: "P" };
const FC2_PROPERTY_PAGES = [`/app?${Q}`, `/app?tab=transactions&${Q}`, `/app?tab=calendar&${Q}`, `/m?${Q}`, `/my/analysis?${Q}`, `/reports?${Q}`, `/annual-report?year=2026&household_id=${HOME}`, "/transactions/edit?id=v126-prop-03", "/transactions/edit?id=v126-prop-25"];
await withClock("2026-07-20", () => fixture(async (fx) => {
  const tag = (kind, i, end) => `${FC2_FIELDS[kind]}${String(i).padStart(2, "0")}${end}`;
  const valueOf = (kind, i) => `${tag(kind, i, "x")} ${FC2_KEYS[i]} ${tag(kind, i, "y")}`;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const json = (s) => JSON.stringify(s).slice(1, -1);
  const encodings = [(s) => s, esc, (s) => esc(s).replace(/&#39;/g, "&#x27;"), json, (s) => json(s).replace(/</g, "\\u003c"), (s) => esc(json(s)), encodeURIComponent, (s) => esc(encodeURIComponent(s))];
  const stamp = "2026-07-06T03:00:00.000Z";
  FC2_KEYS.forEach((_, i) => fx.db.transactions.push({ id: `v126-prop-${String(i).padStart(2, "0")}`, household_id: HOME, user_id: "user-bin", transaction_date: `2026-07-${String(1 + (i % 19)).padStart(2, "0")}`, type: "expense", amount: 1000 + i * 1000, category: valueOf("category", i), memo: valueOf("memo", i), payment_method: valueOf("payment_method", i), source: "web", raw_text: `기록 ${i}`, created_at: stamp, updated_at: stamp }));
  const problems = [], covered = new Set(), clipped = {};
  let seen = 0;
  for (const path of FC2_PROPERTY_PAGES) {
    const r = await page(fx, path);
    if (r.status !== 200) { problems.push(`${path} ${r.status}`); continue; }
    FC2_KEYS.forEach((_, i) => {
      for (const kind of Object.keys(FC2_FIELDS)) {
        const forms = encodings.map((encode) => encode(valueOf(kind, i)));
        for (let at = r.html.indexOf(tag(kind, i, "x")); at >= 0; at = r.html.indexOf(tag(kind, i, "x"), at + 1)) {
          seen += 1; covered.add(`${kind}${i}`);
          if (forms.some((form) => r.html.startsWith(form, at))) continue;
          // 화면이 원래 글을 자르는 곳(소비 분석 자료의 분류·결제수단 40자): 원문 앞부분이 그대로이고 바로 뒤가 글의 끝이면 바뀐 것이 아니다.
          const kept = Math.max(...forms.map((form) => { let n = 0; while (n < form.length && r.html[at + n] === form[n]) n += 1; return n; }));
          if (kept >= 12 && /^["<…]/.test(r.html[at + kept] || "")) { clipped[path.split("?")[0]] = (clipped[path.split("?")[0]] || 0) + 1; continue; }
          problems.push(`${path.split("&")[0]} ${kind}#${i} ${JSON.stringify(r.html.slice(at, at + 70))}`);
        }
      }
    });
  }
  t.ok(seen >= 700 && covered.size === FC2_KEYS.length * 3, `FC-2 성질: 화면 ${FC2_PROPERTY_PAGES.length}곳에서 사용자 글 ${seen}자리를 봤고 낱말 ${FC2_KEYS.length}개 × 메모·분류·결제수단이 모두 한 번 이상 나왔다(${covered.size})`);
  t.eq(problems.slice(0, 8).join(" | "), "", `FC-2 성질: 후처리가 찾는 어떤 글을 넣어도 사용자 글이 원문(이스케이프만)으로 나온다(바뀐 자리 ${problems.length})`);
  t.ok(Object.keys(clipped).every((path) => path === "/my/analysis"), `FC-2 성질: 원문 앞부분만 나온 자리는 소비 분석 자료(분류·결제수단 40자)뿐이다(${JSON.stringify(clipped)})`);
}));
// 남긴 문장 치환은 템플릿 태그까지 붙여 찾으므로 템플릿 글은 예전처럼 바뀐다.
await fixture(async (fx) => {
  const guide = await page(fx, "/start-guide", { cookie: "" });
  t.ok(guide.html.includes("<p>가계부를 만들거나 참여한 뒤 단톡방 연결과 첫 기록까지 차례로 진행해보세요.</p>") && !guide.html.includes("카카오 로그인 없이도"), "FC-2 공개 /start-guide 안내 문장은 예전처럼 바뀐다(<p> 태그까지 찾음)");
  const beta = await page(fx, "/beta-start", { cookie: "" });
  t.ok(beta.html.includes('<p class="muted">처음에는 ‘가계부 생성·참여 → 초대·승인 → 단톡방 연결(선택) → 기록 방법 → 첫 기록’까지만 안내합니다.') && !beta.html.includes("처음에는 기능을 많이 설명하기보다"), "FC-2 /beta-start 운영 기준 문장은 예전처럼 바뀐다(<p class=\"muted\"> 까지 찾음)");
});
// FC-2(3차): ‘카카오 로그인 점검’ 화면 치환의 예전 조건(…</h1>)은 가계부 이름으로도 켜졌다. 조건을 그 화면의 <title> 끝으로 옮겼다.
// 고치기 전(과 2차)에는 메모 ‘로컬 설정 일치 · 로그인 버튼 표시’ 가 ‘…카카오 로그인 버튼 표시됨’ 으로, 결제수단 문장 끝에 ‘KOE006’ 안내가 붙었고,
// 분류 ‘Redirect URI 형식’(홈·/m 의 <b>…</b>)이 ‘KAKAO_REDIRECT_URI 명시값’ 으로 보였다(태그까지 붙여 찾아도 사용자 글이 그 꼴이 된다).
await withClock("2026-07-20", () => fixture(async (fx) => {
  fx.db.households.find((row) => row.id === HOME).name = "카카오 로그인 점검";
  const stamp = "2026-07-08T03:00:00.000Z";
  fx.db.transactions.push(
    { id: "v126-kl-1", household_id: HOME, user_id: "user-bin", transaction_date: "2026-07-08", type: "expense", amount: 7000, category: "기타", memo: "로컬 설정 일치 · 로그인 버튼 표시", payment_method: "이 화면에서는 카카오 관리자센터 등록 여부까지 자동 확인할 수 없습니다.", source: "web", raw_text: "기록", created_at: stamp, updated_at: stamp },
    { id: "v126-kl-2", household_id: HOME, user_id: "user-bin", transaction_date: "2026-07-09", type: "expense", amount: 8000, category: "Redirect URI 형식", memo: "마지막 외부 확인", payment_method: "현금", source: "web", raw_text: "기록", created_at: stamp, updated_at: stamp },
  );
  for (const path of [`/app?${Q}`, `/app?tab=transactions&${Q}`, `/m?${Q}`]) {
    const html = (await page(fx, path)).html;
    t.ok(html.includes("카카오 로그인 점검</h1>") && !html.includes(" · 카카오 로그인 점검</title>"), `FC-2(3차) ${path}: 가계부 이름이 예전 조건(…</h1>)은 만들지만 제목은 그 꼴로 끝나지 않는다(장면 확인)`);
    t.ok(!/카카오 로그인 버튼 표시됨|KOE006|KAKAO_REDIRECT_URI 명시값|로컬 구성만 확인한 상태입니다/.test(html), `FC-2(3차) ${path}: 메모·결제수단·분류의 점검 화면 문구가 하나도 바뀌지 않는다`);
  }
}));
{
  const code = read("src/modules/web/html-postprocess.js");
  t.ok(code.includes('if (source.includes(" · 카카오 로그인 점검</title>")) {') && !code.includes('source.includes("카카오 로그인 점검</h1>")'), "FC-2(3차) ‘카카오 로그인 점검’ 화면 치환의 조건은 그 화면의 <title> 끝이다(사용자 글로 만들 수 있는 …</h1> 이 아님)");
}
{
  const source = read("src/modules/web/html-postprocess.js");
  const start = source.indexOf("\nfunction normalizeUserFacingUi(");
  const end = start < 0 ? -1 : source.indexOf("\n}\n", start);
  t.ok(start > 0 && end > start + 2000, "FC-2 normalizeUserFacingUi 본문을 찾았다(이름이나 자리가 바뀌면 여기서 실패한다)");
  const code = source.slice(start, end).split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  const searchKeys = [...code.matchAll(/source\.replace(?:All)?\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/(?:[^/\\\n]|\\.)+\/[a-z]*|[A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  // 3차: 예외 목록은 비었다. ‘카카오 로그인 점검’ 화면의 두 문장 치환도 그 화면의 태그(<td>…</td>·…</p>)까지 붙여 찾는다.
  const plain = searchKeys.filter((key) => /^[A-Za-z_$]/.test(key) ? key !== "oldPublicSteps" : key.startsWith("/") ? !/^\/\(?</.test(key) : !/[<>]|="/.test(key));
  t.ok(searchKeys.length >= 40, `FC-2 normalizeUserFacingUi 의 치환 ${searchKeys.length}개를 읽었다`);
  t.eq(plain.join(" | "), "", "FC-2 normalizeUserFacingUi 의 치환은 예외 없이 모두 템플릿 태그·속성까지 붙여 찾는다(사용자 글은 이스케이프되어 그 모양을 만들 수 없다)");
  t.ok(!/프리미엄|유료 전환|시작가이드"|오늘 쓴 돈 ☀️|\/my\\?\/premium|maximum-scale|7b8494|가계부에 접속하세요|매일 쓰는 메뉴만|홈·입력 → 기록 보기|반기·연단위로/.test(code), "FC-2 뺀 치환(프리미엄·유료 전환·그림 글자·주소·뷰포트·옛 안내 문장)이 코드에 남아 있지 않다");
}

// ── FC-3 www 정본 308 은 정본 호스트 안에 머문다 ───────────────────────────────────
await fixture(async (fx) => {
  const call = async (raw, env = fx.env) => {
    const response = await app.fetch(new Request(raw, { redirect: "manual" }), env, ctx);
    return { status: response.status, location: response.headers.get("location") || "" };
  };
  // 고치기 전 만들던 방식: 경로 글을 정본 주소에 이어 붙여 다시 읽으면 `//example.org/x` 는 다른 호스트다.
  t.eq(new URL("//example.org/x", BASE).host, "example.org", "FC-3 결함 원리: 경로 `//example.org/x` 를 주소로 다시 읽으면 다른 사이트가 된다");
  const shapes = [
    ["https://www.malhaebook.com//example.org/x", "https://malhaebook.com//example.org/x"],
    [String.raw`https://www.malhaebook.com/\example.org/x`, "https://malhaebook.com//example.org/x"],
    ["https://www.malhaebook.com/%5Cexample.org/x", "https://malhaebook.com/%5Cexample.org/x"],
    ["https://www.malhaebook.com/..//example.org/x?a=1", "https://malhaebook.com//example.org/x?a=1"],
    ["http://www.malhaebook.com//example.org/x", "https://malhaebook.com//example.org/x"],
    ["https://www.malhaebook.com///example.org", "https://malhaebook.com///example.org"],
    ["http://malhaebook.com//example.org/x?b=2", "https://malhaebook.com//example.org/x?b=2"],
  ];
  for (const [raw, expected] of shapes) {
    const r = await call(raw);
    t.eq(r.status, 308, `FC-3 ${raw} 는 308 이다`);
    t.eq(r.location, expected, `FC-3 ${raw} → 정본 호스트 안의 같은 경로(${r.location})`);
    t.eq(new URL(r.location).host, "malhaebook.com", `FC-3 ${raw} 의 목적지 호스트는 정본이다`);
  }
  // CANONICAL_REDIRECT=1 로 옮기는 다른 호스트도 같은 규칙이다.
  const other = await call("https://legacy.example.net//example.org/x", { ...fx.env, CANONICAL_REDIRECT: "1" });
  t.ok(other.status === 308 && new URL(other.location).host === "malhaebook.com" && other.location === "https://malhaebook.com//example.org/x", `FC-3 다른 호스트를 옮길 때도 정본 안에 머문다(${other.location})`);
  // 정상 경로·쿼리·http→https 는 예전과 같다.
  for (const [raw, expected] of [
    ["https://www.malhaebook.com/budget-guide?x=1", "https://malhaebook.com/budget-guide?x=1"],
    ["https://www.malhaebook.com/guides?q=%EA%B0%80%EA%B3%84%EB%B6%80&a=1&a=2", "https://malhaebook.com/guides?q=%EA%B0%80%EA%B3%84%EB%B6%80&a=1&a=2"],
    ["http://www.malhaebook.com/guides?a=1", "https://malhaebook.com/guides?a=1"],
    ["http://malhaebook.com/faq?Q=A", "https://malhaebook.com/faq?Q=A"],
    ["https://www.malhaebook.com/", "https://malhaebook.com/"],
    ["https://www.malhaebook.com/my?month=2026-10&return_to=%2Fapp%3Fview%3Dcalendar", "https://malhaebook.com/my?month=2026-10&return_to=%2Fapp%3Fview%3Dcalendar"],
  ]) t.eq((await call(raw)).location, expected, `FC-3 정상 주소 ${raw} 는 예전과 같은 곳으로 간다`);
  const apex = await call("https://malhaebook.com//example.org/x");
  t.ok(apex.status !== 308 && !apex.location.startsWith("https://example.org"), `FC-3 정본(https) 자체는 옮기지 않는다(${apex.status})`);
});

// ── FC-5 예산 읽기 실패: 그 칸만 ‘불러오지 못했어요’ ─────────────────────────────────
// 고치기 전(verify D p3): 예산 GET 500 이면 소비 분석은 ‘월 예산 미설정 … 남은 예산 설정 전 … 예산을 설정하면 …’,
// 홈은 ‘예산 미설정 · 예산 없음 · 예산 안 정한 지출 100,000원 … 예산을 설정하면 하루 기준이 생겨요’ 라고 했다.
{
  const NOV = "household_id=house-home&month=2026-11";
  const prepare = (fx, { budgets = true } = {}) => {
    fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HOME);
    fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((row) => row.household_id !== HOME);
    if (budgets) {
      fx.db.accountbook_budgets.push({ id: "v126-b-total", household_id: HOME, month: "2026-11", category: "__total", amount: 600000, created_at: "2026-11-01T00:00:00.000Z" });
      fx.db.accountbook_budgets.push({ id: "v126-b-food", household_id: HOME, month: "2026-11", category: "식비", amount: 400000, created_at: "2026-11-01T00:00:00.000Z" });
    }
    for (const day of ["02", "06", "09", "13"]) fx.db.transactions.push({ id: `v126-nov-${day}`, household_id: HOME, user_id: "user-bin", transaction_date: `2026-11-${day}`, type: "expense", amount: 25000, category: "식비", memo: `장보기 ${day}`, payment_method: "신용카드", source: "web", raw_text: `장보기 25000`, created_at: `2026-11-${day}T03:00:00.000Z`, updated_at: `2026-11-${day}T03:00:00.000Z` });
  };
  const render = (mode) => withClock("2026-11-17", () => fixture(async (fx) => {
    prepare(fx, { budgets: mode !== "none" });
    let budgetGets = 0;
    const restore = mode === "fail" ? intercept(({ url, method }) => {
      if (url.hostname === "mock.supabase.co" && method === "GET" && url.pathname === "/rest/v1/accountbook_budgets") { budgetGets += 1; return failure(500, "simulated budgets outage"); }
      return undefined;
    }) : () => {};
    try {
      const analysis = await page(fx, `/my/analysis?${NOV}`);
      const home = await page(fx, `/app?${NOV}`);
      return { analysis, home, budgetGets };
    } finally { restore(); }
  }));
  const normal = await render("ok"), failed = await render("fail"), none = await render("none");
  t.ok(failed.budgetGets >= 2, `FC-5 장면: 예산 GET 만 500 으로 실패시켰다(${failed.budgetGets}회)`);
  t.ok(normal.analysis.html.includes("월 400,000원 기준") && normal.analysis.html.includes("<span>남은 예산</span><b>300,000원</b>"), "FC-5 정상일 때 소비 분석은 예산 400,000원·남은 예산 300,000원");
  t.ok(normal.home.html.includes('data-ab-num="300000" data-ab-num-unit="원">300,000</b>'), "FC-5 정상일 때 홈 카드는 남은 300,000원");
  // 소비 분석: 같은 구성, 예산 세 칸의 글만 다르다.
  const fa = failed.analysis;
  t.eq(fa.status, 200, "FC-5 예산을 못 읽어도 소비 분석은 오류 화면이 아니다(200)");
  t.ok(fa.html.includes("<p>예산을 불러오지 못했어요</p>") && fa.html.includes("<span>남은 예산</span><b>확인 불가</b>") && fa.html.includes("<p>예산을 불러오지 못해 소비 속도는 안내하지 않았어요. 잠시 뒤 새로고침해 주세요.</p>"), "FC-5 소비 분석의 예산 칸은 ‘예산을 불러오지 못했어요’·‘확인 불가’·안내 문장");
  t.ok(!fa.html.includes("월 예산 미설정") && !fa.html.includes("<b>설정 전</b>") && !fa.html.includes("예산을 설정하면 현재 소비 속도"), "FC-5 소비 분석에 ‘미설정·설정 전·예산을 설정하면’ 이 없다(고치기 전 결함 글)");
  const backAnalysis = fa.html
    .replace("<p>예산을 불러오지 못했어요</p>", "<p>월 예산 미설정</p>")
    .replace("<span>남은 예산</span><b>확인 불가</b>", "<span>남은 예산</span><b>설정 전</b>")
    .replace("<p>예산을 불러오지 못해 소비 속도는 안내하지 않았어요. 잠시 뒤 새로고침해 주세요.</p>", "<p>예산을 설정하면 현재 소비 속도와 남은 하루 한도를 함께 안내합니다.</p>");
  t.eq(backAnalysis, none.analysis.html, "FC-5 소비 분석: 세 칸의 글을 되돌리면 예산이 정말 없는 달의 화면과 바이트가 같다(구성 그대로, R3)");
  t.ok(none.analysis.html.includes("<p>월 예산 미설정</p>") && none.analysis.html.includes("<span>남은 예산</span><b>설정 전</b>"), "FC-5 예산이 정말 없는 달은 예전처럼 ‘월 예산 미설정·설정 전’");
  // 홈: 예산 카드 칸만 다르다.
  const fh = failed.home;
  t.eq(fh.status, 200, "FC-5 예산을 못 읽어도 홈은 오류 화면이 아니다(200)");
  t.ok(fh.html.includes('<div class="homeBudgetAmount"><b>확인 불가</b></div>') && fh.html.includes('<div class="homeBudgetFoot"><span>예산을 불러오지 못했어요</span><span></span></div>'), "FC-5 홈 예산 카드는 ‘확인 불가’·‘예산을 불러오지 못했어요’");
  t.ok(!fh.html.includes("<b>예산 미설정</b>") && !fh.html.includes(">예산 없음<") && !fh.html.includes("예산 안 정한 지출 100,000원") && !fh.html.includes("예산을 설정하면 하루 기준이 생겨요"), "FC-5 홈에 ‘예산 미설정·예산 없음·예산 안 정한 지출·설정 안내’ 가 없다(고치기 전 결함 글)");
  // 2차: 같은 화면의 ‘예산 항목’ 카드와 빠른 입력 아래 글도 ‘설정하라’ 고 하지 않는다. 입력 중 안내(클라이언트)는 범위가 ‘알 수 없음’(false)이면 ‘저장 후 확인’ 을 쓴다.
  t.ok(fh.html.includes('<b>확인 불가</b><div class="homeReportBars"></div><small>예산을 불러오지 못했어요</small>') && fh.html.includes('data-bsc="[20261117,false]"') && fh.html.includes(">예산을 불러오지 못해 남은 예산은 보여 드리지 못해요</p>"), "FC-5(2차) 홈의 예산 항목 카드는 ‘확인 불가’, 빠른 입력 아래 글은 ‘불러오지 못해…’, 입력 범위는 알 수 없음(false)");
  t.ok(!fh.html.includes("<b>미설정</b>") && !fh.html.includes("분류별 예산을 정하면") && !fh.html.includes("예산을 설정하면"), "FC-5(2차) 홈 어디에도 ‘미설정·예산을 정하면·예산을 설정하면’ 이 없다");
  const noneHome = none.home.html;
  const planStart = noneHome.indexOf('<div class="homeDailyPlan homeDailyPlanEmpty">');
  const planEnd = planStart < 0 ? -1 : noneHome.indexOf("</div>", planStart) + 6;
  t.ok(planStart > 0 && noneHome.includes("예산을 설정하면 하루 기준이 생겨요"), "FC-5 예산이 정말 없는 달의 홈은 예전처럼 설정 안내 링크가 있다");
  t.ok(noneHome.includes("<b>미설정</b><div class=\"homeReportBars\"></div><small>분류별 예산을 정하면 넘치는 항목을 미리 알려드려요</small>") && noneHome.includes('data-bsc="[20261117,0]"') && noneHome.includes(">예산을 설정하면 저장 후 남는 돈이 함께 보여요</p>"), "FC-5 예산이 정말 없는 달의 홈 카드·입력 아래 글은 예전 그대로");
  t.eq(revertFailedHomeV126(fh.html, "100,000원"), noneHome.slice(0, planStart) + noneHome.slice(planEnd), "FC-5 홈: 실패 글 다섯 칸을 되돌리고 설정 안내 한 줄만 빼면 예산이 없는 달의 홈과 바이트가 같다");
}
// FC-5 2차: 앞달·다음 달(시계 2026-11-17)도 같다 — 홈은 다섯 칸, 소비 분석은 세 칸만 다르다.
function revertFailedHomeV126(html, spent) {
  return html
    .replace('<div class="homeBudgetAmount"><b>확인 불가</b></div>', '<div class="homeBudgetAmount"><b>예산 미설정</b></div>')
    .replace('<div class="homeBudgetFoot"><span>예산을 불러오지 못했어요</span><span></span></div>', `<div class="homeBudgetFoot"><span>예산 없음</span><span>예산 안 정한 지출 ${spent}</span></div>`)
    .replace('<b>확인 불가</b><div class="homeReportBars"></div><small>예산을 불러오지 못했어요</small>', '<b>미설정</b><div class="homeReportBars"></div><small>분류별 예산을 정하면 넘치는 항목을 미리 알려드려요</small>')
    .replace(/data-bsc="\[(\d{8}),false\]"/, 'data-bsc="[$1,0]"')
    .replace(">예산을 불러오지 못해 남은 예산은 보여 드리지 못해요</p>", ">예산을 설정하면 저장 후 남는 돈이 함께 보여요</p>");
}
for (const month of ["2026-10", "2026-12"]) {
  const render = (mode) => withClock("2026-11-17", () => fixture(async (fx) => {
    fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HOME);
    fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((row) => row.household_id !== HOME);
    if (mode !== "none") for (const [category, amount] of [["__total", 600000], ["식비", 400000]]) fx.db.accountbook_budgets.push({ id: `v126-b-${month}-${category}`, household_id: HOME, month, category, amount, created_at: "2026-10-01T00:00:00.000Z" });
    fx.db.transactions.push({ id: `v126-${month}`, household_id: HOME, user_id: "user-bin", transaction_date: `${month}-05`, type: "expense", amount: 25000, category: "식비", memo: "장보기", payment_method: "신용카드", source: "web", raw_text: "장보기 25000", created_at: `${month}-05T03:00:00.000Z`, updated_at: `${month}-05T03:00:00.000Z` });
    const restore = mode === "fail" ? intercept(({ url, method }) => (url.hostname === "mock.supabase.co" && method === "GET" && url.pathname === "/rest/v1/accountbook_budgets") ? failure(500, "simulated budgets outage") : undefined) : () => {};
    try { return { home: await page(fx, `/app?household_id=${HOME}&month=${month}`), analysis: await page(fx, `/my/analysis?household_id=${HOME}&month=${month}`) }; } finally { restore(); }
  }));
  const failed = await render("fail"), none = await render("none");
  const home = failed.home.html, noneHome = none.home.html;
  t.ok(failed.home.status === 200 && failed.analysis.status === 200, `FC-5(2차) ${month}: 예산을 못 읽어도 홈·소비 분석이 열린다`);
  t.ok(!home.includes("예산 미설정") && !home.includes(">예산 없음<") && !home.includes("<b>미설정</b>") && !home.includes("분류별 예산을 정하면") && !home.includes("예산을 설정하면") && home.includes('<div class="homeBudgetAmount"><b>확인 불가</b></div>'), `FC-5(2차) ${month} 홈: ‘확인 불가’ 이고 ‘미설정·정하면·설정하면’ 이 없다`);
  const planStart = noneHome.indexOf('<div class="homeDailyPlan homeDailyPlanEmpty">');
  const planEnd = planStart < 0 ? -1 : noneHome.indexOf("</div>", planStart) + 6;
  t.eq(revertFailedHomeV126(home, "25,000원"), planStart < 0 ? noneHome : noneHome.slice(0, planStart) + noneHome.slice(planEnd), `FC-5(2차) ${month} 홈: 다섯 칸을 되돌리고 설정 안내 한 줄을 빼면 예산이 없는 달과 바이트가 같다`);
  const fa = failed.analysis.html;
  t.ok(!fa.includes("월 예산 미설정") && !fa.includes("<b>설정 전</b>") && !fa.includes("예산을 설정하면") && fa.includes("<p>예산을 불러오지 못했어요</p>"), `FC-5(2차) ${month} 소비 분석: ‘불러오지 못했어요’ 이고 ‘미설정·설정 전·설정하면’ 이 없다`);
  const backAnalysis = fa
    .replace("<p>예산을 불러오지 못했어요</p>", "<p>월 예산 미설정</p>")
    .replace("<span>남은 예산</span><b>확인 불가</b>", "<span>남은 예산</span><b>설정 전</b>")
    .replace("<p>예산을 불러오지 못해 소비 속도는 안내하지 않았어요. 잠시 뒤 새로고침해 주세요.</p>", "<p>예산을 설정하면 현재 소비 속도와 남은 하루 한도를 함께 안내합니다.</p>");
  t.eq(backAnalysis, none.analysis.html, `FC-5(2차) ${month} 소비 분석: 세 칸을 되돌리면 예산이 없는 달과 바이트가 같다(구성 그대로, R3)`);
}

// ── FC-6 가져오기 금액 ‘12.000원’ 은 12원이 아니다 ─────────────────────────────────
{
  // 고치기 전 식: 소수점 뒤 0 의 개수를 보지 않아 ‘12.000’ 이 12 였다.
  t.ok(/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test("12.000") && Number("12.000") === 12, "FC-6 결함 원리: 옛 식은 ‘12.000’ 을 받아 12 로 읽었다");
  const parse = (amount) => parseFlexibleImportRecords(`날짜,금액,내용\n2026-07-01,"${amount}",커피`, HOME, "user-bin", {});
  for (const amount of ["12.000원", "12.000", "5.000", "₩12.000", "1,000.000", "12.0000"]) {
    const r = parse(amount);
    t.ok(r.rows.length === 0 && r.rejected.length === 1 && r.rejected[0].reason_code === "invalid_amount", `FC-6 ‘${amount}’ 은 금액으로 확정하지 않고 ‘금액 형식을 해석하지 못함’ 으로 둔다(${r.rows.map((x) => x.amount).join(",") || r.rejected[0]?.reason_code})`);
  }
  for (const [amount, expected] of [["12000.00", 12000], ["12,000.00", 12000], ["12000.0", 12000], ["12,000원", 12000], ["12000", 12000], ["₩12,000", 12000]]) {
    const r = parse(amount);
    t.ok(r.rows.length === 1 && r.rows[0].amount === expected && r.rejected.length === 0, `FC-6 ‘${amount}’ 은 예전처럼 ${expected}원(${r.rows[0]?.amount})`);
  }
  const tsv = parseFlexibleImportRecords("날짜\t금액\t내용\n2026-07-01\t12.000원\t점심\n2026-07-02\t8000.00\t커피", HOME, "user-bin", {});
  t.ok(tsv.rows.length === 1 && tsv.rows[0].amount === 8000 && tsv.rejected.length === 1 && tsv.rejected[0].row_number === 2, "FC-6 TSV 도 같다(‘12.000원’ 줄만 되묻고 ‘8000.00’ 은 8000원)");
  // 2차: 머리글 없는 표(쉼표·탭). 고치기 전에는 칸 읽기가 ‘.0…’ 끝을 떼어 ‘12.000원’ 을 12원으로 읽어 저장 대기에 올렸다(미리 보기 ready).
  //   1차에서 칸 읽기가 그 꼴을 받지 않게 되자 그 줄이 자연어 해석으로 넘어갔다(그래서 2차부터 되묻는다).
  // 4차: 되묻는 칸은 칸 읽기가 통화 표시·괄호·부호를 뗀 숫자가 점 금액 꼴인 칸(dotted)이다. 꼴은 둘이다.
  //   (가) 천 단위 점 꼴 12.000·1.200.000(맨 앞 묶음은 0 아님)
  //   (나) 고치기 전 칸 읽기가 ‘.0…’ 끝으로만 받던 꼴 중 0 이 셋 이상(12000.000·1,000.000·12.0000)
  //  - 그 칸뿐이면 머리글 있는 표와 같은 ‘금액 형식을 해석하지 못함’(invalid_amount)이다.
  //  - 읽을 수 있는 금액 칸이 함께 있으면 금액 후보가 둘이라 ‘금액 후보가 여러 개’(ambiguous_amount)다.
  //    고치기 전에도 그 칸을 12·5 로 읽어 같은 답이었다. 머리글 있는 표도 금액 칸 하나를 읽지 못하면 다른 금액 칸으로 저장하지 않는다.
  //  - 점이 찍힌 다른 칸(전화번호·환율·좌표·무게 0.500)은 이 꼴이 아니다. 고치기 전처럼 남은 금액으로 저장한다(독립 검토 2차의 예 그대로).
  //  - 3차는 칸 원문에 대고 판정해서 ‘(12.000)’·‘△12.000’ 환불을 자연어 해석으로 넘겼다. 그 결과 부호가 사라진 12,000원 지출이 저장 대기에 올랐다.
  //    ‘12000.000,25000원’ 같은 줄은 그 칸을 빼고 25,000원으로 저장했다. 독립 검토 3차가 이를 찾았다.
  const outcome = (text) => { const r = parseFlexibleImportRecords(text, HOME, "user-bin", {}); return r.rows.length ? `rows:${r.rows.map((x) => x.amount).join("/")}` : `rejected:${r.rejected.map((x) => x.reason_code).join("/")}`; };
  const full = (text) => { const r = parseFlexibleImportRecords(text, HOME, "user-bin", {}); return r.rows.length ? r.rows.map((x) => `${x.type}:${x.amount}:${x._import_needs_confirmation ? "확인" : "ready"}`).join("/") : `rejected:${r.rejected.map((x) => x.reason_code).join("/")}`; };
  const csvCell = (x) => (/[,"]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
  // [칸, 고치기 전 머리글 없는 결과]
  for (const [cell, main] of [
    ["12000.000", "12,000원 ready"], ["1,000.000", "1,000원 ready"], ["12.0000", "12원 ready"], ["12.000KRW", "12원 ready"], ["12.000 won", "12원 ready"],
    ["(12.000)", "+12원 확인"], ["12.000-", "+12원 확인"], ["△12.000", "+12원 확인"], ["-₩12.000", "+12원 확인"], ["１２．０００원", "12원 ready"],
  ]) {
    t.eq(full(`2026-07-01,커피,${csvCell(cell)}`), "rejected:invalid_amount", `FC-6(4차) 머리글 없는 CSV 칸 ${JSON.stringify(cell)} 은 자연어로 넘기지 않고 되묻는다(고치기 전 ${main}, 3차는 자연어 결과)`);
    t.eq(full(`2026-07-01\t커피\t${cell}`), "rejected:invalid_amount", `FC-6(4차) 머리글 없는 TSV 칸 ${JSON.stringify(cell)} 도 같다`);
    t.eq(full(`날짜,내용,금액\n2026-07-01,커피,${csvCell(cell)}`), "rejected:invalid_amount", `FC-6(4차) 머리글 있는 표의 같은 칸 ${JSON.stringify(cell)} 도 invalid_amount 라 두 길이 같다`);
    t.eq(full(`2026-07-01,커피,${csvCell(cell)},25000원`), "rejected:ambiguous_amount", `FC-6(4차) ${JSON.stringify(cell)} 옆에 25000원이 있으면 고치기 전처럼 ‘금액 후보가 여러 개’(3차는 25,000원 저장 대기)`);
  }
  // 칸 읽기는 작은따옴표(엑셀 글자 표시)를 떼지 않는다. 그래서 ‘'12.000’ 은 점 금액 칸이 아니고 고치기 전과 같다. 두 길이 다른 것도 고치기 전부터다.
  t.eq(full("2026-07-01,커피,'12.000"), "expense:12000:ready", "FC-6(4차) ‘'12.000’ 머리글 없는 줄은 고치기 전처럼 자연어 해석의 12,000원이다");
  t.eq(full("날짜,내용,금액\n2026-07-01,커피,'12.000"), "rejected:invalid_amount", "FC-6(4차) 같은 칸이 머리글 있는 표에서는 고치기 전처럼 invalid_amount 다");
  // 받아들인 대가: 소수 세 자리 수치 칸(무게·원주율·경도)은 천 단위 점 꼴과 구별할 수 없다. 그래서 진짜 금액 옆에 있으면 되묻는다(고치기 전에는 25,000원 저장 대기였다).
  for (const text of ["2026-07-01,정육점,1.500,25000원", "2026-07-01,책,3.141,25000원", "2026-07-01,주유,126.978,25000원"]) {
    t.eq(full(text), "rejected:ambiguous_amount", `FC-6(4차) 받아들인 대가: ${JSON.stringify(text)} 는 ‘금액 후보가 여러 개’ 로 되묻는다(고치기 전 25,000원 저장 대기)`);
  }
  for (const [text, expected, main] of [
    ["2026-07-01,커피,12.000원", "rejected:invalid_amount", "12원"], ["2026-07-01\t커피\t12.000원", "rejected:invalid_amount", "12원"], ["2026-07-01\t커피\t12.500원", "rejected:invalid_amount", "12,500원"],
    ["2026-07-01,커피,₩1.200.000", "rejected:invalid_amount", "1,200,000원"], ["2026-07-01,커피,5.000", "rejected:invalid_amount", "5원"], ["2026-07-01,환불,-12.000원", "rejected:invalid_amount", "12원"],
    ["2026-07-01,커피,12.000원,1", "rejected:ambiguous_amount", "같음"], ["2026-07-01,커피,12.000원,25000원", "rejected:ambiguous_amount", "같음"], ["2026-07-01,커피,25000원,5.000", "rejected:ambiguous_amount", "같음"],
    ["2026-07-01,꽃집,010.1234.5678,25000원", "rows:25000", "같음"], ["2026-07-01\t환전\t13505원\t1,350.500", "rows:13505", "같음"], ["2026-07-01,꽃집,37.5665,25000원", "rows:25000", "같음"],
    ["2026-07-01,정육점,0.500,25000원", "rows:25000", "같음"], ["2026-07-01,꽃집,02.123.4567,25000원", "rows:25000", "같음"], ["2026-07-01,커피,192.168.0.1,25000원", "rows:25000", "같음"],
  ]) t.eq(outcome(text), expected, `FC-6(3차) 머리글 없는 ${JSON.stringify(text)} → ${expected}(고치기 전: ${main})`);
  const plainRows = parseFlexibleImportRecords("2026-07-01,커피,12000원", HOME, "user-bin", {});
  const plainTsv = parseFlexibleImportRecords("2026-07-02\t점심\t8,000원", HOME, "user-bin", {});
  t.ok(plainRows.rows.length === 1 && plainRows.rows[0].amount === 12000 && plainTsv.rows.length === 1 && plainTsv.rows[0].amount === 8000, `FC-6(2차) 머리글 없는 보통 금액 칸(12000원·8,000원)은 예전처럼 읽는다(${plainRows.rows.map((x) => x.amount)}/${plainTsv.rows.map((x) => x.amount)})`);
  const natural = parseFlexibleImportRecords("커피 12.000원", HOME, "user-bin", {});
  t.ok(natural.rows.length === 1 && natural.rows[0].amount === 12000, `FC-6(2차) 한 줄 문장 ‘커피 12.000원’ 은 예전처럼 12,000원이다(카카오·빠른 입력과 같은 읽기, 바꾸지 않음 — ${natural.rows[0]?.amount})`);
}
await withClock("2026-07-20", () => fixture(async (fx) => {
  const preview = async (text) => {
    const r = await post(fx, "/my/import", { import_action: "preview", household_id: HOME, month: "2026-07", csv_text: text, skip_duplicates: "1" });
    const token = (r.text || "").match(/name="import_token" value="([^"]+)"/)?.[1] || "";
    return { status: r.status, payload: token ? JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) : null };
  };
  for (const text of ["2026-07-01,커피,12.000원", "2026-07-01\t커피\t12.000원"]) {
    const { status, payload } = await preview(text);
    t.ok(status === 200 && payload && payload.parsed.format === "headerless_table" && payload.parsed.accepted_count === 0 && payload.ready.length === 0 && payload.parsed.warnings.includes("1행: 금액 형식을 해석하지 못함"), `FC-6(2차) 가져오기 미리 보기 ${JSON.stringify(text)}: 저장 대기 0줄, ‘1행: 금액 형식을 해석하지 못함’(고치기 전 12원 한 줄)`);
  }
  const both = (await preview("2026-07-01,커피,12.000원,1")).payload;
  t.ok(both && both.ready.length === 0 && both.parsed.warnings.includes("1행: 금액 후보가 여러 개라 확정하지 못함"), "FC-6(3차) 가져오기 미리 보기 ‘12.000원’ 과 ‘1’ 이 함께 있으면 고치기 전처럼 ‘금액 후보가 여러 개’(1차의 1원 저장 대기 없음)");
  const phone = (await preview("2026-07-01,꽃집,010.1234.5678,25000원")).payload;
  t.ok(phone && phone.ready.length === 1 && phone.ready[0].row?.amount === 25000, `FC-6(3차) 가져오기 미리 보기 전화번호 칸이 있어도 고치기 전처럼 25,000원 한 줄(${phone?.ready?.[0]?.row?.amount})`);
  const { payload } = await preview("커피 12.000원");
  t.ok(payload && payload.parsed.format === "natural_text" && payload.ready.length === 1 && payload.ready[0].row?.amount === 12000, `FC-6(2차) 가져오기 미리 보기 한 줄 문장은 예전처럼 12,000원 한 줄(${payload?.ready?.[0]?.row?.amount})`);
}));

// ── FC-7 구성원에게는 빠른 입력의 지출자 고르기를 그리지 않는다 ──────────────────────────
await withClock("2026-07-20", () => fixture(async (fx) => {
  const member = await fx.cookieFor("user-wifi");
  const memberHome = await page(fx, `/app?${Q}`, { cookie: member });
  const ownerHome = await page(fx, `/app?${Q}`);
  const memberForm = formFields(memberHome.html, "/admin/transactions");
  const ownerForm = formFields(ownerHome.html, "/admin/transactions");
  t.ok(memberForm.found && !/<select name="user_id"/.test(memberForm.form) && !memberForm.fields.has("user_id"), "FC-7 구성원 홈의 빠른 입력에 지출자 고르기가 없다");
  t.ok(memberForm.form.includes('<div><input name="payment_method" list="paymentList" id="payInput"'), "FC-7 구성원 폼의 결제수단 칸은 한 줄로 남는다");
  t.ok(ownerForm.found && /<select name="user_id"[^>]*>/.test(ownerForm.form) && ownerForm.form.includes("WIFI♥ (구성원)") && ownerForm.fields.has("user_id"), "FC-7 소유자 홈은 예전처럼 지출자를 고른다");
  t.ok(ownerForm.form.includes('<div class="grid2"><select name="user_id"'), "FC-7 소유자 폼 모양은 예전 그대로(grid2)");
  // 서버는 그대로다: 구성원이 다른 지출자를 보내도 본인으로 저장한다(고치기 전에는 화면이 그 선택을 받는 것처럼 보였다).
  const fields = memberForm.fields;
  fields.set("amount", "7700"); fields.set("memo", "구성원 기록 v126"); fields.set("user_id", "user-bin"); fields.set("type", "expense");
  const saved = await post(fx, "/admin/transactions", fields, { cookie: member });
  const row = fx.db.transactions.find((item) => item.memo === "구성원 기록 v126");
  t.ok(saved.status === 303 && row && row.user_id === "user-wifi", `FC-7 서버는 구성원 기록을 본인으로 저장한다(바뀌지 않음, ${saved.status} ${row?.user_id})`);
}));

// ── FC-14 납부·입금 일정 금액 상한 ───────────────────────────────────────────────
await withClock("2026-07-20", () => fixture(async (fx) => {
  const plans = () => JSON.parse(fx.db.accountbook_settings.find((row) => row.key === `reserve_plans:${HOME}`)?.value || "[]");
  const before = JSON.stringify(plans());
  const view = await page(fx, `/reserve-plans?${Q}`);
  const create = formFields(view.html, "/admin/reserve-plan/create");
  const update = formFields(view.html, "/admin/reserve-plan/update");
  t.ok(create.found && update.found && update.fields.get("id") === "reserve-1", "FC-14 납부·입금 일정 화면의 추가·수정 폼을 그대로 쓴다");
  for (const amount of ["999,999,999,999,999", "3000000000", "2000000001"]) {
    const fields = new URLSearchParams(create.fields); fields.set("name", `큰 금액 ${amount}`); fields.set("amount", amount);
    const r = await post(fx, "/admin/reserve-plan/create", fields);
    t.ok(r.status === 303 && r.decoded.includes("err=") && !r.decoded.includes("msg=reserve_saved"), `FC-14 추가 ${amount}원은 저장하지 않는다(${r.decoded.slice(0, 90)})`);
  }
  t.eq(JSON.stringify(plans()), before, "FC-14 상한을 넘는 추가 뒤에도 일정 목록이 그대로다");
  {
    const fields = new URLSearchParams(update.fields); fields.set("amount", "999999999999999");
    const r = await post(fx, "/admin/reserve-plan/update", fields);
    t.ok(r.status === 303 && r.decoded.includes("err=이름과 금액을 입력해주세요."), `FC-14 수정도 상한을 넘으면 같은 금액 오류다(${r.decoded.slice(0, 90)})`);
    t.eq(plans().find((p) => p.id === "reserve-1")?.amount, 1200000, "FC-14 거절된 수정은 기존 금액(1,200,000원)을 바꾸지 않는다");
  }
  {
    const fields = new URLSearchParams(create.fields); fields.set("name", "상한 금액"); fields.set("amount", "2000000000");
    const r = await post(fx, "/admin/reserve-plan/create", fields);
    t.ok(r.decoded.includes("msg=reserve_saved") && plans().some((p) => p.name === "상한 금액" && p.amount === 2000000000), "FC-14 상한과 같은 2,000,000,000원은 예전처럼 저장한다");
  }
  let message = "";
  try { await addReservePlan(fx.env, HOME, { name: "직접 호출", amount: 2000000001 }); } catch (err) { message = String(err?.message || err); }
  t.eq(message, "이름과 금액을 입력해주세요.", "FC-14 addReservePlan 은 상한을 넘는 금액을 같은 파일의 기존 금액 오류로 거절한다");
  message = "";
  try { await updateReservePlan(fx.env, HOME, "reserve-1", { name: "자동차보험", amount: 2000000001 }); } catch (err) { message = String(err?.message || err); }
  t.eq(message, "이름과 금액을 입력해주세요.", "FC-14 updateReservePlan 도 같다");
}));

// ── FC-17 공개 응답의 스킬 호출자 확인은 모드·설정 여부만, 집계 전체는 관리자 전용 /ops-snapshot.json ───────────────────
// 3차: 공개 응답의 header_missing_suspected 는 새로 뜬 인스턴스에 아무나 비밀값 없는 /skill 을 두 번 보내면 true 가 되어 운영자를 헷갈리게 할 수 있었다.
// 공개 /health·/ready·/kakao-new-bot-config.json 의 skill_caller_auth 는 {mode, configured} 뿐이고,
// 통과·거부 건수·마지막 시각·헤더 누락 추정 전체(kakaoSkillAuthSnapshot)는 관리자 세션이 있어야 열리는 /ops-snapshot.json 의 skill_caller_auth 에 있다.
// (/health 의 skill_latency.last_at 은 응답 시간 표본의 마지막 시각으로 고치기 전부터 있던 칸이다. 호출자 확인 값이 아니어서 그대로 둔다.)
await fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_SKILL_SECRET: "v126-skill-secret", ADMIN_PASSWORD: "qa-v126-admin", ADMIN_SESSION_SECRET: "qa-v126-admin-session", ADMIN_API_TOKEN: "qa-v126-admin-token" });
  const secretEnv = fx.env;
  const fetchJson = async (path, env = secretEnv, cookie = "") => { const res = await app.fetch(new Request(`${BASE}${path}`, { headers: cookie ? { cookie, accept: "text/html" } : { accept: "text/html" } }), env, ctx); return { status: res.status, body: await res.json() }; };
  const json = async (path, env) => (await fetchJson(path, env)).body;
  const skillBody = JSON.stringify({ userRequest: { utterance: "안녕", user: { id: "kakao_login:2265", properties: {} } }, action: { params: {} }, bot: { id: "bot" }, intent: { id: "i", name: "블록" } });
  const skillCall = async (headers = {}) => { const res = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: skillBody }), secretEnv, ctx); await res.text(); return res.status; };
  const AUTH_WORDS = /accepted|denied|last_|header_missing_suspected/;
  const publicLeak = (body) => AUTH_WORDS.test(JSON.stringify({ ...body, skill_latency: undefined }));
  const login = await post(fx, "/login", { password: secretEnv.ADMIN_PASSWORD, return_to: "/admin-view" }, { cookie: "" });
  const admin = (login.setCookie.match(/ab_admin=[^;,]+/) || [""])[0];
  t.ok(!!admin, `FC-17 장면: 관리자 로그인 쿠키를 받았다(${login.status})`);
  const adminAuth = async () => { const r = await fetchJson("/ops-snapshot.json", secretEnv, admin); return { status: r.status, keys: Object.keys(r.body).join(","), auth: r.body.skill_caller_auth }; };
  const anon = await fetchJson("/ops-snapshot.json");
  t.ok(anon.status === 401 && !("skill_caller_auth" in anon.body) && !("snapshot" in anon.body) && !AUTH_WORDS.test(JSON.stringify(anon.body)), `FC-17 관리자 세션이 없으면 /ops-snapshot.json 은 예전처럼 401 이고 집계를 싣지 않는다(${anon.status})`);
  const fresh = await adminAuth();
  t.eq(fresh.status, 200, "FC-17 관리자 세션이면 /ops-snapshot.json 이 열린다");
  t.eq(fresh.keys, "ok,snapshot,skill_caller_auth", "FC-17 /ops-snapshot.json 의 맨 위 칸은 ok·snapshot 에 skill_caller_auth 하나만 더했다");
  t.eq(Object.keys(fresh.auth || {}).join(","), "mode,configured,accepted,denied,last_accepted_at,last_denied_at,header_missing_suspected", "FC-17 관리자 skill_caller_auth 는 집계 전체(kakaoSkillAuthSnapshot)다");
  t.ok(fresh.auth?.mode === "enforce" && fresh.auth?.configured === true && fresh.auth?.header_missing_suspected === false, "FC-17 거부가 쌓이기 전에는 관리자 화면의 헤더 누락 추정이 false");
  t.deepEq((await json("/health", secretEnv)).skill_caller_auth, { mode: "enforce", configured: true }, "FC-17 공개 /health 는 모드·설정 여부뿐이다");
  // 고치기 전 장면: 거부된 /skill 호출이 쌓인 뒤 공개 /health 가 건수·시각까지 냈다(2차까지는 헤더 누락 추정이 공개로 true 가 됐다).
  for (let i = 0; i < 2; i += 1) t.eq(await skillCall(), 403, "FC-17 장면: 비밀값 없는 /skill 호출은 예전처럼 막힌다");
  const afterDenied = (await adminAuth()).auth || {};
  t.ok(afterDenied.header_missing_suspected === true && afterDenied.denied >= 2 && afterDenied.accepted === 0 && !!afterDenied.last_denied_at && !afterDenied.last_accepted_at, `FC-17 거부 두 번 뒤 관리자 /ops-snapshot.json 의 헤더 누락 추정이 true(거부 ${afterDenied.denied}·통과 ${afterDenied.accepted})`);
  for (const path of ["/health", "/ready", "/kakao-new-bot-config.json"]) {
    const body = await json(path, secretEnv);
    t.deepEq(body.skill_caller_auth, { mode: "enforce", configured: true }, `FC-17 ${path}: 거부가 쌓여도 skill_caller_auth 는 모드·설정 여부 두 칸뿐이다`);
    t.ok(!publicLeak(body), `FC-17 ${path} 에 accepted·denied·last_…·header_missing_suspected 가 없다`);
    t.eq(body.skill_caller_auth_configured, true, `FC-17 ${path} 의 설정 여부 칸은 그대로다`);
  }
  t.deepEq((await json("/health", { ...secretEnv, KAKAO_SKILL_AUTH_MODE: "observe" })).skill_caller_auth, { mode: "observe", configured: true }, "FC-17 observe 모드는 공개 응답에 그대로 드러난다(배포 점검이 읽는 칸)");
  t.deepEq((await json("/health", { ...secretEnv, KAKAO_SKILL_SECRET: "" })).skill_caller_auth, { mode: "off", configured: false }, "FC-17 비밀값이 없으면 off");
  t.ok((await skillCall({ "x-kakao-skill-secret": "v126-skill-secret" })) !== 403, "FC-17 비밀 헤더가 맞는 /skill 호출은 통과한다");
  const afterAccept = (await adminAuth()).auth || {};
  t.ok(afterAccept.header_missing_suspected === false && afterAccept.accepted >= 1 && !!afterAccept.last_accepted_at, `FC-17 통과가 한 번 생기면 관리자 화면의 추정이 false 로 돌아온다(통과 ${afterAccept.accepted})`);
  t.deepEq((await json("/health", secretEnv)).skill_caller_auth, { mode: "enforce", configured: true }, "FC-17 통과 뒤에도 공개 /health 는 두 칸뿐이다");
  const config = await json("/kakao-new-bot-config.json", { ...secretEnv, SKILL_RATE_LIMIT: "77", TRAFFIC_GUARD_LIMIT: "333" });
  t.ok(!("skill_rate_limit_per_user_per_minute" in config) && !("traffic_guard_limit_per_ip_per_minute" in config) && !JSON.stringify(config).includes("333") && !publicLeak(config), "FC-17 /kakao-new-bot-config.json 에 요청 제한 값과 호출 건수·시각·헤더 누락 추정이 없다");
  t.eq(Object.keys(config).join(","), "ok,version,mode,service,public_base_url,skill_url,skill_caller_auth_configured,skill_caller_auth,user_home,kakao_redirect_uri,privacy_url,terms_url,group_chatbot_routes,forbidden_public_patterns,skill_ip_guard,chat_first,quick_replies", "FC-17 나머지 설정 안내 칸은 순서까지 그대로다");
  const health = await json("/health", secretEnv);
  t.eq(Object.keys(health).join(","), "ok,alive,status,configured,app,version,mode,integrity,missing_count,skill_caller_auth_configured,skill_caller_auth,skill_latency,ready_endpoint,time", "FC-17 /health 의 칸 목록·순서는 그대로다");
  // FC-2(3차) 짝(관리자 로그인을 한 번만 쓰려고 여기 둔다): 진짜 ‘카카오 로그인 점검’ 화면에서는 태그까지 붙여 찾아도 두 문장이 예전처럼 바뀐다.
  const readyEnv = { ...secretEnv, KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback` };
  const check = await app.fetch(new Request(`${BASE}/kakao-login-check`, { headers: { cookie: admin, accept: "text/html" } }), readyEnv, ctx);
  const checkHtml = await check.text();
  t.ok(check.status === 200 && checkHtml.includes("<title>") && checkHtml.includes("카카오 로그인 점검</h1>"), `FC-2(3차) 관리자 ‘카카오 로그인 점검’ 화면이 열린다(${check.status})`);
  t.ok(checkHtml.includes("<td>로컬 설정 일치 · 카카오 로그인 버튼 표시됨</td>") && checkHtml.includes("자동 확인할 수 없습니다. 등록값이 다르면 KOE006이 발생합니다.</p>") && !checkHtml.includes("로그인 버튼 표시</td>"), "FC-2(3차) 그 화면의 두 문장은 예전처럼 바뀐다(<td>…</td>·…</p> 까지 찾음)");
  t.ok(checkHtml.includes("<b>KAKAO_REDIRECT_URI 명시값</b>") && checkHtml.includes("<b>로컬 구성만 확인한 상태입니다</b><br/>") && !checkHtml.includes("<b>Redirect URI 형식</b>"), "FC-2(3차) 그 화면의 나머지 두 치환도 예전처럼 된다(<title> 조건)");
});

// ── FC-18 옛 내부용 안내 화면: 접근은 그대로, 검색 제외 머리(X-Robots-Tag) ───────────────────
// final-check 의 주소 훑기는 본문만 봐서 ‘noindex 없음’ 으로 적었다. 이 화면들은 공용 HTML 머리로 이미 noindex 를 보낸다 — 이 검사가 그 머리를 고정한다.
const LEGACY_INTERNAL_PAGES = [
  "/beta-checklist", "/beta-final-check", "/beta-ready", "/review-ready", "/user-beta-check", "/beta-start", "/onboarding", "/user-onboarding",
  "/kakao-review", "/review-check", "/openbuilder-report", "/kakao-openbuilder", "/openbuilder-check", "/openbuilder-guide", "/kakao-openbuilder-final",
  "/openbuilder-final", "/openbuilder-utterances", "/kakao-stability", "/qa-stability", "/real-user-qa", "/user-qa", "/classification-samples",
  "/input-sample-check", "/quick-input-qa", "/menu-polish", "/navigation-polish", "/simple-menu-guide", "/user-polish", "/user-polish-final", "/ux-final",
  "/brand-guide", "/brand-kit", "/review-copy",
];
await fixture(async (fx) => {
  const sitemap = await (await app.fetch(new Request(`${BASE}/sitemap.xml`), fx.env, ctx)).text();
  const listed = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));
  const robotsTxt = await (await app.fetch(new Request(`${BASE}/robots.txt`), fx.env, ctx)).text();
  const missing = [];
  for (const path of LEGACY_INTERNAL_PAGES) {
    const response = await app.fetch(new Request(`${BASE}${path}`, { headers: { accept: "text/html" } }), fx.env, ctx);
    const robots = String(response.headers.get("x-robots-tag") || "").replace(/\s+/g, "");
    await response.text();
    if (response.status !== 200 || robots !== "noindex,nofollow" || listed.has(path)) missing.push(`${path}:${response.status}:${robots}`);
  }
  t.eq(missing.join(" "), "", `FC-18 옛 내부용 화면 ${LEGACY_INTERNAL_PAGES.length}곳은 로그인 없이 그대로 열리고(200) X-Robots-Tag noindex,nofollow 이며 사이트맵에 없다`);
  t.ok(!LEGACY_INTERNAL_PAGES.some((path) => robotsTxt.includes(path)), "FC-18 robots.txt 는 이 화면들을 따로 적지 않는다(바꾸지 않음)");
  const guide = await app.fetch(new Request(`${BASE}/budget-guide`, { headers: { accept: "text/html" } }), fx.env, ctx);
  await guide.text();
  t.ok(listed.has("/budget-guide") && /^index/.test(String(guide.headers.get("x-robots-tag") || "")), "FC-18 사이트맵의 공개 글은 예전처럼 색인된다(머리가 모든 화면에 걸린 것이 아니다)");
});

// ── FC-23 공개 /start-guide 의 공유 이미지 ─────────────────────────────────────────
await fixture(async (fx) => {
  const publicGuide = await page(fx, "/start-guide", { cookie: "" });
  const head = publicGuide.html.slice(0, publicGuide.html.indexOf("</head>"));
  t.eq(publicGuide.status, 200, "FC-23 로그인 없는 /start-guide 가 열린다");
  t.eq(count(head, '<meta property="og:image" content="https://malhaebook.com/assets/og-malhaebook-'), 1, "FC-23 /start-guide 머리에 정본 주소의 og:image 가 한 번 있다");
  t.ok(head.includes('<meta property="og:image:width" content="1200"/>') && head.includes('<meta name="twitter:card" content="summary_large_image"/>'), "FC-23 다른 공개 화면과 같은 크기·카드 태그다");
  const home = await page(fx, "/", { cookie: "" });
  const tagOf = (html) => (html.match(/<meta property="og:image" content="[^"]+"\/>/) || [""])[0];
  t.ok(!!tagOf(head) && tagOf(head) === tagOf(home.html), "FC-23 /start-guide 의 이미지 주소가 공개 첫 화면과 같다");
});

// ── 통합 준비(다른 묶음): 지출 전망 호출 세 곳이 이미 읽은 참여자 목록을 넘긴다. 받는 쪽은 아직 쓰지 않으므로 화면은 그대로다. ──
{
  const home = read("src/modules/my/mobile-home.js"), insight = read("src/modules/my/insight-page.js");
  const calls = [...home.matchAll(/(monthSpendingOutlook|homeUpcomingOut)\(\{[^}]*\}\)/g), ...insight.matchAll(/(monthSpendingOutlook)\(\{[^}]*\}\)/g)].map((m) => m[0]);
  t.ok(calls.length === 3 && calls.every((call) => /, members \}\)$/.test(call)), `통합 준비: 홈의 monthSpendingOutlook·homeUpcomingOut, 소비 분석의 monthSpendingOutlook 이 members 를 넘긴다(${calls.length}곳)`);
}

t.done();
