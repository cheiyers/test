@echo off
REM 兼容旧入口：转到「一键配置环境.bat」
cd /d "%~dp0"
call "%~dp0一键配置环境.bat"
exit /b %ERRORLEVEL%
