# V22.8.51 Validation Report

버전: `V22.8.51-INPUT-AMOUNT-RUNTIME-REGEX-FIX`

## 수정 범위

V22.8.50 전체 점검(`FULL_INSPECTION_REPORT_V22_8_50.md`)에서 확인된 결함 6건.

| 등급 | 항목 | 수정 |
| --- | --- | --- |
| P1 | 1,000원 미만 금액 저장 불가 | 폼 전용 숫자 파서 `parseFormAmountValue` 도입 |
| P1 | 스마트 한 줄 입력 파서 무력화 | 인라인 런타임 정규식 이스케이프 복구 |
| P2 | `validMonth` 월 범위 미검증 | `01~12`만 허용 |
| P2 | 거래 금액 상한 부재 | `MAX_TRANSACTION_AMOUNT` 20억 원 적용 |
| P3 | 예산 저장이 빈 값을 0으로 저장 | `readOptionalFormAmount`로 무효 입력 거부 |
| P3 | 고정지출 폼과 `user_id` 계약 불일치 | 지출자 선택 필드 추가 |

## 자동검사

| 검증 | 개수 |
| --- | --- |
| 영수증 | 56 |
| 카카오 그룹 | 22 |
| 카카오 수정·삭제·복구 | 130 |
| 가계부·운영 보안 | 75 |
| 참여자 역할 스키마 | 20 |
| UX 원칙 | 56 |
| 사용자 화면·홈 버튼·테마·성능 | 153 |
| AdSense 심사·V2 화면 | 261 |
| V5 안정화 | 41 |
| 핵심 쓰기 스모크 | 97 |
| UI/UX 1단계 | 24 |
| UI/UX 2단계 | 48 |
| UI/UX 3단계 | 57 |
| UI/UX 4단계 | 89 |
| **합계** | **1129** |

체크섬 55개, ESM `default.fetch` 진입점, 작업 트리·스테이징 공백 검사 통과.

## 추가된 회귀 검사 (9개)

`validation/validate-performance-v22811.mjs`에 배포 자산의 정규식이 실제로
동작하는지 확인하는 검사를 추가했습니다. 기존 검사는 자산의 문자열 포함
여부만 확인해 이스케이프 소실을 잡지 못했습니다.

- 배포 자산에서 `parseKoreanAmount`·`abNorm`을 추출해 직접 실행
- `커피 5천`·`월급 250만원`·`3만 5천`·`점심 12000`·`택시 1만2천` 금액 확인
- `abNorm`이 영문을 손상시키지 않는지 확인
- 천단위 콤마 정규식이 `1234567 → 1,234,567`을 만드는지 확인

## 자산 주소 변경

| 자산 | 이전 | 이후 |
| --- | --- | --- |
| 홈 런타임 | `/assets/mobile-home-v22810.js` | `/assets/mobile-home-v22851.js` |
| 홈 셸 런타임 | `/assets/mobile-home-shell-v22811.js` | `/assets/mobile-home-shell-v22851.js` |

immutable 자산이므로 내용이 바뀐 두 파일만 주소를 올렸습니다. CSS는 변경이 없어
기존 주소를 유지합니다.

## 수동 확인 필요

- 실기기(iOS Safari·Android Chrome)에서 500원 저장, 한 줄 입력, 콤마 표시
- 운영 `/ready` 정상 여부
- `RELEASE-CHECKLIST.md`의 운영 도메인 항목

## 남은 항목

- `validation/validate-performance-v22810.mjs`는 하네스에 연결되지 않은 오래된
  파일이며 V22.8.50 시점에도 홈 HTML 바이트 예산 단언(35,000 vs 35 KiB) 때문에
  실패합니다. 이번 릴리스에서 자산 주소만 맞췄고 예산 단언은 손대지 않았습니다.
- `accountbook_apply_recurring_v227` RPC가 픽스처에 없어 `/admin/recurring/apply`
  경로는 자동 검증 범위 밖입니다.

## 변경 없음

신규 SQL, Supabase 스키마, 환경변수, Secret, Kakao Developers, OpenBuilder.
