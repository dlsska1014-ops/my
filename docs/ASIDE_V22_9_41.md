# V22.9.41 운영 적용 안내

관리자 로그인 복귀와 옛 관리자 화면 내비 스타일만 바뀝니다. SQL·변수·Secrets·관제 Worker 변경은 없습니다.

1. **하네스 확인.** `node .codex/scripts/verify-repository.mjs`, `npm run validate:categories-absent`, `node monitoring/test-d1.mjs`가 통과하는지 봅니다.
2. **앱 Worker.** `tools/deploy-worker-version.mjs`의 기존 절차로 업로드하고 바인딩·런타임·소스·내보내기를 대조합니다. 승격(`--promote`)은 사용자의 별도 승인 뒤에 합니다.
3. **배포 뒤 확인.**
   - `/health`의 판 `V22.9.41-ADMIN-RETURN`.
   - `curl.exe -sI https://malhaebook.com/ops-monitor` → 303, `location: /admin-view?return_to=%2Fops-monitor`.
   - 브라우저(관리자 세션 없이)에서 `https://malhaebook.com/ops-monitor`를 열어 로그인하면 종합 관제 화면으로 돌아옵니다.
   - 관리자 세션으로 `https://malhaebook.com/?legacy=1`을 열면 왼쪽 사이드바(적는다·본다·계획한다·설정)가 보이고 브랜드 아이콘이 작게 나옵니다.
   - `/app`·`/my`·공개 문서는 바뀐 것이 없습니다.
4. **되돌리기(앱 Worker).** 문제가 있으면 승인 후 `node tools/deploy-worker-version.mjs --rollback 3a2567c4-3226-4307-91a0-7e5faf407690`로 V22.9.40(배포 `806bf81e-4c21-4471-831f-107039f21463`, 소스 SHA-256 `560171890b1ce1a5b1cdc590c2da4e9040db557c2ccd036cc988b2903fe09a5b`)으로 돌아갑니다.
