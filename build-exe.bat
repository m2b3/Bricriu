@echo off
cd /d "%~dp0"
call npm run tauri -- build --no-bundle
