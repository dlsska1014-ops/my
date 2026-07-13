# V21.5.2 자연어 의도·스마트 CTA 핫픽스 우선 적용

1. Cloudflare Worker에 이 패키지의 `src/index.js`를 배포합니다.
2. `https://ttokttok-accountbook.com/health`에서 `V21.5.2-NATURAL-INTENT-SMART-CTA-HOTFIX`를 확인합니다.
3. OpenBuilder 시나리오명·블록명·발화·스킬 URL은 변경하지 않습니다.
4. 운영 단톡방에서 `@똑똑한가계부 닉네임수정`을 테스트합니다.
5. `닉네임 인남으로 변경`이 즉시 저장되는지 확인합니다.
6. `초대코드` 응답에 초대 문구와 `참여자·초대 관리` URL 1개가 표시되는지 확인합니다.
7. `구성원 초대`, `예산 바꾸기`, `이번 달 얼마 썼어`, `가계부 바꾸기`, `단톡 연결`, `정산해줘`를 테스트합니다.
8. 일반 거래 저장 응답에는 URL이 없는지 확인합니다.
9. `/skill-ops`에서 `ok`와 `latency_ms`를 확인하고 카카오 오류 1001이 재발하지 않는지 확인합니다.

---

# 최종 적용 체크리스트 — V21.5

## 배포 파일

```text
kakao-accountbook-cloudflare-v21.5-guided-onboarding-budget.zip
```

내부 버전:

```text
V21.5-GUIDED-ONBOARDING-BUDGET-BUNDLE
```

## Cloudflare 환경변수

```text
PUBLIC_BASE_URL=https://ttokttok-accountbook.com
SERVICE_BASE_URL=https://ttokttok-accountbook.com
APP_BASE_URL=https://ttokttok-accountbook.com
CANONICAL_BASE_URL=https://ttokttok-accountbook.com
```

기존 Supabase 환경변수와 서비스 역할 키를 유지합니다. 별도 DB 마이그레이션은 없습니다.

## 1. Worker 배포 확인

- [ ] ZIP 배포 완료
- [ ] `/health`에서 `V21.5-GUIDED-ONBOARDING-BUDGET-BUNDLE` 확인
- [ ] `/skill` 브라우저 안내 화면 정상
- [ ] `POST /skill` 응답이 `version: "2.0"`과 `template.outputs`를 포함
- [ ] `/my`, `/app`, 카카오 로그인 정상

## 2. OpenBuilder 적용

- [ ] 봇 입장 블록을 `KAKAO_OPENBUILDER_UTTERANCES.md` 문구로 변경
- [ ] 봇 입장 버튼 `시작하기`가 메시지 `시작`을 전송
- [ ] 시작·도움말·가계부 만들기·초대코드 참여 블록을 `/skill`에 연결
- [ ] 예산 설정·남은예산·오늘 요약·내 이름 설정·단톡방 연결 블록을 `/skill`에 연결
- [ ] 폴백 블록을 반드시 `/skill`에 연결
- [ ] OpenBuilder에 중복 고정 답변·중복 웹 링크를 넣지 않음

## 3. 신규 사용자 실제 대화 테스트

- [ ] `시작` → 가계부 만들기/초대코드 참여/사용법 보기 표시
- [ ] 새 가계부 만들기 → 종류 선택
- [ ] 이름 입력 → 가계부 생성·초대코드 발급
- [ ] 초대코드 참여 정상
- [ ] 단톡방에서 `단톡방 연결 ABC123` 정상
- [ ] `내 이름 설정` → 표시명 저장
- [ ] 첫 거래 저장 결과에 결제자 표시

## 4. 예산 테스트

- [ ] `/예산설정` → 단계형 선택
- [ ] 카테고리별 예산 → 카테고리·금액·확인 후 저장
- [ ] `식비 예산설정 백만원` → 1,000,000원 저장
- [ ] 전체 월 예산 저장
- [ ] 지난달 예산 복사
- [ ] 일반 구성원은 예산 변경 불가
- [ ] `남은예산` → 전체와 카테고리별 사용액·잔여액·사용률 표시

## 5. 요약·응답 정책 테스트

- [ ] 오늘·어제·이번 주·지난 주·이번 달·특정 날짜 요약 정상
- [ ] 사용자별 지출 합계 정상
- [ ] 일반 거래 저장 응답에 URL 없음
- [ ] 일반 거래 저장 응답에 quickReplies 없음
- [ ] 남은예산 일반 조회에 quickReplies 없음
- [ ] 미인식 안내에 quickReplies와 URL 없음
- [ ] 응답에 문자 `\\n`이 보이지 않고 실제 줄바꿈으로 표시
- [ ] `/정산`이 월 요약이 아닌 정산 응답 반환
- [ ] 동일 상세 분석 CTA가 24시간 안에 반복되지 않음

## 6. 회귀 확인

- [ ] 거래 중복 저장 방어 정상
- [ ] 사용자 단위 레이트리밋 정상
- [ ] 가계부 권한·선택 범위 정상
- [ ] 거래 수정·삭제 정상
- [ ] 모바일 `/app` 및 캘린더 정상
- [ ] Supabase 기존 데이터와 호환

## 배포 순서

```text
1. 현재 Worker 설정 스냅샷 저장
2. V21.5 Worker 배포
3. /health 및 /skill smoke
4. OpenBuilder 개발 채널 블록 수정
5. 개발 채널 전체 대화 테스트
6. 실제 그룹방 테스트
7. OpenBuilder 운영 배포
```
