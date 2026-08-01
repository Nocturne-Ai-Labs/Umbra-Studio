@echo off
REM Umbra Studio development launcher
setlocal
cd /d "%~dp0"

set "BUN_BIN=%~dp0Runtime\Bun\win32\bun.exe"
if not exist "%BUN_BIN%" (
  where bun >nul 2>nul
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] Bundled Bun runtime is missing and Bun is not available on PATH.
    pause
    exit /b 1
  )
  for /f "delims=" %%i in ('where bun') do set "BUN_BIN=%%i"
)

"%BUN_BIN%" run webapp:dev
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
