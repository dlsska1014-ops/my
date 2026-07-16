# V22.6.7 미완성 기능 숨김 경로 점검

## 운영 정책

아래 경로는 기본값과 일반 운영 환경에서 모두 404로 응답합니다. 과거의 `MEME_CARDS_ENABLED=1` 또는 `CARD_PERFORMANCE_ENABLED=1`만으로는 열리지 않습니다. 운영에는 `INCOMPLETE_FEATURE_QA_ENABLED`를 설정하지 마세요.

## 소비 카드/밈 GET 경로

`/share`, `/share/meme`, `/share/meme-image`, `/meme`, `/meme-image`, `/meme-lab`, `/meme-archive`, `/meme-rank`, `/meme-stats`, `/meme-card-content`, `/meme-card-plan`, `/meme-cards`, `/meme-content-center`, `/meme-library`, `/meme-publish-center`, `/meme-motion-guide`, `/nanobanana-prompts`, `/meme-animation-guide`, `/meme-review-check`, `/meme-safety-check`, `/meme-policy-check`, `/meme-share-kit`, `/meme-kakao-share-kit`, `/meme-share-copy`, `/meme-card-catalog.json`

## 소비 카드/밈 쓰기 경로

`/share/meme/like`, `/share/meme/share`, `/admin/meme/react`, `/admin/meme/save`, `/admin/meme/delete`

## 카드 실적/혜택 경로

`/card-benefits`

## 검증 결과

- 숨김 GET 전체 26경로: 404 및 noindex 확인
- 대표 POST 5경로: 인증·저장 처리 전에 404 확인
- 숨김 POST 후 밈 저장소 변경 0건
- 메뉴·스마트 도구·모바일 36화면의 숨김 링크 노출 0건
- 카카오 `밈` 명령에 숨김 URL 노출 0건
