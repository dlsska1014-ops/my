import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import app from '../src/index.js';
import {createV2265QaFixture} from './qa-fixture.mjs';
import {collectUptime} from '../monitoring/worker.mjs';
import {parseDatabaseMetrics} from '../monitoring/model.mjs';
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++},eq=(a,b,m)=>{assert.equal(a,b,m);checks++};
const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
ok(source.includes('document.body.classList.toggle("abHasActivityRail", wide)'), 'rail reservation tracks actual visibility including resize');
const railCss=source.slice(source.indexOf('body.abV22812Shell .abActivityRail{display:none}'),source.indexOf('body.abV22812Shell .abActivityHead'));
ok(railCss.includes('@media(min-width:1320px)'), 'CSS uses the actual rail display breakpoint');
ok(railCss.includes('body.abV22812Shell.abHasActivityRail{padding-right:var(--abActivityRailW)!important}'),'all visible-rail pages reserve its width');
ok(!railCss.includes('abMobileAppSurface'),'transaction layout does not inherit home-only styles');
ok(railCss.includes('abHasActivityRail .abQuickInputOverlay')||railCss.includes('abHasActivityRail .abDayDetailOverlay'),'overlay centering respects the rail');
ok(railCss.includes('abPageSettings .rowform{grid-template-columns:repeat(2,minmax(0,1fr))}'),'narrow desktop settings form can shrink');
const fixture=await createV2265QaFixture();
try{
 const before=JSON.stringify(fixture.db.transactions);
 const house=fixture.db.households.find(h=>h.id==='house-home');house.name='가족 · owner <여행> "2026"';
 for(const path of ['/my/backup?mode=backup','/my/backup?mode=import','/my/members']){
  const response=await app.fetch(new Request('https://malhaebook.com'+path+(path.includes('?')?'&':'?')+'month=2026-07&household_id=house-home',{headers:{cookie:fixture.cookie}}),fixture.env,{});
  const html=await response.text();eq(response.status,200,'legacy page renders');
  ok(html.includes('data-household-name="가족 · owner &lt;여행&gt; &quot;2026&quot;"'),'household identity is separated and escaped');
  ok(html.includes('title="가족 · owner &lt;여행&gt; &quot;2026&quot;"'),'sidebar preserves literal separators and full name');
  ok(!html.includes('가족 · owner &lt;여행&gt; &quot;2026&quot; · owner'),'role label is localized');
  ok(html.includes('소유자</option>'),'selected option retains localized role');
 }
 eq(JSON.stringify(fixture.db.transactions),before,'layout checks do not mutate trades');
 for(const [path,etag]of [['accountbook-shell-v22925.css','"accountbook-shell-v22925-css"'],['accountbook-v5-v22934.js','"accountbook-v5-v22934-js"']]){
  const response=await app.fetch(new Request('https://malhaebook.com/assets/'+path),fixture.env,{});
  eq(response.status,200,'new immutable asset is served');eq(response.headers.get('etag'),etag,'asset cache identity advances');
  ok(response.headers.get('cache-control').includes('immutable'),'immutable caching remains');
 }
}finally{fixture.restore();}
const providerMetrics=parseDatabaseMetrics('pg_database_size_mb{supabase_project_ref="fixture"} 12.5\npg_stat_database_num_backends{supabase_project_ref="fixture"} 7\nmax_connections_connection_count{supabase_project_ref="fixture"} 60');
eq(providerMetrics.database_bytes,12.5*1024*1024,'project-scoped database metric without datname is accepted');
eq(providerMetrics.connections,7,'current provider connection metric is accepted');
eq(providerMetrics.max_connections,60,'current provider connection limit metric is accepted');
const previousFetch=globalThis.fetch;
try{
 globalThis.fetch=async(url,options)=>{
  eq(options.redirect,'manual','Workers supported redirect mode is used');
  return Response.json(url.endsWith('/ready')?{ready:true}:{alive:true});
 };
 const healthy=await collectUptime({APP_ORIGIN:'https://malhaebook.com'},new Date());
 eq(healthy.checks[0].ok,true,'health JSON is checked');eq(healthy.checks[1].ok,true,'readiness JSON is checked');
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://example.invalid'}});
 const redirected=await collectUptime({APP_ORIGIN:'https://malhaebook.com'},new Date());
 eq(redirected.checks[0].status,302,'redirect status is retained for diagnosis');eq(redirected.checks[0].ok,false,'a redirect is never followed or reported healthy');
}finally{globalThis.fetch=previousFetch;}
console.log(`PASS: responsive operations regression (${checks} checks)`);
