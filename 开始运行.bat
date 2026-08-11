@echo off
cd /d "%~dp0"
if /I not "%~1"=="_KEEP" (
  start "BOM-QC-Run" cmd.exe /k ""%~f0" _KEEP"
  exit /b 0
)

echo.
echo ========================================
echo   BOM 运行窗口（关闭即停服务）
echo ========================================
echo.

call "%~dp0run.bat"
set ERR=%ERRORLEVEL%

echo.
if not "%ERR%"=="0" (
  echo 运行异常，错误码=%ERR%
  echo 请先双击「一键配置环境.bat」或 setup.cmd
)
echo.
echo 按任意键关闭本窗口...
pause >nul
exit /b %ERR%
