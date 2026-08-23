@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title reshi 整站编辑器启动器

cd /d "%~dp0"
set "EDITOR_PORT=3789"
set "EDITOR_URL=http://localhost:%EDITOR_PORT%/"

echo.
echo [1/4] 正在释放 %EDITOR_PORT% 端口...
set "FOUND_PID="
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%EDITOR_PORT% .*LISTENING"') do (
  if not "%%P"=="0" (
    set "FOUND_PID=1"
    echo       结束旧服务 PID %%P
    taskkill /PID %%P /T /F >nul 2>&1
  )
)
if not defined FOUND_PID echo       端口当前未被占用

echo [2/4] 正在检查项目环境...
where pnpm >nul 2>&1
if errorlevel 1 (
  color 0C
  echo.
  echo [失败] 未找到 pnpm。请先安装 Node.js 和 pnpm，再重新双击本文件。
  echo.
  pause
  exit /b 1
)
if not exist "package.json" (
  color 0C
  echo.
  echo [失败] 启动器不在项目根目录，未找到 package.json。
  echo.
  pause
  exit /b 1
)

echo [3/4] 正在检查 GitHub 连接...
git ls-remote --exit-code --heads origin main >nul 2>&1
if errorlevel 1 (
  color 0E
  echo       GitHub 暂时无法连接。编辑器仍会启动并可保存草稿，
  echo       但“发布并检查”需要切换可访问 GitHub 的网络、热点或代理后再试。
) else (
  echo       GitHub 连接正常，发布按钮可用
)

echo [4/4] 正在启动整站编辑器...
start "reshi 整站编辑器服务" cmd /k "cd /d ""%~dp0"" ^&^& pnpm run pages:edit"

for /l %%I in (1,1,15) do (
  powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri '%EDITOR_URL%'; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
  if not errorlevel 1 goto :OPEN_EDITOR
  timeout /t 1 /nobreak >nul
)

color 0E
echo.
echo [提示] 服务启动较慢，请查看新打开的“reshi 整站编辑器服务”窗口。
echo        稍后手动打开 %EDITOR_URL%
echo.
pause
exit /b 0

:OPEN_EDITOR
echo       启动成功：%EDITOR_URL%
start "" "%EDITOR_URL%"
timeout /t 2 /nobreak >nul
exit /b 0
