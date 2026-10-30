// V22.9.80 dark 패키지 — 다크 모드·옛 관리자 화면·좁은 화면의 글씨 대비와 넘침, 사이드바 달력 ‘오늘’, 주 기준 표시.
//   V79:T-30 다크 예산 센터 카드(.budgetP0.isWarn·.isOver)가 게이지 색(#fbbf24·#f87171)을 배경으로 써 흰 글씨 1.5~2.8:1
//   V79:T-31 다크 /meeting-households·/travel-households·/household-templates 서식 카드·운영 흐름 칸이 흰 바탕에 밝은 글씨 1.10~1.15:1
//   V79:T-32 다크 로그인 꼴 화면의 오류 요약(.authErrorSummary) 1.05:1
//   V79:T-33 사이드바 작은 달력의 ‘오늘’·‘오늘이 있는 달로’가 기기 시간대 날짜를 씀 → KST
//   V79:T-36 옛 관리자 화면(/admin-view) 작은 글씨 2.4~3.9:1, 1024px 에서 8칸 격자 80px 넘침
//   V79:T-37 종합 리포트 예산 사용률 표가 360px·9자리 금액에서 분류 이름을 한 글자씩 줄바꿈
//   V79:T-38 /kakao-commands 예시 줄에 글자 그대로의 \n
//   V79:T-24 ‘주’가 화면마다 다른 뜻(주간 리포트 월요일 시작 / 홈 ‘주별’ 일요일 시작) → 계산은 그대로, 기준을 화면에 적는다
// 실제 Chrome 으로 잰 대비·넘침·스크린샷은 review-artifacts/v80-improvements-2026-10-25/dark/ 에 있다. 이 검사는 그 측정이 가리킨 원인이 고쳐졌는지를 오프라인으로 지킨다.
// 화면이 실제로 받는 CSS(문서 순서대로 <style>과 /assets/*.css)를 읽고, 작은 스타일 엔진(선택자 맞춤·명시도·!important·@media 폭·다크 규칙·상속·var() 풀이)으로
// "이 요소의 글씨·바탕은 결국 무슨 색인가"를 구해 WCAG 대비를 계산한다. 사이드바 달력 스크립트는 가짜 DOM·시계·여러 시간대로 돌린다.
// 엔진이 지원하지 않는 선택자(:has·형제 결합자·복잡한 :not 등)는 규칙을 건너뛴다 — 건너뛴 규칙이 이 검사가 보는 요소에 닿는지는 Chrome 실측(증거 폴더)이 맡는다.
// 사용: node validation/validate-dark-screens-v22980.mjs        (V22980_SOFT=1 또는 --soft: 실패를 세어 끝까지 돌고 마지막에 목록을 찍는다 — 옛 코드에서 몇 개가 깨지는지 볼 때)
import vm from "node:vm";
import { app, BASE, counter, ctx, fixture, page, post, withClock } from "./lib-audit-v22934.mjs";

const SOFT = process.env.V22980_SOFT === "1" || process.argv.includes("--soft");
const base = counter("V22.9.80 다크 모드·화면 결함 검사 통과");
const failed = [];
const passed = [];
let total = 0;
function guard(fn, message) {
  total += 1;
  try { fn(); passed.push(message); } catch (error) {
    if (!SOFT) throw error;
    const detail = String(error.message).split("\n")[0];
    failed.push(detail === message ? message : `${message} — ${detail.slice(0, 140)}`);
  }
}
const ok = (value, message) => guard(() => base.ok(value, message), message);
const eq = (actual, expected, message) => guard(() => base.eq(actual, expected, message), message);
async function section(name, task) {
  try { await task(); } catch (error) {
    if (!SOFT) throw error;
    total += 1;
    failed.push(`${name} 구간이 끝까지 못 돌았다 — ${String(error.message).split("\n")[0].slice(0, 160)}`);
  }
}

const HH = "house-home";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0";
const assetPath = (html, re) => (String(html).match(re) || [])[1] || "";
async function asset(fx, path, cookie = fx.cookie) {
  const response = await app.fetch(new Request(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }), fx.env, ctx);
  return { status: response.status, text: await response.text() };
}
async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = "dark-admin-2026";
  fx.env.ADMIN_SESSION_SECRET = "dark-admin-session-secret";
  const login = await post(fx, "/login", { password: fx.env.ADMIN_PASSWORD }, { cookie: "" });
  return (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
}
// 화면이 받는 CSS 전체를 문서 순서대로 이어 붙인다(<style> 본문 + <link rel="stylesheet" href="/assets/…"> 의 내용). 같은 명시도의 규칙은 뒤에 온 것이 이긴다.
async function servedCss(fx, html, cookie = fx.cookie) {
  let out = "";
  for (const m of String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|<link\b([^>]*)>/g)) {
    if (m[1] !== undefined) { out += `${m[1]}\n`; continue; }
    if (!/\brel="stylesheet"/.test(m[2])) continue;
    const href = (m[2].match(/\bhref="([^"]+)"/) || [])[1];
    if (href && href.startsWith("/assets/")) out += `${(await asset(fx, href, cookie)).text}\n`;
  }
  return out;
}
const bodyClassesOf = (html) => ((String(html).match(/<body\b[^>]*\bclass="([^"]*)"/) || [])[1] || "").split(/\s+/).filter(Boolean);

// ── 색 계산(WCAG 2.x) ─────────────────────────────────────────────────────────────────────
const hex3 = (value) => { const v = String(value).trim().replace("#", ""); const f = v.length === 3 ? v.split("").map((c) => c + c).join("") : v.slice(0, 6); return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const channel = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const rgbOf = (color) => (Array.isArray(color) ? color : hex3(color));
const ratio = (fg, bg) => { const a = lum(rgbOf(fg)), b = lum(rgbOf(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const blend = (fg, alpha, bg) => rgbOf(fg).map((v, i) => v * alpha + rgbOf(bg)[i] * (1 - alpha));
const fmtColor = (c) => (Array.isArray(c) ? `rgb(${c.map((v) => Math.round(v)).join(",")})` : String(c || "(색 없음)"));
const hexOf = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v.slice(1).split("").map((c) => c + c).join("")}`;
  return /^#[0-9a-f]{6}$/.test(v) ? v : "";
};
const aa = (fg, bg, label, need = 4.5) => {
  const readable = !!fg && !!bg;
  const r = readable ? ratio(fg, bg) : 0;
  ok(readable && r >= need, `${label} — ${fmtColor(fg)} on ${fmtColor(bg)}${readable ? ` = ${r.toFixed(2)}:1` : ""} ≥ ${need}:1`);
};

// ── 작은 스타일 엔진(오프라인) ───────────────────────────────────────────────────────────────
// 규칙 목록(@media 조건 포함) → 요소에 맞는 선택자 → (!important, 명시도, 순서)로 승부 → 상속(color·--변수) → var() 풀이.
// 요소는 chain(html, body, …, 대상) 으로 적는다(바깥부터). 이 엔진이 지원하는 선택자: 태그·.클래스·#id·[속성]·[속성="값"]·:is()·:not(단순)·:nth-child(N)·:first-child·:last-child·:root·
// 상태(:focus 등, 요소의 states 에 있을 때만)와 후손(공백)·자식(>) 결합자. 그 밖의 것(:has·형제 결합자·::pseudo·복잡한 :not)이 든 선택자는 맞지 않는 것으로 본다.
const RULES = new Map();
const PARSED = new Map();
const MEMO = new Map();
const CSS_IDS = new Map();
let UID = 0;
function splitTop(text, sep = ",") {
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
function expandIs(selector) {
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
const normSel = (selector) => String(selector).replace(/\s+/g, " ").replace(/\s*([>+~])\s*/g, "$1").trim();
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
function flatRules(css) {
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
      else if (!head.startsWith("@")) out.push({ sels: splitTop(head).flatMap(expandIs).map(normSel), body, media, order: order++, decls: declsOf(body) });
      i = j;
    }
  };
  walk(String(css).replace(/\/\*[\s\S]*?\*\//g, ""), []);
  RULES.set(css, out);
  return out;
}
function mediaOk(conds, width) {
  return conds.every((cond) => splitTop(cond).some((query) => {
    const q = query.toLowerCase();
    if (/prefers-|hover|pointer|print|orientation|resolution|-webkit-|forced-colors/.test(q)) return false;
    const min = q.match(/min-width:\s*(\d+(?:\.\d+)?)px/), max = q.match(/max-width:\s*(\d+(?:\.\d+)?)px/);
    if (min && width < Number(min[1])) return false;
    if (max && width > Number(max[1])) return false;
    return true;
  }));
}
function parseCompound(text) {
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
function parseSelector(selector) {
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
function matchSelector(parsed, el, idx = parsed.parts.length - 1) {
  if (!matchCompound(parsed.parts[idx], el)) return false;
  if (idx === 0) return true;
  if (parsed.combs[idx - 1] === ">") return el.parent ? matchSelector(parsed, el.parent, idx - 1) : false;
  for (let p = el.parent; p; p = p.parent) if (matchSelector(parsed, p, idx - 1)) return true;
  return false;
}
// 요소 적기: chain({ tag:"html", attrs:{…} }, { tag:"body", classes:[…] }, …, 대상). 바깥부터 적고, 돌려주는 것은 마지막(대상) 요소다.
function chain(...descs) {
  let parent = null;
  for (const d of descs) parent = { tag: "div", classes: [], attrs: {}, states: [], id: "", nth: 0, first: false, last: false, ...d, parent, uid: (UID += 1) };
  return parent;
}
const INHERITED = (prop) => prop === "color" || prop.startsWith("--");
const beats = (a, b) => !b || a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));
function cascade(css, el, prop, width) {
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
      if (beats(key, best && best.key)) best = { key, value: decl.value, important: decl.important };
    }
  }
  MEMO.set(memoKey, best);
  return best;
}
function resolveVars(css, el, value, width, depth = 0) {
  if (depth > 8) return value;
  return String(value).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_m, name, fallback) => {
    const v = computed(css, el, name, width);
    return v != null && v !== "" ? v : (fallback !== undefined ? resolveVars(css, el, fallback.trim(), width, depth + 1) : "");
  });
}
function computed(css, el, prop, width = 1280) {
  const own = cascade(css, el, prop, width);
  if (own) {
    const value = resolveVars(css, el, own.value, width);
    // CSS 전역 키워드: inherit(·상속하는 속성의 unset)는 부모 값을 그대로 쓴다. initial 은 값 없음.
    if (/^(inherit|unset)$/i.test(value) && (value.toLowerCase() === "inherit" || INHERITED(prop))) return el.parent ? computed(css, el.parent, prop, width) : null;
    return /^initial$/i.test(value) ? null : value;
  }
  return INHERITED(prop) && el.parent ? computed(css, el.parent, prop, width) : null;
}
// 상속하지 않는 바탕은 background / background-color 중 우선하는 선언 하나를 쓴다. 색이 아니면(그라데이션 등) "" 를 돌려준다.
function backgroundOf(css, el, width = 1280) {
  const a = cascade(css, el, "background", width), b = cascade(css, el, "background-color", width);
  const pick = !a ? b : !b ? a : beats(b.key, a.key) ? b : a;
  return pick ? hexOf(resolveVars(css, el, pick.value, width)) : "";
}
const colorOf = (css, el, width = 1280) => hexOf(computed(css, el, "color", width));
const num = (value, fallback = 1) => (value == null || value === "" ? fallback : Number(value));

// 화면 HTML 에서 요소의 실제 조상 줄(html > body > … > 요소)을 읽는다. 후손 선택자·:nth-child 규칙이 실제 구조에서 맞는지 보려면 조상을 지어내면 안 된다.
// 스크립트·스타일·주석은 건너뛰고, 닫는 태그가 빠진 곳은 가장 가까운 같은 이름의 열린 태그까지 닫는다(서버가 내는 HTML 은 짝이 맞는다).
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
function domPaths(html, match, limit = 60) {
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
function pathOf(html, match, { dark = false, tone = "", index = 0, label = "요소" } = {}, ...extra) {
  const found = domPaths(html, match, index + 1)[index];
  if (!found) throw new Error(`화면에서 ${label}을(를) 찾지 못했다`);
  const [root, ...rest] = found;
  return chain({ ...root, attrs: { ...root.attrs, "data-ab-resolved-theme": dark ? "dark" : "light", ...(tone ? { "data-ab-tone": tone } : {}) } }, ...rest, ...extra);
}
const byClass = (tag, ...classes) => (node) => node.tag === tag && classes.every((c) => node.classes.includes(c));

// ── 엔진 자체 확인 ────────────────────────────────────────────────────────────────────────
// 아래 구간이 믿는 승부 규칙을 합성 CSS 로 먼저 본다(엔진이 틀리면 이 검사의 모든 판정이 틀린다).
{
  const css = `.a{color:#111111}@media(max-width:700px){.a{color:#222222}}@media(min-width:900px){.a{color:#333333}}.b{color:#444444!important}.b.k{color:#555555}
html[data-ab-resolved-theme="dark"] :is(.c,.d){color:#666666}.c{color:#777777}.c{--x:#abcdef}@media(prefers-reduced-motion:reduce){.a{color:#999999}}
@keyframes spin{from{color:#000000}to{color:#ffffff}}.e>span{opacity:.5}.e span{opacity:.9}.p .q{color:#101010}.p>.q{color:#202020}.r:not(.s){color:#303030}.r.s{color:#404040}
.t td:nth-child(2){color:#505050}.u:is(a,b){--v:var(--w,#606060);color:var(--v)}.x.y{color:#707070}.x{color:#808080}.z{color:#909090}div.z{color:#a0a0a0}
@supports(display:grid){.g{color:#b0b0b0}}.h::before{color:#c0c0c0}.h+.i{color:#d0d0d0}.j{color:#e0e0e0}.j:hover{color:#f0f0f0}`;
  const doc = (dark) => [{ tag: "html", attrs: { "data-ab-resolved-theme": dark ? "dark" : "light" } }, { tag: "body" }];
  const at = (descs, prop = "color", width = 1280) => computed(css, chain(...descs), prop, width);
  eq(at([...doc(false), { classes: ["a"] }], "color", 500), "#222222", "엔진: 좁은 폭에서는 max-width 규칙이 이긴다");
  eq(at([...doc(false), { classes: ["a"] }], "color", 800), "#111111", "엔진: 중간 폭에서는 두 미디어 조건이 다 거짓이라 기본 규칙");
  eq(at([...doc(false), { classes: ["a"] }], "color", 1000), "#333333", "엔진: 넓은 폭에서는 min-width 규칙이 이긴다(뒤에 온 규칙, prefers-* 규칙은 건너뜀)");
  eq(at([...doc(false), { classes: ["b", "k"] }]), "#444444", "엔진: !important 는 더 센 명시도의 일반 선언을 이긴다");
  eq(at([...doc(false), { classes: ["c"] }]), "#777777", "엔진: 라이트에서는 다크 규칙이 맞지 않는다");
  eq(at([...doc(true), { classes: ["c"] }]), "#666666", "엔진: 다크에서는 다크 규칙(:is 풀기 포함)이 뒤에 온 일반 규칙보다 명시도로 이긴다");
  eq(at([...doc(true), { classes: ["d"] }]), "#666666", "엔진: :is 안의 둘째 선택자도 풀린다");
  eq(at([...doc(false), { classes: ["c"] }], "--x"), "#abcdef", "엔진: 사용자 지정 속성도 읽는다");
  eq(at([...doc(false), { classes: ["e"] }, { tag: "span" }], "opacity"), ".9", "엔진: 후손 선택자(.e span)가 자식 선택자(.e>span)와 같은 명시도라 뒤에 온 규칙이 이긴다");
  eq(at([...doc(false), { classes: ["p"] }, { classes: ["m"] }, { classes: ["q"] }]), "#101010", "엔진: 손자는 후손 결합자(.p .q)에만 맞고 자식 결합자(.p>.q)에는 안 맞는다");
  eq(at([...doc(false), { classes: ["p"] }, { classes: ["q"] }]), "#202020", "엔진: 직계 자식은 둘 다 맞고 뒤에 온 .p>.q 가 이긴다");
  eq(at([...doc(false), { classes: ["r"] }]), "#303030", "엔진: :not(.s) 는 .s 가 없는 요소에 맞는다");
  eq(at([...doc(false), { classes: ["r", "s"] }]), "#404040", "엔진: .s 가 있으면 :not(.s) 규칙은 빠진다");
  eq(at([...doc(false), { classes: ["t"] }, { tag: "td", nth: 2 }]), "#505050", "엔진: :nth-child(2) 는 요소의 nth 와 맞을 때만 맞는다");
  eq(at([...doc(false), { classes: ["t"] }, { tag: "td", nth: 1 }]), null, "엔진: nth 가 다르면 맞지 않고, 규칙이 없으면 상속할 부모 색도 없다(null)");
  eq(at([...doc(false), { tag: "a", classes: ["u"] }]), "#606060", "엔진: var(--v) → var(--w,#606060) 대체값까지 풀린다");
  eq(at([...doc(false), { classes: ["x", "y"] }]), "#707070", "엔진: 클래스가 많은 선택자가 뒤에 온 단순 선택자보다 명시도로 이긴다");
  eq(at([...doc(false), { tag: "div", classes: ["z"] }]), "#a0a0a0", "엔진: 태그+클래스가 클래스 하나보다 세다");
  eq(at([...doc(false), { classes: ["g"] }]), "#b0b0b0", "엔진: @supports 안의 규칙은 적용된 것으로 본다");
  eq(at([...doc(false), { classes: ["h"] }]), null, "엔진: ::before 같은 가상 요소 규칙은 요소 자체에 맞지 않는다");
  eq(at([...doc(false), { classes: ["j"] }]), "#e0e0e0", "엔진: :hover 규칙은 요소 상태가 없으면 맞지 않는다");
  eq(at([...doc(false), { classes: ["j"], states: ["hover"] }]), "#f0f0f0", "엔진: 요소에 hover 상태를 주면 :hover 규칙이 맞는다");
  eq(at([...doc(false), { classes: ["c"] }, { tag: "span" }]), "#777777", "엔진: 규칙이 없는 자식은 부모의 color 를 상속한다");
  eq(computed(`.c{color:#777777}.k{color:inherit!important}`, chain({ tag: "html" }, { classes: ["c"] }, { classes: ["k"] }, { tag: "b" }), "color"), "#777777", "엔진: color:inherit 은 부모 값을 그대로 쓴다(두 단계 아래 자식도 같다)");
  eq(at([...doc(false), { classes: ["z"] }, { tag: "span" }], "opacity"), null, "엔진: opacity 는 상속하지 않는다");
  eq(backgroundOf(`.bg{background:var(--k,#123456)}`, chain({ tag: "html" }, { classes: ["bg"] })), "#123456", "엔진: background 단축 속성의 var() 색을 푼다");
  eq(backgroundOf(`.bg{background:linear-gradient(#111,#222)}`, chain({ tag: "html" }, { classes: ["bg"] })), "", "엔진: 그라데이션은 단색이 아니라 빈 값");
  const sample = '<html lang="ko"><head><style>.x{}</style></head><body class="k1 k2"><main><ul><li>a</li><li class="hit" data-n="2"><b>x</b></li></ul><img src="a.png"><p class="hit">y</p></main></body></html>';
  const hits = domPaths(sample, (node) => node.classes.includes("hit"));
  eq(hits.length, 2, "엔진: HTML 에서 조건에 맞는 요소를 모두 찾는다");
  eq(hits[0].map((n) => n.tag).join(">"), "html>body>main>ul>li", "엔진: 조상 줄은 html>body>main>ul>li (스타일 안의 글은 건너뛴다)");
  eq(hits[0][4].nth + "/" + hits[0][4].first, "2/false", "엔진: 형제 순서(nth)와 첫째 여부를 센다");
  eq(hits[1].map((n) => n.tag).join(">"), "html>body>main>p", "엔진: 빈 태그(img)는 조상이 되지 않아 p 는 main 아래다");
  eq(hits[0][1].classes.join(" "), "k1 k2", "엔진: body 클래스를 읽는다");
  eq(colorOf(`body.k1>main li.hit{color:#123456}`, pathOf(sample, (node) => node.classes.includes("hit"), { dark: true })), "#123456", "엔진: 실제 조상 줄로 후손 선택자가 맞는다");
  ok(Math.abs(ratio("#ffffff", "#000000") - 21) < 0.001, "엔진: 흰색·검정 대비는 21:1");
  eq(hexOf("#FFF"), "#ffffff", "엔진: 3자리 색은 6자리로 펴진다");
}

// ── 예산 센터 상태 만들기 ────────────────────────────────────────────────────────────────
function setBudgetState(fx, mode) {
  const rows = fx.db.transactions.filter((t) => t.household_id === HH && t.type === "expense" && String(t.transaction_date).startsWith("2026-07"));
  const spent = Object.create(null);
  for (const t of rows) spent[t.category] = (spent[t.category] || 0) + Number(t.amount || 0);
  for (const b of fx.db.accountbook_budgets) {
    if (b.household_id !== HH || b.month !== "2026-07" || String(b.category).startsWith("__")) continue;
    const s = spent[b.category] || 0;
    if (mode === "over") b.amount = Math.max(1000, Math.floor(s * 0.5));
    else if (mode === "warn") b.amount = Math.max(1000, Math.ceil(s / 0.9));
  }
}
const inside = (stack, ...classes) => stack.some((node) => classes.every((c) => node.classes.includes(c)));

// ── T-30. 다크 예산 센터 카드 ─────────────────────────────────────────────────────────────
// .budgetP0.isWarn·.isOver 의 배경은 var(--ab12-gauge-warn|over) 이고 셸이 다크에서 그 토큰을 밝은 막대·글자용 값(#fbbf24·#f87171)으로 바꾼다.
// 카드는 흰 글씨라 1.5~2.8:1 이었다. 토큰은 홈·내비·리포트 게이지가 함께 쓰므로 뜻을 바꾸지 않고, 이 카드만 다크에서 라이트 값으로 되돌린다.
// 라벨·단위·보조 줄의 투명도(.86·.82·.9)도 흰 글씨 대비를 4.0~4.5:1 로 깎아(다크 기본 카드·라이트 경고 카드·초록 톤) .94 로 올렸다.
await section("T-30", async () => {
  const tones = ["", "emerald", "violet", "amber"];
  for (const state of ["", "warn", "over"]) {
    await withClock("2026-07-15", () => fixture(async (fx) => {
      setBudgetState(fx, state);
      const response = await page(fx, `/budgets?month=2026-07&household_id=${HH}`);
      const label = state || "기본";
      eq(response.status, 200, `예산 센터(${label} 상태)가 열린다`);
      const cls = state === "warn" ? ["isWarn"] : state === "over" ? ["isOver"] : [];
      ok(response.html.includes(`<section class="${["budgetP0", ...cls].join(" ")}" aria-labelledby="budgetP0Title">`), `${label} 상태의 남은 예산 카드가 .budgetP0${cls.map((c) => `.${c}`).join("")} 로 그려진다`);
      const css = await servedCss(fx, response.html);
      ok(css.length > 100000, "화면 스타일(인라인 + 셸 스타일시트)을 받았다");
      const card = (dark, tone, ...inner) => pathOf(response.html, byClass("section", "budgetP0"), { dark, tone, label: ".budgetP0 카드" }, ...inner);
      for (const dark of [false, true]) {
        for (const tone of state ? [""] : tones) {
          const theme = `${dark ? "다크" : "라이트"}${tone ? `·${tone} 톤` : ""}`;
          const bg = backgroundOf(css, card(dark, tone));
          ok(!!bg, `${theme} ${label} 카드 배경이 단색으로 풀린다 (${bg})`);
          if (!bg) continue;
          aa(colorOf(css, card(dark, tone, { tag: "b" })), bg, `${theme} ${label} 카드: 큰 숫자(b)`);
          // 투명도는 상속하지 않고 그 요소에만 걸린다. 글씨는 흰색을 투명도만큼 바탕과 섞은 색으로 읽힌다.
          for (const [name, inner] of [["라벨(span)", [{ tag: "span" }]], ["단위(b small)", [{ tag: "b" }, { tag: "small" }]], ["합계 줄(p)", [{ tag: "p" }]], ["예산 밖 줄(p.aside)", [{ tag: "p", classes: ["budgetP0Aside"] }]]]) {
            const leaf = card(dark, tone, ...inner);
            const opacity = num(cascade(css, leaf, "opacity", 1280)?.value);
            aa(blend(colorOf(css, leaf), opacity, bg), bg, `${theme} ${label} 카드: ${name} 글씨(투명도 ${opacity})`);
          }
        }
      }
      if (state) {
        // 라이트 값은 그대로 두었다(경고 #c2410c·초과 #b91c1c) — 라이트 모드는 달라지지 않는다.
        eq(backgroundOf(css, card(false, "")), state === "warn" ? "#c2410c" : "#b91c1c", `라이트 ${label} 카드 배경은 예전 값 그대로`);
      } else {
        // 게이지 토큰은 뜻을 바꾸지 않았다: 다크에서 밝은 값(막대·글자용), 라이트에서 진한 값. 홈·내비·리포트 게이지가 그 토큰을 그대로 읽는다.
        const token = (dark, name) => computed(css, card(dark, ""), name);
        eq(`${token(true, "--ab12-gauge-warn")} ${token(true, "--ab12-gauge-over")}`, "#fbbf24 #f87171", "다크 게이지 토큰(--ab12-gauge-warn·-over)은 밝은 값 그대로");
        eq(`${token(false, "--ab12-gauge-warn")} ${token(false, "--ab12-gauge-over")}`, "#c2410c #b91c1c", "라이트 게이지 토큰은 진한 값 그대로");
        ok(css.includes("body.abV22812Shell .homeBudget.isWarn .homeProgress i{background:var(--ab12-gauge-warn)!important}") && css.includes("body.abV22812Shell .homeReport.isOver>b{color:var(--ab12-gauge-over)!important}"), "홈 게이지 규칙은 여전히 같은 토큰을 읽는다");
        const bar = card(true, "", { tag: "div", classes: ["homeBudget", "isWarn"] }, { tag: "div", classes: ["homeProgress"] }, { tag: "i" });
        eq(backgroundOf(css, bar), "#fbbf24", "다크 홈 예산 막대(.homeBudget.isWarn .homeProgress i)는 밝은 경고색 그대로");
        aa(backgroundOf(css, bar), hexOf(token(true, "--ab12-surface")), "다크 홈 예산 막대는 어두운 면 위에서 보인다(그래서 토큰을 바꾸지 않았다)", 3);
      }
    }));
  }
});

// ── T-31. 다크 서식 카드 ──────────────────────────────────────────────────────────────────
// 셸의 다크 규칙은 .card 안 글씨를 밝게(--ab12-text) 바꾸지만 이 화면의 .tmpl(#fff)·.step(#f8fafc) 바탕은 몰라 흰 바탕에 밝은 글씨(1.10~1.15:1)였다.
await section("T-31", () => fixture(async (fx) => {
  for (const path of ["/meeting-households", "/travel-households", "/household-templates"]) {
    const response = await page(fx, `${path}?household_id=${HH}`);
    eq(response.status, 200, `${path} 가 열린다`);
    ok(/class="tmpl"/.test(response.html) && /class="step"/.test(response.html), `${path}: 서식 카드(.tmpl)와 운영 흐름 칸(.step)이 있다`);
    ok(bodyClassesOf(response.html).includes("abV22812Shell"), `${path}: 셸 토큰이 닿는 body(abV22812Shell)다`);
    const css = await servedCss(fx, response.html);
    const cases = [
      [".tmpl", byClass("article", "tmpl"),[["제목(b)", { tag: "b" }], ["설명(p)", { tag: "p" }], ["추천 이름(small)", { tag: "small" }]], "#ffffff"],
      [".step", byClass("div", "step"), [["본문(자체)", null]], "#f8fafc"],
    ];
    for (const [name, match, kids, lightWant] of cases) {
      const at = (dark, desc) => (desc ? pathOf(response.html, match, { dark, label: name }, desc) : pathOf(response.html, match, { dark, label: name }));
      const darkBg = backgroundOf(css, at(true));
      ok(!!darkBg, `${path} 다크 ${name} 바탕이 단색으로 풀린다 (${darkBg})`);
      if (darkBg) {
        ok(lum(rgbOf(darkBg)) < 0.1, `${path} 다크 ${name} 바탕은 어둡다 (${darkBg})`);
        for (const [what, desc] of kids) aa(colorOf(css, at(true, desc)), darkBg, `${path} 다크 ${name} ${what} 글씨`);
        const border = hexOf(computed(css, at(true), "border-color"));
        ok(!!border && lum(rgbOf(border)) < 0.4, `${path} 다크 ${name} 테두리도 어두운 토큰 값이다 (${border})`);
      }
      // 라이트는 그대로: 흰 카드 + 어두운 글씨
      const lightBg = backgroundOf(css, at(false));
      eq(lightBg, lightWant, `${path} 라이트 ${name} 바탕은 예전 값 그대로`);
      for (const [what, desc] of kids) aa(colorOf(css, at(false, desc)), lightBg, `${path} 라이트 ${name} ${what} 글씨`);
    }
  }
}));

// ── T-32. 다크 로그인 꼴 화면의 오류 요약 ─────────────────────────────────────────────────────
// 오류 요약(<a class="authErrorSummary"><b>…</b><span>…</span><strong>…</strong></a>)의 연분홍 바탕(#fef2f2)이 다크에서도 그대로인데, 셸 다크 규칙이
// 로그인 화면의 b·strong 글씨를 --ab12-text(#edeff3)로, 링크(a)를 --ab12-accent 로 !important 강제해 1.05:1 이었다. 상자 안에서만 두 변수를 밝은 분홍으로 덮는다.
await section("T-32", () => fixture(async (fx) => {
  const response = await page(fx, "/my/kakao-link", { cookie: "" });
  eq(response.status, 200, "/my/kakao-link(로그아웃)가 오류 요약과 함께 열린다");
  ok(/<a class="authErrorSummary"[^>]*><b>[^<]+<\/b><span>[^<]+<\/span><strong>[^<]+<\/strong><\/a>/.test(response.html), "오류 요약은 a > b·span·strong 꼴이다");
  const classes = bodyClassesOf(response.html);
  ok(classes.includes("abPageLogin") && classes.includes("abV22812Shell"), "body 는 abPageLogin·abV22812Shell 이다(셸의 로그인 다크 규칙이 닿는다)");
  const css = await servedCss(fx, response.html, "");
  const summary = (dark, ...inner) => pathOf(response.html, byClass("a", "authErrorSummary"), { dark, label: "오류 요약" }, ...inner);
  const bg = backgroundOf(css, summary(true));
  ok(!!bg, `다크 오류 요약 바탕이 단색으로 풀린다 (${bg})`);
  aa(colorOf(css, summary(true, { tag: "b" })), bg, "다크 오류 요약: 제목(b) 글씨");
  aa(colorOf(css, summary(true, { tag: "strong" })), bg, "다크 오류 요약: 링크 문구(strong) 글씨");
  aa(colorOf(css, summary(true)), bg, "다크 오류 요약: 상자 자체(a) 글씨");
  aa(colorOf(css, summary(true, { tag: "span" })), bg, "다크 오류 요약: 안내 문장(span) 글씨");
  const focused = pathOf(response.html, byClass("a", "authErrorSummary"), { dark: true, label: "오류 요약" });
  focused.states = ["focus"];
  aa(hexOf(computed(css, focused, "outline-color")) || "#991b1b", bg, "다크 오류 요약: 포커스 윤곽선(비글자 3:1)", 3);
  // 같은 화면의 다른 다크 요소는 이 해법이 건드리지 않는다(변수 덮기는 .authErrorSummary 안에서만)
  const outside = pathOf(response.html, (node, stack) => node.tag === "h1" && !inside(stack, "authErrorSummary"), { dark: true, label: "제목(h1)" });
  eq(computed(css, outside, "--ab12-text"), "#edeff3", "상자 밖의 --ab12-text 는 다크 본문색 그대로(변수 덮기가 새지 않는다)");
  // 라이트는 그대로
  const lightBg = backgroundOf(css, summary(false));
  eq(lightBg, "#fef2f2", "라이트 오류 요약 바탕은 연분홍 그대로");
  aa(colorOf(css, summary(false)), lightBg, "라이트 오류 요약 글씨");
  aa(colorOf(css, summary(false, { tag: "span" })), lightBg, "라이트 오류 요약 안내 문장");
  aa(colorOf(css, summary(false, { tag: "b" })), lightBg, "라이트 오류 요약 제목(b)");
}));

// ── T-33. 사이드바 작은 달력의 ‘오늘’은 KST ──────────────────────────────────────────────────
// 달력 스크립트는 V5 번들(/assets/accountbook-v5-v22990.js)의 accountbookSidebarDashboardClientMain 안 renderCalendar 다. 그 조각을 꺼내 가짜 DOM·가짜 시계로 돌리고,
// 시간대는 process.env.TZ 로 바꾼다(F-8 날짜 칩 검사와 같은 방식). 예전 코드는 new Date() 의 로컬 getFullYear/getMonth/getDate 를 써서 KST 가 아닌 기기에서 다른 날을 골랐다.
function sidebarMainOf(js) {
  const start = js.indexOf("function accountbookSidebarDashboardClientMain()");
  if (start < 0) return "";
  const end = js.indexOf("})();(function ", start);
  return js.slice(start, end < 0 ? js.length : end + 1);
}
function runSidebarCalendar(main, nowMs, month) {
  const root = { attrs: { "data-month": month, "data-household-id": HH, "data-active-days": "1,4,5" }, innerHTML: "", getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }, querySelector() { return null; } };
  const context = vm.createContext({ document: { querySelectorAll: (selector) => (selector === "[data-ab-nav-calendar]" ? [root] : []) } });
  vm.runInContext(`(() => { const Real = Date; const FIXED = ${nowMs}; globalThis.Date = class extends Real { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); } static now() { return FIXED; } }; })()`, context);
  vm.runInContext(`(${main})()`, context);
  const html = root.innerHTML;
  return {
    today: (html.match(/<a class="abNavCalDay[^"]*\bisToday\b[^"]*"[^>]*data-ab-day="(\d{4}-\d{2}-\d{2})"/) || [])[1] || "",
    focus: (html.match(/<a class="abNavCalDay[^"]*"[^>]*tabindex="0"[^>]*data-ab-day="(\d{4}-\d{2}-\d{2})"/) || [])[1] || "",
    todayLink: (html.match(/<a class="abNavCalToday" href="\/app\?month=(\d{4}-\d{2})/) || [])[1] || "",
    cells: (html.match(/<a class="abNavCalDay/g) || []).length,
  };
}
await section("T-33", () => fixture(async (fx) => {
  const analysis = await page(fx, `/my/analysis?month=2026-07&household_id=${HH}`, { headers: { "user-agent": DESKTOP } });
  const bundlePath = assetPath(analysis.html, /src="(\/assets\/accountbook-v5-[^"]+\.js)"/);
  ok(!!bundlePath, `종합 분석 화면이 V5 번들을 받는다 (${bundlePath})`);
  ok(!/data-ab-nav-calendar/.test(analysis.html), "V22.9.83: 사이드바 작은 달력 자리는 걷어냈다(V5 번들에 남은 달력 스크립트의 KST 계산은 아래에서 계속 본다)");
  const js = (await asset(fx, bundlePath)).text;
  const main = sidebarMainOf(js);
  ok(main.length > 1000 && main.includes("renderCalendar"), "V5 번들에 사이드바 달력 스크립트가 있다");
  const kst = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
  const instants = [
    ["KST 새벽 05:00(UTC 전날 20:00)", Date.parse("2026-07-14T20:00:00Z"), "2026-07"],
    ["KST 밤 23:59", Date.parse("2026-07-15T14:59:00Z"), "2026-07"],
    ["KST 자정 정각(UTC 전날 15:00)", Date.parse("2026-07-14T15:00:00Z"), "2026-07"],
    ["KST 8월 1일 00:30(보는 달은 7월)", Date.parse("2026-07-31T15:30:00Z"), "2026-07"],
    ["KST 새해 첫 시각(보는 달은 12월)", Date.parse("2026-12-31T15:00:00Z"), "2026-12"],
  ];
  // 2026-07-15 03:00Z 기준 UTC 와의 차(분). 이 값이 아니면 이 환경은 시간대를 못 바꾸는 것이라 검사가 의미 없다.
  const zones = [["Asia/Seoul", -540], ["America/Los_Angeles", 420], ["America/New_York", 240], ["Europe/London", -60], ["Pacific/Kiritimati", -840], ["Asia/Kolkata", -330], ["UTC", 0]];
  const savedTz = process.env.TZ;
  try {
    for (const [zone, offset] of zones) {
      process.env.TZ = zone;
      eq(new Date(Date.UTC(2026, 6, 15, 3)).getTimezoneOffset(), offset, `검사 환경이 ${zone} 시간대로 바뀐다`);
      for (const [label, ms, month] of instants) {
        const day = kst(ms);
        const result = runSidebarCalendar(main, ms, month);
        eq(result.cells, new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate(), `${zone} 기기, ${label}: 달력 칸 수가 그 달 일수다`);
        eq(result.today, day.slice(0, 7) === month ? day : "", `${zone} 기기, ${label}: ‘오늘’ 표시는 KST 날짜(${day.slice(0, 7) === month ? day : "보는 달 밖이라 없음"})`);
        eq(result.focus, day.slice(0, 7) === month ? day : `${month}-01`, `${zone} 기기, ${label}: 키보드 정지점(tabindex 0)이 KST 오늘(없으면 1일)`);
        eq(result.todayLink, day.slice(0, 7), `${zone} 기기, ${label}: ‘오늘이 있는 달로’가 KST 달(${day.slice(0, 7)})로 간다`);
      }
    }
  } finally {
    if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz;
  }
}));

// ── T-36. 옛 관리자 화면(/admin-view) ────────────────────────────────────────────────────────
// 이 CSS 는 판마다 덧쓴 층(calm UI → v5.6 → desktopLedger)이라 같은 요소의 색 선언이 여러 번 나오고 마지막 것이 이긴다(!important 가 클래스 이름이 같은 .badge·.amountCell 의
// 색까지 덮는다). 화면이 받은 <style> 로 폭마다(360·1024·1280) 실제 요소(조상 줄 포함)의 최종 색을 구해 대비를 잰다. 1024px 에서는 내비 238px 을 빼면 카드 영역이
// 723px(잰 값)인데 .grid8 이 190px×4+간격 802px 라 80px 넘쳤다.
await section("T-36", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const admin = await adminCookie(fx);
  const ua = { "user-agent": DESKTOP };
  const open = (path) => page(fx, path, { cookie: admin, headers: ua });
  const overview = await open(`/admin-view?month=2026-07&household_id=${HH}`);
  const txTab = await open(`/admin-view?tab=transactions&month=2026-07&household_id=${HH}`);
  const importTab = await open(`/admin-view?tab=import&month=2026-07&household_id=${HH}`);
  const calendarTab = await open(`/admin-view?tab=calendar&month=2026-07&household_id=${HH}`);
  for (const [name, view] of [["overview", overview], ["transactions", txTab], ["import", importTab], ["calendar", calendarTab]]) eq(view.status, 200, `관리자 /admin-view (${name} 탭)가 열린다`);
  const css = await servedCss(fx, overview.html, admin);
  ok(css.includes(".footerNote") && css.includes(".grid8"), "화면 <style> 에 레거시 층(.footerNote·.grid8)이 있다");
  const at = (view, match, label, ...inner) => pathOf(view.html, match, { label }, ...inner);
  const pageBgs = ["#f7f8fa", "#eef3fb", "#ffffff"];   // 잰 바탕(rgb(247,248,250)) + 배경 그라데이션 끝값 + 흰색
  const colorAt = (el, width) => hexOf(computed(css, el, "color", width));
  const footer = at(overview, byClass("div", "footerNote"), ".footerNote");
  const kpiCard = at(overview, byClass("div", "card", "kpi"), ".card.kpi");
  const kpiSpan = at(overview, (n, stack) => n.tag === "span" && inside(stack, "kpi"), ".kpi span");
  const kpiSmall = at(overview, (n, stack) => n.tag === "small" && inside(stack, "kpi"), ".kpi small");
  const kpiBig = (cls) => at(overview, (n, stack) => n.tag === "b" && n.classes.includes(cls) && inside(stack, "kpi"), `.kpi b.${cls}`);
  const tdOf = (view, cls) => at(view, (n) => n.tag === "td" && n.classes.length === 1 && n.classes[0] === cls, `td.${cls}`);
  const cellOf = (cls) => at(txTab, (n) => n.tag === "td" && n.classes.includes("amountCell") && n.classes.includes(cls), `td.amountCell.${cls}`);
  const badgeOf = (cls) => at(txTab, (n) => n.tag === "span" && n.classes.includes("badge") && n.classes.includes(cls), `span.badge.${cls}`);
  const disabled = at(overview, byClass("a", "disabled"), "a.disabled");
  const hint = at(importTab, byClass("div", "fileHint"), ".fileHint");
  for (const width of [360, 1024, 1280]) {
    const wp = `${width}px`;
    for (const bg of pageBgs) aa(colorAt(footer, width), bg, `${wp} 맨 아래 안내(.footerNote) 글씨`);
    const kpiBg = backgroundOf(css, kpiCard, width);
    ok(!!kpiBg, `${wp} KPI 카드(.card.kpi) 바탕이 단색으로 풀린다 (${kpiBg})`);
    aa(colorAt(kpiSpan, width), kpiBg, `${wp} KPI 라벨(.kpi span)`);
    aa(colorAt(kpiSmall, width), kpiBg, `${wp} KPI 보조 줄(.kpi small)`);
    for (const [name, cls] of [["수입", "income"], ["지출", "expense"]]) {
      aa(colorAt(kpiBig(cls), width), kpiBg, `${wp} KPI 큰 숫자 ${name}(b.${cls})`);
      aa(colorAt(tdOf(cls === "income" ? calendarTab : overview, cls), width), "#ffffff", `${wp} 표 안 ${name} 금액(td.${cls})`);
      if (width >= 900) {
        aa(colorAt(cellOf(cls), width), "#ffffff", `${wp} 거래 표 금액 칸(td.amountCell.${cls}) — !important 가 칸 고유색을 덮는다`);
        const badgeBg = backgroundOf(css, badgeOf(cls), width);
        ok(!!badgeBg, `${wp} ${name} 배지(span.badge.${cls}) 바탕이 단색으로 풀린다 (${badgeBg})`);
        aa(colorAt(badgeOf(cls), width), badgeBg, `${wp} ${name} 배지 글씨`);
      }
    }
    aa(colorAt(disabled, width), backgroundOf(css, disabled, width), `${wp} 비활성 링크(a.disabled)`);
    aa(colorAt(hint, width), "#fbf7f0", `${wp} 가져오기 탭 안내(.fileHint)`);
  }
  // 캘린더 탭의 날짜 칸 금액(.dayAmt.income·.expense)도 같은 !important 색을 받는다(바탕 #fffdf9)
  for (const cls of ["income", "expense"]) for (const width of [360, 1280]) aa(colorAt(at(calendarTab, (n) => n.tag === "div" && n.classes.includes("dayAmt") && n.classes.includes(cls), `.dayAmt.${cls}`), width), "#fffdf9", `${width}px 캘린더 탭 날짜 칸 금액(.dayAmt.${cls})`);
  // 모바일 하단 탭: ‘기록 관리’(가운데 + 단추)와 라벨
  for (const [what, view] of [["기본", overview], ["활성", txTab]]) {
    const tab = (...inner) => at(view, (n, stack) => n.tag === "a" && n.nth === 2 && inside(stack, "mobileBottomNav"), ".mobileBottomNav a:nth-child(2)", ...inner);
    const bg = backgroundOf(css, tab(), 360);
    ok(!!bg, `360px 모바일 하단 ‘기록 관리’ 탭(${what}) 바탕이 단색이다 (${bg})`);
    aa(colorAt(tab(), 360), bg, `360px 모바일 하단 ‘기록 관리’ 탭(${what}) 글씨`);
    aa(colorAt(tab({ tag: "b" }), 360), bg, `360px 모바일 하단 ‘기록 관리’ 탭(${what}) + 표시(b)`);
    aa(colorAt(tab({ tag: "span" }), 360), bg, `360px 모바일 하단 ‘기록 관리’ 탭(${what}) 라벨(span)`);
  }
  // 활성 탭 라벨은 .abNavBottom a.active{color:#111827!important} 라 처음부터 진했다. 고친 것은 활성이 아닌 탭 라벨(#8b95a1 → #5f6b7a)이다.
  const navLabel = at(overview, (n, stack) => n.tag === "span" && inside(stack, "abNavBottom") && !inside(stack, "active"), "활성이 아닌 .abNavBottom a span");
  aa(colorAt(navLabel, 360), "#ffffff", "360px 내비 하단 활성이 아닌 탭 라벨(unifiedNavStyle .abNavBottom a)");
  // 격자: 칸 수가 줄어 카드 영역 안에 들어간다. 카드 영역 폭 = 창 − 세로 스크롤바 15 − 내비 패딩 238 − 좌우 여백 48(1024px 에서 Chrome 으로 잰 723px 과 같은 식, 901px 부터 내비가 보인다)
  const grid = at(overview, byClass("section", "grid8"), "section.grid8");
  const containerAt = (width) => width - 15 - 238 - 48;
  const fit = (value, gap, container) => {
    if (/^(?:1fr\s*)+$/.test(value)) return { n: value.trim().split(/\s+/).length, min: 0 };
    const fixed = value.match(/^repeat\((\d+),\s*(?:minmax\((\d+)px,\s*1fr\)|1fr)\)$/);
    if (fixed) return { n: Number(fixed[1]), min: Number(fixed[2] || 0) };
    const auto = value.match(/^repeat\(auto-fit,\s*minmax\(max\((\d+)px,\s*calc\(\(100% - (\d+)px\)\/(\d+)\)\),\s*1fr\)\)$/);
    if (!auto) return null;
    const min = Math.max(Number(auto[1]), (container - Number(auto[2])) / Number(auto[3]));
    return { n: Math.max(1, Math.floor((container + gap) / (min + gap))), min };
  };
  for (const width of [901, 1024, 1100, 1280, 1440, 1920]) {
    const value = String(computed(css, grid, "grid-template-columns", width) || "").replace(/\s+/g, " ");
    const gap = Number((String(computed(css, grid, "gap", width) || "").match(/(\d+)px/) || [])[1] || 0);
    const container = containerAt(width);
    const f = fit(value, gap, container);
    ok(!!f, `${width}px: .grid8 열 정의를 읽었다 (${value})`);
    if (!f) continue;
    const need = f.n * f.min + (f.n - 1) * gap;
    ok(need <= container + 0.5, `${width}px: .grid8 ${f.n}칸이 카드 영역(${container}px) 안에 들어간다 (필요 ${Math.round(need)}px)`);
    ok(f.n <= 4, `${width}px: 8칸 격자는 한 줄에 네 칸을 넘지 않는다 (${f.n}칸)`);
    if (width >= 1280) eq(f.n, 4, `${width}px: 넓은 화면에서는 한 줄 네 칸이 그대로다`);
  }
})));

// ── T-37. 종합 리포트 예산 사용률 표 ──────────────────────────────────────────────────────────
// 360px 에서 금액이 9자리(123,456,789원 ×3)면 분류 열이 줄 수 있는 만큼 줄어 한글이 한 글자씩 줄바꿈됐다(Chrome 으로 잰 값: 이름 칸 45px, ‘카페/간식’ 4줄).
// 분류 열에 최소 폭(7.5em)과 낱말 단위 줄바꿈(keep-all), 금액 칸은 한 줄(nowrap)을 주고 모자란 폭은 표를 감싼 .scroll 상자가 가로 스크롤로 받는다(페이지는 넓어지지 않는다).
await section("T-37", () => fixture(async (fx) => {
  for (const b of fx.db.accountbook_budgets) if (b.household_id === HH) b.amount = 123456789;
  for (const t of fx.db.transactions) if (t.household_id === HH && t.type === "expense") t.amount = 123456789;
  const response = await page(fx, `/my/analysis?month=2026-07&household_id=${HH}&view=report`);
  eq(response.status, 200, "종합 리포트가 열린다");
  ok(/<div class="scroll"><table class="budgetTable"><thead><tr><th>분류<\/th>/.test(response.html), "예산 사용률 표는 .scroll 상자 안의 table.budgetTable 이다");
  ok(response.html.includes("123,456,789원"), "9자리 금액이 표에 나온다(검사 조건)");
  const css = await servedCss(fx, response.html);
  const width = 360;
  // 예산 사용률 표는 화면의 첫 .scroll 표다(둘째는 분류별 지출 표). 클래스가 없던 예전 화면에서도 같은 칸을 짚어 규칙이 없다는 것을 칸마다 보여 준다.
  const cellOf = (tag, index) => pathOf(response.html, (n, stack) => n.tag === tag && inside(stack, "scroll"), { index, label: `예산 표의 ${tag} ${index + 1}번째` });
  const first = cellOf("td", 0);
  ok(first.nth === 1 && first.first, "첫 칸은 분류 이름 칸(td:first-child)이다");
  const minWidth = String(cascade(css, first, "min-width", width)?.value || "");
  ok(/^\d+(\.\d+)?em$/.test(minWidth) && parseFloat(minWidth) >= 7, `분류 열(td:first-child)에 최소 폭이 있다 (${minWidth})`);
  eq(cascade(css, cellOf("th", 0), "min-width", width)?.value, minWidth, "머리글 칸(th:first-child)도 같은 최소 폭이다");
  eq(cascade(css, first, "word-break", width)?.value, "keep-all", "분류 이름은 낱말(공백) 단위로만 꺾인다(keep-all)");
  ok(/break-word|anywhere/.test(cascade(css, first, "overflow-wrap", width)?.value || ""), "공백 없는 긴 분류 이름은 칸 안에서 꺾인다(overflow-wrap) — 칸이 늘어나지 않는다");
  for (let i = 1; i < 5; i += 1) eq(cascade(css, cellOf("td", i), "white-space", width)?.value, "nowrap", `${i + 1}번째 칸(금액·사용률)은 한 줄이다(‘원’이 떨어지지 않는다)`);
  eq(cascade(css, first, "white-space", width)?.value ?? "", "", "분류 칸은 줄바꿈을 막지 않는다(공백에서 꺾일 수 있다)");
  let box = first;
  while (box && !box.classes.includes("scroll")) box = box.parent;
  ok(!!box, "표는 .scroll 상자 안에 있다");
  ok(/auto|scroll/.test(cascade(css, box, "overflow", width)?.value || cascade(css, box, "overflow-x", width)?.value || ""), "표를 감싼 .scroll 상자가 모자란 폭을 가로 스크롤로 받는다(페이지가 넓어지지 않는다)");
  // 표 안에서 분류 이름이 줄어드는 길은 없다: 열 폭 하한(7.5em ≈ 13px 글자 기준 98px)이 ‘카페/간식’(5글자, 약 70px)보다 넓다
  const minPx = (parseFloat(minWidth) || 0) * 13;
  ok(minPx >= 5 * 14, `최소 폭(${minWidth || "없음"}≈${Math.round(minPx)}px)이 다섯 글자 이름 한 줄(약 70px)보다 넓다`);
}));

// ── T-38. /kakao-commands 예시 줄 ────────────────────────────────────────────────────────────
// 예시의 줄바꿈이 글자 그대로의 역슬래시+n 이라 화면에 \n 이 보였다. 진짜 줄바꿈으로 두고 code 의 white-space:pre-wrap 이 세 줄로 보여 준다.
await section("T-38", () => fixture(async (fx) => {
  const response = await page(fx, "/kakao-commands", { cookie: "" });
  eq(response.status, 200, "/kakao-commands 가 열린다");
  const example = (response.html.match(/<code>(7월3일[\s\S]*?)<\/code>/) || [])[1] || "";
  eq(example, "7월3일\n온열안대 9900 삼성카드\n풋샴푸 10150 삼성카드", "예시 줄은 진짜 줄바꿈 세 줄이다(사용자가 카카오에 보내는 그대로)");
  ok(!/\\n/.test(response.html.replace(/<script[\s\S]*?<\/script>/g, "")), "화면 글에 글자 그대로의 \\n 이 없다");
  const css = await servedCss(fx, response.html, "");
  const code = pathOf(response.html, (n, stack) => n.tag === "code" && inside(stack, "wrap"), { label: "예시 code" });
  eq(cascade(css, code, "white-space", 1280)?.value, "pre-wrap", "code 는 white-space:pre-wrap 이라 줄바꿈이 줄로 보인다");
  ok(response.html.includes("<td>날짜 묶음 여러 줄 저장</td>"), "예시 줄의 설명 칸은 그대로다");
}));

// ── T-24. ‘주’의 기준을 화면에 적는다(계산은 그대로) ───────────────────────────────────────────
// 종합 리포트·PC 분석의 주간 리포트는 월요일 시작, 홈 ‘주별’ 탭(D-16)은 일요일 시작이다. 운영자 결정(권장안): 어느 쪽 계산도 바꾸지 않고 두 화면이 실제로 더한
// 날짜 범위와 요일을 적는다. 2026-07-12 는 일요일이다 — 월요일 시작 리포트에서는 지난주, 일요일 시작 홈 탭에서는 이번 주(12~18일)에 든다.
// V22.9.89 U-11(사용자 결정 D-6 2026-10-29: 한 주는 월요일 시작): 홈 ‘주별’ 탭도 월요일~일요일이 되어 두 화면의 주가 같다. ‘합계가 다를 수 있어요’는
// 지웠고, 홈 3주차(13~19일)와 주간 리포트 이번 주(7/13~7/15)가 같은 30,000원인지 본다. 일요일(7/12)은 두 화면 모두 2주차·지난주다.
await section("T-24", async () => {
  const savedTz = process.env.TZ;
  try {
    for (const zone of ["Asia/Seoul", "UTC", "America/Los_Angeles"]) {
      process.env.TZ = zone;
      await withClock("2026-07-15", () => fixture(async (fx) => {
        const add = (id, date, amount) => fx.db.transactions.push({ id, household_id: HH, user_id: "user-bin", transaction_date: date, type: "expense", amount, category: "식비", memo: "주 기준 시험", payment_method: "현금", created_at: `${date}T09:00:00+09:00` });
        add("t24-sun", "2026-07-12", 1000000);
        add("t24-mon", "2026-07-13", 22000);
        add("t24-tue", "2026-07-14", 3000);
        add("t24-wed", "2026-07-15", 5000);
        const report = await page(fx, `/my/analysis?month=2026-07&household_id=${HH}&view=report`);
        eq(report.status, 200, `${zone}: 종합 리포트가 열린다`);
        const card = (report.html.match(/<h2>주간 리포트<\/h2>([\s\S]*?)<\/section>/) || [])[1] || "";
        const note = (card.match(/<p class="muted">([\s\S]*?)<\/p>/) || [])[1] || "";
        ok(note.includes("월요일부터") && note.includes("7/13(월)~7/15(수)"), `${zone}: 주간 리포트가 이번 주 범위를 요일과 함께 적는다 (${note.slice(0, 40)}…)`);
        ok(note.includes("지난주 같은 시점(7/6(월)~7/8(수))"), `${zone}: 비교 구간(지난주 같은 시점)의 범위도 요일과 함께 적는다`);
        ok(!note.includes("일요일부터") && !note.includes("합계가 다를 수 있어요"), `${zone}: 홈 ‘주별’ 탭도 월요일 시작이라 ‘합계가 다를 수 있어요’를 쓰지 않는다(V22.9.89)`);
        // 계산은 그대로: 일요일(7/12)은 월요일 시작 리포트에서 지난주다
        ok(/<div class="weeklyHead"><b>30,000원<\/b>/.test(card), `${zone}: 이번 주(월~수) 합계는 30,000원 그대로 — 일요일 100만원은 이번 주에 들지 않는다`);
        ok(/<div class="trendLabel">지난주 전체<\/div>[\s\S]*?<div class="trendValue">1,100,600원<\/div>/.test(card), `${zone}: 지난주 전체(월~일)는 일요일 기록을 포함한 1,100,600원 그대로`);
        // PC 분석(관리자+사용자 세션 둘 다 있어야 열린다)도 같은 주간 리포트 카드를 그린다
        const admin = await adminCookie(fx);
        const pc = await page(fx, `/analysis?month=2026-07&household_id=${HH}`, { cookie: `${fx.cookie}; ${admin}` });
        eq(pc.status, 200, `${zone}: PC 분석(관리자+사용자 세션)이 열린다`);
        const pcNote = (pc.html.match(/<h2>주간 리포트<\/h2><p class="muted">([\s\S]*?)<\/p>/) || [])[1] || "";
        ok(pcNote.includes("월요일부터: 7/13(월)~7/15(수)") && !pcNote.includes("일요일부터"), `${zone}: PC 분석의 주간 리포트도 같은 기준 문장을 적는다(V22.9.89: 일요일 시작 안내 없음)`);
        ok(/<div class="weeklyHead"><b>30,000원<\/b>/.test(pc.html), `${zone}: PC 분석의 이번 주 합계도 30,000원 그대로`);
        const daily = await page(fx, `/app?month=2026-07&household_id=${HH}`, { headers: { "user-agent": DESKTOP } });
        ok(!daily.html.includes("월요일~일요일(홈 캘린더의 한 줄)"), `${zone}: 기본(일별) 홈에는 새 안내 문장이 없다(홈 HTML 은 ‘주별’ 탭에서만 조금 늘었다)`);
        const home = await page(fx, `/app?month=2026-07&household_id=${HH}&trend=weekly`, { headers: { "user-agent": DESKTOP } });
        eq(home.status, 200, `${zone}: 홈 ‘주별’ 탭이 열린다`);
        ok(home.html.length <= daily.html.length, `${zone}: ‘주별’ 탭 홈(${home.html.length}바이트)은 기본 홈(${daily.html.length}바이트)보다 크지 않다 — 안내 문장이 홈 예산 상한을 넘기지 않는다`);
        const grid = (home.html.match(/<div class="weeklyTrendGrid"[\s\S]*?<p class="homeTrendHint"[^>]*>([^<]*)<\/p>/) || []);
        ok(!!grid[0], `${zone}: 주별 격자 아래에 기준 안내(.homeTrendHint)가 있다`);
        ok((grid[1] || "").includes("월요일~일요일") && (grid[1] || "").includes("잘린 주"), `${zone}: 홈 ‘주별’ 탭이 한 주를 월요일~일요일로 세고 달 경계에서 잘린 주를 알린다(V22.9.89)`);
        const weekText = (home.html.match(/<b[^>]*>3주차<\/b>[\s\S]*?<strong[^>]*>([^<]*)<\/strong>/) || [])[0] || "";
        ok(/13~19일/.test(weekText) && /3만/.test(weekText) && !/103만/.test(weekText), `${zone}: 홈 3주차(13~19일)는 월~수 30,000원(3만)으로 주간 리포트 이번 주와 같다 — 일요일 100만원은 2주차다 (${weekText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()})`);
      }));
    }
    // 요일 글자: 오늘이 일요일·월요일·화요일일 때도 범위가 맞다(2026-07-19 일, 2026-07-13 월, 2026-07-14 화)
    process.env.TZ = "UTC";
    for (const [ymd, thisRange, lastRange] of [["2026-07-19", "7/13(월)~7/19(일)", "7/6(월)~7/12(일)"], ["2026-07-13", "7/13(월)~7/13(월)", "7/6(월)~7/6(월)"], ["2026-07-14", "7/13(월)~7/14(화)", "7/6(월)~7/7(화)"]]) {
      await withClock(ymd, () => fixture(async (fx) => {
        const report = await page(fx, `/my/analysis?month=2026-07&household_id=${HH}&view=report`);
        const note = (report.html.match(/<h2>주간 리포트<\/h2><p class="muted">([\s\S]*?)<\/p>/) || [])[1] || "";
        ok(note.includes(`이번 주(월요일부터: ${thisRange})`) && note.includes(`지난주 같은 시점(${lastRange})`), `오늘 ${ymd}: 범위가 ${thisRange} / ${lastRange} 로 적힌다`);
      }));
    }
  } finally {
    if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz;
  }
});

if (SOFT) {
  console.log(`${failed.length} of ${total} checks fail`);
  for (const line of failed) console.log(`  FAIL ${line}`);
  if (process.argv.includes("--all")) for (const line of passed) console.log(`  pass ${line}`);
  process.exit(failed.length ? 1 : 0);
}
base.done();
