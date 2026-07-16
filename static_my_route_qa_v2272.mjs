import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("./src/index.js", import.meta.url), "utf8");
let assertions = 0;
const has = (value, message) => { assert.ok(source.includes(value), message); assertions += 1; };

has('safeHtmlRoute(request, url, () => handleMyPage(request, env, url), "내 가계부")', "/my has route isolation");
has('kind: "merged_session_recovery_deferred"', "session recovery failures are observable");
has('return null;\n  }\n}', "session recovery can defer without blocking routing");
has('>다시 시도</a>', "emergency screen has an explicit retry action");
assert.ok(!source.includes('href="${origin}/my">내 가계부로 이동</a>'), "emergency screen no longer loops through /my"); assertions += 1;

console.log(`STATIC_MY_ROUTE_QA_V2272_OK assertions=${assertions}`);
