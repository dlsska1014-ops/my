# V22.9.40 읽기 전 안내

## V22.9.40 광고 게이트와 생활비 가이드 글

현재 저장소 버전은 `V22.9.40-ADS-GATE-CONTENT`입니다. 운영에는 아직 배포하지 않았습니다(운영 현재값은 V22.9.39).

- A 화면 다듬기: "생활비 리포트" 명칭 통일, 감사 잔여 U9·U10·H11·D14(거래내역 탭).
- B 광고 게이트: `ADS_MODE`(없으면 review, 게이트 전과 바이트 동일)와 `ADS_SLOT_CONTENT`, 허용 화면에만 광고, `/ready`의 `ads_mode`.
- C UI·성능: 기간 내비게이터, 셸 CSS v22940, `Link` preload 머리, 홈 `Speculation-Rules` 머리.
- D 생활비 가이드 글 12편과 허브·홈·소개 연결, 정본 공개 문서 30개.
- 통합 단계: www 정본 308, 관제 알림 이메일 채널(Secret `ALERT_TO`), GitHub 외부 검사 30분 예약.
- SQL·Kakao Developers·OpenBuilder 변경은 없습니다. `ADS_MODE`·`ADS_SLOT_CONTENT`는 AdSense 승인 뒤에만 만듭니다.

검증은 `VERIFICATION_V22_9_40.md`, 운영 적용 순서는 `docs/ASIDE_V22_9_40.md`, 묶음별 기록은 `docs/codex/V22_9_40_A.md`~`V22_9_40_D.md`를 확인합니다.
