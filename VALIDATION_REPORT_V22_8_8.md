# V22.8.8 검증 보고서

- 검증일: 2026-07-20
- 버전: `V22.8.8-PREDICTABLE-ACTION-FEEDBACK`
- 개발 소스 SHA-256: `d6cb50c4d2800149f855c77de096d3c1ef04c505339eefd5dabfcba5b94148da`
- 빌드 소스 SHA-256: `d6cb50c4d2800149f855c77de096d3c1ef04c505339eefd5dabfcba5b94148da`

## 자동 검증 결과

| 검증 | 결과 | 확인 수 |
|---|---:|---:|
| `node --check worker/index.js` | 통과 | 문법 |
| `node scripts/validate-receipt.mjs` | 통과 | 55 |
| `node scripts/validate-kakao-group.mjs` | 통과 | 18 |
| `node scripts/validate-ux-principles.mjs` | 통과 | 55 |
| `npm run build` | 통과 | 위 128개 포함 |
| `npm run validate` | 통과 | ESM·`default.fetch` |
| 개발 소스와 빌드 소스 비교 | 통과 | SHA-256 동일 |

자동 확인 합계는 128개입니다.

## V22.8.8 전용 확인

- 로그인, 가입, 가계부 생성, 참여, 삭제, 탈퇴, 가져오기, 저장, 일반 처리의 진행 문구를 런타임으로 실행
- form·button busy 상태와 `aria-live` 문구 확인
- `pageshow`에서 원래 문구·잠금·busy·실시간 상태 복원 확인
- 새 계정과 개인 복구 비밀번호의 초기, 불일치, 일치 상태 실행 확인
- 삭제 취소 시 제출 차단과 원래 버튼 유지 확인
- 로그인·개인 비밀번호 인라인 스크립트 실제 JavaScript 컴파일 확인

## 보호 화면 확인

| 대상 | V22.8.7 기준 SHA-256 | 결과 |
|---|---|---:|
| `insightClientMain` | `b73386dfddd66aa42000b7b34b6c03b7deeda3ac5824b75468db3aa269087a5d` | 동일 |
| `renderMyAnalysisHtml` | `0d03ce468e0203e1eb7bc344e0fc24876f74c92de492389246f5dd80ea0de58d` | 동일 |

`/my/analysis`, `/my/analysis/app.js`, `/receipts` 경로도 같은 QA fixture에서 HTTP 200을 확인했습니다.

## 배포 전 남은 수동 확인

- 실제 iPhone Safari와 Android Chrome의 비밀번호 관리자 자동 채움
- VoiceOver·TalkBack의 진행 상태 읽기 순서
- 운영 Cloudflare 도메인의 네트워크 오류와 뒤로 가기 복귀
- 실제 카카오 1:1·그룹방 응답
- 실제 영수증 OCR과 카메라·앨범 권한

이 항목은 운영 계정·권한·기기가 필요해 자동 통과로 표시하지 않았습니다.

## 누적 ZIP 구성 감사

- 총 파일: 357개 (체크섬 파일 포함)
- Markdown 이력·매뉴얼: 206개
- 과거 SQL 이력: 13개
- 이번 버전에서 실행할 신규 SQL: 0개
- PNG: 0개
- `worker/`, `dist/`, `.openai/`, `package.json`: 없음
- 배포 JavaScript: `src/index.js` 한 개
- `BUNDLE_FILE_CHECKSUMS_V22_8_8.sha256`: 자신을 제외한 356개 파일 기록
