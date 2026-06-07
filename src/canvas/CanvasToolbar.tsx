import type { CanvasShape } from './canvasBlock'

export function CanvasToolbar({
  canAddNodes,
  canCreateCanvas,
  canDelete,
  inspectorOpen,
  onAddNode,
  onCreateCanvas,
  onDeleteSelected,
  onToggleInspector
}: {
  canAddNodes: boolean
  canCreateCanvas: boolean
  canDelete: boolean
  inspectorOpen: boolean
  onAddNode: (shape: CanvasShape) => void
  onCreateCanvas: () => void
  onDeleteSelected: () => void
  onToggleInspector: () => void
}): JSX.Element {
  return (
    <div className="canvas-toolbar">
      {canCreateCanvas && (
        <button type="button" onClick={onCreateCanvas}>
          Create canvas
        </button>
      )}
      <button type="button" onClick={() => onAddNode('bubble')} disabled={!canAddNodes}>
        + Bubble
      </button>
      <button type="button" onClick={() => onAddNode('box')} disabled={!canAddNodes}>
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
