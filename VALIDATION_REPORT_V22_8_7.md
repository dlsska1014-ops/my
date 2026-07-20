# V22.8.7 검증 보고서

검증일: 2026-07-20

| 검증 | 결과 |
|---|---:|
| Worker 문법 | 통과 |
| 카카오 1:1·그룹 응답 | 18개 통과 |
| 영수증·보호 화면 | 55개 통과 |
| 누적 ZIP 내부 문법 재검사 | 통과 |
| 누적 ZIP 체크섬 | 통과 |
| ZIP 압축 무결성 | 통과 |

## 확인한 카카오 기준

- 1:1 단계형 QuickReplies 유지
- 그룹 QuickReplies 미출력 및 번호형 문장 변환
- 그룹 지원 output 타입과 최대 3개 제한
- 알 수 없는 SkillRequest 필드 허용
- `botUserKey` → `appUserId` → 레거시 `plusfriendUserKey` 우선순위

## 배포 판정

- 신규 SQL 없음
- `src/index.js`만 전체 교체
- 환경변수·OpenBuilder 변경 없음

실제 카카오 운영 채널과 모바일 기기 권한은 배포 후 수동 확인 대상입니다.
