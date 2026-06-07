import { useCallback, useEffect, useMemo, useState } from 'react'
import '@xyflow/react/dist/style.css'
import {
  Background,
  Controls,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
  type NodeTypes,
  type ReactFlowInstance
} from '@xyflow/react'
import { CanvasNode, type CanvasNodeData } from './CanvasNode'
import {
  insertExampleCanvasBlock,
  parseCanvasBlock,
  updateCanvasNodePosition,
  updateCanvasNodeSize,
  updateCanvasNodeText
} from './canvasBlock'
import { renderCanvasMarkdown } from './canvasMarkdown'

const nodeTypes: NodeTypes = {
  canvasNode: CanvasNode
}

type EditingNode = {
  id: string
  text: string
  screenX: number
  screenY: number
}

export function CanvasEditor({
  tabId,
  body,
  disabled,
  onChange
}: {
  tabId: string | null
  body: string
  disabled: boolean
  onChange: (id: string, body: string) => void
}): JSX.Element {
  const parsed = useMemo(() => parseCanvasBlock(body), [body])
  const [nodes, setNodes] = useState<Array<Node<CanvasNodeData>>>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [flow, setFlow] = useState<ReactFlowInstance<Node<CanvasNodeData>, Edge> | null>(null)
  const [editingNode, setEditingNode] = useState<EditingNode | null>(null)

  const onResizeNode = useCallback((id: string, size: { width: number; height: number }) => {
    if (!tabId || disabled) return
    onChange(tabId, updateCanvasNodeSize(body, id, size))
  }, [body, disabled, onChange, tabId])

  useEffect(() => {
    if (!parsed.ok) {
      setNodes([])
      setEdges([])
      return
    }
    setNodes(parsed.document.nodes.map((node) => ({
      id: node.id,
      type: 'canvasNode',
      position: { x: node.x, y: node.y },
      style: {
        width: node.w,
        height: node.h
      },
      data: {
        text: node.text,
        shape: node.shape ?? 'box',
        color: node.color ?? 'neutral',
        onResize: onResizeNode
      }
    })))
    setEdges(parsed.document.edges.map((edge, index) => ({
      id: `${edge.from}:${edge.to}:${index}`,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      animated: false
    })))
  }, [onResizeNode, parsed])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current) as Array<Node<CanvasNodeData>>)
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current))
  }, [])

  const onNodeDragStop: OnNodeDrag<Node<CanvasNodeData>> = useCallback((_event, node) => {
    if (!tabId || disabled) return
    onChange(tabId, updateCanvasNodePosition(body, node.id, node.position))
  }, [body, disabled, onChange, tabId])

  const onNodeDoubleClick: NodeMouseHandler = useCallback((event, node) => {
    if (!tabId || disabled) return
    event.preventDefault()
    const screenPosition = flow?.flowToScreenPosition(node.position)
    setEditingNode({
      id: node.id,
      text: typeof node.data.text === 'string' ? node.data.text : '',
      screenX: screenPosition?.x ?? event.clientX,
      screenY: screenPosition?.y ?? event.clientY
    })
  }, [disabled, flow, tabId])

  const saveEditingNode = useCallback(() => {
    if (!tabId || !editingNode) return
    const currentNode = nodes.find((node) => node.id === editingNode.id)
    const currentText = currentNode?.data.text ?? ''
    if (editingNode.text !== currentText) {
      onChange(tabId, updateCanvasNodeText(body, editingNode.id, editingNode.text))
    }
    setEditingNode(null)
  }, [body, editingNode, nodes, onChange, tabId])

  const insertExample = useCallback(() => {
    if (!tabId || disabled) return
    onChange(tabId, insertExampleCanvasBlock(body))
  }, [body, disabled, onChange, tabId])

  if (disabled) {
    return (
      <div className="canvas-empty">
        <strong>No file selected</strong>
        <span>Open a Markdown file, then switch to Canvas.</span>
      </div>
    )
  }

  if (!parsed.ok) {
    return (
      <div className="canvas-empty">
        <strong>{parsed.hasBlock ? 'Canvas block has an error' : 'No canvas block'}</strong>
        <span>{parsed.error}</span>
        {!parsed.hasBlock && (
          <button type="button" onClick={insertExample}>
            Insert example canvas
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="canvas-editor">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={!disabled}
        nodesConnectable={false}
        elementsSelectable={!disabled}
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        panOnScrollSpeed={0.8}
        zoomOnScroll={false}
        zoomOnPinch
        fitView
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onInit={setFlow}
      >
        <Background />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeBorderRadius={6}
          nodeColor={(node) => {
            const color = (node.data as CanvasNodeData).color
            if (color === 'yellow') return '#fff4be'
            if (color === 'blue') return '#dfeafa'
            if (color === 'green') return '#dff1e7'
            if (color === 'red') return '#f8dfdb'
            return '#fffdf8'
          }}
          nodeStrokeColor="#7c7468"
          maskColor="rgba(244, 241, 234, 0.72)"
        />
        <Controls />
      </ReactFlow>
      {editingNode && (
        <div
          className="canvas-text-popover"
          style={{
            left: editingNode.screenX,
            top: editingNode.screenY
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="canvas-text-popover-grid">
            <textarea
              value={editingNode.text}
              autoFocus
              spellCheck
              onChange={(event) => setEditingNode((current) =>
                current ? { ...current, text: event.target.value } : current
              )}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault()
                  saveEditingNode()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setEditingNode(null)
                }
              }}
            />
            <div
              className="canvas-text-popover-preview"
              dangerouslySetInnerHTML={{ __html: renderCanvasMarkdown(editingNode.text || 'Empty block') }}
            />
          </div>
          <div className="canvas-text-popover-actions">
            <button type="button" className="secondary-button" onClick={() => setEditingNode(null)}>
              Cancel
            </button>
            <button type="button" onClick={saveEditingNode}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
