// V22.9.26 — 공개 페이지 푸터의 형제 사이트 링크.
//
// 생활 계산기는 말해가계부와 함께 운영하는 별도 정적 사이트다.
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

const SISTER_URL = "https://tools.malhaebook.com/";
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
// V22.9.139: AdSense 본 도메인(malhaebook.com) 단독 심사를 위해 공개 푸터에서 서브도메인(tools.malhaebook.com) 링크를 분리했다.
  const start = source.indexOf("function publicSiteFooter()");
  ok(start > 0, "publicSiteFooter 함수를 찾았다");
  const footer = source.slice(start, source.indexOf("\nfunction ", start + 1) > 0 ? source.indexOf("\nfunction ", start + 1) : source.indexOf("\n// @build", start + 1));
  eq(countOf(footer, SISTER_URL), 0, "공개 푸터 함수에 서브도메인 링크가 없다(V22.9.139 도메인 분리)");
  eq(countOf(source, SISTER_URL), 0, "공개 소스에 서브도메인 푸터 링크가 없다");
  ok(!source.includes("everyday-tools-ko.pages.dev"), "공개 소스에 이전 계산기 호스트가 없다");
  let cursor = -1;
  for (const existing of EXISTING_LINKS) {
    const at = footer.indexOf(existing);
    ok(at > cursor, `기존 푸터 링크 순서를 유지한다: ${existing}`);
    cursor = at;
  }
  ok(footer.indexOf('<a href="/support">후원하기</a>') > cursor, "후원하기 링크가 푸터 마지막에 온다");

  // 2) 공개 페이지마다 푸터 링크 묶음이 정상이고 서브도메인 링크가 없다.
  for (const path of PUBLIC_PATHS) {
    const response = await request(path);
    eq(response.status, 200, `${path} 공개 페이지가 열린다`);
    const html = await response.text();
    eq(countOf(html, SISTER_URL), 0, `${path} 푸터에 서브도메인 링크가 없다`);
    ok(html.includes('class="pubFooterLinks"'), `${path} 푸터 링크 묶음이 있다`);
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
