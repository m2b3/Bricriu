# Install and Build

This guide is for a new developer starting from a machine that does not already have Node.js, npm, Rust, or the native build tools needed by Tauri.

The project is a Tauri 2 desktop app with a React/Vite frontend and a Rust backend. You need both the JavaScript toolchain and the Rust toolchain before it will compile.

## 1. Install System Prerequisites

### Windows

Install these first:

1. **Node.js LTS**
   - Download and install the LTS version from <https://nodejs.org/>.
   - The installer includes `npm`.

2. **Rust**
   - Download and run `rustup-init.exe` from <https://rustup.rs/>.
   - Choose the default installation options.
   - Restart PowerShell after installation so `cargo` is on your `PATH`.

3. **Microsoft C++ Build Tools**
   - Install **Visual Studio Build Tools** from <https://visualstudio.microsoft.com/visual-cpp-build-tools/>.
   - In the installer, select **Desktop development with C++**.
   - Make sure the Windows SDK and MSVC compiler are included.

4. **Microsoft Edge WebView2 Runtime**
   - Most Windows 10/11 machines already have it.
   - If Tauri reports that WebView2 is missing, install the Evergreen Runtime from <https://developer.microsoft.com/microsoft-edge/webview2/>.

These are the standard Windows prerequisites for Tauri 2.

### macOS

Install:

1. **Xcode Command Line Tools**

   ```sh
   xcode-select --install
   ```

2. **Node.js LTS**
   - Download from <https://nodejs.org/>, or install with your preferred package manager.

3. **Rust**

   ```sh
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

Restart your terminal after installing Rust.

Mac development should work with the normal Tauri prerequisites installed. Use the macOS/Linux command variants shown below with forward slashes.

Packaging a real macOS `.app` bundle should be done on macOS. Tauri desktop builds are platform-native, so a Windows machine should not be treated as the normal way to produce a Mac app bundle.

The current Tauri config uses `src-tauri/icons/icon.ico`, which is Windows-oriented. Development mode may still work, but macOS packaging may require adding proper macOS icon assets such as `.icns` later.

### Linux

Install:

1. **Node.js LTS**
   - Download from <https://nodejs.org/>, or install with your distribution/package manager.

2. **Rust**

   ```sh
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

3. **Tauri Linux system packages**
   - Linux package names vary by distribution.
   - Follow the official Tauri 2 Linux prerequisites for your distro: <https://v2.tauri.app/start/prerequisites/>.

Restart your terminal after installing Rust.

## 2. Verify the Tools

Open a new terminal in the project folder and run:

```powershell
node --version
npm --version
rustc --version
cargo --version
```

Each command should print a version number. If any command is not found, restart the terminal and check that the relevant installer completed successfully.

## 3. Install Project Dependencies

From the repository root:

```powershell
npm install
```

This installs the frontend dependencies and the local Tauri CLI declared in `package.json`.

## 4. Check the Frontend Build

```powershell
npm run build
```

This runs TypeScript and builds the Vite frontend into `dist/`.

The build may warn that the JavaScript chunk is over 500 kB because CodeMirror is bundled directly. That warning is expected for now.

## 5. Check the Rust Backend

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```

The first Rust build can take a long time because Cargo downloads and compiles many crates into `src-tauri/target/`.

On macOS/Linux, use forward slashes:

```sh
cargo check --manifest-path src-tauri/Cargo.toml
```

On macOS/Linux, the matching frontend and Tauri commands are:

```sh
npm install
npm run build
npm run tauri:dev
```

## 6. Run the App in Development

```powershell
npm run tauri:dev
```

This starts Vite and opens the Tauri desktop app. The command stays running while the app is open.

## 7. Build a Debug Desktop App

```powershell
npm run tauri -- build --debug
```

The debug build output is created under `src-tauri/target/debug/`.

On macOS/Linux:

```sh
npm run tauri -- build --debug
```

Build the desktop package on the same operating system you are targeting. For example, build the macOS app on macOS.

## Troubleshooting

### `cargo` or `rustc` is not recognized

Restart the terminal. If it still fails, reinstall Rust from <https://rustup.rs/> and make sure the installer updates your `PATH`.

### Visual Studio or linker errors on Windows

Install or modify **Visual Studio Build Tools** and ensure **Desktop development with C++** is selected. Tauri needs the MSVC compiler and Windows SDK.

### WebView2 errors on Windows

Install the Microsoft Edge WebView2 Evergreen Runtime from <https://developer.microsoft.com/microsoft-edge/webview2/>.

### `npm install` fails

Make sure you installed the Node.js LTS version, then retry:

```powershell
npm install
```

### The first build is slow

That is normal. The first Tauri/Rust build downloads and compiles many dependencies. Later builds are much faster because Cargo reuses compiled artifacts.

## References

- Tauri 2 prerequisites: <https://v2.tauri.app/start/prerequisites/>
- Node.js downloads: <https://nodejs.org/>
- Rust installer: <https://rustup.rs/>
- Visual Studio Build Tools: <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
- WebView2 Runtime: <https://developer.microsoft.com/microsoft-edge/webview2/>
