@echo off
title World Overcomers Website - Clean Install
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS from https://nodejs.org/ , install it, then double-click this file again.
  pause
  exit /b 1
)
cd /d "%~dp0"
echo Removing the old install (fixes broken/half-installed node_modules) ...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /q package-lock.json
echo Installing ...
call npm install
if errorlevel 1 (
  echo.
  echo Install failed. Copy everything in this window and send it to support.
  pause
  exit /b 1
)
echo.
echo Done. You can now run start.bat (or: npm run dev).
pause
