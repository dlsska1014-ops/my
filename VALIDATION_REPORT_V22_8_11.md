# V22.8.11 검증 보고서

## 자동 검증

| 묶음 | 결과 |
|---|---:|
| 영수증 안정성 | 55 통과 |
| 카카오 그룹 매뉴얼 정합성 | 18 통과 |
| 계정·가계부 보안 | 43 통과 |
| UX 원칙·분석 보호 | 55 통과 |
| 홈 UX 셸·성능 | 94 통과 |
| 합계 | 265 통과 |

추가로 Worker 문법, ESM import, `default.fetch`, 31개 배포 파일 SHA-256, Git 공백 오류를 확인합니다.

홈 UX 셸 검증은 사용자 `/households`의 `user` 범위와 관리자 `/households`의 `admin` 범위를 빈 쿠키·Bearer 인증으로 양방향 확인합니다. 운영·감사·배포 점검 16개 경로는 `ops` 범위이며 셸 링크와 클래스가 없고, 레거시 관리자·공개 화면도 셸 밖에 남는지 검사합니다.

## 보호 해시

- 분석 클라이언트: `b73386dfddd66aa42000b7b34b6c03b7deeda3ac5824b75468db3aa269087a5d`
- 분석 렌더러: `0d03ce468e0203e1eb7bc344e0fc24876f74c92de492389246f5dd80ea0de58d`
- V22.8.10 레거시 홈 JavaScript: `caa780bdad0d317ae6446ddae87adfa4abd1bca682aa007dae55a06e658a509b`
- 현재 `src/index.js`: `cc58f25336b28c2c42bfb72930a0242bbbcdc5964752f870d3736891a13cbcac`

## 자동화하지 않은 항목

- Cloudflare 운영 배포
- PC Chrome, iPhone Safari, Android Chrome 시각 검수
- 운영 카카오 1:1·그룹 확인
- 실기기 영수증 OCR

SQL, 환경변수·Secret, Kakao Developers, OpenBuilder 변경은 필요하지 않습니다.
