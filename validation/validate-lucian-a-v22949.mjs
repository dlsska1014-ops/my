import assert from 'node:assert/strict';
import {createInputBrowser} from './lib-lucian-a-browser.mjs';
import {fixture,page,app,BASE,withClock,intercept} from './lib-audit-v22934.mjs';
import {quickAmountFieldState,quickSmartInputController} from '../src/modules/client/shared-input-parsers.js';
let checks=0;const eq=(actual,expected,label)=>{assert.equal(actual,expected,label);checks++;};const ok=(value,label)=>{assert.ok(value,label);checks++;};
const clientScript=await(await app.fetch(new Request(BASE+'/assets/accountbook-quick-input-v229138.js'),{},{})).text();
// V22.9.138: 시계를 2026-07-15 12:00 KST 로 묶는다(가짜 화면의 거래일 기본값이 2026-07-15 — 미리보기 줄의 날짜가 ‘오늘’ 이다).
const NOW=Date.parse('2026-07-15T12:00:00+09:00');
const browser=()=>{const b=createInputBrowser({now:NOW});b.run(quickAmountFieldState.toString()+'\n'+quickSmartInputController.toString()+'\nquickSmartInputController({date:value=>value});');b.run(clientScript);return b;};
{
 // V22.9.138 U-16: 해석 칩 다섯 대신 해석 결과 한 줄 + [고치기](2층). 금액 단축 단추 다섯은 3층(접힌 ‘자세히’ 몸통) 맨 끝, 금액 안내는 금액 칸 바로 아래.
 const b=browser();const buttons=()=>b.body.querySelectorAll('button');eq(b.body.querySelectorAll('li').length,0,'no field chip list');eq(buttons().length,6,'one fix button plus five amount actions');eq(buttons().filter(n=>n.dataset.abInputField).length,0,'no per-field chips');
 // V22.9.138(독립 검토): 저장에 꼭 있어야 하는 내용이 비면 ‘내용 미입력’ 으로 적는다(결제수단은 없어도 저장되므로 빈 값은 적지 않는다).
 eq(b.preview(),'지출 · 분류 미입력 · 내용 미입력 · 금액 미입력 · 오늘','empty sheet preview names what is missing in words');eq(b.fix().textContent,'고치기','fix button label');eq(b.fix().getAttribute('aria-describedby'),'abInputPreview','fix button is described by the preview line');
 const group=b.body.querySelector('.abInputReview'),section=group.parentElement;eq(group.getAttribute('role'),'group','preview row is a named group');eq(group.getAttribute('aria-label'),'입력 결과 확인','preview row name');eq(section.children[section.children.indexOf(b.smart.parentElement)+1],group,'preview row sits right under the one-line input');
 eq(b.body.querySelector('.smartHint').hidden,true,'the preview line replaces the hint under the one-line input');
 const more=b.body.querySelector('#quickMore'),moreBody=more.querySelector('.quickMoreBody');eq(moreBody.children.at(-1).className,'abAmountActions','amount shortcuts are the last item of the folded third tier');eq(moreBody.children.at(-1).querySelectorAll('button').length,5,'five amount shortcuts');
 const formKids=b.form.children;eq(formKids[formKids.indexOf(b.fields.amountInput)+1].className,'abAmountHint','amount message stays right under the amount field (visible while folded)');
 b.run(clientScript);eq(b.body.querySelectorAll('#abInputPreview').length,1,'repeated asset is idempotent');eq(buttons().length,6,'repeated asset adds no buttons');
 // V22.9.138(독립 검토): [고치기]는 저장을 막는 까닭(컨트롤러의 data-ab-quick-block)의 칸으로 가고, 3층은 그 칸이 3층에 있을 때만 연다.
 eq(b.fields.after.getAttribute('data-ab-quick-block'),'amount','the controller names the empty amount as the block');
 more.open=false;b.click(b.fix());eq(more.open,false,'a first-tier fix keeps the third tier folded');eq(b.document.activeElement,b.fields.amountInput,'empty amount is fixed first');
 b.set('amountInput','12,000');await b.flush();eq(b.preview(),'지출 · 분류 미입력 · 내용 미입력 · 12,000원 · 오늘','amount follows the actual field');eq(b.fields.after.getAttribute('data-ab-quick-block'),'memo','with a valid amount the empty memo blocks saving');
 b.click(b.fix());eq(more.open,false,'the memo fix keeps the third tier folded');eq(b.document.activeElement,b.fields.memoInput,'with a valid amount the empty memo is next');
 // 분류 칸을 손으로 비워 둔다(이 검사의 컨트롤러에는 분류 추천 함수가 없다 — 손으로 고친 분류는 다시 묻지 않는다).
 b.set('catInput','');b.set('memoInput','점심');await b.flush();eq(b.fields.after.getAttribute('data-ab-quick-block'),'','amount and memo leave no block');b.click(b.fix());eq(more.open,true,'the category fix unfolds the third tier');eq(b.document.activeElement,b.fields.catInput,'with amount and memo the category is next');
 b.set('catInput','식비');b.set('memoInput','점심');b.set('payInput','국민카드');await b.flush();eq(b.preview(),'지출 · 식비 · 점심 · 12,000원 · 국민카드 · 오늘','full interpretation in the work-order order (type, category, memo, amount, payment, date)');
 for(const [value,label]of [['2026-07-14','어제'],['2026-07-10','7월 10일'],['2026-07-16','7월 16일'],['2025-12-31','2025년 12월 31일'],['','날짜 미입력'],['2026-07-15','오늘']]){b.set('txDate',value);await b.flush();eq(b.preview(),'지출 · 식비 · 점심 · 12,000원 · 국민카드 · '+label,'date reads as words '+(value||'(empty)'));ok(!/\d{4}-\d{2}-\d{2}/.test(b.preview()),'no ISO date in the preview '+(value||'(empty)'));}
 b.fields.expense.checked=false;b.fields.income.checked=true;b.fire(b.fields.income,'change');await b.flush();eq(b.preview(),'수입 · 식비 · 점심 · 12,000원 · 국민카드 · 오늘','type follows selection');
 // V22.9.138(독립 검토): 구분·분류 상태는 안내 글이 아니라 컨트롤러가 적는 값(data-ab-quick-block·data-ab-quick-category)으로 읽는다 — 여기서는 그 값을 손으로 둔다
 // (컨트롤러가 문장에서 그 값을 만드는 길은 validate-lucian-a-native-contract-v22950 이 실제 해석 함수로 본다).
 const seg=b.body.querySelector('.seg');more.open=false;
 b.fields.after.textContent='안내 글은 보지 않는다';b.fields.after.setAttribute('data-ab-quick-block','type');b.document.dispatchEvent({type:'ab:quick-update'});await b.flush();eq(b.preview(),'구분 확인 필요 · 식비 · 점심 · 12,000원 · 국민카드 · 오늘','cancellation default is not confirmed');b.click(b.fix());eq(b.document.activeElement,b.fields.income,'fix focuses the selected type radio when the type needs a choice');eq(seg.hasAttribute('data-ab-fix-target'),true,'the type group is marked (a hidden radio shows no focus after a tap)');eq(more.open,false,'the type fix keeps the third tier folded');
 b.fire(b.fields.income,'change');await b.flush();eq(seg.hasAttribute('data-ab-fix-target'),false,'choosing a type clears the mark');eq(b.fields.after.getAttribute('data-ab-quick-block'),'','choosing a type clears the type block');eq(b.preview(),'수입 · 식비 · 점심 · 12,000원 · 국민카드 · 오늘','choosing a type clears the type question');
 b.fields.catInput.value='';b.fields.after.textContent='분류 글도 보지 않는다';b.fields.after.setAttribute('data-ab-quick-category','pending');b.document.dispatchEvent({type:'ab:quick-update'});await b.flush();eq(b.preview(),'수입 · 분류 확인 중 · 점심 · 12,000원 · 국민카드 · 오늘','classification pending is honest');
 b.fields.after.setAttribute('data-ab-quick-category','failed');b.document.dispatchEvent({type:'ab:quick-update'});await b.flush();eq(b.preview(),'수입 · 분류 미입력 · 점심 · 12,000원 · 국민카드 · 오늘','a failed classification reads as no category');
 b.fields.catInput.value='회사간식';b.document.dispatchEvent({type:'ab:quick-update'});await b.flush();eq(b.preview(),'수입 · 회사간식 · 점심 · 12,000원 · 국민카드 · 오늘','async category result follows actual field');
 b.fields.amountInput.value='4,500';b.fire(b.smart,'input');await b.flush();eq(b.preview(),'수입 · 회사간식 · 점심 · 4,500원 · 국민카드 · 오늘','smart input outside form updates the preview');
 b.set('memoInput','');b.set('payInput','');await b.flush();eq(b.preview(),'수입 · 회사간식 · 내용 미입력 · 4,500원 · 오늘','an empty memo is named and an empty payment is left out');more.open=false;b.click(b.fix());eq(b.document.activeElement,b.fields.memoInput,'an empty memo is fixed before the category');
 b.set('amountInput','1e3');await b.flush();eq(b.preview(),'수입 · 회사간식 · 내용 미입력 · 금액 형식 확인 · 오늘','invalid amount never shows a number');eq(b.fields.after.getAttribute('data-ab-quick-block'),'amount','an invalid amount blocks before the memo');b.click(b.fix());eq(b.document.activeElement,b.fields.amountInput,'invalid amount is fixed first');eq(more.open,false,'the amount fix keeps the third tier folded');
}
{
 const b=browser();let total=0;
 // V22.9.138(독립 검토): 단축 단추는 3층 맨 끝이라 금액 칸(1층)으로 초점을 옮기지 않는다(시트가 위로 뛰고 자판이 뜬다) — 결과는 단추 곁의 결과 줄이 읽어 준다.
 const now=b.body.querySelector('.abAmountNow');eq(now.parentElement.className,'abAmountActions','the result line sits inside the shortcut group');eq(now.getAttribute('role'),'status','the result line is announced');eq(now.hidden,true,'the result line waits for a press');
 const start=b.document.activeElement;
 for(const delta of [1000,5000,10000,50000]){b.click(b.add(delta));await b.flush();total+=delta;eq(b.fields.amountInput.value,total.toLocaleString('ko-KR'),'add button adds '+delta);eq(b.document.activeElement,start,'add button leaves focus where it was');eq(now.hidden,false,'the result line shows after '+delta);eq(now.textContent,'금액 '+total.toLocaleString('ko-KR')+'원','the result line reads the new amount after '+delta);eq(b.preview(),'지출 · 분류 미입력 · 내용 미입력 · '+total.toLocaleString('ko-KR')+'원 · 오늘','add updates the preview line');}
 b.click(b.add(0));await b.flush();eq(b.fields.amountInput.value,'','clear empties actual field');eq(now.textContent,'금액을 지웠어요','the result line reads the clear');eq(b.preview(),'지출 · 분류 미입력 · 내용 미입력 · 금액 미입력 · 오늘','clear empties the preview amount');eq(b.fire(b.form,'submit'),false,'empty amount cannot submit');
 b.set('amountInput','7,000');await b.flush();eq(now.hidden,true,'typing in the amount field hides the shortcut result line');
 for(const value of ['0','-100','1e3','1.5','2,000,000,001']){b.set('amountInput',value);await b.flush();eq(b.fire(b.form,'submit'),false,'invalid format cannot submit '+value);eq(b.fields.amountInput.getAttribute('aria-invalid'),'true','invalid format announced '+value);eq(b.preview(),'지출 · 분류 미입력 · 내용 미입력 · 금액 형식 확인 · 오늘','invalid amount preview does not expose a number '+value);}
 const beforeRefusal=b.document.activeElement;b.document.activeElement=b.add(1000);b.click(b.add(1000));await b.flush();eq(b.fields.amountInput.value,'2,000,000,001','a shortcut never rewrites an invalid amount');eq(now.hidden,false,'the refusal shows next to the shortcuts');eq(now.textContent,'금액 형식과 20억원 상한을 확인한 뒤 더해 주세요.','the refusal reads what to check');eq(b.document.activeElement,b.add(1000),'the refusal leaves focus on the pressed shortcut');ok(beforeRefusal===b.fields.amountInput,'(the failed submits above put focus on the amount field)');
 b.set('amountInput','2,000');await b.flush();eq(b.fields.amountInput.validationMessage,'','corrected format clears own error');eq(b.fields.amountInput.getAttribute('aria-invalid'),'false','corrected format clears invalid status');
 b.set('amountInput','11,000');await b.flush();const message=b.body.querySelector('.abAmountHint');ok(message.textContent.includes('실제 지출을 저장'),'budget overage is informational');eq(b.fields.amountInput.getAttribute('aria-invalid'),'false','budget overage does not mark invalid amount');eq(b.fire(b.form,'submit'),true,'budget overage can submit');
 b.fields.income.checked=true;b.fields.expense.checked=false;b.fire(b.fields.income,'change');await b.flush();eq(message.hidden,true,'income does not show expense budget warning');
 b.fields.expense.checked=true;b.fields.income.checked=false;b.fields.after.setAttribute('data-bsc','[20260715,["식비"]]');b.set('catInput','교통');await b.flush();eq(message.hidden,true,'outside budget category does not show budget warning');b.set('catInput','식비');await b.flush();eq(message.hidden,false,'matching budget category shows warning');b.set('txDate','2026-06-15');await b.flush();eq(message.hidden,true,'different month does not use current budget');
}
{
 const b=createInputBrowser({writer:false,now:NOW});b.run(clientScript);eq(b.body.querySelectorAll('button').length,0,'read-only view gains no write controls');eq(b.preview(),null,'read-only view gains no preview line');
}
await withClock('2026-07-15',()=>fixture(async fx=>{
 let calls=0;const restore=intercept(()=>{calls++;});
 const before=await page(fx,'/app?month=2026-07&household_id=house-home');eq(calls,9,'initial home requests: the earlier 8 plus one V22.9.78 W-5 recurring-rule read in the same batch');ok(Buffer.byteLength(before.html)<=35*1024,'normal home remains below 35 KiB');ok(!before.html.includes('/assets/accountbook-quick-input-v229138.js'),'home does not preload input asset');
 const count=calls;
 for(const method of ['GET','HEAD']){const response=await app.fetch(new Request(BASE+'/assets/accountbook-quick-input-v229138.js',{method}),fx.env,{});eq(response.status,200,'input asset '+method);eq(response.headers.get('cache-control'),'public, max-age=31536000, immutable','input asset immutable');eq(response.headers.get('etag'),'"accountbook-quick-input-v229138-js"','input asset versioned ETag');const body=await response.text();if(method==='GET')ok(body.includes('accountbookInputReviewClientMain'),'asset serves real client');else eq(body,'','HEAD has no body');}
 eq(calls,count,'static input asset needs no DB requests');restore();
}));
console.log('Lucian A V22.9.49: '+checks+' checks passed');
