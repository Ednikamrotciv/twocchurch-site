@echo off
REM install.bat — double-click Windows installer for the church site.
REM Cleans the two things that corrupt most often on Windows (a half-made
REM node_modules + a stale npm cache entry), then installs with full output
REM so the REAL error is visible if anything still fails.
title Church site — install
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [1/4] Node.js is NOT installed.
  echo       Get the LTS from https://nodejs.org/ , install it, then double-click install.bat again.
  pause
  exit /b 1
)

echo.
echo [1/4] Node and npm versions:
node -v
npm -v

echo.
echo [2/4] Removing old half-installed folders (if any)...
if exist node_modules (
  echo   deleting node_modules ...
  rmdir /s /q node_modules
)
if exist package-lock.json (
  echo   keeping package-lock.json as-is.
)

echo.
echo [3/4] Checking npm cache (repairs stale entries)...
call npm cache verify

echo.
echo [4/4] Installing — this takes a few minutes, leave this window open...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo INSTALL FAILED — copy everything in this window and send it for help.
  echo The full detail is also in the newest file under:
  echo   %LOCALAPPDATA%\npm-cache\_logs\
  pause
  exit /b 1
)

echo.
echo DONE. Next: double-click start.bat  (or run: npm run dev)
pause
