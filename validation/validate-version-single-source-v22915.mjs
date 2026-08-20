// V22.9.15 — 판 번호를 적는 곳이 하나다.
//
// VERSION.txt 가 V22.8.91 에 멈춰 있었다. 코드는 V22.9.0 을 알리고, package.json 이름에는
// v22.8.98 이 박혀 있었다 — 세 곳이 서로 다른 판을 말하고 있었다.
//
// 왜 멈췄는지가 핵심이다. 검사 42개가 판 번호를 **글자 그대로** 박아 두고 있었다:
//
//   ok(source.includes('const APP_VERSION = "V22.9.0-UX-REPAIR"'), …)
//
// 그래서 판을 하나 올리려면 검사 42개를 함께 고쳐야 했고, 아무도 올리지 않았다.
// 그 단언들이 지키려던 성질은 "런타임이 자기 판을 알린다"이지 "그 판이 V22.9.0 이다"가
// 아니다. 42곳을 판을 가리지 않는 형태로 다시 적었고, 헤더·캐시버스터처럼 결합이 뜻인
// 자리는 소스에서 읽어 비교하게 했다.
//
// 이 파일은 그 다음을 지킨다: 세 곳이 어긋나면 실패한다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const source = read("src/index.js");
const appVersion = (source.match(/const APP_VERSION = "([^"]+)"/) || [])[1];
ok(appVersion, `코드가 판을 알린다 (${appVersion})`);
ok(/^V\d+\.\d+\.\d+(-[A-Z0-9-]+)?$/.test(appVersion), `판 표기가 규칙을 지킨다 (${appVersion})`);

// 1) VERSION.txt 는 코드와 같은 판을 적는다.
eq(read("VERSION.txt").trim(), appVersion, "VERSION.txt 가 코드와 같은 판을 적는다");

// 2) package.json 의 version 도 같은 판이다(접두 V 와 꼬리표는 뺀 숫자 부분).
const pkg = JSON.parse(read("package.json"));
eq(pkg.version, appVersion.replace(/^V/, "").split("-")[0], "package.json version 이 같은 판을 적는다");

// 3) 이름에는 판을 박지 않는다 — 박아 두면 판마다 손으로 고쳐야 하고, 실제로 멈춰 있었다.
ok(!/\d+\.\d+\.\d+/.test(pkg.name), `package.json name 에 판 번호가 박혀 있지 않다 (${pkg.name})`);

// 4) 런타임이 판을 알리는 자리도 리터럴이 아니라 상수를 쓴다.
//    (이 헤더는 카카오 스킬 응답에만 붙는다 — 웹 화면 응답에는 없다. 배포 확인을
//     헤더로 하려면 스킬 엔드포인트를 봐야 한다는 뜻이라, 그 사실을 여기 적어 둔다.)
const headerSites = [...source.matchAll(/set\("x-accountbook-version",\s*([^)]+)\)/g)].map((m) => m[1].trim());
ok(headerSites.length >= 2, `판을 헤더로 알리는 자리를 찾았다 (${headerSites.length}곳)`);
eq(headerSites.filter((v) => v !== "APP_VERSION").length, 0, "그 자리들이 전부 APP_VERSION 상수를 쓴다");

// 5) 검사들이 판 번호를 다시 박지 않는다 — 이것이 멈춤의 원인이었다.
const validators = readFileSync(new URL("../.codex/scripts/verify-repository.mjs", import.meta.url), "utf8");
ok(!validators.includes(appVersion), "검사 목록 스크립트가 판을 글자로 박아 두지 않는다");
// 검사 파일 전체를 훑어 리터럴이 다시 들어왔는지 본다.
const { readdirSync } = await import("node:fs");
const dir = new URL("./", import.meta.url);
const pinned = readdirSync(dir)
  .filter((name) => name.endsWith(".mjs") && name !== "validate-version-single-source-v22915.mjs")
  .filter((name) => readFileSync(new URL(name, dir), "utf8").includes(appVersion));
eq(pinned.length, 0, `판을 글자로 박아 둔 검사가 없다${pinned.length ? " — " + pinned.slice(0, 3).join(", ") : ""}`);

console.log(`V22.9.15 판 번호 정본 검사 통과 (${checks} checks)`);
