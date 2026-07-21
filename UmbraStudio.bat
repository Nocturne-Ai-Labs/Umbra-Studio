@echo off
REM Umbra Studio - Webapp launcher

cd /d "%~dp0"

set "WEB_LAUNCHER=%~dp0dist-webapp\UmbraStudio.exe"
if exist "%WEB_LAUNCHER%" (
  "%WEB_LAUNCHER%"
  exit /b %ERRORLEVEL%
)

set "BUN_BIN=%~dp0Runtime\Bun\win32\bun.exe"
if not exist "%BUN_BIN%" (
  where bun >nul 2>nul
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] Bundled Bun runtime is missing.
    echo Run webapp:prepare-runtime from a development checkout, or use a packaged UmbraStudio.exe.
    exit /b 1
  )
  for /f "delims=" %%i in ('where bun') do set "BUN_BIN=%%i"
)

"%BUN_BIN%" run webapp:dev
