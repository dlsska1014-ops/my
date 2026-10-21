import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { fixture, page, post, intercept, failure, formFields, withClock, BASE, app } from "./lib-audit-v22934.mjs";
import { budgetSummary, budgetFeedbackLine, budgetAlertText, moneyTokenSpans } from "../src/index.js";
import { createBudgetPlanContract } from "../src/modules/domain/budget-plan-contract.js";
import { normalizeText } from "../src/modules/nlu/amount-parser.js";

let checks = 0;
const records = [];
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };
const contract = createBudgetPlanContract(normalizeText, moneyTokenSpans);
const canonical = rows => rows.map(row => ({ household_id: row.household_id, month: row.month, category: row.category, amount: Number(row.amount) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const target = row => row.household_id === "house-home" && row.month === "2026-07";
const pair = (kind, entries) => entries.flatMap(([name, amount]) => [[kind === "income" ? "income_name" : "budget_category", name], [kind === "income" ? "income_amount" : "budget_amount", amount]]);
const writes = fx => fx.db.__rpc_calls.filter(row => row.name === "accountbook_replace_budget_plan_v227");
const preview = html => Object.fromEntries([...html.matchAll(/<output data-budget-total="(income|expense|net)"[^>]*>([^<]*)<\/output>/g)].map(m => [m[1], m[2]]));

// These values are independent literal expectations, not calls back into the
// implementation to derive expected rows or totals.
for (const [raw, expected] of [["",0],["  ",0],["0",0],["0원",0],["12",12],["1,000",1000],["12,345원",12345],["₩12,345",12345],["50만",500000],["1.5만원",15000],["1.5 만원",15000],["0.5천원",500],["0.29백원",29],["0.0001만원",1],["1만5천원",15000],["오십만원",500000],["2,000,000,000",2000000000]]) eq(contract.parseAmount(raw), expected, "exact budget won " + raw);
for (const raw of ["1e3","-10","+10","1.5","1.5원","1,,000",",1000","1000,","abc","1 000","Infinity","NaN","0x10","0.00001만원","9007199254740993"]) ok(Number.isNaN(contract.parseAmount(raw)), "invalid won stays invalid " + raw);

const tx = [["식비",1000],["외식",12000],["배달",13000],["편의점",2000],["장보기",9000],["카페/간식",5000],["교통",3000],["택시",8000],["주유/충전",7000],["차량관리",4000],["교통/차량",500]].map(([category, amount]) => ({ category, amount, type: "expense" }));
const aggregate = budgetSummary(tx, [{category:"식비",amount:100000},{category:"외식",amount:50000},{category:"교통/차량",amount:80000},{category:"교통",amount:10000},{category:"__total",amount:999999}]);
eq([aggregate.expense, aggregate.totalBudget, aggregate.budgetedExpense, aggregate.uncoveredExpense], [64500,240000,50500,14000], "overlapping budgets retain allocations and union expense");
eq(Object.fromEntries(aggregate.categoryAlerts.map(row => [row.category, row.spent])), {교통:3000,식비:28000,"교통/차량":22500,외식:12000}, "parent own transactions and child row usage");
// V22.9.75 감사 D-4: 예산이 권하는 시작 분류 ‘교통’ 한 줄만 있으면 교통 갈래(교통·택시·주유/충전·차량관리·옛 교통/차량)를 센다.
// 예전 기대값 3,000(교통만)은 권하는 대로 예산을 잡으면 택시·주유가 예산 밖으로 빠지던 D-4 결함이었다.
// 진짜 상위 행 교통/차량이 함께 있으면 교통은 하위 행으로 남는다(위의 {교통:3000} 기대값 그대로).
eq(budgetSummary(tx,[{category:"교통",amount:10000}]).budgetedExpense,22500,"교통 alone counts the transport family (D-4)");
eq(budgetSummary(tx,[{category:"교통",amount:10000},{category:"주유/충전",amount:10000}]).categoryAlerts.find(row => row.category === "교통").spent,15500,"교통 leaves a separately budgeted sibling to its own row (D-4)");
eq(budgetSummary(tx,[{category:"식비",amount:100000}]).budgetedExpense,28000,"food does not infer grocery or cafe membership");
eq(budgetSummary(tx,[{category:"외식",amount:50000}]).budgetedExpense,12000,"child-only membership");
eq(budgetSummary([{type:"expense",category:"/식비",amount:1},{type:"expense",category:"커스텀(1234)",amount:7},{type:"income",category:"식비",amount:999}], [{category:"식비",amount:100},{category:"커스텀",amount:20}]).budgetedExpense,8,"custom and normalized names share budget interpretation; income excluded");
ok(budgetFeedbackLine(tx,[{category:"식비",amount:20000}],"외식").includes("28,000원"),"Kakao feedback uses parent usage");
ok(budgetAlertText(tx,[{category:"식비",amount:20000}],"외식").includes("8,000원"),"Kakao alert uses parent usage");

const cases = [
  { label:"integer and units", income:[["급여","1,000"],["부수입","0.5천원"]], expense:[["외식","1.5만원"],["배달","50만"]], expected:[["__income:급여",1000],["__income:부수입",500],["외식",15000],["배달",500000]], totals:{income:"1,500원",expense:"515,000원",net:"-513,500원"} },
  { label:"income only", income:[["급여","12000"]], expense:[], expected:[["__income:급여",12000]], totals:{income:"12,000원",expense:"0원",net:"12,000원"} },
  { label:"expense only", income:[], expense:[["외식","100"]], expected:[["외식",100]], totals:{income:"0원",expense:"100원",net:"-100원"} },
  { label:"empty replacement", income:[], expense:[], expected:[], totals:{income:"0원",expense:"0원",net:"0원"} },
  { label:"identical duplicates", income:[["급여","100"],["급여","100"]], expense:[["외식","20"],["/외식","20"]], expected:[["__income:급여",100],["외식",20]], totals:{income:"100원",expense:"20원",net:"80원"} },
  { label:"different duplicate", income:[], expense:[["외식","100"],["/외식","200"]], error:"budget_duplicate_category" },
  { label:"namespaces", income:[["월급","100"]], expense:[["월급","50"],["income 월급","20"]], expected:[["__income:월급",100],["월급",50],["income 월급",20]], totals:{income:"100원",expense:"70원",net:"30원"} },
  { label:"blank and zero exclusion", income:[["급여","0"]], expense:[["외식","0"],["", "1000"],["   ",""],["배달","  "]], expected:[], totals:{income:"0원",expense:"0원",net:"0원"} },
  { label:"default income order", income:[["","100"],["","200"],["","300"],["","400"],["","500"]], expense:[], expected:[["__income:월급",100],["__income:상여/성과급",200],["__income:부수입",300],["__income:기타수입",400],["__income:수입5",500]], totals:{income:"1,500원",expense:"0원",net:"1,500원"} },
  { label:"truncated name collision", income:[["가".repeat(60)+"A","100"],["가".repeat(60)+"B","200"]], expense:[], error:"budget_duplicate_category" },
  { label:"truncated same amount", income:[["가".repeat(60)+"A","100"],["가".repeat(60)+"B","100"]], expense:[["나".repeat(81),"50"]], expected:[["__income:"+"가".repeat(60),100],["나".repeat(80),50]], totals:{income:"100원",expense:"50원",net:"50원"} },
  { label:"trim after income truncation",income:[["x".repeat(59)+" z","100"]],expense:[],expected:[["__income:"+"x".repeat(59),100]],totals:{income:"100원",expense:"0원",net:"100원"} },
  { label:"trim after expense truncation",income:[],expense:[["x".repeat(79)+" z","100"]],expected:[["x".repeat(79),100]],totals:{income:"0원",expense:"100원",net:"-100원"} },
  { label:"distinct canonically equivalent raw names",income:[],expense:[["é","100"],["e\u0301","100"]],expected:[["é",100],["e\u0301",100]],totals:{income:"0원",expense:"200원",net:"-200원"} },
  { label:"reversed canonically equivalent raw names",income:[],expense:[["e\u0301","100"],["é","100"]],expected:[["e\u0301",100],["é",100]],totals:{income:"0원",expense:"200원",net:"-200원"} },
  ...[["__income",72],["__total",73]].map(([name,length])=>({label:"reserved name after truncation "+name,income:[],expense:[[name+" ".repeat(length)+"x","100"]],error:"budget_reserved_category"})),
  ...["1e3","-10","1.5","1.5원","1,,000",",1000","1000,","abc","2000000001","9007199254740993"].map(raw => ({label:"invalid blank name "+raw,income:[],expense:[["",raw]],error:"invalid_budget_amount"})),
  ...["__total","__income","__income:월급"].map(name=>({label:"reserved expense "+name,income:[],expense:[[name,"10"]],error:"budget_reserved_category"})),
  {label:"raw cap",income:[],expense:Array.from({length:201},(_,i)=>["분류"+i,"0"]),error:"budget_input_too_many"},
  {label:"plan cap",income:[],expense:Array.from({length:101},(_,i)=>["분류"+i,"1"]),error:"budget_plan_too_many"},
  {label:"raw 200 with exclusions",income:[],expense:Array.from({length:200},(_,i)=>["외식",i?"0":"1"]),expected:[["외식",1]],totals:{income:"0원",expense:"1원",net:"-1원"}},
];

await withClock("2026-07-15", async () => {
  for (const path of ["/my/settings", "/budgets"]) {
    for (const item of cases) await fixture(async fx => {
      fx.db.accountbook_budgets.push({id:"other-month",household_id:"house-home",month:"2026-08",category:"外식",amount:33},{id:"other-house",household_id:"house-trip",month:"2026-07",category:"여행",amount:44});
      const before = structuredClone(fx.db.accountbook_budgets);
      const rendered = await page(fx,path+"?household_id=house-home&month=2026-07");
      if(item.label==="empty replacement"){
        eq([...rendered.html.matchAll(/<output\b[^>]*data-budget-total=[^>]*>/g)].map(match=>match[0].includes('aria-live="off"')),[true,true,true],"visible totals explicitly suppress implicit status announcements");
        eq((rendered.html.match(/data-budget-live role="status" aria-live="polite"/g)||[]).length,1,"only one dedicated budget live region batches announcements");
      }
      const original = formFields(rendered.html,"/my/budget-bulk/save").fields;
      const fields = new URLSearchParams([...original].filter(([key])=>!["income_name","income_amount","budget_category","budget_amount"].includes(key)));
      for(const [key,value] of [...pair("income",item.income),...pair("expense",item.expense)]) fields.append(key,value);
      const response = await post(fx,"/my/budget-bulk/save",fields);
      const error = new URL(response.location,BASE).searchParams.get("err");
      if(item.error){
        eq(error,item.error,path+" rejects "+item.label);
        eq(fx.db.accountbook_budgets,before,"refusal preserves the entire stored set");
        eq(writes(fx).length,0,"refusal makes zero plan writes");
        ok(response.text.includes("저장 전 미리보기"),"failure returns editable form instead of dropping edits");
        eq(formFields(response.text,"/my/budget-bulk/save").fields.getAll("budget_amount"),item.expense.map(row=>row[1]),"failed amount originals preserved");
        eq(formFields(response.text,"/my/budget-bulk/save").fields.get("plan_fingerprint"),original.get("plan_fingerprint"),"failure preserves original fingerprint");
      } else {
        eq(new URL(response.location,BASE).searchParams.get("msg"),"budget_saved",path+" saves "+item.label);
        eq(writes(fx).length,1,"normal save invokes replacement once");
        const expected = [...before.filter(row=>!target(row)),...item.expected.map(([category,amount])=>({household_id:"house-home",month:"2026-07",category,amount}))];
        eq(canonical(fx.db.accountbook_budgets),canonical(expected),"whole stored set matches explicit expected plan and preserved scopes");
        const after = await page(fx,path+"?household_id=house-home&month=2026-07");
        eq(preview(after.html),item.totals,"rerendered preview matches independently specified sums");
        ok(!fx.db.accountbook_budgets.filter(target).some(row=>["__total","__income"].includes(row.category)),"hidden legacy totals excluded from replacement");
      }
      records.push({page:path,case:item.label,submitted:[...fields],expected:item.expected,error,status:response.status,preview:preview(response.text),before,after:structuredClone(fx.db.accountbook_budgets),planWrites:writes(fx)});
    });
    await fixture(async fx => {
      const opened = await page(fx,path+"?household_id=house-home&month=2026-07");
      const fields = formFields(opened.html,"/my/budget-bulk/save").fields;
      fields.delete("income_amount");
      const before = structuredClone(fx.db.accountbook_budgets);
      const response = await post(fx,"/my/budget-bulk/save",fields);
      eq(new URL(response.location,BASE).searchParams.get("err"),"budget_input_shape","array mismatch is a new boundary refusal");
      eq(fx.db.accountbook_budgets,before,"array mismatch never clears existing plan");
      eq(writes(fx).length,0,"array mismatch has zero writes");
    });
    for(const injected of ["stale","strict-read","busy","write-failed","unknown","unconfirmed","post-read-failed"]) await fixture(async fx=>{
      const opened=await page(fx,path+"?household_id=house-home&month=2026-07");
      const fields=formFields(opened.html,"/my/budget-bulk/save").fields;
      const originalAmounts=fields.getAll("budget_amount");fields.delete("budget_amount");originalAmounts.forEach((amount,index)=>fields.append("budget_amount",index?amount:"76543"));
      const originalFingerprint=fields.get("plan_fingerprint"),before=structuredClone(fx.db.accountbook_budgets);
      if(injected==="stale")fx.db.accountbook_budgets.find(target).amount+=1;
      let sent=false,attempts=0;
      const restore=intercept(async({url,method,forward})=>{
        if(url.pathname.endsWith("/accountbook_claim_operation")&&injected==="busy")return new Response("false",{headers:{"content-type":"application/json"}});
        if(url.pathname==="/rest/v1/accountbook_budgets"&&method==="GET"&&(injected==="strict-read"||(injected==="post-read-failed"&&sent)))return failure();
        if(url.pathname.endsWith("/accountbook_replace_budget_plan_v227")){
          attempts++;sent=true;
          if(injected==="write-failed")return failure(400,"rejected write");
          if(injected==="unknown"){await forward();throw new TypeError("lost response after local commit");}
          if(injected==="unconfirmed")return new Response("{}",{headers:{"content-type":"application/json"}});
        }
      });
      let response;try{response=await post(fx,"/my/budget-bulk/save",fields);}finally{restore();}
      const expected={stale:"budget_changed","strict-read":"budget_read_failed",busy:"budget_busy","write-failed":"budget_save_failed",unknown:"db_write_unknown",unconfirmed:"db_write_unknown","post-read-failed":"db_write_unknown"}[injected];
      eq(new URL(response.location,BASE).searchParams.get("err"),expected,"failure kind "+injected);
      ok(response.status>=400,"failure is not a success response");
      eq(formFields(response.text,"/my/budget-bulk/save").fields.get("plan_fingerprint"),originalFingerprint,"failure never refreshes original fingerprint");
      eq(formFields(response.text,"/my/budget-bulk/save").fields.get("budget_amount"),"76543","raw edited amount preserved on "+injected);
      eq(attempts,["stale","strict-read","busy"].includes(injected)?0:1,"only an authorized fresh save attempts a write");
      if(["strict-read","busy","write-failed","unconfirmed"].includes(injected))eq(fx.db.accountbook_budgets,before,"noncommitted failure preserves complete rows");
      records.push({page:path,injected,submitted:[...fields],status:response.status,error:expected,attempts,before,after:structuredClone(fx.db.accountbook_budgets)});
    });
    await fixture(async fx=>{
      fx.db.accountbook_budgets=[{id:"total",household_id:"house-home",month:"2026-07",category:"__total",amount:999},{id:"income",household_id:"house-home",month:"2026-07",category:"__income",amount:888}];
      let rendered=await page(fx,path+"?household_id=house-home&month=2026-07");
      eq(preview(rendered.html),{income:"0원",expense:"0원",net:"0원"},"legacy-only totals and actual income are never hidden preview inputs");
      ok(rendered.html.includes("이전 총액 행은 이 미리보기에 포함하지 않습니다."),"legacy replacement consequence visible before submit");
      fx.db.accountbook_budgets.push({id:"typed",household_id:"house-home",month:"2026-07",category:"__income:급여",amount:100},{id:"one",household_id:"house-home",month:"2026-07",category:"커스텀(1234)",amount:200},{id:"two",household_id:"house-home",month:"2026-07",category:"커스텀",amount:300});
      rendered=await page(fx,path+"?household_id=house-home&month=2026-07");
      eq(formFields(rendered.html,"/my/budget-bulk/save").fields.getAll("budget_category"),["커스텀","커스텀(1234)"],"both normalized saved aliases remain editable");
      eq(preview(rendered.html),{income:"계산 보류",expense:"계산 보류",net:"계산 보류"},"existing conflicting saved aliases require explicit resolution");
    });
    if(path==="/budgets")await fixture(async fx=>{
      fx.db.accountbook_budgets=[{id:"one",household_id:"house-home",month:"2026-07",category:"custom",amount:100},{id:"two",household_id:"house-home",month:"2026-07",category:"custom(1234)",amount:1000}];
      fx.db.transactions=[{household_id:"house-home",transaction_date:"2026-07-15",type:"expense",category:"custom",amount:100}];
      const rendered=await page(fx,"/budgets?household_id=house-home&month=2026-07");
      const card=[...rendered.html.matchAll(/<article class="usageCard[^>]*>[\s\S]*?<\/article>/g)].map(match=>match[0]).find(html=>html.includes("custom(1234)"));
      ok(card?.includes("사용률 10%")&&!card.includes("isWarn"),"raw alias card uses its own 1000 allocation and 10 percent rate");
      ok(budgetFeedbackLine(fx.db.transactions,fx.db.accountbook_budgets,"custom(1234)").includes("(10%)"),"raw alias Kakao feedback uses its own denominator");
      eq(budgetAlertText(fx.db.transactions,fx.db.accountbook_budgets,"custom(1234)"),"","raw alias below threshold does not inherit another alias alert");
    });
  }
  for(const scenario of ["expired","member","tampered-house","invalid-month","missing-month","missing-house","csrf"])await fixture(async fx=>{
    const opened=await page(fx,"/budgets?household_id=house-home&month=2026-07");const fields=formFields(opened.html,"/my/budget-bulk/save").fields;
    const before=structuredClone(fx.db.accountbook_budgets);let cookie=fx.cookie;
    if(scenario==="expired")cookie="";
    if(scenario==="member")cookie=await fx.cookieFor("user-wifi");
    if(scenario==="tampered-house")fields.set("household_id","outside");
    if(scenario==="invalid-month")fields.set("month","2026-99");
    if(scenario==="missing-month")fields.delete("month");
    if(scenario==="missing-house")fields.delete("household_id");
    if(scenario==="csrf")await app.fetch(new Request(BASE+"/my/budget-bulk/save",{method:"POST",headers:{cookie,origin:"https://invalid.example","content-type":"application/x-www-form-urlencoded"},body:fields}),fx.env,{});
    else await post(fx,"/my/budget-bulk/save",fields,{cookie});
    eq(fx.db.accountbook_budgets,before,"scope/security rejection preserves all budgets "+scenario);
    eq(writes(fx).length,0,"scope/security rejection writes zero "+scenario);
  });
});

if(process.argv.includes("--out")){
  const out=resolve(process.argv[process.argv.indexOf("--out")+1]);mkdirSync(out,{recursive:true});
  writeFileSync(join(out,"server-budget-report.json"),JSON.stringify({node:process.version,sourceSha256:createHash("sha256").update(readFileSync(new URL("../src/index.js",import.meta.url))).digest("hex"),checks,records},null,2)+"\n");
}
console.log(`V22.9.52 D budget contract and server verification passed (${checks} checks)`);
