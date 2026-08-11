@echo off
cd /d "%~dp0"
title BOM setup
echo.
echo ========================================
echo   Starting setup, please wait...
echo   Window will stay open until you press a key.
echo ========================================
echo.
call "%~dp0setup-env.bat"
set ERR=%ERRORLEVEL%
echo.
echo ---------------------------------------
if "%ERR%"=="0" (
  echo Setup finished. OK
) else (
  echo Setup failed. Error code: %ERR%
  echo Please screenshot the messages above.
)
echo ---------------------------------------
echo.
pause
exit /b %ERR%
