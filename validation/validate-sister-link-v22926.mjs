// V22.9.26 — 공개 페이지 푸터의 형제 사이트 링크.
//
// 한국어 생활 계산기(everyday-tools-ko)는 말해가계부와 함께 운영하는 별도 정적 사이트다.
// 그쪽 푸터와 금융·일 도구 하단에는 말해가계부 링크가 있고, 이 검사는 그 역방향 링크가
// 공개 페이지 푸터에만, 정확히 한 번, 새 창·noopener 로 들어 있는지 지킨다.
// 개인 데이터 화면(/my, /app)에는 외부 링크를 넣지 않는다.

import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let passed = 0;
const ok = (value, label) => { if (!value) throw new Error(`FAIL: ${label}`); passed += 1; };
const eq = (actual, expected, label) => { if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`); passed += 1; };
const countOf = (text, needle) => String(text || "").split(needle).length - 1;

const SISTER_URL = "https://everyday-tools-ko.pages.dev";
const LINK = `<a href="${SISTER_URL}" target="_blank" rel="noopener">생활 계산기</a>`;
const PUBLIC_PATHS = ["/", "/about", "/contact", "/privacy", "/terms", "/cookies", "/site-map", "/faq", "/how-it-works", "/security"];
const EXISTING_LINKS = ['<a href="/about">서비스 소개</a>', '<a href="/contact">문의 안내</a>', '<a href="/privacy">개인정보처리방침</a>', '<a href="/terms">이용약관</a>', '<a href="/cookies">쿠키 정책</a>', '<a href="/site-map">사이트맵</a>'];

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const fixture = await createV2265QaFixture();
const ownerCookie = await fixture.cookieFor("user-bin");

function request(path, cookie) {
  return app.fetch(new Request(`https://malhaebook.com${path}`, {
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", ...(cookie ? { cookie } : {}) },
  }), fixture.env, { waitUntil() {} });
}

try {
  // 1) 소스: 링크는 공개 푸터 함수 안에 한 번만 적는다 — 주소를 바꿀 때 고칠 곳이 하나다.
  const start = source.indexOf("function publicSiteFooter()");
  ok(start > 0, "publicSiteFooter 함수를 찾았다");
  const footer = source.slice(start, source.indexOf("\nfunction ", start + 1));
  eq(countOf(footer, LINK), 1, "공개 푸터 함수에 형제 사이트 링크가 정확히 한 번 있다");
  eq(countOf(source, SISTER_URL), 1, "형제 사이트 주소는 소스 전체에서 푸터 한 곳에만 적는다");
  ok(LINK.includes('target="_blank"') && LINK.includes('rel="noopener"'), "새 창으로 여는 외부 링크는 noopener 를 붙인다");
  let cursor = -1;
  for (const existing of EXISTING_LINKS) {
    const at = footer.indexOf(existing);
    ok(at > cursor, `기존 푸터 링크 순서를 유지한다: ${existing}`);
    cursor = at;
  }
  ok(footer.indexOf(LINK) > cursor, "형제 사이트 링크는 기존 링크 뒤, 마지막에 둔다");

  // 2) 공개 페이지마다 푸터 링크가 한 번씩 보인다.
  for (const path of PUBLIC_PATHS) {
    const response = await request(path);
    eq(response.status, 200, `${path} 공개 페이지가 열린다`);
    const html = await response.text();
    eq(countOf(html, LINK), 1, `${path} 푸터에 형제 사이트 링크가 한 번 있다`);
    ok(html.indexOf(LINK) > html.indexOf('class="pubFooterLinks"'), `${path} 링크가 푸터 링크 묶음 안에 있다`);
  }

  // 3) 개인 데이터 화면과 로그인 전 안내에는 외부 링크를 넣지 않는다.
  for (const [path, cookie] of [["/my", ownerCookie], ["/app?month=2026-07&household_id=house-home", ownerCookie], ["/my", null]]) {
    const response = await request(path, cookie);
    const html = await response.text();
    eq(countOf(html, SISTER_URL), 0, `${path}${cookie ? " (로그인)" : " (비로그인)"} 응답에는 형제 사이트 주소가 없다 (HTTP ${response.status})`);
  }

  console.log(`V22.9.26 형제 사이트 링크 검사 통과 (${passed} checks)`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
