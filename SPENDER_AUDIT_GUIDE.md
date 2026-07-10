# 지출자 및 수정이력 가이드

## 지출자
각 거래는 user_id 기준으로 지출자를 가집니다. `/my` 최근 거래내역에서 지출자 이름을 표시합니다.

## 수정 권한
- owner/admin: 가계부 내 기록 수정, 지출자 변경 가능
- member: 자기 기록 중심으로 수정
- viewer/pending/blocked: 입력/수정 제한

## 수정됨 배지
기록이 수정되면 `수정됨` 배지가 표시됩니다. 클릭하면 어떤 항목이 어떻게 바뀌었는지 확인할 수 있습니다.

## 저장 위치
```text
accountbook_settings
key = transaction_edit_history:<householdId>
```
