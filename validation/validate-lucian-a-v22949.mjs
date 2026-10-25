import assert from 'node:assert/strict';
import {createInputBrowser} from './lib-lucian-a-browser.mjs';
import {fixture,page,app,BASE,withClock,intercept} from './lib-audit-v22934.mjs';
import {quickAmountFieldState,quickSmartInputController} from '../src/modules/client/shared-input-parsers.js';
let checks=0;const eq=(actual,expected,label)=>{assert.equal(actual,expected,label);checks++;};const ok=(value,label)=>{assert.ok(value,label);checks++;};
const clientScript=await(await app.fetch(new Request(BASE+'/assets/accountbook-quick-input-v22951.js'),{},{})).text();
const browser=()=>{const b=createInputBrowser();b.run(quickAmountFieldState.toString()+'\n'+quickSmartInputController.toString()+'\nquickSmartInputController({date:value=>value});');b.run(clientScript);return b;};
{
 const b=browser();eq(b.body.querySelectorAll('li').length,5,'five real field links');eq(b.body.querySelectorAll('button').length,10,'five amount actions');
 eq(b.button('category').textContent,'분류 · 미입력','unresolved category stays unknown');eq(b.button('payment').textContent,'결제수단 · 미입력','unresolved payment stays unknown');
 b.run(clientScript);eq(b.body.querySelectorAll('li').length,5,'repeated asset is idempotent');
 for(const [key,id,value]of [['date','txDate','2026-07-14'],['amount','amountInput','12,000'],['category','catInput','식비'],['payment','payInput','국민카드']]){
  b.set(id,value);await b.flush();ok(b.button(key).textContent.includes(value),'chip follows actual '+key);b.click(b.button(key));eq(b.document.activeElement,b.fields[id],'chip focuses real '+key);
 }
 ok(b.body.querySelector('#quickMore').open,'chip unfolds details');
 b.fields.expense.checked=false;b.fields.income.checked=true;b.fire(b.fields.income,'change');await b.flush();eq(b.button('type').textContent,'구분 · 수입','type chip follows selection');b.click(b.button('type'));eq(b.document.activeElement,b.fields.income,'type chip focuses selected actual radio');
 b.fields.after.textContent='수입 또는 지출을 직접 선택한 뒤 저장해 주세요.';b.document.dispatchEvent({type:'ab:quick-update'});await b.flush();eq(b.button('type').textContent,'구분 · 확인 필요','cancellation default is not confirmed');
 b.fields.catInput.value='';b.fields.after.textContent='분류를 확인하고 있습니다';b.document.dispatchEvent({type:'ab:quick-update'});await b.flush();eq(b.button('category').textContent,'분류 · 확인 중','classification pending is honest');
 b.fields.catInput.value='회사간식';b.document.dispatchEvent({type:'ab:quick-update'});await b.flush();eq(b.button('category').textContent,'분류 · 회사간식','async category result follows actual field');
 b.fields.amountInput.value='4,500';b.fire(b.smart,'input');await b.flush();eq(b.button('amount').textContent,'금액 · 4,500원','smart input outside form updates chips');
}
{
 const b=browser();let total=0;
 for(const delta of [1000,5000,10000,50000]){b.click(b.add(delta));await b.flush();total+=delta;eq(b.fields.amountInput.value,total.toLocaleString('ko-KR'),'add button adds '+delta);eq(b.document.activeElement,b.fields.amountInput,'add button keeps numeric field focus');ok(b.button('amount').textContent.includes(total.toLocaleString('ko-KR')),'add updates amount chip');}
 b.click(b.add(0));await b.flush();eq(b.fields.amountInput.value,'','clear empties actual field');eq(b.button('amount').textContent,'금액 · 미입력','clear empties result chip');eq(b.fire(b.form,'submit'),false,'empty amount cannot submit');
 for(const value of ['0','-100','1e3','1.5','2,000,000,001']){b.set('amountInput',value);await b.flush();eq(b.fire(b.form,'submit'),false,'invalid format cannot submit '+value);eq(b.fields.amountInput.getAttribute('aria-invalid'),'true','invalid format announced '+value);eq(b.button('amount').textContent,'금액 · 형식 확인','invalid amount chip does not expose a number '+value);}
 b.set('amountInput','2,000');await b.flush();eq(b.fields.amountInput.validationMessage,'','corrected format clears own error');eq(b.fields.amountInput.getAttribute('aria-invalid'),'false','corrected format clears invalid status');
 b.set('amountInput','11,000');await b.flush();const message=b.body.querySelector('.abAmountHint');ok(message.textContent.includes('실제 지출을 저장'),'budget overage is informational');eq(b.fields.amountInput.getAttribute('aria-invalid'),'false','budget overage does not mark invalid amount');eq(b.fire(b.form,'submit'),true,'budget overage can submit');
 b.fields.income.checked=true;b.fields.expense.checked=false;b.fire(b.fields.income,'change');await b.flush();eq(message.hidden,true,'income does not show expense budget warning');
 b.fields.expense.checked=true;b.fields.income.checked=false;b.fields.after.setAttribute('data-bsc','[20260715,["식비"]]');b.set('catInput','교통');await b.flush();eq(message.hidden,true,'outside budget category does not show budget warning');b.set('catInput','식비');await b.flush();eq(message.hidden,false,'matching budget category shows warning');b.set('txDate','2026-06-15');await b.flush();eq(message.hidden,true,'different month does not use current budget');
}
{
 const b=createInputBrowser({writer:false});b.run(clientScript);eq(b.body.querySelectorAll('button').length,0,'read-only view gains no write controls');
}
await withClock('2026-07-15',()=>fixture(async fx=>{
 let calls=0;const restore=intercept(()=>{calls++;});
 const before=await page(fx,'/app?month=2026-07&household_id=house-home');eq(calls,9,'initial home requests: the earlier 8 plus one V22.9.78 W-5 recurring-rule read in the same batch');ok(Buffer.byteLength(before.html)<=35*1024,'normal home remains below 35 KiB');ok(!before.html.includes('/assets/accountbook-quick-input-v22951.js'),'home does not preload input asset');
 const count=calls;
 for(const method of ['GET','HEAD']){const response=await app.fetch(new Request(BASE+'/assets/accountbook-quick-input-v22951.js',{method}),fx.env,{});eq(response.status,200,'input asset '+method);eq(response.headers.get('cache-control'),'public, max-age=31536000, immutable','input asset immutable');eq(response.headers.get('etag'),'"accountbook-quick-input-v22951-js"','input asset versioned ETag');const body=await response.text();if(method==='GET')ok(body.includes('accountbookInputReviewClientMain'),'asset serves real client');else eq(body,'','HEAD has no body');}
 eq(calls,count,'static input asset needs no DB requests');restore();
}));
console.log('Lucian A V22.9.49: '+checks+' checks passed');
