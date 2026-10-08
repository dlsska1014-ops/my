// V22.9.32 — src/index.js 는 src/modules/ 를 이어 만든 생성 파일이다.
//
// 3MB·34,249줄 한 파일을 위치 그대로 모듈로 나눴다(docs/refactor/modularization-v1/PLAN.md).
// 검증과 배포는 계속 src/index.js 한 파일을 본다. 그래서 둘이 어긋나는 두 경우를 막는다:
//   1) 모듈을 고치고 src/index.js 를 다시 만들지 않았다 — 배포본에 수정이 빠진다.
//   2) src/index.js 를 직접 고쳤다 — 다음 빌드가 그 수정을 지운다.
// MANIFEST.txt 순서로 모듈을 다시 이어 SHA-256 을 src/index.js 의 바이트와 비교한다.
// 규칙(LF·BOM 없음·끝 줄바꿈 정확히 하나·마커 블록 짝)은 tools/build-worker.mjs 의 함수를
// 그대로 불러 쓴다. 검사와 빌드가 서로 다른 규칙을 가지면 둘 중 하나는 거짓말을 한다.
//
// src/modules/ 가 아예 없으면 분할 전 상태로 보고 저장소 검사를 같은 개수로 통과 처리한다.
// 폴더는 있는데 MANIFEST.txt 가 없으면 깨진 상태라 실패한다.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleWorker, checkModuleText, parseManifest, sha256 } from "../tools/build-worker.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const rejects = (fn, pattern, message) => { assert.throws(fn, pattern, message); checks += 1; };
const preview = (items) => (items.length ? ` — ${items.slice(0, 3).join(", ")}${items.length > 3 ? ` 외 ${items.length - 3}개` : ""}` : "");

// ---------------------------------------------------------------------------
// 1. 빌드 규칙 — 메모리 안의 작은 모듈로 확인한다.
// ---------------------------------------------------------------------------
const modulesFrom = (files) => (path) => {
  if (!(path in files)) throw new Error(`fixture missing ${path}`);
  return files[path];
};
const buildOne = (text) => assembleWorker(["a/x.js"], modulesFrom({ "a/x.js": text }));

eq(
  assembleWorker(["a/one.js", "a/two.js"], modulesFrom({ "a/one.js": "const a = 1;\n", "a/two.js": "const b = 2;\n" })),
  "const a = 1;\nconst b = 2;\n",
  "모듈을 구분자 없이 그대로 잇는다",
);
eq(
  buildOne([
    "// @build:imports-start",
    'import { a } from "./one.js";',
    "// @build:imports-end",
    "const b = a + 1;",
    "  // @build:exports-start",
    "export { b };",
    "  // @build:exports-end",
    "",
  ].join("\n")),
  "const b = a + 1;\n",
  "import/export 마커 블록만 지우고 나머지 바이트는 그대로 둔다",
);
eq(
  parseManifest("# build order\r\n\r\na/one.js\r\n  a/two.js  \n").join(","),
  "a/one.js,a/two.js",
  "MANIFEST.txt 의 주석·빈 줄·앞뒤 공백·CRLF 는 순서에 들어가지 않는다",
);
rejects(() => buildOne("const a = 1;"), /end with a newline/, "끝 줄바꿈이 없는 모듈을 거부한다");
rejects(() => buildOne("const a = 1;\n\n"), /exactly one newline/, "끝에 빈 줄이 붙은 모듈을 거부한다 — 편집기가 지우면 결과가 바뀐다");
rejects(() => buildOne("const a = 1;\r\n"), /CR found/, "CRLF 모듈을 거부한다");
rejects(() => buildOne(`${String.fromCharCode(0xfeff)}const a = 1;\n`), /BOM/, "BOM 으로 시작하는 모듈을 거부한다");
rejects(() => buildOne("// @build:imports-start\nconst a = 1;\n"), /unterminated/, "닫히지 않은 마커 블록을 거부한다");
rejects(() => buildOne("const a = 1;\n// @build:exports-end\n"), /stray/, "짝 없는 끝 마커를 거부한다");
rejects(
  () => assembleWorker(["a/x.js", "a/x.js"], modulesFrom({ "a/x.js": "const a = 1;\n" })),
  /duplicate manifest entry/,
  "MANIFEST.txt 에 같은 모듈이 두 번 있으면 거부한다",
);
rejects(() => assembleWorker([], modulesFrom({})), /no modules/, "빈 MANIFEST.txt 로 src/index.js 를 비우지 않는다");

// ---------------------------------------------------------------------------
// 2. 저장소 — 커밋된 src/index.js 가 모듈을 다시 이은 결과와 같다.
// ---------------------------------------------------------------------------
const REPOSITORY_CHECKS = 8;
const root = fileURLToPath(new URL("../", import.meta.url));
const modulesRoot = resolve(root, "src/modules");
const sourceBytes = readFileSync(resolve(root, "src/index.js"));
const walk = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]));

let detail;
if (!existsSync(modulesRoot)) {
  checks += REPOSITORY_CHECKS;
  detail = `src/modules/ 없음 — 분할 전 상태로 보고 저장소 검사 ${REPOSITORY_CHECKS}개를 통과 처리`;
} else {
  const before = checks;
  const manifestPath = resolve(modulesRoot, "MANIFEST.txt");
  ok(existsSync(manifestPath), "src/modules/ 가 있으면 빌드 순서 MANIFEST.txt 도 있다");
  const order = parseManifest(readFileSync(manifestPath, "utf8"));
  ok(order.length > 0, "MANIFEST.txt 가 모듈을 하나 이상 적는다");
  const repeated = order.filter((path, index) => order.indexOf(path) !== index);
  eq(repeated.length, 0, `MANIFEST.txt 에 같은 모듈이 두 번 나오지 않는다${preview(repeated)}`);
  const malformed = order.filter((path) => !/^[a-z0-9-]+(?:\/[a-z0-9-]+)+\.js$/.test(path));
  eq(malformed.length, 0, `MANIFEST.txt 항목은 하위 폴더 안 .js 파일의 상대 경로다${preview(malformed)}`);
  const missing = order.filter((path) => !existsSync(resolve(modulesRoot, path)));
  eq(missing.length, 0, `MANIFEST.txt 의 모듈 파일이 모두 있다${preview(missing)}`);
  const listed = new Set(order);
  const orphans = walk(modulesRoot)
    .map((file) => relative(modulesRoot, file).split(sep).join("/"))
    .filter((path) => path !== "MANIFEST.txt" && !listed.has(path));
  eq(orphans.length, 0, `src/modules/ 의 파일은 모두 MANIFEST.txt 에 있다 — 빌드에서 조용히 빠지는 파일이 없다${preview(orphans)}`);
  const texts = new Map(order.map((path) => [path, readFileSync(resolve(modulesRoot, path), "utf8")]));
  const broken = [];
  for (const [path, text] of texts) {
    try { checkModuleText(text, path); } catch (error) { broken.push(error.message); }
  }
  eq(broken.length, 0, `모듈은 모두 LF·BOM 없음·끝 줄바꿈 정확히 하나다${preview(broken)}`);
  const built = assembleWorker(order, (path) => texts.get(path));
  eq(
    sha256(built),
    sha256(sourceBytes),
    "MANIFEST.txt 순서로 다시 이은 결과가 커밋된 src/index.js 와 바이트까지 같다 — 모듈을 고쳤다면 npm run build:worker, src/index.js 를 직접 고쳤다면 그 수정을 모듈로 옮긴다",
  );
  assert.equal(checks - before, REPOSITORY_CHECKS, "저장소 검사 개수가 분할 전 통과 처리 개수와 같다");
  detail = `모듈 ${order.length}개 → ${Buffer.byteLength(built)} bytes, sha256 ${sha256(built)}`;
}

console.log(detail);
console.log(`V22.9.32 빌드 동일성 검사 통과 (${checks} checks)`);
