# V22.8.17 먼저 읽기

검증된 `src/index.js`를 현재 Cloudflare Worker 코드와 **전체 교체**합니다. 2MB 전체 소스를 웹 편집기에 붙여넣으면 브라우저가 잠시 멈출 수 있으므로, 붙여넣은 뒤 편집기가 다시 반응할 때까지 기다리고 저장·배포 완료 표시를 확인합니다.

## 변경 범위

- 공개 홈과 정책·주요 콘텐츠에 정확한 AdSense 소유권 메타 적용
- 루트 `/ads.txt`에 표준 판매자 정보 적용
- 개인·관리자 화면 광고 제외, 승인 전 광고 스크립트·쿠키 코드 비활성
- V2 참고 디자인의 월 지출 위계, 평면 카드, 투명 달력, 간결한 분석 필터 선별 반영
- 다크모드·네 컬러톤·모바일·태블릿 대비와 터치 크기 보정
- 새 immutable CSS: `/assets/accountbook-shell-v22817.css`

## 변경하지 않는 항목

- Supabase SQL·스키마·RLS·RPC·인덱스
- Cloudflare 환경변수·Secret
- Kakao Developers
- OpenBuilder

## 배포 전

```sh
node .codex/scripts/verify-repository.mjs
```

체크섬 32개, 자동 검사 533개, ESM `default.fetch`가 모두 통과해야 합니다.

## 배포 후

- `/health` 버전
- 홈과 `/privacy`의 정확한 소유권 메타
- `/ads.txt`의 정확한 한 줄
- `/app`, `/my/analysis`, `/receipts`, 관리자 화면의 광고 코드 부재
- 새 CSS와 홈 달력·분석·다크모드·컬러톤

이번 심사본은 기존 게시자 환경값을 무시하고 `ca-pub-8422696710972974`를 고정합니다. 배포 후 운영 응답이 이 값인지 반드시 확인하고, 실패 시 V22.8.16 Worker 소스로 코드만 롤백합니다.
