# AGENTS.md

## Project

This workspace contains a new Tauri + React + CodeMirror Markdown notes app at the repository root.

Historical design notes:

- `lessonsFromZen.md` records high-level observations from the third-party ZenNotes project.
- The ZenNotes source tree is not part of this branch and is not a Bricriu dependency.

## Current App Shape

Frontend:

- `src/main.tsx`
- `src/styles.css`
- Vite + React + TypeScript
- CodeMirror 6 Markdown editor

Backend:

- `src-tauri/src/main.rs`
- Tauri 2
- Rust commands for:
  - `open_vault`
  - `list_tree`
  - `read_note`
  - `save_note`
  - `search_content`

The app is intentionally small for now:

- Left pane: vault path opener, filename filter, content search, file tree.
- Right pane: CodeMirror Markdown editor.
- Save: button and `Ctrl+S`.
- Later features: autosave, watcher, Git integration, better search indexing, file dialog plugin.

## Build Commands

Install dependencies:

```powershell
npm install
```

Frontend build:

```powershell
npm run build
```

Rust check:

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```

Tauri dev:

```powershell
npm run tauri:dev
```

Tauri debug build:

```powershell
npm run tauri -- build --debug
```

## Known Notes

- First Tauri/Rust build is heavy. It downloads and compiles hundreds of crates under `src-tauri/target/`.
- `npm run tauri:dev` is long-running by design because it starts Vite plus the desktop app.
- The current icon is a generated placeholder at `src-tauri/icons/icon.ico`.
- The frontend production build currently warns that the JS chunk is over 500 kB. That is expected because CodeMirror is bundled directly; optimize later with chunk splitting if needed.

## Engineering Rules

- Keep paths vault-relative across the frontend/backend boundary.
- Backend path inputs must be resolved safely under the vault root.
- Do not add Electron dependencies.
- Do not import third-party source code without reviewing its licence and preserving required notices.
- Prefer Rust for filesystem/search behavior and TypeScript for UI/editor behavior.
- Keep the MVP narrow: file tree, fast search, editor, save.

