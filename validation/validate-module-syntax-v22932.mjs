// V22.9.32 — src/modules 의 모듈마다 단독 ES 모듈로 읽히고, import/export 표시가 지금 코드와 맞다.
//
// 모듈 머리·꼬리의 `// @build:imports-*`, `// @build:exports-*` 블록은 빌드가 지우므로 배포 파일은
// 바뀌지 않는다. 대신 편집기와 에이전트가 "이 이름은 어디서 왔나"를 모듈 하나만 보고 알 수 있다.
// 그 표시가 틀리면 오히려 길을 잃게 하므로 다음을 고정한다.
//   - 표시는 tools/annotate-modules.mjs 가 지금 코드에서 계산한 것과 같다(npm run build:worker 가 갱신).
//   - 모듈마다 표시를 포함해 단독 ES 모듈로 파싱된다(이름 중복·없는 이름 export 는 여기서 걸린다).
//   - import 한 이름은 그 모듈이 실제로 export 한다.
//   - 다른 모듈의 최상위 let 에 값을 넣는 곳(진짜 ESM 에서는 읽기 전용이라 실패)은 알려진 목록뿐이다.
//   - 분석에 쓰는 acorn 은 npm acorn@8.16.0 원본 그대로다.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planAnnotations } from "../tools/annotate-modules.mjs";
import { ACORN_VERSION, parseModule, topLevelDeclarations } from "../tools/worker-analysis.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const preview = (items) => (items.length ? ` — ${items.slice(0, 3).join("; ")}${items.length > 3 ? ` 외 ${items.length - 3}개` : ""}` : "");

const root = fileURLToPath(new URL("../", import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// 1. 벤더 acorn
eq(sha256(readFileSync(resolve(root, "tools/vendor/acorn.mjs"))), "efb0124a960b34d53f9928c4926bfcfd300bb6a3d7ab64ee949b3a8bed1c7e5f", "tools/vendor/acorn.mjs 는 npm acorn@8.16.0 의 dist/acorn.mjs 원본 그대로다");
eq(ACORN_VERSION, "8.16.0", "분석 도구가 쓰는 acorn 판은 8.16.0 이다");
ok(readFileSync(resolve(root, "tools/vendor/acorn-LICENSE.txt"), "utf8").startsWith("MIT License"), "acorn 의 MIT 라이선스 원문을 함께 담는다");

// 2. 표시가 지금 코드와 같다
const plan = planAnnotations(resolve(root, "src/modules"));
const stale = plan.modules.filter((module) => module.current !== module.expected).map((module) => module.path);
eq(stale.length, 0, `import/export 표시가 지금 코드와 맞다 — 고치려면 npm run build:worker${preview(stale)}`);

// 3. 모듈마다 단독 ES 모듈로 파싱된다
const parsed = new Map();
for (const module of plan.modules) {
  let error = "";
  try { parsed.set(module.path, parseModule(module.current)); } catch (caught) { error = caught.message; }
  ok(parsed.has(module.path), `${module.path} 가 표시를 포함해 단독 ES 모듈로 파싱된다${error ? ` — ${error}` : ""}`);
}

// 4. 블록은 머리(imports)와 꼬리(exports)에만, 각각 많아야 하나
const misplaced = plan.modules.filter((module) => {
  const text = module.current;
  const count = (marker) => text.split(marker).length - 1;
  if (count("// @build:imports-start") > 1 || count("// @build:exports-start") > 1) return true;
  if (count("// @build:imports-start") === 1 && !text.startsWith("// @build:imports-start\n")) return true;
  if (count("// @build:exports-start") === 1 && !text.endsWith("// @build:exports-end\n")) return true;
  return false;
}).map((module) => module.path);
eq(misplaced.length, 0, `import 블록은 파일 머리, export 블록은 파일 꼬리에만 하나씩 있다${preview(misplaced)}`);

// 5. import 한 이름은 그 모듈이 export 한다
const exportedBy = new Map();
for (const [path, program] of parsed) {
  const names = new Set();
  for (const declaration of topLevelDeclarations(program)) {
    if (declaration.exported) declaration.names.forEach((name) => names.add(name));
    if (declaration.kind === "export-list") for (const specifier of declaration.statement.specifiers) names.add(specifier.exported.name ?? specifier.exported.value);
  }
  exportedBy.set(path, names);
}
const unresolved = [];
let importedNames = 0;
for (const [path, program] of parsed) {
  for (const statement of program.body.filter((node) => node.type === "ImportDeclaration")) {
    const target = posix.normalize(posix.join(posix.dirname(path), statement.source.value));
    for (const specifier of statement.specifiers) {
      importedNames += 1;
      if (!exportedBy.get(target)?.has(specifier.imported?.name)) unresolved.push(`${path} → ${target}:${specifier.imported?.name}`);
    }
  }
}
ok(importedNames > 1000, `모듈 사이 import 이름을 찾았다 (${importedNames}개)`);
eq(unresolved.length, 0, `import 한 이름은 모두 그 모듈이 export 한다${preview(unresolved)}`);

// 6. 다른 모듈의 최상위 let 에 값을 넣는 곳 — 지연 생성 자산 캐시 10개뿐(4단계에서 캐시 옆으로 옮길 대상)
const KNOWN_CROSS_WRITES = [
  "assets/theme-home-assets.js writes AB_ACCOUNTBOOK_THEME_JS_CACHE (assets/asset-registry.js)",
  "assets/theme-home-assets.js writes AB_MOBILE_HOME_CSS_CACHE (assets/asset-registry.js)",
  "assets/theme-home-assets.js writes AB_MOBILE_HOME_JS_CACHE (assets/asset-registry.js)",
  "client/nav-search-notif-mains.js writes AB_ACCOUNTBOOK_NOTIF_JS_CACHE (assets/asset-registry.js)",
  "client/nav-search-notif-mains.js writes AB_ACCOUNTBOOK_SEARCH_JS_CACHE (assets/asset-registry.js)",
  "client/nav-search-notif-mains.js writes AB_ACCOUNTBOOK_STAGE4_NAV_JS_CACHE (assets/asset-registry.js)",
  "client/nav-search-notif-mains.js writes AB_MOBILE_HOME_SHELL_JS_CACHE (assets/asset-registry.js)",
  "client/v5-bundle-mains.js writes AB_ACCOUNTBOOK_FAVROWS_JS_CACHE (assets/asset-registry.js)",
  "client/v5-bundle-mains.js writes AB_ACCOUNTBOOK_GOALS_JS_CACHE (assets/asset-registry.js)",
  "client/v5-bundle-mains.js writes AB_ACCOUNTBOOK_V5_BUNDLE_JS_CACHE (assets/asset-registry.js)",
];
const writes = [...new Set(plan.crossWrites)].sort();
const unexpectedWrites = writes.filter((line) => !KNOWN_CROSS_WRITES.includes(line));
eq(unexpectedWrites.length, 0, `다른 모듈의 최상위 변수에 새로 값을 넣지 않는다 — 진짜 ESM 에서는 import 가 읽기 전용이다${preview(unexpectedWrites)}`);
const resolvedWrites = KNOWN_CROSS_WRITES.filter((line) => !writes.includes(line));
eq(resolvedWrites.length, 0, `알려진 목록에서 사라진 항목은 이 검사에서도 지운다${preview(resolvedWrites)}`);

console.log(`모듈 ${plan.modules.length}개, import 이름 ${importedNames}개, 모듈 간 대입 ${writes.length}곳(알려진 목록)`);
console.log(`V22.9.32 모듈 단독 문법·표시 검사 통과 (${checks} checks)`);
