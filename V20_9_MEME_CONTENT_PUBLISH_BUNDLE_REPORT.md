# V20.9 MEME CONTENT PUBLISH BUNDLE

## 목적
V20.8 실사용 QA/밈 후보 패키지 위에 밈 카드 콘텐츠를 실제 운영 가능한 형태로 정리했습니다.
정지 이미지 후보 4종을 기준으로 문구, 움직임 프롬프트, 심사 안전 기준, 공유 문구를 한 곳에서 관리합니다.

## 추가 경로
- `/meme-content-center`, `/meme-library`, `/meme-publish-center`
- `/meme-motion-guide`, `/nanobanana-prompts`, `/meme-animation-guide`
- `/meme-review-check`, `/meme-safety-check`, `/meme-policy-check`
- `/meme-share-kit`, `/meme-kakao-share-kit`, `/meme-share-copy`
- `/meme-card-catalog.json`

## 유지한 것
- `/my`, `/app`, `/skill` 핵심 저장 로직
- 가계부 범위/권한 체크
- 빠른입력 분류 보정 V20.7.2
- 메뉴/밈 가독성 보정 V20.7.1
- 중복/트래픽 방어
- 예산 알림, 모임/여행 정산, 카카오 단톡방 흐름
- 하단 사업자 푸터
- Supabase 테이블 구조

## 밈 운영 기준
- 전체이용가 문구만 사용합니다.
- 비속어, 조롱, 차별, 성적 표현, 폭력, 도박, 음주·흡연 조장 표현을 금지합니다.
- 움직이는 이미지는 2~3초 짧은 루프 기준입니다.
- 정지 이미지 대체본을 항상 유지합니다.
- 공개 전 `/meme-review-check`에서 문구와 프레임 안전성을 확인합니다.

## 검증
- `node --check src/index.js` PASS
- ES module import PASS
- `/health` smoke PASS
- `/meme-content-center` smoke PASS
- `/meme-motion-guide` smoke PASS
- `/meme-review-check` smoke PASS
- `/meme-share-kit` smoke PASS
- `/meme-card-catalog.json` smoke PASS
- ZIP 무결성 PASS
