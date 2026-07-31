# V22.8.63 검증 보고서

검증일: 2026-07-31

## 결과

- 자동 검사: 1,641개 통과
- Worker 문법 및 ESM `default.fetch`: 통과
- `/favicon.ico` ICO 헤더·32×32 크기·MIME·ETag·HEAD: 통과
- `/apple-touch-icon.png` PNG 시그니처·180×180·인덱스 팔레트·MIME·ETag: 통과
- `/apple-touch-icon-precomposed.png` 동일 바이트 제공: 통과
- 아이콘 경로가 쓰기 요청에 응답하지 않음: 통과
- 홈 HTML 마크업 증가 0바이트, 35KB 예산 유지: 통과
- 신규 SQL·환경변수·카카오 설정 변경: 없음

## 실제 브라우저 확인

- 저장소 QA 서버와 Chromium에서 두 아이콘을 같은 출처로 불러 디코딩을 확인했습니다.
  - `/favicon.ico` → `naturalWidth 32`, 모서리 둥근 브랜드 아이콘
  - `/apple-touch-icon.png` → `naturalWidth 180`, 모서리까지 채운 정사각형
- `/app` 재점검에서 4xx 응답 0건, 콘솔 오류 0건. 이전에 매 페이지마다 남던
  favicon 404가 사라졌습니다.
- `file(1)` 확인: `MS Windows icon resource - 1 icon, 32x32, 32 bits/pixel`,
  `PNG image data, 180 x 180, 8-bit colormap, non-interlaced`

## 설계 근거

- 홈 초기 HTML 여유가 기준 396바이트·실사용 354바이트뿐이라 `<link rel="icon">`
  마크업을 추가하지 않았습니다. 브라우저와 iOS가 두 경로를 스스로 요청하므로
  마크업 없이도 동작합니다.
- 압축 라이브러리를 넣지 않으려고 PNG는 인덱스 컬러 + 저장(비압축) deflate로
  만듭니다. 결과는 32KB이며 1주일 캐시와 ETag로 반복 전송을 막습니다.
- iOS는 홈 화면 아이콘을 스스로 마스킹하므로 apple-touch-icon은 투명 모서리 없이
  정사각형으로, 브라우저 탭용 favicon은 둥근 모서리로 만듭니다.

## 자동화 제한

- iOS 사파리의 `홈 화면에 추가` 실제 아이콘 표시는 실기기 확인이 필요합니다.
- 사파리는 SVG favicon을 쓰지 않으므로 ICO로 제공했습니다. 실제 탭 아이콘은
  운영 도메인에서 한 번 확인해야 합니다.

## 운영에서 남은 수동 확인

- 브라우저 탭·즐겨찾기에 아이콘 표시
- iPhone 사파리 `공유 → 홈 화면에 추가` 아이콘
- 개발자도구 콘솔에 favicon 404가 없는지
- `manifest.json`(PWA 설치)은 이번 범위에서 제외했습니다. 필요하면 별도 결정이 필요합니다.
