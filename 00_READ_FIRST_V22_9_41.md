# V22.9.41 읽기 전 안내

## V22.9.41 관리자 로그인 복귀와 옛 관리자 화면 내비 스타일

현재 저장소 버전은 `V22.9.41-ADMIN-RETURN`입니다. 운영에는 아직 배포하지 않았습니다(운영 현재값은 V22.9.40).

- 관리자 전용 화면(`/ops-monitor`·`/ops-monitor/open`·`/nlu-ops`·`/skill-ops`·`/ops-skill`)을 세션 없이 열면 `/admin-view?return_to=<요청 경로·쿼리>`로 보내고, 로그인 뒤 그 화면으로 돌아갑니다. 전에는 `/admin-view`로만 보내 로그인 뒤 `/?legacy=1` 옛 관리자 화면에 떨어졌습니다.
- 옛 관리자 화면(`/?legacy=1`·`/admin-view`)의 사이드바가 V22.8.44 이후 스타일 없이(맨글자 링크·화면을 덮는 브랜드 아이콘) 나오던 것을 고쳤습니다. `renderUnifiedNav`를 admin 범위로 불러 인라인 내비 스타일을 head에 싣습니다. 사용자 화면(`/app` 등)은 바이트가 같습니다.
- SQL·환경변수·Secrets·관제 Worker·Kakao Developers·OpenBuilder 변경은 없습니다.

검증은 `VERIFICATION_V22_9_41.md`, 운영 적용 순서는 `docs/ASIDE_V22_9_41.md`를 확인합니다.
