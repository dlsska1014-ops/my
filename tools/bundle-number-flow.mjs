#!/usr/bin/env node
// src/index.js 안의 NUMBER_FLOW_ASSET_SOURCE 를 어떻게 만들었는지 남기는 스크립트다.
// 담아 온 코드는 되짚을 수 있어야 한다 — 이 파일이 그 되짚는 방법이다.
//
//   1) npm 레지스트리에서 원본을 받는다(의존성을 설치하지 않는다):
//        curl -sSL https://registry.npmjs.org/number-flow/-/number-flow-0.6.2.tgz -o nf.tgz
//        mkdir -p nf && tar xzf nf.tgz -C nf
//   2) 이 스크립트를 그 폴더 옆에서 돌린다:
//        node tools/bundle-number-flow.mjs nf/package
//   3) 나온 파일의 SHA-256 이 validate-number-transitions-v22893.mjs 에 고정된 값과
//      같아야 한다. 다르면 라이브러리 버전이나 합치는 방식이 달라진 것이다.
//
// number-flow 0.6.2 는 5개 ESM 파일 + esm-env 심으로 나뉘어 있다. 9.4 는 버전 주소
// 하나로 배포하라고 하므로 여기서 한 파일로 합친다. 각 모듈을 즉시실행 함수로 감싸
// 내보내기 객체를 만들고, import 문을 그 객체에서 꺼내는 구조분해로 바꾼다.
// 라이브러리 코드 자체는 한 글자도 고치지 않는다.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const packageRoot = resolve(process.argv[2] || "nf/package");
const dist = `${packageRoot}/dist/`;
const order = [
  ["ssr", "ssr-DvIINv8w.mjs"],
  ["plugins", "plugins.mjs"],
  ["csp", "csp.mjs"],
  ["lite", "lite.mjs"],
  ["index", "index.mjs"],
];
const idOf = (spec) => {
  if (spec === "esm-env") return null;
  const found = order.find(([, name]) => name === spec.replace("./", ""));
  if (!found) throw new Error(`unknown import: ${spec}`);
  return found[0];
};

const chunks = [];
for (const [id, file] of order) {
  let src = readFileSync(`${dist}${file}`, "utf8");
  const lines = [];
  for (const [full, clause, spec] of [...src.matchAll(/^import\s+([^;]+?)\s+from\s*["']([^"']+)["'];/gm)]) {
    const target = idOf(spec);
    const named = clause.match(/\{([^}]*)\}/);
    if (target === null) {
      // esm-env: 브라우저로만 내려보내는 자산이므로 BROWSER 는 항상 참이다.
      // `BROWSER as o` 에서 지역 이름은 오른쪽(o)이다.
      if (named) for (const part of named[1].split(",")) {
        const local = part.trim().split(/\s+as\s+/).pop().trim();
        if (local) lines.push(`const ${local} = true;`);
      }
      src = src.replace(full, "");
      continue;
    }
    const defaultBinding = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (defaultBinding) lines.push(`const ${defaultBinding[1]} = __nf.${target}.default;`);
    if (named) lines.push(`const {${named[1].replace(/\s+as\s+/g, ": ")}} = __nf.${target};`);
    src = src.replace(full, "");
  }
  // 마지막 export 블록을 반환문으로 바꾼다. export 는 `지역 as 내보낼이름` 순서라
  // 객체로 옮길 때 좌우를 바꿔야 한다(`B as default` → `default: B`). import 절과 반대다.
  const exportAt = src.lastIndexOf("\nexport {");
  if (exportAt < 0) throw new Error(`${file}: export block not found`);
  const block = src.slice(exportAt).replace(/^\s*export\s*\{/, "{")
    .replace(/([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/g, "$2: $1");
  src = src.slice(0, exportAt);
  chunks.push(`__nf.${id} = (function(){\n${lines.join("\n")}\n${src}\nreturn ${block.trim()};\n})();`);
}

const meta = JSON.parse(readFileSync(`${packageRoot}/package.json`, "utf8"));
const banner = `/*! number-flow v${meta.version} | MIT | (c) Maxwell Barvian | https://github.com/barvian/number-flow\n * 9.4: CDN 을 런타임에 참조하지 않는다(카카오톡 인앱에서 외부 도메인이 막히는 경우가 있다).\n * 원본 5개 ESM 파일을 한 파일로 합친 것 외에 코드를 고치지 않았다. */`;
const out = `${banner}\nconst __nf = {};\n${chunks.join("\n")}\nexport default __nf.index.default;\nexport const { define, prefersReducedMotion, renderInnerHTML, canAnimate, Digit } = __nf.index;\n`;
writeFileSync("number-flow-bundled.mjs", out);
console.log(`number-flow-bundled.mjs · ${Buffer.byteLength(out)} bytes`);
