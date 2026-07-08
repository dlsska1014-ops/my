# Kakao OpenBuilder 발화/블록 설정 가이드

## Skill URL
```text
https://kakao-accountbook.dlsska1014.workers.dev/skill
```

## 가장 중요한 원칙
카카오톡에서 `이해하기 어려워요`가 나오면 대부분 Worker 코드가 아니라 OpenBuilder에서 해당 발화가 `/skill`로 전달되지 않는 상태입니다.

특히 **폴백 블록**도 반드시 Skill URL로 연결해야 합니다.

## 권장 블록

### 1. 도움말 블록
발화:
```text
도움말
처음
시작
시작하기
메뉴
사용법
웰컴
```
연결: Skill 사용

### 2. 입력 예시 블록
발화:
```text
입력 예시
입력
지출 입력
수입 입력
어떻게 입력
카톡 입력
```
연결: Skill 사용

### 3. 요약 블록
발화:
```text
요약
이번 달 요약
이번달
통계
현황
정산
```
연결: Skill 사용

### 4. 예산 블록
발화:
```text
남은예산
남은 예산
예산 확인
예산현황
사용금액
예산 사용률
남은 돈
쓸 수 있는 돈
잔여 예산
얼마 남았어
```
연결: Skill 사용

### 5. 최근 기록 블록
발화:
```text
최근
최근 내역
오늘 기록
오늘 내역
기록
```
연결: Skill 사용

### 6. 수정 블록
발화:
```text
수정가이드
수정 방법
번호수정
번호 수정
방금 수정
삭제 방법
```
연결: Skill 사용

### 7. 키워드 블록
발화:
```text
키워드 안내
키워드
분류
자동분류
자동 분류
```
연결: Skill 사용

### 8. 정기지출 블록
발화:
```text
정기지출
정기 지출
자동차세
재산세
자동차보험
보험 준비
납부 알림
```
연결: Skill 사용

### 9. 링크 블록
발화:
```text
링크
주소
가계부 시작
안전 링크
내 가계부
```
연결: Skill 사용

### 10. 초대 블록
발화:
```text
초대
초대코드
초대 코드
가계부 참여
```
연결: Skill 사용

### 11. 자유 입력/거래 입력 블록
발화 예시:
```text
점심 12000원 국민카드
커피 5000원 현금
월급 250만원
어제 병원 15000원
7월 2일 주유 70000원
```
연결: Skill 사용

### 12. 폴백 블록
대상: 위 블록에서 잡히지 않는 모든 말

연결: 반드시 Skill 사용

## 웰컴 버튼 안전 링크
```text
가계부 시작하기 -> https://kakao-accountbook.dlsska1014.workers.dev/my
시작가이드 -> https://kakao-accountbook.dlsska1014.workers.dev/start-guide
키워드 안내 -> https://kakao-accountbook.dlsska1014.workers.dev/keyword-guide
수정가이드 -> https://kakao-accountbook.dlsska1014.workers.dev/chatbot-edit-guide
```

## 배포 후 테스트
```text
도움말
입력 예시
남은예산
예산 확인
요약
오늘 기록
수정가이드
키워드 안내
정기지출
링크
아무말
점심 12000원 국민카드
```
