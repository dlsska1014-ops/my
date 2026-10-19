import vm from "node:vm";

// Deterministic DOM/timer subset for the real serialized client. Real Chrome covers
// native form submission, focus, modal cleanup and layout separately.
export function createDeleteBrowser({ fetch, storage = new Map(), storageFails = false, hash = "" } = {}) {
  let now = 0, sequence = 0;
  const timers = new Map(), observers = [];
  const eventTarget = () => ({ events: new Map(), addEventListener(type, fn, capture = false) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push({ fn, capture: !!capture }); } });
  const invoke = (target, type, event, capture) => { for (const item of target.events?.get(type) || []) { if (capture !== undefined && item.capture !== capture) continue; item.fn(event); if (event.stopped) break; } };
  class Element {
    constructor(tag) { Object.assign(this, eventTarget()); this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.attrs = new Map(); this.hidden = false; this.disabled = false; this.value = ""; this._text = ""; }
    get className() { return this.getAttribute("class") || ""; } set className(v) { this.setAttribute("class", v); }
    get id() { return this.getAttribute("id"); } set id(v) { this.setAttribute("id", v); }
    get method() { return this.getAttribute("method"); }
    get href() { return new URL(this.getAttribute("href") || "", location.href).href; }
    get target() { return this.getAttribute("target") || ""; }
    get form() { return this.closest("form"); }
    get isConnected() { return this === body || !!this.parentElement?.isConnected; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    set textContent(v) { this._text = String(v); this.children = []; }
    set innerHTML(value) { this.children = []; this._text = ""; const stack = [this]; for (const token of value.match(/<[^>]+>|[^<]+/g) || []) { if (token.startsWith("</")) { stack.pop(); continue; } if (!token.startsWith("<")) { stack.at(-1)._text += token; continue; } const match = token.match(/^<([\w-]+)/); if (!match) continue; const child = new Element(match[1]); for (const attr of token.slice(match[0].length, -1).matchAll(/([\w-]+)(?:="([^"]*)")?/g)) child.setAttribute(attr[1], attr[2] || ""); stack.at(-1).appendChild(child); if (!["input", "br"].includes(match[1])) stack.push(child); } }
    appendChild(child) { child.parentElement?.children.splice(child.parentElement.children.indexOf(child), 1); child.parentElement = this; this.children.push(child); return child; }
    removeAttribute(k) { this.attrs.delete(k); if (k === "hidden") this.hidden = false; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === "value") this.value = String(v); if (k === "hidden") this.hidden = true; }
    getAttribute(k) { return this.attrs.get(k) ?? null; } hasAttribute(k) { return this.attrs.has(k); }
    matches(selector) { return selector.split(",").some(raw => { const s = raw.trim(), split = s.lastIndexOf(" "); if (split >= 0) return this.matches(s.slice(split + 1)) && !!this.parentElement?.closest(s.slice(0, split)); const tag = s.match(/^[\w-]+/); if (tag && tag[0].toUpperCase() !== this.tagName) return false; for (const c of s.matchAll(/\.([\w-]+)/g)) if (!this.className.split(" ").includes(c[1])) return false; const id = s.match(/#([\w-]+)/); if (id && this.id !== id[1]) return false; for (const a of s.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|([^\]]+)))?\]/g)) if (!this.hasAttribute(a[1]) || (a[2] !== undefined || a[3] !== undefined) && this.getAttribute(a[1]) !== (a[2] ?? a[3])) return false; return true; }); }
    closest(s) { return this.matches(s) ? this : this.parentElement?.closest(s) || null; }
    contains(child) { return child === this || this.children.some(node => node.contains(child)); }
    querySelectorAll(s) { return this.children.flatMap(child => [...(child.matches(s) ? [child] : []), ...child.querySelectorAll(s)]); }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    getClientRects() { for (let el = this; el; el = el.parentElement) if (el.hidden || el.hasAttribute("data-ab-delete-pending")) return []; return [{}]; }
    focus() { const before = document.activeElement; if (before === this) return; if (before) bubble(before, "focusout", { relatedTarget: this }); document.activeElement = this; bubble(this, "focusin", { relatedTarget: before }); }
    click() { if (!this.disabled) bubble(this, "click", { button: 0 }); }
  }
  const body = new Element("body");
  const document = Object.assign(eventTarget(), { body, activeElement: body, createElement: tag => new Element(tag), querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s), getElementById: id => body.querySelector("#" + id) });
  const assigned = [], location = { href: "https://malhaebook.com/app?month=2026-07&household_id=house-home&tab=transactions" + hash, origin: "https://malhaebook.com", pathname: "/app", search: "?month=2026-07&household_id=house-home&tab=transactions", hash, assign: value => assigned.push(value), reload: () => assigned.push("reload") };
  const window = Object.assign(eventTarget(), { location });
  const sessionStorage = { getItem(k) { if (storageFails) throw new Error("storage blocked"); return storage.get(k) || null; }, setItem(k, v) { if (storageFails) throw new Error("storage blocked"); storage.set(k, v); }, removeItem(k) { if (storageFails) throw new Error("storage blocked"); storage.delete(k); } };
  function bubble(target, type, data = {}) { const event = { target, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...data }; invoke(document, type, event, true); if (!event.stopped) { for (let el = target; el; el = el.parentElement) { invoke(el, type, event); if (event.stopped) break; if (typeof el["on" + type] === "function") el["on" + type](event); } } if (!event.stopped) invoke(document, type, event, false); return event; }
  const context = vm.createContext({ document, window, location, sessionStorage, performance: { now: () => now }, fetch, URL, URLSearchParams, WeakMap, AbortController, FormData: class { constructor(form) { if (!form) throw new Error("no form"); this.values = new Map(form.querySelectorAll("input[name]").map(input => [input.getAttribute("name"), input.value])); } get(k) { return this.values.get(k) || null; } }, MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} }, setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout(id) { timers.delete(id); }, console });
  function element(tag, attrs = {}, parent = body) { const el = new Element(tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); parent.appendChild(el); return el; }
  function form(id = "tx-expense-1", household = "house-home") { const row = element("details", { class: "v8-tx", id: "tx-" + id }); element("summary", {}, row); const form = element("form", { class: "v8-edit", method: "post", action: "/admin/update" }, row); for (const [name, value] of Object.entries({ id, household_id: household, month: "2026-07", return_to: location.pathname + location.search })) element("input", { name, value, type: "hidden" }, form); const button = element("button", { type: "submit", formaction: "/admin/delete", onclick: "confirm" }, form); return { row, form, button }; }
  return { body, document, window, location, storage, assigned, element, form, run(fn) { vm.runInContext("(" + fn.toString() + ")()", context); }, submit(f) { return bubble(f.form, "submit", { submitter: f.button }); }, click: el => bubble(el, "click", { button: 0 }), fire(el, type, event = {}) { invoke(el, type, { target: el, ...event }); }, mutate() { observers.forEach(fn => fn()); }, tick(ms) { const target = now + ms; for (;;) { const next = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; timers.delete(next[0]); now = next[1].at; next[1].fn(); } now = target; }, get notice() { return body.querySelector(".abDeleteNotice"); }, get undo() { return body.querySelector("[data-ab-delete-undo]"); } };
}
