import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.82-TONE-TOKENS-ALERT-WINDOW"'), "runtime exposes the delete fix release");

// formaction은 폼에 소속된 제출 버튼에서만 동작한다. 버튼이 </form> 뒤에 있으면
// 소유 폼이 없어 눌러도 아무 요청이 나가지 않는다.
ok(source.includes('<button class="danger" type="submit" formaction="/admin/delete" formnovalidate onclick="return confirm(\'삭제할까요?\')">삭제</button></form>'), "delete button sits inside the owning form");
ok(!/<\/form>\s*<button[^>]*formaction=/.test(source), "no submit button with formaction is left outside its form");

// 어떤 화면에서도 폼 밖 formaction 버튼이 생기지 않아야 한다.
const orphanFormAction = [...source.matchAll(/<\/form>\s*<button[^>]*formaction="([^"]+)"/g)].map((m) => m[1]);
eq(orphanFormAction.join(","), "", `every formaction button has an owning form (${orphanFormAction.join(", ") || "none"})`);

async function request(fixture, path, { method = "GET", body } = {}) {
  const headers = { "user-agent": "Mozilla/5.0", cookie: fixture.cookie };
  if (body) headers["content-type"] = "application/x-www-form-urlencoded";
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { method, headers, body }), fixture.env, {});
  return { response, text: await response.text() };
}

const fixture = await createV2265QaFixture();
try {
  const month = "2026-07";
  const householdId = "house-home";
  const q = `month=${month}&household_id=${householdId}`;

  // 1. 카드 마크업에서 삭제 버튼이 수정 폼 안에 있는지 확인한다.
  const feed = await request(fixture, `/app?${q}&feed=all`);
  eq(feed.response.status, 200, "거래 목록이 렌더된다");
  const cardStart = feed.text.indexOf('class="v8-tx"');
  ok(cardStart > 0, "거래 카드가 렌더된다");
  const card = feed.text.slice(cardStart, feed.text.indexOf('class="v8-tx"', cardStart + 10) > 0 ? feed.text.indexOf('class="v8-tx"', cardStart + 10) : cardStart + 4000);
  const deleteAt = card.indexOf('formaction="/admin/delete"');
  ok(deleteAt > 0, "카드에 삭제 버튼이 있다");
  const formClose = card.indexOf("</form>", card.lastIndexOf('<form', deleteAt));
  ok(formClose > deleteAt, "삭제 버튼이 소유 폼의 </form> 앞에 있다");
  ok(card.slice(0, deleteAt).lastIndexOf("<form") > card.slice(0, deleteAt).lastIndexOf("</form>"), "삭제 버튼 앞에 열린 폼이 있다");

  // 2. 실제로 삭제가 되는지 확인한다.
  const before = fixture.db.transactions.length;
  const target = fixture.db.transactions.find((row) => row.household_id === householdId);
  ok(target, "삭제할 거래가 픽스처에 있다");
  const deleted = await request(fixture, "/admin/delete", {
    method: "POST",
    body: new URLSearchParams({ id: target.id, month, household_id: householdId, return_to: `/app?${q}` }).toString(),
  });
  ok([200, 302, 303].includes(deleted.response.status), `삭제 요청이 정상 응답한다 (${deleted.response.status})`);
  eq(fixture.db.transactions.length, before - 1, "거래가 실제로 하나 줄어든다");
  ok(!fixture.db.transactions.some((row) => row.id === target.id), "삭제한 거래가 남아 있지 않다");

  // 3. 삭제 후 목록에서도 사라져야 한다.
  const after = await request(fixture, `/app?${q}&feed=all`);
  eq(after.response.status, 200, "삭제 후 목록이 렌더된다");
  ok(!after.text.includes(`id="tx-${target.id}"`), "삭제한 카드가 목록에 남아 있지 않다");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.66 transaction delete (${checks} checks)`);
