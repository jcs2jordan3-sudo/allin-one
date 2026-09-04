# E2E (Playwright + 설치된 Chrome)

브라우저 다운로드 없이 로컬 Chrome을 구동합니다. `CHROME_PATH`로 경로를 바꿀 수 있습니다.

| 스크립트 | 사전 조건 | 내용 |
|---|---|---|
| `npm run e2e:local` | `npx vite --port 5199` (키 없이) | 로컬 모드 콘솔 11단계 |
| `npm run e2e:cloud-boot` | 닿지 않는 키로 `--port 5198` 실행 | 로그인 게이트·오류 처리 8단계 |
| `npm run e2e:live` | `.env.local` 키로 `--port 5199`, `SUPABASE_ACCESS_TOKEN` | 실서버 16단계 (**데이터 초기화 포함 — 테스트 프로젝트에서만**) |

스크린샷은 `e2e/shots/`에 저장됩니다(gitignore).
