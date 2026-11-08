// V22.9.112 Gemini 코드 감사 후속 수정 검사(검증 결과 review-artifacts/gemini-review-2026-11-08/VERDICTS.md).
//  ⑥-1 다건 합계 줄에 조사가 붙어도 총계로 보고 제외(합 일치 가드 유지).
//  ⑪ 분류 챌린지가 예산과 같은 상·하위 분류 매칭을 쓴다('식비' → '외식'/'배달').
//  ⑬ 자동 리포트 Cron 에서 한 가계부·기간 생성 실패는 기록·전진(머리 막힘 방지).
//  ⑲ 관리자 강제 내보내기도 별칭·카카오 선택 가계부를 정리(자진 탈퇴와 같게).
//  ⑳b 단톡방 웹 열기로 계정이 바뀔 때 이전 계정 설정 쿠키(ab_setup·ab_bk)도 지운다.
// 판 이름 글자는 적지 않는다('판 번호 정본' 검사). 오프라인: 모듈 직접 호출 + 소스 대조, DB·바깥 요청 없음.
import { readFileSync } from "node:fs";
import { counter } from "./lib-audit-v22934.mjs";
import { parseMultipleTransactions } from "../src/modules/nlu/transaction-parser.js";
import { budgetCategoryMatches } from "../src/modules/domain/budgets.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { ok, eq, done } = counter("V22.9.112 Gemini 후속 수정(합계 조사·분류 챌린지·Cron 머리막힘·강제 내보내기 정리·방 열기 쿠키) 검사 통과");

// ── ⑥-1 합계 줄 조사 ───────────────────────────────────────────────
const amts = (text) => (parseMultipleTransactions(text) || []).filter((r) => r && typeof r.amount === "number").map((r) => r.amount);
eq(JSON.stringify(amts("커피 4000원, 택시 8000원, 합계는 12000원")), JSON.stringify([4000, 8000]), "⑥-1 '합계는'(조사) 줄은 제외된다");
eq(JSON.stringify(amts("커피 4000원, 택시 8000원, 총액이 12000원")), JSON.stringify([4000, 8000]), "⑥-1 '총액이'(조사) 줄도 제외된다");
eq(JSON.stringify(amts("커피 4000원, 택시 8000원, 합계 12000원")), JSON.stringify([4000, 8000]), "⑥-1 '합계'(조사 없음)는 그대로 제외(기존)");
eq(JSON.stringify(amts("커피 4000원, 택시 8000원, 합계는 99999원")), JSON.stringify([4000, 8000, 99999]), "⑥-1 합이 안 맞으면 가드로 유지(오제외 없음)");
eq(JSON.stringify(amts("커피 4000원, 택시 8000원, 메모는 12000원")), JSON.stringify([4000, 8000, 12000]), "⑥-1 총계어 아니면(메모는) 유지(오제외 없음)");

// ── ⑪ 분류 챌린지 상위 매칭 ────────────────────────────────────────
ok(budgetCategoryMatches("식비", "외식") === true, "⑪ 예산 분류 '식비'는 거래 '외식'을 포함한다");
ok(budgetCategoryMatches("식비", "식비") === true, "⑪ 같은 이름은 매칭된다");
ok(budgetCategoryMatches("교통", "외식") === false, "⑪ 다른 분류는 매칭되지 않는다");
const rc = read("src/modules/my/report-challenge.js");
ok(rc.includes("!budgetCategoryMatches(settings.category, row.category)"), "⑪ 분류 챌린지가 budgetCategoryMatches 를 쓴다(정확 일치 아님)");
ok(!rc.includes('String(row.category || "").trim() !== settings.category'), "⑪ 예전 정확 일치 비교가 남아 있지 않다");

// ── ⑬ Cron 머리 막힘 ───────────────────────────────────────────────
const rp = read("src/modules/my/reports-premium.js");
ok(/free_report_generate_failed[^;]*safeError\(err\)\}`\); continue;/.test(rp), "⑬ 생성 실패가 continue 로 다음 가계부로 전진한다");
ok(!/free_report_generate_failed[^;]*safeError\(err\)\}`\); stop = "error"; break;/.test(rp), "⑬ 생성 실패에서 옛 stop=error;break(머리 막힘)이 없다");

// ── ⑲ 관리자 강제 내보내기 정리 ────────────────────────────────────
const th = read("src/modules/admin/transactions-households.js");
ok(/member_removed[\s\S]{0,40}$|removeMemberAlias\(env, householdId, userId\)/.test(th) && th.includes("removeMemberAlias(env, householdId, userId)"), "⑲ 강제 내보내기가 removeMemberAlias 를 부른다");
ok(th.includes("clearKakaoSelectedHousehold(env, userId)") && th.includes("getKakaoSelectedHouseholdId(env, userId)"), "⑲ 강제 내보내기가 카카오 선택 가계부도 정리한다");

// ── ⑳b 방 열기 설정 쿠키 ───────────────────────────────────────────
const ro = read("src/modules/auth/kakao-room-open.js");
ok(ro.includes("clearSetupCookies"), "⑳b 방 열기 세션 전환에 clearSetupCookies 가 포함된다");
ok(/ab_hh=;[^]*clearSetupCookies\(\)/.test(ro), "⑳b 세션 전환 쿠키 배열(ab_hh 다음)에 clearSetupCookies 가 더해진다");

// 판 단일 출처(글자 박지 않고 읽어 비교)
const versionTxt = read("VERSION.txt").trim();
const appVersion = (read("src/index.js").match(/const APP_VERSION = "([^"]+)"/) || [])[1];
ok(versionTxt === appVersion, `VERSION.txt 와 번들 APP_VERSION 이 같다 (${appVersion})`);

done();
