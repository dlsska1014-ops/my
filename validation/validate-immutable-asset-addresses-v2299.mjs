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
  // V22.9.84: 디자인 보강 1단계(T-01 칩·T-02 세그먼트·T-03 거래 행 읽기 이름·T-04 입력 카드 테두리·T-05 금액 색·T-06 줄바꿈·T-07 누름 반응)로
  // 셸 CSS·홈 스타일시트·V5 번들·홈 스크립트·홈 셸의 바이트가 바뀌어 다섯 주소를 v22984 로 올렸다.
  // 옛 주소(accountbook-shell-v22983.css·mobile-home-v22979.css·accountbook-v5-v22980.js·mobile-home(-shell)-v22983.js)의 바이트는
  // AB_HISTORICAL_RUNTIME_ASSETS 에 남아 아래 옛 해시로 계속 내려간다.
  "/assets/accountbook-shell-v22984.css": "0c97c687fff61ffdaf3e8fa95a3c51a039b42cd2ae9e97f692c0076bbad0f246",
  "/assets/mobile-home-v22984.css": "531267c8ca98ff0c39395e96d1a69df295cd5d1b229af5782b23f8466725babb",
  "/assets/accountbook-v5-v22984.js": "3ca1d073aa029790a01d3a63fc2c3712d2828ab34497919d61758f55975c84f8",
  "/assets/mobile-home-v22984.js": "ff2fd3236932a0e654c033fbaf6dc9f112eca57b304c800e717a8b788a6db063",
  "/assets/mobile-home-shell-v22984.js": "7b2a444839a3b9343e2b7389add2c1c72e62594cf1ad0ad130629a5b4c447f39",
  // V22.9.83:셸 CSS(사이드바 묶음 이름표·달력 제거)·메뉴 스크립트(하단 탭 이름)·홈 스크립트와 홈 셸(납부·입금 일정 추가 양식 안내)·소비 분석 보기 탭의 바이트가 바뀌어 네 주소를 v22983 으로 올렸다.
  // 옛 주소(accountbook-shell-v22981.css·accountbook-nav-v22937.js·mobile-home(-shell)-v22981.js)의 바이트는 AB_HISTORICAL_RUNTIME_ASSETS 에 남아 아래 옛 해시로 계속 내려간다.
  "/assets/accountbook-shell-v22983.css": "bdaa586f7ad42d4d480aa3277e0cf7726dc3993b17b7d30b765ffbc32c89e536",
  "/assets/mobile-home-shell-v22983.js": "e3221b1f8a008e5cdfc27490434f4fd3d0f76a55583ab1fd3e29be7cbb521e07",
  "/assets/mobile-home-v22983.js": "f58ba4226efc21458da08fab4b09380bebb99e193c2c155fb199dd6dc0713021",
  "/assets/accountbook-nav-v22983.js": "25b251e0b25c65cbfc4b405a1c643f10ba5545074ff6bcca443b14c796d6b888",
  // V22.9.81: 셸 CSS(U-28·U-29 다크 대비·U-30 수입 색·U-15 빈 날·U-17 넘침)·홈 스크립트·홈 셸(U-7·U-8·U-9·V81 입력 해석)의 바이트가 바뀌어 세 주소를 v22981 로 올렸다.
  // 옛 주소(accountbook-shell-v22979.css·mobile-home(-shell)-v22980.js)의 바이트는 AB_HISTORICAL_RUNTIME_ASSETS 에 남아 아래 옛 해시로 계속 내려간다.
  "/assets/accountbook-shell-v22981.css": "79935f106b9aa217a67f12626d2eb604a2717e29d58d17dd7df55167356528e2",
  "/assets/mobile-home-shell-v22981.js": "464100c6530a9f9151963d763b79229814f6582b5f6d071f22fedfb8d8a8862e",
  "/assets/mobile-home-v22981.js": "27f61d38dbd9b7d004351650acb00dc507ae405608300c1871940316833e4e35",
  // V22.9.80: 분류 규칙(T-16)·홈 스크립트·홈 셸(T-15·T-17·T-18 입력 해석)·V5 번들(T-33 달력 KST)의 바이트가 바뀌어 네 주소를 v22980 으로 올렸다.
  // 옛 주소(ab-category-rules-v22976·mobile-home(-shell)-v22979·accountbook-v5-v22979)의 바이트는 AB_HISTORICAL_RUNTIME_ASSETS 에 남아 아래 옛 해시로 계속 내려간다.
  "/assets/ab-category-rules-v22980.js": "93026acd3bce2bf8bbc916f95b7f0dd99bb798b16260dbb74c7c3637a2d3f787",
  "/assets/accountbook-v5-v22980.js": "7cffd4e7c0d3b1188e664cd4906a55eb3996bc71bf3fa753f76630860466f492",
  "/assets/mobile-home-shell-v22980.js": "c7809f5493ccde56486a7f6603526d80d42390b2f7361ea0a9fe8ed92f36141d",
  "/assets/mobile-home-v22980.js": "d6ad5e2e7599274b472b022649bf4b83a535e163a8a4d947ed7708ced1c59383",
  // V22.9.79: 홈 스타일시트·홈 스크립트·홈 셸·셸 CSS·검색·V5 번들·예산 미리 보기의 바이트가 바뀌어(F-4·F-8·F-10, 입력 해석 공유, 웹 화면) 일곱 주소를 v22979 로 올렸다.
  // 옛 주소의 바이트는 AB_HISTORICAL_RUNTIME_ASSETS 에 남아 아래 옛 해시로 계속 내려간다.
  "/assets/mobile-home-v22979.css": "2fcbe755ae1b608875b4a2eedb38e379459a5bd97f390f9577d61a92cdf50562",
  "/assets/mobile-home-v22979.js": "3731de55ba6311782e720f318ebefb6210d72f03125a7087a1ab18ee6ad8773f",
  "/assets/mobile-home-shell-v22979.js": "387695c142c30077a67fe9fb453a2b47e52aec63718a32438ada521905acdc5f",
  "/assets/accountbook-shell-v22979.css": "8aa69b634c36d83354938e9115a8ac59787922b6433dfb1fda714271759f8923",
  "/assets/accountbook-search-v22979.js": "23294f6783eab195046b6e17e49c48ea2fd43e017ad227c45bc1846d60409a48",
  "/assets/accountbook-v5-v22979.js": "5105846f10fb25f84ece1a3bdbf341f9b03062d1ca32e050468ccfaca3d29787",
  "/assets/accountbook-budget-preview-v22979.js": "8aee568492093d03d361cf49adf33a0b3dfd28c5f2c7913a98c6ff957e3b9bae",
  // V22.9.78(V77 N-12): 홈 스크립트·홈 셸에 실리는 quickInputDate 가 주 없이 쓴 ‘지난·저번 요일’을 오늘을 뺀 앞 요일로 읽게 바뀌어 두 주소를 올렸다.
  // 옛 주소(mobile-home-shell-v22976·mobile-home-v22976)의 바이트는 AB_HISTORICAL_RUNTIME_ASSETS 에 남아 아래 V22.9.76 해시로 계속 내려간다.
  "/assets/mobile-home-shell-v22978.js": "9f3eaf3caa755fd89b257998bd4ee3830f5c7df34724ab16d206b4643bafbca1",
  "/assets/mobile-home-v22978.js": "e6fe59fef461436e5d70e1cdbba9496e50e7be7543873a95a5ad23ce73695045",
  // V22.9.76: 홈 스크립트·홈 셸·분류 규칙 자산의 내용이 바뀌어(수입·지출 화면 수정, 분류 규칙 데이터 A-10) 세 주소를 올렸다.
  // 옛 주소(mobile-home-shell-v22951·ab-category-rules-v22948·mobile-home-v22951)의 바이트는 AB_HISTORICAL_RUNTIME_ASSETS 에 남는다.
  "/assets/mobile-home-shell-v22976.js": "6cebf524b54a1cd284e7d9bcc450e932f82a107d5f7daffd6c495343a84c50d6",
  "/assets/ab-category-rules-v22976.js": "0e31730ab836334dd139eca5f8565980aa5dafbd4598df201e1c45e589968807",
  "/assets/mobile-home-v22976.js": "3c3b20dfbf6ca37f5b5b188ff209a70238294886d2ffcd680326d92ef4b4b3e2",
  "/assets/accountbook-budget-preview-v22953.js": "63cc3b79b6549d57f73312109fb5589d7c0a71c644bdf41f93d65f1ae749af1c",
  "/assets/accountbook-budget-preview-v22952.js": "ff0696632937cbc2ff8812b47d4812cf9137b39f20455f1cd01d57c7589efffb",
  "/assets/accountbook-quick-input-v22951.js": "59dd629ed042aa52e2c3e6be5f143d327d4a8e5e65bac7ebf3da8821fd722e82",
  "/assets/accountbook-v5-v22951.js": "fbebec4df463d6c132a4055272bedfa821b29cee61a8ca2d3d4dae224f7a2e11",
  "/assets/mobile-home-shell-v22951.js": "ac38c554719a7a189815cf49c0a932afdfbc1bfac30fdc00add8f38229501386",
  "/assets/mobile-home-v22951.js": "ca2237d2cc10bc3642bc9e6c63d88d8273524f565a803a97e93aadae38eaa88e",
  "/assets/mobile-home-shell-v22950.js": "0f7fb958766dcb576e64c39137ed7c59c988a2455d222bcfb5e7a20f16728faf",
  "/assets/mobile-home-v22950.js": "96ef23c0174cbc08f638cf21182b3fcef08cc79c382761b5092f0cd48ebe3693",
  "/assets/accountbook-v5-v22950.js": "f3653ad9c0f23f63132674b000306fd2881fe9fe4f974dd653bf4104f9a0fbcf",
  "/assets/accountbook-quick-input-v22950.js": "4b219f3e8603567ba3732231291adeec58a7adb1b180a45a27b6217fcf63f586",
  "/assets/accountbook-quick-input-v22949.js": "3314d1d2722aa2fdc3da46f24efa0e40f92a53b51eebcf308613174a590db7fd",
  "/assets/accountbook-v5-v22949.js": "32676f8caacd0586dc04f687315e69d17a81fdddd3dca191e3a2c519176bc539",
  "/assets/accountbook-v5-v22948.js": "c7ba792cb558e130dd97e0332fe91de9b054ab7d56d753665a64dbc70973c79b",
  "/assets/mobile-home-shell-v22948.js": "ea56220c0468a98afd3576ee1e356ef5b3ec009a1f86373d8dbf5ba55e2a55df",
  "/assets/mobile-home-v22948.js": "80b8aa3a54257a6cf12e17e966231e1e1998d1be94a5e40d9e1a761beccceeee",
  "/assets/ab-category-rules-v22948.js": "c1ff1f648deaf995fdbb90df4a617135cd441defacaf941ed9a0e3c4c1f362f9",
  // V22.9.47 B changes only these new addresses; every historical pin remains.
  "/assets/accountbook-shell-v22947.css": "62f4857fec1ff1b02822f6c5ee047bdb73c9abea5217fc7fcee2d1e934dce142",
  "/assets/accountbook-v5-v22947.js": "24f55267777b7069b2f1c21e3d045abf9764e53d9ce714cefe83f75dd51597eb",
  // V22.9.46 Lucian E: new bytes use four new URLs; all previous pins remain.
  "/assets/accountbook-shell-v22946.css": "3653eb214c33fe4223b8f0bc414c63b3e8292c85bd6f9eb59a4adfcb97fde08c",
  "/assets/accountbook-v5-v22946.js": "d8b25695573233145372dba77ee457bbf9a27c98f6875269664056ed02e28f03",
  "/assets/accountbook-goals-v22946.js": "1f882601ea745ed7c9c48bf3fb70ca1bdf9e9bc9ba7b0fb540522cdc4e329ca6",
  "/assets/accountbook-theme-v22946.js": "febcc2cdbaedbeaefabe0cf596b4bfb2a103fc6574591c1f9ecbda4a6fc2e189",
  // V22.9.37 감사 묶음 C: 셸 CSS(U4·U9·U14)와 내비·V5 번들·목표·행 즐겨찾기·검색·알림 JS(H1·U2·U3·U5·U10·U12)가 바뀌어
  // 주소를 올렸다. 옛 CSS 주소(v22925)는 더 내려가지 않고, 옛 JS 주소(nav-v22930·v5-v22934·goals-v22929·favrows-v22836·
  // search-v22929·notif-v22836)는 AB_HISTORICAL_RUNTIME_ASSETS 에 그대로 남아 아래 옛 해시로 계속 내려간다.
  // V22.9.40 (C2): 셸 CSS 끝에 점진적 최신 규칙 한 블록을 더해 주소를 v22937 → v22940 으로 올렸다. V22.9.37 과 같이
  // 옛 CSS 주소는 더 내려가지 않는다(개인 HTML 은 no-store 라 옛 주소를 부르는 화면이 남지 않는다).
  "/assets/accountbook-shell-v22940.css": "b1d9405934b918b46d880c760951ed2ac4af0e5545d46ad1ab08087956d96a40",
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
  "/assets/accountbook-v5-v22937.js": "e939a35fb2acd5428bd1904a94edb35da16748652cd0c5b41e7c78cf0db0b752",
  "/assets/mobile-home-v22934.js": "143562ae7a41dfa30884227582a49507b5442bbf86dcf79ba890f09b184423e5",
  "/assets/mobile-home-shell-v22934.js": "1b3e04cfe5917fcebc86fbe55e9df1663290b597d4f70c93ae44ed7b419b7968",
  "/assets/ab-category-rules-v22926.js": "0b2cbae61f91c36acbd75c95aa08efdbcb1c150424b41e394f0d54e6247ad70c",
  // V22.9.40 A3(감사 U9): 홈 스타일시트의 수정 폼 라벨 색·다크 읽기 전용 칸 규칙이 바뀌어 주소를 v22940 으로 올렸다.
  // 옛 v22919 주소는 AB_HISTORICAL_RUNTIME_ASSETS 에서 CSS 형식으로 옛 바이트를 그대로 낸다(아래 옛 해시).
  "/assets/mobile-home-v22919.css": "0695bbde13382d71c11769607dabd7b70e91e1b7b83c8a4df4a8b92794d047f7",
  "/assets/mobile-home-v22940.css": "f05fe3470dc0e98680b6c701639c2ae894e6290ef84bd802a00cfb6e98e996dc",
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
