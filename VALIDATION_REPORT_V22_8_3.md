# V22.8.3 검증 보고서

검증일: 2026-07-16 (Asia/Seoul)

결과: **통과**

## 자동 검증

| 영역 | 검사 | 결과 |
|---|---:|---|
| Claude 검토 통합·추가 하드닝 | 65 | 통과 |
| V22.8.2 인증·UI 회귀 | 28 | 통과 |
| V22.8.1 전체 회귀 세트 | 5,998 | 통과 |
| 동시성·중복·정산·cron 무결성 | 59 | 통과 |
| 권한·가져오기·안전 응답 | 91 | 통과 |
| **합계** | **6,241** | **통과** |

`node --check src/index.js`와 `./validate_v2283.sh`가 모두 통과했습니다.

## 포함 범위

- 카카오 OAuth 시작·취소·state 불일치·token 실패·profile 실패·성공 callback
- OAuth 임시 쿠키 정리, 고정 Redirect URI, 잘못된 호스트 정규화
- malformed cookie, 잘못된 숫자 환경변수, 캐시·rate-limit 메모리 상한
- POST 확인 취소·중복 제출·실제 submitter·BFCache 복원
- 위험 작업 표시·확인, 같은 사이트 복귀 경로 제한
- 23개 화면, 320/360/390px 기준 서버 HTML·DOM·CSS 576개 검사
- NLU 4,738/4,738
- 인증 원자성, WebView CSRF, 권한, 가져오기, 운영 데이터 무결성

## 빌드 검증

- Sites Worker 빌드 통과
- ESM 구문 및 `default.fetch` export 검증 통과
- 배포 패키지와 Sites 소스 `src/index.js` SHA-256 동일
- Sites 체크포인트 배포 성공: `https://ttokttok-accountbook-uiux.bin-kr.chatgpt.site`

## 범위 제한

자동 검증은 카카오 Developers의 실제 앱 등록값과 실제 카카오 계정 동의를 대신 확인하지 않습니다. 운영 도메인의 Redirect URI 등록과 성공 callback은 `FINAL_APPLY_CHECKLIST_V22_8_3.md`에 따라 운영자가 최종 확인해야 합니다.
