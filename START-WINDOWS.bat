@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ is required. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
start "" "http://localhost:8787"
node server.mjs
pause
