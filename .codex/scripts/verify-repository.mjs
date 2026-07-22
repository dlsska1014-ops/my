#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const checksumManifest = resolve(
  repositoryRoot,
  "BUNDLE_FILE_CHECKSUMS_V22_8_18.sha256",
);
const validationScripts = [
  ["영수증 안정화", "validation/validate-receipt.mjs"],
  ["카카오 그룹", "validation/validate-kakao-group.mjs"],
  ["가계부 보안", "validation/validate-household-security.mjs"],
  ["UX 원칙", "validation/validate-ux-principles.mjs"],
  ["인증 화면·홈 버튼 대비", "validation/validate-performance-v22811.mjs"],
  ["카카오 수정 플로우 V4", "validation/validate-kakao-edit-flow.mjs"],
];

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function parseChecksumLine(line, lineNumber) {
  const match = line.match(/^([a-f0-9]{64})\s+\*?\.\/(.+)$/i);
  if (!match) {
    throw new Error(`체크섬 목록 ${lineNumber}행 형식이 올바르지 않습니다.`);
  }
  return { expected: match[1].toLowerCase(), relativePath: match[2] };
}

function verifyChecksums() {
  const lines = readFileSync(checksumManifest, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  const rootPrefix = `${repositoryRoot}${sep}`;

  for (const [index, line] of lines.entries()) {
    const { expected, relativePath } = parseChecksumLine(line, index + 1);
    const absolutePath = resolve(repositoryRoot, relativePath);
    if (!absolutePath.startsWith(rootPrefix)) {
      throw new Error(`저장소 밖의 체크섬 경로를 거부했습니다: ${relativePath}`);
    }
    const actual = sha256(absolutePath);
    if (actual !== expected) {
      throw new Error(
        `체크섬 불일치: ${relativePath}\n  expected ${expected}\n  actual   ${actual}`,
      );
    }
  }

  return lines.length;
}

function run(command, args, label) {
  console.log(`\n[실행] ${label}`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`${label} 실행 실패: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} 실패 (종료 코드 ${result.status ?? "없음"})`);
  }
}

function runSelfTest() {
  const knownHash = createHash("sha256").update("abc").digest("hex");
  if (
    knownHash !==
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  ) {
    throw new Error("SHA-256 자체 점검에 실패했습니다.");
  }

  parseChecksumLine(`${knownHash}  ./fixture.txt`, 1);

  let rejectedInvalidLine = false;
  try {
    parseChecksumLine("invalid checksum line", 1);
  } catch {
    rejectedInvalidLine = true;
  }
  if (!rejectedInvalidLine) {
    throw new Error("잘못된 체크섬 행을 거부하지 못했습니다.");
  }

  console.log("검증 하네스 자체 점검: 정상 입력과 오류 감지 통과");
}

function main() {
  const majorNodeVersion = Number.parseInt(process.versions.node, 10);
  if (!Number.isInteger(majorNodeVersion) || majorNodeVersion < 18) {
    throw new Error(`Node.js 18 이상이 필요합니다. 현재: ${process.versions.node}`);
  }

  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  console.log(`Node.js ${process.versions.node}`);
  console.log(`저장소: ${repositoryRoot}`);

  const checksumCount = verifyChecksums();
  console.log(`원본 배포 묶음 체크섬: ${checksumCount}개 통과`);

  run(process.execPath, ["--check", "src/index.js"], "Worker 문법 검사");
  for (const [label, script] of validationScripts) {
    run(process.execPath, [script], label);
  }
  run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import('./src/index.js').then((module) => { if (typeof module.default?.fetch !== 'function') process.exit(1); console.log('artifact_entrypoint: default.fetch available'); })",
    ],
    "ESM 진입점 검사",
  );
  run("git", ["diff", "--check"], "작업 트리 공백 오류 검사");
  run("git", ["diff", "--cached", "--check"], "스테이징 영역 공백 오류 검사");

  console.log(`\n검증 완료: 체크섬 ${checksumCount}개, 자동 검사 429개, ESM 진입점 통과`);
  console.log(`src/index.js SHA-256: ${sha256(resolve(repositoryRoot, "src/index.js"))}`);
  console.log("운영 도메인·실기기 항목은 RELEASE-CHECKLIST.md에서 별도 확인해야 합니다.");
}

try {
  main();
} catch (error) {
  console.error(`\n검증 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
