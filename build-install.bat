@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0"
if errorlevel 1 exit /b 1

rem Select a supported Windows Node runtime without changing the user's NVM setting.
set "BRICRIU_NODE_DIR="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined BRICRIU_NODE_DIR call :try_node "%%~dpN"
if not defined BRICRIU_NODE_DIR if defined NVM_HOME (
    for /d %%D in ("%NVM_HOME%\v*") do if not defined BRICRIU_NODE_DIR call :try_node "%%~fD"
)
if not defined BRICRIU_NODE_DIR (
    echo ERROR: Install Windows Node.js 22.12.0 or newer, including npm.
    echo See install.md for the one-time Windows build prerequisites.
    goto failed
)
set "PATH=%BRICRIU_NODE_DIR%;%PATH%"

rem Rustup normally installs here; a recently installed toolchain may not be on PATH yet.
where cargo.exe >nul 2>&1
if errorlevel 1 if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cargo --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Rust and Cargo are required. See install.md for Windows setup.
    goto failed
)
rustc -vV 2>nul | findstr /b /l /c:"host: x86_64-pc-windows-msvc" >nul
if errorlevel 1 (
    echo ERROR: This installer build requires the x64 Windows MSVC Rust toolchain.
    echo Install it with rustup and select it for this project before retrying.
    goto failed
)

if /i "%~1"=="--check" (
    echo Node.js and the x64 Windows MSVC Rust toolchain are available.
    node --version
    cargo --version
    popd
    exit /b 0
)

rem Never terminate an open editor: it may contain unsaved changes.
tasklist /nh /fi "IMAGENAME eq Bricriu.exe" 2>nul | findstr /i /c:"Bricriu.exe" >nul
if not errorlevel 1 (
    echo Save your notes and close Bricriu, then run this script again.
    goto failed
)

echo.
echo [1/3] Installing project dependencies...
node --version
call npm ci
if errorlevel 1 (
    echo ERROR: Dependency installation failed. Installation has stopped.
    goto failed
)

echo.
echo [2/3] Building Bricriu and its Windows installer...
call npm run build-exe
if errorlevel 1 (
    echo ERROR: The build failed. No installer will be launched.
    echo Native builds require Visual Studio C++ Build Tools and a Windows SDK.
    goto failed
)

rem Use the configured version, never a wildcard that could select an older installer.
set "BRICRIU_INSTALLER="
for /f "delims=" %%I in ('node -p "const c = require('./src-tauri/tauri.conf.json'); c.productName + '_' + c.version + '_x64-setup.exe'"') do set "BRICRIU_INSTALLER=%%I"
if not defined BRICRIU_INSTALLER (
    echo ERROR: Could not determine the installer filename from tauri.conf.json.
    goto failed
)
if not exist "%BRICRIU_INSTALLER%" (
    echo ERROR: The build completed, but the expected installer is missing:
    echo %BRICRIU_INSTALLER%
    goto failed
)

echo.
echo [3/3] Installing Bricriu. Follow the installer prompts.
start "" /wait "%CD%\%BRICRIU_INSTALLER%"
if errorlevel 1 (
    echo Installation was cancelled or failed.
    goto failed
)

echo.
echo Bricriu installation completed. Launch Bricriu from the Start menu.
popd
exit /b 0

:failed
popd
exit /b 1

:try_node
if not exist "%~1\node.exe" exit /b 0
if not exist "%~1\npm.cmd" exit /b 0
"%~1\node.exe" -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(process.platform === 'win32' && (major > 22 || major === 22 && minor >= 12) ? 0 : 1)" >nul 2>&1
if not errorlevel 1 set "BRICRIU_NODE_DIR=%~1"
exit /b 0
