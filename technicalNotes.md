# Technical Notes

## Editor State, React State, And Display State

The editor should be treated as the source of truth while the user is actively editing.

Recommended state split:

```text
editorBody   = owned by CodeMirror/Tiptap while editing
appBody      = React mirror used for save, dirty state, session restore, preview input
displayState = React-derived preview/math/review/search UI
```

Rules:

- Editor writes `appBody`.
- React display code reads `appBody`.
- React display code writes only `displayState`.
- React should not write ordinary editor-originated `appBody` updates back into the editor.
- React should replace the editor body only on authoritative events:
  - opening a different file
  - reloading from disk
  - accept/reject operations that intentionally edit content
  - applying an external merge result
  - running an explicit programmatic command

This avoids treating both React and the editor as simultaneous owners of the same live document.

## Why Serial JavaScript Is Not Enough

JavaScript runs one synchronous call stack at a time, but editor/render pipelines are not guaranteed to finish all work for one document state before newer document states arrive.

Example:

```text
t0: body = 10
t1: start math render for body 10
t2: render uses setTimeout / Promise / worker / requestAnimationFrame / React effect
t3: user types, body = 11
t4: start math render for body 11
t5: body 11 render finishes quickly, display = 11
t6: older body 10 render finishes late, display = 10  <-- stale overwrite
```

The issue is not two synchronous functions literally running at the same time. The issue is stale delayed work applying after newer state exists.

This can happen with:

- async KaTeX/MathJax rendering
- web workers
- debounced preview
- `requestAnimationFrame`
- image/media loading
- parsing large documents
- React effects that run after commit
- timers
- fetch/file reads
- Promise chains

If rendering is purely synchronous and immediate, older state finishes before newer state starts. Once any delayed work exists, older results can arrive after newer results.

## Versioning

Every editor-originated document update should have a monotonically increasing version.

Pattern:

```text
Editor emits body version 12
React mirrors body version 12
Preview/math/review work captures version 12
User edits again; current version becomes 13
Version 12 work finishes
Before applying result, compare 12 to current 13
Discard stale result
```

Code shape:

```ts
if (renderedVersion !== currentVersion) return
setDisplayState(result)
```

Versioning prevents stale display work from overwriting newer display state.

## Echo Control

Echo control prevents editor-originated updates from bouncing back into the editor as if they were external authoritative updates.

Pattern:

```text
editor emits body B
React stores body B
React prop update reaches editor
editor recognizes this as its own echo
editor does not replace its document
```

The existing CodeMirror integration already has part of this pattern through:

```ts
rememberEditorEcho(...)
consumeEditorEcho(...)
programmaticChange
```

That protects ordinary editor typing from being reapplied as external document replacement.

## Safe Mental Model

Use this ownership model:

```text
Editor document = source of truth while editing
React app body  = mirror/snapshot for save, dirty state, session, preview
Display state   = derived, disposable, versioned UI state
```

Display state should never be allowed to mutate the live editor document directly.

Any delayed display work must prove it still belongs to the current document version before applying.

