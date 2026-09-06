@echo off
setlocal
cd /d "%~dp0"

call npm run tauri -- build --no-bundle

if errorlevel 1 (
    echo Failed to build Bricriu.exe.
    exit /b 1
)

set "APP=%~dp0src-tauri\target\release\Bricriu.exe"

if not exist "%APP%" (
    echo The build completed, but Bricriu.exe was not found at:
    echo %APP%
    exit /b 1
)

echo Built Bricriu.exe successfully:
echo %APP%
