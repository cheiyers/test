@echo off
REM 兼容旧入口：转到「开始运行.bat」
cd /d "%~dp0"
call "%~dp0开始运行.bat"
exit /b %ERRORLEVEL%
