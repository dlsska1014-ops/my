// V22.9.104 출시 전 글·첫 화면·공지 띠 검사(오프라인, src/index.js 번들 + validation/lib-audit-v22934.mjs 픽스처).
//   A-1 공지 띠 닫기 ‘×’: 공개 화면·로그인 화면·앱 화면의 띠 오른쪽 끝에 aria-label "공지 닫기" 단추가 있고, ‘오늘 하루 안 보기’ 와 같은
//       폼(/notice/hide POST)의 둘째 제출 단추라 보내는 값·쿠키·만료(24시간)가 똑같으며, 숨긴 뒤에는 띠와 스타일이 없다.
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
      ["공개 첫 화면", "/", ""], ["공개 FAQ", "/faq", ""], ["글 목록", "/articles", ""], ["세무 글", "/housing-deductions-overview", ""],
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
  });
} finally {
  globalThis.fetch = realFetch;
}

// 원본: 새 주소·스크립트 없이 같은 처리기를 쓴다.
const postprocess = readFileSync(new URL("../src/modules/web/html-postprocess.js", import.meta.url), "utf8");
eq((postprocess.match(/aria-label="공지 닫기"/g) || []).length, 1, "A-1 원본: 닫기 단추는 띠를 그리는 한 곳에만 있다");
const router = readFileSync(new URL("../src/modules/worker/router.js", import.meta.url), "utf8");
eq((router.match(/notice\/hide/g) || []).length, 1, "A-1 원본: 숨김 주소는 /notice/hide 하나 그대로다(GET 주소를 더하지 않았다)");

eq(outbound, 0, "바깥 요청이 없다");
console.log(`V22.9.104 출시 전 글·첫 화면·공지 띠 검사 통과 (${checks} checks)`);
