@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   BOM QC - One Click Setup
echo ========================================
echo.
echo Working directory: %CD%
echo.

call :RefreshPath

echo [1/3] Checking Node.js ...
where node >nul 2>nul
if errorlevel 1 (
  echo node not found, trying winget install...
  where winget >nul 2>nul
  if errorlevel 1 goto NoNode
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  call :RefreshPath
  where node >nul 2>nul
  if errorlevel 1 goto NoNode
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
for /f "tokens=*" %%v in ('npm -v 2^>nul') do set "NPM_VER=%%v"
echo [OK] Node !NODE_VER! / npm !NPM_VER!

set MAJOR=0
set MINOR=0
for /f "tokens=1 delims=v" %%a in ("!NODE_VER!") do set "VER_BODY=%%a"
for /f "tokens=1,2 delims=." %%a in ("!VER_BODY!") do (
  set "MAJOR=%%a"
  set "MINOR=%%b"
)
if "!MAJOR!"=="" set MAJOR=0
if "!MINOR!"=="" set MINOR=0
set NEED=0
if !MAJOR! LSS 22 set NEED=1
if !MAJOR! EQU 22 if !MINOR! LSS 5 set NEED=1
if !NEED! EQU 1 (
  echo [error] Need Node.js 22.5+, current !NODE_VER!
  goto NoNode
)
echo.

echo [2/3] Set npm mirror npmmirror.com ...
REM Use cmd /c so npm.cmd cannot close this window.
cmd /c npm config set registry https://registry.npmmirror.com
if errorlevel 1 (
  echo [warn] mirror set failed, continue with default registry
) else (
  echo [OK] npm registry set
)
echo.

echo [3/3] npm install ...
REM Never put a trailing backslash inside a quoted if-exist path; it escapes the quote and aborts.
if exist "node_modules" (
  echo Removing old node_modules ...
  rmdir /s /q "node_modules" 2>nul
  ping 127.0.0.1 -n 2 >nul
)
if exist "node_modules" (
  echo [error] Cannot delete node_modules. Close other programs and delete it manually:
  echo   %CD%\node_modules
  exit /b 1
)

cmd /c npm install
if errorlevel 1 (
  echo [error] npm install failed
  exit /b 1
)

echo.
echo Verifying ...
cmd /c node scripts\ensure-deps.js
if errorlevel 1 (
  echo [error] ensure-deps failed
  exit /b 1
)

echo.
echo ========================================
echo   SETUP OK
echo   Next: double-click 开始运行.bat or start.bat
echo   Open: http://127.0.0.1:3789
echo ========================================
exit /b 0

:NoNode
echo [error] Node.js not found. Install Node.js 22.5+ x64, check Add to PATH.
start "" "https://nodejs.org/zh-cn/download"
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
