// V22.9.71 — 사용자에게 보이는 예시 문구에 운영자 실명을 쓰지 않는다(2026-10-19 운영 단톡방 보고).
// 예시 이름은 가상의 이름(민지·엄마·아빠 등)만 쓴다. 번들(src/index.js)과 모듈 전체를 검사한다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let checks = 0;
const ok = (value, label) => { if (!value) throw new Error(`FAIL: ${label}`); checks += 1; };
const FORBIDDEN = ["\uC778\uB0A8"]; // 운영자 실명(유니코드 이스케이프로 적어 이 파일 자체가 걸리지 않게 한다)

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".js") ? [path] : [];
  });
}

try {
  const root = new URL("../", import.meta.url);
  const files = ["src/index.js", ...walk(new URL("src/modules", root).pathname.replace(/^\/(?=[A-Za-z]:)/, "")).map((p) => p)];
  for (const file of files) {
    const text = readFileSync(file.startsWith("src/") ? new URL(file, root) : file, "utf8");
    for (const word of FORBIDDEN) ok(!text.includes(JSON.parse(`"${word}"`)), `${file}: 운영자 실명 없음`);
  }
  const source = readFileSync(new URL("src/index.js", root), "utf8");
  ok(source.includes("예: 민지, 엄마, 아빠"), "내 이름 설정 예시는 가상의 이름을 쓴다");
  console.log(`V22.9.71 실명 예시 제거 검사 통과 (${checks} checks)`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
