# Bricriu Plan

## Core Direction

Build a local-first Markdown notes app:

- Tauri/Rust backend
- TypeScript/React frontend
- CodeMirror editor
- Markdown files as source of truth
- Left pane: file tree, filename search, content search
- Right pane: tabbed CodeMirror editor

## Ruled Out For Now

- Electron
- Tiptap / rich text editor
- Typst as the default note format
- Quarto as the core viewer/editor
- Tantivy or any persistent full-text index
- SQLite FTS
- External browser UI
- Auto-committing every autosave
- Git as immediate editor undo

## Current Search Position

Use non-indexed search.

Current approach:

- Rust backend
- `ignore` crate for fast, ignore-aware walking
- embedded `grep-searcher` / `grep-regex` matching
- no persistent index
- no external `rg.exe`

## Git Model

Use an `inuse` branch for app work.

On opening a Git vault:

- if already on `inuse`, stay there
- if `inuse` exists and current branch is clean, switch to `inuse`
- if no `inuse` exists and current branch is clean, create it
- if current branch is dirty, ask to create a checkpoint commit before switching

Editing model:

- autosave writes files
- CodeMirror undo remains in memory per tab
- saving does not clear undo
- Git checkpointing is durable history, not editor undo

Checkpoint model:

- checkpoint commits only on `inuse`
- do not commit every autosave
- support checkpoint every few minutes, on app close, and manually
- later merge to main with squash merge when desired

## Completed

1. Core Tauri app
   - Rust/Tauri backend
   - React/TypeScript frontend
   - CodeMirror Markdown editor
   - executable-only build path with `tauri build --no-bundle`

2. Vault browsing
   - open vault by path
   - Markdown file tree
   - filename filter
   - current vault path stored in local storage

3. Editing
   - tabbed editor
   - per-tab dirty state
   - save button and `Ctrl+S`
   - per-tab CodeMirror undo history
   - save does not clear undo
   - close-tab shortcut with `Ctrl+W`

4. Search
   - content search across current vault
   - optional checkbox to restrict content search to filename-filtered files
   - `ignore` crate for fast, ignore-aware walking
   - embedded `grep-searcher` / `grep-regex` content matching
   - no persistent index

5. Initial Git `inuse` flow
   - detect Git repo on vault open
   - create/switch to `inuse` when clean
   - prompt for checkpoint before switching if dirty
   - Git subprocesses hidden on Windows
   - Git status badge in the sidebar

6. Basic file operations
   - create note
   - rename note
   - delete note
   - create folder
   - rename folder
   - delete folder

7. Session restore
   - remember last vault
   - remember open tabs
   - remember active tab
   - remember expanded folders
   - remember filename filter and content-filter checkbox

8. Filesystem watcher
   - watches the opened vault recursively
   - refreshes the tree after external changes
   - marks open tabs as changed/deleted when touched outside the app

9. Autosave and checkpointing
   - autosaves dirty tabs after 5 seconds
   - preserves CodeMirror undo
   - keeps manual Save
   - manual Checkpoint button for Git `inuse`
   - periodic checkpoint after 3 minutes when touched files exist
   - app-close checkpoint saves dirty tabs and commits touched files before exit
   - startup `profile.json` controls autosave/checkpoint intervals

10. Markdown niceties
   - wiki link navigation
   - callout highlighting/rendering
   - wiki link filename completion
   - inline and block math preview with KaTeX

11. Preview pane
   - optional split view
   - Markdown to HTML
   - callouts and KaTeX rendering
   - wiki links open notes from preview

12. Backlinks panel
   - scans Markdown files for wiki links to the current note
   - shows source note, line number, and matching line text
   - opens backlink source at the matching line

13. Search result highlighting
   - clicking a content-search result opens the note at the match
   - highlights visible occurrences of the active search term
   - emphasizes the clicked match

## Not Done Yet

- Nothing from the original MVP list is currently pending.

## Future To-Do

1. Create missing wiki notes
   - allow `[[Missing Note]]` to create a matching `.md` file
   - decide default folder behavior for new wiki-created notes

2. Better duplicate wiki-link handling
   - handle same filename in different folders
   - show disambiguation in completion and navigation

3. Settings UI
   - edit `profile.json` from inside the app
   - expose autosave delay and checkpoint interval

4. App menu and command palette
   - quick open note
   - create note/folder
   - save/checkpoint
   - toggle preview

5. Recent vaults
   - remember multiple vaults
   - quick switch between vaults

6. Build and bundle optimization
   - split CodeMirror, KaTeX, and preview renderer chunks
   - consider lazy-loading preview/math code if startup feels slow

7. More robust preview parsing
   - nested callouts
   - task lists
   - footnotes
   - tables
   - stronger Markdown extension tests

8. Evaluate `tiptap-track`
   - investigate whether it can add useful change tracking/review workflows
   - allow opening a separate track-changes mode that is more paragraph/block based
   - keep CodeMirror as the primary Markdown editor unless there is a clear reason to add a Tiptap-based mode
   - avoid risking Markdown round-trip fidelity

## Design Bias

- Keep Markdown source visible and stable.
- Prefer simple, inspectable behavior over hidden magic.
- Keep Rust responsible for filesystem, Git, and search.
- Keep TypeScript responsible for UI and editor behavior.
- Avoid adding infrastructure until the simple version is proven insufficient.
