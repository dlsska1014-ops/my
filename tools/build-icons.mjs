#!/usr/bin/env node
// V22.9.85 (디자인 작업 지시서 T-10): 선 아이콘의 원본을 고정 버전으로 받아 src/modules/assets/icon-paths.js 를 만든다.
// 담아 온 아이콘은 되짚을 수 있어야 한다 — 이 파일이 그 되짚는 방법이다(tools/bundle-number-flow.mjs 와 같은 방식).
//
//   1) 원본과 도구를 받는다(저장소에는 의존성을 설치하지 않는다):
//        curl -sSL https://registry.npmjs.org/lucide-static/-/lucide-static-1.56.0.tgz -o lucide.tgz
//          sha256 176ce6fb71be02910852cc5e243cac2399e85c13465ae1e742cb7a534eacb44a  (ISC, 2026-10-13 게시)
//          레지스트리 dist.integrity sha512-R1W4B9jCNbHmqD2JnJW5+DF4JAecKP7RSd+eMqV2aQxLKcB0MRKz0QNHpMvJtE8EhFX3Qc5V6XmUpiXD2Vcc2w==
//        mkdir -p lucide && tar xzf lucide.tgz -C lucide
//        mkdir -p svgo-tool && cd svgo-tool && echo '{"private":true}' > package.json && npm install svgo@4.1.0 --ignore-scripts --save-exact && cd ..
//          svgo-4.1.0.tgz sha256 6646ae27350d38dc2f08e708ee64b885b9746775ef7c8091f171d94052a333a6  (MIT, 2026-08-24 게시)
//          레지스트리 dist.integrity sha512-bkxnTg1kSU0guhIBmibA6UUhrQmPVA1XsQLN+ylCd+UWzbnLkySOcXpyk1mrl05f+pcaCx2eHb+sp6BgMZWX+Q==
//   2) node tools/build-icons.mjs lucide/package svgo-tool
//   3) 나온 파일의 SHA-256 이 validation/validate-design-uplift-v22985.mjs 에 고정된 값과 같아야 한다.
//      다르면 아이콘 버전·고른 아이콘·SVGO 설정 가운데 하나가 바뀐 것이다. 원본 SVG 합의 SHA-256(SOURCE_SHA256)도 이 스크립트가 확인한다.
//
// 아이콘 하나는 path 하나(d 문자열 하나)로 줄인다. 원·타원과 모서리 둥근 사각형은 호(arc)로, 선·꺾은선은 path 로 바꾼 뒤 이어 붙이고
// SVGO 로 한 번 더 줄인다. 선 굵기·끝 모양은 그리는 쪽이 정한다(메뉴는 .abNavIconSvg, 카테고리·화면 아이콘은 CSS 마스크).
// 1.63.0 은 이 판을 만든 날(2026-10-28) 나온 판이라, 게시 뒤 2주가 지난 1.56.0 을 썼다.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LUCIDE_VERSION = "1.56.0";
export const SVGO_VERSION = "4.1.0";
// 아래 세 표의 Lucide 이름을 표 순서(메뉴 → 카테고리 → 화면, 겹치는 이름은 처음 한 번)대로 읽은 원본 SVG 바이트를 이은 것의 SHA-256.
export const SOURCE_SHA256 = "05dafb3bf675a2b6290e6a2abe8dc232fe9d6529207b608baed0faf7ab088e51";

// 메뉴 26개: 이름은 client/nav-search-notif-mains.js iconSvg() 의 키를 그대로 둔다(지시서 §3-3). 값은 Lucide 이름.
export const NAV_ICONS = {
  home: "house", records: "notebook-text", calendar: "calendar", recurring: "rotate-cw", receipt: "receipt-text",
  import: "download", settlement: "arrow-right-left", plus: "plus", report: "chart-column", stats: "chart-column-increasing",
  budget: "piggy-bank", file: "file-text", sparkle: "sparkles", bell: "bell", users: "users", chat: "message-circle-more",
  switch: "repeat", wallet: "wallet", tag: "tag", backup: "database", shield: "shield-check", tools: "wrench",
  search: "search", palette: "palette", more: "ellipsis", check: "check",
};
// 카테고리 15개: 키·아이콘은 web/quick-chip-icons.js categoryKeyRules() 와 같아야 한다(검사가 맞춰 본다).
export const CATEGORY_ICONS = {
  gift: "gift", goods: "sparkles", baby: "baby", culture: "ticket", sub: "tv", utility: "zap", housing: "house",
  shopping: "package", transport: "bus", medical: "heart-pulse", food: "utensils", grocery: "shopping-cart",
  cafe: "coffee", income: "banknote", etc: "circle-ellipsis",
};
// 웹 화면 이모지를 바꾸는 아이콘(지시서 §3-3: 무지출 불꽃, 캘린더, 예산 경고).
export const UI_ICONS = { flame: "flame", calendar: "calendar", "triangle-alert": "triangle-alert" };
// Feather 시절 이름(LICENSE 의 MIT 목록은 옛 이름으로 적혀 있다).
const FEATHER_ALIASES = { "triangle-alert": "alert-triangle", ellipsis: "more-horizontal" };

const num = (value) => Number.parseFloat(value);
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

// SVGO 의 convertShapeToPath 는 모서리가 둥근 rect 를 바꾸지 않으므로 여기서 호로 바꾼다.
function rectToPath(tag) {
  const a = attrs(tag);
  const x = num(a.x || 0), y = num(a.y || 0), w = num(a.width), h = num(a.height);
  let rx = a.rx != null ? num(a.rx) : a.ry != null ? num(a.ry) : 0;
  let ry = a.ry != null ? num(a.ry) : rx;
  rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
  if (!rx || !ry) return `<path d="M${x} ${y}h${w}v${h}h${-w}z"/>`;
  const arc = (dx, dy) => `a${rx} ${ry} 0 0 1 ${dx} ${dy}`;
  return `<path d="M${x + rx} ${y}h${w - 2 * rx}${arc(rx, ry)}v${h - 2 * ry}${arc(-rx, ry)}h${-(w - 2 * rx)}${arc(-rx, -ry)}v${-(h - 2 * ry)}${arc(rx, -ry)}z"/>`;
}

export async function buildIcons(lucideDir, svgoDir) {
  const lucidePackage = JSON.parse(readFileSync(resolve(lucideDir, "package.json"), "utf8"));
  if (lucidePackage.name !== "lucide-static" || lucidePackage.version !== LUCIDE_VERSION) throw new Error(`lucide-static ${LUCIDE_VERSION} 이 아니다: ${lucidePackage.name} ${lucidePackage.version}`);
  const svgoPackage = JSON.parse(readFileSync(resolve(svgoDir, "node_modules/svgo/package.json"), "utf8"));
  if (svgoPackage.version !== SVGO_VERSION) throw new Error(`svgo ${SVGO_VERSION} 이 아니다: ${svgoPackage.version}`);
  const { optimize } = await import(pathToFileURL(resolve(svgoDir, "node_modules/svgo/lib/svgo-node.js")).href);

  const order = [...new Set([...Object.values(NAV_ICONS), ...Object.values(CATEGORY_ICONS), ...Object.values(UI_ICONS)])];
  const sources = new Map(order.map((name) => [name, readFileSync(resolve(lucideDir, "icons", `${name}.svg`), "utf8")]));
  const sourceSha = createHash("sha256").update(order.map((name) => sources.get(name)).join("")).digest("hex");
  if (SOURCE_SHA256 !== "PENDING" && sourceSha !== SOURCE_SHA256) throw new Error(`원본 SVG 합의 SHA-256 이 다르다: ${sourceSha}`);

  const shrink = (svg) => optimize(svg, {
    multipass: true,
    floatPrecision: 3,
    plugins: ["preset-default", { name: "convertShapeToPath", params: { convertArcs: true } }, { name: "mergePaths", params: { force: true } }],
  }).data;
  const pathOf = (name) => {
    const body = sources.get(name).replace(/<!--[\s\S]*?-->/g, "").replace(/<rect\b[^>]*\/>/g, rectToPath);
    const svg = body.replace(/<svg\b[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2">');
    const first = shrink(svg);
    if (/<(circle|ellipse|rect|line|polyline|polygon)\b/.test(first)) throw new Error(`${name}: path 가 아닌 도형이 남았다`);
    // 첫 m(상대 이동)은 절대 이동과 같다. 이어 붙이면 앞 도형 끝에서 재는 상대 이동이 되므로 M 으로 바꾼다.
    const joined = [...first.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1].replace(/^m/, "M")).join("");
    if (!joined) throw new Error(`${name}: path 가 없다`);
    const again = shrink(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2"><path d="${joined}"/></svg>`);
    const d = [...again.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
    if (d.length !== 1) throw new Error(`${name}: path 하나로 줄지 않았다(${d.length})`);
    return d[0];
  };
  const table = (map) => Object.fromEntries(Object.entries(map).map(([key, name]) => [key, pathOf(name)]));
  const nav = table(NAV_ICONS), category = table(CATEGORY_ICONS), ui = table(UI_ICONS);

  const license = readFileSync(resolve(lucideDir, "LICENSE"), "utf8");
  const featherList = (license.match(/derived from the Feather project:\s*\n\s*\n([^\n]+)/) || [])[1] || "";
  const feather = new Set(featherList.split(",").map((s) => s.trim()).filter(Boolean));
  const derived = order.filter((name) => feather.has(name) || feather.has(FEATHER_ALIASES[name])).sort();
  const isc = license.slice(0, license.indexOf("---")).trim();
  const mit = license.slice(license.indexOf("The MIT License")).trim();
  const comment = (text) => text.split("\n").map((line) => (line ? `// ${line}` : "//")).join("\n");
  const object = (name, map) => `const ${name} = {\n${Object.entries(map).map(([key, d]) => `  ${/^[a-z]+$/.test(key) ? key : JSON.stringify(key)}: ${JSON.stringify(d)},`).join("\n")}\n};`;

  return [
    "// 생성 파일이다 — 손으로 고치지 않는다. 다시 만드는 법은 tools/build-icons.mjs 머리에 있다.",
    "// V22.9.85 (디자인 작업 지시서 T-10): 선 아이콘의 정본. 메뉴(AB_NAV_ICON_PATHS → client/nav-search-notif-mains.js iconSvg),",
    "// 카테고리(AB_CATEGORY_ICON_PATHS → 셸 CSS 마스크), 웹 화면 아이콘(AB_UI_ICON_PATHS → 셸·홈 CSS 마스크)이 모두 여기서 나온다.",
    "// 값은 24×24 좌표의 path d 하나다. 선 굵기·끝 모양은 그리는 쪽이 정한다.",
    `// 원본 lucide-static ${LUCIDE_VERSION} (아이콘 ${order.length}개, 원본 SVG 합 SHA-256 ${sourceSha}) · 최적화 SVGO ${SVGO_VERSION}`,
    "//",
    comment(isc),
    "//",
    comment(`These icons here are derived from the Feather project: ${derived.join(", ")}`),
    "//",
    comment(mit),
    object("AB_NAV_ICON_PATHS", nav),
    object("AB_CATEGORY_ICON_PATHS", category),
    object("AB_UI_ICON_PATHS", ui),
    "// @build:exports-start",
    "export { AB_CATEGORY_ICON_PATHS, AB_NAV_ICON_PATHS, AB_UI_ICON_PATHS };",
    "// @build:exports-end",
    "",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [lucideDir = "lucide/package", svgoDir = "svgo-tool"] = process.argv.slice(2);
  const text = await buildIcons(resolve(lucideDir), resolve(svgoDir));
  const out = fileURLToPath(new URL("../src/modules/assets/icon-paths.js", import.meta.url));
  writeFileSync(out, text);
  console.log(`icon-paths.js ${Buffer.byteLength(text)} B sha256 ${createHash("sha256").update(text).digest("hex")}`);
}
