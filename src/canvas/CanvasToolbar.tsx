import type { CanvasShape } from './canvasBlock'

export function CanvasToolbar({
  canDelete,
  inspectorOpen,
  onAddNode,
  onDeleteSelected,
  onToggleInspector
}: {
  canDelete: boolean
  inspectorOpen: boolean
  onAddNode: (shape: CanvasShape) => void
  onDeleteSelected: () => void
  onToggleInspector: () => void
}): JSX.Element {
  return (
    <div className="canvas-toolbar">
      <button type="button" onClick={() => onAddNode('bubble')}>
        + Bubble
      </button>
      <button type="button" onClick={() => onAddNode('box')}>
        + Box
      </button>
      <button type="button" className="danger-button" onClick={onDeleteSelected} disabled={!canDelete}>
        Delete
      </button>
      <label className="canvas-toolbar-toggle">
        <input type="checkbox" checked={inspectorOpen} onChange={onToggleInspector} />
        <span>Inspector</span>
      </label>
    </div>
  )
}
