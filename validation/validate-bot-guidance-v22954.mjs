import {createHash} from "node:crypto";
import {counter,fixture,putSetting,withClock,skill} from "./lib-audit-v22934.mjs";
import {AB_KAKAO_REPEAT_GUARD,AB_KAKAO_INFLIGHT} from "../src/modules/runtime/ops-telemetry.js";
import {kakaoBudgetGuideText} from "../src/modules/kakao/reply-texts.js";
import {kakaoStartText,kakaoUnlinkedGroupStartText} from "../src/modules/kakao/household-budget-commands.js";
const {ok,eq,deepEq,done}=counter("BOT parsing and guidance V22.9.54");
globalThis.fetch=async()=>{throw new Error("External fetch forbidden");};
const sha=value=>createHash("sha256").update(value).digest("hex");
await withClock("2026-10-15",async()=>{
  for(const [text,type,amount,memo] of [
    ["결제 취소 36000원",null,0],
    ["쿠팡 환불 완료 34000원","income",34000],
    ["환불 수수료 5000원","expense",5000],
    ["환불 배송비 3000원","expense",3000],
    ["월급 250만원","income",2500000],
    ["용돈 지급 50000원","expense",50000],
    ["용돈 받음 50000원","income",50000],
    ["정산마트 5000원","expense",5000,"정산마트"],
    ["기록상점 5001원","expense",5001,"기록상점"],
    ["요약식당 5002원","expense",5002,"요약식당"],
    ["예산마트 5003원","expense",5003,"예산마트"],
    ["2026-10-03 정산마트 5004원 현금","expense",5004,"정산마트"],
    ["기록 정산마트 5005원 현금","expense",5005,"정산마트"],
  ]) await fixture(async fx=>{
    AB_KAKAO_REPEAT_GUARD.clear();AB_KAKAO_INFLIGHT.clear();
    fx.db.transactions=[];putSetting(fx,"kakao_selected_household_v2251:user-bin","house-home");
    const reply=await skill(fx,text);
    eq(fx.db.transactions.length,type?1:0,"actual stored count "+text);
    if(type){const row=fx.db.transactions[0];deepEq([row.type,row.amount],[type,amount],"type and amount "+text);if(memo)eq(row.memo,memo,"merchant boundary "+text);ok(row.raw_text.includes(memo||text.split(" ")[0]),"business raw preserved "+text);}
    else ok(reply.includes("구분을 명시"),"ambiguous cancellation requests explicit type");
  });
  await fixture(async fx=>{
    fx.db.transactions=[];putSetting(fx,"kakao_selected_household_v2251:user-bin","house-home");
    await skill(fx,"회귀카페 5006원 현금");await skill(fx,"수정 01번");
    const reply=await skill(fx,"취소");eq(fx.db.transactions.length,1,"cancel active edit does not add/delete transaction");ok(/취소|종료/.test(reply),"active edit cancelled");
    await skill(fx,"수정 01번 내용 내일도 정산마트");eq(fx.db.transactions[0].memo,"내일도 정산마트","explicit user memo is preserved");
  });
});
ok(kakaoBudgetGuideText().includes("외식 예산설정"),"new budget example canonical");
for(const text of [kakaoStartText(false),kakaoStartText(true),kakaoUnlinkedGroupStartText([],"https://example.test")]){
  ok(!/https?:\/\//.test(text),"entry guidance has no long URL");ok(text.length<650,"entry guidance stays concise");
}
ok(kakaoStartText(false).includes("첫 기록"),"personal entry explains first record");
// V22.9.65: 도움말은 버튼형 설명서로 바뀌었다(validate-manual-guides-v22965). 외부 참여 안내는 시작·미연결 안내에 남는다.
ok(/초대코드(로 )?참여/.test(kakaoStartText(false))&&kakaoUnlinkedGroupStartText([],"https://example.test").includes("초대코드"),"external participation explanation retained");
await fixture(async fx=>{
  fx.db.transactions=[{id:"food",household_id:"house-home",user_id:"user-bin",transaction_date:"2026-10-10",type:"expense",amount:20000,category:"외식"}];
  fx.db.accountbook_budgets=[{household_id:"house-home",month:"2026-10",category:"식비",amount:100000}];
  putSetting(fx,"kakao_selected_household_v2251:user-bin","house-home");
  const old=globalThis.__AB_QA_FIXED_NOW_MS;globalThis.__AB_QA_FIXED_NOW_MS=Date.parse("2026-10-15T12:00:00+09:00");
  try{const reply=await skill(fx,"남은 예산");ok(reply.includes("80,000원")&&reply.includes("20,000원"),"legacy food budget remains actual data response");}finally{globalThis.__AB_QA_FIXED_NOW_MS=old;}
});
done();
