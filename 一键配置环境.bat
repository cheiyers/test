@echo off
cd /d "%~dp0"
call "%~dp0setup-env.bat"
exit /b %ERRORLEVEL%
