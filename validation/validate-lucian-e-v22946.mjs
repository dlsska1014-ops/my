import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import app, {buildReportChallenge,renderReportChallenge} from '../src/index.js';
import {buildReportChallengeForHousehold} from '../src/modules/my/report-challenge.js';
import {parseModule} from '../tools/worker-analysis.mjs';
import {createV2265QaFixture} from './qa-fixture.mjs';
let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;};
const eq=(value,expected,label)=>{assert.equal(value,expected,label);checks++;};
const origin='https://malhaebook.com';
const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const ast=parseModule(source);
const functionSource=name=>{const node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(node,name);return source.slice(node.start,node.end);};

// A small DOM implements only the standards used by these serialized functions.
// It runs the actual assets, including delayed/rejected goal writes, without Chrome in CI.
function browser({reduced=false,storageValues={},pathname='/app',search=''}={}){
  const observers=[],timers=new Map(),frames=new Map();let seq=0;
  const listeners=()=>new Map();
  const add=(el,type,fn)=>{if(!el.events.has(type))el.events.set(type,new Set());el.events.get(type).add(fn);};
  const fire=(el,type,data={})=>{for(const fn of [...(el.events.get(type)||[])])fn({target:el,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...data});};
  class Text {
    constructor(value){this.nodeType=3;this.textContent=value;this.parentElement=null;}
    replaceWith(frag){const parent=this.parentElement,index=parent.childNodes.indexOf(this);parent.childNodes.splice(index,1);for(const child of [...frag.childNodes].reverse()){parent.childNodes.splice(index,0,child);child.parentElement=parent;}this.parentElement=null;}
  }
  class Element {
    constructor(tag){this.nodeType=1;this.tagName=tag.toUpperCase();this.childNodes=[];this.parentElement=null;this.attrs=new Map();this.events=listeners();this.style={getPropertyValue:()=> '#2563eb',setProperty(key,v){this[key]=v;}};this.hidden=false;this.value='';this.classList={contains:c=>this.className.split(' ').includes(c),add:c=>{if(!this.classList.contains(c))this.className=(this.className+' '+c).trim();},remove:c=>{this.className=this.className.split(' ').filter(v=>v!==c).join(' ');},toggle:(c,v)=>v?this.classList.add(c):this.classList.remove(c)};}
    get className(){return this.getAttribute('class')||'';}set className(v){this.setAttribute('class',v);}
    get id(){return this.getAttribute('id');}set id(v){this.setAttribute('id',v);}
    get href(){return new URL(this.getAttribute('href')||'',origin).href;}
    get children(){return this.childNodes.filter(n=>n.nodeType===1);}
    get isConnected(){return this===html||!!this.parentElement?.isConnected;}
    get textContent(){return this.childNodes.map(n=>n.textContent).join('');}
    set textContent(v){this.childNodes.forEach(n=>n.parentElement=null);this.childNodes=[];if(String(v))this.appendChild(new Text(String(v)));}
    set innerHTML(value){this.textContent='';const stack=[this];for(const token of value.match(/<[^>]+>|[^<]+/g)||[]){if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const m=token.match(/^<([\w-]+)/);if(!m)continue;const el=new Element(m[1]);const attrs=token.slice(m[0].length,-1);for(const a of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))el.setAttribute(a[1],a[2]||'');stack.at(-1).appendChild(el);if(!/\/$/.test(attrs)&&!['input','br','hr'].includes(m[1]))stack.push(el);}else stack.at(-1).appendChild(new Text(token));}}
    appendChild(el){if(el.tagName==='#FRAGMENT'){for(const child of [...el.childNodes])this.appendChild(child);return el;}el.parentElement?.childNodes.splice(el.parentElement.childNodes.indexOf(el),1);this.childNodes.push(el);el.parentElement=this;return el;}
    prepend(el){this.appendChild(el);this.childNodes.unshift(this.childNodes.pop());}
    remove(){if(this.parentElement){this.parentElement.childNodes.splice(this.parentElement.childNodes.indexOf(this),1);this.parentElement=null;}}
    replaceWith(node){const parent=this.parentElement,index=parent.childNodes.indexOf(this);parent.childNodes.splice(index,1,node);node.parentElement=parent;this.parentElement=null;}
    setAttribute(k,v){this.attrs.set(k,String(v));}getAttribute(k){return this.attrs.get(k)??null;}hasAttribute(k){return this.attrs.has(k);}removeAttribute(k){this.attrs.delete(k);}toggleAttribute(k,on){if(on)this.setAttribute(k,'');else this.removeAttribute(k);}
    matches(selector){return selector.split(',').some(raw=>{const s=raw.trim();const split=s.lastIndexOf(' ');if(split>=0)return this.matches(s.slice(split+1))&&!!this.parentElement?.closest(s.slice(0,split));const tag=s.match(/^[\w-]+/);if(tag&&tag[0].toUpperCase()!==this.tagName)return false;for(const c of s.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(c[1]))return false;const id=s.match(/#([\w-]+)/);if(id&&this.id!==id[1])return false;for(const a of s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(!this.hasAttribute(a[1])||(a[2]!==undefined&&this.getAttribute(a[1])!==a[2]))return false;return true;});}
    closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}
    querySelectorAll(s){return this.children.flatMap(el=>[...(el.matches(s)?[el]:[]),...el.querySelectorAll(s)]);}querySelector(s){return this.querySelectorAll(s)[0]||null;}
    contains(el){return el===this||this.children.some(n=>n.contains(el));}
    addEventListener(type,fn){add(this,type,fn);}removeEventListener(type,fn){this.events.get(type)?.delete(fn);}focus(){document.activeElement=this;}scrollIntoView(){this.onScroll?.();}
    checkVisibility(){return !this.hidden&&!this.hasAttribute('data-test-invisible');}
    getBoundingClientRect(){return this.rect||{left:20,top:80,right:160,bottom:124,width:this.hidden?0:140,height:this.hidden?0:44};}
    animate(){return {cancel(){},finished:Promise.resolve()};}getContext(){return {clearRect(){},save(){},translate(){},rotate(){},fillRect(){},restore(){}};}
  }
  const html=new Element('html'),body=new Element('body');html.appendChild(body);
  const storage=new Map(Object.entries(storageValues));
  const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
  const document={events:listeners(),documentElement:html,body,activeElement:body,readyState:'complete',createElement:tag=>new Element(tag),createTextNode:v=>new Text(v),createDocumentFragment:()=>new Element('#fragment'),querySelector:s=>html.querySelector(s),querySelectorAll:s=>html.querySelectorAll(s),getElementById:id=>html.querySelector('#'+id),addEventListener(type,fn){add(this,type,fn);},removeEventListener(type,fn){this.events.get(type)?.delete(fn);}};
  const window={events:listeners(),localStorage,matchMedia:()=>({matches:reduced}),location:{assign:href=>window.assigned=href},addEventListener(type,fn){add(this,type,fn);},removeEventListener(type,fn){this.events.get(type)?.delete(fn);},dispatchEvent(event){fire(this,event.type);return true;}};
  const context=vm.createContext({document,window,localStorage,location:{pathname,search},URL,URLSearchParams,Event:class{constructor(type){this.type=type;}},innerWidth:375,innerHeight:844,performance:{now:()=>0},getComputedStyle:el=>({...html.style,display:el.style.display||'block',visibility:el.style.visibility||'visible'}),setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=++seq;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),queueMicrotask:fn=>fn(),MutationObserver:class{constructor(fn){this.fn=fn;this.active=false;observers.push(this);}observe(){this.active=true;}disconnect(){this.active=false;}},console});
  return {html,body,document,window,storage,context,timers,frames,fire,activeObservers:()=>observers.filter(o=>o.active).length,run(name){vm.runInContext('('+functionSource(name)+')()',context);},mutate(records=[]){for(const o of [...observers])if(o.active)o.fn(records);},tick(ms){for(const [id,t]of [...timers])if(t.ms<=ms){timers.delete(id);t.fn();}},el(tag,attrs={},parent=body){const el=new Element(tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);parent.appendChild(el);return el;}};
}

const previousClock=globalThis.__AB_QA_FIXED_NOW_MS;
globalThis.__AB_QA_FIXED_NOW_MS=Date.parse('2026-07-15T12:00:00+09:00');
const fx=await createV2265QaFixture();const baseFetch=globalThis.fetch;let calls=[];
globalThis.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url);if(url.hostname==='mock.supabase.co')calls.push(url);return baseFetch(input,init);};
async function home(){calls=[];const res=await app.fetch(new Request(origin+'/app?month=2026-07&household_id=house-home',{headers:{cookie:fx.cookie,'user-agent':'Mozilla/5.0 (iPhone)'}}),fx.env,{waitUntil(){}});eq(res.status,200,'home response succeeds');return res.text();}
try {
  const normal=await home();ok(!normal.includes('data-ab-empty-folder'),'records suppress the folder');ok(!normal.includes('data-ab-new-ledger'),'existing records suppress auto-tour');ok(Buffer.byteLength(normal)<35840,'normal home stays within 35 KiB');eq(calls.length,9,'normal home makes 9 DB reads (V22.9.78 W-5 recurring-rule read) within the 9-read ceiling');
  fx.db.transactions=[];const empty=await home();ok(empty.includes('data-ab-empty-folder'),'zero all-time rows shows folder');ok(empty.includes('첫 기록 남기기'),'named ledger has one first-record action');ok(!empty.includes('data-ab-template='),'named ledger does not offer another ledger');ok(!empty.includes('data-ab-new-ledger'),'an old empty ledger never auto-tours');ok(Buffer.byteLength(empty)<35840,'empty home stays within 35 KiB');eq(calls.filter(u=>u.searchParams.get('select')==='id'&&u.searchParams.get('limit')==='1').length,1,'empty home uses exactly one existence read');eq(calls.length,10,'empty home totals 10 reads with the approved existence query and the V22.9.78 W-5 recurring-rule read');
  ok(!empty.includes('data-ab-celebrate="challenge"'),'record-zero ledger cannot celebrate the default challenge');
  fx.db.households[0].created_at='2026-07-15T02:00:00.000Z';ok((await home()).includes('data-ab-new-ledger'),'fresh empty ledger is eligible for first-visit tour');
  // V22.9.86 T-18(디자인 작업 지시서 3단계 §3-6): 기록 없는 달의 빈 상태가 점선 상자·해요체 문구로 바뀌었다('아직 이번 달 기록이 없습니다.' → '아직 이번 달 기록이 없어요').
  fx.db.transactions=[{id:'old',household_id:'house-home',transaction_date:'2025-01-01',type:'expense',amount:10000,memo:'past'}];const past=await home();ok(!past.includes('data-ab-empty-folder'),'old records suppress onboarding in an empty month');ok(past.includes('아직 이번 달 기록이 없어요'),'empty-month guidance remains');
  const allTimeCall=calls.find(u=>u.searchParams.get('select')==='id'&&u.searchParams.get('limit')==='1');eq(allTimeCall.searchParams.get('household_id'),'eq.house-home','existence read is household scoped');ok(!allTimeCall.searchParams.has('transaction_date'),'existence read covers all dates');
  globalThis.fetch=async(input,init)=>{const u=new URL(typeof input==='string'?input:input.url);if(u.searchParams.get('select')==='id'&&u.searchParams.get('limit')==='1')return new Response('{"error":"offline"}',{status:503});return baseFetch(input,init);};ok(!(await home()).includes('data-ab-empty-folder'),'failed existence read cannot fabricate an empty ledger');globalThis.fetch=baseFetch;
  fx.db.transactions=[{id:'June',household_id:'house-home',user_id:'user-bin',transaction_date:'2026-06-07',type:'expense',amount:200}];fx.db.accountbook_budgets=[{household_id:'house-home',month:'2026-06',category:'__total',amount:1000}];
  const closed=async()=>{const r=await app.fetch(new Request(origin+'/app?month=2026-06&household_id=house-home',{headers:{cookie:fx.cookie}}),fx.env,{});return r.text();};
  ok((await closed()).includes('data-ab-celebrate="budget"'),'completed calendar month within a real budget can celebrate');fx.db.transactions[0].amount=1001;ok(!(await closed()).includes('data-ab-celebrate="budget"'),'over-budget month cannot celebrate');fx.db.transactions[0].amount=200;fx.db.accountbook_budgets=[];ok(!(await closed()).includes('data-ab-celebrate="budget"'),'missing budget cannot celebrate');ok(!normal.includes('data-ab-celebrate="budget"'),'open current month cannot celebrate');
  fx.db.household_members=[];const start=await app.fetch(new Request(origin+'/app',{headers:{cookie:fx.cookie}}),fx.env,{});const startHtml=await start.text();eq((startHtml.match(/data-ab-template=/g)||[]).length,4,'no-ledger screen offers four templates');for(const key of ['household','travel','meeting','settlement'])ok(startHtml.includes('/my/households?template='+key),'template link '+key+' uses the existing creation flow');
  for(const [kind,path]of [['shell','/assets/accountbook-shell-v22986.css'],['theme','/assets/accountbook-theme-v22946.js'],['goals','/assets/accountbook-goals-v22946.js'],['v5','/assets/accountbook-v5-v22986.js']]){const r=await app.fetch(new Request(origin+path),{},{});eq(r.status,200,kind+' new asset exists');ok(r.headers.get('cache-control').includes('immutable'),kind+' is immutable');ok(r.headers.get('etag').includes(path.match(/-(v\d+)\./)[1]),kind+' ETag matches');if(kind==='shell')ok((await r.text()).includes('font:inherit!important;color:inherit!important'),'mask wrappers preserve font and semantic colors');}
  const oldHashes={}; // V22.9.85: V22.9.46 이전 주소 네 개는 옛 주소 정리로 뺐다(validate-immutable-asset-addresses-v2299 RETIRED).
  for(const [path,hash]of Object.entries(oldHashes)){const r=await app.fetch(new Request(origin+path),{},{});eq(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),hash,path+' preserves old bytes');}
  for(const [id,name]of [['088','accountbookEmptyFolderClientMain'],['197','accountbookTourClientMain'],['093','accountbookCelebrationClientMain'],['138','accountbookAmountPrivacyClientMain']]){ok(source.includes('Lucian UX/UI Prompt #'+id+' · MIT License'),'license '+id+' is retained');ok(!functionSource(name).includes('document.currentScript'),name+' uses stable hooks');}
  const settings={schema_version:2,target_days:2,start_date:'2026-07-01',target_date:'2026-07-04',enabled:true};
  const monthlyRow={id:'July',household_id:'house-home',user_id:'user-bin',transaction_date:'2026-07-13',type:'income',amount:200};
  const done=buildReportChallenge([monthlyRow], '2026-07',settings);ok(renderReportChallenge(done,{householdId:'house-home'}).includes('data-ab-celebrate="challenge"'),'saved, server-computed completion with a monthly record publishes a challenge hook');ok(!renderReportChallenge({...done,enabled:false},{householdId:'house-home'}).includes('data-ab-celebrate'),'disabled challenge cannot celebrate');ok(!renderReportChallenge({...done,progress:1},{householdId:'house-home'}).includes('data-ab-celebrate'),'incomplete challenge cannot celebrate');
  ok(!renderReportChallenge({...done,schemaVersion:1,revision:0},{householdId:'house-home'}).includes('data-ab-celebrate'),'unsaved defaults cannot celebrate even with monthly records');
  ok(renderReportChallenge({...done,schemaVersion:1,revision:1},{householdId:'house-home'}).includes('data-ab-celebrate'),'a saved revision also establishes explicit challenge configuration');
  ok(!renderReportChallenge(buildReportChallenge([],'2026-07',settings),{householdId:'house-home'}).includes('data-ab-celebrate'),'a saved challenge with zero monthly records cannot celebrate');
  ok(!renderReportChallenge(buildReportChallenge([{...monthlyRow,transaction_date:'2026-06-13'}],'2026-07',settings),{householdId:'house-home'}).includes('data-ab-celebrate'),'records in a different month cannot establish selected-month eligibility');
  fx.db.transactions=[monthlyRow,{...monthlyRow,id:'June',transaction_date:'2026-06-13'}];
  const crossSettings={...settings,start_date:'2026-06-01'};
  const crossEmpty=await buildReportChallengeForHousehold(fx.env,{householdId:'house-home',month:'2026-07',rows:[],value:crossSettings});eq(crossEmpty.hasMonthlyRecords,false,'cross-month challenge range cannot replace selected-month record evidence');ok(!renderReportChallenge(crossEmpty).includes('data-ab-celebrate'),'empty selected month excludes cross-month celebration');
  const crossWithRecord=await buildReportChallengeForHousehold(fx.env,{householdId:'house-home',month:'2026-07',rows:[monthlyRow],value:crossSettings});ok(renderReportChallenge(crossWithRecord).includes('data-ab-celebrate'),'selected-month record outside the challenge period still permits a real saved completion');
}finally{fx.restore();if(previousClock===undefined)delete globalThis.__AB_QA_FIXED_NOW_MS;else globalThis.__AB_QA_FIXED_NOW_MS=previousClock;}

for(const hidden of [false,true]){
  const b=browser({storageValues:{abHideAmounts:hidden?'1':'0'}});b.document.readyState='loading';b.run('accountbookThemeClientMain');eq(b.html.hasAttribute('data-ab-hide-amounts'),hidden,'head asset reads privacy before DOM ready');
}
{
  const b=browser({storageValues:{abHideAmounts:'1'}});b.document.readyState='loading';
  const memo=b.el('p');memo.textContent='이 속도면 716,237원이 남습니다.';const amount=b.el('b',{'data-ab-num-unit':'원'});amount.textContent='981,400';const input=b.el('input');input.value='20000';const date=b.el('em');date.textContent='15';
  b.run('accountbookThemeClientMain');b.run('accountbookAmountMaskClientMain');
  eq(memo.querySelector('.abPrivateAmount').textContent,'716,237원','blocking head asset masks narrative amounts before V5');eq(memo.childNodes[0].textContent,'이 속도면 ','leading space stays outside the inline-block amount wrapper');eq(amount.querySelector('.abPrivateAmount').textContent,'981,400','blocking head asset masks separate-unit values');eq(input.value,'20000','early observer excludes input values');eq(date.childNodes.length,1,'early observer preserves calendar dates');
  const inserted=b.el('p');inserted.textContent='납입 50,000원';b.mutate([{addedNodes:[inserted]}]);eq(inserted.querySelectorAll('.abPrivateAmount').length,1,'parser additions are masked by the early observer');b.mutate([{addedNodes:[inserted]}]);eq(inserted.querySelectorAll('.abPrivateAmount').length,1,'early observer never nests duplicate wrappers');
}
{
  const b=browser({storageValues:{abHideAmounts:'1'}});b.html.setAttribute('data-ab-hide-amounts','');
  b.el('header',{class:'abNavMobileTop'});b.el('section',{class:'abAppearancePanel'});
  const amount=b.el('b',{'data-ab-num-unit':'원'});amount.textContent='981,400';
  const row=b.el('div',{class:'homeTxAmt'});row.innerHTML='-28,600원<small>국민카드</small>';
  const memo=b.el('p');memo.textContent='하루 57,729원 · 카페';
  const input=b.el('input');input.value='28600';const date=b.el('em');date.textContent='15';
  b.run('accountbookAmountMaskClientMain');b.run('accountbookAmountPrivacyClientMain');eq(amount.querySelector('.abPrivateAmount').textContent,'981,400','split unit amount is masked');eq(row.textContent,'-28,600원국민카드','DOM value and payment remain intact');eq(row.querySelector('small').querySelectorAll('.abPrivateAmount').length,0,'payment label is not masked');eq(memo.querySelectorAll('.abPrivateAmount').length,1,'narrative currency is masked');eq(input.value,'28600','input value is untouched');eq(input.childNodes.length,0,'input is never wrapped');eq(date.querySelectorAll('.abPrivateAmount').length,0,'calendar dates stay visible');eq(b.document.querySelectorAll('[data-ab-hide-toggle]').length,2,'eye and appearance toggles are installed');
  const span=amount.querySelector('.abPrivateAmount');let prevented=false;b.fire(b.document,'click',{target:span,preventDefault(){prevented=true;},stopImmediatePropagation(){}});ok(prevented,'reveal does not trigger row editing');ok(span.hasAttribute('data-ab-amount-revealed'),'individual amount reveals');b.tick(2999);ok(span.hasAttribute('data-ab-amount-revealed'),'reveal lasts the full three seconds');b.tick(3000);ok(!span.hasAttribute('data-ab-amount-revealed'),'reveal expires after three seconds');
  const toggle=b.document.querySelector('[data-ab-hide-toggle]');b.fire(b.document,'click',{target:toggle});eq(b.storage.get('abHideAmounts'),'0','off persists on this device');ok(!b.html.hasAttribute('data-ab-hide-amounts'),'off immediately clears masking');eq(toggle.getAttribute('aria-pressed'),'false','toggle exposes its state');b.fire(b.document,'click',{target:toggle});eq(b.storage.get('abHideAmounts'),'1','on persists');b.fire(b.window,'storage',{key:'abHideAmounts',newValue:'0'});ok(!b.html.hasAttribute('data-ab-hide-amounts'),'other-tab state synchronizes');
  b.fire(b.window,'pagehide');eq(b.timers.size,0,'privacy timers are cleared on pagehide');
  b.fire(b.window,'pageshow',{persisted:true});b.fire(b.document,'click',{target:toggle});ok(b.html.hasAttribute('data-ab-hide-amounts'),'bfcache restore rebinds privacy controls');const restored=amount.querySelector('.abPrivateAmount');b.fire(b.document,'click',{target:restored});b.fire(b.window,'pagehide');ok(!restored.hasAttribute('data-ab-amount-revealed'),'pagehide removes a pending reveal before bfcache');
}
{
  const b=browser({storageValues:{abHideAmounts:'0'}});b.el('header',{class:'abNavMobileTop'});
  const rows=['+320만','-15만','14.8만','2천','3억','1억 2천만원'].map(value=>{const el=b.el('p');el.textContent=value;return el;});
  const dates=b.el('em');dates.textContent='15일 · 5건 · 10만 명 · 2천 개 · 10%';
  const svg=b.el('svg',{class:'insightChart'}),svgAmount=b.el('text',{},svg),svgDate=b.el('text',{},svg);svgAmount.textContent='14.8만';svgDate.textContent='7월 15일';
  b.run('accountbookThemeClientMain');b.run('accountbookAmountMaskClientMain');b.run('accountbookAmountPrivacyClientMain');
  eq(b.document.querySelectorAll('.abPrivateAmount').length,0,'privacy off does not create any amount wrapper');eq(b.document.querySelectorAll('[data-ab-private-ready]').length,0,'privacy off does not mark the DOM');eq(b.activeObservers(),0,'privacy off has no active DOM observer');
  const late=b.el('p');late.textContent='9만원';b.mutate([{addedNodes:[late]}]);eq(late.childNodes.length,1,'off-state additions stay untouched');
  const toggle=b.document.querySelector('[data-ab-hide-toggle]');b.fire(b.document,'click',{target:toggle});
  for(const row of rows){eq(row.querySelector('.abPrivateAmount').textContent,row.textContent,'compact amount '+row.textContent+' is wrapped intact');ok(row.hasAttribute('data-ab-private-ready'),'only successfully masked content is ready');}
  eq(late.querySelector('.abPrivateAmount').textContent,'9만원','enabling scans amounts inserted while off');eq(dates.querySelectorAll('.abPrivateAmount').length,0,'dates, counts and percentages remain visible');ok(!dates.hasAttribute('data-ab-private-ready'),'non-money text never disables a CSS fallback');
  ok(svgAmount.classList.contains('abPrivateAmount'),'SVG money is marked on native text');eq(svgAmount.childNodes[0].nodeType,3,'SVG label retains its original text node');eq(svgAmount.querySelectorAll('span').length,0,'SVG never receives HTML wrappers');ok(!svgDate.classList.contains('abPrivateAmount'),'SVG dates stay visible');
  b.fire(b.document,'click',{target:svgAmount});ok(svgAmount.hasAttribute('data-ab-amount-revealed'),'SVG amount can reveal individually');b.tick(3000);ok(!svgAmount.hasAttribute('data-ab-amount-revealed'),'SVG reveal expires in three seconds');
  const updated=b.el('p');updated.textContent='4천';b.mutate([{type:'characterData',target:updated.childNodes[0]}]);eq(updated.querySelector('.abPrivateAmount').textContent,'4천','text-node updates are masked while on');
  b.fire(b.document,'click',{target:toggle});eq(b.document.querySelectorAll('.abPrivateAmount').length,0,'turning privacy off removes all HTML and SVG masking markers');eq(b.document.querySelectorAll('[data-ab-private-ready]').length,0,'off restores fallback markers');eq(b.activeObservers(),0,'off disconnects DOM observers');eq(svgAmount.textContent,'14.8만','SVG text is unchanged after unmasking');eq(rows[5].textContent,'1억 2천만원','compound amounts survive an on/off cycle');
  ok(!readFileSync(new URL('../src/modules/assets/lucian-e-css.js',import.meta.url),'utf8').includes('.homeWeek em'),'date numbers have no amount fallback');
}
{
  const b=browser();const target=b.el('section',{'data-ab-celebrate':'goal','data-ab-celebrate-key':'palette:1'});let tokenOwner;
  b.context.getComputedStyle=el=>{tokenOwner=el;return b.html.style;};b.run('accountbookCelebrationClientMain');eq(tokenOwner,target,'confetti reads inherited body tokens from the confirmed target');
}
for(const reduced of [true,false]){
  const b=browser({reduced});const target=b.el('section',{'data-ab-celebrate':'challenge','data-ab-celebrate-key':'hh:July:1','data-ab-celebrate-count':'4'});b.run('accountbookCelebrationClientMain');eq(b.document.querySelectorAll('.abCelebration').length,1,'confirmed achievement shows a badge');eq(b.document.querySelectorAll('.abConfetti').length,reduced?0:1,'reduced-motion confetti contract');eq(b.storage.get('abCelebrated:challenge:hh:July:1'),'1','event is remembered on this device');b.mutate();eq(b.document.querySelectorAll('.abCelebration').length,1,'repeated render cannot duplicate a badge');target.remove();b.mutate();eq(b.document.querySelectorAll('.abCelebration').length,0,'removed root clears celebration');eq(b.timers.size,0,'removed root clears badge timer');
  const again=b.el('section',{'data-ab-celebrate':'challenge','data-ab-celebrate-key':'hh:July:1'});b.mutate();eq(b.document.querySelectorAll('.abCelebration').length,0,'same achievement does not replay');again.setAttribute('data-ab-celebrate-key','hh:August:1');b.mutate();eq(b.document.querySelectorAll('.abCelebration').length,1,'a different confirmed event can celebrate');b.fire(b.window,'pagehide');eq(b.frames.size,0,'pagehide cancels animation frames');eq(b.timers.size,0,'pagehide cancels celebration timers');
}
{
  const b=browser();b.el('section',{'data-ab-celebrate':'goal','data-ab-celebrate-key':'goal:1'});b.el('section',{'data-ab-celebrate':'goal','data-ab-celebrate-key':'goal:2'});b.run('accountbookCelebrationClientMain');
  eq(b.document.querySelectorAll('.abCelebration').length,1,'simultaneous goals share one visible badge');eq(b.document.querySelectorAll('.abConfetti').length,1,'simultaneous goals allocate only one canvas');ok(!b.storage.has('abCelebrated:goal:goal:2'),'queued event is not marked before presentation');b.tick(6000);b.mutate();eq(b.storage.get('abCelebrated:goal:goal:2'),'1','queued confirmed event is shown after dismissal');
}
for(const [name,search,fresh,done,expected]of [['existing','',false,false,false],['fresh','',true,false,true],['once','',true,true,false],['restart','?tour=1',false,true,true]]){
  const b=browser({search,storageValues:{abTourDone:done?'1':'0'}});if(fresh)b.el('section',{'data-ab-new-ledger':''});b.el('main',{class:'wrap'});b.el('button',{'data-ab-quick-open':''});b.run('accountbookTourClientMain');eq(!!b.document.querySelector('[data-ab-tour]'),expected,name+' tour eligibility');if(!expected)continue;const next=b.document.querySelector('[data-tour-next]');eq(b.document.activeElement,next,name+' focuses tour action');eq(next.textContent,'안내 마치기',name+' skips both missing targets');b.fire(b.document,'keydown',{key:'Tab'});eq(b.document.activeElement,b.document.querySelector('[data-tour-skip]'),name+' traps focus');b.fire(b.document,'keydown',{key:'Escape'});ok(!b.document.querySelector('[data-ab-tour]'),name+' Escape closes');eq(b.storage.get('abTourDone'),'1',name+' skip records completion');eq(b.frames.size,0,name+' tour leaves no frame');
}
{
  const b=browser({search:'?tour=1'});b.el('main',{class:'wrap'});b.el('button',{'data-ab-quick-open':''});const calendar=b.el('div',{class:'homeCalendarToggle'});b.el('a',{},calendar);
  const collapsed=b.el('details');const hidden=b.el('a',{class:'homeCategoryLink'},collapsed);hidden.rect={left:20,top:1806,right:160,bottom:1850,width:140,height:44};
  const invisible=b.el('a',{'data-key':'stats','data-test-invisible':''});invisible.rect=hidden.rect;
  const reports=b.el('section',{class:'homeReports'});b.el('a',{href:'/menu'},reports).textContent='홈 구성';const article=b.el('article',{class:'homeReport'},reports),link=b.el('a',{href:'/my/analysis'},article);link.rect=hidden.rect;let scrolled=0;link.onScroll=()=>{scrolled++;link.rect={left:20,top:380,right:160,bottom:424,width:140,height:44};};
  b.run('accountbookTourClientMain');const next=b.document.querySelector('[data-tour-next]');b.fire(next,'click');b.fire(next,'click');
  ok(b.document.querySelector('#abTourText').textContent.startsWith('3/3'),'visible analytics link retains all three steps');ok(scrolled>0,'step three scrolls the visible link');eq(b.document.querySelector('.abTourSpot').style.top,'375px','spotlight is remeasured after scrolling');ok(Number.parseInt(b.document.querySelector('.abTourSpot').style.top)<844,'step-three spotlight stays inside the viewport');b.fire(next,'click');eq(b.frames.size,0,'rapid tour advancement cancels every queued frame');
}
{
  const b=browser({search:'?tour=1'});b.el('main',{class:'wrap'});const collapsed=b.el('details');b.el('a',{class:'homeCategoryLink'},collapsed);const hidden=b.el('section');hidden.style.display='none';const link=b.el('a',{'data-key':'stats'},hidden);link.checkVisibility=undefined;b.run('accountbookTourClientMain');ok(!b.document.querySelector('[data-ab-tour]'),'closed details and hidden ancestors are excluded without checkVisibility');
}
{
  const b=browser({search:'?tour=1'});b.el('main',{class:'wrap'});b.el('button',{'data-ab-quick-open':''});b.run('accountbookTourClientMain');b.body.classList.add('abQuickInputOpen');b.mutate();ok(!b.document.querySelector('[data-ab-tour]'),'opening quick input closes tour without stealing focus');
}
{
  const b=browser({search:'?tour=1'});b.el('main',{class:'wrap'});b.run('accountbookTourClientMain');ok(!b.document.querySelector('[data-ab-tour]'),'no available target leaves no overlay');eq(b.frames.size,0,'no-target tour allocates no animation');
}
{
  const b=browser();const root=b.el('section',{'data-ab-empty-folder':''});const link=b.el('a',{'data-ab-template':'travel',href:'/my/households?template=travel'},root);link.textContent='여행';b.run('accountbookEmptyFolderClientMain');b.fire(root,'click',{target:link,ctrlKey:true});eq(b.timers.size,0,'modified template click keeps browser navigation');b.fire(root,'click',{target:link});eq(b.timers.size,1,'plain click schedules only navigation animation');ok(!root.textContent.includes('만들었습니다'),'animation never claims a ledger was created');b.tick(760);eq(b.window.assigned,origin+'/my/households?template=travel','animation ends in the existing form');eq(b.timers.size,0,'navigation animation timer ends');
}
{
  const b=browser();const root=b.el('div',{id:'goalsRoot'});b.el('div',{class:'abNavScope','data-ab-hh':'house-home'});let postResolve,posts=0;
  const goal={id:'goal-1',name:'여행',target:100,saved:50,monthly:50,status:'on_track',progress:50};
  b.context.fetch=(url,init={})=>{if(init.method==='POST'){posts++;return new Promise(resolve=>postResolve=resolve);}return Promise.resolve({ok:true,json:()=>Promise.resolve({goals:[structuredClone(goal)],can_write:true})});};
  b.el('div',{id:'goalToast'});b.el('div',{id:'goalToastMsg'});b.el('button',{id:'goalToastUndo'});
  b.run('accountbookGoalsClientMain');for(let i=0;i<6;i++)await Promise.resolve();
  eq(root.querySelectorAll('[data-ab-celebrate]').length,0,'incomplete server goal does not celebrate');b.fire(root.querySelector('.fund'),'click');eq(root.querySelectorAll('[data-ab-celebrate]').length,0,'optimistic goal completion does not celebrate');b.tick(5000);eq(posts,1,'delayed fund reaches the server once');eq(root.querySelectorAll('[data-ab-celebrate]').length,0,'pending server response cannot celebrate');postResolve({ok:true,json:()=>Promise.resolve({goals:[{...goal,saved:100,progress:100,status:'done'}],can_write:true})});for(let i=0;i<8;i++)await Promise.resolve();eq(root.querySelectorAll('[data-ab-celebrate="goal"]').length,1,'confirmed server goal can celebrate');
}
for(const action of ['undo','reject']){
  const b=browser();const root=b.el('div',{id:'goalsRoot'});b.el('div',{class:'abNavScope','data-ab-hh':'house-home'});let postResolve,posts=0;
  const goal={id:'goal-2',name:'비상금',target:100,saved:50,monthly:50,status:'on_track',progress:50};
  b.context.fetch=(url,init={})=>{if(init.method==='POST'){posts++;return new Promise(resolve=>postResolve=resolve);}return Promise.resolve({ok:true,json:()=>Promise.resolve({goals:[structuredClone(goal)],can_write:true})});};
  b.el('div',{id:'goalToast'});b.el('div',{id:'goalToastMsg'});const undo=b.el('button',{id:'goalToastUndo'});
  b.run('accountbookGoalsClientMain');for(let i=0;i<6;i++)await Promise.resolve();b.fire(root.querySelector('.fund'),'click');
  if(action==='undo'){b.fire(undo,'click');b.tick(5000);eq(posts,0,'undo cancels the scheduled goal write');}
  else{b.tick(5000);postResolve({ok:false,status:409,json:()=>Promise.resolve({message:'conflict'})});for(let i=0;i<15;i++)await Promise.resolve();eq(posts,1,'rejected goal write is not retried');}
  eq(root.querySelectorAll('[data-ab-celebrate]').length,0,action+' cannot publish a completion hook');
}
console.log(`Lucian E V22.9.46: ${checks} checks passed`);
