@echo off
setlocal
cd /d "%~dp0"
set "BUN_BIN=%CD%\Runtime\Bun\win32\bun.exe"
set "SETUP_APP=%CD%\resources\app\setup\UmbraSetupApp.js"
if not exist "%BUN_BIN%" (
  echo [ERROR] Bundled Bun runtime is missing: %BUN_BIN%
  pause
  exit /b 1
)
if not exist "%SETUP_APP%" (
  echo [ERROR] Standalone setup utility is missing: %SETUP_APP%
  pause
  exit /b 1
)
"%BUN_BIN%" "%SETUP_APP%" --root "%CD%" %*
if errorlevel 1 pause
