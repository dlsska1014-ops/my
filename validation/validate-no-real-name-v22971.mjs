// V22.9.71 — 사용자에게 보이는 예시 문구에 운영자 실명을 쓰지 않는다(2026-10-19 운영 단톡방 보고).
// 예시 이름은 가상의 이름(민지·엄마·아빠 등)만 쓴다. 번들(src/index.js)과 모듈 전체를 검사한다.
// V22.9.95 R-9: 법정 표시(사업자 꼬리말의 대표자, 개인정보처리방침 7절의 보호책임자 성명)는 예외다. 실명은 site-config.js 의
// BUSINESS_FOOTER_INFO.representative 한 줄에만 있고(그 밖의 모듈 0곳, 번들에도 그 상수 한 번), 화면은 그 상수를 끌어다 쓴다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let checks = 0;
const ok = (value, label) => { if (!value) throw new Error(`FAIL: ${label}`); checks += 1; };
const FORBIDDEN = ["\uC778\uB0A8"]; // 운영자 실명(유니코드 이스케이프로 적어 이 파일 자체가 걸리지 않게 한다)
const LEGAL_MODULE = "src/modules/public/site-config.js";
const LEGAL_FIELD = "representative: \"\uBC31\uC778\uB0A8\","; // BUSINESS_FOOTER_INFO 의 대표자 칸(법정 표시) — 이 꼴 한 줄만 허용. 이름은 이스케이프(이 파일에 실명 글자 없음)

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".js") ? [path] : [];
  });
}

const count = (text, word) => text.split(word).length - 1;

try {
  const root = new URL("../", import.meta.url);
  const modulesDir = new URL("src/modules", root).pathname.replace(/^\/(?=[A-Za-z]:)/, "");
  const files = ["src/index.js", ...walk(modulesDir).map((p) => p)];
  const field = JSON.parse(`"${LEGAL_FIELD.replace(/"/g, "\\\"")}"`);
  for (const file of files) {
    const text = readFileSync(file.startsWith("src/") ? new URL(file, root) : file, "utf8");
    const isLegal = file === "src/index.js" || file.replace(/\\/g, "/").endsWith(LEGAL_MODULE);
    for (const word of FORBIDDEN) {
      const name = JSON.parse(`"${word}"`);
      if (!isLegal) { ok(!text.includes(name), `${file}: 운영자 실명 없음`); continue; }
      // 법정 표시 한 줄(대표자 칸)만: 실명의 모든 등장이 그 칸 한 번뿐이다.
      ok(count(text, name) === 1 && count(text, field) === 1, `${file}: 운영자 실명은 BUSINESS_FOOTER_INFO.representative 한 곳뿐이다`);
    }
  }
  const source = readFileSync(new URL("src/index.js", root), "utf8");
  ok(source.includes("예: 민지, 엄마, 아빠"), "내 이름 설정 예시는 가상의 이름을 쓴다");
  console.log(`V22.9.71 실명 예시 제거 검사 통과 (${checks} checks)`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
