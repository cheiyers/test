@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   BOM QC - Starting server
echo ========================================
echo.

call :RefreshPath

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found, running setup first...
  call "%~dp0setup-env-en.bat"
  if errorlevel 1 (
    echo Setup failed, cannot start.
    exit /b 1
  )
  call :RefreshPath
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js %%v

if not exist "node_modules\express" (
  echo Dependencies missing, running setup first...
  call "%~dp0setup-env-en.bat"
  if errorlevel 1 (
    echo Setup failed, cannot start.
    exit /b 1
  )
)

cmd /c node scripts\ensure-deps.js
if errorlevel 1 (
  echo Env check failed. Run setup.cmd first.
  exit /b 1
)

echo.
echo Starting service...
echo Browser in ~2s: http://127.0.0.1:3789
echo Closing this window stops the service.
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3789"

cmd /c npm start
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo Service exited with code %EXIT_CODE%
)
exit /b %EXIT_CODE%

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
