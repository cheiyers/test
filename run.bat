@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   BOM QC - Start server
echo ========================================
echo 当前目录: %CD%
echo.

call :ResolveNode
if not defined NODE_EXE (
  echo [错误] 找不到 node.exe
  echo.
  echo 你的电脑若已能在 CMD 里执行 node -v，多半是双击运行时 PATH 没带上 Node。
  echo 请用下面任一方式启动：
  echo   1^) 在项目文件夹地址栏输入 cmd，执行：
  echo        "%ProgramFiles%\nodejs\node.exe" server\index.js
  echo   2^) 双击「手动配置并启动.bat」
  echo.
  pause
  exit /b 1
)

echo [OK] Node: %NODE_EXE%
"%NODE_EXE%" -v
echo.

if not exist "%CD%\package.json" (
  echo [错误] 当前目录没有 package.json，请在项目文件夹里运行本文件。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo 依赖未安装，正在自动配置...
  echo.
  "%NODE_EXE%" "%~dp0scripts\windows-setup.js"
  if errorlevel 1 (
    echo 配置失败。请查看 setup-log.txt
    echo.
    pause
    exit /b 1
  )
)

"%NODE_EXE%" "%~dp0scripts\ensure-deps.js"
if errorlevel 1 (
  echo 环境检查失败。请先运行「一键配置环境.bat」或「手动配置并启动.bat」
  echo.
  pause
  exit /b 1
)

echo.
echo 正在启动服务...
echo 浏览器打开: http://127.0.0.1:3789
echo 账号: admin / admin123
echo 关闭本窗口即可停止服务。
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:3789"

"%NODE_EXE%" "%~dp0server\index.js"
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" echo 服务退出，代码 %EXIT_CODE%
echo.
pause
exit /b %EXIT_CODE%

:ResolveNode
set "NODE_EXE="
REM 1) 常见安装路径（不依赖 PATH，双击也找得到）
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\nodejs\node.exe" set "NODE_EXE=C:\nodejs\node.exe"
if not defined NODE_EXE if exist "D:\nodejs\node.exe" set "NODE_EXE=D:\nodejs\node.exe"
if not defined NODE_EXE if exist "E:\nodejs\node.exe" set "NODE_EXE=E:\nodejs\node.exe"
if defined NODE_EXE (
  set "PATH=%~dp0;!NODE_EXE:\node.exe=!;!PATH!"
  exit /b 0
)
REM 2) PATH 中的 node
where node >nul 2>nul
if not errorlevel 1 (
  for /f "delims=" %%P in ('where node 2^>nul') do (
    set "NODE_EXE=%%P"
    goto :ResolveDone
  )
)
:ResolveDone
exit /b 0
