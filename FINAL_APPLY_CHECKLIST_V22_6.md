# V22.6 적용 체크리스트

1. Worker `src/index.js` 전체 교체 후 배포
2. `/health` 버전 확인
3. `/menu`, `/app`, `/my/analysis`, `/my/premium` 확인
4. `/meme-lab`, `/meme-archive`, `/card-benefits`가 404인지 확인
5. 기존 거래·예산·가계부 생성·참여·단톡방 연결 회귀 확인
6. 환경변수 `MEME_CARDS_ENABLED`, `CARD_PERFORMANCE_ENABLED`는 만들지 않거나 `0` 유지
7. 현재 프리미엄 결제는 연결하지 않음
