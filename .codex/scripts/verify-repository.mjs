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
  "BUNDLE_FILE_CHECKSUMS_V22_8_79.sha256",
);
const validationScripts = [
  ["영수증 안정화", "validation/validate-receipt.mjs"],
  ["카카오 그룹", "validation/validate-kakao-group.mjs"],
  ["카카오 수정·삭제·복구 V4", "validation/validate-kakao-edit-flow.mjs"],
  ["가계부 보안", "validation/validate-household-security.mjs"],
  ["참여자 역할 스키마", "validation/validate-member-role-schema-v22846.mjs"],
  ["UX 원칙", "validation/validate-ux-principles.mjs"],
  ["인증 화면·홈 버튼 대비", "validation/validate-performance-v22811.mjs"],
  ["AdSense 심사·V2·UI V5 공통 셸", "validation/validate-adsense-v2-v22817.mjs"],
  ["UI V5 권한·범위·저장 안정화", "validation/validate-v5-stabilization.mjs"],
  ["핵심 쓰기·권한 스모크", "validation/validate-core-write-smoke.mjs"],
  ["UI/UX 1단계", "validation/validate-uiux-stage1-v22847.mjs"],
  ["UI/UX 2단계", "validation/validate-uiux-stage2-v22848.mjs"],
  ["UI/UX 3단계", "validation/validate-uiux-stage3-v22849.mjs"],
  ["UI/UX 4단계", "validation/validate-uiux-stage4-v22850.mjs"],
  ["리포트 대시보드 UX", "validation/validate-report-dashboard-v22856.mjs"],
  ["홈 우측 기록·챌린지 보정", "validation/validate-home-rail-challenge-v22857.mjs"],
  ["챌린지·최근 기록 UI/UX", "validation/validate-challenge-activity-ux-v22858.mjs"],
  ["계정·런타임 신뢰성", "validation/validate-account-runtime-reliability-v22859.mjs"],
  ["기능·UI 신뢰성", "validation/validate-functional-ui-reliability-v22860.mjs"],
  ["모바일 화면 보정", "validation/validate-mobile-surface-repair-v22861.mjs"],
  ["모바일 전체 탭 점검", "validation/validate-mobile-surface-audit-v22862.mjs"],
  ["앱 아이콘 자원", "validation/validate-app-icon-assets-v22863.mjs"],
  ["웹 매니페스트", "validation/validate-web-manifest-v22864.mjs"],
  ["테마 글자 대비", "validation/validate-theme-text-contrast-v22865.mjs"],
  ["거래 삭제 동작", "validation/validate-transaction-delete-v22866.mjs"],
  ["역할별 화면·빈 상태", "validation/validate-role-surface-v22867.mjs"],
  ["조작 영역·접근성", "validation/validate-tap-target-a11y-v22868.mjs"],
  ["카카오 메모·중복 방지", "validation/validate-kakao-memo-repeat-v22869.mjs"],
  ["금액 파싱", "validation/validate-amount-parse-v22870.mjs"],
  ["수정·삭제·복구 왕복", "validation/validate-edit-restore-v22871.mjs"],
  ["본문 바로가기", "validation/validate-skip-to-content-v22872.mjs"],
  ["스킬 인증·삭제 SQL", "validation/validate-skill-auth-purge-v22873.mjs"],
  ["예산 재검토·다크 대비", "validation/validate-budget-dark-contrast-v22874.mjs"],
  ["통계·종합 리포트 역할 분리", "validation/validate-analysis-role-split-v22875.mjs"],
  ["카카오 의도·스킬 인증", "validation/validate-kakao-intent-skill-auth-v22876.mjs"],
  ["끊김·중단 복구", "validation/validate-interrupted-save-v22877.mjs"],
  ["작성 내용 보존·그룹 동시 입력", "validation/validate-draft-persistence-v22878.mjs"],
  ["월 고정·브랜드 아이콘", "validation/validate-month-reset-brand-icon-v22879.mjs"],
  ["테마 2택·사이드 위계", "validation/validate-theme-duo-nav-tier-v22879.mjs"],
  ["거래내역 탭", "validation/validate-transactions-tab-v22879.mjs"],
  ["정기 IA·예산 동선", "validation/validate-recurring-ia-budget-path-v22879.mjs"],
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

function isGitWorktree() {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 && String(result.stdout || "").trim() === "true";
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
  if (isGitWorktree()) {
    run("git", ["diff", "--check"], "작업 트리 공백 오류 검사");
    run("git", ["diff", "--cached", "--check"], "스테이징 영역 공백 오류 검사");
  } else {
    console.log("\n[건너뜀] 압축 해제본에는 Git 메타데이터가 없어 diff 공백 검사를 생략합니다.");
  }

  console.log(`\n검증 완료: 체크섬 ${checksumCount}개, 자동 검사 3060개, ESM 진입점 통과`);
  console.log(`src/index.js SHA-256: ${sha256(resolve(repositoryRoot, "src/index.js"))}`);
  console.log("운영 도메인·실기기 항목은 RELEASE-CHECKLIST.md에서 별도 확인해야 합니다.");
}

try {
  main();
} catch (error) {
  console.error(`\n검증 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
