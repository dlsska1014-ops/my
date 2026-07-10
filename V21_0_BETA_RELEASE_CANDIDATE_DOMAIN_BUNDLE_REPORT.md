# V21.0 BETA RELEASE CANDIDATE DOMAIN BUNDLE REPORT

## Version
`V21.0-BETA-RELEASE-CANDIDATE-DOMAIN-BUNDLE`

## 목적
베타 릴리스 후보판으로 고정하기 전, 개인 workers.dev 주소가 사용자/카카오 심사 화면에 남지 않도록 공개 도메인 기준값을 분리하고 최종 점검 경로를 추가했습니다.

## 변경 내용
- `APP_VERSION`, `APP_MODE`를 V21.0 기준으로 갱신
- `PUBLIC_BASE_URL` / `SERVICE_BASE_URL` / `APP_BASE_URL` / `CANONICAL_BASE_URL` 우선순위의 공개 주소 helper 추가
- 카카오 Skill 응답, OpenBuilder 안내, Redirect URI 안내가 공개 주소를 우선 사용하도록 보정
- `CANONICAL_REDIRECT=1` 설정 시 GET 요청의 workers.dev 접속을 공개 주소로 308 리다이렉트하는 선택 기능 추가
- `/domain-migration`, `/custom-domain-guide`, `/domain-check`, `/canonical-domain-check` 추가
- `/beta-release-candidate`, `/release-candidate-final`, `/v21-final-check`, `/final-candidate-check` 추가
- `/operation-center`에 V21 최종 후보와 도메인 이전 점검 메뉴 추가
- 문서의 기존 개인 workers.dev 주소를 `${PUBLIC_BASE_URL}` 기준으로 정리

## 운영 권장값
```text
PUBLIC_BASE_URL=https://새_공개_도메인
CANONICAL_REDIRECT=1  # 커스텀 도메인 연결 확인 후에만 활성화
```

## 카카오 재설정 체크
- Kakao Developers > Web domain: `${PUBLIC_BASE_URL}`
- Redirect URI: `${PUBLIC_BASE_URL}/auth/kakao/callback`
- OpenBuilder Skill URL: `${PUBLIC_BASE_URL}/skill`
- 심사용 첫 화면: `${PUBLIC_BASE_URL}/my`

## 유지한 범위
- `/my`, `/app`, `/skill` 핵심 저장 로직 변경 없음
- 권한/가계부 범위 변경 없음
- Supabase 테이블 구조 변경 없음
- 밈 이미지 및 콘텐츠센터 유지
- 하단 사업자 푸터 유지

## 검증
- `node --check src/index.js` PASS
- ES module import PASS
- `/health` smoke PASS
- `/domain-migration` 관리자 smoke PASS
- `/beta-release-candidate` 관리자 smoke PASS
- `/openbuilder-final` 공개 주소 반영 확인 PASS
- `/kakao-commands` 공개 주소 반영 확인 PASS
- `CANONICAL_REDIRECT=1` 308 redirect smoke PASS
- ZIP 무결성 PASS
