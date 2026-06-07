# Canvas Roadmap

## Current Baseline

- React Flow is installed through `@xyflow/react`.
- Canvas notes are stored as plain Markdown with a fenced `canvas` YAML block.
- `src/canvas/canvasBlock.ts` parses and rewrites the text block.
- `src/canvas/CanvasEditor.tsx` renders the block as draggable React Flow nodes.
- `src/canvas/CanvasNode.tsx` renders simple box and bubble shapes.
- Dragging a node updates its `x` and `y` values in the Markdown source.
- Double-clicking a node edits its text.
- Markdown files can switch between `Text` and `Canvas` modes.

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
   - Add node.
   - Delete selected node.
   - Change selected node shape.
   - Change selected node color.
   - Add or remove links between nodes.

2. `CanvasInspector.tsx`
   - Edit selected node `id`.
   - Edit text without using `window.prompt`.
   - Edit `x`, `y`, `w`, and `h` directly.
   - Edit `shape` and `color` through controlled UI.

3. `canvasCommands.ts`
   - Centralize text-model operations.
   - Add deterministic commands for add, delete, resize, connect, disconnect, and update text.
   - Keep YAML rewriting predictable so diffs stay readable.

4. Inline Text Editing
   - Replace double-click prompt with an inline textarea or lightweight popover.
   - Save edits back into the fenced YAML block.
   - Preserve multiline text.

5. Viewport Persistence
   - Store pan and zoom in the canvas block.
   - Restore the previous canvas viewport when reopening a note.
   - Keep `fitView` only for first open or reset.

6. Selection and Keyboard Shortcuts
   - Delete selected nodes or edges with `Delete`.
   - Duplicate nodes.
   - Nudge selected nodes with arrow keys.
   - Add undo-friendly command boundaries.

7. Code Splitting
   - Lazy-load `@xyflow/react` and canvas components.
   - Keep normal Markdown editing from paying the React Flow bundle cost.
   - Recheck Vite bundle output after the split.

8. Markdown-Aware Node Text
   - Render simple Markdown inside nodes.
   - Support wiki links inside node text.
   - Optionally open linked notes from node text.

9. Canvas Creation Flow
   - Add a `New canvas note` action.
   - Create a Markdown file with a starter `canvas` block.
   - Keep normal `New note` unchanged.

10. Validation and Recovery
    - Show useful errors for malformed canvas YAML.
    - Offer a raw Text-mode escape hatch.
    - Avoid destructive rewrites when parsing fails.
