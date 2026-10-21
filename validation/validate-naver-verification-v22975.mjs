import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
let checks = 0;
const eq = (a,b,m) => { assert.equal(a,b,m); checks++; };
const tag = "<meta name=\"naver-site-verification\" content=\"7b69a98f38f2f22517982e0b6ed7da0a16160e98\"/>";
const origin = "https://malhaebook.com";
const get = (p, method="GET") => app.fetch(new Request(origin+p,{method}), {}, {});
const originalFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = async () => { outbound++; throw new Error("No outbound fetch expected"); };
try {
  const response = await get("/");
  eq(response.status,200,"home available");
  const html = await response.text();
  eq(html.includes(tag),true,"exact verification token on home");
  eq((html.match(/name="naver-site-verification"/g)||[]).length,1,"single verification tag");
  eq(html.indexOf(tag)<html.indexOf("</head>"),true,"verification within head");
  eq(html.includes("adsbygoogle"),false,"review mode does not load ads");
  for (const p of ["/articles","/about","/demo","/household-spending-statistics"]) {
    const page = await (await get(p)).text();
    eq(page.includes("naver-site-verification"),false,"home-only metadata: "+p);
  }
  eq((await (await get("/health")).json()).version,readFileSync(new URL("../VERSION.txt", import.meta.url),"utf8").trim(),"health version");
  eq(((await (await get("/sitemap.xml")).text()).match(/<loc>/g)||[]).length,51,"sitemap unchanged");
  eq(outbound,0,"public responses make no external requests");
} finally { globalThis.fetch = originalFetch; }
console.log("V22.9.75 Naver verification: "+checks+" checks passed");
