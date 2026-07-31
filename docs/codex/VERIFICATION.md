# Codex 검증 하네스

회사 PC와 집 PC의 Codex CLI·IDE에서 같은 저장소 검증을 실행하기 위한 기준입니다. 현재 저장소 하네스는 V22.8.62 배포 묶음을 확인합니다.

## 전체 검증

저장소 루트에서 실행합니다.

```sh
node .codex/scripts/verify-repository.mjs
```

하네스는 다음을 순서대로 확인합니다.

1. `BUNDLE_FILE_CHECKSUMS_V22_8_62.sha256`의 배포 파일
2. `src/index.js` JavaScript 문법
3. 영수증 56개
4. 카카오 그룹 22개
5. 카카오 수정·삭제·복구 V4 130개
6. 가계부·운영 보안 89개
7. 참여자 역할 스키마 20개
8. UX·분석 보호 56개
9. 사용자 화면·홈 버튼·테마·성능 161개
10. AdSense 심사·V2·UI V5 공통 셸 261개
11. UI V5 권한·범위·저장 안정화 41개
12. 핵심 쓰기·권한 스모크 110개
13. UI/UX 1~4단계 218개
14. 리포트 대시보드 UX 60개
15. 홈 우측 기록·챌린지 보정 68개
16. 챌린지·최근 기록 UI/UX 76개
17. 계정·런타임 신뢰성 16개
18. 기능·UI 신뢰성 48개
19. 모바일 화면 보정 69개
20. 모바일 전체 탭 점검 102개
21. ESM import와 `default.fetch`
22. 작업 트리·스테이징 영역의 공백 오류

성공 결과는 총 1,603개 자동 검사와 현재 `src/index.js` SHA-256을 표시합니다.

## 빠른 검사

| 영역 | 명령 |
|---|---|
| 영수증 | `npm run validate:receipt` |
| 카카오 | `npm run validate:kakao-group` |
| 카카오 수정·복구 | `npm run validate:kakao-edit` |
| 계정·가계부 보안 | `npm run validate:household-security` |
| 참여자 역할 스키마 | `npm run validate:member-role-schema` |
| UX·분석 보호 | `npm run validate:ux-principles` |
| 접근성 테마·홈 셸·성능 | `npm run validate:performance` |
| AdSense 심사·V2·UI V5 공통 셸 | `npm run validate:adsense-v2` |
| UI V5 권한·범위·저장 안정화 | `npm run validate:v5` |
| 핵심 쓰기·권한 스모크 | `npm run validate:core-write` |
| UI/UX 1단계 | `npm run validate:uiux-stage1` |
| UI/UX 2단계 | `npm run validate:uiux-stage2` |
| UI/UX 3단계 | `npm run validate:uiux-stage3` |
| UI/UX 4단계 | `npm run validate:uiux-stage4` |
| 리포트 대시보드 UX | `npm run validate:report-dashboard` |
| 홈 우측 기록·챌린지 보정 | `npm run validate:home-rail-challenge` |
| 챌린지·최근 기록 UI/UX | `npm run validate:challenge-activity-ux` |
| 계정·런타임 신뢰성 | `npm run validate:account-runtime` |
| 기능·UI 신뢰성 | `npm run validate:functional-ui` |

## 하네스 자체 점검

```sh
node .codex/scripts/verify-repository.mjs --self-test
```

## 자동화할 수 없는 항목

하네스 성공은 운영 배포 승인이 아닙니다. Cloudflare 운영 배포, `/health`·`/ready`, 챌린지 인라인 저장, 신규 계정 생성·재로그인과 실기기 반응형·모바일 화면은 `RELEASE-CHECKLIST.md`에서 별도 확인합니다. V22.8.62에는 신규 SQL이 없으며 기존 V22.6.8·V22.7.0·V22.7.1과 V22.8.46 SQL은 다시 실행하지 않습니다.
