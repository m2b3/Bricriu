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
- Canvas mode includes wheel/trackpad panning and a MiniMap for navigation.
- Markdown files can switch between `Text` and `Canvas` modes.
- Markdown and Canvas tabs for the same file share live source state.
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

1. `CanvasToolbar.tsx`
   - Add or remove links between nodes.

2. `CanvasInspector.tsx`
   - Improve interaction polish if needed after more use.

3. `canvasCommands.ts`
   - Centralize text-model operations.
   - Add deterministic commands for add, delete, connect, and disconnect.
   - Move existing resize and text update behavior into shared command helpers.
   - Keep YAML rewriting predictable so diffs stay readable.

4. Viewport Persistence
   - Store pan and zoom in the canvas block.
   - Restore the previous canvas viewport when reopening a note.
   - Keep `fitView` only for first open or reset.

5. Markdown-Aware Node Text
   - Support wiki links inside node text.
   - Optionally open linked notes from node text.
   - Consider richer Markdown support if the lightweight renderer becomes limiting.

6. Markdown Context in Canvas Mode
   - Render regular Markdown outside the fenced `canvas` block as a derived pseudo node.
   - Keep the pseudo node read-only at first.
   - Do not write the pseudo node into the file by default.
   - Use a stable id such as `__document`.
   - Position it near the top-left of the canvas, for example `x: 40`, `y: 40`.
   - Show the pseudo node even when a file has no canvas block.

7. Canvas Conversion Actions
   - Offer `Convert document to canvas node` when a note has Markdown but no canvas block.
   - Offer `Create canvas block` without modifying existing Markdown.
   - Optionally convert selected Markdown text into a movable canvas node.
   - Keep raw Markdown recoverable after conversion.

8. Editable Document Node
    - Later, allow editing the pseudo document node.
    - Rewrites should affect only Markdown outside the fenced `canvas` block.
    - Avoid this until read-only document context is solid.

9. Markdown Side Panel Alternative
    - Consider showing regular Markdown in a pinned side panel instead of a pseudo canvas node.
    - This may be better for long notes where a large document node would crowd the canvas.
    - Keep the pseudo-node approach as the simpler first version.

10. Canvas Navigation Polish
    - Consider custom viewport scrollbars if MiniMap plus wheel pan is not enough.
    - Store viewport extents carefully because canvas coordinates can be negative and zoom-dependent.

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
