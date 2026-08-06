@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================
echo   BOM 扫码质量监管系统 - 启动脚本
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js。
  echo 请先安装 Node.js LTS：https://nodejs.org
  echo 安装完成后重新打开本窗口，再双击 start.bat
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo 已检测到 Node.js %NODE_VER%
echo.

if not exist "node_modules\better-sqlite3" (
  echo 正在安装依赖（首次可能需要几分钟）...
  call npm install
  if errorlevel 1 (
    echo.
    echo [错误] npm install 失败。
    echo 请确认：
    echo   1^) 已安装官方 Node.js LTS ^(x64^)
    echo   2^) 网络可访问 npm 仓库；若失败可试：
    echo      npm config set registry https://registry.npmmirror.com
    echo      然后重新运行本脚本
    echo   3^) 若提示编译 better-sqlite3 失败，请安装 Visual Studio Build Tools
    echo      并勾选“使用 C++ 的桌面开发”
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo 正在启动服务...
echo.
call npm start
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo 服务异常退出，错误码 %EXIT_CODE%
)
pause
exit /b %EXIT_CODE%
