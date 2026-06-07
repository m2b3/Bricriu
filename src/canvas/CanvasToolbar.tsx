import type { CanvasShape } from './canvasBlock'
import type { DocumentDisplayMode } from './CanvasEditor'

export function CanvasToolbar({
  canAddNodes,
  canCreateCanvas,
  canDelete,
  documentDisplayMode,
  hasDocumentMarkdown,
  inspectorOpen,
  onAddNode,
  onCreateCanvas,
  onDocumentDisplayModeChange,
  onDeleteSelected,
  onToggleInspector
}: {
  canAddNodes: boolean
  canCreateCanvas: boolean
  canDelete: boolean
  documentDisplayMode: DocumentDisplayMode
  hasDocumentMarkdown: boolean
  inspectorOpen: boolean
  onAddNode: (shape: CanvasShape) => void
  onCreateCanvas: () => void
  onDocumentDisplayModeChange: (mode: DocumentDisplayMode) => void
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
      {hasDocumentMarkdown && (
        <label className="canvas-toolbar-select">
          <span>Document</span>
          <select
            value={documentDisplayMode}
            onChange={(event) => onDocumentDisplayModeChange(event.target.value as DocumentDisplayMode)}
          >
            <option value="node">Node</option>
            <option value="panel">Panel</option>
          </select>
        </label>
      )}
      <label className="canvas-toolbar-toggle">
        <input type="checkbox" checked={inspectorOpen} onChange={onToggleInspector} />
        <span>Inspector</span>
      </label>
    </div>
  )
}
