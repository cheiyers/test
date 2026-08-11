@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   BOM QC Setup
echo ========================================
echo Work dir: %CD%
echo.

call :RefreshPath

echo Checking Node.js ...
where node >nul 2>nul
if errorlevel 1 (
  echo Node not found, trying winget ...
  where winget >nul 2>nul
  if errorlevel 1 goto NoNode
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  call :RefreshPath
  where node >nul 2>nul
  if errorlevel 1 goto NoNode
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] %%v
echo.
echo Running Node setup script (npm install will NOT close this window^) ...
echo.

REM IMPORTANT: do not call npm.cmd from this bat (it can kill the window).
REM All npm work is done inside scripts\windows-setup.js
node "%~dp0scripts\windows-setup.js"
set ERR=%ERRORLEVEL%

echo.
if "%ERR%"=="0" (
  echo RESULT: SETUP OK
  echo Next: start.bat
) else (
  echo RESULT: SETUP FAILED  code=%ERR%
)
echo.
echo Press any key to close...
pause
exit /b %ERR%

:NoNode
echo.
echo [ERROR] Node.js 22.5+ not found.
echo Install from https://nodejs.org (check Add to PATH), then re-run.
start "" "https://nodejs.org/zh-cn/download"
echo.
echo Press any key to close...
pause
exit /b 1

:RefreshPath
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH if defined USR_PATH set "PATH=!SYS_PATH!;!USR_PATH!"
if defined SYS_PATH if not defined USR_PATH set "PATH=!SYS_PATH!"
if defined USR_PATH if not defined SYS_PATH set "PATH=!USR_PATH!"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;!PATH!"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;!PATH!"
if exist "E:\nodejs\node.exe" set "PATH=E:\nodejs;!PATH!"
exit /b 0
