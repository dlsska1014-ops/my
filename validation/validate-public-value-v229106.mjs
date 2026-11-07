import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import app from '../src/index.js';
import { worksheetComputeV229106 as compute } from '../src/modules/public/worksheet-calculations.js';
import { PUBLIC_WORKSHEETS_V229106 as specs, publicWorksheetPathV229106 as worksheetPath } from '../src/modules/public/worksheet-pages.js';
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const bad = (fn, m) => { assert.throws(fn, undefined, m); checks++; };
const copy = (slug) => structuredClone(specs[slug].example);
const origin = 'https://malhaebook.com';
const request = (path, env = {}, method = 'GET') => app.fetch(new Request(origin + path, { method }), env, {});

const shared = compute('shared-living-cost-rules', copy('shared-living-cost-rules'));
eq(shared.total, 120001, 'source payment total');
eq(shared.methods.map((x) => x.shares), [[40001, 40000, 40000], [60001, 40000, 20000], [20000, 40000, 60001], [48001, 42000, 30000]], 'four independently calculated ratios and one-won remainder');
eq(shared.methods[0].transfers, [['C', 'A', 20000]], 'equal settlement');
const room = compute('roommate-shared-ledger', copy('roommate-shared-ledger'));
eq(room.daily, [60000, 30000], 'daily occupancy split'); eq(room.personDays, [54000, 36000], 'person-day split');
const cashInput = copy('cash-flow-table'); const cash = compute('cash-flow-table', cashInput);
eq([cash.cashIn, cash.livingOut, cash.savingOut, cash.net, cash.ending], [3050000,1400000,500000,1150000,2150000], 'cash flow under stated account scope');
cashInput.settings.accounts = 'A,B,S'; eq(compute('cash-flow-table', cashInput).ending,2650000,'adding zero-opening-balance savings account');
const sinking = compute('sinking-fund-annual-expenses', copy('sinking-fund-annual-expenses'));
eq(sinking.amounts,[300000,300000,300000],'three real deposit dates');
const closing = compute('monthly-closing-routine',copy('monthly-closing-routine'));
eq([closing.before,closing.after,closing.difference],[320000,280000,-40000],'duplicate and missing transaction reconciliation');
const sub = compute('subscription-cleanup',copy('subscription-cleanup'));
eq([sub.before,sub.after,sub.reduction],[9900,0,9900],'confirmed next-payment cancellation');
eq(sub.tables[0].rows[1][1],10000,'annual cost monthly equivalent is not a next-month charge');

// Conservation properties across participant counts, zero-weight members, one-won remainders and large amounts.
// Expected totals and settlement balances are computed from the input payments, independently of output tables.
for (let n=1;n<=12;n++) for (let seed=1;seed<=25;seed++) {
  const people=Array.from({length:n},(_,i)=>({name:`P${i}`,income:(i+seed)%7,use:(i*3+seed)%11,agreed:i+1}));
  if (!people.some(p=>p.income)) people[0].income=1;
  if (!people.some(p=>p.use)) people[0].use=1;
  const amount=seed===25 ? 1000000000000 : seed*101+1;
  const input={people,transactions:[{payer:'P0',amount,participants:people.map(p=>p.name).join(',')}]};
  const result=compute('shared-living-cost-rules',input);
  eq(result.total,amount,`payment conservation ${n}/${seed}`);
  for (const method of result.methods) {
    eq(method.shares.reduce((a,b)=>a+b,0),amount,'allocated total');
    ok(method.shares.every(x=>Number.isSafeInteger(x)&&x>=0),'nonnegative integer shares');
    eq(method.net.reduce((a,b)=>a+b,0),0,'zero-sum balances');
    const residual=[...method.net];
    for (const [from,to,value] of method.transfers) {
      ok(value>0&&Number.isSafeInteger(value)&&from!==to,'valid transfer');
      residual[people.findIndex(p=>p.name===from)]+=value;
      residual[people.findIndex(p=>p.name===to)]-=value;
    }
    eq(residual,people.map(()=>0),'transfers close every balance');
  }
}

{
 const s=copy('shared-living-cost-rules'); s.transactions=[{payer:'A',amount:1,participants:'A,B'}];
 eq(compute('shared-living-cost-rules',s).methods[0].shares,[1,0,0],'nonparticipants do not pay; stable tie order');
 s.transactions.push({payer:'A',amount:1,participants:'B,A'});
 eq(compute('shared-living-cost-rules',s).methods[0].shares,[1,1,0],'round after grouping same participants');
 s.people[1].name='A';bad(()=>compute('shared-living-cost-rules',s),'duplicate people rejected');
}
{
 const s=copy('roommate-shared-ledger'); s.people.forEach(p=>{p.start='2026-11-11';p.end='2026-11-21';});
 const out=compute('roommate-shared-ledger',s);eq(out.vacantDays,20,'empty days');eq(out.unassigned,60000,'vacant cost not hidden');eq(out.daily,[15000,15000],'occupied days');
 s.people[0].end=s.people[0].start;bad(()=>compute('roommate-shared-ledger',s),'exclusive end must follow start');
}
{
 const s=copy('sinking-fund-annual-expenses');s.settings.target=100000;s.settings.saved=0;
 eq(compute('sinking-fund-annual-expenses',s).amounts,[33334,33333,33333],'integer deposit remainder');
 s.dates=[];eq(compute('sinking-fund-annual-expenses',s).shortage,100000,'no dates remains explicit shortage');
 s.settings.status='paid';eq(compute('sinking-fund-annual-expenses',s).need,0,'paid item does not request deposits');
 s.settings.status='saving';s.settings.saved=120000;eq(compute('sinking-fund-annual-expenses',s).excess,20000,'overfunding');
 s.dates=[{date:'2026-02-30'}];bad(()=>compute('sinking-fund-annual-expenses',s),'invalid calendar date');
}
{
 const s=copy('monthly-closing-routine');s.transactions[1].amount=-79000;bad(()=>compute('monthly-closing-routine',s),'conflicting same-ID amount');
 s.transactions[1].id='different';eq(compute('monthly-closing-routine',s).after,201000,'same-day different-ID transaction retained');
}
{
 const s=copy('subscription-cleanup');s.subscriptions[0].cancel='requested';
 eq(compute('subscription-cleanup',s).after,9900,'request alone does not cancel payment');
 s.subscriptions[0].cancel='confirmed';s.subscriptions[0].confirmed='2026-11-20';bad(()=>compute('subscription-cleanup',s),'future confirmation cannot be assumed');
 s.settings.basis='2026-11-20';s.subscriptions[0].until='2026-11-20';eq(compute('subscription-cleanup',s).after,9900,'same-day cancellation does not erase charge');
}
{
 const s=copy('subscription-cleanup');
 s.subscriptions[0].next='2026-11-04';
 for (const state of ['active','requested']) {
  s.subscriptions[0].cancel=state;
  bad(()=>compute('subscription-cleanup',s),'past next payment needs a verified future date: '+state);
 }
 s.subscriptions[0].cancel='confirmed';s.subscriptions[0].confirmed='2026-11-03';
 eq(compute('subscription-cleanup',s).after,0,'previously cancelled past renewal stays closed');
}
for (const value of ['', '-1','1.5','Infinity','1e3','1000000000001']) {
 const s=copy('cash-flow-table');s.transactions[0].amount=value;bad(()=>compute('cash-flow-table',s),'strict monetary input '+value);
}

const realFetch=globalThis.fetch;let outbound=0;
globalThis.fetch=async()=>{outbound++;throw new Error('unexpected outbound request');};
try {
 for (const [slug,spec] of Object.entries(specs)) {
  const path=worksheetPath(slug);
  const res=await request(path);eq(res.status,200,path+' GET');const html=await res.text();
  eq(res.headers.get('x-robots-tag'),'noindex, follow','worksheet not indexed');
  ok(res.headers.get('content-security-policy')?.includes("connect-src 'none'"),'worksheet network prohibited');
  ok(!/googlesyndication|adsbygoogle|kakaocdn|gtag|google-analytics|<script[^>]+src=/i.test(html),'no external runtime');
  ok(html.includes(spec.title)&&html.includes('결과 계산')&&html.includes('CSV'),'readable standalone controls');
  for(const script of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
  const head=await request(path,{},'HEAD');eq(head.status,200,'worksheet HEAD');eq(await head.text(),'','HEAD empty');
  const download=await request(path+'?download=1');ok(download.headers.get('content-disposition')?.startsWith('attachment;'),'offline file download');eq(await download.text(),html,'download same executable worksheet');
  eq((await request(path,{},'POST')).status,404,'worksheet has no write route');
  const article=await(await request('/'+slug)).text();ok(article.includes(path)&&article.includes('원본(가상 데이터)'),'article exposes original data and worksheet');
  const ld=JSON.parse(article.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);ok(!('wordCount' in ld),'Hangul character count not mislabeled as words');
  for (const env of [{ADS_MODE:'live',ADS_SLOT_CONTENT:'1234567890'},{ADS_MODE:'adfit',ADFIT_UNIT_CONTENT:'DAN-test123456',ADFIT_UNIT_SIZE:'320x100'}]) {
   const active=await(await request('/'+slug,env)).text();
   const body=active.match(/<script data-ad-activation>([\s\S]*?)<\/script>/)?.[1];ok(body,'activation script exists');
   const listeners=new Map();const loaded=[];const slot={hidden:true,style:{},appendChild(el){loaded.push(el);}};
   const doc={prerendering:true,visibilityState:'hidden',readyState:'complete',querySelector:()=>slot,createElement:()=>({addEventListener(){}}),addEventListener(k,fn){listeners.set(k,fn);},removeEventListener(k){listeners.delete(k);}};
   const win={location:{href:origin+'/'+slug}};vm.runInNewContext(body,{document:doc,window:win});eq(loaded.length,0,'prerender no SDK');eq(slot.hidden,true,'prerender ad box stays hidden');eq(win.adsbygoogle?.length??0,0,'prerender no queue');
   doc.prerendering=false;listeners.get('prerenderingchange')?.();eq(loaded.length,0,'hidden no SDK');doc.visibilityState='visible';listeners.get('visibilitychange')?.();eq(loaded.length,1,'visible one SDK');eq(slot.hidden,false,'active ad box becomes visible');
   listeners.get('visibilitychange')?.();eq(loaded.length,1,'no duplicate SDK');eq(win.adsbygoogle?.length??0,env.ADS_MODE==='live'?1:0,'one selected-network queue');
   for (const href of [origin+'/'+slug+'#synthetic', 'https://preview.example.test/'+slug]) {
    let extraLoads=0;const hiddenSlot={hidden:true,style:{},appendChild(){extraLoads++;}};
    const visibleDoc={...doc,prerendering:false,visibilityState:'visible',querySelector:()=>hiddenSlot};
    vm.runInNewContext(body,{document:visibleDoc,window:{location:{href}}});
    eq(extraLoads,0,'fragment and preview host cannot start SDK');eq(hiddenSlot.hidden,true,'excluded URL keeps ad box hidden');
   }
   const query=await(await request('/'+slug+'?email=synthetic%40example.test',env)).text();ok(!query.includes('data-ad-activation')&&!query.includes('class="adsbygoogle"')&&!query.includes('class="kakao_ad_area"'),'input query excludes ads');
   const offline=await(await request(path,env)).text();eq(offline,html,'worksheet independent of ad mode');
  }
 }
 eq(outbound,0,'public tools make no server-side external requests');
} finally {globalThis.fetch=realFetch;}
const runtime=readFileSync(new URL('../src/modules/public/worksheet-runtime.js',import.meta.url),'utf8');
ok(!/\b(?:fetch|localStorage|sessionStorage|XMLHttpRequest)\b/.test(runtime),'worksheet never stores or uploads inputs');
ok(runtime.includes('textContent')&&!runtime.includes('innerHTML'),'values rendered as text');
console.log(`V22.9.106 public value, calculation and activation checks passed (${checks} checks)`);
