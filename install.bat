@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================
echo   BOM 扫码质量监管系统 - 安装依赖
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js。
  echo 请先安装 Node.js LTS：https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo 可选：使用国内镜像加速（若已配置可忽略）
echo   npm config set registry https://registry.npmmirror.com
echo.

if exist "node_modules" (
  echo 检测到已有 node_modules，将重新安装...
)

call npm install
if errorlevel 1 (
  echo.
  echo [错误] 安装失败。请把上方完整报错截图/复制发给维护人员。
  echo.
  pause
  exit /b 1
)

echo.
echo 依赖安装完成。可双击 start.bat 启动，或执行 npm start
echo.
pause
exit /b 0
