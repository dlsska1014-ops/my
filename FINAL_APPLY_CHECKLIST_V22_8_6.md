# V22.8.6 최종 적용 체크리스트

## 적용 전

- [ ] 운영 Worker 코드와 Supabase 데이터를 백업
- [ ] 환경변수와 Secret을 별도 보관
- [ ] V22.8.0 스키마 적용 상태 확인

V22.8.6 신규 SQL은 없습니다. ZIP의 과거 SQL을 다시 실행하지 마세요.

## 적용

- [ ] `src/index.js` 전체 교체 후 배포
- [ ] `/health`에서 `V22.8.6-RECEIPT-SCREEN-OPTIMIZATION` 확인
- [ ] `/receipts`, `/my`, `/menu`, `/my/analysis` 확인

## 영수증 확인

- [ ] iPhone·Android에서 앨범 선택과 카메라 촬영 각각 확인
- [ ] PC에서 드래그 앤 드롭과 이미지 붙여넣기 확인
- [ ] OCR 시작·취소·재시도와 90초 복구 확인
- [ ] 인식값 수정, 확인 체크, 저장, 같은 영수증 중복 차단 확인

```bash
node --check src/index.js
node smoke_v2286_receipt_screen_optimization.mjs
```

문제 발생 시 V22.8.5 Worker 코드로 롤백하며 SQL 롤백은 하지 않습니다.
