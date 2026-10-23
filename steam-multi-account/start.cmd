@echo off
cd /d "%~dp0"
if not exist node_modules\steam-user\package.json (
  call npm.cmd ci --registry=https://registry.npmjs.org --no-audit --no-fund
  if errorlevel 1 exit /b 1
)
node src\server.js
if errorlevel 1 pause
