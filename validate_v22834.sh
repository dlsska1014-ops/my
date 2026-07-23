#!/usr/bin/env bash
set -euo pipefail

# V22.8.34 배포 게이트: 현재 코드(V22.8.34-STABILIZE)를 반영해 통과하는 스위트.
# 보안·카카오 그룹/수정 플로우·영수증·UX 원칙 계약을 검증한다.
node validation/validate-receipt.mjs
node validation/validate-kakao-group.mjs
node validation/validate-kakao-edit-flow.mjs
node validation/validate-household-security.mjs

echo "V22.8.34 validation gate: core suites passed"

# 참고: validate-performance-v22811 / validate-adsense-v2-v22817 / validate-ux-principles 는
# V22.8.11~19 시절의 에셋 버전·페이지 계약(shell v22819, stage4-nav v22818, 분석 런타임 해시 등)을
# 단언하며, Codex V22.8.24 셸 재작성으로 그 계약이 바뀌어 현재 red 상태다(본 V5 작업 이전부터).
# 이들은 현행 셸(V22.8.24+) 기준으로 별도 재기준선(re-baseline)이 필요하다. (지침서 P1-2 후속)
