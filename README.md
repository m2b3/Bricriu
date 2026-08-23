# NotesProject

NotesProject is a local-first desktop notes app for Markdown and Typst files. It opens a folder as a vault, shows the files in a tree, and gives you a fast editor with search, preview, backlinks, autosave, and optional Git checkpoints.

The app is built with Tauri 2, React, TypeScript, Rust, and CodeMirror 6. Your notes remain ordinary files on disk.

## What It Does

- Opens any local folder as a notes vault.
- Reads and writes plain Markdown files (`.md`, `.markdown`) and Typst files (`.typ`).
- Shows a folder/file tree with create, rename, and delete actions.
- Supports multiple open tabs.
- Provides a CodeMirror editor with Markdown and Typst syntax support.
- Saves manually with `Ctrl+S` or the Save button.
- Autosaves dirty notes after a configurable delay.
- Searches note content across the current vault.
- Filters the file tree by filename or path.
- Renders a split Markdown preview pane.
- Renders KaTeX math previews for inline and block math.
- Highlights and opens Obsidian-style wiki links such as `[[Project Ideas]]`.
- Shows backlinks for notes linked with wiki links.
- Watches the vault for external file changes.
- Restores the last vault, open tabs, active tab, expanded folders, and search settings.
- Provides a Markdown track-changes mode backed by sidecar state files.
- Uses a Git `inuse` branch and checkpoint commits when the vault is a Git repository.

## Current Status

This is an early desktop MVP. The core workflow is usable, but the project is still intentionally small and in active development. Expect rough edges around packaging, icons, track-changes workflows, and Typst preview behavior.

## Requirements

- Node.js and npm.
- Rust and Cargo.
- Platform dependencies required by Tauri 2 for your operating system.
- Git, if you want vault checkpointing.
- Typst CLI, optionally, for Typst preview fallback paths.

## Install For Development

Clone the repository and install JavaScript dependencies:

```powershell
git clone <repo-url>
cd notesproject
npm install
```

Run the desktop app in development mode:

```powershell
npm run tauri:dev
```

This starts Vite and then launches the Tauri desktop shell. The first run can take a while because Rust dependencies need to be downloaded and compiled.

## Build

Build the frontend:

```powershell
npm run build
```

Check the Rust backend:

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```

Build a packaged Tauri app:

```powershell
npm run tauri:build
```

For a debug desktop bundle:

```powershell
npm run tauri -- build --debug
```

Build outputs are produced by Tauri under `src-tauri/target/`.

## How To Use

Start the app and enter a folder path in the left pane. That folder becomes the vault root. NotesProject only works on paths inside the opened vault.

Use the left pane to:

- create notes and folders
- rename or delete files and folders
- filter files by name
- search note content
- open Markdown files in normal editor mode
- open Markdown files in Track mode

Use the editor pane to:

- edit Markdown or Typst source
- save with `Ctrl+S`
- switch tabs with `Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+PageUp`, or `Ctrl+PageDown`
- close the current tab with `Ctrl+W`
- toggle Markdown preview
- toggle backlinks

## Markdown Features

Wiki links:

```md
[[Project Ideas]]
[[folder/Project Ideas]]
[[Project Ideas|custom label]]
[[Project Ideas#section]]
```

Callouts:

```md
> [!NOTE]
> This is a note.

> [!WARNING]
> This is important.
```

Math:

```md
Inline math: $x^2 + y^2 = z^2$

$$
E = mc^2
$$
```

The preview pane renders Markdown, wiki links, callouts, and KaTeX math. Raw HTML in notes is escaped.

## Typst Files

Typst files (`.typ`) open in the editor with Typst syntax support. The app includes preview plumbing for SVG and HTML output through the Rust backend. If embedded preview fails, the backend can fall back to invoking the `typst` executable when it is available on `PATH`.

## Git Checkpoints

When the opened vault is a Git repository, NotesProject uses an `inuse` branch for active editing:

- If the vault is already on `inuse`, the app keeps using it.
- If the vault is clean and `inuse` exists, the app switches to it.
- If the vault is clean and `inuse` does not exist, the app creates it.
- If the vault is dirty on another branch, the app asks before checkpointing and switching.

Autosave writes files to disk. Checkpoints are Git commits created separately, either manually or periodically for touched files.

## Private `.h` Notes

A vault can have an encrypted private area:

1. Create a `.h/` folder in the vault and put private Markdown or Typst files in it.
2. Open the vault in NotesProject and enter a password in the masked unlock dialog.
3. NotesProject leaves a new `.h/` untouched on open. The first checkpoint or commit creates its AES-256 encrypted `.h.zip` and `.horig/` baseline. If `.h.zip` already exists, opening the vault decrypts it.
4. Commit `.h.zip`. The plaintext `.h/` and comparison baseline `.horig/` are added to the repository's local `.git/info/exclude`.

`.h/` is relative to the folder opened as the vault, not necessarily the Git worktree root. For example, if `repo/notes` is the vault inside the parent `repo` Git repository, use `repo/notes/.h`; Git tracks the encrypted archive as `notes/.h.zip`.

Passwords are stored as plaintext in the local, git-ignored `private-vaults.json` settings file. `defaultPassword` applies when a vault has no path-specific entry; entries under `vaults` are keyed by canonical vault path and take precedence. Do not share that file, and back up the password separately: the archive cannot be recovered without it.

```json
{
  "defaultPassword": "change-this-local-password",
  "vaults": {
    "c:/path/to/vault": {
      "password": "optional-vault-specific-password"
    }
  }
}
```

Before every NotesProject checkpoint, `.h/` is compared byte-for-byte with `.horig/`. If they differ, a new encrypted archive atomically replaces `.h.zip` and the baseline is refreshed. Local `pre-commit` and `pre-push` hooks provide the same check for command-line Git. Existing hooks are preserved and run first. A pre-push that discovers new private changes refreshes the archive and stops the push so `.h.zip` can be committed.

Git hooks can be bypassed with `--no-verify`. If the repository already configures `core.hooksPath`, NotesProject does not modify that custom location and reports a warning; add equivalent synchronization there before relying on command-line commits or pushes.

On open, NotesProject shows the ordinary vault first and safely extracts an existing `.h.zip` on a background worker. Until that finishes, `.h/` is omitted from the tree and content search, private-note access is rejected, and checkpoints are paused. Restored public tabs open immediately; restored `.h/` tabs are added when the private folder is ready. A new `.h/` with no archive is not zipped or extracted until the first checkpoint or commit. If a crash left `.h/` ahead of `.horig/`, it archives those changes before extracting, rather than silently overwriting them. Password-protected ZIPs whose contents are rooted either directly in the archive or under `.h/` are accepted; archives rewritten by NotesProject use AES-256.

Security boundaries:

- `.h/`, `.horig/`, the password file, editor memory, filesystem caches, backups, and swap are plaintext while in use.
- ZIP entry names are visible without the password even though file contents are encrypted.
- A weak password remains vulnerable to offline guessing.
- This protects the committed archive; it is not full-disk encryption or a hardened secret manager.

## Configuration

Runtime profile settings are stored in `profile.json`:

```json
{
  "autosaveDelayMs": 5000,
  "checkpointIntervalMs": 180000,
  "typstPreviewDebounceMs": 250,
  "closeMarkdownBeforeTrack": true
}
```

The backend normalizes these values into safe ranges when loading the profile.

## Project Structure

```text
src/
  main.tsx              React app, editor UI, preview, tabs, search UI
  styles.css            Application styles
  track/                Track-changes editor support

src-tauri/
  src/main.rs           Tauri commands, filesystem access, search, Git, Typst
  src/private_vault.rs  Encrypted .h lifecycle and Git-hook support
  tauri.conf.json       Tauri app configuration
  Cargo.toml            Rust dependencies

vendor/
  codemirror-lang-typst Local Typst CodeMirror language package
```

The `zennotes/` folder, if present, is reference material only. This app does not use Electron or the reference project's architecture.

## Safety Model

The frontend and backend exchange vault-relative paths. The Rust backend resolves note paths under the opened vault root and rejects paths that escape the vault. File operations are limited to note and folder actions inside the selected vault.

## Known Limits

- Search is intentionally non-indexed.
- Backlinks currently detect wiki links, not normal Markdown links.
- Missing wiki links are not created automatically.
- The production frontend bundle currently includes CodeMirror directly and may exceed Vite's default chunk-size warning.
- The app icon is a placeholder.
- Track Changes is Markdown-only.
- Typst preview behavior is still evolving.

## License

No license file is currently included. Add one before publishing if you want others to use, modify, or redistribute the project.
