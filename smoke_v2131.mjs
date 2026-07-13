import app from './src/index.js';
const env={PUBLIC_BASE_URL:'https://ttokttok-accountbook.com'};
async function check(path, method='GET', body=null){
 const res=await app.fetch(new Request('https://ttokttok-accountbook.com'+path,{method,headers:{'content-type':'application/json'},body}),env,{waitUntil(){}});
 const text=await res.text();
 console.log(path, res.status, text.slice(0,80).replace(/\n/g,' '));
 if(res.status>=400) throw new Error(path+' '+res.status);
 return text;
}
await check('/health');
await check('/skill');
await check('/kakao-skill-test-payload.json?q=%EB%A9%94%EB%89%B4');
const payload=JSON.stringify({intent:{id:'test',name:'90'},userRequest:{timezone:'Asia/Seoul',params:{},block:{id:'b',name:'90'},utterance:'메뉴',lang:'kr',user:{id:'test-bot-user-key',type:'botUserKey',properties:{botUserKey:'test-bot-user-key'}}},bot:{id:'bot',name:'똑똑한가계부'},action:{id:'a',name:'skill',params:{},detailParams:{},clientExtra:{}},contexts:[]});
let t=await check('/skill','POST',payload); JSON.parse(t);
t=await check('/skill','POST','메뉴'); JSON.parse(t);
console.log('SMOKE PASS');
