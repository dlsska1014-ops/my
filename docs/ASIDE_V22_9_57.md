# V22.9.57 남은 확인

- iOS Safari·Android Chrome·카카오톡 인앱·VoiceOver/TalkBack·실제 BFCache와 운영 Cloudflare CPU는 별도로 확인합니다. Chrome CDP 터치와 접근성 트리를 실기기/보조기기 통과로 표시하지 않습니다.
- 동일 거래 GET의 exact count는 요청 수 증가와 별개로 DB 집계 비용이 늘 수 있습니다. 실제 운영 성능은 측정하지 않았습니다. [PostgREST 공식 계약](https://docs.postgrest.org/en/stable/references/api/pagination_count.html)을 따릅니다.
- 여러 페이지의 총수·범위·ID 검사는 확인 가능한 모순만 찾습니다. 총수가 같고 중복 ID가 없어도 단일 시점 스냅샷이나 모든 동시 변경 누락 부재를 보장하지 않습니다. 새 SQL/RPC로 보장을 확대하지 않습니다.
- 레거시 computeFairMoM 등 D-3의 다른 경로, E-15 완전 복원·만료된 불명확 가져오기 복구·관리자 감사·실제 환급 정산·정기 실행은 이번 기능 범위 밖입니다.
- 다음 단계는 별도로 검토할 통합·출시 준비입니다. 커밋·푸시·PR·병합·업로드·배포와 운영 변경은 자동 실행하지 않습니다. 미배포입니다.
