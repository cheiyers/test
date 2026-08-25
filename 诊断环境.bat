@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   BOM QC - Diagnose
echo ========================================
echo.

call :RefreshPath

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node not found in PATH
  echo Run 一键配置环境.bat first, or install Node 22+ from nodejs.org
  goto End
)

node "%~dp0scripts\windows-diagnose.js"
echo.
echo Log file: %CD%\diagnose-log.txt
echo Please send diagnose-log.txt if setup still fails.
echo.

:End
echo Press any key to close...
pause
exit /b 0

:RefreshPath
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH if defined USR_PATH set "PATH=!SYS_PATH!;!USR_PATH!"
if defined SYS_PATH if not defined USR_PATH set "PATH=!SYS_PATH!"
if defined USR_PATH if not defined SYS_PATH set "PATH=!USR_PATH!"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;!PATH!"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;!PATH!"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;!PATH!"
if exist "C:\nodejs\node.exe" set "PATH=C:\nodejs;!PATH!"
if exist "D:\nodejs\node.exe" set "PATH=D:\nodejs;!PATH!"
if exist "E:\nodejs\node.exe" set "PATH=E:\nodejs;!PATH!"
exit /b 0
