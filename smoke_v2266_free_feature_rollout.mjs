// Compatibility filename retained for validation runners created for V22.6.6.
// V22.6.7 keeps completed smart tools free while rolling incomplete features back to hidden.
import assert from "node:assert/strict";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

const fixture = await createV2265QaFixture();

async function request(path) {
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    redirect: "manual",
    headers: { cookie: fixture.cookie },
  }), fixture.env, {});
}

try {
  const health = await (await request("/health")).json();
  assert.equal(health.version, "V22.6.9-SECURITY-SPENDER-PRIVACY-HOTFIX");

  const smart = await (await request("/smart-tools?month=2026-07&household_id=house-home")).text();
  for (const label of ["영수증 스마트 기록", "반복 거래 자동화", "고급 정산", "주간·월간 리포트", "스마트 예산·미션"]) {
    assert.ok(smart.includes(label), `${label} remains free and visible`);
  }
  assert.ok(!smart.includes('href="/card-benefits'));
  assert.ok(!smart.includes('href="/meme'));

  const menu = await (await request("/menu?month=2026-07&household_id=house-home")).text();
  for (const label of ["무료 스마트 도구", "영수증 기록", "자동 리포트", "고급 정산"]) assert.ok(menu.includes(label));
  for (const label of ["카드 혜택", "소비 카드", "소비 도감"]) assert.ok(!menu.includes(label));

  for (const path of ["/meme-lab", "/meme-archive", "/share/meme?id=legacy", "/card-benefits"]) {
    const response = await request(path);
    assert.equal(response.status, 404, `${path} is hidden by default`);
  }
} finally {
  fixture.restore();
}

console.log("SMOKE_V2266_COMPATIBILITY_OK");
