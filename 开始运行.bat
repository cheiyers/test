@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo   BOM QC - Run (close window = stop)
echo ========================================
echo.

call "%~dp0run.bat"
set ERR=%ERRORLEVEL%

echo.
if not "%ERR%"=="0" (
  echo ERROR code=%ERR%
  echo Run setup first: setup.cmd
)
echo.
echo Press any key to close this window...
pause
exit /b %ERR%
