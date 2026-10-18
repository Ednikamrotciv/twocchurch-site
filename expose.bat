@echo off
title World Overcomers Website - Office Server
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS from https://nodejs.org/ , install it, then double-click this file again.
  pause
  exit /b 1
)
cd /d "%~dp0"
echo Joining every deployed copy to this computer. Leave this window open.
node scripts\expose.mjs
pause
