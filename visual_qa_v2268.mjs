import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const chromiumModulePath = process.env.QA_CHROMIUM_MODULE || "";
const chromiumExecutable = process.env.QA_CHROMIUM_EXECUTABLE || "";
const koreanFontDir = process.env.QA_KOREAN_FONT_DIR || "";
const viewportWidth = Math.max(320, Number(process.env.QA_VIEWPORT_WIDTH || 390));
const viewportHeight = Math.max(568, Number(process.env.QA_VIEWPORT_HEIGHT || 844));
let browserLaunchOptions = { headless: true };
if (chromiumModulePath) {
  const moduleRoot = chromiumModulePath.replace(/\/$/, "");
  let imported;
  try {
    imported = await import(pathToFileURL(`${moduleRoot}/build/esm/index.js`).href);
  } catch (error) {
    imported = await import(pathToFileURL(`${moduleRoot}/build/index.js`).href);
  }
  const chromiumRuntime = imported.default || imported;
  browserLaunchOptions = {
    ...browserLaunchOptions,
    executablePath: await chromiumRuntime.executablePath(),
    args: chromiumRuntime.args,
  };
} else if (chromiumExecutable) {
  browserLaunchOptions = {
    ...browserLaunchOptions,
    executablePath: chromiumExecutable,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };
}
const outputDir = process.argv[2] || "visual_qa_v2268";
const fixture = await createV2265QaFixture();

const routes = [
  ["01_app", "/app?month=2026-07&household_id=house-home"],
  ["02_households", "/my/households?month=2026-07&household_id=house-home&manage=house-home#manage"],
  ["03_members", "/my/members?month=2026-07&household_id=house-home"],
  ["04_menu", "/menu?month=2026-07&household_id=house-home"],
  ["05_smart_tools", "/smart-tools?month=2026-07&household_id=house-home"],
  ["06_receipts", "/receipts?month=2026-07&household_id=house-home"],
  ["07_reports", "/reports?month=2026-07&household_id=house-home"],
  ["08_settlement_equal", "/settlement-summary?month=2026-07&household_id=house-home&mode=equal"],
  ["09_settlement_ratio", "/settlement-summary?month=2026-07&household_id=house-home&mode=ratio"],
  ["10_settlement_headcount", "/settlement-summary?month=2026-07&household_id=house-home&mode=headcount"],
  ["11_settlement_item", "/settlement-summary?month=2026-07&household_id=house-home&mode=item"],
  ["12_analysis", "/my/analysis?month=2026-07&household_id=house-home"],
  ["13_budgets", "/budgets?month=2026-07&household_id=house-home"],
  ["14_settings", "/my/settings?month=2026-07&household_id=house-home"],
  ["15_backup", "/my/backup?month=2026-07&household_id=house-home"],
  ["16_payment_methods", "/payment-methods?month=2026-07&household_id=house-home"],
  ["17_reserve_plans", "/reserve-plans?month=2026-07&household_id=house-home"],
  ["18_personal_password", "/my/backup-login?return_to=%2Fmenu%3Fmonth%3D2026-07%26household_id%3Dhouse-home"],
];

async function routeHtml(path) {
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    headers: {
      cookie: fixture.cookie,
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    },
    redirect: "manual",
  }), fixture.env, {});
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    throw new Error(`${path} redirected to ${location}`);
  }
  if (response.status !== 200) throw new Error(`${path} returned ${response.status}`);
  return await response.text();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch(browserLaunchOptions);
const context = await browser.newContext({
  viewport: { width: viewportWidth, height: viewportHeight },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: "ko-KR",
  colorScheme: "light",
});
await context.route(/^https?:\/\//, (route) => route.abort());
const report = [];
let qaFontCss = "";
if (koreanFontDir) {
  const regular = (await readFile(`${koreanFontDir}/noto-sans-kr-korean-400-normal.woff2`)).toString("base64");
  const bold = (await readFile(`${koreanFontDir}/noto-sans-kr-korean-700-normal.woff2`)).toString("base64");
  qaFontCss = `@font-face{font-family:'QA Noto Sans KR';font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${regular}) format('woff2')}@font-face{font-family:'QA Noto Sans KR';font-style:normal;font-weight:700 1000;src:url(data:font/woff2;base64,${bold}) format('woff2')}body,button,input,select,textarea{font-family:'QA Noto Sans KR',sans-serif!important}`;
}

try {
  for (const [name, path] of routes) {
    const page = await context.newPage();
    const html = await routeHtml(path);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    if (qaFontCss) await page.addStyleTag({ content: qaFontCss });
    await page.waitForTimeout(80);
    const layout = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
      };
      const hasScrollContainer = (element) => {
        let parent = element.parentElement;
        while (parent && parent !== document.body) {
          const style = getComputedStyle(parent);
          if (["auto", "scroll"].includes(style.overflowX)) return true;
          parent = parent.parentElement;
        }
        return false;
      };
      const offenders = [];
      for (const element of document.querySelectorAll("body *")) {
        if (!visible(element) || hasScrollContainer(element)) continue;
        const rect = element.getBoundingClientRect();
        if (rect.left < -1 || rect.right > viewportWidth + 1) {
          offenders.push({ tag: element.tagName.toLowerCase(), className: String(element.className || "").slice(0, 80), text: String(element.textContent || "").trim().slice(0, 50), parent: String(element.parentElement?.className || "").slice(0, 80), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) });
        }
        if (offenders.length >= 12) break;
      }
      const nav = document.querySelector("nav.bottom, nav.abNavBottom, nav.abUxBottom");
      const footer = document.querySelector("footer.abBusinessFooter");
      return {
        viewportWidth,
        documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        bodyHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        offenders,
        nav: nav ? { position: getComputedStyle(nav).position, height: Math.round(nav.getBoundingClientRect().height) } : null,
        footer: Boolean(footer),
        duplicateIds: [...document.querySelectorAll("[id]")].map((element) => element.id).filter((id, index, all) => all.indexOf(id) !== index),
        unlabeledControls: [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea")].filter((element) => !element.getAttribute("aria-label") && !element.getAttribute("title") && !element.closest("label")).length,
        hiddenFeatureLinks: [...document.querySelectorAll("a[href],form[action]")].map((element) => element.getAttribute("href") || element.getAttribute("action") || "").filter((href) => /\/(?:meme(?:-|\/|$)|share(?:\/|$)|card-benefits(?:\?|$))/.test(href)),
      };
    });
    assert(layout.documentWidth <= layout.viewportWidth + 1, `${path}: document horizontal overflow ${layout.documentWidth}/${layout.viewportWidth}; offenders=${JSON.stringify(layout.offenders)}`);
    assert(layout.offenders.length === 0, `${path}: elements outside viewport ${JSON.stringify(layout.offenders)}`);
    assert(layout.duplicateIds.length === 0, `${path}: duplicate ids ${layout.duplicateIds.join(",")}`);
    assert(layout.unlabeledControls === 0, `${path}: ${layout.unlabeledControls} unlabeled controls`);
    assert(layout.hiddenFeatureLinks.length === 0, `${path}: unfinished feature links exposed ${layout.hiddenFeatureLinks.join(",")}`);
    await page.screenshot({ path: `${outputDir}/${name}_viewport.png` });
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.waitForTimeout(40);
    const bottomLayout = await page.evaluate(() => {
      const nav = document.querySelector("nav.bottom, nav.abNavBottom, nav.abUxBottom");
      const footer = document.querySelector("footer.abBusinessFooter");
      if (!nav || !footer || getComputedStyle(nav).position !== "fixed") return { footerNavGap: null };
      return { footerNavGap: Math.round(nav.getBoundingClientRect().top - footer.getBoundingClientRect().bottom) };
    });
    if (bottomLayout.footerNavGap !== null) assert(bottomLayout.footerNavGap >= 4, `${path}: footer is covered by fixed nav (${bottomLayout.footerNavGap}px)`);
    await page.screenshot({ path: `${outputDir}/${name}_bottom.png` });
    await page.screenshot({ path: `${outputDir}/${name}.png`, fullPage: true });
    report.push({ name, path, ...layout, ...bottomLayout });
    await page.close();
  }
} finally {
  await browser.close();
  fixture.restore();
}

console.log(JSON.stringify({ ok: true, viewport: `${viewportWidth}x${viewportHeight}`, screens: report }, null, 2));
