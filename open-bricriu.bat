@echo off
setlocal

set "APP=%~dp0src-tauri\target\release\Bricriu.exe"

if not exist "%APP%" (
    echo Bricriu.exe was not found.
    echo Build the release app first by running build-exe.bat.
    pause
    exit /b 1
)

start "" "%APP%"
