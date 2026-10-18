@echo off
title World Overcomers Website
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS from https://nodejs.org/ , install it, then double-click this file again.
  pause
  exit /b 1
)
cd /d "%~dp0"
echo Starting the site at http://localhost:5173/  ^(admin: /admin^)
echo Close this window to stop the site.
start "" "http://localhost:5173/"
node scripts\serve.mjs
pause
