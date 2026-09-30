// V22.9.19 — 로그인 대기 팝업 · 카드사별 가져오기 안내 · 영수증 사진 등록 제거.
//
// 1. 카카오로 로그인 버튼을 누르면 카카오 화면이 뜰 때까지 화면이 멈춘 듯 보였다. 이제 "로그인 중입니다"
//    팝업과 가계부 사용 팁이 뜨고, 오래 걸리면 취소 단추가 나온다.
// 2. 백업/가져오기 화면에 카드사(현대·삼성·롯데·신한·KB·NH·하나·우리·BC·기타)별 "등록하기"가 있고,
//    누르면 엑셀을 받는 순서를 그림(클릭 위치 표시)과 함께 보여 준 뒤 그 자리에서 파일을 올린다.
// 3. 사진 OCR 인식률이 낮아 영수증 사진 등록 기능을 통째로 없앴다. 예전 주소는 홈으로 보낸다.
//
// ── 이 검사가 보는 것 ──
// 문구가 있는지가 아니라, 서버가 내보낸 클라이언트 스크립트가 **문법상 실행 가능한지**, 안내가 카드사마다
// 빠짐없이 나오는지, 없앤 기능이 어디에도 남아 있지 않은지(메뉴·바로가기·서버 경로·OCR 스크립트)를 본다.

import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { readFileSync } from "node:fs";

let checks = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  checks += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`);
  checks += 1;
}

const base = "https://ttokttok-accountbook.com";
const fixture = await createV2265QaFixture();
const ctx = { waitUntil() {}, passThroughOnException() {} };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const kakaoEnv = { ...fixture.env, KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "test-key", PUBLIC_BASE_URL: base, KAKAO_REDIRECT_URI: `${base}/auth/kakao/callback` };

async function fetchPage(path, { env = fixture.env, cookie = fixture.cookie, method = "GET" } = {}) {
  const response = await app.fetch(new Request(`${base}${path}`, { method, headers: cookie ? { cookie } : {}, redirect: "manual" }), env, ctx);
  return { status: response.status, location: response.headers.get("location") || "", text: await response.text() };
}

// 서버가 내보낸 <script> 본문이 문법상 통과하는지. 실행은 하지 않는다(DOM 이 없다).
function assertScriptsParse(html, label) {
  // JSON 등 type 이 붙은 스크립트(예: 화면 미리 준비 규칙)는 코드가 아니므로 뺀다.
  const scripts = [...html.matchAll(/<script(?![^>]*\b(?:src|type)=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((body) => body.trim());
  ok(scripts.length > 0, `${label}: 인라인 스크립트가 있다`);
  for (const body of scripts) {
    try {
      new Function(body);
    } catch (error) {
      throw new Error(`FAIL: ${label}: 인라인 스크립트 문법 오류 — ${error.message}\n${body.slice(0, 120)}`);
    }
    checks += 1;
  }
}

// ---------------------------------------------------------------------------
// 1. 카카오 로그인 대기 팝업
// ---------------------------------------------------------------------------
{
  const login = await fetchPage("/my", { env: kakaoEnv, cookie: "" });
  eq(login.status, 200, "로그인 화면이 열린다");
  ok(login.text.includes('href="/auth/kakao/start"'), "카카오 로그인 버튼이 있다");
  ok(/<div id="kakaoLoginProgress"[^>]*\shidden[\s>]/.test(login.text), "팝업은 처음에 숨겨져 있다");
  ok(login.text.includes("로그인 중입니다"), "팝업이 '로그인 중입니다'라고 말한다");
  ok(/role="alertdialog"[^>]*aria-modal="true"/.test(login.text), "팝업은 대화상자로 알려진다(보조기기)");
  ok(login.text.includes('id="kakaoProgressCancel"'), "오래 걸릴 때 취소 단추가 있다");
  const tips = login.text.match(/tips:(\[[^\]]*\])/);
  ok(tips, "팁 목록이 스크립트에 실려 있다");
  const list = JSON.parse(tips[1]);
  ok(list.length >= 5, `가계부 사용 팁이 여러 개다 (${list.length}개)`);
  ok(list.every((tip) => tip.length > 10 && tip.length < 80), "팁은 팝업에 들어가는 한두 줄이다");
  ok(!list.some((tip) => /영수증/.test(tip)), "없앤 기능(영수증)을 팁으로 소개하지 않는다");
  assertScriptsParse(login.text, "로그인 화면");
  ok(!/영수증/.test(login.text), "로그인 화면에 영수증 문구가 없다");

  // 카카오 로그인이 꺼져 있어도 화면은 깨지지 않는다(버튼이 없으면 스크립트는 아무 일도 안 한다).
  const off = await fetchPage("/my", { cookie: "" });
  eq(off.status, 200, "카카오 로그인이 꺼져도 로그인 화면이 열린다");
  ok(!off.text.includes('class="kakaoBtn"'), "꺼져 있으면 카카오 버튼이 없다");
}

// ---------------------------------------------------------------------------
// 2. 카드사별 가져오기 안내
// ---------------------------------------------------------------------------
{
  const backup = await fetchPage("/my/backup?household_id=house-home");
  eq(backup.status, 200, "백업/가져오기 화면이 열린다");
  const cards = [...backup.text.matchAll(/<button type="button" class="cgOpen" data-card="([^"]+)"/g)].map((m) => m[1]);
  eq(cards.join(","), "hyundai,samsung,lotte,shinhan,kb,nh,hana,woori,bc,etc", "카드사 10곳 버튼이 순서대로 있다");
  for (const name of ["현대카드", "삼성카드", "롯데카드", "신한카드", "KB국민카드", "NH농협카드", "하나카드", "우리카드", "BC카드"]) {
    ok(backup.text.includes(`<b>${name}</b>`), `${name} 버튼이 있다`);
  }
  for (const id of cards) {
    const tpl = backup.text.match(new RegExp(`<template id="cgTpl-${id}"[^>]*>([\\s\\S]*?)</template>`));
    ok(tpl, `${id} 안내 템플릿이 있다`);
    const figs = (tpl[1].match(/<svg class="cgFig"/g) || []).length;
    eq(figs, 4, `${id} 안내에 그림이 4장(로그인·메뉴·기간·엑셀) 있다`);
    eq((tpl[1].match(/<li class="cgStep">/g) || []).length, 4, `${id} 안내가 4단계다`);
    ok(/여기 클릭/.test(tpl[1]), `${id} 그림에 클릭 위치 표시가 있다`);
    ok(/엑셀 (저장|다운로드)/.test(tpl[1]), `${id} 안내가 엑셀 받는 버튼을 알려 준다`);
  }
  ok(backup.text.includes('id="cgModal"') && backup.text.includes('id="cgFile"') && backup.text.includes('id="cgGo"'), "안내 창에 파일 올리기 자리가 있다");
  ok(backup.text.includes("화면 개편에 따라 메뉴 이름과 위치가 조금 다를 수 있어요"), "그림이 예시일 뿐이라고 밝힌다");
  ok(backup.text.includes("암호"), "암호 걸린 파일 안내가 있다");
  ok(backup.text.includes('id="cardImportRuntime"'), "안내 창 스크립트가 실려 있다");
  ok(backup.text.includes('id="myImportForm"') && backup.text.includes('id="myImportFile"') && backup.text.includes('id="myImportText"'), "안내 창이 넘겨 줄 기존 가져오기 폼이 그대로 있다");
  ok(!backup.text.includes("cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js\"></script>"), "엑셀 변환기는 화면 진입 때 받지 않고 파일을 고를 때 받는다");
  ok(backup.text.includes("cdn.sheetjs.com/xlsx-0.20.3"), "안내 창 스크립트가 엑셀 변환기를 늦게 불러올 수 있다");
  assertScriptsParse(backup.text, "백업/가져오기 화면");
  // 가져오기는 저장하지 않고 미리보기로 간다 — 기존 흐름을 우회하지 않는다.
  ok(backup.text.includes('name="import_action" value="preview"'), "안내 창의 '미리보기 분석하기'는 저장이 아니라 미리보기로 이어진다");
  ok(!backup.text.includes("영수증"), "백업/가져오기 화면에 영수증 문구가 없다");
}

// ---------------------------------------------------------------------------
// 3. 영수증 사진 등록 제거
// ---------------------------------------------------------------------------
{
  const moved = await fetchPage("/receipts?month=2026-07&household_id=house-home&msg=receipt_saved");
  eq(moved.status, 303, "옛 /receipts 주소는 홈으로 보낸다");
  ok(moved.location.startsWith("/app?"), `홈으로 간다 (${moved.location})`);
  ok(moved.location.includes("household_id=house-home") && moved.location.includes("month=2026-07"), "보던 가계부와 월은 유지한다");
  ok(!moved.location.includes("msg="), "옛 메시지 값은 넘기지 않는다");
  eq((await fetchPage("/receipts", { cookie: "" })).location, "/app", "쿼리 없이도 /app 으로 간다");
  eq((await fetchPage("/my/receipt/save", { method: "POST" })).status, 404, "영수증 저장 경로는 없다");

  ok(!/tesseract/i.test(source), "OCR 엔진(tesseract) 참조가 소스에 없다");
  ok(!/handleReceipt|renderReceiptCapture|receiptCaptureClientMain/.test(source), "영수증 화면·저장·클라이언트 코드가 소스에 없다");

  const manifest = JSON.parse((await fetchPage("/manifest.json", { cookie: "" })).text);
  ok(!manifest.shortcuts.some((entry) => /receipt/.test(entry.url)), "홈 화면 바로가기에 영수증이 없다");

  const menu = await fetchPage("/menu?household_id=house-home");
  eq(menu.status, 200, "전체 메뉴가 열린다");
  ok(!menu.text.includes("/receipts"), "전체 메뉴에 영수증 링크가 없다");
  const app0 = await fetchPage("/app?household_id=house-home");
  ok(!app0.text.includes("/receipts"), "홈·사이드바에 영수증 링크가 없다");
  const smart = await fetchPage("/smart-tools?household_id=house-home");
  eq(smart.status, 200, "무료 스마트 도구 화면이 열린다");
  ok(!smart.text.includes("/receipts") && !smart.text.includes("영수증"), "스마트 도구 화면에 영수증 안내가 없다");

  // 카카오: 사진을 보내면 읽을 수 없다고 알리고 글로 보내는 법을 안내한다.
  const key = "kakao_login:2265";
  const body = { userRequest: { utterance: "", params: { image: "https://example.com/a.jpg" }, user: { id: key, type: "botUserKey", properties: { botUserKey: key } } }, bot: { id: "bot" }, action: { name: "fallback", params: {} } };
  const kakao = await app.fetch(new Request(`${base}/skill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), fixture.env, ctx);
  const text = (await kakao.json()).template?.outputs?.[0]?.simpleText?.text || "";
  ok(text.includes("사진은 봇이 읽을 수 없어요"), `카카오에 사진을 보내면 읽을 수 없다고 알린다 (${text.slice(0, 30)})`);
  ok(!text.includes("/receipts"), "옛 영수증 주소를 안내하지 않는다");
}

fixture.restore();
console.log(`PASS: V22.9.19 card import guide · login progress · receipt removal (${checks} checks)`);
