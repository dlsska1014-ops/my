# 똑똑한가계부 Cloudflare Bundle — V22.5 RC

현재 버전:

```text
V22.5-RELEASE-CANDIDATE-SELECTIVE-UIUX-MERGE
```

## V22.5 핵심

V22.4.3을 기준으로 Claude의 UI·UX 개선본에서 안전한 항목만 선택 병합했습니다. 첨부본 전체 소스와 PWA는 반영하지 않았습니다.

- 분류별 거래 건수 집계 오류 수정
- `/my/analysis`와 종합 리포트 안전모드 적용
- 분석 JavaScript 로드 실패 안내 추가
- 큰 금액·거래 목록에서 해당 날짜 기록 화면으로 이동
- `|` 등 특수문자가 포함된 필터 URL 복원 안정화
- 필터 버튼 `aria-pressed` 접근성 보강
- 이번 달과 지난달 같은 기간의 공정 비교
- 실제 누적 지출과 예산 페이스 비교
- 모바일에서 사이드 메뉴 기본 접힘
- CSV 수식 주입 방어, 9,000건 제한 안내, `nosniff` 유지
- 공개 홈페이지, AdSense·Search Console, NLU, 계정 안정화, 사이트맵 유지

## 반영하지 않은 항목

- 공개 루트 `/`를 `/my`로 보내는 구형 구조
- 관리자 경로 제거
- 첨부본 전체 `src/index.js` 교체
- 서비스워커·PWA·구형 파란색 아이콘
- 기존 CSV 보안 방어 제거

## 배포

- Worker의 `src/index.js`만 배포
- `/health`에서 V22.5 버전 확인
- OpenBuilder와 Supabase 스키마 변경 없음
- `FINAL_APPLY_CHECKLIST_V22_5.md` 순서대로 분석 화면과 모바일 메뉴 확인

---

# 똑똑한가계부 Cloudflare Bundle — V22.4

현재 버전:

```text
V22.4-ADSENSE-PUBLIC-CONTENT-ONBOARDING-RECOVERY-BUNDLE
```

## V22.4 핵심

- 공개 루트(`/`)를 서비스 소개 페이지로 전환하고 기존 사용자 앱은 `/my`로 유지
- AdSense 사이트 심사를 위한 독창적인 공개 콘텐츠·탐색 구조 추가
- 서비스·사용법·카카오톡·예산·가족/모임·보안·FAQ·사업자·문의 페이지 제공
- 개인정보처리방침, 이용약관, 쿠키·광고 기술 안내 보강
- `robots.txt`, `sitemap.xml`, 환경변수 기반 `ads.txt` 제공
- AdSense 확인 메타 태그를 `ADSENSE_PUBLISHER_ID`로 설정
- 실제 광고는 `ADSENSE_ENABLED=0` 기본값으로 비활성
- 가계부 생성 종류 단계의 반복 응답·무한 루프 제거
- 이름처럼 입력한 문장은 생성 전 확인하고 종류·이름 재선택 경로 제공
- V22.3 NLU 운영 집계, V22.2 분석 UI, 거래·예산·권한·중복 방어 유지

## 공개 페이지

```text
/
/service-guide
/how-it-works
/kakao-guide
/budget-guide
/group-accountbook
/security
/faq
/about
/contact
/privacy
/terms
/cookies
/robots.txt
/sitemap.xml
/ads.txt
```

## AdSense 심사 설정

```text
ADSENSE_PUBLISHER_ID=ca-pub-실제번호
ADSENSE_ENABLED=0
ADSENSE_AUTO_ADS=0
PUBLIC_SUPPORT_EMAIL=공식 문의 이메일(선택)
```

심사 준비 단계에서는 확인 메타 태그와 `ads.txt`만 활성화하고 실제 광고 노출은 카카오 정규 런칭·안정화 후 진행하는 것을 권장합니다.

## 가계부 생성 복구 예시

```text
가계부 생성
→ 종류 5개와 설명을 텍스트로 표시

우리집 가계부
→ 이름으로 이해하고 생성 전 확인

어떤 선택이 있는데 / 선택 / 종류 알려줘
→ 선택 목록을 다시 표시

그냥 가계부
→ 일반 가계부 이름으로 확인
```

## 배포

- Worker `src/index.js` 배포
- `/health` 버전 확인
- `FINAL_APPLY_CHECKLIST_V22_4.md` 순서대로 공개 페이지와 AdSense 환경변수 확인
- OpenBuilder 시나리오명·블록명·발화·Skill URL은 변경하지 않음

---

현재 버전:

```text
V22.3-NLU-OPS-LEARNING-ROLLOUT-BUNDLE
```

## V22.3 핵심

- V22.2 분석 스튜디오와 V22.1 자연어 엔진 유지
- 관리자용 `/nlu-ops` 자연어 운영·학습 센터
- 의도별 성공·폴백·확인 질문·오류와 응답시간 집계
- `/nlu-ops.json`, `/nlu-failures.csv` 운영 내보내기
- `/skill` 응답에 버전·의도·결과·요청 ID·지연 헤더
- 영구 로그는 기본 비활성, 선택 SQL 적용 시에만 저장
- 실패 문장은 사용자 키 없이 비식별·중복 집계
- OpenBuilder 시나리오·블록·발화와 기존 Supabase 스키마 변경 없음

## 기본 배포

Worker의 `src/index.js`만 배포하면 메모리 기반 운영 집계를 바로 사용할 수 있습니다.  
`schema_v22_3_nlu_ops_optional.sql`과 NLU 환경변수는 선택 사항입니다.

공개 도메인:

```text
https://ttokttok-accountbook.com
```

Kakao OpenBuilder Skill URL:

```text
https://ttokttok-accountbook.com/skill
```

## V21.5.2 추가 개선

- `닉네임수정`, `닉네임 변경`, `별명 설정`, `표시명 변경` 인식
- `닉네임 인남으로 변경` 한 문장 처리
- `초대코드`, `구성원 초대`, `초대 방법` 응답에 참여자·초대 관리 URL 1개 제공
- 예산 변경·가계부 전환·단톡방 연결·정산·날짜별 지출 질문 동의어 보강
- 미인식 안내를 의도별 예시로 개선
- OpenBuilder 블록·발화·스킬 URL 변경 없음

## 이번 버전 핵심

- 처음 사용자를 위한 단계형 시작 흐름
- 카카오톡에서 새 가계부 생성 및 초대코드 참여
- 가계부 종류 선택과 이름 입력
- 전체 월 예산·카테고리별 예산 설정
- `식비 예산설정 백만원` 같은 자연어 직접 설정
- 현재 사용액·잔여액·카테고리별 사용률 조회
- 카카오 사용자와 가계부 표시명 매핑
- 날짜별 수입·지출·카테고리·결제자 요약
- 일반 거래 응답의 반복 링크와 quickReplies 제거
- 가치가 분명한 전환 지점에서만 홈페이지 CTA 제공
- 대화 단계는 Supabase `accountbook_settings`에 30분 동안 저장

## 지원 예시

```text
시작
새 가계부 만들기
초대코드로 참여
예산 설정
식비 예산설정 100만원
남은예산
내 이름 설정
점심 12000원 국민카드
오늘 요약
어제 요약
이번 주 요약
단톡방 연결 ABC123
```

## 유지한 구조

- `/my`, `/app`, `/skill` 기존 핵심 저장 흐름
- 가계부 권한과 범위 제한
- 중복 저장 방어와 사용자 단위 레이트리밋
- 기존 Supabase 테이블 구조
- 공개 도메인 및 카카오 로그인

별도 테이블 마이그레이션은 없습니다. 단계 상태와 CTA 억제 정보는 기존 `accountbook_settings`를 사용합니다.

## 중요 문서

- `KAKAO_OPENBUILDER_UTTERANCES.md`: 봇 입장·도움말·폴백·대표 명령 설정
- `OPENCHATBOT_CHAT_FIRST_SETUP.md`: 채팅 우선 UX 원칙
- `V21_5_GUIDED_ONBOARDING_BUDGET_BUNDLE_REPORT.md`: 구현 범위와 검증 결과
- `FINAL_APPLY_CHECKLIST.md`: 배포·OpenBuilder 적용 체크리스트

## 로컬 검증

```text
node --check src/index.js
node smoke_v2152.mjs
```

## 배포 후 확인

1. `/health`에서 `V21.5-GUIDED-ONBOARDING-BUDGET-BUNDLE` 확인
2. OpenBuilder Skill URL과 폴백 블록 연결 확인
3. 신규 사용자 `/시작`부터 첫 기록까지 실제 그룹방 테스트
4. 일반 기록 응답에 링크와 quickReplies가 없는지 확인
5. 홈페이지 CTA가 동일 사용자·가계부·종류 기준으로 24시간 내 반복되지 않는지 확인


## V22.1 추가
- 21개 중앙 Intent Registry
- 모호한 자연어 선택형 확인
- 합성 5천 건급 NLU 회귀 데이터
- 외부 AI 호출 없는 비용 고정 구조
- 선택형 집계 로그 SQL

## V22.4.1 계정·가계부 안정성

- 일반 사용자 화면에서 내부 사용자 ID 일부를 제거했습니다.
- 화면 조회가 참여자를 자동으로 소유자로 승격하지 않습니다.
- 거래 저장은 새 가계부를 자동 생성하지 않습니다.
- 관리자 전용 `/identity-audit`에서 중복 계정을 점검하고 명시적으로 통합할 수 있습니다.
- 데이터 정리 후 선택 SQL로 사용자키·참여행 중복을 차단할 수 있습니다.

자세한 적용 순서는 `IDENTITY_STABILITY_RUNBOOK.md`를 확인하세요.
