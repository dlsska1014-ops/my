import vm from "node:vm";

// A DOM execution fixture for the unmodified HTTP bundle. Layout, native input,
// pointer/touch and visual privacy are verified separately in actual Chrome.
export function insightBrowser(script, payload, search = "") {
  const timers = new Map(); let sequence = 0, document;
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map(); this.style = {}; this.events = new Map(); this._text = ""; this.value = ""; this.hidden = false; this.clientWidth = 560; this.offsetWidth = 220; this.offsetHeight = 100; this.offsetTop = 100; }
    set id(value) { this.attrs.set("id", value); } get id() { return this.attrs.get("id") || ""; }
    set className(value) { this.attrs.set("class", value); } get className() { return this.attrs.get("class") || ""; }
    get classList() { const element=this; return {add(...names) {element.className=[...new Set([...element.className.split(" ").filter(Boolean),...names])].join(" ");},remove(name) {element.className=element.className.split(" ").filter(value=>value!==name).join(" ");}}; }
    set textContent(value) { this._text = String(value); for (const child of this.children) child.parentElement = null; this.children = []; } get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    insertBefore(child, next) { child.parentElement = this; const index = this.children.indexOf(next); this.children.splice(index < 0 ? this.children.length : index, 0, child); return child; }
    get firstChild() { return this.children[0] || null; }
    setAttribute(key, value) { this.attrs.set(key, String(value)); } getAttribute(key) { return this.attrs.get(key) ?? null; }
    matches(selector) { if (selector[0] === "#") return this.id === selector.slice(1); if (selector[0] === ".") return this.className.split(" ").includes(selector.slice(1)); return this.tagName.toLowerCase() === selector; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, handler) { const list = this.events.get(type) || []; list.push(handler); this.events.set(type, list); }
    fire(type, data = {}) { const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...data }; for (const fn of this.events.get(type) || []) fn(event); return event; }
    click() { this.fire("click"); }
    focus() { document.activeElement = this; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 560, height: 210 }; }
    remove() { const parent = this.parentElement; if (parent) parent.children.splice(parent.children.indexOf(this), 1); }
  }
  const body = new Element("body");
  document = { body, activeElement: body, createElement: tag => new Element(tag), createElementNS: (_namespace, tag) => new Element(tag), getElementById: id => body.querySelector("#" + id) };
  for (const id of ["kpis","insights","periodChips","typeSeg","catChips","payChips","whoChips","whoGroup","minAmt","maxAmt","panelBtn","activeChips","trendTitle","trendLegend","trendChart","trendTable","catTitle","catSub","catChart","weekSub","weekChart","payTitle","payChart","whoTitle","whoChart","whoCard","budgetCard","budgetBox","topList","topTitle","topSub","txList","txCount","moreBtn","filterPanel","resetBtn","searchInput","customRange","startDate","endDate","rangeApply","amtApply","csvBtn"]) { const element = new Element("div"); element.id = id; body.appendChild(element); }
  const events = new Map(), blobs = [], urls = [];
  class CapturedBlob { constructor(parts) { this.text = parts.join(""); blobs.push(this); } }
  const window = { __INSIGHT__: payload, addEventListener(type, handler) { events.set(type, handler); } };
  const context = vm.createContext({ window, document, location: { search, pathname: "/my/analysis" }, history: { replaceState(...args) { urls.push(args[2]); } }, URLSearchParams, Blob: CapturedBlob, URL: { createObjectURL() { return "blob:fixture"; }, revokeObjectURL() {} }, setTimeout(fn) { timers.set(++sequence, fn); return sequence; }, clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(script, context, { timeout: 3000 });
  function flush() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } }
  return { document, body, context, window, events, blobs, urls, flush, get: id => document.getElementById(id) };
}
