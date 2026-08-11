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
  echo [提示] 当前窗口未检测到 Node.js。
  echo 若你在 CMD 里能运行 node -v，请关闭本窗口后重开，或先运行 一键配置环境.bat
  echo.
  call "%~dp0setup-env.bat"
  if errorlevel 1 (
    echo.
    echo 环境配置失败，无法启动。请先单独运行 一键配置环境.bat
    exit /b 1
  )
  call :RefreshPath
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] 检测到 Node.js %%v

REM 通用版已不再使用 better-sqlite3，以 express 是否存在判断依赖是否装好
if not exist "node_modules\express" (
  echo.
  echo [提示] 项目依赖尚未安装 ^(缺少 node_modules^)。
  echo 说明: 只安装 Node.js 不等于项目已配置，还需要执行一键配置安装依赖。
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
  echo 环境检查未通过。请把上方中文提示完整截图，或先双击 一键配置环境.bat
  exit /b 1
)

echo.
echo 正在启动服务...
echo 约 2 秒后自动打开浏览器: http://127.0.0.1:3789
echo 关闭本窗口即停止服务。
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3789"

cmd /c "npm start"
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
if exist "E:\nodejs\node.exe" set "PATH=E:\nodejs;!PATH!"
exit /b 0
