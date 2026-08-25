@echo off
REM 固定用全路径启动，避免双击时提示找不到 node
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\node.exe" (
  "%ProgramFiles%\nodejs\node.exe" "%~dp0server\index.js"
  goto End
)
if exist "%LocalAppData%\Programs\nodejs\node.exe" (
  "%LocalAppData%\Programs\nodejs\node.exe" "%~dp0server\index.js"
  goto End
)
call "%~dp0run.bat"
exit /b %ERRORLEVEL%

:End
echo.
pause
exit /b %ERRORLEVEL%
