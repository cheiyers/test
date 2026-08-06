@echo off
cd /d "%~dp0"
echo.
echo Starting setup, please wait...
echo.
call "%~dp0setup-env.bat"
set ERR=%ERRORLEVEL%
echo.
if "%ERR%"=="0" (
  echo Setup finished.
) else (
  echo Setup failed. See messages above.
)
echo.
pause
exit /b %ERR%
