// V22.9.9 — 1년 캐시 자산의 내용이 바뀌면 주소도 바뀌어야 한다.
//
// 이 저장소는 CSS·JS 를 `cache-control: max-age=31536000, immutable` 로 보낸다.
// 그 약속의 뜻은 "이 주소의 바이트는 앞으로 1년간 절대 안 바뀐다" 이다. 내용을 고치고
// 주소를 그대로 두면, **이미 받아 간 브라우저는 1년 동안 옛 화면을 본다.** 새 코드가
// 배포됐는데 사용자 화면만 안 바뀌는 상태이고, 서버 응답은 정상이라 눈치채기 어렵다.
//
// ── 이 파일이 왜 생겼는지 ──
// 머리말을 조이면서 셸 CSS 와 테마 JS 의 내용을 바꿨는데, 주소를 올리지 않은 채로
// 자동 검사 4,612개가 **전부 통과했다.** 아무도 이 성질을 보고 있지 않았다는 뜻이다.
// (같은 일이 전에도 있었다 — 290 KB 의 CSS 가 옮겨 가는 동안 4,232개가 조용했다.)
//
// ── 어떻게 잡는가 ──
// 자산마다 지금 바이트의 해시를 여기 적어 둔다. 내용을 고치면 이 검사가 실패하고,
// 고치는 방법은 둘 중 하나다: 주소를 올리고 새 해시를 적거나(내용이 바뀐 경우),
// 되돌리거나. 어느 쪽이든 **사람이 한 번은 보게 된다** — 그게 이 검사의 전부다.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import app from "../src/index.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const ORIGIN = "https://ttokttok-accountbook.com";

// 주소 → 그 주소가 지금 돌려주는 바이트의 SHA-256.
// 내용을 고쳤으면 주소의 판 번호를 올리고 여기 해시를 새로 적는다.
const PINNED = {
  "/assets/accountbook-shell-v22911.css": "98577b29c0ece284b53cbccd4027545f30b463a993cf1aed54ad40722a83b516",
  "/assets/ab-uiux-v2290.css": "550b95eb681c4722bcf8d3c621d7e0d9d429ca6e81a9125ffff9153f592f63a5",
  "/assets/accountbook-theme-v2299.js": "865e3b33b494afd85462733cc0c1daeaa6e0cadca8bd0e2ccdc9684c7cc10623",
  "/assets/accountbook-nav-v22893.js": "c206a5b0597eb7b1070f58c7184db42f943da3ed3e596e6302cf0fe5b19e4724",
  "/assets/accountbook-v5-v22890.js": "bcc5be2d64d9c7a3be55e0bbe6e7d6f7131720e5975d82315d59c73bd91746da",
  "/assets/mobile-home-v2298.js": "589feb25681ad8f38f68bf66c783f1fe2ae482c5ca03c246d05b2dd9e1c1c071",
  "/assets/mobile-home-shell-v2298.js": "659107f71b0d2f815b653ac47c1b3b2c688338a7fbe492001fbaacf571405c8d",
  "/assets/ab-category-rules-v2296.js": "99257ae11ee08a35362072b6eeda62576fd69400f5784dd53df3b3fe9bf16138",
  "/assets/mobile-home-v2290.css": "1de74b06538d88685c7e4ac7dbb7f30cfd944f5149e921845df572f1bb57f3a2",
};

const measured = {};
for (const path of Object.keys(PINNED)) {
  const response = await app.fetch(new Request(`${ORIGIN}${path}`), {}, {});
  eq(response.status, 200, `${path} 가 서빙된다`);
  const cache = String(response.headers.get("cache-control") || "");
  ok(cache.includes("immutable"), `${path} 는 불변 자산이라고 선언한다`);
  const bytes = Buffer.from(await response.arrayBuffer());
  measured[path] = createHash("sha256").update(bytes).digest("hex");

  // ETag 는 주소와 같은 판 번호를 달아야 한다. 주소만 올리고 ETag 를 두면
  // 중간 캐시가 옛 바이트를 새 주소에 물려 줄 수 있다.
  const version = (path.match(/-(v\d+)\.(css|js)$/) || [])[1];
  const etag = String(response.headers.get("etag") || "");
  ok(version && etag.includes(version), `${path} 의 ETag 가 주소와 같은 판이다 (${etag})`);
}

const drifted = Object.keys(PINNED).filter((path) => PINNED[path] && PINNED[path] !== measured[path]);
if (drifted.length) {
  const lines = drifted.map((path) => `  ${path}\n    적힌 값 ${PINNED[path]}\n    실제 값 ${measured[path]}`);
  assert.fail(`1년 캐시 자산의 내용이 바뀌었는데 주소는 그대로입니다.\n`
    + `이미 받아 간 브라우저는 1년 동안 옛 화면을 봅니다. 주소의 판 번호를 올리고\n`
    + `이 파일의 해시를 새로 적으세요(내용을 되돌릴 생각이면 그렇게 해도 됩니다).\n${lines.join("\n")}`);
}
checks += 1;

// 아직 해시를 적지 않은 자산이 있으면 그대로 알려 준다. 빈 값으로 두면 이 검사는
// "통과"하지만 아무것도 지키지 않는다 — 그 상태를 조용히 두지 않는다.
const unpinned = Object.keys(PINNED).filter((path) => !PINNED[path]);
if (unpinned.length) {
  console.log("아래 자산의 해시를 validate-immutable-asset-addresses-v2299.mjs 에 적어 두세요:");
  for (const path of unpinned) console.log(`  "${path}": "${measured[path]}",`);
}
eq(unpinned.length, 0, `모든 불변 자산에 해시가 적혀 있다 (아직 ${unpinned.length}개 비어 있음)`);

console.log(`V22.9.9 불변 자산 주소 검사 통과 (${checks} checks)`);
