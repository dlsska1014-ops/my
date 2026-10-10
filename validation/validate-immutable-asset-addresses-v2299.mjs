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
const ORIGIN = "https://malhaebook.com";

// 주소 → 그 주소가 지금 돌려주는 바이트의 SHA-256.
// 내용을 고쳤으면 주소의 판 번호를 올리고 여기 해시를 새로 적는다.
const PINNED = {
  // V22.9.37 감사 묶음 C: 셸 CSS(U4·U9·U14)와 내비·V5 번들·목표·행 즐겨찾기·검색·알림 JS(H1·U2·U3·U5·U10·U12)가 바뀌어
  // 주소를 올렸다. 옛 CSS 주소(v22925)는 더 내려가지 않고, 옛 JS 주소(nav-v22930·v5-v22934·goals-v22929·favrows-v22836·
  // search-v22929·notif-v22836)는 AB_HISTORICAL_RUNTIME_ASSETS 에 그대로 남아 아래 옛 해시로 계속 내려간다.
  "/assets/accountbook-shell-v22937.css": "c291a4ff033cb0211a2e3a9f0fe474928462dcd5dd5a8061ad6cf79aeb15758c",
  "/assets/ab-uiux-v22919.css": "59510e82bbd2b373da76dfa1a070d2ccb40232e115e23da5c23251403fcc9f0c",
  "/assets/accountbook-theme-v2299.js": "865e3b33b494afd85462733cc0c1daeaa6e0cadca8bd0e2ccdc9684c7cc10623",
  "/assets/accountbook-nav-v22930.js": "b76bebe25f3f0138e918129c7f34e4fa973f1dc53fec0ea905afc4a04bb9de60",
  "/assets/accountbook-nav-v22937.js": "c6c30dcbf5ea883ca539becccba221d6c7e616c39859441afc7c4e1fd6ba3ed8",
  "/assets/accountbook-goals-v22929.js": "1f52fca714cf0683555a75c8a2768f2b007273130ac05081757577aaedc38fe5",
  "/assets/accountbook-goals-v22937.js": "db29dc0af2818c48689e60479704c7ba9784113e846248b422fd6ecf81e57431",
  "/assets/accountbook-favrows-v22836.js": "04b2c5df73273baffbaf09b00a0f1e69871febafc24dae81d1f7238a9e3e9aa7",
  "/assets/accountbook-favrows-v22937.js": "d74d3a6086ee62c5341e111f6766ec787ecb9670ffd54e0623ed963f0125696c",
  "/assets/accountbook-search-v22929.js": "965589e96d188674d7a1dc151446201ec2197da3e0d4eada885c0f4bef8695ae",
  "/assets/accountbook-search-v22937.js": "a7a481a686a0e7ce71750b5748c6668933908b7cb2fa6e75665b94632e19912c",
  "/assets/accountbook-notif-v22836.js": "7a6ef7fe4ca223901e2dc29550add0fe23f3f61803b884ecfb4d6edba33cfc07",
  "/assets/accountbook-notif-v22937.js": "84a5d43252c9ff9986e552fa0352dcf67036a9332ba117f8848151b87040687d",
  "/assets/accountbook-v5-v22930.js": "98ea43f030df82121f90afb536769dc300576f71e480998382bbb5ed972d5b5e",
  "/assets/mobile-home-v22915.js": "38b828923a12319cd8b6055b3c7cf8c6bec9c7bcfaf0f77759ca14712d7ae290",
  "/assets/mobile-home-v22930.js": "ff513d9d5936fe1393489b98170ca7f7681ed8500d6edfe3f0eb4c9d10e1c416",
  "/assets/mobile-home-shell-v22930.js": "ba1c9fc28e05a228fe47a8fa052c843d34964aa03be53e38b7cf068518bd4239",
  // V22.9.33(QA B04): 웹 날짜 해석이 요일 표현을 읽으면서 두 자산이 바뀌어 주소를 올렸다. v22930 바이트는
  // AB_HISTORICAL_RUNTIME_ASSETS 에 그대로 남아 위 해시로 계속 내려간다.
  "/assets/mobile-home-v22933.js": "d294d13bbc7f45d07fcc6466229af2bb64bd087ca25c391ca72971524eec2ab6",
  "/assets/mobile-home-shell-v22933.js": "4aeb9097cd6a84056a6077e4e2856077f5ddc09ec623a527363145a6980e926e",
  // V22.9.34: 금액·날짜 해석(D1·N6·D15), 날짜 시트 수정 폼의 원래 값(B14), 원형 없는 집계 맵(SIM-10)으로 세 자산이
  // 바뀌어 주소를 올렸다. accountbook-v5-v22930·mobile-home(-shell)-v22933 바이트는 AB_HISTORICAL_RUNTIME_ASSETS 에 남아
  // 위 해시로 계속 내려간다.
  "/assets/accountbook-v5-v22934.js": "0c85fadaee93b78357fd32e9c9b595b66edd5d33601e51fc30ee6a746ad4463d",
  "/assets/accountbook-v5-v22937.js": "e3f03222a1401d551534e2e4ca038c4d06a6ceba47d097f6752e249d89a9bc33",
  "/assets/mobile-home-v22934.js": "143562ae7a41dfa30884227582a49507b5442bbf86dcf79ba890f09b184423e5",
  "/assets/mobile-home-shell-v22934.js": "1b3e04cfe5917fcebc86fbe55e9df1663290b597d4f70c93ae44ed7b419b7968",
  "/assets/ab-category-rules-v22926.js": "0b2cbae61f91c36acbd75c95aa08efdbcb1c150424b41e394f0d54e6247ad70c",
  "/assets/mobile-home-v22919.css": "0695bbde13382d71c11769607dabd7b70e91e1b7b83c8a4df4a8b92794d047f7",
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
