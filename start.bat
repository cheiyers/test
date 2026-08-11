@echo off
cd /d "%~dp0"
if /I not "%~1"=="_KEEP" (
  start "BOM-QC-Run" cmd.exe /k ""%~f0" _KEEP"
  exit /b 0
)

echo.
echo BOM QC Run Window - stays open
echo.

call "%~dp0run.bat"
set ERR=%ERRORLEVEL%

echo.
if not "%ERR%"=="0" echo ERROR code=%ERR%
echo.
echo Press any key to close...
pause >nul
exit /b %ERR%
