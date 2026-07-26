@echo off
setlocal
cd /d "%~dp0"
set "BUN_BIN=%CD%\Runtime\Bun\win32\bun.exe"
set "UPDATER_BOOTSTRAP=%CD%\resources\app\launcher\UmbraUpdaterBootstrap.js"
if not exist "%BUN_BIN%" (
  echo [ERROR] Bundled Bun runtime is missing: %BUN_BIN%
  pause
  exit /b 1
)
if not exist "%UPDATER_BOOTSTRAP%" (
  echo [ERROR] Standalone updater is missing: %UPDATER_BOOTSTRAP%
  pause
  exit /b 1
)
"%BUN_BIN%" "%UPDATER_BOOTSTRAP%" --root "%CD%"
if errorlevel 1 pause
