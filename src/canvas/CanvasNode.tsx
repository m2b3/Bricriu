import { NodeResizer, type NodeProps } from '@xyflow/react'
import { renderCanvasMarkdown } from './canvasMarkdown'

export type CanvasNodeData = {
  text: string
  shape: 'box' | 'bubble'
  color: string
  onResize?: (id: string, size: { width: number; height: number }) => void
}

export function CanvasNode({ id, data, selected }: NodeProps): JSX.Element {
  const nodeData = data as CanvasNodeData
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={64}
        color="#365fa0"
        onResizeEnd={(_event, params) => {
          nodeData.onResize?.(id, {
            width: params.width,
            height: params.height
          })
        }}
      />
      <div
        className={[
          'canvas-node',
          `canvas-node-${nodeData.shape}`,
          `canvas-node-${nodeData.color}`,
          selected ? 'selected' : ''
        ].filter(Boolean).join(' ')}
      >
        <div
          className="canvas-node-text"
          dangerouslySetInnerHTML={{ __html: renderCanvasMarkdown(nodeData.text || 'Empty block') }}
        />
      </div>
    </>
  )
}
