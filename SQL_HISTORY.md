# SQL 적용 이력과 현재 판정

## V22.8.18

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 웹앱 제출 위치 인라인 결과와 JSON 응답 규약은 클라이언트·서버 코드 변경만 필요
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.17

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 복구(undo) 버퍼에 `household_id`를 채우는 Worker 코드 수정만 수행 (V22.8.16의 선택 텔레메트리 테이블 판정 유지)
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.16

- 필수 SQL·스키마·RLS·RPC·인덱스: 없음 — 수정 세션은 기존 `accountbook_settings` 키-값 저장을 사용
- 선택 SQL: 미인식 입력 텔레메트리 테이블 (실행하지 않아도 수정 플로우는 정상 동작, 텔레메트리 적재만 생략)

```sql
create table if not exists unrecognized_inputs (
  id bigint generated always as identity primary key,
  room_id text, user_id text, entry_no text,
  input text not null, attempt int,
  type text,                        -- unrecognized | unrecognized_final | turn_limit_cancel | duplicate_reply_guard
  created_at timestamptz default now()
);
```

- 운영 활용: `type='unrecognized_final'` 주간 집계로 동의어 사전 보강, `duplicate_reply_guard`는 1건이라도 발생 시 즉시 조사 (0건이 정상)
- 실행 여부는 운영 승인 후 별도로 결정하며 이 저장소 작업에서는 실행하지 않음
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.15

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 인증 화면 marker, CSS 범위·대비와 새 immutable CSS 경로만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.14

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 홈 링크 표식, CSS 우선순위와 새 immutable CSS 경로만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.13

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 화면 범위 marker, CSS 대비와 새 immutable CSS 경로만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.12

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 버전형 CSS·JavaScript, 브라우저 로컬 화면 설정, 대비 토큰만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## V22.8.11

- 신규 SQL·스키마·RLS·RPC·인덱스: 없음
- 기존 SQL 재실행: 없음
- 이유: 정적 CSS·JavaScript 자원, 화면 body marker, 내비게이션 표시만 변경
- 배포: 검증된 `src/index.js` 전체 교체만 수행

## 최근 버전

| 버전 | 업데이트 때 SQL 실행 | 비고 |
|---|---:|---|
| V22.8.18 | 없음 | 웹앱 제출 위치 인라인 결과·응답 규약 |
| V22.8.17 | 없음 | 카카오 복구(undo) 실패 핫픽스 |
| V22.8.16 | 선택 | 카카오 수정 플로우 V4 (텔레메트리 테이블만 선택) |
| V22.8.15 | 없음 | 다크 인증 화면 대비 |
| V22.8.14 | 없음 | 홈 전체 조회 버튼 대비 |
| V22.8.13 | 없음 | 다크모드 전체 보정 |
| V22.8.12 | 없음 | 접근성 테마·대비 |
| V22.8.11 | 없음 | 홈 UX 셸 확장 |
| V22.8.10 | 없음 | 홈 성능·공통 자원 |
| V22.8.9 | 없음 | 계정·가계부 보안 분리 |
| V22.8.8 | 없음 | UX 피드백 |
| V22.8.7 | 없음 | 카카오 그룹 응답 |
| V22.8.6 | 없음 | 영수증 안정화 |
| V22.8.5 | 없음 | 모바일 접근·메뉴 |
| V22.8.4 | 없음 | UI·성능 재검증 |
| V22.8.3 | 없음 | 안정화 병합 |
| V22.8.2 | 없음 | 인증 안정화 |
| V22.8.1 | 없음 | UI·UX 개편 |
| V22.8.0 | 있음 | 자산·결제수단 기반 스키마 |

과거 SQL 원본은 과거 배포본의 신규 설치·장애 복구 자료입니다. V22.8.15 적용을 위해 실행하지 않습니다. 성능 인덱스는 운영 행 수와 실행 계획에서 병목이 확인될 때만 별도 버전으로 검토합니다.
