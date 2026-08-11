@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo   BOM QC - Setup EN (window stays open)
echo ========================================
echo.
echo Working dir:
echo   %CD%
echo.

call "%~dp0setup-env-en.bat"
set ERR=%ERRORLEVEL%

echo.
echo ---------------------------------------
if "%ERR%"=="0" (
  echo RESULT: OK
  echo Next: double-click start.bat
) else (
  echo RESULT: FAILED  code=%ERR%
  echo Screenshot the messages above.
)
echo ---------------------------------------
echo.
echo Press any key to close this window...
pause
exit /b %ERR%
