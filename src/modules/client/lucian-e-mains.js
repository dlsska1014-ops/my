// <!-- Lucian UX/UI Prompt #088 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#088 -->
function accountbookEmptyFolderClientMain() {
  var roots = document.querySelectorAll('[data-ab-empty-folder]');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  roots.forEach(function(root) {
    var art = document.createElement('div');
    art.className = 'abEmptyFolderArt';
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = '<svg viewBox="0 0 120 90"><path class="abFolderBack" d="M12 22h36l10 10h50v46H12z"/><path class="abFolderFront" d="M8 42h104l-8 38H16z"/></svg>';
    root.prepend(art);
    var live = document.createElement('span');
    live.className = 'srOnly'; live.setAttribute('role', 'status'); root.appendChild(live);
    var timer = 0, animation = null, paper = null, busy = false;
    function clear() {
      clearTimeout(timer); if (animation) animation.cancel(); if (paper) paper.remove();
      art.classList.remove('isEating'); busy = false;
    }
    function click(event) {
      var link = event.target.closest('a[data-ab-template]');
      if (!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || reduced.matches) return;
      event.preventDefault(); if (busy) return; busy = true;
      var from = link.getBoundingClientRect(), to = art.getBoundingClientRect();
      paper = document.createElement('span'); paper.className = 'abFolderPaper'; paper.setAttribute('aria-hidden', 'true');
      paper.style.left = (from.left + from.width / 2 - 13) + 'px'; paper.style.top = (from.top + from.height / 2 - 16) + 'px';
      document.body.appendChild(paper); art.classList.add('isEating');
      var dx = to.left + to.width / 2 - from.left - from.width / 2;
      var dy = to.top + to.height * .3 - from.top - from.height / 2;
      live.textContent = link.textContent + ' 설정으로 이동합니다.';
      if (paper.animate) animation = paper.animate([
        {transform:'translate(0,0) rotate(-10deg) scale(.5)',opacity:0},
        {transform:'translate('+dx*.45+'px,'+(dy*.45-70)+'px) rotate(12deg)',opacity:1,offset:.45},
        {transform:'translate('+dx+'px,'+dy+'px) scale(.8)',opacity:1,offset:.82},
        {transform:'translate('+dx+'px,'+(dy+26)+'px) scale(.6)',opacity:0}
      ], {duration:760,easing:'cubic-bezier(.45,0,.25,1)'});
      timer = setTimeout(function() { if (root.isConnected) window.location.assign(link.href); clear(); }, 760);
    }
    root.addEventListener('click', click);
    var observer = new MutationObserver(function() { if (!root.isConnected) cleanup(); });
    observer.observe(document.body, {childList:true,subtree:true});
    function cleanup() { clear(); observer.disconnect(); root.removeEventListener('click',click); window.removeEventListener('pagehide',cleanup); if(!root.isConnected) window.removeEventListener('pageshow',resume); }
    function resume(event) { if(event.persisted && root.isConnected){root.addEventListener('click',click);observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('pagehide',cleanup);} }
    window.addEventListener('pagehide',cleanup);
    window.addEventListener('pageshow',resume);
  });
}

// <!-- Lucian UX/UI Prompt #197 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#197 -->
function accountbookTourClientMain() {
  if (location.pathname !== '/app') return;
  var explicit = new URLSearchParams(location.search).get('tour') === '1';
  var done = false;
  try { done = localStorage.getItem('abTourDone') === '1'; } catch (_error) {}
  if (!explicit && (done || !document.querySelector('[data-ab-new-ledger]'))) return;
  var specs = [
    ['[data-ab-quick-open],.tabAdd', '빠른 입력에서 지출이나 수입을 한 줄로 남기세요.'],
    ['.homeCalendarToggle a', '캘린더에서 날짜별 기록을 확인하세요.'],
    ['.homeReport a,a[data-key="stats"],a.homeCategoryLink', '분석에서 지출 흐름과 예산을 확인하세요.']
  ];
  function target(selector) {
    return Array.from(document.querySelectorAll(selector)).find(function(el) {
      if (el.closest('[hidden],[aria-hidden="true"]')) return false;
      if (el.checkVisibility && !el.checkVisibility({visibilityProperty:true})) return false;
      for (var owner=el; owner; owner=owner.parentElement) {
        if (owner.tagName==='DETAILS' && !owner.hasAttribute('open')) return false;
        var style=getComputedStyle(owner);
        if (style.display==='none' || style.visibility==='hidden' || style.visibility==='collapse') return false;
      }
      var r=el.getBoundingClientRect(); return r.width>0 && r.height>0;
    });
  }
  var steps = specs.filter(function(step) { return !!target(step[0]); });
  if (!steps.length) return;
  var previous = document.activeElement, index = 0, frame = 0, closed = false;
  var root = document.createElement('div'); root.className = 'abTour'; root.setAttribute('data-ab-tour', '');
  root.innerHTML = '<div class="abTourSpot" aria-hidden="true"></div><section class="abTourCard" role="dialog" aria-modal="true" aria-labelledby="abTourTitle" aria-describedby="abTourText"><h2 id="abTourTitle">화면 안내</h2><p id="abTourText" aria-live="polite"></p><div><button type="button" data-tour-skip>건너뛰기</button><button type="button" data-tour-next>다음</button></div></section>';
  document.body.appendChild(root);
  var spot=root.querySelector('.abTourSpot'), card=root.querySelector('.abTourCard');
  var next=root.querySelector('[data-tour-next]'), skip=root.querySelector('[data-tour-skip]');
  function position() {
    frame=0; if (closed || !root.isConnected) { close(false); return; }
    var el=target(steps[index][0]);
    if (!el) { advance(); return; }
    var r=el.getBoundingClientRect();
    if (r.top<7 || r.bottom>innerHeight-7) { el.scrollIntoView({block:'center',behavior:'instant'}); r=el.getBoundingClientRect(); }
    spot.style.left=Math.max(2,r.left-5)+'px'; spot.style.top=Math.max(2,r.top-5)+'px';
    spot.style.width=Math.min(innerWidth-4,r.width+10)+'px'; spot.style.height=r.height+10+'px';
    var height=card.getBoundingClientRect().height;
    var top=r.bottom+14;
    if (top+height>innerHeight-12) top=r.top-height-14;
    card.style.top=Math.max(12,Math.min(innerHeight-height-12,top))+'px';
    card.style.left=Math.max(12,Math.min(innerWidth-card.getBoundingClientRect().width-12,r.left))+'px';
  }
  function queue() { if (!frame) frame=requestAnimationFrame(position); }
  function show() {
    cancelAnimationFrame(frame); frame=0;
    var el=target(steps[index][0]); if (!el) { advance(); return; }
    el.scrollIntoView({block:'center',behavior:'instant'});
    root.querySelector('#abTourText').textContent=(index+1)+'/'+steps.length+' · '+steps[index][1];
    next.textContent=index===steps.length-1?'안내 마치기':'다음'; position(); queue(); next.focus({preventScroll:true});
  }
  function advance() { index++; if (index>=steps.length) close(true); else show(); }
  function key(event) {
    if(event.key==='Escape') { event.preventDefault(); close(true); }
    if(event.key==='Tab') { event.preventDefault(); (document.activeElement===next?skip:next).focus(); }
  }
  function focus(event) { if(!closed && !card.contains(event.target)) next.focus({preventScroll:true}); }
  function watch() {
    if (!root.isConnected || !document.querySelector('.wrap')) { close(false); return; }
    if (document.body.classList.contains('abQuickInputOpen')) close(true);
  }
  var observer=new MutationObserver(watch); observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','aria-hidden','open']});
  function close(remember) {
    if(closed) return; closed=true; cancelAnimationFrame(frame); observer.disconnect();
    window.removeEventListener('resize',queue); document.removeEventListener('scroll',queue,true);
    document.removeEventListener('keydown',key,true); document.removeEventListener('focusin',focus,true); window.removeEventListener('pagehide',pagehide);
    root.remove(); if(remember) { try { localStorage.setItem('abTourDone','1'); } catch (_error) {} }
    if(previous && previous.isConnected && !document.body.classList.contains('abQuickInputOpen')) previous.focus({preventScroll:true});
  }
  function pagehide() { close(false); }
  next.addEventListener('click',advance); skip.addEventListener('click',function(){close(true);});
  document.addEventListener('keydown',key,true); document.addEventListener('focusin',focus,true);
  window.addEventListener('resize',queue); document.addEventListener('scroll',queue,true); window.addEventListener('pagehide',pagehide);
  show();
}

// <!-- Lucian UX/UI Prompt #093 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#093 -->
function accountbookCelebrationClientMain() {
  var seen=new Set(), frames=new Set(), timers=new Set(), active=new Set();
  var reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  function celebrate(el) {
    // Keep one badge/canvas active. The observer queues remaining confirmed
    // events after dismissal instead of stacking dozens of goal animations.
    if (active.size) return;
    var kind=el.getAttribute('data-ab-celebrate'), key=el.getAttribute('data-ab-celebrate-key');
    if (!['challenge','goal','budget'].includes(kind) || !key) return;
    var storageKey='abCelebrated:'+kind+':'+key;
    if (seen.has(storageKey)) return;
    try { if(localStorage.getItem(storageKey)==='1') return; localStorage.setItem(storageKey,'1'); } catch (_error) {}
    seen.add(storageKey);
    var badge=document.createElement('div'); badge.className='abCelebration'; badge.setAttribute('role','status'); badge.setAttribute('aria-live','polite');
    var label={challenge:'챌린지 목표를 달성했습니다.',goal:'저축 목표를 달성했습니다.',budget:'이번 달을 예산 안에서 마쳤습니다.'}[kind];
    var count=Number(el.getAttribute('data-ab-celebrate-count')) || 0;
    badge.innerHTML='<span class="abCelebrationBadge" aria-hidden="true">✓</span><div><b></b><span class="abCelebrationCount"></span></div><button type="button" aria-label="축하 안내 닫기">닫기</button>';
    badge.querySelector('b').textContent=label;
    var number=badge.querySelector('.abCelebrationCount'); number.textContent=count?count+(kind==='challenge'?'일 성공':'개 목표 달성'):'';
    document.body.appendChild(badge); active.add(badge);
    var canvas=null, raf=0, timer=0;
    function cleanup() { cancelAnimationFrame(raf); frames.delete(raf); clearTimeout(timer); timers.delete(timer); if(canvas) canvas.remove(); badge.remove(); active.delete(badge); localObserver.disconnect(); }
    var localObserver=new MutationObserver(function(){if(!el.isConnected || !badge.isConnected) cleanup();});
    localObserver.observe(document.body,{childList:true,subtree:true});
    badge.querySelector('button').addEventListener('click',cleanup);
    timer=setTimeout(cleanup,6000); timers.add(timer);
    if(reduced.matches) return;
    if(number.animate && count) number.animate([{transform:'translateY(14px)',opacity:0},{transform:'none',opacity:1}],{duration:700,easing:'cubic-bezier(.34,1.45,.64,1)'});
    canvas=document.createElement('canvas'); canvas.className='abConfetti'; canvas.setAttribute('aria-hidden','true');
    canvas.width=innerWidth; canvas.height=innerHeight; document.body.appendChild(canvas);
    var ctx=canvas.getContext('2d'); if(!ctx) { canvas.remove(); return; }
    var style=getComputedStyle(el);
    var colors=['--ab12-brand','--ab12-down','--ab12-gauge-warn'].map(function(token){return style.getPropertyValue(token).trim();});
    var particles=Array.from({length:72},function(){return {x:canvas.width/2,y:canvas.height*.7,vx:(Math.random()-.5)*7,vy:-8-Math.random()*8,r:Math.random()*Math.PI,size:4+Math.random()*5,color:colors[Math.floor(Math.random()*colors.length)]};});
    var start=performance.now(), last=start;
    function draw(now) {
      frames.delete(raf);
      if(!el.isConnected || !badge.isConnected || now-start>2400 || reduced.matches){ canvas.remove(); return; }
      var dt=Math.min(2,(now-last)/16.67); last=now; ctx.clearRect(0,0,canvas.width,canvas.height);
      particles.forEach(function(p){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=.22*dt; p.r+=.07*dt; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.globalAlpha=Math.max(0,1-(now-start)/2400); ctx.fillStyle=p.color; ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.6); ctx.restore(); });
      raf=requestAnimationFrame(draw); frames.add(raf);
    }
    raf=requestAnimationFrame(draw); frames.add(raf);
  }
  function scan() { document.querySelectorAll('[data-ab-celebrate][data-ab-celebrate-key]').forEach(celebrate); }
  var observer=new MutationObserver(scan); observer.observe(document.body,{childList:true,subtree:true}); scan();
  function cleanup(){observer.disconnect(); frames.forEach(cancelAnimationFrame); timers.forEach(clearTimeout); active.forEach(function(b){b.remove();}); document.querySelectorAll('.abConfetti').forEach(function(c){c.remove();}); window.removeEventListener('pagehide',cleanup);}
  window.addEventListener('pagehide',cleanup);
  window.addEventListener('pageshow',function(event){if(event.persisted){observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('pagehide',cleanup);scan();}});
}

// <!-- Lucian UX/UI Prompt #138 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#138 -->
function accountbookAmountMaskClientMain() {
  // This runs in the blocking theme asset. DOM parser mutations are processed
  // before paint only while privacy is on. V5 controls signal changes by event.
  if (typeof MutationObserver !== 'function') return;
  var html=document.documentElement, active=false, wrapped=false, suspended=false;
  function wrap(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest('.abPrivateAmount')) return true;
    if (el.closest('input,textarea,select,[contenteditable],script,style')) return false;
    var moneyUnit=el.closest('[data-ab-num-unit="원"]');
    var re=moneyUnit ? /(?:[+−-]\s*)?\d[\d,]*(?:\.\d+)?/g : /(?:[+−-]\s*)?\d[\d,]*(?:\.\d+)?(?:\s*(?:억|천|만)\s*\d[\d,]*(?:\.\d+)?)*\s*(?:(?:억|천|만)*\s*원|(?:억|천|만)+(?!\s*(?:원|명|건|개|회|일|개월|년|%)))/g;
    // SVG text keeps its native nodes; an HTML span inside <text> would not render.
    if (el.closest('svg') && (el.tagName.toLowerCase()==='text' || el.tagName.toLowerCase()==='tspan') && re.test(el.textContent)) {
      el.classList.add('abPrivateAmount'); el.setAttribute('data-ab-private-svg',''); el.setAttribute('data-ab-private-ready',''); return true;
    }
    var money=false;
    Array.from(el.childNodes).forEach(function(node) {
      if (node.nodeType === 1) { money=wrap(node)||money; return; }
      if (node.nodeType !== 3) return;
      if (el.closest('svg')) return;
      re.lastIndex=0;
      var value=node.textContent, matches=Array.from(value.matchAll(re));
      if (!matches.length) return;
      var fragment=document.createDocumentFragment(), from=0;
      matches.forEach(function(m) { fragment.appendChild(document.createTextNode(value.slice(from,m.index))); var amount=document.createElement('span'); amount.className='abPrivateAmount'; amount.textContent=m[0]; fragment.appendChild(amount); from=m.index+m[0].length; });
      fragment.appendChild(document.createTextNode(value.slice(from))); node.replaceWith(fragment); money=true;
    });
    // Only successfully masked content disables the first-paint CSS fallback.
    if (money && !el.hasAttribute('data-ab-private-ready')) el.setAttribute('data-ab-private-ready','');
    return money;
  }
  var observer=new MutationObserver(function(records) {
    if (!active) return;
    (records || []).forEach(function(record) {
      var nodes=record.type==='characterData' ? [record.target] : Array.from(record.addedNodes || []);
      nodes.forEach(function(node) {
        if (!wrap(node.nodeType===3 ? node.parentElement : node)) return;
        for (var parent=node.parentElement; parent; parent=parent.parentElement) {
          if (!parent.hasAttribute('data-ab-private-ready')) parent.setAttribute('data-ab-private-ready','');
        }
      });
    });
  });
  function start() {
    if (active || suspended) return;
    wrap(html); wrapped=true; active=true; observer.observe(html,{childList:true,subtree:true,characterData:true});
  }
  function stop(restore) {
    observer.disconnect(); active=false;
    if (!restore || !wrapped) return;
    document.querySelectorAll('span.abPrivateAmount').forEach(function(el){el.replaceWith(document.createTextNode(el.textContent));});
    document.querySelectorAll('[data-ab-private-svg]').forEach(function(el){el.classList.remove('abPrivateAmount');el.removeAttribute('data-ab-private-svg');el.removeAttribute('data-ab-amount-revealed');});
    document.querySelectorAll('[data-ab-private-ready]').forEach(function(el){el.removeAttribute('data-ab-private-ready');}); wrapped=false;
  }
  function sync() { if (html.hasAttribute('data-ab-hide-amounts')) start(); else stop(true); }
  function storage(event) { if(event.key==='abHideAmounts'){html.toggleAttribute('data-ab-hide-amounts',event.newValue==='1');sync();} }
  sync(); window.addEventListener('ab:amount-privacy',sync); window.addEventListener('storage',storage);
  window.addEventListener('pagehide',function(){suspended=true;stop(false);});
  window.addEventListener('pageshow',function(event){if(event.persisted){suspended=false;sync();}});
}

// <!-- Lucian UX/UI Prompt #138 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#138 -->
function accountbookAmountPrivacyClientMain() {
  var html=document.documentElement, key='abHideAmounts', reveals=new Map();
  function isHidden(){return html.hasAttribute('data-ab-hide-amounts');}
  function clearReveals(){observer.disconnect();reveals.forEach(function(timer,el){clearTimeout(timer);el.removeAttribute('data-ab-amount-revealed');});reveals.clear();}
  var observer=new MutationObserver(function(){reveals.forEach(function(timer,el){if(!el.isConnected){clearTimeout(timer);reveals.delete(el);}});if(!reveals.size)observer.disconnect();});
  function sync(){document.querySelectorAll('[data-ab-hide-toggle]').forEach(function(button){button.setAttribute('aria-pressed',String(isHidden()));button.setAttribute('aria-label',isHidden()?'금액 가리기 끄기':'금액 가리기 켜기');});}
  function apply(hidden){html.toggleAttribute('data-ab-hide-amounts',hidden);if(!hidden)clearReveals();window.dispatchEvent(new Event('ab:amount-privacy'));sync();}
  function toggle(){var hidden=!isHidden();try{localStorage.setItem(key,hidden?'1':'0');}catch(_error){}apply(hidden);}
  var icon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="abEyeSlash" d="m3 3 18 18"/></svg>';
  document.querySelectorAll('.abNavMobileTop,.abNavTop').forEach(function(bar){var button=document.createElement('button');button.type='button';button.className='abPrivacyEye';button.setAttribute('data-ab-hide-toggle','');button.innerHTML=icon;button.title='금액 가리기 · 화면에서만 가립니다';bar.appendChild(button);});
  var panel=document.querySelector('.abAppearancePanel');
  if(panel){var row=document.createElement('div');row.className='abPrivacySetting';row.innerHTML='<div><b>금액 가리기</b><p>화면에서만 가립니다. 보조기기는 금액을 읽을 수 있습니다.</p></div><button type="button" data-ab-hide-toggle>금액 가리기</button>';panel.appendChild(row);}
  function click(event){
    if(event.target.closest('[data-ab-hide-toggle]')){toggle();return;}
    var amount=event.target.closest('.abPrivateAmount');if(!amount||!isHidden())return;
    event.preventDefault();event.stopImmediatePropagation();clearTimeout(reveals.get(amount));amount.setAttribute('data-ab-amount-revealed','');
    reveals.set(amount,setTimeout(function(){amount.removeAttribute('data-ab-amount-revealed');reveals.delete(amount);if(!reveals.size)observer.disconnect();},3000));
    observer.observe(document.body,{childList:true,subtree:true});
  }
  function storage(event){if(event.key===key)apply(event.newValue==='1');}
  sync();
  document.addEventListener('click',click,true);window.addEventListener('storage',storage);
  function cleanup(){clearReveals();document.removeEventListener('click',click,true);window.removeEventListener('storage',storage);window.removeEventListener('pagehide',cleanup);}
  window.addEventListener('pagehide',cleanup);
  window.addEventListener('pageshow',function(event){if(event.persisted){document.addEventListener('click',click,true);window.addEventListener('storage',storage);window.addEventListener('pagehide',cleanup);sync();}});
}
// @build:exports-start
export {
  accountbookAmountMaskClientMain, accountbookAmountPrivacyClientMain,
  accountbookCelebrationClientMain, accountbookEmptyFolderClientMain, accountbookTourClientMain,
};
// @build:exports-end
