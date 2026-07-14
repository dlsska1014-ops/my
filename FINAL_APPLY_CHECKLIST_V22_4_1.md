# V22.4.1 적용 체크리스트

## 1. 배포 전

- 현재 Supabase 백업 다운로드
- `identity_audit_v22_4_1.sql` 실행
- 중복 소유자·중복 참여행 결과 저장

## 2. Worker 배포

- `src/index.js` 배포
- `/health` 버전 확인

```text
V22.4.1-IDENTITY-HOUSEHOLD-STABILITY-HOTFIX
```

## 3. 화면 확인

- `/households` 참여자 카드에서 8자리 내부 ID가 사라졌는지 확인
- 계정 유형만 표시되는지 확인
- 복수 소유자 가계부에 경고가 표시되는지 확인
- 기록 저장 후 가계부 수와 초대코드가 변하지 않는지 확인

## 4. 계정 통합

- 관리자 로그인
- `/identity-audit` 접속
- 주 계정·보조 계정 거래 건수와 로그인 방식을 확인
- 확인 문구 `통합` 입력
- 통합 후 로그아웃·재로그인

## 5. 통합 후 회귀

- 가계부 수 동일
- 거래 총건수 동일
- 소유자 1명
- 자연어 거래 저장 성공
- 웹과 카카오톡에서 같은 가계부 확인
- 초대코드 변화 없음

## 6. 선택 제약 적용

- 감사 SQL에서 중복 0건 확인
- `schema_v22_4_1_identity_constraints_optional.sql` 실행

## 7. 변경하지 않는 것

- OpenBuilder 시나리오·블록·발화
- Skill URL `/skill`
- AdSense 공개 페이지 설정
- V22.3 NLU 집계 SQL
