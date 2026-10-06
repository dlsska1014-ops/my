## V22.9.26의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_26.sha256`을 사용하며 자동 검사 하한은 5,371개입니다.
공개 페이지 푸터의 형제 사이트 링크 검사 44개(`npm run validate:sister-link`)를 추가했습니다. 소스·공개 페이지 10개·로그인 전후 개인 화면을 독립 메모리 픽스처로 확인합니다.
브라우저 감사와 `node monitoring/test-d1.mjs`는 별도로 실행합니다. 결과는 `VERIFICATION_V22_9_26.md`에 기록합니다.
이 판은 저장소 검증까지 마친 상태이며 운영 배포는 사용자 승인 후 별도로 진행합니다.

## V22.9.25의 검증 방법

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_25.sha256`을 사용하며 자동 검사 하한은 5,327개입니다.
홈·거래 상세·가져오기 회귀 검사 42개를 추가했습니다. `npm run audit:uiux`는 설치된 Chrome 또는 Edge에서 독립 메모리 픽스처를 사용합니다.
브라우저 감사와 `node monitoring/test-d1.mjs`는 별도로 실행합니다. 결과는 `VERIFICATION_V22_9_25.md`에 기록합니다.
사용자 승인 후 앱 V22.9.25를 운영에 배포했으며 공개 검사 116개, 운영 소스 일치와 설정 보존을 확인했습니다. 배포 ID와 남은 수동 검증도 같은 문서에 기록합니다.

## V22.9.24

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_24.sha256`을 사용하며 자동 검사 하한은 5,285개입니다.
신규 설정 범위·취소·관제 SSO·DB 부분 지표 검사 121개를 포함합니다.
`node monitoring/test-d1.mjs`는 Node.js 22 SQLite 메모리 검증 45개를 별도로 수행합니다.
공개 배포 검사는 현재 릴리스 소스에서 자산 주소를 읽어 운영 자산의 바이트까지 비교합니다.
운영 배포 ID와 실제 점검 결과, 남은 수동 검증은 `VERIFICATION_V22_9_24.md`에 기록합니다.

## V22.9.23의 검증 기록

당시 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_23.sha256`을 사용했으며 자동 검사 하한은 5,164개였습니다.
이름 구분자·역할 표시·immutable 자산·반응형 레이아웃·Workers 런타임·실제 공급자 지표 회귀 37개를 추가했습니다.
브라우저 감사와 Node.js 22 SQLite 45개 검사는 별도로 실행합니다. 최신 기록은 `VERIFICATION_V22_9_23.md`입니다.

아래에는 이전 버전의 기록을 보존합니다.

## V22.9.22 종합 관제

현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_22.sha256`을 사용하며 자동 검사 하한은 5,127개입니다.
관제 인증·허용 목록·수집 장애·리소스 한도 83개를 추가했습니다. Node.js 22에서는
`node monitoring/test-d1.mjs`로 실제 SQLite의 45개 검사를 별도로 실행합니다.
Wrangler 사전 검사는 실제 운영 수집 성공을 의미하지 않습니다. 최신 결과는 `VERIFICATION_V22_9_22.md`에 기록합니다.
아래 내용은 이전 검증 기록입니다.

# Codex 검증 하네스

회사 PC와 집 PC의 Codex CLI·IDE에서 같은 저장소 검증을 실행하기 위한 기준입니다.
현재 하네스는 `BUNDLE_FILE_CHECKSUMS_V22_9_20.sha256`의 V22.9.20 파일 133개와
자동 검사 4,966개 이상, Worker 문법, ESM 진입점, Git 공백 오류를 확인합니다.
이름·도메인·카카오 콜백 전환과 월초·월말 하루 환산 검사가 포함됩니다.
운영 점검은 `00_READ_FIRST_V22_9_20.md`와 `RELEASE-CHECKLIST.md`를 따릅니다.
아래 상세 목록은 V22.8.78 당시의 검증 기록이며 최신 검사 수는 하네스 실행 결과로 확인합니다.

## 전체 검증

저장소 루트에서 실행합니다.

```sh
node .codex/scripts/verify-repository.mjs
```

하네스는 다음을 순서대로 확인합니다.

1. `BUNDLE_FILE_CHECKSUMS_V22_8_74.sha256`의 배포 파일
2. `src/index.js` JavaScript 문법
3. 카드사 가져오기·로그인 대기·영수증 제거 110개
4. 카카오 그룹 22개
5. 카카오 수정·삭제·복구 V4 130개
6. 가계부·운영 보안 89개
7. 참여자 역할 스키마 20개
8. UX·분석 보호 56개
9. 사용자 화면·홈 버튼·테마·성능 161개
10. AdSense 심사·V2·UI V5 공통 셸 262개
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
21. 앱 아이콘 자원 38개
22. 웹 매니페스트 64개
23. 테마 글자 대비 49개
24. 거래 삭제 동작 15개
25. 역할별 화면·빈 상태 203개
26. 조작 영역·접근성 278개
27. 카카오 메모·중복 방지 57개
28. 금액 파싱 77개
29. 수정·삭제·복구 왕복 58개
30. 본문 바로가기 178개
31. 스킬 인증·삭제 SQL 49개
32. 예산 재검토·다크 대비 18개
33. ESM import와 `default.fetch`
34. 작업 트리·스테이징 영역의 공백 오류

성공 결과는 총 2,691개 자동 검사와 현재 `src/index.js` SHA-256을 표시합니다.

## 빠른 검사

| 영역 | 명령 |
|---|---|
| 카드사 가져오기·로그인 대기 | `npm run validate:card-import` |
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
| 모바일 화면 보정 | `npm run validate:mobile-surface` |
| 모바일 전체 탭 점검 | `npm run validate:mobile-audit` |
| 앱 아이콘 자원 | `npm run validate:app-icon` |
| 웹 매니페스트 | `npm run validate:web-manifest` |
| 테마 글자 대비 | `npm run validate:theme-contrast` |
| 거래 삭제 동작 | `npm run validate:tx-delete` |
| 역할별 화면·빈 상태 | `npm run validate:role-surface` |
| 조작 영역·접근성 | `npm run validate:tap-target` |
| 카카오 메모·중복 방지 | `npm run validate:kakao-memo` |
| 금액 파싱 | `npm run validate:amount-parse` |
| 수정·삭제·복구 왕복 | `npm run validate:edit-restore` |
| 본문 바로가기 | `npm run validate:skip-to-content` |
| 스킬 인증·삭제 SQL | `npm run validate:skill-auth-purge` |
| 예산 재검토·다크 대비 | `npm run validate:budget-dark-contrast` |

## 하네스 자체 점검

```sh
node .codex/scripts/verify-repository.mjs --self-test
```

## 자동화할 수 없는 항목

하네스 성공은 운영 배포 승인이 아닙니다. Cloudflare 운영 배포, `/health`·`/ready`, 챌린지 인라인 저장, 신규 계정 생성·재로그인과 실기기 반응형·모바일 화면은 `RELEASE-CHECKLIST.md`에서 별도 확인합니다. V22.8.78에는 신규 SQL이 없으며 기존 V22.6.8·V22.7.0·V22.7.1과 V22.8.46 SQL은 다시 실행하지 않습니다.
