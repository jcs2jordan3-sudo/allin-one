# E2E (Playwright + 설치된 Chrome)

브라우저 다운로드 없이 로컬 Chrome을 구동합니다. `CHROME_PATH`로 경로를 바꿀 수 있습니다.

| 스크립트 | 사전 조건 | 내용 |
|---|---|---|
| `npm run e2e:local` | `npx vite --port 5199` (키 없이) | 로컬 모드 콘솔 11단계 |
| `npm run e2e:balancing` | `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5199` (로컬 모드 강제) | 수동 밸런싱 모달 7단계 (좌석 이동·테이블 해체·이력) |
| `npm run e2e:mobile` | 로컬 모드 `--port 5199` | 폰 폭(390px) 콘솔 7화면 스크린샷 + 가로 넘침 검사 |
| `npm run e2e:cloud-boot` | 닿지 않는 키로 `--port 5198` 실행 | 로그인 게이트·오류 처리 8단계 |
| `npm run e2e:live` | `.env.local` 키로 `--port 5199`, `SUPABASE_ACCESS_TOKEN` | 실서버 16단계 (**데이터 초기화 포함 — 테스트 프로젝트에서만**) |

스크린샷은 `e2e/shots/`에 저장됩니다(gitignore).

PWA(설치형 앱) 확인: `npm run build:pages` 후 PowerShell에서 `npx vite preview --base=/allin-one/ --port 5197` (Git Bash는 `--base` 경로를 Windows 경로로 바꿔버리므로 PowerShell/cmd에서 실행) → `http://localhost:5197/allin-one/` 에서 매니페스트·서비스 워커·오프라인 로드 확인.
