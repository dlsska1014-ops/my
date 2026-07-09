# 배포 URL에서 개인 아이디(dlsska1014) 제거 가이드

현재 배포 URL이 `https://<worker이름>.dlsska1014.workers.dev` 형태라면, 중앙의 `dlsska1014`는
**Cloudflare 계정의 workers.dev 서브도메인**입니다. 코드에는 포함되어 있지 않으며(전 소스 검색 0건),
Cloudflare 대시보드 설정으로만 바꿀 수 있습니다. 두 가지 방법:

## 방법 1 — workers.dev 서브도메인 변경 (5분, 무료)
1. Cloudflare 대시보드 → Workers & Pages → 우측 "Subdomain" (또는 계정 설정 → Workers 서브도메인)
2. `dlsska1014` → 원하는 이름(예: `smartledger`, `dodamnet`)으로 변경
3. 결과: `https://<worker이름>.smartledger.workers.dev`
4. ⚠️ 변경 즉시 **기존 URL은 동작하지 않음** — 카카오 Developers의 Redirect URI,
   OpenBuilder Skill URL, 채널 홈 링크를 전부 새 주소로 갱신해야 합니다.

## 방법 2 — 커스텀 도메인 연결 (권장, 심사·브랜딩에 유리)
1. 도메인 구입(예: `smartledger.co.kr`) 후 Cloudflare에 사이트로 추가
2. Workers & Pages → 해당 Worker → Settings → Domains & Routes → "Add Custom Domain"
3. `app.smartledger.co.kr` 같은 도메인을 연결 → 이후 이 주소로만 안내
4. workers.dev 주소는 유지되므로 전환 기간 동안 둘 다 동작 (카카오 등록 URL만 새 도메인으로 교체)
5. 카카오 비즈니스 심사에는 커스텀 도메인이 신뢰도 면에서 유리합니다.

## 변경 후 체크리스트
- [ ] 카카오 Developers: Web 플랫폼 도메인 + Redirect URI 갱신
- [ ] OpenBuilder: 모든 블록/폴백의 Skill URL 갱신
- [ ] 카카오 채널 홈/웰컴 메시지의 링크 갱신
- [ ] /health 로 새 주소 동작 확인
- [ ] KAKAO_REDIRECT_URI 환경변수를 쓰고 있다면 함께 갱신
