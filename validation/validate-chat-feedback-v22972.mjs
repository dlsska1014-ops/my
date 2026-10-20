// V22.9.72 (단톡방 피드백 판): 2026-10-20 운영 단톡방 테스트 피드백 — 띄어쓰기 없는 짧은 버튼 이름, ‘도움말’ 워딩,
// 맨 아래 ‘기록하기’(멘션) 버튼, 참여 전·빈 결과 안내 축약과 다음 행동 버튼, 4초 예산 초과 답 축약.
// Synthetic in-memory requests only (mock.supabase.co). No live Supabase, Kakao or financial data writes.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const eq = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const ok = (actual, label) => { assert.ok(actual, label); checks++; };
const BASE = "https://malhaebook.com";
const ROOM = "chat-feedback-room";
const OWNER = "chat-feedback-owner", MINA = "chat-feedback-mina";

const describe = (body) => {
  const outs = body?.template?.outputs || [];
  const text = outs.map((o) => o.simpleText?.text || [o.textCard?.title, o.textCard?.description].filter(Boolean).join("\n") || "").join("\n");
  const buttons = outs.flatMap((o) => o.textCard?.buttons || []);
  const labels = buttons.map((b) => b.label);
  const quick = (body?.template?.quickReplies || []).map((q) => q.label);
  return { text, buttons, labels, quick, title: outs[0]?.textCard?.title || "" };
};

const f = await createV2265QaFixture();
f.env.KAKAO_SKILL_SECRET = "synthetic-v72-skill-secret";
const memoryFetch = globalThis.fetch;
let fetchDelayMs = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname !== "mock.supabase.co") throw new Error("unexpected live network in synthetic chat-feedback QA");
  if (fetchDelayMs) await new Promise((resolve) => setTimeout(resolve, fetchDelayMs));
  return memoryFetch(input, init);
};

async function skill(utterance, key, { group = true } = {}) {
  const jobs = [];
  const payload = { bot: { id: "667e5382f2b2f84cb555091c", name: "말해가계부" }, userRequest: { utterance, user: { id: key, type: "botUserKey", properties: { botUserKey: key } }, ...(group ? { chat: { id: ROOM, type: "botGroupKey", properties: { botGroupKey: ROOM } } } : {}) } };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": f.env.KAKAO_SKILL_SECRET }, body: JSON.stringify(payload) }), f.env, { waitUntil(job) { jobs.push(job); } });
  const body = await response.json();
  await Promise.allSettled(jobs);
  return { result: response.headers.get("x-accountbook-nlu-result"), body, ...describe(body) };
}
const HUB_BUTTONS = ["리포트보기", "예산정하기", "함께쓰기", "웹관리하기", "기록하기"];
const LONG_LABELS = /^(오늘 기록 보기|이번 달 요약|남은 예산|예산 설정|웹 가계부 열기|새 가계부 만들기|초대코드로 참여|가계부 전환|내 이름 설정|단톡방 연결|사용 설명서|지금 기록하기|챗봇 멘션하기)$/;
const assertHub = (r, label) => {
  eq(r.title, "말해가계부 도움말", `${label}: 설명서 첫 화면 제목은 ‘말해가계부 도움말’`);
  eq(JSON.stringify(r.labels), JSON.stringify(HUB_BUTTONS), `${label}: 첫 화면 버튼 순서(기록하기 맨 아래)`);
  eq(r.buttons.at(-1)?.action, "mention", `${label}: 맨 아래 기록하기는 멘션 플러그인`);
  ok(r.text.includes("@말해가계부 점심 12000원"), `${label}: 첫 화면에 기록 예시`);
};
const assertNextStepRecord = (r, label, extra = []) => {
  eq(JSON.stringify(r.labels), JSON.stringify([...extra, "기록하기"]), `${label}: 버튼은 ${[...extra, "기록하기"].join("·")}`);
  eq(r.buttons.at(-1)?.action, "mention", `${label}: 기록하기는 멘션 플러그인`);
  ok(r.text.includes("예) @말해가계부 커피 4500원") || r.text.includes("남은 예산"), `${label}: 다음 행동 예시 또는 예산 안내`);
  ok(!r.text.includes("참여하지 않았어요") && !r.text.includes("기록이 없습니다"), `${label}: 긴 옛 문구 없음`);
};

try {
  // 1. 빈 멘션 카드: 도움말 보기(메시지) → 기록하기(멘션) 순서, 옛 이름 없음.
  const empty = await skill("@말해가계부", MINA);
  eq(empty.title, "안녕하세요 😊 말해가계부예요", "빈 멘션 카드 제목 유지");
  eq(JSON.stringify(empty.labels), JSON.stringify(["도움말 보기", "기록하기"]), "빈 멘션 버튼: 도움말 보기 → 기록하기(맨 아래)");
  eq(empty.buttons[0].action, "message", "도움말 보기는 메시지 버튼");
  eq(empty.buttons[0].messageText, "도움말 보기", "도움말 보기 버튼이 보내는 문장");
  eq(empty.buttons[1].action, "mention", "기록하기는 멘션 플러그인");
  ok(!JSON.stringify(empty.body).includes("챗봇 멘션하기") && !JSON.stringify(empty.body).includes("사용 설명서"), "옛 버튼 이름(챗봇 멘션하기·사용 설명서) 없음");

  // 2. 방 준비 뒤 참여 전 조회: 세 줄 안내 + 기록하기 멘션 버튼.
  const first = await skill("@말해가계부 점심 5만원", OWNER);
  // 첫 기록은 이 검사의 준비 단계다. 느린 windows-latest 러너에서는 4초 예산을 넘겨 지연 답이 먼저 나가고, 같은 처리가
  // 뒤에서 방 가계부를 준비한다(skill() 이 waitUntil 작업을 기다린다). 오류 답이나 저장되지 않은 기록은 여전히 실패다.
  const ownerSaved = f.db.transactions.some((row) => row.source_user_key === OWNER);
  ok((first.text.includes("공동 가계부를 준비했어요") || first.result === "deferred") && ownerSaved, `소유자 첫 기록이 방 가계부를 준비 (${first.result}: ${first.text.slice(0, 40)})`);
  for (const command of ["오늘기록", "이번달요약", "남은예산", "정산", "오늘 기록 보기", "이번 달 요약"]) {
    const r = await skill(`@말해가계부 ${command}`, MINA);
    eq(r.result, "ok", `참여 전 ${command}: 정상 응답`);
    eq(r.text, "아직 이 방 가계부에 참여 전이에요.\n기록을 한 번 보내면 바로 참여돼요.\n예) @말해가계부 커피 4500원", `참여 전 ${command}: 세 줄 안내`);
    assertNextStepRecord(r, `참여 전 ${command}`);
  }
  // 참여 전에도 설명서는 열린다(읽기 전용).
  assertHub(await skill("@말해가계부 도움말 보기", MINA), "참여 전 도움말 보기");

  // 3. 참여(첫 기록) 뒤 짧은 이름 → 긴 명령과 같은 길.
  const joined = await skill("@말해가계부 점심 오천원", MINA);
  ok(joined.text.includes("참여했어요") && joined.text.includes("저장했어요"), "구성원 첫 기록으로 참여·저장");
  for (const [label, legacy] of [["오늘기록", "오늘 기록 보기"], ["이번달요약", "이번 달 요약"], ["남은예산", "남은 예산"], ["단톡방연결", "단톡방 연결"], ["기록방법", "기록 방법"]]) {
    const a = await skill(`@말해가계부 ${label}`, MINA);
    const b = await skill(`@말해가계부 ${legacy}`, MINA);
    eq(a.result, "ok", `${label}: 정상 응답`);
    // 요약의 ‘상세 분석 보기’ 링크(maybeKakaoCta)는 한 번만 붙으므로 빼고 비교한다.
    const core = (text) => text.split("\n").filter((line) => !/https?:\/\//.test(line) && !line.includes("상세 분석 보기")).join(" ").replace(/\s+/g, " ").trim();
    eq(core(a.text), core(b.text), `${label} 와 ‘${legacy}’ 는 같은 답`);
  }
  for (const [label, expected] of [["도움말 보기", "hub"], ["도움말", "hub"], ["시작", "hub"], ["메뉴", "hub"], ["기록하기", "기록하는 법"], ["리포트보기", "리포트보기"], ["예산정하기", "예산정하기"], ["함께쓰기", "함께쓰기"], ["웹관리하기", "웹관리하기"], ["고치기", "고치기"], ["정기지출", "정기지출"]]) {
    const r = await skill(`@말해가계부 ${label}`, MINA);
    eq(r.result, "ok", `${label}: 정상 응답`);
    if (expected === "hub") assertHub(r, label);
    else eq(r.title, expected, `${label}: 설명서 ‘${expected}’ 화면`);
    ok(!JSON.stringify(r.body).includes("사용 설명서"), `${label}: ‘사용 설명서’ 워딩 없음`);
    const texts = r.buttons.filter((b) => b.action === "message").map((b) => b.label);
    ok(texts.every((t) => t.length <= 14 && !LONG_LABELS.test(t)), `${label}: 버튼 이름은 짧은 명령`);
  }
  const record = await skill("@말해가계부 기록하기", MINA);
  eq(JSON.stringify(record.labels), JSON.stringify(["오늘기록", "고치기", "도움말 보기", "기록하기"]), "기록 화면 버튼 순서(기록하기 맨 아래)");
  eq(record.buttons.at(-1).action, "mention", "기록 화면 맨 아래 기록하기는 멘션");
  eq(JSON.stringify((await skill("@말해가계부 리포트보기", MINA)).labels), JSON.stringify(["이번달요약", "오늘기록", "남은예산", "정산", "도움말 보기"]), "리포트보기 버튼");
  eq(JSON.stringify((await skill("@말해가계부 예산정하기", MINA)).labels), JSON.stringify(["예산설정", "남은예산", "정기지출", "도움말 보기"]), "예산정하기 버튼");
  eq(JSON.stringify((await skill("@말해가계부 함께쓰기", MINA)).labels), JSON.stringify(["친구 초대하기", "이름설정", "단톡방연결", "초대코드", "도움말 보기"]), "함께쓰기 버튼");
  eq(JSON.stringify((await skill("@말해가계부 웹관리하기", MINA)).labels), JSON.stringify(["웹가계부", "가계부만들기", "초대코드참여", "가계부전환", "도움말 보기"]), "웹관리하기 버튼");
  eq(JSON.stringify((await skill("@말해가계부 고치기", MINA)).labels), JSON.stringify(["오늘기록", "도움말 보기"]), "고치기 버튼");
  for (const [label, expectedText] of [["웹가계부", "웹 가계부"], ["가계부만들기", "어떤 용도로 쓸 가계부인가요?"], ["초대코드참여", "초대코드를 입력해 주세요."], ["이름설정", "표시할 내 이름을 입력해 주세요."], ["예산설정", "소유자 또는 관리자만"], ["정산", "정산"]]) {
    const r = await skill(`@말해가계부 ${label}`, MINA);
    eq(r.result, "ok", `${label}: 정상 응답`);
    ok(r.text.includes(expectedText), `${label}: 기존 명령과 같은 답(${expectedText})`);
    if (label === "이름설정" || label === "초대코드참여" || label === "가계부만들기") ok((await skill("@말해가계부 취소", MINA)).result === "ok", `${label}: 흐름 취소`);
  }

  // 4. 빈 결과: 두 기록을 지운 뒤 조회는 "아직 … 없어요" + 기록하기.
  ok((await skill("@말해가계부 삭제 01번", MINA)).text.includes("삭제했어요"), "구성원 기록 삭제");
  ok((await skill("@말해가계부 삭제 01번", OWNER)).text.includes("삭제했어요"), "소유자 기록 삭제");
  const emptyToday = await skill("@말해가계부 오늘기록", MINA);
  ok(emptyToday.text.includes("아직 기록이 없어요.\n지금 내역을 기록해 보세요."), "빈 오늘기록 안내");
  assertNextStepRecord(emptyToday, "빈 오늘기록");
  const emptyMonth = await skill("@말해가계부 이번달요약", MINA);
  ok(emptyMonth.text.includes("아직 이번 달 기록이 없어요."), "빈 이번달요약 안내");
  assertNextStepRecord(emptyMonth, "빈 이번달요약");
  const emptySummary = await skill("@말해가계부 요약", MINA);
  ok(emptySummary.text.includes("아직 이번 달 기록이 없어요."), "빈 요약 안내");
  assertNextStepRecord(emptySummary, "빈 요약");
  const emptyRecent = await skill("@말해가계부 최근", MINA);
  ok(emptyRecent.text.includes("아직 내가 기록한 내역이 없어요."), "빈 최근 안내");
  assertNextStepRecord(emptyRecent, "빈 최근");
  const emptySettlement = await skill("@말해가계부 정산", MINA);
  ok(emptySettlement.text.includes("아직 정산할 지출이 없어요.") && emptySettlement.text.includes("1/n 정산"), "빈 정산 안내");
  eq(JSON.stringify(emptySettlement.labels), JSON.stringify(["기록하기"]), "빈 정산: 기록하기 버튼");
  const memberBudget = await skill("@말해가계부 남은예산", MINA);
  ok(memberBudget.text.includes("아직 예산이 없어요.") && memberBudget.text.includes("주인·관리자가 ‘예산설정’으로"), "구성원 예산 없음 안내");
  eq(JSON.stringify(memberBudget.labels), JSON.stringify(["기록하기"]), "구성원 예산 없음: 기록하기만");
  const ownerBudget = await skill("@말해가계부 남은예산", OWNER);
  ok(ownerBudget.text.includes("예산을 정하고 지출을 기록하면 남은 예산을 바로 볼 수 있어요.") && ownerBudget.text.includes("이번 달 지출: 0원"), "소유자 예산 없음 안내");
  eq(JSON.stringify(ownerBudget.labels), JSON.stringify(["예산설정", "기록하기"]), "소유자 예산 없음: 예산설정 → 기록하기");
  ok(!ownerBudget.text.includes("단계별로 설정할 수 있어요"), "옛 예산 안내 문구 없음");

  // 5. 4초 예산 초과: 조회는 같은 명령 버튼, 기록은 확인 버튼. 옛 긴 문구 없음.
  f.env.KAKAO_RESPONSE_BUDGET_MS = "200";
  fetchDelayMs = 60;
  const deferredRead = await skill("@말해가계부 이번달요약", MINA);
  eq(deferredRead.result, "deferred", "느린 조회는 deferred");
  eq(deferredRead.text, "확인이 조금 늦어지고 있어요 😊\n잠시 뒤 ‘이번달요약’ 버튼을 눌러 다시 물어봐 주세요.", "조회 지연 답 두 줄");
  eq(JSON.stringify(deferredRead.labels), JSON.stringify(["이번달요약"]), "조회 지연 답: 같은 명령 버튼");
  const deferredRecord = await skill("@말해가계부 어제 커피 4500원", MINA);
  eq(deferredRecord.result, "deferred", "느린 기록은 deferred");
  ok(deferredRecord.text.startsWith("기록 저장 확인이 조금 늦어지고 있어요 😊\n같은 내용을 다시 보내지 말고 잠시 뒤 ‘"), "기록 지연 답은 중복 저장을 막는 안내");
  ok(/‘\d{4}-\d{2}-\d{2} 기록’에서 확인해 주세요\.$/.test(deferredRecord.text), "기록 지연 답은 입력한 날짜의 기록 명령을 가리킨다");
  eq(deferredRecord.labels.length, 1, "기록 지연 답: 확인 버튼 하나");
  ok(/^\d{4}-\d{2}-\d{2} 기록$/.test(deferredRecord.labels[0]), "확인 버튼 이름은 ‘YYYY-MM-DD 기록’");
  for (const r of [deferredRead, deferredRecord]) ok(!r.text.includes("요청은 받았어요") && !r.text.includes("실패가 확정되는 것은 아닙니다"), "옛 지연 문구 없음");
  // 14자를 넘는 말은 버튼 이름으로 잘라 보내지 않는다(단톡방 버튼은 이름이 곧 발화).
  fetchDelayMs = 120;
  const deferredLong = await skill("@말해가계부 이번 달 외식에 얼마나 썼는지 알려줘", MINA);
  eq(deferredLong.result, "deferred", "느린 긴 질문도 deferred");
  eq(deferredLong.text, "확인이 조금 늦어지고 있어요 😊\n잠시 뒤 같은 내용을 다시 보내 주세요.", "긴 질문의 지연 답은 잘린 버튼 대신 다시 보내기 안내");
  eq(JSON.stringify(deferredLong.labels), JSON.stringify(["도움말 보기"]), "긴 질문의 지연 답 버튼은 도움말 보기");
  fetchDelayMs = 0;
  delete f.env.KAKAO_RESPONSE_BUDGET_MS;
  const todayRecord = await skill("@말해가계부 커피 4500원", MINA);
  eq(todayRecord.result, "ok", "예산 안에서는 저장 답");
  ok((await skill("@말해가계부 2026-10-19 기록", MINA)).text.includes("2026-10-19 기록"), "‘YYYY-MM-DD 기록’ 버튼 문장은 날짜 목록 명령으로 읽힌다");

  // 6. 1:1: 도움말 보기 → 첫 화면(기록방법 버튼), 기록 화면에는 멘션 버튼이 없다.
  const privateHub = await skill("도움말 보기", OWNER, { group: false });
  eq(privateHub.title, "말해가계부 도움말", "1:1 도움말 보기 → 첫 화면");
  eq(JSON.stringify(privateHub.labels), JSON.stringify(["리포트보기", "예산정하기", "함께쓰기", "웹관리하기", "기록방법"]), "1:1 첫 화면 버튼(기록방법 맨 아래)");
  ok(privateHub.buttons.every((b) => b.action === "message"), "1:1 첫 화면은 메시지 버튼만");
  eq(privateHub.buttons.at(-2).messageText, "웹관리하기", "1:1 메시지 버튼은 이름을 그대로 보낸다");
  const privateRecord = await skill("기록하기", OWNER, { group: false });
  eq(JSON.stringify(privateRecord.labels), JSON.stringify(["오늘기록", "고치기", "도움말"]), "1:1 기록 화면: 도움말 이름, 멘션 버튼 없음");

  // 7. 번들 문자열: 옛 버튼 이름·옛 지연 문구가 없고 새 이름 대응표가 있다.
  const bundle = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  for (const gone of ['label: "챗봇 멘션하기"', '"지금 기록하기"', '["사용 설명서", "사용 설명서"]', '["오늘 기록 보기", "오늘 기록 보기"]', '["이번 달 요약", "이번 달 요약"]', '["남은 예산", "남은 예산"]', '["예산 설정", "예산 설정"]', '["기록 방법", "기록 방법"]', '["도움말", "도움말"]', "요청은 받았어요. 처리 결과 확인이 조금 늦어지고 있어요", "목록이 비어 있어도 이 요청의 실패가 확정되는 것은 아닙니다", 'title: "말해가계부 사용 설명서"']) {
    ok(!bundle.includes(gone), `번들에 옛 문자열 없음: ${gone}`);
  }
  // 카카오 응답 모듈의 안내문은 짧은 명령 이름만 쓴다(웹 안내 글은 이 판의 범위 밖).
  const kakaoDir = new URL("../src/modules/kakao/", import.meta.url);
  for (const file of readdirSync(kakaoDir).filter((name) => name.endsWith(".js"))) {
    const source = readFileSync(new URL(file, kakaoDir), "utf8");
    for (const gone of ["‘오늘 기록 보기’", "‘이번 달 요약’", "‘남은 예산’", "‘예산 설정’", "‘웹 가계부 열기’", "‘사용 설명서’", "‘새 가계부 만들기’", "‘내 이름 설정’"]) {
      ok(!source.includes(gone), `kakao/${file}: 안내문에 옛 명령 이름 없음 ${gone}`);
    }
  }
  for (const [label, command] of [["도움말 보기", "도움말"], ["오늘기록", "오늘 기록 보기"], ["이번달요약", "이번 달 요약"], ["남은예산", "남은 예산"], ["예산설정", "예산 설정"], ["웹가계부", "웹 가계부 열기"], ["이름설정", "내 이름 설정"], ["가계부만들기", "새 가계부 만들기"], ["초대코드참여", "초대코드로 참여"], ["단톡방연결", "단톡방 연결"], ["가계부전환", "가계부 전환"]]) {
    ok(bundle.includes(`"${label}": "${command}"`), `버튼 이름 대응표: ${label} → ${command}`);
  }
  ok(bundle.includes('const KAKAO_MANUAL_HOME = { messageText: "도움말", groupMessageText: "도움말 보기" }'), "설명서 홈 버튼: 1:1 도움말 / 단톡방 도움말 보기");
  ok(bundle.includes("function kakaoDeferredReply(") && bundle.includes("function kakaoNextStepReply("), "새 답 작성 함수가 번들에 있다");

  console.log(`V22.9.72 단톡방 피드백(짧은 버튼·다음 행동·지연 답) 검사 통과 (${checks} checks)`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
} finally {
  f.restore();
}
