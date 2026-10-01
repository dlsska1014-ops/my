// Isolated in-memory fixtures only. Never writes production data.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import app from '../src/index.js';
import {createV2265QaFixture} from '../validation/qa-fixture.mjs';
const args=process.argv.slice(2),flag=(k,d)=>args.includes('--'+k)?args[args.indexOf('--'+k)+1]:d;
const out=flag('out','D:/Github_Kakao_Account/releases/responsive-v22923');mkdirSync(out,{recursive:true});
const widths=flag('widths','360,390,768,899,900,1024,1180,1181,1319,1320,1360,1440,1920').split(',').map(Number);
const q='month=2026-07&household_id=house-home';
const routes={home:'/app?'+q,calendar:'/app?'+q+'&view=calendar',transactions:'/app?'+q+'&tab=transactions',analysis:'/my/analysis?'+q,report:'/my/analysis?'+q+'&view=report',budgets:'/budgets?'+q,alerts:'/budget-alerts?'+q,goals:'/goals?'+q,assets:'/payment-methods?'+q,members:'/my/members?'+q,groups:'/my/groups?'+q,households:'/my/households?'+q,import:'/my/backup?'+q+'&mode=import',backup:'/my/backup?'+q+'&mode=backup',guide:'/start-guide?'+q,menu:'/menu?'+q,settings:'/my/settings?'+q,reserve:'/reserve-plans?'+q,settlement:'/settlement-summary?'+q,keywords:'/keyword-guide?'+q,login:'/login'};
const names=flag('pages',Object.keys(routes).join(',')).split(',');
const schemes=flag('schemes','light,dark').split(',');
globalThis.__AB_QA_FIXED_NOW_MS=Date.parse('2026-07-15T12:00:00+09:00');
const fixture=await createV2265QaFixture();
if(args.includes('--stress')){fixture.db.households.find(h=>h.id==='house-home').name='가족 · 여행과 생활비를 함께 기록하는 긴 가계부 이름';for(const t of fixture.db.transactions.filter(t=>t.household_id==='house-home')){t.amount=2000000000;t.memo='긴 기록 내용과 결제 정보를 확인하는 거래 내역 '.repeat(5);}}
const server=createServer(async(req,res)=>{try{
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const headers=new Headers(req.headers); if(!req.url.startsWith('/login'))headers.set('cookie',fixture.cookie);else headers.delete('cookie');
 const response=await app.fetch(new Request('https://malhaebook.com'+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),fixture.env,{waitUntil(){}});
 res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([k])=>k!=='content-encoding')));res.end(Buffer.from(await response.arrayBuffer()));
}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const originalTool=readFileSync(new URL('./screen-audit.mjs',import.meta.url),'utf8');
const findChrome=Function('existsSync','process',originalTool.slice(originalTool.indexOf('function findChrome()'),originalTool.indexOf('// ── 1.'))+';return findChrome;')(existsSync,process);
const openBrowser=Function('spawn',originalTool.slice(originalTool.indexOf('function openBrowser('),originalTool.indexOf('const wait ='))+';return openBrowser;')(spawn);
const browser=openBrowser(findChrome(),join(out,'profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const measure=()=>{
 const rail=document.querySelector('.abActivityRail'),rr=rail?.getBoundingClientRect(),visible=e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&!e.closest('[hidden],details:not([open]) form');
 const hasRail=!!rr?.width&&visible(rail), collisions=[],overflow=[],amounts=[];
 const main=[...document.querySelectorAll('[role=dialog]')].find(e=>visible(e))||document.querySelector('main')||document.body;
 for(const el of main.querySelectorAll('*')){
  if(!visible(el)||el.closest('.abActivityRail,.abLayoutNav,.abNavBottom,.abGlobalActions,[role=dialog]'))continue;
  const text=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent).join('');if(!text)continue;
  const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
  if(hasRail&&r.right>rr.left+1&&r.left<rr.right&&r.bottom>rr.top&&r.top<rr.bottom)collisions.push({tag:el.tagName,class:el.className,text:text.trim().slice(0,25),left:r.left,right:r.right,rail:rr.left});
  if(/[0-9,]+원/.test(text))amounts.push({right:r.right,width:r.width,scroll:el.scrollWidth,client:el.clientWidth});
  const clipped=()=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement)if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)&&p.getBoundingClientRect().right<=innerWidth+1)return true;return false;};
  if((r.right>innerWidth+1||r.left<-1)&&!clipped())overflow.push({tag:el.tagName,class:el.className,text:text.trim().slice(0,25),left:r.left,right:r.right});
 }
 const details=document.querySelector('.reportChallenge details'),form=details?.querySelector('form');
 const actions=[...main.querySelectorAll('a,button')].filter(e=>visible(e)&&!/abActivity|abNav|abGlobal/.test(e.className)).filter(e=>/홈으로|수정|삭제/.test(e.textContent)).map(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=x>=0&&x<innerWidth&&y>=0&&y<innerHeight?document.elementFromPoint(x,y):null;return {text:e.textContent.trim().slice(0,12),right:r.right,inView:!!hit,clickable:hit?e===hit||e.contains(hit):null};});
 return {width:innerWidth,hasRail,railLeft:hasRail?rr.left:null,bodyClass:document.body.className,collisions,overflow,amounts:amounts.length,actions,challenge:details?{open:details.open,formVisible:form.checkVisibility({checkVisibilityCSS:true}),labels:[...form.querySelectorAll('label')].map(e=>({text:e.textContent.trim().slice(0,12),width:e.getBoundingClientRect().width}))}:null,brand:document.querySelector('.abNavBrandText')?.textContent,title:document.title};
};
let failed=0;const results=[];
try{
 const{targetId}=await browser.send('Target.createTarget',{url:'about:blank'});const{sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true});const cdp=(m,p)=>browser.send(m,p,sessionId);
 await cdp('Page.enable');
 for(const theme of schemes){
  const{identifier}=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('ab:appearance:theme',${JSON.stringify(theme)});localStorage.removeItem('abNavCollapsed')`});
  for(const width of widths){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});
   for(const name of names){
    await cdp('Page.navigate',{url:base+routes[name]});await wait(220);
    let m;for(let i=0;i<10;i++){const r=await cdp('Runtime.evaluate',{expression:'('+measure.toString()+')()',returnByValue:true});m=r.result.value;if(m?.title)break;await wait(100);}
    // Scroll tested controls into the usable viewport before hit-testing. A bottom dock
    // crossing a control halfway through a page is not permanent occlusion.
    const hitChecks=(await cdp('Runtime.evaluate',{expression:`(async()=>{const out=[];for(const e of document.querySelectorAll('main a,main button')){if(!/홈으로|수정|삭제/.test(e.textContent)||!e.checkVisibility({checkVisibilityCSS:true})||e.closest('details:not([open])'))continue;e.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,30));const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);out.push({text:e.textContent.trim().slice(0,12),clickable:!!hit&&(hit===e||e.contains(hit)),occluder:hit?.className});}window.scrollTo(0,0);return out})()`,awaitPromise:true,returnByValue:true})).result.value;
    m.actions=hitChecks;
    const states=[['default',m]];
    if(name==='analysis'||name==='report'){
     await cdp('Runtime.evaluate',{expression:"document.querySelector('.reportChallenge details')?.setAttribute('open','')"});await wait(50);
     states.push(['challenge-open',(await cdp('Runtime.evaluate',{expression:'('+measure.toString()+')()',returnByValue:true})).result.value]);
    }
    if(name==='transactions'&&width>=900){await cdp('Runtime.evaluate',{expression:"document.querySelector('#abDesktopNavToggle')?.click()"});await wait(260);states.push(['sidebar-collapsed',(await cdp('Runtime.evaluate',{expression:'('+measure.toString()+')()',returnByValue:true})).result.value]);}
    if(args.includes('--interactive')&&['home','calendar','transactions'].includes(name)){
     await cdp('Runtime.evaluate',{expression:"document.querySelector('[data-ab-quick-open]')?.click()"});await wait(300);
     const d=(await cdp('Runtime.evaluate',{expression:'('+measure.toString()+')()',returnByValue:true})).result.value;d.hasQuickDialog=(await cdp('Runtime.evaluate',{expression:"!!document.querySelector('.abQuickInputPanel')?.checkVisibility({checkVisibilityCSS:true})",returnByValue:true})).result.value;states.push(['quick-input',d]);
     await cdp('Runtime.evaluate',{expression:"document.querySelector('[data-ab-quick-close]')?.click()"});await wait(100);
     if(name==='transactions'){
      await cdp('Runtime.evaluate',{expression:"document.querySelector('details[data-ab-edit-src]')?.setAttribute('open','')"});await wait(350);
      const d=(await cdp('Runtime.evaluate',{expression:'('+measure.toString()+')()',returnByValue:true})).result.value;d.editState=(await cdp('Runtime.evaluate',{expression:"document.querySelector('details[data-ab-edit-src]')?.getAttribute('data-ab-edit-state')",returnByValue:true})).result.value;states.push(['transaction-edit',d]);
     }
     if(name==='calendar'){
      await cdp('Runtime.evaluate',{expression:"document.querySelector('[data-ab-day]')?.click()"});await wait(300);
      const d=(await cdp('Runtime.evaluate',{expression:'('+measure.toString()+')()',returnByValue:true})).result.value;d.hasDayDialog=(await cdp('Runtime.evaluate',{expression:"!!document.querySelector('.abDayDetailPanel')?.checkVisibility({checkVisibilityCSS:true})",returnByValue:true})).result.value;states.push(['day-detail',d]);
     }
    }
    for(const[state,value]of states){
     if(!value)throw Error('missing measure '+name);
     const bad=value.collisions.length||value.overflow.length||(state==='default'&&value.actions.some(a=>a.clickable===false))||(state==='quick-input'&&!value.hasQuickDialog)||(state==='day-detail'&&!value.hasDayDialog)||(state==='transaction-edit'&&value.editState!=='ready');
     if(bad)failed++;
     results.push({name,theme,width,state,pass:!bad,...value});
     if(bad)console.log('FAIL',name,theme,width,state,JSON.stringify({collisions:value.collisions.slice(0,5),overflow:value.overflow.slice(0,5),actions:value.actions}));
    }
    if(args.includes('--shots')&&['transactions','analysis','import','login'].includes(name)&&[390,768,1360,1440].includes(width)){
     const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(out,`${name}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
    }
   }
   console.log('audited',theme,width,names.length,'pages');
  }
  await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier});
 }
}finally{browser.close();server.close();fixture.restore();delete globalThis.__AB_QA_FIXED_NOW_MS;}
writeFileSync(join(out,'results.json'),JSON.stringify({checked:results.length,failed,results},null,2)+'\n');
console.log('RESULT',results.length,'states,',failed,'failures',out);process.exitCode=failed?1:0;
