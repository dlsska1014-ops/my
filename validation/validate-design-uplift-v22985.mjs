// V22.9.85 — 디자인 보강 2단계(docs/ux/MALHAEBOOK_UX_WORK_ORDER.md T-08 ~ T-10)와 V22.9.83·84 검토 후속(R-1 ~ R-7) 검사.
//
// ── 이 파일이 왜 생겼는지 ──
//   T-09 카테고리 표시가 판정 규칙 둘(이니셜용 categoryInitial()·칩 이모지용 QUICK_CHIP_ICON_RULES)로 나뉘어 있었다. 서버와 브라우저가
//        같은 거래를 다른 분류로 볼 수 있었다. 판정은 categoryKey() 하나이고, 브라우저는 V5 자산이 같은 본문을 .toString() 으로 받는다.
//   T-10 메뉴 아이콘 26개가 손으로 쓴 path 표였고, 카테고리 아이콘은 없었고, 웹 화면 곳곳에 이모지(🔥·📅·📊·⚠️)가 있었다.
//        아이콘 원본은 생성 파일 하나(icon-paths.js, Lucide 1.56.0 + SVGO 4.1.0)다. 홈 HTML 은 늘지 않는다.
//   R-1 ~ R-7 V22.9.83·84 코드 검토와 디자인 적합성 점검에서 나온 결함(금액 쪼개짐, 관리자 전용 표시, 다크 선택 표시, 메뉴 켜짐, 테스트 서버 업로드).
//
// ── 어떻게 잡는가 ──
// 서버 판정은 직접 부르고, 브라우저 판정은 1년 캐시 V5 자산 바이트에서 떼어 vm 에서 돌려 같은 말뭉치로 견준다. 색은 지시서 §3-2 표를 여기 옮겨 적고
// 실제 셸 CSS 가 그 값을 내보내는지, 잉크가 동그라미 바탕 위 3:1 이상인지 잰다. 아이콘 마스크는 셸 CSS 에서 data: SVG 를 풀어 path 를 견준다.
import vm from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  app, BASE, ctx, counter, fixture, withClock, page,
} from "./lib-audit-v22934.mjs";
import {
  AB_CATEGORY_ICON_PATHS, AB_NAV_ICON_PATHS, AB_UI_ICON_PATHS, budgetAlertText, budgetFeedbackLine, categoryKey,
  categoryKeyRules, resolveQuickChipIcon,
} from "../src/index.js";
import { CATEGORY_ICONS, LUCIDE_VERSION, NAV_ICONS, SOURCE_SHA256, SVGO_VERSION, UI_ICONS } from "../tools/build-icons.mjs";
import { deployStaging } from "../tools/staging/deploy-staging.mjs";

const t = counter("V22.9.85 디자인 보강 2단계(카테고리 판정 공용화·팔레트·아이콘 파이프라인·감사 도구)와 V83·84 검토 후속");
const HH = "house-home";
const HOME = `/app?month=2026-07&household_id=${HH}`;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const count = (text, needle) => String(text).split(needle).length - 1;
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const asset = async (path) => {
  const response = await app.fetch(new Request(`${BASE}${path}`), {}, ctx);
  t.eq(response.status, 200, `${path} 가 내려간다`);
  return response.text();
};

const SHELL = "/assets/accountbook-shell-v22986.css";
const HOME_CSS = "/assets/mobile-home-v22985.css";
const V5 = "/assets/accountbook-v5-v22986.js";
const NAV = "/assets/accountbook-nav-v22986.js";
// V22.9.84 실측(2026-10-28): 기준 픽스처 홈 HTML 35,626 B. 이 단계는 홈 HTML 을 늘리지 않는다(지시서 T-10 수용 기준).
// V22.9.86: 3단계 T-14 입력 바(+148 B)와 V85:R-15 의 단어 잇개(U+2060, +3 B)가 기준 픽스처 홈 HTML 을 35,768 B 로 늘렸다(35 KiB 기준 안).
// 2단계 이후 늘어난 값은 이 둘뿐이다.
const HOME_V84_BYTES = 35768;
// 생성 파일 icon-paths.js 의 SHA-256. tools/build-icons.mjs 를 같은 원본·도구로 다시 돌리면 같은 값이 나온다(두 번 돌려 확인).
// V22.9.86: 생성기를 고쳤다 — 맨 앞 상대 이동 뒤의 좌표 쌍이 절대 좌표가 되던 것(6개 아이콘이 일그러짐)과 Lucide 의 채운 점(palette·tag)이
// 구멍으로 남던 것. 3단계 화면 아이콘 8개(clock·chevron 셋·x·check·circle-alert·notebook-pen)를 더했다. 다시 돌려 같은 값이 나온다.
const ICON_PATHS_SHA256 = "0549235744aee03cc5ea56e8e2205958c85bec7306d4935e8a402e576f591e2c";

// ── 지시서 §3-2 팔레트(바탕, 잉크): 저장소의 지시서 원문(docs/ux/MALHAEBOOK_UX_WORK_ORDER.md)에서 바로 읽는다 ──
const SPEC_PALETTE = (() => {
  const doc = read("docs/ux/MALHAEBOOK_UX_WORK_ORDER.md");
  const section = doc.slice(doc.indexOf("### 3-2."), doc.indexOf("### 3-3."));
  const start = section.indexOf("```css");
  const code = section.slice(start, section.indexOf("```", start + 6));
  const darkAt = code.indexOf('html[data-ab-resolved-theme="dark"] body.abV22812Shell{');
  const parse = (text) => Object.fromEntries([...text.matchAll(/--ab12-cat-([a-z]+)-bg:(#[0-9a-f]{6});--ab12-cat-\1-ink:(#[0-9a-f]{6})/g)].map((m) => [m[1], [m[2], m[3]]]));
  return { light: parse(code.slice(0, darkAt)), dark: parse(code.slice(darkAt)) };
})();
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// ── T-09 판정: 지시서 수용 기준 단위 사례와 순서 규칙 ──
const keys = categoryKeyRules().map((rule) => rule.key);
t.eq(keys.join(","), "gift,goods,baby,culture,sub,utility,housing,shopping,transport,medical,food,grocery,cafe,income,etc", "T-09 키 15개가 지시서 §3-3 표 순서다(아래 행일수록 우선)");
for (const [word, key] of [["점심", "food"], ["커피", "cafe"], ["쿠팡", "shopping"], ["병원", "medical"], ["마트", "grocery"], ["주유", "transport"], ["관리비", "housing"], ["자동차세", "utility"]]) {
  t.eq(categoryKey(word, "expense", ""), key, `T-09 분류 이름 ${word} → ${key}`);
  t.eq(categoryKey("", "expense", word), key, `T-09 메모 ${word} → ${key}`);
}
t.eq(categoryKey("", "income", ""), "income", "T-09 수입 거래는 단어가 없어도 income");
t.eq(categoryKey("식비", "income", "점심"), "income", "T-09 수입 거래는 분류·메모와 상관없이 income");
t.eq(categoryKey("알 수 없음", "expense", ""), "etc", "T-09 맞는 단어가 없으면 etc");
t.eq(categoryKey("", "expense", ""), "etc", "T-09 빈 거래도 etc");
t.eq(categoryKey("식비", "expense", "카페 점심"), "food", "T-09 고른 분류 이름이 메모보다 먼저다");
t.eq(categoryKey("기타", "expense", "커피"), "cafe", "T-09 분류 이름이 어느 단어에도 안 맞을 때만 메모를 본다");
t.eq(categoryKey("", "expense", "커피 점심"), "cafe", "T-09 한 글 안에서는 표의 아래쪽 행(카페)이 이긴다");
t.eq(categoryKey("", "expense", "입금 확인"), "etc", "T-09 지출 거래는 수입 단어로 income 이 되지 않는다");
t.eq(categoryKey("", "", "입금"), "income", "T-09 종류를 모르는 칩(type 빈 값)은 수입 단어도 쓴다");
t.eq(categoryKey("커피".normalize("NFD"), "expense", ""), "cafe", "T-09 풀어 쓴 한글(NFD)도 NFKC 로 맞춰 같은 결과");
t.eq(categoryKey(null, "expense", undefined), "etc", "T-09 null·undefined 도 etc");
// 지시서 §3-3 의 의료 단어 ‘약’은 ‘예약·약속·절약·계약’에도 맞는다. 의료가 주거·문화보다 아래 행이라 ‘월세 계약금’이 의료가 됐다(V22.9.85 안에서 찾음).
for (const [memo, key] of [["월세 계약금", "housing"], ["호텔 예약", "etc"], ["약속", "etc"], ["절약", "etc"], ["통신 약정", "utility"], ["요약", "etc"], ["예약", "etc"]]) {
  t.eq(categoryKey("", "expense", memo), key, `T-09 의료 ‘약’의 제외 낱말: 메모 ${memo} → ${key}`);
}
for (const memo of ["약", "약국", "감기약", "약값", "한약", "두통약 4500", "감기약 예약"]) t.eq(categoryKey("", "expense", memo), "medical", `T-09 메모 ${memo} 는 그대로 의료`);
t.eq(categoryKey("예약", "expense", "감기약"), "medical", "T-09 분류 이름이 제외 낱말뿐이면 메모를 본다");
{
  // 판정 단어는 지시서 §3-3 표 그대로다. 표와 다른 것은 의료의 except(제외 낱말) 하나다.
  const doc = read("docs/ux/MALHAEBOOK_UX_WORK_ORDER.md");
  const table = Object.fromEntries([...doc.matchAll(/^\| `([a-z]+)` \| [^|]+ \| `([a-z-]+)` \| ([^|]+) \|$/gm)]
    .map((m) => [m[1], { icon: m[2], words: m[3].replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean) }]));
  t.eq(Object.keys(table).sort().join(","), [...keys].sort().join(","), "T-09 지시서 §3-3 표에서 키 15개를 읽었다");
  for (const rule of categoryKeyRules()) {
    t.eq(rule.words.join(" "), table[rule.key]?.words.join(" "), `T-09 ${rule.key} 판정 단어가 지시서 §3-3 과 같다`);
    t.eq(rule.icon, table[rule.key]?.icon, `T-09 ${rule.key} 아이콘 이름이 지시서 §3-3 과 같다`);
    if (rule.key !== "medical") t.ok(!rule.except, `T-09 ${rule.key} 에는 제외 낱말이 없다`);
  }
  const medical = categoryKeyRules().find((rule) => rule.key === "medical");
  t.ok(medical.except.length >= 10 && medical.except.every((word) => word.includes("약") && word.length >= 2), "T-09 의료 제외 낱말은 모두 ‘약’을 품은 두 글자 이상 낱말이다");
}
t.eq(resolveQuickChipIcon("커피", ""), "☕", "T-09 칩 이모지도 같은 판정을 쓴다(커피 → 카페)");
t.eq(resolveQuickChipIcon("호텔 예약", ""), "🏷️", "T-09 칩 ‘호텔 예약’은 의료 이모지가 아니다(V22.9.84 칩 표와 같음)");
t.eq(resolveQuickChipIcon("", ""), "🏷️", "T-09 판정이 안 되는 칩은 기본 표식");
t.ok(!read("src/modules/web/quick-chip-icons.js").includes("function categoryInitial") && !read("src/index.js").includes("function categoryInitial("), "T-09 옛 categoryInitial() 은 남지 않았다(죽은 코드로 두지 않는다)");
t.ok(!/\b(?:const|let|var)\s+homeTimeline\b/.test(read("src/modules/my/mobile-home.js")) && !/\bhomeTimeline\s*=/.test(read("src/index.js")), "T-09 쓰이지 않던 홈 타임라인(옛 categoryInitial 의 유일한 호출처)을 지웠다");

// ── T-09·T-10 판정 표와 아이콘 표가 한 곳에서 나온다 ──
t.eq(LUCIDE_VERSION, "1.56.0", "T-10 Lucide 판이 고정돼 있다");
t.eq(SVGO_VERSION, "4.1.0", "T-10 SVGO 판이 고정돼 있다");
t.ok(/^[0-9a-f]{64}$/.test(SOURCE_SHA256), "T-10 원본 SVG 합의 SHA-256 이 스크립트 머리에 있다");
const buildHead = read("tools/build-icons.mjs").slice(0, 2400);
t.ok(buildHead.includes("lucide-static-1.56.0.tgz") && buildHead.includes("176ce6fb71be02910852cc5e243cac2399e85c13465ae1e742cb7a534eacb44a") && buildHead.includes("6646ae27350d38dc2f08e708ee64b885b9746775ef7c8091f171d94052a333a6"),
  "T-10 tools/build-icons.mjs 머리에 원본 받는 방법과 두 tgz 의 SHA-256 이 적혀 있다");
for (const rule of categoryKeyRules()) t.eq(rule.icon, CATEGORY_ICONS[rule.key], `T-10 카테고리 ${rule.key} 의 아이콘 이름이 판정 표와 아이콘 표에서 같다(${rule.icon})`);
t.eq(Object.keys(CATEGORY_ICONS).join(","), keys.join(","), "T-10 아이콘 표의 카테고리 키가 판정 표와 같은 15개다");
t.eq(Object.keys(AB_CATEGORY_ICON_PATHS).join(","), Object.keys(CATEGORY_ICONS).join(","), "T-10 생성 파일의 카테고리 path 키가 아이콘 표와 같다");
t.eq(Object.keys(AB_NAV_ICON_PATHS).join(","), Object.keys(NAV_ICONS).join(","), "T-10 생성 파일의 메뉴 path 키 26개가 아이콘 표와 같다");
t.eq(Object.keys(AB_NAV_ICON_PATHS).length, 26, "T-10 메뉴 아이콘은 26개다");
t.eq(Object.keys(AB_UI_ICON_PATHS).join(","), Object.keys(UI_ICONS).join(","), "T-10 화면 아이콘(불꽃·달력·경고)이 생성 파일에 있다");
for (const [name, d] of Object.entries({ ...AB_NAV_ICON_PATHS, ...AB_CATEGORY_ICON_PATHS, ...AB_UI_ICON_PATHS })) {
  t.ok(/^[Mm][0-9A-Za-z .,-]+$/.test(d) && !/[<>"'#]/.test(d), `T-10 ${name} path 가 d 문자열 하나다(따옴표·꺾쇠 없음)`);
}
const iconSource = read("src/modules/assets/icon-paths.js");
t.eq(createHash("sha256").update(iconSource).digest("hex"), ICON_PATHS_SHA256, "T-10 생성 파일 icon-paths.js 의 SHA-256 이 고정값과 같다(손으로 고치지 않았다)");
t.ok(iconSource.includes("// ISC License") && iconSource.includes("Lucide Icons and Contributors") && iconSource.includes("// The MIT License (MIT) (for the icons listed above)") && iconSource.includes("Cole Bemis"),
  "T-10 생성 파일에 ISC 표기와 Feather 출신 아이콘의 MIT 표기(저작권자 포함)가 있다");

await withClock("2026-07-15", () => fixture(async (fx) => {
  const shell = await asset(SHELL);
  const homeCss = await asset(HOME_CSS);
  const v5 = await asset(V5);
  const nav = await asset(NAV);
  const home = await (await app.fetch(new Request(`${BASE}${HOME}`, { headers: { cookie: fx.cookie, "user-agent": UA } }), fx.env, ctx)).text();

  // ── T-09 서버·브라우저 판정이 같다 ──
  const start = v5.indexOf("window.abCategoryKey=(function(){");
  const end = v5.indexOf("return categoryKey})();", start);
  t.ok(start === 0 && end > start, "T-09 V5 자산 맨 앞에 판정 함수(window.abCategoryKey)가 실린다");
  const sandbox = { window: {} };
  vm.runInNewContext(v5.slice(start, end + "return categoryKey})();".length), sandbox);
  const clientKey = sandbox.window.abCategoryKey;
  t.eq(typeof clientKey, "function", "T-09 브라우저 판정 함수가 자산 바이트만으로 돈다(바깥 이름 없음)");
  const corpus = [];
  const words = categoryKeyRules().flatMap((rule) => [...rule.words, ...(rule.except || [])]);
  for (const type of ["expense", "income", ""]) {
    for (const word of words) corpus.push([word, type, ""], ["", type, word], ["기타", type, `${word} 3000`], [`${word}비`, type, "메모"]);
    for (let i = 0; i < words.length; i += 1) corpus.push(["", type, `${words[i]} ${words[(i * 7 + 3) % words.length]}`]);
  }
  corpus.push(["예약", "expense", ""], ["", "expense", "약국 커피"], [null, "expense", null], [undefined, "", undefined], ["커피".normalize("NFD"), "expense", ""], ["ＣＡＦＥ 커피", "", ""], ["", "expense", "카페​"]);
  const mismatches = corpus.filter(([c, type, m]) => clientKey(c, type, m) !== categoryKey(c, type, m));
  t.eq(mismatches.length, 0, `T-09 서버·브라우저 판정이 말뭉치 ${corpus.length}건에서 모두 같다${mismatches.length ? ` (첫 차이 ${JSON.stringify(mismatches[0])})` : ""}`);
  t.ok(corpus.length > 1000, `T-09 비교 말뭉치가 1,000건을 넘는다 (${corpus.length})`);

  // ── T-09 §3-2 팔레트: 셸 CSS 가 문서 값을 그대로 내보내고, 잉크 대비가 3:1 이상 ──
  const tokenBlocks = (prefix) => [...shell.matchAll(/(?:^|\n)([^\n{}]*)\{(--ab12-cat-[a-z]+-bg:[^}]*)\}/g)].filter((m) => m[1] === prefix).map((m) => m[2]);
  const [lightBlock = "", ...lightExtra] = tokenBlocks("body.abV22812Shell");
  const [darkBlock = "", ...darkExtra] = tokenBlocks('html[data-ab-resolved-theme="dark"] body.abV22812Shell');
  t.ok(lightBlock && darkBlock && !lightExtra.length && !darkExtra.length, "T-09 셸 CSS 에 라이트·다크 카테고리 토큰 블록이 하나씩 있다(톤 선택자 밖)");
  t.eq([...shell.matchAll(/(?:^|\n)([^\n{}]*)\{--ab12-cat-[a-z]+-bg:/g)].length, 2, "T-09 카테고리 토큰을 다시 정의하는 다른 선택자(톤별 등)가 없다");
  t.eq(`${Object.keys(SPEC_PALETTE.light).sort()}|${Object.keys(SPEC_PALETTE.dark).sort()}`, `${[...keys].sort()}|${[...keys].sort()}`, "T-09 지시서 §3-2 에서 라이트·다크 15키씩 읽었다");
  const lowest = { light: { ratio: Infinity }, dark: { ratio: Infinity } };
  for (const key of keys) {
    for (const [scheme, block] of [["light", lightBlock], ["dark", darkBlock]]) {
      const [bg, ink] = SPEC_PALETTE[scheme][key];
      t.ok(block.includes(`--ab12-cat-${key}-bg:${bg};`) && block.includes(`--ab12-cat-${key}-ink:${ink}`), `T-09 ${scheme} ${key} 바탕 ${bg}·잉크 ${ink} 가 §3-2 와 같다`);
      const ratio = contrast(bg, ink);
      t.ok(ratio >= 3, `T-10 ${scheme} ${key} 아이콘 잉크 대비 ${ratio.toFixed(2)}:1 ≥ 3:1`);
      if (ratio < lowest[scheme].ratio) lowest[scheme] = { ratio, key };
    }
  }
  // 지시서 기록: 라이트 최소 4.48:1(육아), 다크 최소 6.98:1(구독). 소수 둘째 자리 반올림으로 견준다.
  t.ok(lowest.light.key === "baby" && lowest.light.ratio.toFixed(2) === "4.48" && lowest.dark.key === "sub" && lowest.dark.ratio.toFixed(2) === "6.98",
    `T-09 최소 대비가 지시서 기록과 같다(라이트 ${lowest.light.key} ${lowest.light.ratio.toFixed(2)}, 다크 ${lowest.dark.key} ${lowest.dark.ratio.toFixed(2)})`);
  t.ok(shell.includes("/*! Lucide icons (lucide-static 1.56.0) ISC · Feather-derived icons MIT · https://lucide.dev/license */"), "T-10 셸 CSS 의 아이콘 마스크 앞에 라이선스 표기가 있다");

  // ── T-10 카테고리 마스크: 키마다 data: SVG 하나, path 는 생성 파일 그대로 ──
  const maskPath = (css, selector) => {
    const at = css.indexOf(selector);
    if (at < 0) return null;
    const rule = css.slice(at, css.indexOf("}", at));
    const url = rule.match(/url\("data:image\/svg\+xml,([^"]+)"\)/)?.[1];
    if (!url) return null;
    const svg = decodeURIComponent(url);
    return /^<svg xmlns='http:\/\/www\.w3\.org\/2000\/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='([^']+)'\/><\/svg>$/.exec(svg)?.[1] || null;
  };
  for (const key of keys) {
    t.eq(maskPath(shell, `body.abV22812Shell .abCat[data-ck="${key}"]{`), AB_CATEGORY_ICON_PATHS[key], `T-10 카테고리 ${key} 동그라미가 생성 path 의 마스크와 §3-2 변수를 쓴다`);
    t.ok(shell.includes(`.abCat[data-ck="${key}"]{--ab-ck-bg:var(--ab12-cat-${key}-bg);--ab-ck-ink:var(--ab12-cat-${key}-ink);`), `T-10 카테고리 ${key} 바탕·잉크가 토큰을 따른다`);
  }
  t.ok(shell.includes("body.abV22812Shell .abCatIcon{display:block;width:50%;height:50%;background:var(--ab-ck-ink,transparent);"), "T-10 키가 없는 동그라미는 잉크가 투명이라 네모 칠이 보이지 않는다");
  t.eq(count(home, "<svg"), 3, "T-10 홈 HTML 에 SVG 를 더 넣지 않았다(전과 같은 3개)");
  t.ok(!home.includes("abCatIcon"), "T-10 2단계는 홈 마크업에 카테고리 동그라미를 넣지 않는다(3단계 T-13)");

  // ── T-10 이모지 → 아이콘(웹 화면만) ──
  t.ok(!home.includes("🔥") && home.includes('<span class="reportChallengeBadge"><i aria-hidden="true"></i> '), "T-10 홈 챌린지 배지의 불꽃 이모지가 빈 <i> 로 바뀌었다(글자 앞 띄어쓰기 그대로)");
  t.eq(maskPath(shell, "body.abV22812Shell .reportChallengeBadge>i:empty{"), AB_UI_ICON_PATHS.flame, "T-10 셸 CSS 가 빈 배지 <i> 에 flame 마스크를 그린다");
  const analysis = await page(fx, `/my/analysis?view=report&month=2026-07&household_id=${HH}`);
  t.ok(analysis.status === 200 && analysis.html.includes('<i aria-hidden="true">🔥</i> '), "T-10 분석·리포트 화면(보호 화면)의 챌린지 배지는 이모지 그대로다");
  t.ok(!home.includes("📅") && home.includes('#calendar">캘린더</a></div>'), "T-10 캘린더 펼치기 링크의 📅 를 뺐다");
  t.eq(maskPath(shell, "body.abV22812Shell .homeCalendarToggle a:before{"), AB_UI_ICON_PATHS.calendar, "T-10 셸 CSS 가 캘린더 링크 앞에 calendar 마스크를 그린다");
  t.ok(!homeCss.includes('.homeNotice:after{content:"📊"') && !homeCss.includes("📊"), "T-10 SMART NOTICE 뒤 장식 그래프 이모지(📊)를 지웠다");
  t.eq(maskPath(shell, "body.abV22812Shell .abSaveFeedback.isWarning .abSaveFeedbackMark:empty:before{"), AB_UI_ICON_PATHS["triangle-alert"], "T-10 저장 알림의 예산 경고 표식이 triangle-alert 마스크다");
  const rows = [{ type: "expense", category: "식비", amount: 90000, transaction_date: "2026-07-03" }];
  const warn = budgetAlertText(rows, [{ category: "식비", amount: 100000 }], "식비");
  const over = budgetAlertText([{ ...rows[0], amount: 120000 }], [{ category: "식비", amount: 100000 }], "식비");
  t.ok(warn.startsWith("식비 예산 90%") && !/[⚠🚨]/u.test(warn), `T-10 웹 예산 주의 문구 앞에 이모지가 없다 (${warn})`);
  t.ok(over.startsWith("식비 예산 초과") && !/[⚠🚨]/u.test(over), `T-10 웹 예산 초과 문구 앞에 이모지가 없다 (${over})`);
  t.ok(/⚠️|🚨/u.test(budgetFeedbackLine(rows, [{ category: "식비", amount: 100000 }], "식비")), "T-10 카카오톡 답장 속 예산 이모지는 그대로다");
  const warnPage = await page(fx, `${HOME}&msg=added&balert=${encodeURIComponent(warn)}`);
  t.ok(warnPage.html.includes('<span class="abSaveFeedbackMark" aria-hidden="true"></span>'), "T-10 예산 경고 알림의 표식 칸은 비어 있고 CSS 아이콘이 그린다(△ 글자 없음)");

  // ── 홈 HTML 바이트 ──
  t.ok(Buffer.byteLength(home) <= HOME_V84_BYTES, `T-10 기준 픽스처 홈 HTML 이 V22.9.84 보다 늘지 않았다 (${Buffer.byteLength(home)} B ≤ ${HOME_V84_BYTES})`);

  // ── T-10 메뉴 아이콘: 생성 표를 인자로 받는다 ──
  t.ok(nav.startsWith("/*! Lucide icons (lucide-static 1.56.0) ISC · Feather-derived icons MIT · https://lucide.dev/license */"), "T-10 메뉴 자산 맨 앞에 라이선스 표기가 있다");
  t.ok(nav.includes(`})(${JSON.stringify(AB_NAV_ICON_PATHS)});`), "T-10 메뉴 자산이 생성 표(AB_NAV_ICON_PATHS)를 그대로 인자로 받는다");
  t.ok(!nav.includes("M12 5v14M5 12h14"), "T-10 메뉴 자산에 손으로 쓴 옛 path 가 남지 않았다");
  const navSource = read("src/modules/client/nav-search-notif-mains.js");
  t.ok(navSource.includes("function accountbookStage4NavClientMain(iconPaths) {") && navSource.includes("var d = iconPaths[name] || iconPaths.home;"), "T-10 iconSvg() 는 이름을 유지하고 모르는 이름은 집 모양으로 돌아간다");
  const navIconNames = new Set([...home.matchAll(/data-ab-nav-icon="([a-z]+)"/g)].map((m) => m[1]));
  t.ok(navIconNames.size >= 10, `T-10 홈 내비가 쓰는 아이콘 이름 ${navIconNames.size}개를 찾았다`);
  for (const name of navIconNames) t.ok(Object.hasOwn(AB_NAV_ICON_PATHS, name), `T-10 홈 내비 아이콘 ${name} 이 생성 표에 있다`);

  // ── R-1 금액·숫자를 쪼개지 않는다(셸 body break-word) ──
  t.ok(/body\.abV22812Shell\{[^}]*word-break:keep-all;overflow-wrap:break-word;[^}]*\}/.test(shell) && !/body\.abV22812Shell\{[^}]*overflow-wrap:anywhere;[^}]*font-family/.test(shell), "R-1 셸 body 는 keep-all·break-word 다(anywhere 는 최소 폭 계산까지 바꿔 표의 금액을 쪼갰다)");

  // ── R-2 전체 메뉴의 단톡방 연결도 관리자 전용 표시 ──
  const memberMenu = await (await app.fetch(new Request(`${BASE}/menu?month=2026-07&household_id=${HH}`, { headers: { cookie: await fx.cookieFor("user-wifi") } }), fx.env, ctx)).text();
  t.ok(memberMenu.includes("관리자 전용 · 카카오톡 단톡방에서 기록") && memberMenu.includes("관리자 전용 · 구성원과 권한 관리"), "R-2 구성원이 보는 전체 메뉴에서 단톡방 연결·참여자 초대에 관리자 전용이 붙는다");
  const ownerMenu = await page(fx, `/menu?month=2026-07&household_id=${HH}`);
  t.ok(ownerMenu.html.includes("카카오톡 단톡방에서 기록") && !ownerMenu.html.includes("관리자 전용 · 카카오톡"), "R-2 소유자에게는 관리자 전용을 붙이지 않는다");

  // ── R-3 다크 소비 분석 보기 탭 ──
  t.ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .lrSeg.abAnalysisViews a{color:var(--ab12-muted)!important;border:1px solid transparent}')
    && shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .lrSeg.abAnalysisViews a[aria-current="true"]{color:var(--ab12-accent)!important;border-color:var(--ab12-accent)}'),
  "R-3 다크에서 고른 보기 탭은 강조색 글자·테두리, 안 고른 탭은 보조색이다(링크 강조색 규칙이 두 탭을 같게 칠했다)");

  // ── R-4 서버와 브라우저가 같은 메뉴를 켠다 ──
  t.ok(nav.includes('if (path.indexOf("budgets") >= 0 || path === "/my/settings") return "budgets";'), "R-4 브라우저도 설정 화면에서 예산을 켠다(서버 settings → budgets)");
  const importPage = await page(fx, `/my/backup?month=2026-07&household_id=${HH}&mode=import`);
  const backupPage = await page(fx, `/my/backup?month=2026-07&household_id=${HH}&mode=backup`);
  const activeKeys = (html) => [...html.matchAll(/<a data-key="([a-z-]+)" class="active[^"]*"[^>]*aria-current="page"/g)].map((m) => m[1]);
  t.ok(activeKeys(importPage.html).includes("import") && !activeKeys(importPage.html).includes("backup"), `R-4 가져오기 모드는 서버도 가져오기를 켠다 (${activeKeys(importPage.html).join(",")})`);
  t.ok(activeKeys(backupPage.html).includes("backup") && !activeKeys(backupPage.html).includes("import"), `R-4 백업 모드는 백업·복구를 켠다 (${activeKeys(backupPage.html).join(",")})`);
}));

// ── R-5 테스트 서버 업로드는 계획을 직접 넘겨도 운영 이름을 막는다 ──
for (const script of ["kakao-accountbook", "something-else"]) {
  const calls = [];
  const fakeFetch = async (...args) => { calls.push(args); throw new Error("no network in validation"); };
  let refused = "";
  try {
    await deployStaging({ env: { CLOUDFLARE_API_TOKEN: "x", CLOUDFLARE_ACCOUNT_ID: "y", STAGING_PASSWORD: "12345678" }, fetchImpl: fakeFetch, log() {}, sleep: async () => {}, plan: { script, version: "test", modules: [] } });
  } catch (error) { refused = String(error?.message || error); }
  t.ok(refused.startsWith(`refusing to upload to ${script}`) && calls.length === 0, `R-5 plan.script=${script} 는 첫 요청 전에 멈춘다 (요청 ${calls.length}번)`);
}
{
  // 대조군: 테스트 Worker 이름이면 막지 않고 첫 요청(테스트 Worker 업로드)까지 간다.
  const calls = [];
  const fakeFetch = async (...args) => { calls.push(args); throw new Error("no network in validation"); };
  const plan = { script: "malhaebook-staging", version: "test", modules: [], metadata: { main_module: "worker-entry.mjs", bindings: [] } };
  let failed = "";
  try {
    await deployStaging({ env: { CLOUDFLARE_API_TOKEN: "x", CLOUDFLARE_ACCOUNT_ID: "y", STAGING_PASSWORD: "12345678" }, fetchImpl: fakeFetch, log() {}, sleep: async () => {}, plan });
  } catch (error) { failed = String(error?.message || error); }
  t.ok(failed === "no network in validation" && calls.length === 1 && String(calls[0][0]).endsWith("/accounts/y/workers/scripts/malhaebook-staging") && calls[0][1].method === "PUT",
    `R-5 대조군: malhaebook-staging 계획은 테스트 Worker 업로드 요청 하나를 보낸다 (요청 ${calls.length}번)`);
}

// ── R-6·R-7 세그먼트 전환·초점, 다크 선택 표시, 내역 칩 누름 반응 ──
await withClock("2026-07-15", async () => {
  const shell = await asset(SHELL);
  t.ok(shell.includes("body.abV22812Shell #add .seg span{transition:background-color var(--ab12-dur,180ms)") && shell.includes("@media(prefers-reduced-motion:reduce){body.abV22812Shell #add .seg span{transition:none!important}}"), "R-6 세그먼트 고른 칸이 180ms 로 바뀌고 움직임 줄이기에서는 끈다");
  t.ok(shell.includes("body.abV22812Shell #add .seg input:focus-visible+span{outline:3px solid var(--ab12-accent)!important;outline-offset:3px!important}"), "R-6 세그먼트 초점 링이 강조색 3px 이다");
  t.ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .feedControls a.active{background:var(--ab12-accent-soft)!important;border-color:var(--ab12-accent)!important}'), "R-7 다크 ‘최근 10건’ 고른 링크에 면·테두리 표시가 있다");
  t.ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .txChip.isOn{background:var(--ab12-accent-soft)!important;border-color:var(--ab12-accent)!important;color:var(--ab12-accent)!important}')
    && shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .txChip{color:var(--ab12-text)!important}'), "R-7 다크 내역 칩은 고른 것만 강조색이다");
  t.eq(count(shell, ":is(button,.btn,.chip,.txChip,.abNavBottom a,.v8-tx-main)"), 4, "R-7 내역 칩도 누름 반응·180ms 전환·움직임 줄이기 목록(4곳)에 들어 있다");
});

// ── T-08 화면 감사 도구 ──
const audit = read("tools/screen-audit.mjs");
for (const [needle, label] of [
  ["--host-resolver-rules=MAP * ~NOTFOUND", "바깥 주소는 DNS 부터 막는다"],
  ["--tones", "톤 4개(파랑·초록·보라·호박)를 돈다"],
  ["--root", "다른 판 클론(--root)을 잴 수 있다"],
  ["선택구분 실패", "선택 상태 구분 검사를 적는다"],
  ["report.json", "모든 측정을 report.json 에 남긴다"],
  ["quick", "빠른 입력 시트 화면(quick)을 잰다"],
]) t.ok(audit.includes(needle), `T-08 screen-audit: ${label}`);

t.done();
