@echo off
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\node.exe" (
  "%ProgramFiles%\nodejs\node.exe" "%~dp0server\index.js"
  echo.
  pause
  exit /b %ERRORLEVEL%
)
call "%~dp0run.bat"
exit /b %ERRORLEVEL%
