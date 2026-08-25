@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo   1. 配置环境（安装依赖）
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
  echo 安装时勾选 Add to PATH，然后重新打开本文件。
  echo.
  start "" "https://nodejs.org/zh-cn/download"
  pause
  exit /b 1
)

if not exist "%CD%\package.json" (
  echo [错误] 请在本项目文件夹内双击本文件（需有 package.json）
  echo.
  pause
  exit /b 1
)

echo [OK] %NODE_EXE%
"%NODE_EXE%" -v
echo.
echo 正在安装依赖，请稍候...
echo.

"%NODE_EXE%" "%~dp0scripts\windows-setup.js"
if errorlevel 1 (
  echo.
  echo [失败] 配置未成功。可查看 setup-log.txt
  echo.
  pause
  exit /b 1
)

echo.
echo ========================================
echo   配置完成！下一步：双击「2-启动系统.bat」
echo ========================================
echo.
pause
exit /b 0
