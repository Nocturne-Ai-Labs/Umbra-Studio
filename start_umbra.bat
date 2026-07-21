@echo off
REM Umbra Studio - Tool Manager Launcher

cd /d "%~dp0"

set "BUN_BIN=%~dp0Runtime\Bun\win32\bun.exe"
if not exist "%BUN_BIN%" (
  where bun >nul 2>nul
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] Bun is not installed.
    echo Install Bun first: https://bun.sh
    exit /b 1
  )
  for /f "delims=" %%i in ('where bun') do set "BUN_BIN=%%i"
)

echo Launching Umbra Studio Tool Manager...
"%BUN_BIN%" manage-tools.ts
