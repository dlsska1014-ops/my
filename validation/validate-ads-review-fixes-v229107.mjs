// V22.9.107 광고 승인 준비(V22.9.106) 검토 뒤 고침 검사(D-1~D-7, docs/codex/FOLLOWUP_FINDINGS_V22_9_107.md).
// D-1 광고 자리·CSP·SDK 시작은 정본 출처 + 정확한 경로로 판정한다(유입 매개변수·앵커가 붙어도 같은 문서, 다른 호스트·경로·http 는 아님).
// D-2 애드핏 FAQ 문구가 방침·쿠키 문구(글 6편)와 같다. D-3 계산표 글은 서사 절이 먼저, 예제 표·검산·계산표 열기가 글 끝이다.
// D-4~D-6 계산표 화면: 입력을 고치면 이전 결과를 ‘변경 전 결과’ 로 남김, 휴대폰 폭 2열, 머리·꼬리 링크. 주소 판은 v229107(옛 v229106 은 같은 내용, 두 판 전은 404).
// D-7 글 목록 카드에 ‘계산표 포함’. 화면은 기본 env 로 app.fetch 로 그리고 바깥 요청은 0회여야 한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import app from "../src/index.js";
import {
  PUBLIC_WORKSHEETS_V229106 as specs, PUBLIC_WORKSHEET_ASSET_PREVIOUS_VERSIONS_V229107 as previousVersions,
  PUBLIC_WORKSHEET_ASSET_VERSION_V229107 as assetVersion, publicWorksheetPathV229106 as worksheetPath,
} from "../src/modules/public/worksheet-pages.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const origin = "https://malhaebook.com";
// 판 이름은 VERSION.txt 에서 읽는다(판 번호 정본 검사가 APP_VERSION 과 같게 유지). 이 판의 앞머리만 글자로 둔다.
const VERSION = readFileSync(new URL("../VERSION.txt", import.meta.url), "utf8").trim();
assert.ok(VERSION.startsWith("V22.9.107-"), "VERSION.txt 가 V22.9.107 판이다");
const LIVE = { ADS_MODE: "live", ADS_SLOT_CONTENT: "1234567890" };
const ADFIT = { ADS_MODE: "adfit", ADFIT_UNIT_CONTENT: "DAN-test123456", ADFIT_UNIT_SIZE: "320x100" };
const request = async (target, env = {}, method = "GET") => {
  const res = await app.fetch(new Request(target.startsWith("http") ? target : origin + target, { method }), env, {});
  return { status: res.status, html: await res.text(), headers: res.headers };
};
const h2Of = (html) => [...html.matchAll(/<section class="pubSection" id="section-(\d+)"><h2>([\s\S]*?)<\/h2>/g)].map((m) => m[2]);
const location = (href) => { const u = new URL(href); return { href, origin: u.origin, pathname: u.pathname }; };

const realFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = async () => { outbound++; throw new Error("unexpected outbound request"); };
try {
  const health = JSON.parse((await request("/health")).html);
  eq(health.version, VERSION, "판 이름");
  eq(assetVersion, "v229107", "계산표 자산 주소 판");
  eq(previousVersions, ["v229106"], "바로 앞 판 주소만 같은 내용으로 낸다");

  for (const [slug, spec] of Object.entries(specs)) {
    const path = `/${slug}`;
    // D-1 서버: 유입 매개변수가 붙어도 본문·광고 자리·CSP 가 정본 응답과 같다. 다른 호스트·http 는 광고가 없다.
    for (const [label, env] of [["live", LIVE], ["adfit", ADFIT]]) {
      const canonical = await request(path, env);
      ok(canonical.html.includes('class="card adSlot') && canonical.html.includes("data-ad-activation"), `${path} ${label}: 정본 응답에 광고 자리와 시작 스크립트가 있다`);
      for (const query of ["?utm_source=kakao&utm_medium=chat", "?fbclid=synthetic", "?gclid=synthetic&x=1"]) {
        const tagged = await request(path + query, env);
        eq(tagged.status, 200, `${path}${query} ${label}: 200`);
        eq(tagged.html, canonical.html, `${path}${query} ${label}: 유입 표시가 붙어도 본문(광고 자리 포함)이 정본과 같다`);
        eq(tagged.headers.get("content-security-policy"), canonical.headers.get("content-security-policy"), `${path}${query} ${label}: CSP 도 같다`);
      }
      const other = await request(`https://preview.example.test${path}`, env);
      ok(!other.html.includes("data-ad-activation") && !other.html.includes('class="card adSlot'), `${path} ${label}: 다른 호스트는 광고 자리가 없다`);
      const insecure = await request(`http://malhaebook.com${path}`, env);
      ok(insecure.status === 308 && String(insecure.headers.get("location")).startsWith(`${origin}${path}`), `${path} ${label}: http 는 https 정본으로 308`);
      // D-1 클라이언트: 같은 출처·경로면 앵커·매개변수가 붙어도 SDK 를 한 번 시작하고, 다른 경로·다른 출처·http 는 시작하지 않는다.
      const body = canonical.html.match(/<script data-ad-activation>([\s\S]*?)<\/script>/)?.[1];
      ok(body, `${path} ${label}: 시작 스크립트`);
      const run = (href) => {
        let loads = 0;
        const slot = { hidden: true, style: {}, appendChild() { loads++; } };
        const doc = { prerendering: false, visibilityState: "visible", readyState: "complete", querySelector: () => slot, createElement: () => ({ addEventListener() {} }), addEventListener() {}, removeEventListener() {} };
        vm.runInNewContext(body, { document: doc, window: { location: location(href) } });
        return { loads, hidden: slot.hidden };
      };
      for (const href of [`${origin}${path}`, `${origin}${path}#section-3`, `${origin}${path}?utm_source=kakao#section-2`]) eq(run(href), { loads: 1, hidden: false }, `${label} ${href}: 같은 문서는 SDK 를 한 번 시작한다`);
      for (const href of [`${origin}${path}/`, `${origin}/`, `https://preview.example.test${path}`, `http://malhaebook.com${path}`]) eq(run(href), { loads: 0, hidden: true }, `${label} ${href}: 다른 문서는 시작하지 않는다`);
    }

    // D-3 절 순서: 결과 한 절 → 글의 원래 절(5~8) → 조건 표(있으면) → 예제 표 → 검산·계산표 열기.
    const article = await request(path);
    const h2 = h2Of(article.html);
    const tail = [...(spec.fields.length ? ["예제의 계산 조건"] : []), ...spec.groups.map((g) => `${g.label} 예제`), "예제 검산과 계산표 열기"];
    eq(h2[0], "이 글에서 완성할 결과", `${path}: 첫 절은 완성할 결과`);
    eq(h2.slice(-tail.length), tail, `${path}: 예제 표·검산은 글 끝`);
    const own = h2.length - 1 - tail.length;
    ok(own >= 5 && own <= 8, `${path}: 글의 원래 절은 5~8개 (${own})`);
    ok(article.html.indexOf("원본(가상 데이터)") > article.html.indexOf(`<h2>${h2[1]}</h2>`), `${path}: 원본 표가 서사 절 뒤에 온다`);
    const first = article.html.match(/<section class="pubSection" id="section-1">([\s\S]*?)<\/section>/)[1];
    ok(first.includes(spec.outcome) && !first.includes(spec.instruction) && !first.includes("<table"), `${path}: 첫 절은 결과 한 문단뿐(입력 안내·표 없음)`);
    const lastSection = article.html.match(new RegExp(`<section class="pubSection" id="section-${h2.length}">([\\s\\S]*?)<\\/section>`))[1];
    ok(lastSection.includes(spec.instruction) && lastSection.includes("<table") && lastSection.includes('class="pubNote"') && lastSection.includes(worksheetPath(slug)) && lastSection.includes(`${worksheetPath(slug)}?download=1`), `${path}: 마지막 절에 입력 안내·검산 표·가상 예제 안내·계산표 링크 둘`);
    eq((article.html.match(/living-worksheet-v229106-/g) || []).length, 0, `${path}: 옛 판 계산표 주소를 쓰지 않는다`);
    eq((article.html.match(/living-worksheet-v229107-/g) || []).length, 4, `${path}: 새 판 계산표 주소(머리 단추 2 + 마지막 절 링크 2)`);

    // D-4~D-6 계산표 자산: 새 판·옛 판 주소는 같은 내용, 두 판 전은 404, 머리·꼬리 링크, 변경 전 결과 표시, 휴대폰 2열.
    const sheet = await request(worksheetPath(slug));
    eq(sheet.status, 200, `${slug}: 계산표 200`);
    eq(sheet.headers.get("cache-control"), "public, max-age=31536000, immutable", `${slug}: 1년 캐시`);
    eq(sheet.headers.get("x-robots-tag"), "noindex, follow", `${slug}: 색인 제외`);
    const old = await request(worksheetPath(slug, "v229106"));
    ok(old.status === 200 && old.html === sheet.html, `${slug}: 바로 앞 판 주소는 같은 내용`);
    eq((await request(worksheetPath(slug, "v229105"))).status, 404, `${slug}: 두 판 전 주소는 404`);
    const head = await request(worksheetPath(slug), {}, "HEAD");
    ok(head.status === 200 && head.html === "", `${slug}: HEAD`);
    ok(sheet.html.includes('<nav class="top" aria-label="현재 위치"><a href="https://malhaebook.com/">말해가계부</a>') && sheet.html.includes(`<a href="https://malhaebook.com/${slug}">설명 글과 계산 근거로 돌아가기</a></nav>`), `${slug}: 머리 줄(서비스 · 글 목록 · 설명 글)`);
    ok(sheet.html.includes('<footer class="foot">') && ["/privacy", "/terms", "/contact", "/articles", `/${slug}`].every((href) => sheet.html.includes(`<a href="https://malhaebook.com${href}">`)), `${slug}: 꼬리 링크(방침·약관·문의·글 목록·설명 글)`);
    ok(sheet.html.includes('#worksheet-result[data-stale="1"]::before{content:"입력값을 바꾸기 전 결과입니다.') && sheet.html.includes('#worksheet-result[data-stale="1"] .table-scroll,#worksheet-result[data-stale="1"] p{opacity:.55}'), `${slug}: 변경 전 결과 표시 CSS`);
    ok(sheet.html.includes("@media(max-width:640px){.fields{grid-template-columns:repeat(2,minmax(0,1fr))"), `${slug}: 휴대폰 폭 2열`);
    const client = sheet.html.match(/<script>\(function worksheetClientV229106[\s\S]*?<\/script>/)?.[0] || "";
    ok(client.includes('const invalidate = () => { last = null; exportButton.disabled = true; if (output.childElementCount) output.dataset.stale = "1";') && !/const invalidate = \(\) => \{[^\n]*output\.replaceChildren\(\)/.test(client), `${slug}: 입력 변경은 결과를 지우지 않고 변경 전 표시만 한다`);
    ok(client.includes('output.replaceChildren(); delete output.dataset.stale; last = null; exportButton.disabled = true;'), `${slug}: 다시 계산하면 변경 전 표시를 지운다`);
    ok(!/<script[^>]+src=/i.test(sheet.html) && String(sheet.headers.get("content-security-policy")).includes("connect-src 'none'"), `${slug}: 바깥 스크립트·연결 없음`);
    for (const script of sheet.html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)) { new vm.Script(script[1]); checks++; }
    ok(!/\b(?:fetch|localStorage|sessionStorage|XMLHttpRequest)\b/.test(client), `${slug}: 입력을 보내거나 저장하지 않는다`);
  }

  // D-2 문구: 두 네트워크 모두 방침·쿠키·FAQ 가 ‘선정한 공개 생활비 글 6편의 본문 아래에’ 로 같다.
  for (const [label, env, network] of [["adsense", LIVE, "Google 광고"], ["adfit", ADFIT, "카카오 애드핏 광고"]]) {
    for (const path of ["/privacy", "/cookies", "/faq"]) {
      const html = (await request(path, env)).html;
      ok(html.includes(`선정한 공개 생활비 글 6편의 본문 아래에 ${network}를 표시`), `${path} ${label}: 광고 화면 범위 문구가 글 6편이다`);
      ok(!html.includes("공개 가이드와 생활비 글처럼 로그인 없이 읽는 화면에") && !html.includes("생활비 리포트와 공개 가이드처럼 읽는 화면에"), `${path} ${label}: 옛 범위 문구가 없다`);
    }
  }

  // D-7 글 목록 카드: 계산표가 붙은 글 6편에만 ‘계산표 포함’.
  const hub = (await request("/articles")).html;
  const cards = [...hub.matchAll(/<li><a href="(\/[^"]+)">[^<]*<\/a><p>[^<]*<\/p><small>([^<]*)<\/small><\/li>/g)];
  ok(cards.length >= 40, `글 목록 카드 ${cards.length}개`);
  for (const [, href, small] of cards) eq(small.includes("계산표 포함"), Object.hasOwn(specs, href.slice(1)), `${href}: 계산표 포함 표시는 계산표 글에만`);
  eq((hub.match(/계산표 포함/g) || []).length, Object.keys(specs).length, "글 목록의 ‘계산표 포함’ 은 6개");
  eq(((await request("/")).html.match(/계산표 포함/g) || []).length, 0, "첫 화면 최근 글(링크 목록)에는 없다");
  eq(outbound, 0, "바깥 요청 0회");
} finally {
  globalThis.fetch = realFetch;
}
console.log(`V22.9.107 광고 검토 후속(D-1~D-7) 검사 통과 (${checks} checks)`);
