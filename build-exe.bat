@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "BUILD_NODE_DIR="
set "ACTIVE_NODE_MAJOR="
set "ACTIVE_NODE_MINOR="

for /f "tokens=1,2 delims=." %%M in ('node -p "process.versions.node" 2^>nul') do (
    set "ACTIVE_NODE_MAJOR=%%M"
    set "ACTIVE_NODE_MINOR=%%N"
)

if defined ACTIVE_NODE_MAJOR (
    if !ACTIVE_NODE_MAJOR! GTR 22 for %%N in (node.exe) do set "BUILD_NODE_DIR=%%~dp$PATH:N"
    if !ACTIVE_NODE_MAJOR! EQU 22 if !ACTIVE_NODE_MINOR! GEQ 12 for %%N in (node.exe) do set "BUILD_NODE_DIR=%%~dp$PATH:N"
)

if not defined BUILD_NODE_DIR if defined NVM_HOME (
    for /d %%D in ("%NVM_HOME%\v*") do (
        set "CANDIDATE_VERSION=%%~nxD"
        set "CANDIDATE_VERSION=!CANDIDATE_VERSION:~1!"
        for /f "tokens=1,2 delims=." %%M in ("!CANDIDATE_VERSION!") do (
            if %%M GTR 22 if exist "%%~fD\node.exe" set "BUILD_NODE_DIR=%%~fD"
            if %%M EQU 22 if %%N GEQ 12 if exist "%%~fD\node.exe" set "BUILD_NODE_DIR=%%~fD"
        )
    )
)

if not defined BUILD_NODE_DIR (
    echo Bricriu requires Node.js 22.12.0 or newer to build.
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
