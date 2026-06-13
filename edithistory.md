# Persistent edit history

Normal Markdown editor undo/redo history is currently in-memory only. It survives while a tab stays open in the running app, but it is lost when the tab or app closes.

This can be made persistent by serializing CodeMirror editor state, including history, per open Markdown tab. Store it under a key derived from vault root, file path, and editor mode. On restore, only reuse the saved state if the persisted document still matches the current file body; if the file changed externally or was involved in a save conflict, discard the saved history and create a fresh editor state.

Implementation constraints:

- Start with Markdown editor mode only.
- Keep the existing file body on disk as the source of truth.
- Do not restore undo history across external disk changes.
- Cap, prune, or compress stored history because deep undo stacks can grow quickly.
- Keep session metadata separate from editor-history payloads so normal session restore stays small.
- Track Changes snapshots are separate from CodeMirror undo history and should not be treated as the same feature.
