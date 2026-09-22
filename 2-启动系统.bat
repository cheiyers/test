@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo   2. 启动系统
echo ========================================
echo 目录: %CD%
echo.

set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\nodejs\node.exe" set "NODE_EXE=C:\nodejs\node.exe"
if not defined NODE_EXE if exist "D:\nodejs\node.exe" set "NODE_EXE=D:\nodejs\node.exe"

if not defined NODE_EXE (
  echo [错误] 找不到 Node.js
  echo 请先安装 Node.js 22.5+ ： https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "%CD%\package.json" (
  echo [错误] 请在本项目文件夹内双击本文件
  echo.
  pause
  exit /b 1
)

if not exist "%CD%\node_modules\express" (
  echo [提示] 尚未配置依赖，正在自动执行配置...
  echo.
  "%NODE_EXE%" "%~dp0scripts\windows-setup.js"
  if errorlevel 1 (
    echo 配置失败，请先双击「1-配置环境.bat」
    echo.
    pause
    exit /b 1
  )
)

echo [OK] %NODE_EXE%
"%NODE_EXE%" -v
echo.
echo 正在启动...
echo 地址: http://127.0.0.1:3789
echo 账号: admin / admin123
echo 关闭本窗口 = 停止服务
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3789"
"%NODE_EXE%" "%~dp0server\index.js"

echo.
echo 服务已退出。
pause
exit /b %ERRORLEVEL%
