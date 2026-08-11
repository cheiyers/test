@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo   BOM QC - Setup (window stays open)
echo ========================================
echo.
echo Working dir:
echo   %CD%
echo.

call "%~dp0setup-env.bat"
set ERR=%ERRORLEVEL%

echo.
echo ---------------------------------------
if "%ERR%"=="0" (
  echo RESULT: OK
  echo Next: double-click start.bat
) else (
  echo RESULT: FAILED  code=%ERR%
  echo Try setup.cmd if this still fails.
)
echo ---------------------------------------
echo.
echo Press any key to close this window...
pause
exit /b %ERR%
