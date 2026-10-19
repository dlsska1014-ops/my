import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : "";
const root = resolve(option("--repo") || fileURLToPath(new URL("../", import.meta.url)));
const { fixture, page, post, formFields, withClock, intercept } = await import(pathToFileURL(join(root, "validation/lib-audit-v22934.mjs")));
const { budgetPlanFingerprint: fingerprint } = await import(pathToFileURL(join(root, "src/modules/domain/budgets.js")));
const report = { node: process.version, sourceSha256: createHash("sha256").update(readFileSync(join(root, "src/index.js"))).digest("hex"), checks: [], records: [] };
function eq(actual, expected, label) {
  let passed = true; try { assert.deepEqual(actual, expected); } catch { passed = false; }
  report.checks.push({ label, passed, ...(!passed ? { actual, expected } : {}) });
}
const digest = literal => "p2-" + createHash("sha256").update(literal).digest("hex");
const row = (category, amount) => ({ category, amount, id: category, household_id: "house-home", month: "2026-07" });
const action = "/my/budget-bulk/save";
const fieldsFor = (original, income, expense) => {
  const fields = new URLSearchParams([...original].filter(([key]) => !["income_name", "income_amount", "budget_category", "budget_amount"].includes(key)));
  for (const [name, amount] of income) { fields.append("income_name", name); fields.append("income_amount", amount); }
  for (const [name, amount] of expense) { fields.append("budget_category", name); fields.append("budget_amount", amount); }
  return fields;
};
const writes = fx => fx.db.__rpc_calls.filter(item => item.name === "accountbook_replace_budget_plan_v227").length;
const stored = fx => fx.db.accountbook_budgets.map(item => [item.category, item.amount]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
function preserved(response, fields, label) {
  const rendered = formFields(response.text, action);
  eq(rendered.found, true, label + " failure remains editable");
  for (const key of ["income_name", "income_amount", "budget_category", "budget_amount", "plan_fingerprint"]) eq(rendered.fields.getAll(key), fields.getAll(key), label + " preserves raw " + key);
  eq(response.text.includes("최신 저장 계획 다시 열기"), true, label + " explicit reconciliation link");
}

// Independent literal JSON oracles fix the wire contract, rather than using the
// implementation's canonicalizer to calculate its own expected hashes.
eq(await fingerprint([]), digest("[]"), "empty plan has a SHA-256 p2 fingerprint");
eq(await fingerprint([row("__income:월급", 100)]), digest('[["income","__income:월급","1e2"]]'), "income literal oracle");
eq(await fingerprint([row("income 월급", "100")]), digest('[["expense","income 월급","1e2"]]'), "expense namespace literal oracle");
eq(await fingerprint([row("__total", 0), row("__income", 100), row("__income:월급", 100)]), digest('[["income-total","__income","1e2"],["income","__income:월급","1e2"],["total","__total","0"]]'), "special totals and zero rows in exact canonical form");
for (const value of [100, "100", "0100.00", "1e2", "+100.000", "1000e-1"]) eq(await fingerprint([row("x", value)]), digest('[["expense","x","1e2"]]'), "equivalent decimal " + value);
for (const value of [0, -0, "0", "-0.000e200"]) eq(await fingerprint([row("x", value)]), digest('[["expense","x","0"]]'), "equivalent zero " + value);
for (const value of [0.1, "0.10", "1e-1"]) eq(await fingerprint([row("x", value)]), digest('[["expense","x","1e-1"]]'), "equivalent fraction " + value);
for (const [a, b] of [["100.00000000000000001",100],["9007199254740993","9007199254740992"],[100.1,100.2],[-1,1],["1e100000","1e100001"]]) eq((await fingerprint([row("x",a)])) !== (await fingerprint([row("x",b)])), true, "distinct exact amounts " + a + "/" + b);
for (const [a,b] of [["x"," x"],["x","x "],["x","/x"],["x|y=1","x|y"],["é","e\u0301"],["가","가"],[""," "],["__income:월급","income 월급"],["__income","__total"]]) eq((await fingerprint([row(a,100)])) !== (await fingerprint([row(b,100)])), true, "raw names remain distinct " + JSON.stringify([a,b]));
const unordered = [row("é", 100),row("e\u0301",100),row("__total",0),row("",1),row("é",100)];
eq(await fingerprint(unordered), await fingerprint([...unordered].reverse()), "ordinal row order independence including duplicates and collation ties");
eq(await fingerprint([row("x",100)]), await fingerprint([{...row("x","100"),id:"different",created_at:"future",household_id:"another",month:"2026-08"}]), "metadata excluded");
for (const extra of [row("x",100),row("x",0),row("__total",0),row("__income",0)]) eq((await fingerprint([row("x",100)])) !== (await fingerprint([row("x",100),extra])), true, "extra stored row is never filtered " + JSON.stringify(extra));
for (const invalid of [undefined,null,{},[null],new Array(1),[row(null,1)],[row(7,1)],[row("x",null)],[row("x",undefined)],[row("x","")],[row("x"," ")],[row("x",NaN)],[row("x",Infinity)],[row("x",{})],[row("x",true)],[row("x","0x10")],[row("x","100\n")]]) {
  let rejected=false;try{await fingerprint(invalid);}catch{rejected=true;}eq(rejected,true,"uninterpretable stored state rejects " + JSON.stringify(invalid));
}

await withClock("2026-07-15", async () => {
  for (const path of ["/my/settings","/budgets"]) {
    const url = path + "?household_id=house-home&month=2026-07";
    for (const mode of ["rename-namespace","swap-namespaces"]) await fixture(async fx => {
      fx.db.accountbook_budgets = [row("__income:월급",100),...(mode === "swap-namespaces" ? [row("income 월급",200)] : [])];
      const openedA = formFields((await page(fx,url)).html, action).fields;
      const openedB = formFields((await page(fx,url)).html, action).fields;
      const before = structuredClone(fx.db.accountbook_budgets);
      const fresh = fieldsFor(openedB, mode === "swap-namespaces" ? [["월급","200"]] : [], [["income 월급","100"]]);
      const responseB = await post(fx,action,fresh);
      const afterB = structuredClone(fx.db.accountbook_budgets), firstWrites = writes(fx);
      const reopened = formFields((await page(fx,url)).html,action).fields;
      eq(responseB.status,303,path+" "+mode+" first save succeeds");
      eq(firstWrites,1,"first save replaces exactly once");
      eq(stored(fx),mode === "swap-namespaces" ? [["__income:월급",200],["income 월급",100]] : [["income 월급",100]],"first saved whole row set equals literal expectation");
      eq(openedA.get("plan_fingerprint") !== reopened.get("plan_fingerprint"),true,"changed namespace content changes fingerprint");
      const stale = fieldsFor(openedA,[["월급","100"]],[...(mode === "swap-namespaces" ? [["income 월급","200"]] : []),[" 외식 "," 10 "]]);
      const responseA = await post(fx,action,stale);
      eq(responseA.status,409,"stale form returns 409");
      eq(new URL(responseA.location,"https://malhaebook.com").searchParams.get("err"),"budget_changed","stale p2 classified changed");
      eq(writes(fx)-firstWrites,0,"stale form makes zero additional replacement calls");
      eq(fx.db.accountbook_budgets,afterB,"first saved whole rows survive stale form");
      preserved(responseA,stale,path+" "+mode);
      report.records.push({path,mode,before,first:{submitted:[...fresh],status:responseB.status,rows:afterB,writes:firstWrites},stale:{submitted:[...stale],status:responseA.status,location:responseA.location,rows:structuredClone(fx.db.accountbook_budgets),additionalWrites:writes(fx)-firstWrites},fingerprints:[openedA.get("plan_fingerprint"),reopened.get("plan_fingerprint")]});
    });
    for (const token of ["p1-13-4eddeb7f","","p2-invalid","p2-"+"0".repeat(64),"p2-"+"A".repeat(64)," p2-"+"0".repeat(64),"p2-"+"0".repeat(64)+"\n"]) await fixture(async fx => {
      const fields=fieldsFor(formFields((await page(fx,url)).html,action).fields,[[" 월급 "," 100 "]],[["외식","10"]]);
      if(token)fields.set("plan_fingerprint",token);else fields.delete("plan_fingerprint");
      const before=structuredClone(fx.db.accountbook_budgets),response=await post(fx,action,fields);
      eq(response.status,409,"token refusal status " + JSON.stringify(token));
      eq(new URL(response.location,"https://malhaebook.com").searchParams.get("err"),token==="p2-"+"0".repeat(64)?"budget_changed":"budget_form_stale","strict version/format classification");
      eq(writes(fx),0,"rejected token has no replacement");eq(fx.db.accountbook_budgets,before,"rejected token preserves rows");
      if(!token)fields.set("plan_fingerprint","");
      preserved(response,fields,"token refusal");
      report.records.push({path,token,submitted:[...fields],status:response.status,location:response.location,writes:writes(fx),before,after:structuredClone(fx.db.accountbook_budgets)});
    });
    for (const state of ["reordered","number-string","empty","zero-special"]) await fixture(async fx => {
      fx.db.accountbook_budgets = state==="empty" ? [] : state==="zero-special" ? [row("zero",0),row("__total",17),row("__income",19)] : [row("x",100),row("y",200)];
      const fields=fieldsFor(formFields((await page(fx,url)).html,action).fields,[],[["외식","50"]]);
      if(state==="reordered")fx.db.accountbook_budgets.reverse();
      if(state==="number-string")fx.db.accountbook_budgets.forEach(item=>{item.amount=String(item.amount);});
      const response=await post(fx,action,fields);
      eq(response.status,303,"fresh p2 save " + state);eq(writes(fx),1,"fresh p2 replaces once " + state);eq(stored(fx),[["외식",50]],"fresh p2 stores literal complete plan " + state);
    });
    for (const fault of ["malformed-row","malformed-amount","digest"]) await fixture(async fx => {
      const fields=fieldsFor(formFields((await page(fx,url)).html,action).fields,[],[["외식","50"]]);
      const before=structuredClone(fx.db.accountbook_budgets);
      const originalDigest=crypto.subtle.digest;
      let restore=()=>{};
      if(fault==="digest")crypto.subtle.digest=function(algorithm,data){if(new TextDecoder().decode(data).startsWith("[["))return Promise.reject(new Error("synthetic digest failure"));return originalDigest.call(this,algorithm,data);};
      else restore=intercept(({url,method})=>url.pathname.endsWith("/accountbook_budgets")&&method==="GET"?new Response(JSON.stringify(fault==="malformed-row"?[null]:[row("x",null)]),{headers:{"content-type":"application/json"}}):null);
      try{
        const get=await page(fx,url);
        eq(get.status,200,"read failure page stays available " + fault);eq(formFields(get.html,action).found,false,"invalid stored state does not issue empty-plan form " + fault);
        const response=await post(fx,action,fields);
        eq(response.status,503,"invalid stored state save is unavailable " + fault);eq(new URL(response.location,"https://malhaebook.com").searchParams.get("err"),"budget_read_failed","read and digest failure classified safely");
        eq(writes(fx),0,"invalid stored state has no replacement");eq(fx.db.accountbook_budgets,before,"invalid stored state preserves all rows");preserved(response,fields,fault);
      }finally{restore();crypto.subtle.digest=originalDigest;}
    });
  }
});
report.failures=report.checks.filter(item=>!item.passed);report.total=report.checks.length;
if(option("--out")){const out=resolve(option("--out"));mkdirSync(out,{recursive:true});writeFileSync(join(out,"fingerprint-report.json"),JSON.stringify(report,null,2)+"\n");}
console.log(`V22.9.53 budget fingerprint verification ${report.failures.length ? "FAILED" : "passed"} (${report.total} checks); ${report.failures.length} failures`);
if(report.failures.length){console.error(JSON.stringify(report.failures.slice(0,12),null,2));process.exitCode=1;}
