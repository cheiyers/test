@echo off
cd /d "%~dp0"
title BOM run
echo.
echo Starting application, please wait...
echo.
call "%~dp0run.bat"
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo Application exited with error %ERR%
)
echo.
pause
exit /b %ERR%
