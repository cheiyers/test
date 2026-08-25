@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   手动配置并启动
echo ========================================
echo 当前目录: %CD%
echo.

call :ResolveNode
if not defined NODE_EXE (
  echo [错误] 找不到 node.exe
  echo 已检查: %ProgramFiles%\nodejs\node.exe
  echo 请确认 Node 已安装，或在 CMD 执行 where node 查看路径。
  echo.
  pause
  exit /b 1
)
echo [OK] 使用: %NODE_EXE%
"%NODE_EXE%" -v
echo.

if not exist "%CD%\package.json" (
  echo [错误] 当前目录没有 package.json
  echo 必须在项目文件夹里双击本文件（能看到 package.json 的那个目录）。
  echo.
  pause
  exit /b 1
)

echo [OK] 已找到 package.json
echo.
echo ----------------------------------------
echo 按任意键开始安装/检查依赖...
pause >nul

"%NODE_EXE%" "%~dp0scripts\windows-setup.js"
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo [失败] 配置未成功，退出码 %ERR%
  echo 请查看 setup-log.txt
  echo.
  pause
  exit /b %ERR%
)

echo.
echo ----------------------------------------
echo 配置成功。按任意键启动系统...
pause >nul

echo 浏览器: http://127.0.0.1:3789
echo 账号: admin / admin123
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3789"
"%NODE_EXE%" "%~dp0server\index.js"
echo.
echo 服务已退出。按任意键关闭窗口。
pause
exit /b %ERRORLEVEL%

:ResolveNode
set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\nodejs\node.exe" set "NODE_EXE=C:\nodejs\node.exe"
if not defined NODE_EXE if exist "D:\nodejs\node.exe" set "NODE_EXE=D:\nodejs\node.exe"
if not defined NODE_EXE if exist "E:\nodejs\node.exe" set "NODE_EXE=E:\nodejs\node.exe"
if defined NODE_EXE exit /b 0
where node >nul 2>nul
if not errorlevel 1 (
  for /f "delims=" %%P in ('where node 2^>nul') do (
    set "NODE_EXE=%%P"
    goto :Done
  )
)
:Done
exit /b 0
