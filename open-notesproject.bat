@echo off
setlocal

set "APP=%~dp0src-tauri\target\release\notesproject.exe"

if not exist "%APP%" (
    echo notesproject.exe was not found.
    echo Build the release app first with: npm run tauri -- build
    pause
    exit /b 1
)

start "" "%APP%"
