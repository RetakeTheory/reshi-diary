@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "EDITOR_PORT=3789"
echo [INIT] Project: %CD%
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  pause
  exit /b 1
)
if not exist "scripts\visual-editor-server.mjs" (
  echo [ERROR] scripts\visual-editor-server.mjs was not found.
  pause
  exit /b 1
)
echo [INIT] Releasing port %EDITOR_PORT%...
:RELEASE_PORT
set /a RELEASE_ATTEMPT+=1
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%EDITOR_PORT% .*LISTENING"') do (
  echo [STOP] PID %%P
  taskkill /PID %%P /T /F
)
timeout /t 1 /nobreak >nul
netstat -ano -p tcp | findstr /R /C:":%EDITOR_PORT% .*LISTENING" >nul
if not errorlevel 1 (
  if %RELEASE_ATTEMPT% LSS 5 goto RELEASE_PORT
  echo [ERROR] Port %EDITOR_PORT% is still in use.
  echo [HINT] Right-click this BAT and choose "Run as administrator".
  pause
  exit /b 1
)
echo [START] http://localhost:%EDITOR_PORT%/
node scripts\visual-editor-server.mjs
set "EDITOR_EXIT=%ERRORLEVEL%"
echo [EXIT] Editor stopped with code %EDITOR_EXIT%.
pause
exit /b %EDITOR_EXIT%
