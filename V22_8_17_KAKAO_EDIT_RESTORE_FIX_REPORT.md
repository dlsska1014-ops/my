# V22.8.17 카카오 복구(undo) 실패 핫픽스 보고서

## 재현된 운영 버그

```
사용자: 복구 03번 → 봇: 복구가 잠시 지연되고 있어요. 잠시 후 다시 ‘복구’를 입력해 주세요. (매번 반복)
```

## 원인

삭제 시 복구 버퍼에 저장하는 행은 `getKakaoRowById`/`getDailyKakaoRows` 조회 결과인데, 이 조회의 select 목록에 `household_id`가 없다(쿼리 필터로만 사용). 복구는 이 행을 `transactions`에 그대로 재삽입하는데 `household_id`는 NOT NULL 컬럼이라 INSERT가 항상 400으로 거부됐고, 예외 처리 문구("잠시 지연")가 일시 장애처럼 보이게 했다. QA fixture가 NOT NULL을 강제하지 않아 자동 검증(E2E 복구 시나리오 포함)을 통과했다.

## 조치

1. 삭제 시(명령 경로·세션 경로 모두) 버퍼에 `household_id`를 명시 저장
2. 복구 시점에 레거시 버퍼(이미 운영에 저장된 `household_id` 없는 버퍼)도 현재 가계부로 보충 — 배포만으로 기존 삭제 건 복구 가능
3. 재삽입 전 같은 id 행의 존재를 확인해 중복 삽입 방지 (직전 시도가 응답 단계에서만 실패한 경우 대비)
4. `id`·`created_at` 제외 순차 재시도 (id가 생성 전용 컬럼인 환경 대비)
5. 최종 실패 시 실제 DB 오류 메시지를 `unrecognized_inputs`에 `type='restore_error'`로 적재해 운영 가시성 확보
6. QA fixture에 `transactions` NOT NULL 제약을 재현해 회귀 차단

## 검증

- 수정 플로우 검증 120개(+6) 포함 전체 414개 자동 검증 통과
- 레거시 버퍼(household_id 없음) 복구 성공을 엔드투엔드로 확인
