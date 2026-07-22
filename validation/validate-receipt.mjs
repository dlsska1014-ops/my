import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const fixture = await createV2265QaFixture();
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

let supabaseCalls = 0;
const fixtureFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const target = new URL(typeof input === "string" ? input : input.url);
  if (target.hostname === "mock.supabase.co") supabaseCalls += 1;
  return fixtureFetch(input, init);
};

async function request(path, init = {}) {
  return app.fetch(new Request("https://ttokttok-accountbook.com" + path, {
    redirect: "manual",
    ...init,
    headers: { cookie: fixture.cookie, ...(init.headers || {}) },
  }), fixture.env, {});
}

// 1. 화면 렌더와 서버 조회 예산: 영수증 화면은 멤버·캘린더·예산 조회 없이 렌더됩니다.
supabaseCalls = 0;
const response = await request("/receipts?month=2026-07&household_id=house-home");
eq(response.status, 200, "receipts page renders");
const pageQueryCount = supabaseCalls;
// V22.8.1 원본 화면은 같은 픽스처에서 진입당 17회 조회했습니다. 회귀를 8회 이하로 막습니다.
ok(pageQueryCount <= 8, `receipt page stays lean (${pageQueryCount} supabase calls)`);
const html = await response.text();

// 2. 지연 로딩과 안전한 직렬화 런타임 (V22.8.4 회귀 방지 마커)
ok(html.includes("abPageReceipts"), "receipt UI keeps its scoped design marker");
ok(html.includes('id="receiptCaptureRuntime"'), "receipt parser ships as the safe serialized runtime");
ok(html.includes("function loadTesseract"), "receipt OCR has a lazy loader");
ok(!html.includes('<script src="https://cdn.jsdelivr.net/npm/tesseract.js'), "OCR is not downloaded on page entry");
ok(source.includes("function receiptCaptureClientMain"), "receipt client is maintained as a real function");
ok(source.includes("async function fetchReceiptCategoryNames"), "receipt page keeps its lean category lookup");
ok(source.includes("function renderReceiptCaptureHtml"), "receipt page keeps its dedicated renderer");

// 3. 앨범 접근성: 앨범 선택은 카메라를 강제하지 않고, 카메라 촬영은 따로 제공됩니다.
const albumTag = (html.match(/<input[^>]*id="receiptImage"[^>]*>/) || [])[0];
const cameraTag = (html.match(/<input[^>]*id="receiptCamera"[^>]*>/) || [])[0];
ok(albumTag && !/capture=/.test(albumTag), "album picker does not force the camera");
ok(cameraTag && /capture="environment"/.test(cameraTag), "camera picker still opens the rear camera");
ok(html.includes("앨범에서 선택") && html.includes("카메라로 촬영"), "both pick actions are labeled");
ok(html.includes('id="receiptPreview"') && html.includes('id="clearReceiptImage"'), "preview and clear controls exist");
ok(html.includes('id="ocrCancel"'), "OCR cancel control exists");
ok(html.includes('id="receiptSourcePanel"'), "drag-and-drop zone exists");
ok(html.includes("서버에 업로드하지 않고"), "privacy copy is preserved");
ok(html.includes('aria-live="polite"'), "OCR status is announced to screen readers");

// 4. 안정화 로직이 소스에 유지되는지 (타임아웃·취소·붙여넣기·쉼표 금액)
ok(source.includes("인식이 90초를 넘겨 중단했습니다"), "OCR has a hard timeout");
ok(source.includes('cancelOcrButton.addEventListener("click"'), "cancel button aborts a running OCR");
ok(source.includes("ocrWorkerGeneration"), "cancelled worker creation cannot leak into a newer run");
ok(source.includes("digitsBeforeCaret"), "amount formatting preserves the typing position");
ok(source.includes('document.addEventListener("paste"'), "clipboard paste selects a photo");
ok(source.includes('toLocaleString("ko-KR")'), "manual amount input is comma formatted");

// 5. 인라인 스크립트가 실제 브라우저 문법으로 컴파일되는지 확인합니다.
const scripts = Array.from(html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi), (m) => m[1]).filter((s) => s.trim());
ok(scripts.length > 0, "receipt page includes its browser runtime");
scripts.forEach((script, index) => {
  assert.doesNotThrow(() => new Function(script), `inline script ${index + 1} compiles`);
  checks += 1;
});

// 6. 파서 정확성: 템플릿 리터럴 이스케이프로 정규식이 깨졌던 회귀를 직접 차단합니다.
const runtime = (html.match(/<script id="receiptCaptureRuntime">([\s\S]*?)<\/script>/) || [])[1];
ok(runtime, "serialized runtime found");
const windowStub = {};
const documentStub = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {}, createElement: () => ({}), head: { appendChild: () => {} } };
new Function("window", "document", runtime)(windowStub, documentStub);
const parsers = windowStub.__receiptParsers;
ok(parsers, "receipt parsers are exposed for QA");
eq(parsers.date("스타마트\n2026-07-15\n합계 35,400원\n신한카드 승인"), "2026-07-15", "date parser reads the receipt date");
eq(parsers.date("결제일 26.07.03"), "2026-07-03", "date parser reads two-digit years");
eq(parsers.amount("부가세 3,218\n합계 35,400원"), 35400, "amount parser prefers the total line");
eq(parsers.merchant("스타마트\n2026-07-15\n합계 35,400원"), "스타마트", "merchant parser picks the store line");
eq(parsers.payment("신한카드 승인 12345"), "신한카드", "payment parser detects the card brand");
eq(parsers.category("스타마트 구매"), "장보기", "category parser maps marts to groceries");

// 7. 저장 흐름: 쉼표 금액 허용, 저장 성공, 같은 영수증 중복 차단.
const form = new URLSearchParams({
  household_id: "house-home", month: "2026-07", merchant: "스타마트",
  transaction_date: "2026-07-15", amount: "35,400", category: "장보기",
  payment_method: "신한카드", confirmed: "yes",
  receipt_text: "스타마트\n2026-07-15\n합계 35,400원\n신한카드",
});
const beforeCount = fixture.db.transactions.length;
const save = await request("/my/receipt/save", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
eq(save.status, 303, "confirmed receipt save redirects");
ok(String(save.headers.get("location") || "").includes("msg=receipt_saved"), "save reports success");
eq(fixture.db.transactions.length, beforeCount + 1, "confirmed receipt creates one transaction");
const saved = fixture.db.transactions.at(-1);
eq(saved.source, "receipt_confirmed", "receipt keeps its confirmed source");
eq(Number(saved.amount), 35400, "comma-formatted amount is stored as a number");
eq(saved.transaction_date, "2026-07-15", "receipt date is stored");
const duplicate = await request("/my/receipt/save", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
ok(String(duplicate.headers.get("location") || "").includes("duplicate_receipt"), "same receipt is not saved twice");
eq(fixture.db.transactions.length, beforeCount + 1, "duplicate save adds no row");

// 8. 보호된 핵심 화면 회귀: 모바일 홈·전체 메뉴·분석 렌더와 로그인 화면을 함께 확인합니다.
for (const path of [
  "/app?month=2026-07&household_id=house-home",
  "/menu?month=2026-07&household_id=house-home",
  "/my/analysis?month=2026-07&household_id=house-home",
  "/my/analysis/app.js",
]) {
  const coreResponse = await request(path);
  eq(coreResponse.status, 200, `${path} remains available`);
  const coreBody = await coreResponse.text();
  ok(!coreBody.includes("maximum-scale=1") && !coreBody.includes("user-scalable=no"), `${path} keeps mobile zoom available`);
}
const loginResponse = await app.fetch(new Request("https://ttokttok-accountbook.com/my"), fixture.env, {});
eq(loginResponse.status, 200, "public login page renders");
const loginHtml = await loginResponse.text();
ok(loginHtml.includes("기존 계정 로그인"), "existing-account login remains prominent");
ok(loginHtml.includes("처음이라면 새 계정 만들기"), "new-account path remains available");

globalThis.fetch = fixtureFetch;
fixture.restore();
console.log(`smoke_receipt_screen_optimization: ${checks} checks passed`);
