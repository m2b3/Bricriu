# Canvas Roadmap

## Current Baseline

- React Flow is installed through `@xyflow/react`.
- Canvas notes are stored as plain Markdown with a fenced `canvas` YAML block.
- `src/canvas/canvasBlock.ts` parses and rewrites the text block.
- `src/canvas/CanvasEditor.tsx` renders the block as draggable React Flow nodes.
- `src/canvas/CanvasNode.tsx` renders simple box and bubble shapes.
- `src/canvas/canvasMarkdown.ts` renders lightweight Markdown inside canvas nodes.
- Dragging a node updates its `x` and `y` values in the Markdown source.
- Selecting and resizing a node updates its `w` and `h` values in the Markdown source.
- Double-clicking a node opens an inline text editing popover.
- The text editing popover includes a live lightweight Markdown preview.
- Node text supports simple headings, bullet lists, bold, italic, and inline code.
- Node text supports `[[wiki links]]`, aliases, and heading anchors using the same note path matching as the Markdown editor.
- Clickable wiki links inside canvas nodes open the linked note when a match exists.
- Canvas mode includes wheel/trackpad panning and a MiniMap for navigation.
- Canvas mode shows regular Markdown outside the fenced `canvas` block as either a read-only `__document` pseudo node or a read-only side panel.
- The document display mode is switchable from the canvas toolbar and persists locally; the default is the pseudo node.
- Canvas mode can show the read-only Markdown document view even when a file has no canvas block.
- Markdown-only canvas views include an explicit `Create canvas` toolbar action that inserts an empty canvas block while preserving existing Markdown.
- Canvas pan and zoom are persisted as a `viewport` object in the canvas YAML block.
- Reopening a canvas restores the stored viewport instead of always fitting the whole graph.
- Markdown files can switch between `Text` and `Canvas` modes.
- Markdown and Canvas tabs for the same file share live source state.
- Markdown mode hides fenced `canvas` YAML behind a read-only canvas summary widget that shows only each node's text content.
- Markdown mode includes a local `Canvas` display switch for `Summary` versus `Raw` fenced YAML editing.
- Canvas and React Flow are lazy-loaded so normal Markdown editing does not pay the canvas bundle cost.
- Malformed canvas YAML shows a recovery/error state instead of destructively rewriting the note.
- `CanvasToolbar.tsx` supports adding bubbles, adding boxes, deleting the selected node, and toggling the inspector.
- `CanvasInspector.tsx` can edit selected node `id`, `x`, `y`, `w`, `h`, `shape`, and `color`.

## Example Format

````markdown
# Canvas note

```canvas
nodes:
  - id: idea
    x: 120
    y: 90
    w: 230
    h: 120
    shape: bubble
    color: yellow
    text: |
      Main idea
      Drag this bubble anywhere.

  - id: next
    x: 460
    y: 210
    w: 240
    h: 110
    shape: box
    color: blue
    text: |
      Related note
      Positions are saved as text.

edges:
  - from: idea
    to: next
```
````

## Next Components

No active canvas roadmap items. Add new items here after real use exposes the next need.

## Deferred For Now

1. Selection and Keyboard Shortcuts
   - Delete selected nodes or edges with `Delete`.
   - Duplicate nodes.
   - Nudge selected nodes with arrow keys.
   - Add undo-friendly command boundaries.

2. Canvas Creation Flow
   - Add a `New canvas note` action.
   - Create a Markdown file with a starter `canvas` block.
   - Keep normal `New note` unchanged.

3. `canvasCommands.ts`
   - Centralize text-model operations.
   - Add deterministic commands for add, delete, connect, and disconnect.
   - Move existing resize and text update behavior into shared command helpers.
   - Keep YAML rewriting predictable so diffs stay readable.

4. Connect Nodes
   - Add or remove links between nodes.
   - Write links as `edges` entries in the canvas YAML block.
   - Support edge selection and deletion.

5. Canvas Conversion Actions
   - Offer `Convert document to canvas node` when a note has Markdown but no canvas block.
   - Offer `Create canvas block` without modifying existing Markdown.
   - Optionally convert selected Markdown text into a movable canvas node.
   - Keep raw Markdown recoverable after conversion.

6. `CanvasInspector.tsx` Polish
   - Improve interaction polish if needed after more use.

7. Canvas Navigation Polish
   - Consider custom viewport scrollbars if MiniMap plus wheel pan is not enough.
   - Store viewport extents carefully because canvas coordinates can be negative and zoom-dependent.

8. Richer Markdown-Aware Node Text
   - Consider richer Markdown support if the lightweight renderer becomes limiting.

9. Editable Document Panel
   - Later, allow editing the read-only document side panel.
   - Rewrites should affect only Markdown outside the fenced `canvas` block.
   - Avoid this until read-only document context is solid.
