@echo off
setlocal
cd /d "%~dp0"
set "BUN_BIN=%CD%\Runtime\Bun\win32\bun.exe"
set "SETUP_APP=%CD%\resources\app\launcher\UmbraUpdaterBootstrap.js"
if not exist "%BUN_BIN%" (
  echo [ERROR] Bundled Bun runtime is missing: %BUN_BIN%
  pause
  exit /b 1
)
if not exist "%SETUP_APP%" (
  echo [ERROR] Umbra Setup launcher is missing: %SETUP_APP%
  pause
  exit /b 1
)
"%BUN_BIN%" "%SETUP_APP%" --root "%CD%" --tab onboarding %*
if errorlevel 1 pause
