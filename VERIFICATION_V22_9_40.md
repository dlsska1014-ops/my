# V22.9.40 통합 검증 기록

기준 커밋은 main `a93db22`(V22.9.39-PUBLIC-GUIDES, 작업 내내 origin/main과 같음)이며 통합 브랜치는 `claude/v22940-integration`입니다. 네 묶음은 각자의 worktree에서 만들고 통합 worktree에서만 합쳤습니다. 상태는 운영 적용 대기(`production-pending`)입니다.

## 통합 순서와 충돌

| 단계 | 커밋 | 내용 |
|---|---|---|
| A 병합 | `864f4b7` | 충돌 없음. |
| B 병합 | `b7f5fe2` | `my/reports-premium.js` 스마트 도구 템플릿 한 줄: B의 광고 head·슬롯 줄에 A의 "생활비 리포트" 라벨을 다시 적용했습니다. `src/index.js`는 다시 만들었습니다. |
| 1단계 | `6746864` | 검사 등록, manifest V22_9_40, 배포 공개 검사의 모드 인식, ads-gate의 분석 클라이언트 고정 해시를 A(U10) 반영 값으로. |
| 1.5단계 | `1fc04d2` | www 정본 308, 관제 알림 채널(`send_email`·Secret `ALERT_TO`), 외부 검사 30분 예약, 수익화 문서 정합. |
| C 병합 | `bfa9db5` | 검사기 3개(month-reset·performance·screen-audit)의 홈·셸 주소 줄을 양쪽 모두 유지했습니다. |
| 1.75단계 | `bc7f888` | validate-polish의 셸 주소 v22940, 공개 화면 CSS 한 줄, ui-perf 등록. |
| D 병합 | 이 PR | `public/content-pages.js` 작성자 조각(B 광고 삽입과 C CSS가 있는 줄에 D의 " 운영팀" 조건), `package.json` scripts 다섯 줄 유지. |
| 2단계 | 이 PR | `AD_PAGE_KEYS`에 새 글 12편, ads-gate의 정본 30·허용 24, `tools/preview-public.mjs` 목록을 sitemap에서 파생, 판 의식. |

## 묶음별 검사

| 묶음 | 새 검사 | 기존 검사 변화 |
|---|---|---|
| A 화면 다듬기 | validate-polish-v22940 76 | 불변 자산 77→80, 움직임 눈금 20→21 |
| B 광고 게이트 | validate-ads-gate-v22940 1,269 → D 병합 뒤 1,762(공개 허용 24쪽 렌더) | AdSense v2 292→293 |
| 1.5단계 | validate-www-canonical-v22940 110 | 관제 알림 48→49 |
| C UI·성능 | validate-ui-perf-v22940 117 | 화면 미리 준비 47→60, 클라이언트 직렬화 42→43 |
| D 생활비 가이드 글 | validate-public-articles-v22940 1,526 | 공개 가이드 1,227→1,287 |

## 하네스

| 모드 | 체크섬 | 자동 검사(하한) | ESM 진입점 |
|---|---|---|---|
| 일반 (`node .codex/scripts/verify-repository.mjs`) | 399개 | 14,517개(14,517) | 통과 |
| 분류 표 부재 (`npm run validate:categories-absent`) | 399개 | 14,517개(14,517) | 통과 |

- 시작 기준 `a93db22`는 두 모드 모두 체크섬 386개·자동 검사 10,846개였습니다.
- SQLite 관제 통합(`node monitoring/test-d1.mjs`) 84개가 Node.js v22.23.1에서 통과했습니다.
- `src/index.js`는 4,045,007바이트, SHA-256 `560171890b1ce1a5b1cdc590c2da4e9040db557c2ccd036cc988b2903fe09a5b`, 모듈 111개입니다. 내보내기 목록은 V22.9.39와 같습니다.
- manifest `BUNDLE_FILE_CHECKSUMS_V22_9_40.sha256` 399개는 V22.9.39의 386개에 새 검사기 5개, 묶음 기록 4개, 판 문서 3개, 직전 manifest를 더한 것입니다. V22.9.38·39처럼 옛 manifest는 지우지 않고 목록에 넣었습니다.

## 예산과 통합 확인

- 당월 기준 픽스처 홈 HTML 35,592 B(상한 35,840 B 미만, 여유 248 B). 실사용 부하(당월 200행)도 45,056 B 상한 안입니다(`validate:performance`).
- 인라인 CSS: `/reports` review 20,980 B·live 21,465 B, `/my/analysis?view=report` 24,089 B(여유 487 B, 광고 없음). 상한 24,576 B.
- review 모드 바이트 동일성: B 묶음에서 요청 69개 × `ADS_MODE` 10가지 × 슬롯 2가지, 1,380회 비교 차이 0. 통합 뒤 A 빌드와 A+B 통합 빌드를 화면 35개 × 비-live 값 5가지로 비교해 175/175 동일(`/ready`는 `ads_mode`만 추가).
- `Link`·`Speculation-Rules` 머리는 광고 허용·금지 화면 13개에서 review와 live가 같고, CSP만 허용 화면에서 다릅니다.
- www 정본: 고치기 전·후 빌드를 호스트 7종 × 경로 7종 × 설정 3종으로 비교해 바뀐 것은 변수 없는 www GET(200→308)뿐입니다.
- 배포 공개 검사(`tools/verify-deployment-v22920.mjs`)를 `app.fetch`에 연결해 7가지 상황(review, live, 슬롯 없음, 필드 없음, 모드 불일치 2, 알 수 없는 값)으로 돌려 모드별 단언이 맞게 통과하고 실패하는 것을 확인했습니다.

## 증거(저장소 밖)

`D:/Github_Kakao_Account/review-artifacts/`의 `v22940-a`(화면·대비·aria), `v22940-b`(광고 게이트 화면·CSP·A/B 바이트 비교), `v22940-c`(성능 측정 `perf.json`·화면), `v22940-d`(글 화면·겹침 검사), `v22940-int`(통합 하네스·측정·www·배포 검사 기록).

## 실행하지 못한 검증

운영 Worker 업로드·승격과 운영 공개 검사, 관제 Worker 배포와 Secret 저장, GitHub 예약 실행, Cloudflare Early Hints, AdSense live 전환과 실제 광고 게재, Search Console 제출, 카카오 C1~C4, iOS Safari·Android 실기기와 보조기기는 수행하지 않았습니다.
