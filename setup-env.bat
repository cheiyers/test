@echo off
chcp 936 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   BOM 扫码质量监管系统 - 一键配置环境
echo ========================================
echo.
echo 本脚本将自动完成:
echo   1) 检查 Node.js (需要 22 或更高)
echo   2) 配置 npm 国内镜像
echo   3) 清理并安装项目依赖
echo.
echo 说明: 已改用 better-sqlite3 v13 (N-API)，
echo       一般无需安装 Visual Studio 编译工具。
echo.

call :RefreshPath
call :EnsureNode
if errorlevel 1 goto FAIL

for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v
for /f "tokens=*" %%v in ('npm -v 2^>nul') do set NPM_VER=%%v
echo [OK] Node.js !NODE_VER! / npm !NPM_VER!
echo.

echo [2/3] 配置 npm 国内镜像...
call npm config set registry https://registry.npmmirror.com >nul 2>nul
echo [OK] registry = https://registry.npmmirror.com
echo.

echo [3/3] 安装项目依赖，首次可能需要几分钟，请勿关闭窗口...
echo.

if exist "node_modules" (
  echo 正在删除旧的 node_modules ...
  rmdir /s /q "node_modules" 2>nul
  if exist "node_modules" (
    echo.
    echo [错误] 无法删除 node_modules，文件被占用。
    echo 请关闭所有黑窗口 / 杀毒软件扫描后，手动删除该文件夹，再重试。
    echo 路径: %CD%\node_modules
    goto FAIL
  )
)
if exist "package-lock.json" (
  REM keep lockfile from repo; do not delete
  echo 将使用项目自带的 package-lock.json
)

call npm install
if errorlevel 1 (
  echo.
  echo [错误] 依赖安装失败。
  echo.
  echo 若仍出现 better-sqlite3 / node-gyp / Visual Studio 错误:
  echo   1) 确认已拉取最新代码 (better-sqlite3 应为 13.x)
  echo   2) 删除 node_modules 后重试本脚本
  echo   3) Node 需要 22 或更高 (你当前是 !NODE_VER!)
  echo.
  echo 若出现 EPERM 删除失败: 关闭占用文件的程序后重试
  goto FAIL
)

echo.
echo 正在验证环境...
call node scripts\ensure-deps.js
if errorlevel 1 goto FAIL

echo.
echo ========================================
echo   环境配置完成
echo ========================================
echo 下一步: 双击 开始运行.bat 启动系统
echo 浏览器访问: http://127.0.0.1:3789
echo ========================================
echo.
goto END_OK

:FAIL
echo.
echo ========================================
echo   配置未完成，请根据上方提示处理后重试
echo ========================================
echo.
exit /b 1

:END_OK
exit /b 0

:EnsureNode
where node >nul 2>nul
if errorlevel 1 goto InstallNode

for /f "tokens=1 delims=v" %%a in ('node -v') do set "VER_BODY=%%a"
for /f "tokens=1 delims=." %%a in ("!VER_BODY!") do set "MAJOR=%%a"
if "!MAJOR!"=="" set MAJOR=0
if !MAJOR! LSS 22 (
  echo [警告] 当前 Node.js 版本过低，需要 22 或更高，尝试安装/升级...
  goto InstallNode
)
echo [1/3] 已检测到可用 Node.js，跳过安装
exit /b 0

:InstallNode
echo [1/3] 未检测到可用 Node.js，开始自动安装...
where winget >nul 2>nul
if errorlevel 1 goto ManualNode

echo 使用 winget 安装 OpenJS.NodeJS.LTS ...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo LTS 安装失败，尝试安装 OpenJS.NodeJS ...
  winget install -e --id OpenJS.NodeJS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto ManualNode
)

call :RefreshPath
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 可能已安装，但当前窗口尚未识别到 node 命令。
  echo 请关闭本窗口后，重新双击 一键配置环境.bat 继续。
  exit /b 1
)

for /f "tokens=1 delims=v" %%a in ('node -v') do set "VER_BODY=%%a"
for /f "tokens=1 delims=." %%a in ("!VER_BODY!") do set "MAJOR=%%a"
if !MAJOR! LSS 22 (
  echo [错误] 安装后 Node 版本仍低于 22，请手动安装: https://nodejs.org
  exit /b 1
)
exit /b 0

:ManualNode
echo 无法自动安装，正在打开 Node.js 官网下载页...
start "" "https://nodejs.org/zh-cn/download"
echo.
echo 请下载并安装 Windows x64 版本 (22 LTS 或更新)，勾选 Add to PATH，
echo 安装完成后重新双击 一键配置环境.bat。
exit /b 1

:RefreshPath
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH if defined USR_PATH (
  set "PATH=!SYS_PATH!;!USR_PATH!"
) else if defined SYS_PATH (
  set "PATH=!SYS_PATH!"
) else if defined USR_PATH (
  set "PATH=!USR_PATH!"
)
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;!PATH!"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;!PATH!"
if exist "E:\nodejs\node.exe" set "PATH=E:\nodejs;!PATH!"
exit /b 0
