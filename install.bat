@echo off
REM ============================================
REM Umbra Studio - Universal Installer (Windows)
REM ============================================
REM
REM Usage: install.bat [action]
REM   No args           = Install/update all tools + shortcuts
REM   comfyui           = Install/update ComfyUI
REM   aitoolkit         = Install/update AI-Toolkit
REM   update-comfyui    = Force update ComfyUI
REM   update-aitoolkit  = Force update AI-Toolkit
REM   comfy-nodes       = Install/update preferred ComfyUI custom nodes
REM   shortcuts         = Rebuild root shortcuts
REM
REM Requirements:
REM   - Bun runtime (https://bun.sh)
REM   - Python 3.11
REM
REM ============================================

cd /d "%~dp0"

REM Check if Bun is installed
where bun >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Bun is not installed!
    echo.
    echo Install Bun first:
    echo   powershell -c "irm bun.sh/install.ps1 | iex"
    echo.
    pause
    exit /b 1
)

if "%~1"=="" (
    bun setup-tools.ts all
) else (
    bun setup-tools.ts %*
)
