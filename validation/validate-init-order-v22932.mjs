// V22.9.32 — 모듈 연결 순서에서, 로드 때 평가되는 최상위 문장이 읽는 상수는 그보다 앞에 선언돼 있다.
//
// src/index.js 는 MANIFEST.txt 순서로 모듈을 이은 것이다. 함수 선언은 끌어올려지지만 const·let·class 는
// 선언 줄에 닿기 전에 읽으면 ReferenceError(TDZ)다. 지금은 연결 순서가 원본 순서와 같아 안전하고,
// 하네스의 ESM 진입점 검사가 실제 로드로 확인한다. 이 검사는 4단계처럼 선언을 옮기거나 모듈 순서를
// 바꿀 때 "어느 상수가 어느 상수보다 앞에 있어야 하는지"를 이름으로 알려 주려고 둔다.
//
// 로드 때 평가되는 것: 최상위 const/let/var 초기화, class 의 extends·정적 필드·정적 블록, 최상위 식 문장,
// export default. 그 안에서 바로 실행되지 않는 함수 본문은 건너뛰고, 바로 부르는 최상위 함수(`f()`,
// `new F()`, 태그 템플릿)는 그 본문까지 따라간다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { freeReferences, parseModule, topLevelDeclarations } from "../tools/worker-analysis.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const EVALUATED = new Set(["const", "let", "var", "class", "statement", "export-default"]);

function initOrderReport(text) {
  const declarations = topLevelDeclarations(parseModule(text));
  const byName = new Map(declarations.flatMap((d) => d.names.map((name) => [name, d])));
  const reads = [];
  for (const declaration of declarations) {
    if (!EVALUATED.has(declaration.kind)) continue;
    const seen = new Map();
    const called = new Set();
    const queue = [{ references: freeReferences(declaration.node, { deferFunctions: true }), via: [] }];
    while (queue.length) {
      const { references, via } = queue.shift();
      for (const reference of references) {
        const target = byName.get(reference.name);
        if (!target || (via.length === 0 && declaration.names.includes(reference.name))) continue;
        if (target.kind === "function") {
          if (reference.call && !called.has(reference.name)) {
            called.add(reference.name);
            queue.push({ references: freeReferences(target.node, { deferFunctions: true }), via: [...via, reference.name] });
          }
          continue;
        }
        if (!seen.has(reference.name)) seen.set(reference.name, via);
      }
    }
    for (const [name, via] of seen) {
      reads.push({ reader: declaration.names.join(",") || `${declaration.kind}#${declaration.index}`, name, via, ok: byName.get(name).index < declaration.index });
    }
  }
  return reads;
}

// 1. 검사기 자체 — 순서 위반, 함수 호출을 거친 위반을 잡고, 나중에 실행되는 함수 본문은 넘긴다
const violationsOf = (code) => initOrderReport(code).filter((read) => !read.ok).map((read) => `${read.reader}<${read.name}${read.via.length ? ` via ${read.via.join(">")}` : ""}`);
eq(violationsOf("const A = B + 1; const B = 1;").join(" "), "A<B", "뒤에 선언된 상수를 바로 읽으면 잡는다");
eq(violationsOf("const A = f(); function f() { return B; } const B = 1;").join(" "), "A<B via f", "바로 부른 함수 본문이 뒤의 상수를 읽어도 잡는다");
eq(violationsOf("const A = () => B; const C = { m() { return B; } }; const B = 1;").length, 0, "나중에 실행되는 함수·메서드 본문은 넘긴다");
eq(violationsOf("const A = (() => B)(); const B = 1;").join(" "), "A<B", "즉시 실행 함수 본문은 따라간다");
eq(violationsOf("class K extends Base {} const Base = class {};").join(" "), "K<Base", "class 의 extends 도 로드 때 평가로 본다");
eq(violationsOf("export default W; const W = {};").join(" "), "export-default#0<W", "export default 도 로드 때 평가로 본다");

// 2. src/index.js — 로드 때 읽는 상수는 모두 앞에 있다
const reads = initOrderReport(readFileSync(fileURLToPath(new URL("../src/index.js", import.meta.url)), "utf8"));
const bad = reads.filter((read) => !read.ok).map((read) => `${read.reader} 가 뒤에 선언된 ${read.name} 를 읽는다${read.via.length ? ` (${read.via.join(" → ")} 경유)` : ""}`);
eq(bad.length, 0, `로드 때 읽는 최상위 상수는 모두 앞에 선언돼 있다${bad.length ? ` — ${bad.slice(0, 3).join("; ")}` : ""}`);
// 계획서 4.7 의 초기화 위험 6건을 이 검사기가 실제로 보고 있는지 — 못 보면 검사가 헛돈다
for (const [reader, name] of [
  ["FINAL_RELEASE_VERSION", "APP_VERSION"],
  ["ACCOUNTBOOK_SHELL_CSS", "ACCOUNTBOOK_SHELL_V22811_CSS"],
  ["AB_WEB_MANIFEST_JSON", "AB_WEB_MANIFEST"],
  ["AB_MANIFEST_LINK", "AB_MANIFEST_PATH"],
  ["AB_ICON_ROUTES", "AB_MANIFEST_PATH"],
  ["AB_CATEGORY_RULES_SCRIPT_TAG", "AB_CATEGORY_RULES_ASSET_PATH"],
]) {
  ok(reads.some((read) => read.reader === reader && read.name === name && read.ok), `${reader} 가 ${name} 를 로드 때 읽는 것을 보고, 순서가 맞다`);
}

console.log(`로드 때 다른 최상위 상수를 읽는 문장 ${new Set(reads.map((read) => read.reader)).size}개, 읽기 ${reads.length}건`);
console.log(`V22.9.32 초기화 순서 검사 통과 (${checks} checks)`);
