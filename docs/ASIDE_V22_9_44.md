# V22.9.44 운영 적용 안내

카카오 5초 제한 대응만 바뀝니다. 변경 내용은 응답 예산, 그리고 방 기록 경로의 순차 왕복 줄이기입니다. SQL·Secrets·관제 Worker 변경은 없습니다.

1. **하네스 확인.** `node .codex/scripts/verify-repository.mjs`, `npm run validate:categories-absent`, `node monitoring/test-d1.mjs`가 통과하는지 봅니다.
2. **앱 Worker.** `node tools/deploy-worker-version.mjs`로 업로드하고 바인딩·런타임·소스·내보내기를 대조합니다. 승격(`--promote <버전 ID>`)은 별도 승인 뒤에 합니다.
3. **배포 뒤 확인.**
   - `/health`의 판 `V22.9.44-KAKAO-LATENCY`.
   - 테스트 단톡방에서 기록을 몇 번 보냅니다. 이미 구성원인 사람의 기록은 평소 저장 답이 나옵니다. 새 방 첫 기록이나 첫 참여가 4초를 넘기면 "요청은 받았어요. 처리 결과 확인이 조금 늦어지고 있어요…"가 나오고, 잠시 뒤 ‘오늘 기록 보기’에 기록이 있습니다.
   - OpenBuilder에서 '스킬 서버 연결 오류' 알림이 더 오지 않는지 봅니다.
   - 관리자 `/nlu-ops`의 지연값을 확인합니다(먼저 답한 요청도 실제 걸린 시간으로 집계됩니다).
4. **선택(변수).** 예산을 바꾸려면 Worker 변수 `KAKAO_RESPONSE_BUDGET_MS`(밀리초, 200~4700)를 둡니다. 넣지 않으면 4000입니다.
5. **되돌리기(앱 Worker).** 문제가 있으면 승인 후 `node tools/deploy-worker-version.mjs --rollback 7ece012b-15d0-4738-ae50-428ddb19b089`로 V22.9.43(배포 `c9a302ff-fcb1-4d43-9b69-7147f075aa62`, 소스 SHA-256 `4002c6dc1bda4e3992f9d841b5dff60e25efb8bcf10ec7a24a53be9bb54383c1`)으로 돌아갑니다.
