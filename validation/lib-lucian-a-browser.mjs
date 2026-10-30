import vm from "node:vm";

// DOM subset for the shipped client. Native layout, caret and composition also run in Chrome.
// V22.9.90: fetch 를 주면 VM 안에서 전역 fetch 로 쓴다(가계부 분류 요청 검사). 주지 않으면 예전처럼 fetch 가 없다.
export function createInputBrowser({ writer=true, fetch }={}) {
 const listeners=()=>({handlers:new Map(),addEventListener(type,fn,capture=false){const list=this.handlers.get(type)||[];list.push({fn,capture:!!capture});this.handlers.set(type,list);}});
 const run=(target,event,capture)=>{for(const entry of target.handlers?.get(event.type)||[]){if(capture!==undefined&&entry.capture!==capture)continue;entry.fn(event);if(event.stopped)break;}};
 let document;
 class Element {
  constructor(tag){Object.assign(this,listeners());this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.attrs=new Map();this.dataset=Object.create(null);this.value="";this._text="";this.hidden=false;this.checked=false;this.selectionStart=this.selectionEnd=0;}
  get id(){return this.attrs.get("id")||"";}set id(v){this.attrs.set("id",v);}
  get type(){return this.attrs.get("type")||"text";}set type(v){this.attrs.set("type",v);}
  get className(){return this.attrs.get("class")||"";}set className(v){this.attrs.set("class",v);}
  get classList(){const node=this;return {toggle(name,on){const c=new Set(node.className.split(" ").filter(Boolean));if(on)c.add(name);else c.delete(name);node.className=[...c].join(" ");}};}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join("");}set textContent(v){this._text=String(v);this.children=[];}
  setAttribute(k,v){this.attrs.set(k,String(v));if(k==="value")this.value=String(v);if(k==="checked")this.checked=true;}getAttribute(k){return this.attrs.get(k)??null;}
  appendChild(child){child.parentElement=this;this.children.push(child);return child;}append(...children){for(const child of children)this.appendChild(child);}
  after(child){const p=this.parentElement;child.parentElement=p;p.children.splice(p.children.indexOf(this)+1,0,child);}
  matches(s){const tag=s.match(/^[\w-]+/);if(tag&&tag[0].toUpperCase()!==this.tagName)return false;const id=s.match(/#([\w-]+)/);if(id&&this.id!==id[1])return false;for(const m of s.matchAll(/\.([\w-]+)/g))if(!this.className.split(" ").includes(m[1]))return false;for(const m of s.matchAll(/\[([\w-]+)(?:="?([^"\]]+)"?)?\]/g))if(!this.attrs.has(m[1])||(m[2]!==undefined&&this.attrs.get(m[1])!==m[2]))return false;return !s.includes(":checked")||this.checked;}
  closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}contains(n){return this===n||this.children.some(x=>x.contains(n));}
  querySelectorAll(s){return this.children.flatMap(n=>[...(n.matches(s)?[n]:[]),...n.querySelectorAll(s)]);}querySelector(s){return this.querySelectorAll(s)[0]||null;}
  setCustomValidity(v){this.validationMessage=v;}focus(){document.activeElement=this;}select(){this.setSelectionRange(0,this.value.length);}setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}scrollIntoView(){this.scrolled=true;}
  get validity(){return {valid:!this.validationMessage};}
  dispatchEvent(e){return dispatch(this,e.type,e);}click(){dispatch(this,"click");}
 }
 const body=new Element("body"),head=new Element("head");
 document=Object.assign(listeners(),{body,head,activeElement:body,createElement:tag=>new Element(tag),getElementById:id=>body.querySelector('#'+id),querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s),dispatchEvent:e=>{run(document,e,true);run(document,e,false);}});
 function dispatch(target,type,extra={}){const e={target,type,stopped:false,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};run(document,e,true);if(!e.stopped)for(let n=target;n;n=n.parentElement){run(n,e);if(e.stopped)break;}if(!e.stopped)run(document,e,false);return !e.defaultPrevented;}
 function element(tag,attrs={},parent=body){const n=new Element(tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);parent.appendChild(n);return n;}
 const section=element("section",{id:"add"}),line=element("div",{class:"smartLine"},section),smart=element("input",{id:"smartInput"},line),form=element("form",{},section);
 const fields={};
 if(writer){
  for(const [id,name,type,value]of [["amountInput","amount","text",""],["memoInput","memo","text",""],["txDate","transaction_date","date","2026-07-15"],["catInput","category","text",""],["payInput","payment_method","text",""]])fields[id]=element("input",{id,name,type,value},form);
  const details=element("details",{id:"quickMore"},form);for(const id of ["txDate","catInput","payInput"]){form.children.splice(form.children.indexOf(fields[id]),1);details.appendChild(fields[id]);}
  fields.expense=element("input",{type:"radio",name:"type",value:"expense",checked:""},form);fields.income=element("input",{type:"radio",name:"type",value:"income"},form);
  element("input",{type:"hidden",name:"month",value:"2026-07"},form);
  fields.after=element("p",{id:"quickAfter","data-bsc":"[20260715,0]","data-has-budget":"1","data-remaining":"10000"},form);
 }
 const context=vm.createContext({...(typeof fetch==='function'?{fetch}:{}),document,Event:class{constructor(type,options){this.type=type;Object.assign(this,options);}},queueMicrotask,setTimeout,clearTimeout,console});
 return {body,head,document,form,smart,fields,element,run(source){vm.runInContext(typeof source==='function'?'('+source.toString()+')()':source,context);},click:target=>dispatch(target,"click"),fire:(target,type,extra)=>dispatch(target,type,extra),async flush(){await new Promise(resolve=>setImmediate(resolve));},set(id,value){fields[id].value=value;dispatch(fields[id],"input");},button(key){return body.querySelectorAll("button").find(n=>n.dataset.abInputField===key);},add(value){return body.querySelectorAll("button").find(n=>n.dataset.abAmountAdd===String(value));}};
}
