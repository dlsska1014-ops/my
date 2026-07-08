# Kakao Ops + Traffic Guide

## /skill 과도 요청 제한
기본값은 사용자키 기준 1분 24회입니다.

선택 환경변수:
```text
SKILL_RATE_LIMIT=24
SKILL_RATE_WINDOW_MS=60000
```

짧은 시간에 요청이 너무 많으면 카카오 에러 팝업 대신 simpleText 안내를 반환합니다.

## 운영상태
```text
/skill-ops
/ops-skill
```

관리자 로그인 또는 `CRON_SECRET`이 필요합니다.

## OpenBuilder 점검
```text
/openbuilder-report
/kakao-review
/review-check
```

폴백 블록도 반드시 `/skill`로 연결해야 합니다.
