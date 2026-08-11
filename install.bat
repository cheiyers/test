@echo off
cd /d "%~dp0"
if /I not "%~1"=="_KEEP" (
  start "BOM-QC-Setup" cmd.exe /k ""%~f0" _KEEP"
  exit /b 0
)

echo.
echo ========================================
echo   BOM QC Setup Window (stays open)
echo ========================================
echo.

call "%~dp0setup-env-en.bat"
set ERR=%ERRORLEVEL%

echo.
echo ---------------------------------------
if "%ERR%"=="0" (
  echo RESULT: Setup finished OK
  echo Next: double-click start.bat or 开始运行.bat
) else (
  echo RESULT: Setup FAILED  code=%ERR%
  echo Please screenshot the messages above.
)
echo ---------------------------------------
echo.
echo Press any key to close this window...
pause >nul
exit /b %ERR%
