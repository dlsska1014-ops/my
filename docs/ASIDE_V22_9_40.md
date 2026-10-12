# V22.9.40 운영 적용 안내

저장소 준비본이며 운영 배포를 실행하지 않았습니다. PR의 CI를 확인하고 별도 승인을 받은 뒤 아래 순서로 적용합니다. 토큰이 필요한 명령은 사용자가 직접 실행합니다.

1. **하네스 확인.** `node .codex/scripts/verify-repository.mjs`, `npm run validate:categories-absent`, `node monitoring/test-d1.mjs`가 통과하는지 봅니다(두 모드 각각 14,517개 검사·399개 체크섬, SQLite 84개).
2. **앱 Worker.** `tools/deploy-worker-version.mjs`의 기존 절차로 업로드하고 바인딩·런타임·소스·내보내기를 대조합니다. 승격(`--promote`)은 사용자의 별도 승인 뒤에만 합니다. 승격 뒤 공개 검사(`tools/verify-deployment-v22920.mjs`)는 `/ready`의 `ads_mode`를 읽어 review 단언을 고릅니다.
3. **배포 뒤 확인.**
   - `/health`의 판 `V22.9.40-ADS-GATE-CONTENT`, `/ready`의 `"ads_mode":"review"`.
   - `curl.exe -sI https://www.malhaebook.com/budget-guide` → 308, `location: https://malhaebook.com/budget-guide`.
   - 새 글 12개가 200과 `X-Robots-Tag: index, follow`를 내고, `/sitemap.xml`에 30개(새 글 lastmod 2026-10-12)가 있습니다.
   - 셸 화면(예: 로그인 `/my`)에 `Link: </assets/accountbook-shell-v22940.css>; rel=preload; as=style, …`, 홈 `/app`에 `Speculation-Rules: "/assets/speculation-rules-v22940.json"`이 있습니다.
   - 공개 페이지와 `/app`에 `adsbygoogle`이 없습니다.
4. **관제 알림.** Email Routing에서 대상 주소를 인증한 뒤 `npx wrangler secret put ALERT_TO --config monitoring/wrangler.jsonc` → `npx wrangler deploy --config monitoring/wrangler.jsonc`. 예전 빈 `ALERT_TO` var와 이름이 겹친다며 거부되면 배포를 먼저 하고 다시 넣습니다. `/ops-monitor` 하단 "알림 발송"이 `수집됨`인지 봅니다.
5. **Early Hints(선택).** Cloudflare 대시보드 → malhaebook.com → Speed → Settings → Content Optimization → Early Hints: On. 다음 요청부터 103을 먼저 보냅니다.
6. **Search Console.** `sitemap.xml`을 다시 제출하고, 필요하면 `/guides`와 새 글 몇 편을 URL 검사로 색인 요청합니다.
7. **카카오 확인.** `docs/ASIDE_V22_9_36.md` 4절의 C1~C4를 합니다.
8. **AdSense 승인 뒤에만(지금은 하지 않음).**
   1. AdSense → 개인정보 보호 및 메시지에서 EEA·영국·스위스 동의 메시지를 켭니다.
   2. Cloudflare → Workers & Pages → kakao-accountbook → Settings → Variables and Secrets → Add → Type Text → `ADS_MODE` = `live`(선택: `ADS_SLOT_CONTENT` = 슬롯 id 숫자) → **Deploy**. 저장만 하면 다음 스크립트 배포가 거부됩니다.
   3. `curl.exe -s https://malhaebook.com/ready` → `"ads_mode":"live"`.
   4. `/budget-guide`에 광고 로더가 1개 있고, 로그인한 `/app`과 `/my`에는 없습니다.
   5. 자동 광고를 켠다면 vignette·anchor 형식은 끄고 제외 영역을 설정합니다.
   - 되돌리기: `ADS_MODE`를 지우거나 `review`로 바꾸고 Deploy 합니다.
9. **되돌리기(앱 Worker).** 문제가 있으면 승인 후 `node tools/deploy-worker-version.mjs --rollback 40159ed0-8c35-4840-bb9f-964e5ccde87e`로 V22.9.39(배포 `d11c0e79-69b2-4542-9546-5a4895258b49`, 소스 SHA-256 `d97e3a60bb881546aacf8953a091152ff16b77cfd5c173452fecb2348cd4a7e5`)로 돌아갑니다.
