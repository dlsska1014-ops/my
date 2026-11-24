// V22.9.104 출시 전 글·첫 화면·공지 띠 검사(오프라인, src/index.js 번들 + validation/lib-audit-v22934.mjs 픽스처).
//   A-1 공지 띠 닫기 ‘×’: 공개 화면·로그인 화면·앱 화면의 띠 오른쪽 끝에 aria-label "공지 닫기" 단추가 있고, ‘오늘 하루 안 보기’ 와 같은
//       폼(/notice/hide POST)의 둘째 제출 단추라 보내는 값·쿠키·만료(24시간)가 똑같으며, 숨긴 뒤에는 띠와 스타일이 없다.
//   A-2 첫 화면 글 목록(V22.9.140 부터 ‘처음이라면 이 글부터’ — 처음 읽을 순서로 고른 8편 + 전체 목록 링크. V22.9.104~139 는 작성일 최신 8편 ‘최근 글’),
//       링크마다 200·정본·사이트맵, 제목이 허브와 같음, 첫 화면 수정일 ≥ 목록 글의 가장 늦은 수정일, 바이트 상한.
//   A-4 세무 글 8편 사실 확인 고침(H-10 보고): 머리 기준 한 줄(P2-1), 고친 문장마다 새 문장 있음·옛 문장 없음(P2-2~P2-6·P3-1~P3-9),
//       작성일 그대로·수정일(화면·JSON-LD·사이트맵) 2026-11-06 은 원본 상수 하나, ‘무료’ 없음.
// V22.9.142(애드센스 걷어내기, 사용자 11-24 결정 3·5): 세무 글 8편 중 7편을 연말정산·카드·월세 글로 합쳤다. 옛 주소는 합친 글로 308 이고,
//   고친 문장 중 합친 글에 남긴 것은 합친 글에서, 옛 문장(gone)은 합친 글에도 없는지 본다. 기준 한 줄·날짜는 남은 연금저축·IRP 글만 본다
//   (합친 세 편의 V22.9.142 기준 한 줄은 validate-v229142-adsense-week1).
// 바깥 요청은 0회여야 한다(픽스처의 가짜 DB 말고는 모두 막고 센다).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BASE, fixture, formFields, page, post } from "./lib-audit-v22934.mjs";

let checks = 0;
const ok = (value, label) => { checks++; assert.ok(value, label); };
const eq = (value, expected, label) => { checks++; assert.equal(value, expected, label); };

// 바깥 요청 세기: 픽스처는 가짜 DB(mock.supabase.co)가 아닌 요청을 만들 때의 fetch 로 넘긴다. 그 fetch 를 막는 함수로 둔다.
let outbound = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => { outbound++; throw new Error(`V22.9.104 검사는 바깥 요청을 하지 않는다: ${String(input?.url || input)}`); };

// 공지 띠: 띠 시작부터 처음 나오는 ‘</form></div>’ 까지(띠 안에는 div 가 없다).
const bandOf = (html) => {
  const start = html.indexOf('<div class="abNoticeBand"');
  if (start < 0) return "";
  const end = html.indexOf("</form></div>", start);
  return end < 0 ? "" : html.slice(start, end + "</form></div>".length);
};
const styleOf = (html) => (html.match(/<style id="abNoticeBandStyle">([\s\S]*?)<\/style>/) || [])[1] || "";
const NOTICE_TEXT = "개인정보처리방침과 이용약관을 11월 2일에 개정해 바로 적용하고 있어요.";
const NOTICE_LINK = "/privacy";
const HIDE_BUTTON = '<button class="secondary" type="submit">오늘 하루 안 보기</button>';
const CLOSE_BUTTON = '<button class="abNoticeClose" type="submit" aria-label="공지 닫기">×</button>';
// A-2: 첫 화면 글 수와 V22.9.140 의 ‘처음이라면 이 글부터’ 목록(읽을 순서). 연말정산·절세 8편(TAX_PATHS)은 이 목록에 넣지 않는다.
const RECENT_COUNT = 8;
const STARTER_PATHS = ["/accountbook-habit", "/payday-budget-cycle", "/budget-ratio-guide", "/expense-category-rules", "/fixed-cost-checklist", "/subscription-cleanup", "/shared-living-cost-rules", "/monthly-closing-routine"];
const TAX_PATHS = [
  "/payment-method-switch-nov-dec", "/single-household-year-end-tax", "/dual-income-deduction-allocation", "/pension-savings-irp-tax-credit",
  "/year-end-tax-timeline-checklist", "/tax-refund-money-plan", "/medical-education-donation-deductions", "/housing-deductions-overview",
];
// A-4: 세무 글 8편의 작성일(그대로)·수정일(이번 판)과 머리 기준 한 줄(H-10 보고 P2-1 제안 문장).
const TAX_PUBLISHED = "2026-11-03";
// V22.9.142: 남은 연금저축·IRP 글은 제목·설명·질문을 고쳐 수정일이 2026-11-24 다.
const TAX_UPDATED = "2026-11-24";
const taxUpdatedFor = () => TAX_UPDATED;
// V22.9.142: 합친 일곱 편의 옛 주소 → 합친 글.
const TAX_MERGED_V229142 = {
  "/payment-method-switch-nov-dec": "/card-income-deduction-basics", "/housing-deductions-overview": "/rent-tax-credit-records",
  "/single-household-year-end-tax": "/year-end-tax-expense-check", "/dual-income-deduction-allocation": "/year-end-tax-expense-check",
  "/year-end-tax-timeline-checklist": "/year-end-tax-expense-check", "/tax-refund-money-plan": "/year-end-tax-expense-check",
  "/medical-education-donation-deductions": "/year-end-tax-expense-check",
};
// V22.9.142 독립 검토: 옛 주소는 합친 글의 그 내용 절로 간다(Location 에 앵커 — 없으면 브라우저가 옛 앵커를 이어 붙인다).
const TAX_ANCHOR_V229142 = {
  "/payment-method-switch-nov-dec": "#section-5", "/housing-deductions-overview": "#section-6", "/single-household-year-end-tax": "#section-6",
  "/dual-income-deduction-allocation": "#section-6", "/year-end-tax-timeline-checklist": "#section-2", "/tax-refund-money-plan": "#section-7",
  "/medical-education-donation-deductions": "#section-4",
};
// V22.9.142: 합친 글로 간 H-10 고친 문장(옛 주소 일곱 편의 FIXES ‘now’ 22개)을 하나도 빠짐없이 나눈다 — 독립 검토(2026-11-24)가
// 예전 꼴(남긴 6 + 같은 사실 2 만 보고 나머지는 건너뜀)로는 옛 의료비 글의 고친 사실과 어긋난 연말정산 글 6절을 잡지 못한다고 짚었다.
//   kept: 합친 글에 그대로 있다. same: 합친 글(또는 그 사실을 맡은 다른 글)이 같은 사실을 다른 문장으로 말한다. dropped: 결정 5(‘세무는 줄이고
//   국세청 안내로’)로 덜어 냈다 — 까닭을 적고, 그 FIXES 의 옛 문장이 합친 글에 없는지는 아래 고리가 그대로 본다.
const MERGED_FACTS_V229142 = {
  "P2-2|기본 한도: 자녀 등이 없으면 총급여 7천만원 이하는 연 300만원, 넘으면 연 250만원입니다.": ["same", "/card-income-deduction-basics", "해당 자녀 등이 없는 경우 기본 한도는 연 250만원이고, 총급여 7,000만원 이하는 연 300만원입니다(법 제126조의2 제10항)."],
  "P2-2|자녀·손자녀 등 대통령령으로 정하는 부양가족이 있으면 2026년 사용분부터 한도가 커집니다.": ["same", "/card-income-deduction-basics", "2026년 사용분부터 해당 자녀 등이 1명이면 기본 한도는 총급여 7,000만원 이하 350만원·초과 275만원, 2명 이상이면 각각 400만원·300만원입니다."],
  "P2-2|총급여 7천만원 이하는 1명 350만원·2명 이상 400만원, 7천만원 초과는 1명 275만원·2명 이상 300만원입니다(조세특례제한법 제126조의2 제10항).": ["same", "/card-income-deduction-basics", "2026년 사용분부터 해당 자녀 등이 1명이면 기본 한도는 총급여 7,000만원 이하 350만원·초과 275만원, 2명 이상이면 각각 400만원·300만원입니다."],
  "P3-1|표의 숫자는 2026년 9월 18일 시행 조세특례제한법 제126조의2로 계산한 가정 사례입니다.": ["kept"],
  "P3-8|/payment-method-switch-nov-dec|mi=2227&amp;cntntsId=7667": ["kept"],
  "P3-8|/dual-income-deduction-allocation|mi=2227&amp;cntntsId=7667": ["dropped", "맞벌이 글의 세율 구간 비교를 연말정산 글 6절의 한 문단으로 줄이며 세율 안내 출처를 옮기지 않았다(카드 글에는 남음)"],
  "P2-3|가족 교육비는 가족의 나이와 소득을 따지지 않습니다(2026년 지출분부터, 소득세법 제59조의4 제3항).": ["kept"],
  "P2-3|그 전 해까지는 가족의 연간 소득금액이 100만원을 넘으면 대상이 아니었습니다.": ["kept"],
  "P3-2|2026년 지출분부터는 과세기간 종료일 현재 9세 미만 또는 초등학교 2학년 이하인 자녀의 예능 학원(음악·미술 등)과 체육시설 수강료도 교육비에 들어갑니다(월 단위로 주 1회 이상 다니는 과정, 1명당 연 300만원 한도 안).": ["kept"],
  "P3-3|고향사랑기부금은 10만원 이하 금액에 110분의 100, 10만원 초과 20만원 이하에 40%, 20만원을 넘어 2천만원까지는 15%(특별재난지역은 30%)를 세액공제합니다(2026년 기부분부터, 조세특례제한법 제58조).": ["dropped", "기부금 칸을 ‘정치자금·고향사랑 기부금은 별도 계산’ 으로 줄였다(결정 5 — 구간은 국세청 안내로)"],
  "P3-9|>국세청 기부금 세액공제 안내(2025년 귀속 기준)<": ["same", "/year-end-tax-expense-check", ">국세청 연말정산 맞춤형 안내 — 기부금 세액공제(2025년 귀속 기준)<"],
  "P2-4|<td>과세기간 종료일 현재 무주택 세대주, 총급여 8천만원 이하, 국민주택규모(전용면적 기준 85㎡, 다만 수도권 밖의 읍·면 중 도시지역이 아닌 곳은 100㎡) 이하 또는 기준시가 4억원 이하 주택(오피스텔·고시원 포함), 계약서 주소와 주민등록 주소가 같을 것</td>": ["same", "/rent-tax-credit-records", "국민주택규모(전용 85㎡, 수도권 밖 도시지역이 아닌 읍·면은 100㎡) 또는 기준시가 4억원 이하. 오피스텔·고시원 포함."],
  "P2-4|빌린 집은 국민주택규모(전용면적 기준 85㎡, 다만 수도권 밖의 읍·면 중 도시지역이 아닌 곳은 100㎡) 이하이거나 기준시가 4억원 이하여야 하고(주거용 오피스텔·고시원 포함), 임대차계약서의 주소와 주민등록 주소가 같아야 합니다.": ["same", "/rent-tax-credit-records", "임대차계약증서의 주소지와 주민등록표등본의 주소지가 같아야 하고"],
  "P3-7|2024~2026년에 혼인신고를 했다면 결혼세액공제(1인 50만원, 생애 한 번)도 확인합니다.": ["kept"],
  "P3-5|금리가 높은 빚은 갚은 원금만큼 이자가 줄어 우선순위가 높습니다.": ["same", "/year-end-tax-expense-check", "카드론이나 현금서비스처럼 금리가 높은 빚이 있다면 원금을 줄이는 데 씁니다."],
  "P2-5|<td>총급여 8천만원 이하, 과세기간 종료일 현재 무주택 세대주, 국민주택규모 또는 기준시가 4억원 이하 주택</td>": ["kept"],
  "P2-5|월세로 사는 집은 국민주택규모 이하이거나 기준시가가 4억원을 넘지 않아야 하고, 주민등록상 주소가 임대차계약서 주소와 같아야 합니다.": ["same", "/rent-tax-credit-records", "임대차계약증서의 주소지와 주민등록표등본의 주소지가 같아야 하고"],
  "P2-6|<td>무주택 또는 1주택 세대주, 취득 당시 기준시가 6억원 이하 주택(2024년 이후 취득분 기준)</td>": ["kept"],
  "P2-6|2024년 1월 1일 이후 취득한 주택은 취득 당시 기준시가가 6억원 이하여야 하고, 그 전에 취득한 주택은 취득 시점의 기준시가 기준(예: 2019~2023년 취득 5억원)을 따릅니다.": ["kept"],
  "P2-6|대환·채무 인수와 자세한 연도별 기준은 국세청 안내로 확인합니다.": ["kept"],
  "P3-6|과거 차입금의 경과규정은 차입일과 상환 조건에 따라 다르므로 해당 연도의 국세청 안내와 대출 증명서로 확인합니다.": ["kept"],
  "P3-6|2026년부터는 주소지의 시·군·자치구가 서로 다르고 배우자와 같은 주소에 거주하는 해당 가족도 무주택인 등 법정 요건을 충족한 주말부부가 각각 공제받을 수 있고(합계 1천만원 한도), 해당 근로자의 기본공제대상자인 자녀(입양자·위탁아동 포함) 및 손자녀가 3명 이상이면 100㎡ 이하 주택까지 대상이 넓어집니다.": ["same", "/rent-tax-credit-records", "주소지가 다른 시·군·구에 사는 배우자도 요건을 갖추면 추가로 공제받을 수 있는 조항이 신설되었습니다", "기본공제 대상 자녀·손자녀가 3명 이상이면 주거전용면적 100㎡ 이하"],
};
// 합친 글의 같은 사실 쪽에서 옛 표현이 남지 않았는지(앞 판 SAME_FACT 의 옛 문장 + 검토가 짚은 6절 옛 요건).
const MERGED_GONE_V229142 = [
  ["/card-income-deduction-basics", ["2025년 12월 개정 법문은", "어느 해 사용분부터 적용되는지는 국세청 안내로 확인합니다"]],
  ["/year-end-tax-expense-check", ["기본공제대상자인 가족을 위해", "본인과 기본공제 대상 부양가족의 교육비", "부모님 병원비가 공제 가능한지", "의료비·교육비·보험료·기부금은 본인뿐 아니라 기본공제 대상 부양가족의 지출도 합칠 수 있어", "나이 요건도 있습니다."]],
];
const TAX_BASIS = "이 글은 2026년 지출(2026년 귀속, 2027년 1~2월 정산) 기준이며 숫자는 2026년 11월 3일 시행 중인 소득세법·조세특례제한법으로 확인했습니다.";
const CLOSE_SELECTOR = 'div.abNoticeBand form.abNoticeHide button.abNoticeClose[type="submit"][aria-label]';
const THEME_SUBMIT_SELECTOR = '.abV2281 button[type="submit"]:not(.danger):not(.delBtn):not(.secondary)';
// CSS 특이도(아이디, 클래스·속성·가상 클래스, 요소). :not(X) 는 X 의 특이도를 더한다(이 검사가 쓰는 단순 선택자 범위).
const specificity = (selector) => {
  let extra = [0, 0, 0];
  const rest = selector.replace(/:not\(([^()]*)\)/g, (_, inside) => { extra = extra.map((value, index) => value + specificity(inside)[index]); return ""; });
  const plain = rest.replace(/\[[^\]]*\]/g, "");
  return [
    (plain.match(/#[\w-]+/g) || []).length + extra[0],
    (rest.match(/\[[^\]]*\]/g) || []).length + (plain.match(/\.[\w-]+|:[\w-]+/g) || []).length + extra[1],
    (plain.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) || []).length + extra[2],
  ];
};
const compareSpecificity = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
// 스타일 자산에서 선택자 목록에 THEME_SUBMIT_SELECTOR 가 그대로 든 첫 규칙의 선언(없으면 빈 글).
const themeSubmitRule = (css) => {
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (selectors.split(",").map((part) => part.trim()).includes(THEME_SUBMIT_SELECTOR)) return body;
  return "";
};

try {
  await fixture(async (fx) => {
    fx.env.NOTICE_TEXT = NOTICE_TEXT;
    fx.env.NOTICE_LINK = NOTICE_LINK;
    const hash = createHash("sha256").update(NOTICE_TEXT + NOTICE_LINK).digest("hex").slice(0, 16);
    const hiddenCookie = `ab_notice_hide=${hash}`;
    const expectedSetCookie = `${hiddenCookie}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`;
    // ── A-1 공지 띠 닫기 ‘×’ ──
    const targets = [
      ["공개 첫 화면", "/", ""], ["공개 FAQ", "/faq", ""], ["글 목록", "/articles", ""], ["세무 글", "/rent-tax-credit-records", ""],
      // 로그인 전 사용자 화면은 /my 시작 화면 하나다(/app·/my/settings 등은 /my 로 303).
      ["로그인 화면", "/my", ""],
      // 앱 화면의 띠는 /app·/my·/my/* 셸에만 붙는다(V22.9.95 attachNoticeBand 그대로).
      ["앱 홈", "/app", fx.cookie], ["앱 설정", "/my/settings", fx.cookie], ["앱 가계부 목록", "/my/households", fx.cookie],
    ];
    const sizes = [];
    const themeSubmitPages = [];
    const stylesheets = new Map();
    for (const [name, path, cookie] of targets) {
      const target = `${path}?view=a&topic=b`;
      const shown = await page(fx, target, { cookie });
      eq(shown.status, 200, `A-1 ${name}(${path}): 화면이 그려진다`);
      // 이 화면이 읽는 스타일 자산 중 테마 제출 단추 규칙이 있는지(아래 특이도 검사의 근거).
      for (const [, href] of shown.html.matchAll(/<link rel="stylesheet" href="(\/assets\/[^"]+\.css)"/g)) {
        if (!stylesheets.has(href)) stylesheets.set(href, (await page(fx, href, { cookie: "" })).html);
        if (/background:[^;}]*!important/.test(themeSubmitRule(stylesheets.get(href))) && !themeSubmitPages.includes(name)) themeSubmitPages.push(name);
      }
      if (name.startsWith("로그인")) ok(shown.html.includes('id="login-start"') && !shown.html.includes('href="/my/logout"'), `A-1 ${name}: 로그인 전 시작 화면이다`);
      const band = bandOf(shown.html);
      ok(band.startsWith('<div class="abNoticeBand" role="status"><p>') && band.includes(`<a href="${NOTICE_LINK}">자세히</a>`), `A-1 ${name}: 공지 띠(글·자세히)가 있다`);
      eq(shown.html.split('<div class="abNoticeBand"').length - 1, 1, `A-1 ${name}: 띠는 한 번만 있다`);
      eq((band.match(/<form\b/g) || []).length, 1, `A-1 ${name}: 띠의 폼은 하나다`);
      ok(band.includes('<form class="abNoticeHide" method="post" action="/notice/hide"><input type="hidden" name="back" value="'), `A-1 ${name}: 폼은 /notice/hide 로 POST 한다(새 주소 없음)`);
      const buttons = [...band.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)];
      eq(buttons.length, 2, `A-1 ${name}: 단추는 ‘오늘 하루 안 보기’ 와 ‘×’ 둘이다`);
      eq(buttons[0]?.[0], HIDE_BUTTON, `A-1 ${name}: ‘오늘 하루 안 보기’ 단추는 그대로다`);
      eq(buttons[1]?.[0], CLOSE_BUTTON, `A-1 ${name}: 둘째 단추는 aria-label "공지 닫기" 인 제출 단추 ‘×’ 다`);
      ok(band.endsWith(`${CLOSE_BUTTON}</form></div>`), `A-1 ${name}: ‘×’ 는 띠의 마지막 요소다(보이는 순서·탭 순서 모두 맨 끝)`);
      for (const [, attributes] of buttons) ok(!/\b(?:name|value|form|formaction|formmethod|formenctype|formtarget|formnovalidate)=/i.test(attributes), `A-1 ${name}: 단추에 name·value·form* 속성이 없어 두 단추가 보내는 값이 같다 (${attributes.trim()})`);
      ok(!/<script|\son[a-z]+=|javascript:/i.test(band), `A-1 ${name}: 띠는 스크립트 없이 동작한다`);
      // 브라우저처럼 폼을 직렬화한다. 제출 단추는 name 이 있을 때만 값을 보태므로(두 단추 모두 없음) 두 단추의 요청은 같다.
      const { found, fields } = formFields(shown.html, "/notice/hide");
      ok(found && [...fields.keys()].join(",") === "back" && fields.get("back") === target, `A-1 ${name}: 폼은 돌아올 주소(back=${target}) 하나만 보낸다`);
      const answers = [];
      for (const [button, attributes] of buttons) {
        const submitted = new URLSearchParams(fields);
        const named = attributes.match(/\bname="([^"]*)"/);
        if (named) submitted.append(named[1], (attributes.match(/\bvalue="([^"]*)"/) || [, ""])[1]);
        const answer = await post(fx, "/notice/hide", submitted, { cookie });
        eq(answer.status, 303, `A-1 ${name}: ${button.includes("×") ? "×" : "오늘 하루 안 보기"} → 303`);
        eq(answer.location, target, `A-1 ${name}: ${button.includes("×") ? "×" : "오늘 하루 안 보기"} → 같은 화면으로 돌아간다`);
        eq(answer.setCookie, expectedSetCookie, `A-1 ${name}: ${button.includes("×") ? "×" : "오늘 하루 안 보기"} → 같은 쿠키·24시간 만료`);
        answers.push(JSON.stringify([answer.status, answer.location, answer.setCookie]));
      }
      eq(answers[1], answers[0], `A-1 ${name}: ‘×’ 와 ‘오늘 하루 안 보기’ 의 답(상태·이동·쿠키·만료)이 똑같다`);
      const hidden = await page(fx, target, { cookie: [cookie, hiddenCookie].filter(Boolean).join("; ") });
      eq(hidden.status, 200, `A-1 ${name}: 숨긴 뒤에도 화면이 그려진다`);
      ok(!hidden.html.includes("abNoticeBand") && !hidden.html.includes("abNoticeClose"), `A-1 ${name}: 숨긴 뒤에는 띠·닫기 단추·띠 스타일이 없다`);
      sizes.push([path, Buffer.byteLength(shown.html), Buffer.byteLength(hidden.html)]);
      // 띠 하나(스타일·글·폼·두 단추)의 바이트: V22.9.99 스타일 + 띠 → 이번 판 ×(테마보다 특이도 높은 규칙·단추) 더해 2,000 B 안.
      ok(Buffer.byteLength(shown.html) - Buffer.byteLength(hidden.html) <= 2000, `A-1 ${name}: 띠 비용이 2,000 B 이하다 (${Buffer.byteLength(shown.html) - Buffer.byteLength(hidden.html)} B)`);
    }
    // 스타일: 띠가 × 의 기준 상자이고(폼은 기준이 아님) × 는 오른쪽 끝 44×44, 바탕은 투명·글자색은 띠를 따른다(밝게·어둡게 대비 그대로).
    const style = styleOf((await page(fx, "/faq", { cookie: "" })).html);
    const bandRule = (style.match(/\.abNoticeBand\{([^}]*)\}/) || [])[1] || "";
    const formRule = (style.match(/\.abNoticeBand \.abNoticeHide\{([^}]*)\}/) || [])[1] || "";
    const closeAt = style.indexOf(`${CLOSE_SELECTOR}{`);
    const closeRule = closeAt < 0 ? "" : style.slice(closeAt + CLOSE_SELECTOR.length + 1, style.indexOf("}", closeAt));
    ok(closeRule.length > 0, `A-1 × 규칙(${CLOSE_SELECTOR})이 띠 스타일에 있다`);
    ok(/(?:^|;)position:relative(?:;|$)/.test(bandRule), "A-1 띠는 position:relative 다(× 의 기준)");
    const padding = (bandRule.match(/(?:^|;)padding:(\d+)px (\d+)px (\d+)px (\d+)px/) || []).slice(1).map(Number);
    ok(padding.length === 4 && padding[1] >= 48, `A-1 띠 오른쪽 여백(${padding[1]}px)이 × 자리(오른쪽 4px + 44px) 이상이다`);
    ok(/(?:^|;)background:#fff4cc;color:#4a3800(?:;|$)/.test(bandRule), "A-1 띠 색(밝게)은 그대로다");
    ok(/(?:^|;)position:static(?:;|$)/.test(formRule), "A-1 폼은 position:static 이라 × 가 띠 오른쪽 끝에 붙는다");
    ok(/(?:^|;)position:absolute(?:;|$)/.test(closeRule) && /(?:^|;)right:\d+px(?:;|$)/.test(closeRule), "A-1 × 는 띠 오른쪽 끝에 놓인다");
    const px = (prop) => Number((closeRule.match(new RegExp(`(?:^|;)${prop}:(\\d+)px(?:;|$)`)) || [])[1] || 0);
    ok(px("width") >= 44 && px("height") >= 44 && px("min-width") >= 44, `A-1 × 누름 영역이 44×44 이상이다 (${px("width")}×${px("height")})`);
    const closeDeclarations = closeRule.split(";");
    ok(["border:0!important", "background:transparent!important", "color:inherit!important", "box-shadow:none!important"].every((declaration) => closeDeclarations.includes(declaration)),
      "A-1 × 는 바탕 투명·테두리·그림자 없음이고 글자색은 띠를 따른다(!important, 밝게·어둡게 대비 그대로)");
    ok(style.includes(".abNoticeBand .abNoticeHide button{min-height:44px;padding:8px 4px;border:0!important;background:transparent!important;color:inherit!important;"), "A-1 두 단추 공통 규칙은 그대로다");
    ok(style.includes(".abNoticeHide button:focus-visible{outline:2px solid currentColor;outline-offset:2px}"), "A-1 × 도 키보드 초점 윤곽선을 받는다");
    // 화면 테마의 제출 단추 규칙(class="secondary" 가 아닌 제출 단추를 !important 파랑 바탕·흰 글자로 칠함)이 띠가 보이는 화면의 스타일 자산에 있다.
    // × 는 secondary 가 아니므로 × 규칙의 특이도가 그보다 높아야 띠와 같은 모양(투명 바탕·띠 글자색)이 된다.
    ok(themeSubmitPages.length >= 4 && ["공개 FAQ", "로그인 화면", "앱 홈", "앱 설정"].every((name) => themeSubmitPages.includes(name)),
      `A-1 테마 제출 단추 규칙을 읽는 띠 화면: ${themeSubmitPages.join(", ")}`);
    const closeSpecificity = specificity(CLOSE_SELECTOR), themeSpecificity = specificity(THEME_SUBMIT_SELECTOR);
    ok(compareSpecificity(closeSpecificity, themeSpecificity) > 0, `A-1 × 규칙 특이도 ${closeSpecificity} 가 테마 제출 단추 규칙 ${themeSpecificity} 보다 높다`);
    eq(String(specificity(".abV2281 button")), "0,1,1", "A-1 특이도 셈 자체 확인(클래스 하나·요소 하나)");
    // 홈(앱) 예산: 띠가 보여도 35 KiB 안.
    const home = sizes.find(([path]) => path === "/app");
    ok(home && home[1] < 35 * 1024, `A-1 띠가 보이는 앱 홈 HTML 이 35 KiB 예산 안이다 (${home?.[1]} B)`);
    console.log("A-1 공지 띠 HTML 바이트(보임·숨김):", JSON.stringify(sizes));

    // ── A-2 첫 화면 글 목록(V22.9.140 ‘처음이라면 이 글부터’) ──
    // 띠 없이 잰다(공지 변수는 운영 값이라 바뀔 수 있다).
    delete fx.env.NOTICE_TEXT;
    delete fx.env.NOTICE_LINK;
    const landing = await page(fx, "/", { cookie: "" });
    eq(landing.status, 200, "A-2 첫 화면이 그려진다");
    const recentSection = (landing.html.match(/<section class="pubSection" id="section-\d+"><h2>처음이라면 이 글부터<\/h2>[\s\S]*?<\/section>/) || [""])[0];
    ok(recentSection.length > 0, "A-2 첫 화면에 ‘처음이라면 이 글부터’ 절이 있다");
    eq(landing.html.split("<h2>처음이라면 이 글부터</h2>").length - 1, 1, "A-2 ‘처음이라면 이 글부터’ 절은 하나다");
    eq(landing.html.split("<h2>최근 글</h2>").length - 1, 0, "A-2 작성일 순 ‘최근 글’ 절은 없다(V22.9.140)");
    const homeLinks = [...recentSection.matchAll(/<a href="([^"]+)">([^<]*)<span aria-hidden="true"> →<\/span><\/a>/g)].map((m) => [m[1], m[2]]);
    // 글 목록 허브(/articles)의 카드(제목·작성일)에서 고른 8편을 찾아 제목을 맞춘다.
    const hub = await page(fx, "/articles", { cookie: "" });
    const cards = [...hub.html.matchAll(/<li><a href="(\/[^"]+)">([^<]+)<\/a><p>[^<]*<\/p><small>작성 (\d{4}-\d{2}-\d{2})/g)].map((m) => ({ path: m[1], title: m[2], published: m[3] }));
    // V22.9.142: 글 9편을 합쳐 허브 카드는 31편이다.
    ok(cards.length >= 31, `A-2 허브 카드에서 글 ${cards.length}편을 읽었다`);
    const expected = STARTER_PATHS.map((path) => cards.find((card) => card.path === path));
    ok(expected.every(Boolean), "A-2 고른 8편이 모두 글 목록 허브에 있다");
    eq(homeLinks.length, RECENT_COUNT + 1, `A-2 첫 화면 글 목록은 ${RECENT_COUNT}편 + 전체 목록 링크다`);
    eq(JSON.stringify(homeLinks.slice(0, RECENT_COUNT)), JSON.stringify(expected.map((card) => [card.path, card.title])), "A-2 첫 화면 글 목록은 읽을 순서로 고른 8편이고 제목이 허브와 같다");
    eq(JSON.stringify(homeLinks[RECENT_COUNT]), JSON.stringify(["/articles", "생활비 가이드 글 전체 목록 보기"]), "A-2 마지막 링크는 전체 목록(/articles)이다");
    for (const path of TAX_PATHS) ok(!homeLinks.some(([href]) => href === path), `A-2 ${path}: 연말정산·절세 글은 첫 화면 글 목록에 없다(글 목록 허브에서 본다)`);
    const sitemap = (await page(fx, "/sitemap.xml", { cookie: "" })).html;
    const lastmodOf = (path) => (sitemap.match(new RegExp(`<loc>${BASE.replace(/[.]/g, "\\.")}${path === "/" ? "/" : path}</loc>\\s*<lastmod>([^<]+)</lastmod>`)) || [])[1] || "";
    for (const [path] of homeLinks) {
      const linked = await page(fx, path, { cookie: "" });
      eq(linked.status, 200, `A-2 ${path}: 200 이다`);
      ok(linked.html.includes(`<link rel="canonical" href="${BASE}${path}"`), `A-2 ${path}: 정본 주소가 자기 자신이다`);
      ok(lastmodOf(path).length === 10, `A-2 ${path}: 사이트맵에 있다 (lastmod ${lastmodOf(path)})`);
    }
    // 첫 화면 수정일은 목록 글들의 가장 늦은 수정일보다 이르지 않다(화면 글·JSON-LD·사이트맵이 같은 값).
    const newestUpdate = expected.map((card) => lastmodOf(card.path)).sort().at(-1);
    ok(lastmodOf("/") >= newestUpdate, `A-2 첫 화면 lastmod(${lastmodOf("/")})가 목록 글의 가장 늦은 수정일(${newestUpdate}) 이상이다`);
    ok(landing.html.includes(`"dateModified":"${lastmodOf("/")}"`) && landing.html.includes(`<time datetime="${lastmodOf("/")}">`), "A-2 첫 화면 JSON-LD·화면 수정일이 사이트맵 lastmod 와 같다");
    // 첫 화면 바이트: 최근 글 절은 2 KiB, 첫 화면 전체는 36 KiB 안(V22.9.103 34,828 B 에서 링크 4개 몫만 늘었다).
    ok(Buffer.byteLength(recentSection) <= 2048, `A-2 첫 화면 글 목록 절이 2 KiB 안이다 (${Buffer.byteLength(recentSection)} B)`);
    ok(Buffer.byteLength(landing.html) <= 36 * 1024, `A-2 첫 화면 HTML 이 36 KiB 안이다 (${Buffer.byteLength(landing.html)} B)`);
    ok(!recentSection.includes("무료"), "A-2 첫 화면 글 목록 절에 ‘무료’ 가 없다");

    // ── A-4 세무 글 8편 사실 확인 고침(H-10 보고 P2 6건·P3 9건) ──
    const taxPages = new Map();
    for (const path of TAX_PATHS) {
      if (TAX_MERGED_V229142[path]) {
        const moved = await page(fx, path, { cookie: "" });
        eq(moved.status, 308, `A-4 ${path}: 합친 글로 308 이다(V22.9.142)`);
        eq(moved.location, `${BASE}${TAX_MERGED_V229142[path]}${TAX_ANCHOR_V229142[path]}`, `A-4 ${path}: 308 대상이 합친 글의 그 내용 절이다`);
        ok(!lastmodOf(path), `A-4 ${path}: 사이트맵에 없다`);
        continue;
      }
      const article = await page(fx, path, { cookie: "" });
      eq(article.status, 200, `A-4 ${path}: 200 이다`);
      taxPages.set(path, article.html);
      const html = article.html;
      // P2-1 기준 한 줄: 머리(pubHero) 안, 작성·수정일 줄 바로 다음에 한 번.
      const hero = (html.match(/<header class="pubHero">[\s\S]*?<\/header>/) || [""])[0];
      const metaAt = hero.indexOf('<p class="pubMeta">'), basisTag = `<p class="pubMeta pubBasis">${TAX_BASIS}</p>`;
      eq(html.split('class="pubMeta pubBasis"').length - 1, 1, `A-4 P2-1 ${path}: 기준 한 줄은 한 번만 있다`);
      ok(metaAt >= 0 && hero.indexOf(basisTag) > metaAt && hero.indexOf(basisTag) === hero.indexOf("</p>", metaAt) + 4, `A-4 P2-1 ${path}: 기준 한 줄(2026년 귀속·법령 확인 시점)이 머리의 작성·수정일 줄 바로 다음에 있다`);
      // 날짜: 작성일은 그대로, 수정일만 이번 판(상수 하나).
      ok(hero.includes(`수정 <time datetime="${taxUpdatedFor(path)}">${taxUpdatedFor(path)}</time>`) && hero.includes(`작성 <time class="pubPublished" datetime="${TAX_PUBLISHED}">${TAX_PUBLISHED}</time>`), `A-4 ${path}: 화면 작성 ${TAX_PUBLISHED}·수정 ${TAX_UPDATED}`);
      const structured = JSON.parse((html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [, "{}"])[1]);
      eq(structured.datePublished, TAX_PUBLISHED, `A-4 ${path}: JSON-LD datePublished 는 그대로다`);
      eq(structured.dateModified, taxUpdatedFor(path), `A-4 ${path}: JSON-LD dateModified 가 수정일이다`);
      eq(lastmodOf(path), taxUpdatedFor(path), `A-4 ${path}: 사이트맵 lastmod 가 수정일이다`);
      ok(!html.includes("무료"), `A-4 ${path}: ‘무료’ 가 없다`);
    }
    eq(lastmodOf("/articles"), "2026-11-24", "A-4 글 목록 허브 lastmod 가 수정일로 올라간다(V22.9.142)");
    ok(hub.html.includes(`${TAX_PUBLISHED}에 올린`), "A-4 허브 머리말의 가장 최근 글 날짜는 작성일 그대로다");
    // 기준 한 줄은 세무 글 8편에만 있다(다른 글·화면에는 없다).
    // V22.9.142: 합친 세무 글 셋(연말정산·카드·월세)은 V22.9.142 기준 한 줄을 가지므로 여기서는 세무 글이 아닌 화면만 본다.
    for (const path of ["/single-household-living-cost", "/food-cost-benchmark", "/articles", "/"]) ok(!(await page(fx, path, { cookie: "" })).html.includes("pubBasis"), `A-4 ${path}: 기준 한 줄이 없다`);
    // 고친 문장마다: 새 문장이 있고 옛 문장은 없다(화면 HTML 기준, & 는 &amp; 로 그려진다).
    const seenMergedFacts = new Set();
    const FIXES = [
      ["P2-2", "/payment-method-switch-nov-dec", ["기본 한도: 자녀 등이 없으면 총급여 7천만원 이하는 연 300만원, 넘으면 연 250만원입니다.", "자녀·손자녀 등 대통령령으로 정하는 부양가족이 있으면 2026년 사용분부터 한도가 커집니다.", "총급여 7천만원 이하는 1명 350만원·2명 이상 400만원, 7천만원 초과는 1명 275만원·2명 이상 300만원입니다(조세특례제한법 제126조의2 제10항)."], ["2025년 12월 개정 법문은", "어느 해 사용분부터 적용되는지는 국세청 안내로 확인합니다"]],
      ["P3-1", "/payment-method-switch-nov-dec", ["표의 숫자는 2026년 9월 18일 시행 조세특례제한법 제126조의2로 계산한 가정 사례입니다."], ["올해 9월 시행 중인"]],
      ["P3-8", "/payment-method-switch-nov-dec", ["mi=2227&amp;cntntsId=7667"], ["mi=2229"]],
      ["P3-8", "/dual-income-deduction-allocation", ["mi=2227&amp;cntntsId=7667"], ["mi=2229"]],
      ["P2-3", "/medical-education-donation-deductions", ["가족 교육비는 가족의 나이와 소득을 따지지 않습니다(2026년 지출분부터, 소득세법 제59조의4 제3항).", "그 전 해까지는 가족의 연간 소득금액이 100만원을 넘으면 대상이 아니었습니다."], ["기본공제대상자인 가족을 위해"]],
      ["P3-2", "/medical-education-donation-deductions", ["2026년 지출분부터는 과세기간 종료일 현재 9세 미만 또는 초등학교 2학년 이하인 자녀의 예능 학원(음악·미술 등)과 체육시설 수강료도 교육비에 들어갑니다(월 단위로 주 1회 이상 다니는 과정, 1명당 연 300만원 한도 안)."], ["대상 나이와 적용되는 해는 국세청 안내로 확인합니다"]],
      ["P3-3", "/medical-education-donation-deductions", ["고향사랑기부금은 10만원 이하 금액에 110분의 100, 10만원 초과 20만원 이하에 40%, 20만원을 넘어 2천만원까지는 15%(특별재난지역은 30%)를 세액공제합니다(2026년 기부분부터, 조세특례제한법 제58조)."], ["최근 개정으로 구간이 나뉘었으므로"]],
      ["P3-9", "/medical-education-donation-deductions", [">국세청 기부금 세액공제 안내(2025년 귀속 기준)<"], [">국세청 기부금 세액공제 안내<"]],
      ["P3-4", "/pension-savings-irp-tax-credit", ["일반적인 연금 외 수령에서는 세액공제를 받은 납입액과 운용수익에 기타소득세 15%(지방소득세 별도)가 적용됩니다."], ["공제받은 혜택만큼 세금을 다시 낼 수 있습니다"]],
      ["P2-4", "/single-household-year-end-tax", ["<td>과세기간 종료일 현재 무주택 세대주, 총급여 8천만원 이하, 국민주택규모(전용면적 기준 85㎡, 다만 수도권 밖의 읍·면 중 도시지역이 아닌 곳은 100㎡) 이하 또는 기준시가 4억원 이하 주택(오피스텔·고시원 포함), 계약서 주소와 주민등록 주소가 같을 것</td>", "빌린 집은 국민주택규모(전용면적 기준 85㎡, 다만 수도권 밖의 읍·면 중 도시지역이 아닌 곳은 100㎡) 이하이거나 기준시가 4억원 이하여야 하고(주거용 오피스텔·고시원 포함), 임대차계약서의 주소와 주민등록 주소가 같아야 합니다."], ["<td>과세기간 종료일 현재 무주택 세대주, 총급여 8천만원 이하</td>"]],
      ["P3-7", "/single-household-year-end-tax", ["2024~2026년에 혼인신고를 했다면 결혼세액공제(1인 50만원, 생애 한 번)도 확인합니다."], []],
      ["P3-5", "/tax-refund-money-plan", ["금리가 높은 빚은 갚은 원금만큼 이자가 줄어 우선순위가 높습니다."], ["확실히"]],
      ["P2-5", "/housing-deductions-overview", ["<td>총급여 8천만원 이하, 과세기간 종료일 현재 무주택 세대주, 국민주택규모 또는 기준시가 4억원 이하 주택</td>", "월세로 사는 집은 국민주택규모 이하이거나 기준시가가 4억원을 넘지 않아야 하고, 주민등록상 주소가 임대차계약서 주소와 같아야 합니다."], ["<td>총급여 8천만원 이하, 과세기간 종료일 현재 무주택 세대주</td>"]],
      ["P2-6", "/housing-deductions-overview", ["<td>무주택 또는 1주택 세대주, 취득 당시 기준시가 6억원 이하 주택(2024년 이후 취득분 기준)</td>", "2024년 1월 1일 이후 취득한 주택은 취득 당시 기준시가가 6억원 이하여야 하고, 그 전에 취득한 주택은 취득 시점의 기준시가 기준(예: 2019~2023년 취득 5억원)을 따릅니다.", "대환·채무 인수와 자세한 연도별 기준은 국세청 안내로 확인합니다."], ["주택을 취득할 당시 기준시가가 6억원 이하여야 하고"]],
      ["P3-6", "/housing-deductions-overview", ["과거 차입금의 경과규정은 차입일과 상환 조건에 따라 다르므로 해당 연도의 국세청 안내와 대출 증명서로 확인합니다.", "2026년부터는 주소지의 시·군·자치구가 서로 다르고 배우자와 같은 주소에 거주하는 해당 가족도 무주택인 등 법정 요건을 충족한 주말부부가 각각 공제받을 수 있고(합계 1천만원 한도), 해당 근로자의 기본공제대상자인 자녀(입양자·위탁아동 포함) 및 손자녀가 3명 이상이면 100㎡ 이하 주택까지 대상이 넓어집니다."], []],
    ];
    for (const [id, path, now, gone] of FIXES) {
      // V22.9.142: 옛 주소의 문장은 합친 글에서 본다. 합치며 덜어 낸 문장은 KEPT_V229142 에 없어 건너뛴다.
      const target = TAX_MERGED_V229142[path] || path;
      if (!taxPages.has(target)) taxPages.set(target, (await page(fx, target, { cookie: "" })).html);
      const html = taxPages.get(target);
      for (const sentence of now) {
        ok(!/무료|예정|약속|보장/.test(sentence), `A-4 ${id} ${path}: 고친 문장에 ‘무료’·미래 약속 말이 없다`);
        if (target === path) { ok(html.includes(sentence), `A-4 ${id} ${path}: 고친 문장이 있다 — ${sentence.slice(0, 48)}…`); continue; }
        // V22.9.142: 합친 글 — 분류표에 반드시 있다(P3-8 은 두 글에 같은 문장이라 주소까지 붙인다).
        const key = MERGED_FACTS_V229142[`${id}|${path}|${sentence}`] ? `${id}|${path}|${sentence}` : `${id}|${sentence}`;
        const fact = MERGED_FACTS_V229142[key];
        ok(Boolean(fact), `A-4 ${id} ${path}: 합친 글로 간 고친 문장이 분류표에 있다 — ${sentence.slice(0, 48)}…`);
        if (!fact) continue;
        seenMergedFacts.add(key);
        if (fact[0] === "kept") ok(html.includes(sentence), `A-4 ${id} ${path} → ${target}: 고친 문장이 그대로 있다 — ${sentence.slice(0, 48)}…`);
        else if (fact[0] === "same") {
          if (!taxPages.has(fact[1])) taxPages.set(fact[1], (await page(fx, fact[1], { cookie: "" })).html);
          for (const text of fact.slice(2)) ok(taxPages.get(fact[1]).includes(text), `A-4 ${id} ${path} → ${fact[1]}: 같은 사실을 말한다 — ${text.slice(0, 48)}…`);
        } else ok(fact[0] === "dropped" && String(fact[1] || "").length >= 20 && !html.includes(sentence), `A-4 ${id} ${path} → ${target}: 덜어 낸 까닭이 있고 문장은 없다`);
      }
      for (const old of gone) ok(!html.includes(old), `A-4 ${id} ${path}: 옛 문장이 없다 — ${old.slice(0, 48)}`);
    }
    eq(new Set(FIXES.map(([id]) => id)).size, 14, "A-4 P2-2~P2-6·P3-1~P3-9 를 모두 확인했다(P2-1 은 위 기준 한 줄)");
    // V22.9.142: 분류표의 22개가 모두 쓰였다(남는 줄 = 고친 문장이 바뀌었는데 표가 묵은 것).
    eq(seenMergedFacts.size, Object.keys(MERGED_FACTS_V229142).length, "A-4 합친 글 분류표의 줄이 모두 FIXES 의 고친 문장이다(V22.9.142)");
    eq(Object.keys(MERGED_FACTS_V229142).length, 22, "A-4 합친 글로 간 고친 문장은 22개다(V22.9.142)");
    for (const [target, gone] of MERGED_GONE_V229142) {
      const html = taxPages.get(target) || (await page(fx, target, { cookie: "" })).html;
      for (const old of gone) ok(!html.includes(old), `A-4 ${target}: 옛 표현이 없다 — ${old.slice(0, 48)}`);
    }
  });
} finally {
  globalThis.fetch = realFetch;
}

// 원본: 새 주소·스크립트 없이 같은 처리기를 쓴다.
const postprocess = readFileSync(new URL("../src/modules/web/html-postprocess.js", import.meta.url), "utf8");
eq((postprocess.match(/aria-label="공지 닫기"/g) || []).length, 1, "A-1 원본: 닫기 단추는 띠를 그리는 한 곳에만 있다");
const router = readFileSync(new URL("../src/modules/worker/router.js", import.meta.url), "utf8");
eq((router.match(/notice\/hide/g) || []).length, 1, "A-1 원본: 숨김 주소는 /notice/hide 하나 그대로다(GET 주소를 더하지 않았다)");

// A-4 원본: V22.9.104 에는 수정일 상수 하나와 작성일 8개였다. V22.9.142 부터 연금저축·IRP 한 편만 남고(7편은 합친 글로),
// 그 상수는 쓰던 결제수단 글이 합쳐져 쓰는 곳이 없어 지웠다.
const taxSource = readFileSync(new URL("../src/modules/public/living-cost-articles-v22997.js", import.meta.url), "utf8");
eq((taxSource.match(/PUBLIC_TAX_ARTICLES_UPDATED_V229104/g) || []).length, 0, "A-4 원본: 쓰는 곳이 없어진 V22.9.104 수정일 상수는 지웠다(V22.9.142)");
eq((taxSource.match(/2026-11-06/g) || []).length, 0, "A-4 원본: 날짜 글자 2026-11-06 이 남지 않았다(V22.9.142)");
eq((taxSource.match(/"published": "2026-11-03",/g) || []).length, 1, "A-4 원본: 남은 한 편의 작성일은 그대로다");
eq((taxSource.match(/"updated": "2026-11-24",/g) || []).length, 1, "A-4 원본: 남은 한 편의 수정일은 2026-11-24 다(V22.9.142)");
eq((taxSource.match(/"basis": PUBLIC_TAX_ARTICLE_BASIS_V229104,/g) || []).length, 1, "A-4 원본: 남은 한 편이 기준 한 줄을 단다");

eq(outbound, 0, "바깥 요청이 없다");
console.log(`V22.9.104 출시 전 글·첫 화면·공지 띠 검사 통과 (${checks} checks)`);
