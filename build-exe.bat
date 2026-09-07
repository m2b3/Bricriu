@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "BUILD_NODE_DIR="
set "ACTIVE_NODE_MAJOR="

for /f "delims=" %%M in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "ACTIVE_NODE_MAJOR=%%M"

if defined ACTIVE_NODE_MAJOR if !ACTIVE_NODE_MAJOR! GEQ 22 (
    for %%N in (node.exe) do set "BUILD_NODE_DIR=%%~dp$PATH:N"
)

if not defined BUILD_NODE_DIR if defined NVM_HOME (
    for /d %%D in ("%NVM_HOME%\v*") do (
        set "CANDIDATE_VERSION=%%~nxD"
        set "CANDIDATE_VERSION=!CANDIDATE_VERSION:~1!"
        for /f "tokens=1 delims=." %%M in ("!CANDIDATE_VERSION!") do (
            if %%M GEQ 22 if exist "%%~fD\node.exe" set "BUILD_NODE_DIR=%%~fD"
        )
    )
)

if not defined BUILD_NODE_DIR (
    echo Bricriu requires Node.js 22 or newer to build.
    echo Install a supported Node version with NVM for Windows, then try again.
    echo The active system Node version was not changed.
    exit /b 1
)

set "PATH=%BUILD_NODE_DIR%;%PATH%"
for /f "delims=" %%V in ('node --version') do set "BUILD_NODE_VERSION=%%V"
echo Building Bricriu with Node !BUILD_NODE_VERSION! from:
echo %BUILD_NODE_DIR%

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
