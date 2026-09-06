# Lessons from ZenNotes

Reference project studied: [ZenNotes](https://github.com/ZenNotes/zennotes), copyright (c) 2026 Adib Hanna and ZenNotes contributors, licensed under the MIT License.

This document records general architectural and product observations. The ZenNotes source tree is not included in this branch and is not a Bricriu dependency. The examples below are Bricriu design sketches rather than imported ZenNotes source code.

Goal for Bricriu: learn from useful note, editor, and search ideas while implementing them independently. The target architecture remains a Tauri and Rust backend with a TypeScript and CodeMirror frontend, rather than ZenNotes' Electron and Go architecture.

## High-Level Takeaways

- Studying ZenNotes reinforced the choice of CodeMirror 6 as the editor layer for Markdown-first notes. It keeps source Markdown honest, supports fast editing, and can be extended with Markdown syntax, search, completions, live preview decorations, folding, Vim mode, and custom widgets.
- The Electron shell should not be carried forward. Its useful boundaries are still relevant: renderer owns UI/editor state, native side owns filesystem, search, watchers, and vault safety.
- For our MVP, avoid ZenNotes' feature breadth. Start with a plain two-pane app: left vault tree/search, right CodeMirror editor.
- Search should be a Rust-native responsibility from day one. ZenNotes has to bridge from Electron/Node to `rg`/`fzf`/builtin search; in Tauri we can implement the same idea directly and cleaner.

## Useful Dependencies and Frontend Patterns

CodeMirror packages worth starting with:

- `@codemirror/state`
- `@codemirror/view`
- `@codemirror/commands`
- `@codemirror/lang-markdown`
- `@codemirror/language`
- `@codemirror/search`
- `@codemirror/autocomplete`

Optional later:

- `@replit/codemirror-vim` for Vim mode
- language packages for fenced-code highlighting
- custom Markdown decorations for wiki links, callouts, tasks, image embeds

ZenNotes' editor setup has a good shape:

- Create the `EditorState` with a fixed extension list.
- Use `Compartment`s for settings that can toggle at runtime, such as Vim mode, line numbers, word wrap, Markdown/live-preview behavior.
- Use `EditorView.updateListener` to push document changes into app state.
- Mark programmatic document replacement with an `Annotation` so note switching or external reloads do not look like user edits.
- On file switch, replace the whole CodeMirror doc and reset selection/scroll deliberately.

For our MVP, use a much smaller extension set:

```ts
[
  history(),
  drawSelection(),
  highlightActiveLine(),
  markdown(),
  EditorView.lineWrapping,
  keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap])
]
```

## Editor Lessons

- Use CodeMirror as a controlled editor surface, not as the source of truth. The file content in app state/Rust is the source of truth.
- Keep the editor mounted and swap document content when selecting another note. This avoids UI churn.
- Use an explicit `activePath` or `viewPathRef` so edits always update the intended note.
- For large files, ZenNotes defers expensive rich Markdown/live preview behavior. We should also keep the MVP editor plain and fast before adding decorations.
- Do not start with live-preview hiding of Markdown syntax. It is impressive but adds a lot of complexity. Plain Markdown editor first.

## Left Pane Lessons

ZenNotes' sidebar is too feature-heavy for our first version, but these ideas transfer:

- Keep file/folder rows fixed-height for scan speed and keyboard navigation.
- Store paths as vault-relative POSIX paths in the frontend, even on Windows.
- Keep folder expansion/collapse state in frontend state, keyed by relative path.
- Separate filename filtering from content search. They feel similar in UI but use different engines and latency expectations.
- For large vaults, progressively render or virtualize the list later. Do not render thousands of rows with expensive React children if avoidable.

For our MVP left pane:

- Top: two inputs: `File name` and `Content`.
- Body: tree of folders/files filtered by filename query.
- Content search results can replace or sit above the tree while the content query is active.
- Clicking a file calls Rust `read_note(path)` and loads CodeMirror.

## Rust/Tauri Backend Lessons

ZenNotes highlights general vault-safety principles worth implementing independently:

- All user-facing file paths should be vault-relative.
- Every backend command that receives a path must resolve it against the vault root and reject path traversal.
- Hidden/system directories should be skipped during scans.
- Use `.md` filtering early during directory walking.
- Normalize relative paths to forward slashes for frontend state.
- Invalidate metadata/search caches when files are saved, renamed, moved, or deleted.

The Rust backend should expose a small command surface first:

```rust
open_vault(path) -> VaultInfo
list_tree() -> Vec<TreeEntry>
read_note(path) -> NoteContent
save_note(path, body) -> NoteMeta
search_file_names(query, limit) -> Vec<FileMatch>
search_content(query, limit) -> Vec<ContentMatch>
```

Later:

```rust
watch_vault() -> events
create_note(path)
rename_note(old_path, new_path)
delete_note(path)
git_status()
git_commit()
```

## Fast Search Lessons

ZenNotes supports several search backends: builtin scan, ripgrep, and fzf. For our Rust app:

- Use Rust-native search first instead of shelling out for every query.
- For filename search, keep an in-memory index of file paths and lowercase names.
- For content search, start with a fast recursive scan using Rust crates and cache results where useful.
- Consider `ignore` or `walkdir` for traversal, `grep-searcher`/`grep-regex` for ripgrep-like search, and `rayon` for parallelism if needed.
- Use `ripgrep` as inspiration, not necessarily as an external dependency.

Important search behavior from ZenNotes:

- Cache candidate lines briefly, but invalidate when the vault changes.
- Return path, title, line number, excerpt/line text, and byte/character offset if possible.
- Rank content matches using body score plus small title/path boosts.
- Collapse whitespace in result snippets.
- Limit results aggressively, such as 50-100 rows.

For MVP:

- Filename search should be instant and client-side from `list_tree`/file index.
- Content search should be Rust-side, debounced in the UI, and limited.
- Do not build Tantivy/SQLite FTS yet unless plain Rust search is too slow.

## Data Model

Keep the first data model simple:

```ts
type TreeEntry = {
  path: string
  name: string
  kind: "file" | "dir"
  children?: TreeEntry[]
  updatedAt?: number
  size?: number
}

type NoteContent = {
  path: string
  body: string
  updatedAt: number
  size: number
}

type ContentMatch = {
  path: string
  lineNumber: number
  lineText: string
  offset?: number
}
```

ZenNotes has richer concepts like inbox/archive/trash/quick folders, assets, comments, panes, tabs, tags, backlinks, tasks, and remote workspaces. These are not MVP requirements.

## Features Outside the Initial Scope

- Electron main/preload/renderer bridge.
- Go server/web stack.
- Multi-pane/tab workspace restore.
- Vim ex command system.
- Comments, tasks, archive/trash/quick-note systems.
- Asset embeds/PDF panes.
- Rich live preview widgets.
- Remote workspace support.
- Large settings system.

These may be useful references later, but implementing them now would bury the simple viewer/editor.

## Recommended MVP Build Plan

1. Scaffold Tauri + Vite + React + TypeScript.
2. Add CodeMirror 6 Markdown editor in the right pane.
3. Add Rust vault commands: open/list/read/save/search.
4. Build a fixed two-pane layout.
5. Implement left-pane filename filtering from in-memory file tree.
6. Implement debounced content search via Rust command.
7. Wire file selection to CodeMirror.
8. Add explicit save button or `Ctrl+S`; autosave later.
9. Add filesystem watcher after the core loop is stable.
10. Add Git integration only after reads/writes/search are reliable.

## Design Bias for Our App

The app should feel closer to a fast local editor than a full productivity suite:

- No landing page.
- No marketing chrome.
- Dense left pane.
- Large quiet editor.
- Keyboard-first, but not Vim-first initially.
- Markdown source visible and stable.
- Rust does file/search work; TypeScript does UI/editor work.

