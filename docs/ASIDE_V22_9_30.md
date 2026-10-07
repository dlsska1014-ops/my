# aside 전달문

아래 첫 번째 전달문은 지금 수행할 읽기 전용 점검입니다. 두 번째 전달문은 최종 checkout과 적용 승인 범위를 확인한 뒤 수행할 적용 절차입니다. 실제 계정 생성, SQL 실행, 배포, 백업 실행이나 유료 전환을 첫 번째 전달문에 포함하지 않습니다.

## 지금 전달할 내용

> 현재 서비스는 사용자 보고 기준 V22.9.28이고 V22.9.29 SQL과 Worker는 아직 미적용입니다. 새 테이블의 Data API 자동 노출 OFF 저장은 완료됐으며 기존 노출 수와 Max Rows 1,000을 유지합니다. 이 상태를 다시 켜거나 변경하지 마세요.
>
> Cloudflare에서 현재 Workers 플랜, 최근 7일 Exceeded CPU·1102·요청 오류·external subrequest 오류와 현재 Cron 빈도를 읽기 전용으로 확인하세요. 기존 가입 실패가 남아 있으면 정확한 화면 문구·HTTP 상태·시각과 관리자 `/ops-events`의 `local_signup_failed` 상세를 확인하세요. 같은 실패를 반복 제출하거나 새 운영 테스트 계정을 만들지 마세요. PBKDF2 iteration 상한 오류와 CPU 초과는 다른 원인이므로 각각 기록하세요. Node CPU 측정으로 운영 원인을 확정하지 마세요.
>
> Supabase에서 현재 플랜, backup 기능 제공 여부와 최근 backup/restore 증거를 확인하세요. 실제 dump가 없다면 ‘백업 없음/미확인’으로 남기세요. 기본 schema dump만으로 금융 데이터·역할·Storage 객체까지 백업됐다고 판단하지 마세요.
>
> 승인된 읽기 전용 DB 확인 범위가 있으면 legacy-only `local_web:` 사용자 수를 집계하고 강한 local identity가 없는 행 수만 보고하세요. 사용자 ID·닉네임·해시·토큰·금융 행을 가져오거나 게시하지 마세요. 관계/권한/RPC는 이름·시그니처·정의·ACL·RLS metadata만 확인하며 사용자가 승인하지 않은 DDL/DML을 실행하지 마세요. `users`와 `accountbook_user_security`의 기존 FK와 nested security read 가능 여부도 확인하세요. 관계가 없으면 안전한 두 번 조회로 돌아갑니다.
>
> 현재 Cloudflare 편집기 초안의 전체 소스 해시를 읽어서 어느 checkout인지 확인하세요. V22.9.29 초안은 새로운 V22.9.30 소스와 다르므로 지금 배포하지 마세요. Worker의 기존 바인딩·Secret 이름·환경변수 이름·Cron·도메인·runtime 설정 목록만 읽고 값은 공개하거나 변경하지 마세요.
>
> 요금제·Secret·`KAKAO_SKILL_AUTH_REQUIRED`·Kakao Developers·OpenBuilder·AdSense는 변경하지 마세요. 그 변경이 필요하면 비용/영향과 정확한 변경안을 따로 보고하세요. 실계정/실기기 OAuth, 신규 가입, 카카오 쓰기 검증은 별도 승인과 확인 항목입니다.

읽기 전용 DB 집계 예시는 승인된 DB 연결에서만 사용합니다. 기존 SQL 실행 승인이 읽기 전용 감사까지 포함하는지는 승인 범위 기록으로 판단합니다.

```sql
select count(*) as legacy_only_users
from public.users u
where u.kakao_user_key like 'local_web:%'
  and not exists (
    select 1 from public.accountbook_user_identities i
    where i.user_id = u.id and i.provider = 'local'
      and i.credential_hash is not null and i.credential_salt is not null
  );
```

## 최종 적용 전달문

> 최종 checkout의 V22.9.30 검증 완료와 기존 SQL/Worker 적용 승인이 이 파일에 명시된 범위를 포함하는지 확인하세요. 승인 또는 source hash가 불명확하면 적용을 시작하지 말고 해당 불일치를 보고하세요.
>
> 1. 운영 V22.9.28의 전체 Worker 원문과 정기 함수 정의/시그니처/ACL을 비공개 위치에 보존하세요. 공유 저장소에 운영 백업·Secrets·사용자 데이터를 넣지 마세요.
> 2. 기존 `migrations/01_FIX_RECURRING_MONTH_END_V22_9_29.sql` 하나만 적용하고 `accountbook_apply_recurring_v227`의 정의·시그니처·search_path·security definer·실행 ACL을 재대조하세요. 금융 함수를 테스트 목적으로 실행하거나 기존 거래·테이블·인덱스·RLS·GRANT를 변경하지 마세요. SQL은 먼저, Worker는 나중입니다.
> 3. 최종 `src/index.js` 전체를 편집기에 교체하세요. 부분 붙여넣기는 하지 마세요. checkout의 `Get-FileHash src/index.js -Algorithm SHA256`과 편집기에서 다시 읽은 UTF-8/LF 원문의 SHA-256을 대조하세요. BOM·CRLF·잘림이 있으면 배포하지 마세요.
> 4. 전체 교체한 V22.9.30을 승인 범위대로 배포한 뒤 100% 트래픽과 실제 배포 ID를 확인하세요. `/health`의 V22.9.30, `/ready` HTTP 200, 네 v22930 JS 자산의 상태·길이·SHA-256·ETag·immutable 캐시를 확인하세요. 개인 HTML `no-store`, 공개 푸터 생활 계산기 링크, 광고 비활성 경계도 읽기 전용으로 확인하세요.
> 5. 바인딩·설정·Secret 이름·Cron·도메인·요금제를 적용 전 목록과 대조하세요. Data API 자동 노출 OFF와 Max Rows 1,000도 유지하세요. 아직 실행하지 않은 실제 가입·카카오·OAuth·실기기를 ‘자동 통과’로 표시하지 마세요.
>
> 소스 문제로 롤백해야 하면 보존한 V22.9.28 Worker를 전체 복구하세요. 정기 SQL 롤백은 `migrations/02_ROLLBACK_RECURRING_MONTH_END_V22_9_29.sql` 적용 승인이 확인된 경우에만 실행하고 함수 정의/ACL을 대조하세요. 이미 저장된 거래나 적용월을 되돌리는 작업은 포함하지 않습니다.

## 별도 운영 결정

Free CPU 10ms와 external subrequest 50 제한은 현재 [Cloudflare 공식 문서](https://developers.cloudflare.com/workers/platform/limits/)를 기준으로 별도 검증해야 합니다. 가입용 KDF를 임의로 약화하지 않습니다. 유료 전환은 사용자 결정이며 이 저장소 작업에서 실행하지 않았습니다.

Cron은 invocation을 나누는 만큼 처리 지연이 생길 수 있습니다. 설정한 실행 빈도로 모든 가계부와 report cursor가 소진되는지 확인하고, 빈도 변경이 필요하면 별도 승인합니다. 월말 미완료 작업의 원래 날짜를 보존하지만 정시 완료를 보장하지 않습니다.

카카오 `prompt=login`은 인앱 환경의 재인증을 보장하지 않습니다. V22.9.30은 재인증을 카카오 인앱에서 차단하고 Chrome/Safari로 열도록 안내합니다. 일반 로그인과 실제 동일 ID 재확인은 별도 실기기 검사입니다.
