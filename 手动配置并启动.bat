@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo   请确认：本窗口显示的目录里要有 package.json
echo ========================================
echo.
echo 当前目录:
echo   %CD%
echo.

if not exist "%CD%\package.json" (
  echo [错误] 当前目录没有 package.json
  echo.
  echo 说明：你的 Node 是好的，但必须在“项目文件夹”里运行。
  echo 项目文件夹里应能看到：
  echo   package.json
  echo   一键配置环境.bat
  echo   开始运行.bat
  echo   server\
  echo.
  echo 请这样操作：
  echo   1. 打开资源管理器，进入项目文件夹
  echo   2. 在地址栏输入 cmd 后回车
  echo   3. 再执行：  一键配置环境.bat
  echo      或执行：  node scripts\windows-setup.js
  echo.
  pause
  exit /b 1
)

echo [OK] 已找到 package.json
echo.
echo Node 版本:
node -v
echo npm 版本:
npm -v
echo.
echo ----------------------------------------
echo 按任意键开始安装依赖（npm install）...
pause >nul

node "%~dp0scripts\windows-setup.js"
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo [失败] 配置未成功，退出码 %ERR%
  echo 请把 setup-log.txt 发出来，或把上面报错复制发给管理员。
  echo.
  pause
  exit /b %ERR%
)

echo.
echo ----------------------------------------
echo 配置成功。按任意键启动系统...
pause >nul

node "%~dp0server\index.js"
echo.
echo 服务已退出。按任意键关闭窗口。
pause
exit /b %ERRORLEVEL%
