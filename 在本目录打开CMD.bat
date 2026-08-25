@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
echo 已切换到项目目录:
echo   %CD%
echo.
echo 接下来请输入下面命令之一：
echo   一键配置环境.bat
echo   手动配置并启动.bat
echo   node scripts\windows-setup.js
echo   node server\index.js
echo.
cmd /k
