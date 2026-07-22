import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

function functionBlockHash(marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${marker} source block exists`);
  const end = source.indexOf("\nfunction ", start + marker.length);
  assert.ok(end > start, `${marker} source block has an end marker`);
  return createHash("sha256").update(source.slice(start, end)).digest("hex");
}

function inlineScripts(html) {
  return Array.from(html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi), (match) => match[1]).filter((script) => script.trim());
}

function scriptById(html, id) {
  return (html.match(new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i")) || [])[1] || "";
}

function createCredentialElement(value = "") {
  const listeners = new Map();
  return {
    value,
    textContent: "",
    dataset: {},
    disabled: false,
    validationMessage: "",
    addEventListener(type, listener) { listeners.set(type, listener); },
    fire(type) { const listener = listeners.get(type); if (listener) listener({ target: this }); },
    setAttribute(name, valueToSet) { this[name] = String(valueToSet); },
    setCustomValidity(message) { this.validationMessage = String(message || ""); },
  };
}

function exerciseCredentialRuntime(runtime, ids) {
  const password = createCredentialElement();
  const confirmation = createCredentialElement();
  const status = createCredentialElement();
  const button = createCredentialElement();
  const formListeners = new Map();
  const form = {
    addEventListener(type, listener) { formListeners.set(type, listener); },
    dispatchEvent(event) { const listener = formListeners.get(event.type); if (listener) listener(event); },
  };
  button.form = form;
  const elements = {
    [ids.passwordId]: password,
    [ids.confirmationId]: confirmation,
    [ids.statusId]: status,
    [ids.buttonId]: button,
  };
  const documentStub = { getElementById(id) { return elements[id] || null; } };
  const windowStub = { addEventListener() {}, setTimeout(listener) { listener(); } };
  new Function("document", "window", runtime)(documentStub, windowStub);

  eq(button.disabled, false, "untouched credential form keeps native required-field behavior");
  password.value = "12345678";
  confirmation.value = "12345670";
  confirmation.fire("input");
  eq(button.disabled, true, "mismatched passwords block submission before the server round trip");
  eq(status.dataset.state, "error", "mismatch feedback uses the error state");
  ok(status.textContent.includes("다릅니다"), "mismatch feedback explains the exact problem");
  ok(confirmation.validationMessage.includes("일치하지 않습니다"), "native constraint validation receives the mismatch reason");

  confirmation.value = "12345678";
  confirmation.fire("input");
  eq(button.disabled, false, "matching passwords enable submission");
  eq(status.dataset.state, "success", "matching feedback uses the success state");
  ok(status.textContent.includes("일치합니다"), "matching feedback confirms completion");
}

function createSubmitSimulation(runtime, { action, label, confirmResult = true }) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  let confirmMessage = "";
  let statusElement = null;
  const attributes = new Map();
  const buttonAttributes = new Map();
  const button = {
    tagName: "BUTTON",
    textContent: label,
    value: "",
    dataset: {},
    disabled: false,
    classList: { add() {} },
    setAttribute(name, value) { buttonAttributes.set(name, String(value)); },
    getAttribute(name) { return buttonAttributes.get(name) || null; },
    removeAttribute(name) { buttonAttributes.delete(name); },
  };
  const form = {
    tagName: "FORM",
    dataset: {},
    getAttribute(name) { if (name === "method") return "post"; if (name === "action") return action; return attributes.get(name) || null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    hasAttribute(name) { return attributes.has(name); },
    contains(node) { return node === button; },
    checkValidity() { return true; },
    querySelector(selector) {
      if (selector.includes("data-ab-submit-status")) return statusElement;
      if (selector.includes('button[type="submit"]') || selector.includes("button[type='submit']")) return button;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes("data-ab-submit-locked") && button.dataset.abSubmitLocked === "1") return [button];
      return [];
    },
    appendChild(node) { statusElement = node; },
    dispatchEvent() {},
  };
  const documentStub = {
    body: { classList: { contains() { return false; } } },
    querySelector() { return null; },
    querySelectorAll(selector) { return selector === 'form[method="post"]' ? [form] : []; },
    createElement() {
      return {
        dataset: {}, style: {}, textContent: "",
        setAttribute(name, value) { this[name] = String(value); },
      };
    },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
  };
  const windowStub = {
    confirm(message) { confirmMessage = String(message); return confirmResult; },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    localStorage: null,
  };
  class EventStub { constructor(type) { this.type = type; } }
  new Function("document", "window", "queueMicrotask", "Event", runtime)(documentStub, windowStub, (listener) => listener(), EventStub);
  const submit = documentListeners.get("submit");
  assert.ok(submit, "guided runtime installs the delegated submit handler");
  const event = {
    target: form,
    submitter: button,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  submit(event);
  return {
    button, form, event, confirmMessage, status: statusElement, attributes,
    restore() { const listener = windowListeners.get("pageshow"); if (listener) listener(); },
  };
}

ok(source.includes('const APP_VERSION = "V22.8.20-KAKAO-EDIT-INLINE-FEEDBACK"'), "runtime reports the V22.8.20 release");

// The user-approved analysis experience is a protected surface in this release.
eq(functionBlockHash("function insightClientMain("), "b73386dfddd66aa42000b7b34b6c03b7deeda3ac5824b75468db3aa269087a5d", "analysis client source is byte-identical to V22.8.7");
eq(functionBlockHash("function renderMyAnalysisHtml("), "0d03ce468e0203e1eb7bc344e0fc24876f74c92de492389246f5dd80ea0de58d", "analysis renderer source is byte-identical to V22.8.7");

const fixture = await createV2265QaFixture();
try {
  const publicResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/my"), fixture.env, {});
  eq(publicResponse.status, 200, "public login page renders");
  const loginHtml = await publicResponse.text();
  ok(loginHtml.includes("기존 계정 로그인"), "existing-account login remains the primary visible path");
  ok(loginHtml.includes("처음이라면 새 계정 만들기"), "signup remains a secondary disclosure");
  ok(loginHtml.includes('id="signupPasswordStatus"'), "signup has inline password-match feedback");
  ok(loginHtml.includes('aria-describedby="signupPasswordStatus"'), "signup fields expose their feedback to assistive technology");
  const loginScripts = inlineScripts(loginHtml);
  ok(loginScripts.length >= 2, "login page includes credential and shared action-feedback runtimes");
  loginScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Function(script), `login inline script ${index + 1} compiles`);
    checks += 1;
  });
  const loginCredentialRuntime = scriptById(loginHtml, "credentialMatchRuntime");
  ok(loginCredentialRuntime, "signup credential runtime is present");
  exerciseCredentialRuntime(loginCredentialRuntime, {
    passwordId: "signupPassword",
    confirmationId: "signupPasswordConfirm",
    statusId: "signupPasswordStatus",
    buttonId: "signupPasswordSubmit",
  });

  const backupResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/my/backup-login?return_to=%2Fapp", {
    headers: { cookie: fixture.cookie },
  }), fixture.env, {});
  eq(backupResponse.status, 200, "personal backup-password page renders");
  const backupHtml = await backupResponse.text();
  ok(backupHtml.includes('id="backupPasswordStatus"'), "backup-password form has the same inline feedback pattern");
  ok(backupHtml.includes('aria-describedby="backupPasswordStatus"'), "backup-password fields expose feedback accessibly");
  const backupCredentialRuntime = scriptById(backupHtml, "credentialMatchRuntime");
  ok(backupCredentialRuntime, "backup-password credential runtime is present");
  exerciseCredentialRuntime(backupCredentialRuntime, {
    passwordId: "backupPassword",
    confirmationId: "backupPasswordConfirm",
    statusId: "backupPasswordStatus",
    buttonId: "backupPasswordSubmit",
  });

  const guidedRuntime = scriptById(loginHtml, "v2281GuidedUiUxRuntime");
  ok(guidedRuntime, "shared submit-feedback runtime is present");
  const loginSubmit = createSubmitSimulation(guidedRuntime, { action: "/my/local-login", label: "로그인" });
  eq(loginSubmit.button.textContent, "로그인 중…", "login uses an action-specific pending label");
  eq(loginSubmit.attributes.get("aria-busy"), "true", "submitted form exposes its busy state");
  eq(loginSubmit.status?.textContent, "로그인 중…", "pending state is announced in an aria-live status");
  loginSubmit.restore();
  eq(loginSubmit.button.textContent, "로그인", "pageshow restores the original submit label");
  eq(loginSubmit.button.disabled, false, "pageshow unlocks the submit control");
  eq(loginSubmit.attributes.has("aria-busy"), false, "pageshow clears the form busy state");
  eq(loginSubmit.status?.textContent, "", "pageshow clears the live pending status");

  const signupSubmit = createSubmitSimulation(guidedRuntime, { action: "/my/local-signup", label: "새 계정 만들기" });
  eq(signupSubmit.button.textContent, "계정 만드는 중…", "signup uses an action-specific pending label");

  const householdCreate = createSubmitSimulation(guidedRuntime, { action: "/my/create", label: "가계부 만들기" });
  eq(householdCreate.button.textContent, "가계부 만드는 중…", "household creation has its own pending label");
  const householdJoin = createSubmitSimulation(guidedRuntime, { action: "/my/join", label: "초대코드로 참여" });
  eq(householdJoin.button.textContent, "참여 요청 중…", "household join has its own pending label");
  const deleteAccepted = createSubmitSimulation(guidedRuntime, { action: "/admin/delete", label: "삭제" });
  eq(deleteAccepted.button.textContent, "삭제 중…", "accepted delete has a destructive-action pending label");
  const leaveAccepted = createSubmitSimulation(guidedRuntime, { action: "/my/household/leave", label: "이 가계부에서 나가기" });
  eq(leaveAccepted.button.textContent, "탈퇴 처리 중…", "household leave has its own pending label");
  const importSubmit = createSubmitSimulation(guidedRuntime, { action: "/my/import", label: "CSV 가져오기" });
  eq(importSubmit.button.textContent, "가져오는 중…", "import has its own pending label");
  const saveSubmit = createSubmitSimulation(guidedRuntime, { action: "/my/settings", label: "설정 저장" });
  eq(saveSubmit.button.textContent, "저장 중…", "actual save actions keep the familiar save label");
  const genericSubmit = createSubmitSimulation(guidedRuntime, { action: "/my/recalculate", label: "다시 계산" });
  eq(genericSubmit.button.textContent, "처리 중…", "unclassified actions use a neutral pending label");

  const deleteSubmit = createSubmitSimulation(guidedRuntime, { action: "/admin/delete", label: "삭제", confirmResult: false });
  eq(deleteSubmit.event.defaultPrevented, true, "cancelled destructive confirmation leaves the form untouched");
  ok(deleteSubmit.confirmMessage.includes("삭제할까요"), "destructive confirmation names the exact action");
  ok(deleteSubmit.confirmMessage.includes("되돌리기 어려울 수 있습니다"), "destructive confirmation explains the consequence");
  eq(deleteSubmit.button.textContent, "삭제", "cancelled destructive action keeps the original label");

  for (const path of [
    "/receipts?month=2026-07&household_id=house-home",
    "/my/analysis?month=2026-07&household_id=house-home",
    "/my/analysis/app.js",
  ]) {
    const response = await app.fetch(new Request("https://ttokttok-accountbook.com" + path, {
      headers: { cookie: fixture.cookie },
    }), fixture.env, {});
    eq(response.status, 200, `${path} remains available`);
  }
} finally {
  fixture.restore();
}

console.log(`smoke_ux_principles_action_feedback: ${checks} checks passed`);
