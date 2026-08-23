@echo off
chcp 65001 >nul
title ALL-IN ONE 홀덤펍 매니저
cd /d "%~dp0"

if not exist node_modules (
  echo 처음 실행입니다. 의존성을 설치합니다...
  call npm install --no-audit --no-fund
)

echo 앱을 빌드합니다...
call npm run build
if errorlevel 1 (
  echo 빌드에 실패했습니다. 창을 닫지 말고 오류를 확인하세요.
  pause
  exit /b 1
)

echo 서버를 시작합니다. 이 창을 닫으면 앱이 종료됩니다.
start "" http://localhost:5175
call npx vite preview --port 5175 --host --strictPort
pause
