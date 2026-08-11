@echo off
cd /d "%~dp0"
if /I not "%~1"=="_KEEP" (
  start "BOM-QC-Setup" cmd.exe /k ""%~f0" _KEEP"
  exit /b 0
)

echo.
echo ========================================
echo   BOM 配置窗口（不会自动关闭）
echo ========================================
echo.

call "%~dp0setup-env.bat"
set ERR=%ERRORLEVEL%

echo.
echo ---------------------------------------
if "%ERR%"=="0" (
  echo 结果: 配置成功
  echo 下一步请双击: 开始运行.bat
) else (
  echo 结果: 配置失败  错误码=%ERR%
  echo 请把上面的报错截图发给技术支持。
  echo.
  echo 若中文脚本仍闪退，请改双击: setup.cmd
)
echo ---------------------------------------
echo.
echo 按任意键关闭本窗口...
pause >nul
exit /b %ERR%
