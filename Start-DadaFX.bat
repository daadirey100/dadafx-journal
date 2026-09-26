@echo off
title Dada FX Journal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Install the LTS version from https://nodejs.org , restart, then double-click this again.
  pause
  exit /b 1
)

echo Clearing a stuck session on port 5173 (if any)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  for /f "tokens=1" %%n in ('tasklist /FI "PID eq %%p" /FO TABLE /NH 2^>nul') do (
    if /i "%%n"=="node.exe" taskkill /F /PID %%p >nul 2>nul
  )
)

if not exist "node_modules" (
  echo First run - installing pieces, one time only, 1-2 minutes...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Install failed. Check your internet and try again.
    pause
    exit /b 1
  )
)

echo Starting Dada FX Journal - your browser will open automatically.
echo Keep this window OPEN while you use the app. Close it when you are done.
echo.
call npm run dev -- --open
echo.
echo Server stopped. You can close this window.
pause
