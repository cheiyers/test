@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   BOM QC Setup
echo ========================================
echo Work dir: %CD%
echo.
echo NOTE: "node -v works" is NOT enough.
echo   1) Node must be 22.5+
echo   2) Must run this setup once (npm install)
echo   3) PATH must include node.exe
echo.

call :RefreshPath

echo Checking Node.js ...
call :FindNode
if errorlevel 1 (
  echo Node not in PATH, trying winget install Node.js 22 ...
  call :InstallNode
  call :RefreshPath
  call :FindNode
  if errorlevel 1 goto NoNode
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODEVER=%%v"
echo [OK] Found !NODEVER!

call :CheckNodeVer
if errorlevel 1 (
  echo.
  echo [WARN] Node !NODEVER! is too old. Need 22.5+.
  echo Trying winget upgrade/install Node.js 22 ...
  call :InstallNode
  call :RefreshPath
  call :FindNode
  if errorlevel 1 goto NoNode
  for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODEVER=%%v"
  echo [OK] Now !NODEVER!
  call :CheckNodeVer
  if errorlevel 1 goto BadVer
)

echo.
echo Running Node setup script (npm install will NOT close this window^) ...
echo.

REM IMPORTANT: do not call npm.cmd from this bat (it can kill the window).
node "%~dp0scripts\windows-setup.js"
set ERR=%ERRORLEVEL%

echo.
if "%ERR%"=="0" (
  echo RESULT: SETUP OK
  echo Next: start.bat  or  开始运行.bat
) else (
  echo RESULT: SETUP FAILED  code=%ERR%
  echo.
  echo Common causes:
  echo   - Network blocked npm install
  echo   - Antivirus locking node_modules
  echo   - Disk full / no write permission in this folder
)
echo.
echo Press any key to close...
pause
exit /b %ERR%

:NoNode
echo.
echo [ERROR] Cannot find node.exe
echo.
echo Typical reasons on PCs that "already installed Node":
echo   1. Installer did NOT check "Add to PATH"
echo   2. Installed under custom folder / nvm / scoop, not on PATH
echo   3. Need to CLOSE and reopen CMD after installing
echo.
echo Fix: reinstall from https://nodejs.org ^(LTS/Current x64^),
echo      tick "Add to PATH", then reboot or open a NEW CMD, re-run this.
start "" "https://nodejs.org/zh-cn/download"
echo.
echo Press any key to close...
pause
exit /b 1

:BadVer
echo.
echo [ERROR] Node.js version too old: !NODEVER!
echo This app needs Node.js 22.5 or newer ^(uses built-in SQLite^).
echo Old 16/18/20 will show as "installed" but setup will fail.
echo.
echo Please uninstall old Node, then install 22+ from:
start "" "https://nodejs.org/zh-cn/download"
echo.
echo Press any key to close...
pause
exit /b 1

:FindNode
where node >nul 2>nul
if errorlevel 1 exit /b 1
exit /b 0

:CheckNodeVer
REM Returns 0 if node -v is 22.5+
for /f "tokens=1 delims=v" %%a in ('node -v 2^>nul') do set "VERRAW=%%a"
for /f "tokens=1,2 delims=." %%a in ("!VERRAW!") do (
  set "MAJ=%%a"
  set "MIN=%%b"
)
if not defined MAJ exit /b 1
if !MAJ! LSS 22 exit /b 1
if !MAJ! GTR 22 exit /b 0
if not defined MIN set "MIN=0"
if !MIN! LSS 5 exit /b 1
exit /b 0

:InstallNode
where winget >nul 2>nul
if errorlevel 1 (
  echo winget not available, please install Node manually.
  exit /b 1
)
echo winget: OpenJS.NodeJS.22 ...
winget install -e --id OpenJS.NodeJS.22 --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo winget Node 22 failed, trying OpenJS.NodeJS.LTS ...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
)
exit /b 0

:RefreshPath
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH if defined USR_PATH set "PATH=!SYS_PATH!;!USR_PATH!"
if defined SYS_PATH if not defined USR_PATH set "PATH=!SYS_PATH!"
if defined USR_PATH if not defined SYS_PATH set "PATH=!USR_PATH!"
REM Common install locations (including custom drives)
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;!PATH!"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;!PATH!"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;!PATH!"
if exist "C:\nodejs\node.exe" set "PATH=C:\nodejs;!PATH!"
if exist "D:\nodejs\node.exe" set "PATH=D:\nodejs;!PATH!"
if exist "E:\nodejs\node.exe" set "PATH=E:\nodejs;!PATH!"
if exist "F:\nodejs\node.exe" set "PATH=F:\nodejs;!PATH!"
if exist "%USERPROFILE%\scoop\apps\nodejs\current\node.exe" set "PATH=%USERPROFILE%\scoop\apps\nodejs\current;!PATH!"
if exist "%APPDATA%\nvm" (
  for /f "delims=" %%d in ('dir /b /ad /o-n "%APPDATA%\nvm\v*" 2^>nul') do (
    if exist "%APPDATA%\nvm\%%d\node.exe" set "PATH=%APPDATA%\nvm\%%d;!PATH!"
    goto :AfterNvm
  )
)
:AfterNvm
exit /b 0
