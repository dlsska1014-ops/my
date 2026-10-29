// V22.9.81 screens 패키지 — 오프라인 스타일 엔진(화면이 실제로 받는 CSS 로 요소의 최종 글씨색·바탕색을 구하고 WCAG 대비를 잰다).
// validation/validate-dark-screens-v22980.mjs 의 엔진을 그대로 옮겨 내보내고(그 검사 파일은 그대로 둔다), 이 판의 검사가 더 쓰는 것만 보탰다:
//   - 흰색 이름(white)·rgb(255,255,255) 를 #ffffff 로 읽는다(hexOf).
//   - 상속하는 글꼴 크기·굵기(fontOf)와 큰 글씨 판정(isLarge: 24px 이상, 또는 700 이상 굵기에 18.66px 이상).
//   - 바탕이 투명하면 조상으로 올라가 처음 나오는 단색을 쓴다(solidBackdrop). 그라데이션·반투명·color-mix 는 '알 수 없음'으로 돌려준다.
//   - 선택자 하나로 그 선택자에 맞는 가장 작은 요소 줄을 지어낸다(chainForSelector) — 규칙 단위로 다크 대비를 훑을 때 쓴다.
// 지원하는 선택자: 태그·.클래스·#id·[속성]·[속성="값"]·:is()·:not(단순)·:nth-child(N)·:first-child·:last-child·:root·상태(:hover 등)·후손(공백)·자식(>) 결합자.
// 그 밖의 것(:has·형제 결합자·::pseudo·복잡한 :not)이 든 선택자는 맞지 않는 것으로 본다.
import { app, BASE, ctx } from "./lib-audit-v22934.mjs";

// ── 화면이 받는 CSS ───────────────────────────────────────────────────────────────────────
export async function asset(fx, path, cookie = fx.cookie) {
  const response = await app.fetch(new Request(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }), fx.env, ctx);
  return { status: response.status, text: await response.text() };
}
// 문서 순서대로 <style> 본문과 <link rel="stylesheet" href="/assets/…"> 내용을 이어 붙인다(같은 명시도면 뒤에 온 규칙이 이긴다).
// parts 를 함께 돌려줘 규칙이 어디(인라인·어느 자산)에서 왔는지 알 수 있다.
export async function servedCssParts(fx, html, cookie = fx.cookie) {
  const parts = [];
  for (const m of String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|<link\b([^>]*)>/g)) {
    if (m[1] !== undefined) { parts.push({ origin: "inline", text: m[1] }); continue; }
    if (!/\brel="stylesheet"/.test(m[2])) continue;
    const href = (m[2].match(/\bhref="([^"]+)"/) || [])[1];
    if (href && href.startsWith("/assets/")) parts.push({ origin: href, text: (await asset(fx, href, cookie)).text });
  }
  return { parts, css: parts.map((p) => `${p.text}\n`).join("") };
}
export async function servedCss(fx, html, cookie = fx.cookie) { return (await servedCssParts(fx, html, cookie)).css; }
export const bodyClassesOf = (html) => ((String(html).match(/<body\b[^>]*\bclass="([^"]*)"/) || [])[1] || "").split(/\s+/).filter(Boolean);

// ── 색 계산(WCAG 2.x) ─────────────────────────────────────────────────────────────────────
export const hex3 = (value) => { const v = String(value).trim().replace("#", ""); const f = v.length === 3 ? v.split("").map((c) => c + c).join("") : v.slice(0, 6); return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const channel = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export const rgbOf = (color) => (Array.isArray(color) ? color : hex3(color));
export const ratio = (fg, bg) => { const a = lum(rgbOf(fg)), b = lum(rgbOf(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
export const blend = (fg, alpha, bg) => rgbOf(fg).map((v, i) => v * alpha + rgbOf(bg)[i] * (1 - alpha));
export const fmtColor = (c) => (Array.isArray(c) ? `rgb(${c.map((v) => Math.round(v)).join(",")})` : String(c || "(색 없음)"));
export function hexOf(value) {
  const v = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v.slice(1).split("").map((c) => c + c).join("")}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (v === "white" || /^rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*1(?:\.0+)?\s*)?\)$/.test(v)) return "#ffffff";
  if (v === "black" || /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(?:,\s*1(?:\.0+)?\s*)?\)$/.test(v)) return "#000000";
  return "";
}

// ── 작은 스타일 엔진 ──────────────────────────────────────────────────────────────────────
const RULES = new Map();
const PARSED = new Map();
const MEMO = new Map();
const CSS_IDS = new Map();
let UID = 0;
export function splitTop(text, sep = ",") {
  const parts = [];
  let depth = 0, start = 0, quote = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}
// :is() 풀기에서 대안이 태그로 시작하고 앞이 같은 복합 선택자에 붙어 있으면 태그를 복합 선택자 맨 앞으로 옮긴다(.u:is(a,b) → a.u, b.u).
function joinAlt(prefix, alt, suffix) {
  const m = alt.match(/^([a-zA-Z][\w-]*)(.*)$/);
  if (m && prefix && !/[\s>+~(,]$/.test(prefix)) {
    const cut = Math.max(prefix.lastIndexOf(" "), prefix.lastIndexOf(">"), prefix.lastIndexOf("+"), prefix.lastIndexOf("~")) + 1;
    return prefix.slice(0, cut) + m[1] + prefix.slice(cut) + m[2] + suffix;
  }
  return prefix + alt + suffix;
}
export function expandIs(selector) {
  const at = selector.indexOf(":is(");
  if (at < 0) return [selector];
  let depth = 0, end = -1;
  for (let i = at + 3; i < selector.length; i += 1) {
    if (selector[i] === "(") depth += 1;
    else if (selector[i] === ")") { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [selector];
  const prefix = selector.slice(0, at), suffix = selector.slice(end + 1);
  return splitTop(selector.slice(at + 4, end)).flatMap((alt) => expandIs(joinAlt(prefix, alt, suffix)));
}
export const normSel = (selector) => String(selector).replace(/\s+/g, " ").replace(/\s*([>+~])\s*/g, "$1").trim();
function declsOf(body) {
  return splitTop(body, ";").map((decl) => {
    const at = decl.indexOf(":");
    if (at < 0) return null;
    const prop = decl.slice(0, at).trim();
    let value = decl.slice(at + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    value = value.replace(/!\s*important\s*$/i, "").trim();
    return prop ? { prop, value, important } : null;
  }).filter(Boolean);
}
export function flatRules(css) {
  if (RULES.has(css)) return RULES.get(css);
  const out = [];
  let order = 0;
  const walk = (text, media) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      let head = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < text.length && depth) { if (text[j] === "{") depth += 1; else if (text[j] === "}") depth -= 1; j += 1; }
      const body = text.slice(open + 1, j - 1);
      head = head.replace(/^(?:@(?:import|charset|namespace)[^;]*;\s*)+/, "");
      if (head.startsWith("@media")) walk(body, [...media, head.slice(6).trim()]);
      else if (head.startsWith("@supports") || head.startsWith("@layer")) walk(body, media);
      else if (!head.startsWith("@")) out.push({ head, sels: splitTop(head).flatMap(expandIs).map(normSel), body, media, order: order++, decls: declsOf(body) });
      i = j;
    }
  };
  walk(String(css).replace(/\/\*[\s\S]*?\*\//g, ""), []);
  RULES.set(css, out);
  return out;
}
export function mediaOk(conds, width) {
  return conds.every((cond) => splitTop(cond).some((query) => {
    const q = query.toLowerCase();
    if (/prefers-|hover|pointer|print|orientation|resolution|-webkit-|forced-colors|max-height|min-height/.test(q)) return false;
    const min = q.match(/min-width:\s*(\d+(?:\.\d+)?)px/), max = q.match(/max-width:\s*(\d+(?:\.\d+)?)px/);
    if (min && width < Number(min[1])) return false;
    if (max && width > Number(max[1])) return false;
    return true;
  }));
}
export function parseCompound(text) {
  const c = { tag: "", id: "", classes: [], attrs: [], nots: [], nth: 0, first: false, last: false, states: [], root: false, bad: false, spec: 0 };
  let used = 0;
  for (const tok of text.match(/::?[a-zA-Z-]+(?:\((?:[^()]|\([^()]*\))*\))?|\.[\w-]+|#[\w-]+|\[[^\]]*\]|[a-zA-Z][\w-]*|\*/g) || []) {
    used += tok.length;
    if (tok.startsWith("::")) { c.bad = true; continue; }
    if (tok[0] === ":") {
      const m = tok.match(/^:([a-zA-Z-]+)(?:\(([\s\S]*)\))?$/);
      const name = m[1], arg = m[2];
      if (name === "not" && arg) { const inner = parseCompound(normSel(arg)); if (inner.bad) c.bad = true; else { c.nots.push(inner); c.spec += inner.spec; } }
      else if (name === "nth-child" && /^\d+$/.test(arg || "")) { c.nth = Number(arg); c.spec += 1000; }
      else if (name === "first-child") { c.first = true; c.spec += 1000; }
      else if (name === "last-child") { c.last = true; c.spec += 1000; }
      else if (name === "root") { c.root = true; c.spec += 1000; }
      else if (["focus", "hover", "active", "visited", "focus-visible", "focus-within", "disabled", "checked"].includes(name)) { c.states.push(name); c.spec += 1000; }
      else c.bad = true;
      continue;
    }
    if (tok[0] === ".") { c.classes.push(tok.slice(1)); c.spec += 1000; continue; }
    if (tok[0] === "#") { c.id = tok.slice(1); c.spec += 1e6; continue; }
    if (tok[0] === "[") {
      const m = tok.match(/^\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*))\s*)?\]$/);
      if (!m || (m[2] && m[2] !== "=")) { c.bad = true; continue; }
      c.attrs.push([m[1], m[2] ? (m[3] ?? m[4] ?? m[5] ?? "") : null]);
      c.spec += 1000;
      continue;
    }
    if (tok === "*") continue;
    c.tag = tok.toLowerCase();
    c.spec += 1;
  }
  if (used !== text.length) c.bad = true;
  return c;
}
export function parseSelector(selector) {
  if (PARSED.has(selector)) return PARSED.get(selector);
  const parts = [], combs = [];
  let depth = 0, cur = "";
  const push = () => { if (cur) { parts.push(parseCompound(cur)); cur = ""; } };
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (depth === 0 && (ch === " " || ch === ">" || ch === "+" || ch === "~")) { push(); combs.push(ch); continue; }
    cur += ch;
  }
  push();
  const parsed = { parts, combs, bad: parts.length === 0 || combs.length !== parts.length - 1 || parts.some((p) => p.bad) || combs.some((c) => c === "+" || c === "~"), spec: parts.reduce((sum, p) => sum + p.spec, 0) };
  PARSED.set(selector, parsed);
  return parsed;
}
function matchCompound(c, el) {
  if (c.bad) return false;
  if (c.tag && c.tag !== el.tag) return false;
  if (c.id && c.id !== el.id) return false;
  if (!c.classes.every((k) => el.classes.includes(k))) return false;
  for (const [name, value] of c.attrs) { const have = el.attrs[name]; if (have === undefined || (value !== null && have !== value)) return false; }
  if (c.nots.some((n) => matchCompound(n, el))) return false;
  if (c.nth && el.nth !== c.nth) return false;
  if (c.first && !el.first) return false;
  if (c.last && !el.last) return false;
  if (c.root && el.tag !== "html") return false;
  return c.states.every((s) => el.states.includes(s));
}
export function matchSelector(parsed, el, idx = parsed.parts.length - 1) {
  if (!matchCompound(parsed.parts[idx], el)) return false;
  if (idx === 0) return true;
  if (parsed.combs[idx - 1] === ">") return el.parent ? matchSelector(parsed, el.parent, idx - 1) : false;
  for (let p = el.parent; p; p = p.parent) if (matchSelector(parsed, p, idx - 1)) return true;
  return false;
}
// 요소 적기: chain({ tag:"html", attrs:{…} }, { tag:"body", classes:[…] }, …, 대상). 바깥부터 적고, 돌려주는 것은 마지막(대상) 요소다.
export function chain(...descs) {
  let parent = null;
  for (const d of descs) parent = { tag: "div", classes: [], attrs: {}, states: [], id: "", nth: 0, first: false, last: false, ...d, parent, uid: (UID += 1) };
  return parent;
}
const INHERITED = (prop) => prop === "color" || prop.startsWith("--") || prop === "font-size" || prop === "font-weight";
export const beats = (a, b) => !b || a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));
export function cascade(css, el, prop, width) {
  if (!CSS_IDS.has(css)) CSS_IDS.set(css, CSS_IDS.size);
  const memoKey = `${CSS_IDS.get(css)}|${el.uid}|${prop}|${width}`;
  if (MEMO.has(memoKey)) return MEMO.get(memoKey);
  let best = null;
  for (const rule of flatRules(css)) {
    if (!rule.body.includes(prop) || !mediaOk(rule.media, width)) continue;
    let spec = -1;
    for (const sel of rule.sels) { const parsed = parseSelector(sel); if (!parsed.bad && parsed.spec > spec && matchSelector(parsed, el)) spec = parsed.spec; }
    if (spec < 0) continue;
    for (const decl of rule.decls) {
      if (decl.prop !== prop) continue;
      const key = [decl.important ? 1 : 0, spec, rule.order];
      if (beats(key, best && best.key)) best = { key, value: decl.value, important: decl.important, rule };
    }
  }
  MEMO.set(memoKey, best);
  return best;
}
export function resolveVars(css, el, value, width, depth = 0) {
  if (depth > 8) return value;
  return String(value).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_m, name, fallback) => {
    const v = computed(css, el, name, width);
    return v != null && v !== "" ? v : (fallback !== undefined ? resolveVars(css, el, fallback.trim(), width, depth + 1) : "");
  });
}
export function computed(css, el, prop, width = 1280) {
  const own = cascade(css, el, prop, width);
  if (own) {
    const value = resolveVars(css, el, own.value, width);
    if (/^(inherit|unset)$/i.test(value) && (value.toLowerCase() === "inherit" || INHERITED(prop))) return el.parent ? computed(css, el.parent, prop, width) : null;
    return /^initial$/i.test(value) ? null : value;
  }
  return INHERITED(prop) && el.parent ? computed(css, el.parent, prop, width) : null;
}
// 상속하지 않는 바탕은 background / background-color 중 우선하는 선언 하나를 쓴다. 색이 아니면(그라데이션 등) "" 를 돌려준다.
export function backgroundDecl(css, el, width = 1280) {
  const a = cascade(css, el, "background", width), b = cascade(css, el, "background-color", width);
  return !a ? b : !b ? a : beats(b.key, a.key) ? b : a;
}
export function backgroundOf(css, el, width = 1280) {
  const pick = backgroundDecl(css, el, width);
  return pick ? hexOf(resolveVars(css, el, pick.value, width)) : "";
}
// 바탕이 없거나 투명하면 조상으로 올라간다. 단색을 찾으면 { color, at } , 그라데이션·반투명 등 읽을 수 없는 바탕을 만나면 { color:"", unknown } 을 돌려준다.
export function solidBackdrop(css, el, width = 1280, fallback = "") {
  for (let e = el; e; e = e.parent) {
    const pick = backgroundDecl(css, e, width);
    if (!pick) continue;
    const value = resolveVars(css, e, pick.value, width).trim();
    if (!value || /^(transparent|none|initial|unset|inherit)$/i.test(value) || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(value)) continue;
    const hex = hexOf(value) || hexOf(value.split(/\s+/)[0]);
    return hex ? { color: hex, at: e, value } : { color: "", unknown: value, at: e };
  }
  return { color: fallback, at: null };
}
export const colorOf = (css, el, width = 1280) => hexOf(computed(css, el, "color", width));
export const num = (value, fallback = 1) => (value == null || value === "" ? fallback : Number(value));
// 글꼴 크기(px)·굵기. px·rem(16px)·백분율 없는 em(부모 기준)만 푼다. 못 읽으면 크기 0(= 작은 글씨로 본다).
export function fontOf(css, el, width = 1280) {
  const sizeAt = (e, depth = 0) => {
    if (!e || depth > 30) return 16;
    const own = cascade(css, e, "font-size", width);
    if (!own) return sizeAt(e.parent, depth + 1);
    const v = resolveVars(css, e, own.value, width).trim();
    let m;
    if ((m = v.match(/^(\d*\.?\d+)px$/))) return Number(m[1]);
    if ((m = v.match(/^(\d*\.?\d+)rem$/))) return Number(m[1]) * 16;
    if ((m = v.match(/^(\d*\.?\d+)em$/))) return Number(m[1]) * sizeAt(e.parent, depth + 1);
    if (/^inherit$/i.test(v)) return sizeAt(e.parent, depth + 1);
    return 0;
  };
  const w = String(computed(css, el, "font-weight", width) || "400").trim();
  const weight = /^\d+$/.test(w) ? Number(w) : /bold/i.test(w) ? 700 : 400;
  return { size: sizeAt(el), weight };
}
export const isLarge = ({ size, weight }) => size >= 24 || (weight >= 700 && size >= 18.66);

// 선택자 하나에 맞는 가장 작은 요소 줄: html(테마·톤) > body(bodyClasses ∪ 선택자의 body 조각) > 선택자의 나머지 조각들. 대상(마지막 조각)을 돌려준다.
// 가상 요소·형제 결합자 등 엔진이 모르는 선택자면 null.
export function chainForSelector(selector, { dark = false, tone = "", bodyClasses = [] } = {}) {
  const parsed = parseSelector(selector);
  if (parsed.bad) return null;
  const theme = dark ? "dark" : "light";
  const html = { tag: "html", attrs: { "data-ab-resolved-theme": theme, ...(tone ? { "data-ab-tone": tone } : {}) }, classes: [] };
  const body = { tag: "body", classes: [...bodyClasses], attrs: {} };
  const rest = [];
  let clash = false;
  parsed.parts.forEach((c, i) => {
    const attrs = Object.create(null);
    for (const [name, value] of c.attrs) attrs[name] = value === null ? "" : value;
    const desc = { classes: [...c.classes], attrs, id: c.id, states: [...c.states], nth: c.nth || (c.first ? 1 : 0), first: c.first || c.nth === 1, last: c.last };
    if (c.root || c.tag === "html") {
      // 선택자가 다른 테마·톤을 요구하면(예: 라이트로 볼 때 html[data-ab-resolved-theme="dark"] …) 이 테마에서는 맞는 요소가 없다.
      if ((attrs["data-ab-resolved-theme"] !== undefined && attrs["data-ab-resolved-theme"] !== theme) || (attrs["data-ab-tone"] !== undefined && attrs["data-ab-tone"] !== tone)) clash = true;
      Object.assign(html.attrs, attrs); html.classes.push(...c.classes); return;
    }
    if (c.tag === "body") { body.classes.push(...c.classes.filter((k) => !body.classes.includes(k))); Object.assign(body.attrs, attrs); return; }
    rest.push({ tag: c.tag || (i === parsed.parts.length - 1 ? "span" : "div"), ...desc });
  });
  if (!rest.length || clash) return null;
  return chain(html, body, ...rest);
}

// 화면 HTML 에서 요소의 실제 조상 줄(html > body > … > 요소)을 읽는다. 스크립트·스타일·주석은 건너뛴다.
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
export function domPaths(html, match, limit = 60) {
  const src = String(html).replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, "");
  const stack = [{ tag: "#root", classes: [], counter: 0 }];
  const found = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:@.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
  const plain = ({ tag, classes, attrs, id, nth, first }) => ({ tag, classes, attrs, id, nth, first });
  for (let m = tagRe.exec(src); m; m = tagRe.exec(src)) {
    const tag = m[2].toLowerCase();
    if (m[1]) { for (let i = stack.length - 1; i > 0; i -= 1) if (stack[i].tag === tag) { stack.length = i; break; } continue; }
    const attrs = Object.create(null);
    for (const a of m[3].matchAll(/([\w:@.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
    const parent = stack[stack.length - 1];
    parent.counter += 1;
    const node = { tag, classes: String(attrs.class || "").split(/\s+/).filter(Boolean), attrs, id: attrs.id || "", nth: parent.counter, first: parent.counter === 1, counter: 0 };
    if (match(node, stack)) { found.push([...stack.slice(1), node].map(plain)); if (found.length >= limit) break; }
    if (!VOID_TAGS.has(tag) && !m[4]) stack.push(node);
  }
  return found;
}
// 찾은 요소의 조상 줄에 테마(다크·톤)를 얹어 엔진용 요소로 만든다. extra 는 그 요소 안쪽으로 이어 붙일 후손 서술(태그·클래스)이다.
export function pathOf(html, match, { dark = false, tone = "", index = 0, label = "요소" } = {}, ...extra) {
  const found = domPaths(html, match, index + 1)[index];
  if (!found) throw new Error(`화면에서 ${label}을(를) 찾지 못했다`);
  const [root, ...rest] = found;
  return chain({ ...root, attrs: { ...root.attrs, "data-ab-resolved-theme": dark ? "dark" : "light", ...(tone ? { "data-ab-tone": tone } : {}) } }, ...rest, ...extra);
}
export const byClass = (tag, ...classes) => (node) => (!tag || node.tag === tag) && classes.every((c) => node.classes.includes(c));
export const inside = (stack, ...classes) => stack.some((node) => classes.every((c) => node.classes.includes(c)));
