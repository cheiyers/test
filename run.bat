@echo off
chcp 936 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   BOM 扫码质量监管系统 - 开始运行
echo ========================================
echo.

call :RefreshPath

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，先执行一键配置环境...
  echo.
  call "%~dp0setup-env.bat"
  if errorlevel 1 (
    echo.
    echo 环境配置失败，无法启动。请先单独运行“一键配置环境.bat”。
    exit /b 1
  )
  call :RefreshPath
)

if not exist "node_modules\better-sqlite3" (
  echo 检测到尚未安装依赖，先执行一键配置环境...
  echo.
  call "%~dp0setup-env.bat"
  if errorlevel 1 (
    echo.
    echo 环境配置失败，无法启动。
    exit /b 1
  )
)

call node scripts\ensure-deps.js
if errorlevel 1 (
  echo.
  echo 环境检查未通过，请先双击“一键配置环境.bat”。
  exit /b 1
)

echo.
echo 正在启动服务...
echo 约 2 秒后自动打开浏览器: http://127.0.0.1:3789
echo 关闭本窗口即停止服务。
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3789"

call npm start
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo 服务异常退出，错误码 %EXIT_CODE%
  echo 若提示端口占用，请先关闭其他已启动的运行窗口后重试。
)
exit /b %EXIT_CODE%

:RefreshPath
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH if defined USR_PATH (
  set "PATH=!SYS_PATH!;!USR_PATH!"
) else if defined SYS_PATH (
  set "PATH=!SYS_PATH!"
) else if defined USR_PATH (
  set "PATH=!USR_PATH!"
)
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;!PATH!"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;!PATH!"
exit /b 0
