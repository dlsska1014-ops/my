// V22.9.32 — `.toString()` 으로 브라우저에 내려보내는 클라이언트 함수는 Worker 의 다른 최상위 이름에 기대지 않는다.
//
// 서버 함수가 `clientMain.toString()` 을 HTML·자산에 끼워 넣으면, 브라우저에는 그 함수 본문만 간다.
// 본문이 Worker 쪽 최상위 이름(escapeHtml 같은 서버 도우미)을 부르면 서버 검사는 통과하고
// 브라우저에서만 ReferenceError 가 난다. 모듈로 나눈 뒤에는 이런 참조가 눈에 덜 띄므로 고정한다.
//
// 허용되는 참조는 둘뿐이다.
//   1) 같은 서버 함수가 함께 직렬화하는 다른 클라이언트 함수(같은 스크립트·같은 화면에 함께 간다).
//   2) 아래 PAGE_GLOBALS 에 적은, 다른 스크립트가 같은 화면에 전역으로 내려 주는 함수.
//      적은 제공자가 여전히 그 함수를 직렬화하는지도 함께 본다.
// 직렬화되는 바이트 자체(자산 주소·해시)는 기존 불변 자산 검사와 실행 검사가 지킨다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { freeReferences, parseModule, serializationSites, topLevelDeclarations } from "../tools/worker-analysis.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

// quickSmartInputController(renderMobileV81Html 의 인라인 스크립트)는 입력을 해석할 때 두 함수를 전역으로
// 부른다. 모든 HTML 응답은 attachUiUxRuntime 을 거치며 그 UI 런타임이 두 함수를 싣고, 최적화된 모바일
// 홈은 대신 모바일 홈 자산(mobileHomeJsAsset)이 같은 함수를 싣는다.
const PAGE_GLOBALS = [
  { client: "quickSmartInputController", name: "moneyTokenSpans", providers: ["attachUiUxRuntime", "mobileHomeJsAsset"] },
  { client: "quickSmartInputController", name: "explicitDateIntent", providers: ["attachUiUxRuntime", "mobileHomeJsAsset"] },
];

const program = parseModule(readFileSync(fileURLToPath(new URL("../src/index.js", import.meta.url)), "utf8"));
const declarations = topLevelDeclarations(program);
const byName = new Map(declarations.flatMap((d) => d.names.map((name) => [name, d])));
const sites = serializationSites(program);
const targets = [...new Set(sites.map((site) => site.target))].sort();
const serializedAt = new Map();
for (const site of sites) {
  if (!serializedAt.has(site.site)) serializedAt.set(site.site, new Set());
  serializedAt.get(site.site).add(site.target);
}

ok(sites.length >= 40 && targets.length >= 30, `직렬화 지점을 찾았다 (지점 ${sites.length}곳, 클라이언트 함수 ${targets.length}개)`);
eq(targets.filter((name) => byName.get(name)?.kind !== "function").length, 0, "직렬화 대상은 모두 최상위 함수 선언이다(이름·본문이 곧 자산 바이트)");

// 지점마다 따로 본다. 여러 서버 함수가 같은 클라이언트 함수를 직렬화할 때, 한 지점에서만 함께 가는 함수는
// 다른 지점의 화면에는 없다(합집합으로 보면 그 화면의 ReferenceError 를 놓친다).
for (const target of targets) {
  const siteNames = [...serializedAt].filter(([, names]) => names.has(target)).map(([site]) => site);
  const allowed = new Set(PAGE_GLOBALS.filter((entry) => entry.client === target).map((entry) => entry.name));
  const references = [...new Set(freeReferences(byName.get(target).node).map((reference) => reference.name))]
    .filter((name) => name !== target && byName.has(name) && !allowed.has(name));
  const outside = siteNames.flatMap((site) => references.filter((name) => !serializedAt.get(site).has(name)).map((name) => `${name} (${site})`));
  eq(outside.length, 0, `${target} 는 직렬화되는 지점마다 그 지점에서 함께 직렬화되는 함수 외의 Worker 최상위 이름을 부르지 않는다${outside.length ? ` — ${outside.join(", ")}` : ""}`);
}

for (const entry of PAGE_GLOBALS) {
  const used = freeReferences(byName.get(entry.client).node).some((reference) => reference.name === entry.name);
  ok(used, `${entry.client} 가 아직 ${entry.name} 를 쓴다 — 쓰지 않게 됐으면 허용 목록에서 지운다`);
  const providing = entry.providers.filter((provider) => serializedAt.get(provider)?.has(entry.name));
  eq(providing.length, entry.providers.length, `${entry.name} 를 ${entry.providers.join("·")} 가 화면 전역으로 계속 싣는다`);
}

console.log(`클라이언트 함수 ${targets.length}개, 직렬화 지점 ${sites.length}곳, 화면 전역 허용 ${PAGE_GLOBALS.length}건`);
console.log(`V22.9.32 클라이언트 직렬화 자체 완결 검사 통과 (${checks} checks)`);
