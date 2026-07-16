# V21.1 신규 그룹 챗봇 제작·대량 트래픽 런북

## 기준

- 내부 버전: `V21.1-GROUP-CHATBOT-LAUNCH-SCALE-BUNDLE`
- 목적: 카카오 그룹 챗봇 신규 제작, 개인 주소 제거, 공개 도메인 기준 시작, 대량 유입 대비
- 핵심 주소는 반드시 `PUBLIC_BASE_URL` 환경변수를 기준으로 표시한다.

## 카카오 관리자센터 신규 제작 순서

1. 새 그룹 챗봇을 만든다.
2. 기본 시나리오에서 새 블록을 구성한다.
3. Skill URL은 `${PUBLIC_BASE_URL}/skill`만 사용한다.
4. 심사용 첫 화면은 `${PUBLIC_BASE_URL}/my`를 사용한다.
5. 개인정보처리방침은 `${PUBLIC_BASE_URL}/privacy`, 이용약관은 `${PUBLIC_BASE_URL}/terms`를 사용한다.
6. 개인 계정명, 개인 이메일, 개인 Worker 주소를 공개 블록/문서/카카오 설정에 넣지 않는다.

## 필수 블록

| 블록 | 목적 | 문구 기준 |
|---|---|---|
| 봇 입장 블록 | 첫 안내 | 챗봇에게 직접 보낸 명령어만 처리한다고 안내 |
| 도움말 블록 | 사용법 안내 | 예시 3~5개만 짧게 안내 |
| 가계부 연결 블록 | 그룹방-가계부 연결 | 초대코드 기반 연결 |
| 기록 저장 블록 | 지출/수입 저장 | 금액·메모·결제수단·날짜 파싱 |
| 조회 블록 | 오늘/월간 요약 | 민감한 개인 메모 과다 노출 금지 |
| 예산 블록 | 남은 예산/초과 안내 | 80%, 100%, 초과액 증가 기준 |
| 밈 카드 블록 | 전체이용가 공유 | 실명·상호명·민감 메모 기본 숨김 |
| 폴백 블록 | 오입력 복구 | 부족한 정보 한 가지만 되묻기 |

## 허용 문구

```text
가계부적은 봇에게 직접 보낸 명령어만 처리합니다.
기록 제공을 위해 명령어와 가계부 데이터를 저장하며 보관·삭제 기준은 도움말에서 확인할 수 있습니다.
```

## 금지 문구

```text
단톡방 대화를 읽어서 자동 분석합니다.
채팅 내용을 학습해 소비 패턴을 알아냅니다.
```

## 대량 트래픽 기본값

```text
SKILL_RATE_LIMIT=60
SKILL_RATE_WINDOW_MS=60000
TRAFFIC_GUARD_LIMIT=240
TRAFFIC_GUARD_WINDOW_MS=60000
DUPLICATE_GUARD_SECONDS=90
KAKAO_RETRY_DEDUP_SECONDS=120
KAKAO_REPEAT_GUARD_SECONDS=8
KAKAO_BULK_LIMIT=25
PUBLIC_BASE_URL=https://your-domain.example.com
```

## 운영 확인 경로

```text
/group-chatbot-launch
/group-chatbot-scale
/personal-url-audit
/domain-migration
/kakao-new-bot-config.json
/ops-dashboard
/skill-ops
/ops-snapshot.json
```
