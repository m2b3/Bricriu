import { NodeResizer, type NodeProps } from '@xyflow/react'
import { renderCanvasMarkdown } from './canvasMarkdown'

export type CanvasNodeData = {
  text: string
  shape: 'box' | 'bubble'
  color: string
  readonly?: boolean
  notePaths?: string[]
  sourcePath?: string | null
  onResize?: (id: string, size: { width: number; height: number }) => void
  onOpenWikiLink?: (path: string) => void
}

export function CanvasNode({ id, data, selected }: NodeProps): JSX.Element {
  const nodeData = data as CanvasNodeData
  return (
    <>
      <NodeResizer
        isVisible={selected && !nodeData.readonly}
        minWidth={120}
        minHeight={64}
        color="var(--accent-2)"
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
          nodeData.readonly ? 'canvas-node-readonly' : '',
          selected ? 'selected' : ''
        ].filter(Boolean).join(' ')}
      >
        <div
          className="canvas-node-text"
          onClick={(event) => {
            const target = event.target instanceof HTMLElement
              ? event.target.closest('a.canvas-wiki, a.canvas-heading-anchor') as HTMLAnchorElement | null
              : null
            const href = target?.getAttribute('href')
            if (!href) return

            if (href.startsWith('notesproject-wiki:')) {
              event.preventDefault()
              event.stopPropagation()
              nodeData.onOpenWikiLink?.(decodeURIComponent(href.slice('notesproject-wiki:'.length)))
            } else if (href.startsWith('#') && nodeData.sourcePath) {
              event.preventDefault()
              event.stopPropagation()
              nodeData.onOpenWikiLink?.(`${nodeData.sourcePath}${href}`)
            }
          }}
          dangerouslySetInnerHTML={{ __html: renderCanvasMarkdown(nodeData.text || 'Empty block', nodeData.notePaths ?? [], nodeData.sourcePath) }}
        />
      </div>
    </>
  )
}
