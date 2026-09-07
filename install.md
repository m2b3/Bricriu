# Installation and Build Guide

Bricriu does not yet publish signed, notarized, broadly tested binaries. The source-build instructions below are therefore the supported way to try it today.

> [!CAUTION]
> Start with copied, disposable notes and keep an independent backup. Installing or successfully building the app does not make it production-safe.

## Prebuilt releases (future)

When release assets exist on GitHub, ordinary users should download the artifact for their operating system and CPU rather than install the development toolchain. A release must clearly state which platforms were actually built and tested.

- **Windows:** use the Windows installer produced by Tauri. Until the project is code-signed, Windows may show an unknown-publisher or reputation warning. Verify that the file came from the repository's own Releases page before running it.
- **macOS:** use a macOS artifact built on macOS for the correct architecture. The project is not currently signed or notarized, so no public macOS artifact should be represented as production-ready.
- **Linux:** use the package matching the distribution when one is provided. Linux packaging and runtime compatibility have not been tested.

Node.js, Rust, and compiler toolchains are build requirements; they should not normally be needed just to run a packaged app. Git, Pandoc, and the Typst CLI remain optional runtime tools for particular features described below.

## Platform support

| Platform | Test status | Source-build prerequisites |
| --- | --- | --- |
| Windows 10/11 | Limited six-month, single-user, Windows-oriented use | Node.js 22.12.0 or newer (current LTS recommended), Rust MSVC toolchain, Visual Studio C++ Build Tools, Windows SDK, WebView2 |
| macOS | **Untested** | Node.js 22.12.0 or newer (current LTS recommended), Rust, Xcode Command Line Tools |
| Linux | **Untested** | Node.js 22.12.0 or newer (current LTS recommended), Rust, and the current Tauri/WebKit system packages for the distribution |

Tauri's native prerequisites change by platform and distribution. Check the [official Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) in addition to this guide.

## Windows prerequisites

1. Install [Node.js](https://nodejs.org/) 22.12.0 or newer (the current LTS is recommended), which includes npm.
2. Install Rust using [rustup](https://rustup.rs/). Use the default stable MSVC toolchain.
3. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). Select **Desktop development with C++**, including MSVC and a Windows SDK.
4. Ensure the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) is installed. It is already present on most current Windows 10/11 systems.
5. Open a new PowerShell window so the updated `PATH` is loaded.

Verify the tools:

```powershell
node --version
npm --version
rustc --version
cargo --version
```

## macOS prerequisites (untested)

Install Xcode Command Line Tools:

```sh
xcode-select --install
```

Install Node.js 22.12.0 or newer (the current LTS is recommended) and Rust through their official installers or a trusted package manager, then verify `node`, `npm`, `rustc`, and `cargo` in a new terminal.

Build macOS bundles on macOS. The current repository has only a Windows-oriented `.ico` application icon and has not been validated for macOS signing, notarization, Intel, or Apple silicon. Expect release-engineering work before distributing a `.app` or `.dmg`.

## Linux prerequisites (untested)

Install Node.js 22.12.0 or newer (the current LTS is recommended) and Rust, then install the packages listed for your distribution in the [Tauri 2 Linux prerequisites](https://v2.tauri.app/start/prerequisites/). These typically include a C toolchain and WebKit/GTK-related development libraries, but package names vary and the official list should be treated as authoritative.

Build Linux packages on the Linux distribution or compatible build environment you intend to support. No Linux distribution, display server, desktop environment, architecture, or package format has been validated for Bricriu yet.

## Build from source

From a cloned copy of the repository:

```sh
npm ci
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Run `npm ci` with Node.js 22.12.0 or newer. It installs the exact dependency tree recorded in `package-lock.json`; no global Markdown-It, KaTeX, Tiptap, or VS Code plugin installation is required.

On Windows, the backslash form also works:

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```

The first Cargo operation may download and compile hundreds of crates and can take a long time. Later builds normally reuse `src-tauri/target/`.

Run the desktop app in development mode:

```sh
npm run tauri:dev
```

This command starts Vite and the desktop shell and remains running until the app closes.

Build release bundles for the current operating system:

```sh
npm run tauri:build
```

On Windows, the repository also provides a convenient executable-only build:

```powershell
.\build-exe.bat
```

Run `npm ci` at least once before this command and again after `package-lock.json` changes; the batch file does not install dependencies. It looks for an installed Node.js 22.12.0-or-newer runtime, including versions installed under NVM for Windows, and uses it only inside the build process. It does not run `nvm use` or persistently change the Node version active in the parent terminal. The current Windows build has been verified with Node.js 22.14.0. The output is `src-tauri\target\release\Bricriu.exe`; because this path uses Tauri's `--no-bundle` option, it does not create an installer.

Build a debug bundle:

```sh
npm run tauri -- build --debug
```

Tauri writes bundle output below `src-tauri/target/release/bundle/` or the corresponding debug target directory. Do not publish an artifact merely because it compiled; test installation, launch, editing copied notes, saving, upgrading, and uninstalling on a clean machine first.

Node.js, npm, Rust, and the native compiler are not required to run a successfully built Bricriu executable. The target machine still needs the WebView2 Runtime on Windows. Existing vaults require no conversion after the Markdown-It 15, KaTeX plugin, or Tiptap 3 dependency upgrades because those are application implementation dependencies rather than vault-installed plugins.

## Optional runtime tools

The basic Markdown editor does not require these tools:

- **Git:** required for app-created checkpoint branches and commits. Install [Git](https://git-scm.com/) and make sure `git --version` works. Opening a non-Git vault is supported.
- **Pandoc and Typst CLI:** both are required by direct Markdown **Export PDF**. Ensure `pandoc --version` and `typst --version` work. The normal preview print dialog is a separate path.
- **Typst CLI:** not required for the primary embedded Typst preview/export path, but keeping a compatible CLI available can help with external Typst workflows.

## Verify before using real notes

1. Open a disposable test vault.
2. Create, edit, manually save, rename, and delete copied notes.
3. Confirm autosave and external-change handling.
4. Close and reopen the app; check restored tabs and file contents.
5. If using Git checkpoints, inspect the created branch and commits with Git outside the app.
6. Restore a deleted test file from your independent backup so you know the recovery path works.

## Troubleshooting

### `cargo`, `rustc`, `node`, or `npm` is not found

Open a new terminal after installation. If the command is still missing, repair the relevant installation and its `PATH` entry.

### Windows linker or compiler errors

Modify Visual Studio Build Tools and confirm that **Desktop development with C++**, MSVC, and a Windows SDK are installed. Rust should be using an `*-pc-windows-msvc` host toolchain.

### WebView2 errors on Windows

Install or repair the WebView2 Evergreen Runtime, then restart the app.

### Linux WebKit/GTK build errors

Revisit the official Tauri prerequisite list for the exact distribution and version. Similar distributions often use different development-package names.

### `npm ci` reports a lockfile mismatch

For release builds, fix and commit the mismatch rather than silently ignoring it. During dependency development, `npm install` may intentionally update `package-lock.json`; review that diff before committing.

### The frontend build warns about large chunks

CodeMirror and the experimental editors add bundle weight. The existing Vite chunk warning is known; it is not itself a build failure.

### Markdown PDF export fails

Check both `pandoc --version` and `typst --version`. Bricriu invokes Pandoc with Typst as the PDF engine for this command.

## Build references

- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri distribution guidance](https://v2.tauri.app/distribute/)
- [Node.js downloads](https://nodejs.org/)
- [Rust installer](https://rustup.rs/)
