@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   BOM 扫码质量监管系统 - 开始运行
echo ========================================
echo.

call :RefreshPath

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，先执行配置...
  call "%~dp0setup-env.bat"
  if errorlevel 1 (
    echo 环境配置失败，无法启动。
    exit /b 1
  )
  call :RefreshPath
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js %%v

REM Check express package folder (backslash is mid-path, not before closing quote)
if not exist "node_modules\express" (
  echo 检测到尚未安装依赖，先执行配置...
  call "%~dp0setup-env.bat"
  if errorlevel 1 (
    echo 环境配置失败，无法启动。
    exit /b 1
  )
)

cmd /c node scripts\ensure-deps.js
if errorlevel 1 (
  echo 环境检查未通过，请先运行一键配置环境。
  exit /b 1
)

echo.
echo 正在启动服务...
echo 约 2 秒后打开浏览器: http://127.0.0.1:3789
echo 关闭本窗口即停止服务。
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3789"

cmd /c npm start
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo 服务异常退出，错误码 %EXIT_CODE%
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
