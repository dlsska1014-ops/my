# V22.6 미완성 기능 경로 감사

## 기본 정책

- `MEME_CARDS_ENABLED`가 없거나 `0`이면 밈카드 계열을 숨깁니다.
- `CARD_PERFORMANCE_ENABLED`가 없거나 `0`이면 카드 실적 계열을 숨깁니다.
- 숨김 경로는 메뉴에서 제거하고 직접 접근도 HTTP 404로 차단합니다.
- 응답에는 `X-Robots-Tag: noindex, nofollow`를 설정합니다.
- 기존 코드는 롤백 검토를 위해 남겨두지만 기본 상태에서는 실행되지 않습니다.

## 밈카드 차단 경로

### 공개·공유

- `/share`
- `/share/meme`
- `/share/meme/like`
- `/share/meme/share`
- `/share/meme-image`

### 사용자 화면

- `/meme`
- `/meme-image`
- `/meme-lab`
- `/meme-archive`
- `/meme-rank`
- `/meme-stats`

### 콘텐츠·검수 화면

- `/meme-card-content`
- `/meme-card-plan`
- `/meme-cards`
- `/meme-content-center`
- `/meme-library`
- `/meme-publish-center`
- `/meme-motion-guide`
- `/nanobanana-prompts`
- `/meme-animation-guide`
- `/meme-review-check`
- `/meme-safety-check`
- `/meme-policy-check`
- `/meme-share-kit`
- `/meme-kakao-share-kit`
- `/meme-share-copy`
- `/meme-card-catalog.json`

### 변경 요청

- `POST /admin/meme/react`
- `POST /admin/meme/save`
- `POST /admin/meme/delete`

## 카드 실적 차단 경로

- `/card-benefits`

## 링크 제거 확인 화면

- 통합 상단 내비게이션
- `/menu`
- `/app`
- `/my/analysis`
- 관리자 레거시 탭과 사이드바
- `/diagnostics`
- `/ops-audit`
- `/final-release`
- `/feature-map`
- `/deploy-runbook`
- `/real-user-qa`

## 유지되는 기능

- 사용자가 등록한 결제수단 관리 `/payment-methods`
- 거래 기록에 저장되는 결제수단 문자열
- 일반 분석의 결제수단별 집계

카드 **실적·혜택 자동 계산**만 숨기며, 거래에 카드명을 기록하는 기능은 유지합니다.
