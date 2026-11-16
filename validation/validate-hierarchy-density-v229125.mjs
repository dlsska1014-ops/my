// V22.9.125 — 글자 크기·굵기 눈금, 위계, 밀도.
//
// ── 이 파일이 왜 생겼는지 ──
// V22.9.124 의 UI/UX 기준 점검에서 ‘남긴 것’ 으로 적은 위계·밀도 문제를 사용자가 출시 전에 고쳐 달라고 했다(2026-11-15
// "나머지도 배포 전 개선됬으면 좋겠는데 위계 밀도 그리고 전체적으로"). 고치기 전(운영 V22.9.124) 화면 36곳을 헤드리스 Chrome 으로 재면
// 글자 요소의 66%가 굵기 600 이상이었고(휴대폰 홈은 85%), 굵기 10가지·글자 크기 32가지가 섞여 있었다. 9~10.5px 글자도 203개였다.
//   눈금: 글자 11·12·13·14·16·18·20·24·28·32·36px / 굵기 400·500·600·700·800.
//   역할: 큰 숫자 800 · 제목·강조(b)·핵심 값·켜진 조작 700 · 단추·링크·표 머리글 600 · 작은 숫자·칸 이름·배지 500 · 메뉴 항목과 설명·라벨·날짜 같은 보조 글자 400.
// 방법: 화면마다 보이는 글자 요소의 (크기, 굵기)를 재고, 역할로 목표 값을 정한 뒤, 그 값을 만든 CSS 선언을 찾아(선택자 + 선언 블록)
// 원본에서 값을 바꿨다(review-artifacts/v125-hierarchy-density-2026-11-15/audit/type-plan.mjs · type-apply.mjs). 한 선언을 쓰는 글자를 모두 보고,
// 제목과 보조 글자가 한 규칙을 쓰면 제목을 따랐다. 측정에 잡히지 않은 규칙(오류·빈 상태 등)의 값은 가까운 눈금으로만 옮겼다.
// 이 검사는 그 결과가 그대로인지를 오프라인으로 본다(실제 크기·줄바꿈·넘침은 위 폴더의 ux-criteria-audit.mjs 로 잰다).
//   T-1 스타일시트 셋(셸·홈·공통)의 font-weight 는 다섯 값, font-size(px) 는 열한 값만 쓴다(달력 칸의 10px 셋과 그림 문자용 38·58px 셋만 예외). 유동 크기의 끝값도 눈금.
//   T-2 스타일시트 셋의 주소를 v229125 로 올렸다. 옛 주소 셋은 옛 바이트로 계속 내려간다(이미 받아 간 화면용).
//   T-3 바탕 셸(옛 주소 /assets/accountbook-shell-v22811.css 로도 내려가는 상수)의 세 규칙은 상수를 두고 이 판의 셸에서만 바꿔 쓴다.
//   H-1 홈의 손으로 정한 위계: 예산 카드 라벨·요일·일별 칸의 날짜는 400, 사용률 숫자·주간 띠의 날짜·값이 있는 칸의 금액·페이스 상자의 첫 문장은 700,
//       사용률 칩은 한 줄. 규칙이 없어 브라우저 기본값(13.33px)이 쓰이던 단추·small 은 13px.
//   D-1 휴대폰: 머리와 첫 카드 사이 빈 띠 38px → 12px(본문 위 여백 0 — 머리의 아래 여백과 첫 카드의 위 여백이 겹쳐 카드 사이 간격과 같아진다). 홈·캘린더·내역 탭.
//   S-1 설정의 ‘저장된 분류별 지출 예산’ 표도 767px 이하에서 줄마다 카드로(390px 에서 13px 을 옆으로 밀던 표). 768~1099px 의 쌓는 표는 최소 폭을 푼다.
//   F-1 꼬리말(사업자 정보): 글자 12px, 링크의 누르는 높이 44px 이상(글줄은 그대로 — 바깥 여백으로 상쇄).
//
// 독립 검토 1회(2026-11-16, P1·P2 없음·P3 아홉) 반영: 휴대폰 빈 띠가 실제로는 12px 이고 내역 탭에는 안 걸리던 것(머리를 쓰는 화면 셋에 같이), 먹히지 않던 예산 카드 여백 규칙(뺌),
// 달력 칸 금액을 11px 로 올려 320px 폭에서 큰 금액이 더 잘리던 것(10px 로 되돌림), 글 목록이 7% 길어진 것(카드 제목 16px·설명 14px), 900~1099px 의 표 넘침(범위를 넓힘),
// 강조가 과하게 빠진 곳(표 제목·구성원 머리글자·정산 상태 칸·‘자세히’), 그리고 이 검사의 빈틈(주소가 404 여도 통과하던 T-1, 유동 크기 끝값, 설정 표의 줄 수).
// 이 검사는 규칙의 글과 값만 본다. 어느 규칙이 이기는지(캐스케이드)와 실제 크기·간격은 측정 도구(ux-criteria-audit.mjs)로 잰다.
//
// ── 실행 ──
//   node validation/validate-hierarchy-density-v229125.mjs
//   V229125_SOFT=1 은 옛 번들에 이 검사를 돌려 실패 수를 셀 때만 쓴다(실패를 모아 끝에 센다).
import { createHash } from "node:crypto";
import { app, BASE, ctx, counter, fixture, page, withClock } from "./lib-audit-v22934.mjs";

const t = counter("PASS: V22.9.125 hierarchy density");
const SOFT = process.env.V229125_SOFT === "1";
const softFailures = [];
const ok = (value, message) => { if (SOFT && !value) { softFailures.push(message); return; } t.ok(!!value, message); };
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const H = "household_id=house-home";
const count = (text, needle) => text.split(needle).length - 1;
const sha = (data) => createHash("sha256").update(data).digest("hex");
const asset = async (path) => {
  const response = await app.fetch(new Request(`${BASE}${path}`), {}, ctx);
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, text: body.toString("utf8"), bytes: body.length, sha: sha(body), cache: String(response.headers.get("cache-control") || ""), etag: String(response.headers.get("etag") || "") };
};
async function scene(name, task) {
  try { await task(); } catch (error) { if (!SOFT) throw error; softFailures.push(`${name}: ${error && error.message}`); }
}

// 지금 화면이 부르는 주소(뒤 판에서 올라갈 수 있다 — 그때는 이 상수만 따라 올린다)
const SHELL = "/assets/accountbook-shell-v229125.css";
const HOME_CSS = "/assets/mobile-home-v229125.css";
const UIUX = "/assets/ab-uiux-v229125.css";
// 이 판이 주소를 올리기 전의 주소와 그 바이트(운영 V22.9.124 가 쓰던 것)
const OLD = [
  ["/assets/accountbook-shell-v229124.css", "1d9051b9dfe27054c5ad0944af51c81736d85db01b774471a59f8725050ab397"],
  ["/assets/mobile-home-v22985.css", "9c9d665d22a30c37cd6d456fb2ed1032f77229c6cfab9ac4e31496fcb3e682a2"],
  ["/assets/ab-uiux-v22919.css", "59510e82bbd2b373da76dfa1a070d2ccb40232e115e23da5c23251403fcc9f0c"],
];
const WEIGHTS = new Set(["400", "500", "600", "700", "800"]);
const SIZES = new Set(["11", "12", "13", "14", "16", "18", "20", "24", "28", "32", "36"]);
const MARK = "/* ── V22.9.125 (글자·굵기 눈금, 위계, 밀도)";
const offScale = (css) => {
  const weights = [], sizes = [];
  for (const m of css.matchAll(/font-weight:\s*([^;}!]+)/g)) { const v = m[1].trim(); if (/^\d+$/.test(v) && !WEIGHTS.has(v)) weights.push(v); }
  for (const m of css.matchAll(/font-size:\s*([^;}!]+)/g)) { const px = m[1].trim().match(/^(\d+(?:\.\d+)?)px$/); if (px && !SIZES.has(px[1])) sizes.push(px[1]); }
  return { weights, sizes: sizes.sort((a, b) => Number(a) - Number(b)) };
};

const shell = await asset(SHELL);
const homeCss = await asset(HOME_CSS);
const uiux = await asset(UIUX);

// ── T-2 주소 ──
await scene("T-2", async () => {
  for (const [name, a, path] of [["셸", shell, SHELL], ["홈", homeCss, HOME_CSS], ["공통", uiux, UIUX]]) {
    eq(a.status, 200, `T-2 ${name} 스타일시트의 새 주소가 내려간다`);
    ok(a.cache.includes("max-age=31536000") && a.cache.includes("immutable") && a.etag.includes(path.match(/-(v\d+)\.css$/)[1]), `T-2 ${name} 새 주소는 1년 불변 자산이고 ETag 가 같은 판이다`);
  }
  for (const [path, hash] of OLD) {
    const old = await asset(path);
    eq(old.status, 200, `T-2 옛 주소 ${path} 도 계속 내려간다(이미 받아 간 화면용)`);
    eq(old.sha, hash, `T-2 옛 주소 ${path} 의 바이트는 운영 V22.9.124 가 쓰던 그대로다`);
    ok(old.cache.includes("immutable"), `T-2 옛 주소 ${path} 도 불변 자산이다`);
    ok(!old.text.includes(MARK), `T-2 옛 주소 ${path} 에는 이번 판 블록이 없다`);
  }
  // 옛 셸에는 눈금 밖 값이 많았다(이 검사가 빈 검사가 아님을 보인다)
  const before = offScale((await asset(OLD[0][0])).text);
  ok(before.weights.length >= 40 && before.sizes.length >= 60, `T-2 옛 셸 CSS 에는 눈금 밖 굵기·크기 선언이 많았다(굵기 ${before.weights.length}, 크기 ${before.sizes.length})`);
});

// ── T-1 눈금 ──
await scene("T-1", async () => {
  for (const [name, a] of [["셸", shell], ["홈", homeCss], ["공통", uiux]]) {
    // 주소가 없으면(404) 아래 줄들이 빈 글에서 헛되이 통과한다 → 먼저 200 을 본다
    eq(a.status, 200, `T-1 ${name} 스타일시트가 내려간다`);
    ok(a.bytes > 30000, `T-1 ${name} 스타일시트의 본문이 있다(${a.bytes} B)`);
    const off = offScale(a.text);
    eq(off.weights.join(","), "", `T-1 ${name} 스타일시트의 굵기는 400·500·600·700·800 만 쓴다`);
    // 눈금 밖은 홈 스타일시트의 여섯뿐이다: 달력 칸의 금액·건수 10px 셋(.calDay strong·em·small — 11px 로 올리면 320px 폭에서 천만 원대 금액의 부호가 잘린다),
    // 그림 문자(이모지) 장식 셋(.memeMain .emoji 58px, .memeMini b 와 .v8-meme-mini .emoji 38px)
    eq(off.sizes.join(","), name === "홈" ? "10,10,10,38,38,58" : "", `T-1 ${name} 스타일시트의 글자 크기(px)는 11·12·13·14·16·18·20·24·28·32·36 만 쓴다`);
    ok(!/font-size:\s*\d+\.\d+px/.test(a.text), `T-1 ${name} 스타일시트에 반 픽셀 글자 크기가 없다`);
    // 유동 크기(clamp)의 끝값도 눈금이다(전시용 큰 글자 36px 초과는 빼고)
    const bounds = [...a.text.matchAll(/font-size:\s*clamp\(\s*(\d+(?:\.\d+)?)px\s*,[^,]+,\s*(\d+(?:\.\d+)?)px\s*\)/g)].flatMap((m) => [m[1], m[2]]).filter((v) => Number(v) <= 36 && !SIZES.has(v));
    eq(bounds.join(","), "", `T-1 ${name} 스타일시트의 유동 글자 크기는 끝값이 눈금이다`);
  }
  ok(homeCss.text.includes(".memeMain .emoji{font-size:58px") && count(homeCss.text, "font-size:38px") === 2, "T-1 예외 셋은 그림 문자 장식이다");
  for (const rule of [".calDay strong{color:#ef4444;font-size:10px;line-height:1.1;white-space:nowrap;font-weight:700}", ".calDay em{color:#16a34a;font-style:normal;font-size:10px;line-height:1.1;white-space:nowrap;font-weight:700}", ".calDay small{color:#8b95a1;font-size:10px;line-height:1.1}"]) ok(homeCss.text.includes(rule), `T-1 달력 칸은 10px 그대로(넘침 방지): ${rule.slice(0, 40)}`);
  // 글자 토큰(V22.9.84)도 눈금 값이다
  for (const token of ["--ab12-fs-num-xl:36px", "--ab12-fs-num-lg:20px", "--ab12-fs-title:16px", "--ab12-fs-body:14px", "--ab12-fs-cap:12px", "--ab12-fw-num-xl:700", "--ab12-fw-cap:500"]) ok(shell.text.includes(token), `T-1 글자 토큰 ${token}`);
  ok(shell.text.includes("font-size:var(--ab12-fs-num-lg,20px)") && !shell.text.includes("fs-num-lg,22px") && !shell.text.includes("fs-num-xl,34px"), "T-1 토큰의 대체 값도 같은 눈금이다");
  ok(shell.text.includes("font-size:clamp(18px,1.7vw,24px)!important") && !shell.text.includes("clamp(19px,1.7vw,25px)"), "T-1 KPI 숫자의 유동 크기는 끝값이 눈금이다(18~24px)");
  ok(uiux.text.includes("clamp(24px,2.4vw,32px)") && !uiux.text.includes("clamp(24px,2.4vw,34px)"), "T-1 화면 제목의 유동 크기는 끝값이 눈금이다(24~32px)");
});

// ── T-3 바탕 셸의 세 규칙 ──
await scene("T-3", async () => {
  const legacy = await asset("/assets/accountbook-shell-v22811.css");
  eq(legacy.status, 200, "T-3 바탕 셸의 옛 주소가 내려간다");
  for (const [before, after, label] of [
    [".topLine h1{color:var(--ab12-text);font-size:20px!important;font-weight:900!important}", ".topLine h1{color:var(--ab12-text);font-size:20px!important;font-weight:700!important}", "화면 제목 900 → 700"],
    [".homeBudgetAmount b{color:var(--ab12-text);font-size:36px!important;font-weight:900}", ".homeBudgetAmount b{color:var(--ab12-text);font-size:36px!important;font-weight:800}", "홈의 큰 숫자 900 → 800"],
    [".homeDesktopBrand{display:flex;align-items:center;gap:10px;color:var(--ab12-text);text-decoration:none;font-size:17px;font-weight:900;padding:0 10px 20px}", ".homeDesktopBrand{display:flex;align-items:center;gap:10px;color:var(--ab12-text);text-decoration:none;font-size:16px;font-weight:800;padding:0 10px 20px}", "데스크톱 상표 17px·900 → 16px·800"],
  ]) {
    ok(shell.text.includes(`body.abV22812Shell ${after}`) && !shell.text.includes(`body.abV22812Shell ${before}`), `T-3 이 판의 셸: ${label}`);
    ok(legacy.text.includes(`body.abV22811Shell ${before.replaceAll("--ab12", "--ab11")}`), `T-3 옛 주소의 바탕 셸은 그대로다: ${label}`);
  }
});

// ── H-1 · D-1 · S-1 이번 판 블록 ──
const blockAt = shell.text.indexOf(MARK);
const blockEnd = shell.text.indexOf("/* ── V22.9.40 (C) 점진적 최신 규칙 ──");
const block = blockAt < 0 || blockEnd < blockAt ? "" : shell.text.slice(blockAt, blockEnd);
await scene("H-1", async () => {
  eq(count(shell.text, MARK), 1, "H-1 이번 판 블록이 셸 CSS 에 한 번 있다");
  ok(blockAt > shell.text.indexOf("/* ── V22.9.124 (UI/UX 기준 점검") && blockEnd > blockAt, "H-1 블록은 V22.9.124 블록 뒤, V22.9.40 (C) 블록 앞에 있다");
  for (const rule of [
    ":where(body.abV22812Shell) :where(button,input[type=submit],input[type=button]){font-size:13px}",
    ":where(body.abV22812Shell) :where(small){font-size:13px}",
    "body.abV22812Shell .policyOption small,body.abV22812Shell label.chk>small{font-size:12px}",
    "body.abV22812Shell .hTop span small{font-size:11px}",
    "body.abV22812Shell .homeBudgetTop>span{font-weight:400}",
    "body.abV22812Shell .homeBudgetTop>em{font-weight:400;white-space:nowrap}",
    "body.abV22812Shell .homeBudgetTop>em>span{display:inline;margin-left:4px;font-weight:700}",
    "body.abV22812Shell.abMobileAppSurface .homePace>p{font-weight:700}",
    "body.abV22812Shell .homeWeek li>b{font-weight:400}",
    "body.abV22812Shell .homeWeek li>em{font-weight:700}",
    "body.abV22812Shell .readableTrendGrid .dailyTop b{font-weight:400}",
    "body.abV22812Shell .readableTrendGrid .dailyCell.hasValue .dailyAmt{font-weight:700}",
  ]) eq(count(block, rule), 1, `H-1 ${rule.slice(0, 96)}`);
  // 역할별 굵기의 본보기(제자리에서 고친 규칙)
  ok(shell.text.includes("body.abV22812Shell .abNavBottom a.active{font-weight:700!important}"), "H-1 아래 탭: 켜진 항목 700");
  ok(/body\.abV22812Shell \.abNavBottom a\{[^}]*font-weight:400!important/.test(shell.text), "H-1 아래 탭: 꺼진 항목 400");
  ok(/body\.abV22812Shell \.abNavLinks a\{[^}]*font-weight:400!important/.test(shell.text), "H-1 사이드바 메뉴: 꺼진 항목 400");
  ok(homeCss.text.includes(".v8-spender{") && /\.v8-spender\{[^}]*font-weight:400/.test(homeCss.text), "H-1 내역의 ‘지출자’ 줄은 보조 글자(400)");
  ok(/\.homeMomLine\{[^}]*font-weight:400/.test(homeCss.text) && /\.homeReserveEyebrow\{[^}]*font-weight:400/.test(homeCss.text), "H-1 홈의 설명 줄·머리표는 400");
});
await scene("D-1", async () => {
  // 머리(header.appTop)를 쓰는 화면 셋(홈·캘린더·내역 탭)에 같이 걸린다. 본문 위 여백이 0 이면 머리의 아래 여백 12px 와 첫 카드의 위 여백 12px 가 겹쳐 간격이 12px 가 된다
  // (카드 사이 간격과 같다). 실제 간격은 측정 도구로 잰다 — 이 검사는 규칙의 글과 폭 조건만 본다.
  ok(block.includes("@media(max-width:899px){\nbody.abV22812Shell header.appTop~main.wrap{padding-top:0!important}\n}"), "D-1 휴대폰 폭에서만 머리 아래 본문의 위 여백 0(빈 띠 38 → 12px)");
  ok(!block.includes(".homeBudget{padding-top"), "D-1 먹히지 않는 예산 카드 여백 규칙은 두지 않는다(바탕 셸의 padding:22px!important 가 이긴다)");
});
await scene("S-1", () => withClock("2026-07-15", () => fixture(async (fx) => {
  ok(block.includes("@media(max-width:767px){\nbody.abV22812Shell .scroll.abStackWrap{overflow:visible!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;padding:0!important}\n}"), "S-1 767px 이하: .scroll 감싸개도 쌓은 카드를 가리지 않는다");
  ok(block.includes("@media(min-width:768px) and (max-width:1099px){\nbody.abV22812Shell .tableWrap.abStackWrap>table.abStackTable{min-width:0!important}\n}"), "S-1 768~1099px: 쌓는 표의 최소 폭을 푼다(오늘 예산 표가 768px 에서 83px, 사이드바가 나오는 900px 에서 223px 넘치던 것)");
  const settings = (await page(fx, `/my/settings?${H}`)).html;
  ok(settings.includes('<div class="scroll abStackWrap"><table class="abStackTable"><thead><tr><th>분류</th><th>예산</th><th>사용</th><th>남음</th><th>사용률</th></tr></thead>'), "S-1 설정의 분류 예산 표에 쌓는 표 표식");
  const rows = [...settings.matchAll(/<tr><td data-label="분류"><b>[^<]+<\/b><\/td><td data-label="예산">[\d,]+원<\/td><td data-label="사용">[\d,]+원<\/td><td data-label="남음">[\d,]+원<\/td><td data-label="사용률">\d+%<\/td><\/tr>/g)];
  const tableAt = settings.indexOf('<table class="abStackTable"><thead><tr><th>분류</th>');
  const tbody = settings.slice(settings.indexOf("<tbody>", tableAt) + 7, settings.indexOf("</tbody>", tableAt));
  ok(rows.length >= 1 && rows.length === count(tbody, "<tr>"), `S-1 설정 표의 모든 줄에 칸 머리글(data-label) 다섯 (줄 ${rows.length} / ${count(tbody, "<tr>")})`);
  // 검토에서 굵기를 되돌린 곳: 정산 상태 칸(받을/보낼 금액)·구성원 머리글자는 700, 빠른 입력의 ‘자세히’ 는 600
  const settle = (await page(fx, `/split-summary?${H}`)).html;
  ok(settle.includes(".plus{color:#166534;font-weight:700}") && settle.includes(".minus{color:#b91c1c;font-weight:700}"), "H-1 정산 상태 칸(받을/보낼 금액)은 핵심 값(700)");
  const members = (await page(fx, `/my/members?${H}`)).html;
  ok(members.includes("display:grid;place-items:center;font-weight:700;font-size:18px}"), "H-1 구성원 머리글자는 700");
  ok(/body\.abV22812Shell \.quickMore>summary\{[^}]*font-size:13px;font-weight:600/.test(shell.text), "H-1 빠른 입력의 ‘자세히’ 는 여닫는 조작(600)");
  const articles = (await page(fx, "/articles", { cookie: "" })).html;
  ok(articles.includes("min-height:44px;font-size:16px;font-weight:600;") && articles.includes(".pubCards li p{margin:2px 0 8px;color:#43516a;line-height:1.8;font-size:14px}") && articles.includes(".pubTable caption{text-align:left;padding:16px 18px;font-weight:700;color:#526075}"), "H-1 글 목록 카드: 제목 16px·설명 14px, 표 제목 700");
  // 화면들이 새 주소를 부른다
  const home = (await page(fx, `/app?month=2026-07&${H}`)).html;
  ok(home.includes(`href="${SHELL}"`) && home.includes(`href="${HOME_CSS}"`) && !home.includes(OLD[0][0]) && !home.includes(OLD[1][0]), "T-2 홈 화면은 새 셸·홈 스타일시트 주소를 부른다");
  ok(settings.includes(`href="${SHELL}"`) && settings.includes(`href="${UIUX}"`) && !settings.includes(OLD[2][0]), "T-2 설정 화면은 새 셸·공통 스타일시트 주소를 부른다");
  // F-1 꼬리말
  const landing = (await page(fx, "/", { cookie: "" })).html;
  const privacy = (await page(fx, "/privacy", { cookie: "" })).html;
  for (const [name, html] of [["첫 화면", landing], ["개인정보처리방침", privacy]]) {
    ok(html.includes(".abBusinessFooter{margin:18px 0 0;padding:13px 0 2px;border-top:1px solid #e5e7eb;color:#596579;font-size:12px;line-height:1.45;letter-spacing:-.015em}"), `F-1 ${name}: 꼬리말 글자 12px`);
    ok(html.includes(".abBusinessFooterItem a{display:inline-block;margin:-14px 0;padding:14px 0;color:inherit;text-decoration:underline;overflow-wrap:anywhere}"), `F-1 ${name}: 꼬리말 링크의 누르는 높이(글줄 17px + 위아래 14px, 바깥 여백으로 상쇄)`);
  }
  ok(Buffer.byteLength(landing) <= 36 * 1024, `F-1 첫 화면 HTML 은 36 KiB 안이다(${Buffer.byteLength(landing)} B)`);
})));

if (SOFT) { console.log(`SOFT: 실패 ${softFailures.length}건`); for (const line of softFailures) console.log(`  - ${line}`); }
t.done();
