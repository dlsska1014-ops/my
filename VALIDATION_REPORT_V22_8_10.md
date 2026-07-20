# V22.8.10 검증 보고서

## 자동 검증

| 묶음 | 결과 |
|---|---:|
| 영수증 안정화 | 55 통과 |
| 카카오 그룹 매뉴얼 정합성 | 18 통과 |
| 계정·가계부 보안 분리 | 43 통과 |
| UX 원칙·분석 보호 | 55 통과 |
| 홈 성능·경량 자원 | 32 통과 |
| 합계 | 203 통과 |

추가로 Worker 문법, ESM import, `default.fetch`, 빌드 산출물 구조를 확인합니다.

## 성능 회귀 기준

- `/my` DB 요청 ≤ 4
- `/app` DB 요청 ≤ 9
- 개인 홈 HTML < 35KB
- accountbook settings 홈 조회 1회
- 가계부·사용자 묶음 조회 사용
- 빈 pagination probe 없음
- 정적 CSS·JavaScript DB 요청 0회
- 정적 자원 immutable 캐시·정확한 Content-Type

## 보호 해시

- 분석 클라이언트: `b73386dfddd66aa42000b7b34b6c03b7deeda3ac5824b75468db3aa269087a5d`
- 분석 렌더러: `0d03ce468e0203e1eb7bc344e0fc24876f74c92de492389246f5dd80ea0de58d`

## 배포 판정

- `src/index.js` 전체 교체: 필요
- SQL: 없음
- 환경변수: 변경 없음
- Kakao Developers: 변경 없음
- OpenBuilder: 변경 없음
- 수동 실기기 확인: 배포 후 필요
