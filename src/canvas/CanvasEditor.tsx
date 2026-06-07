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
import { CanvasInspector } from './CanvasInspector'
import { CanvasToolbar } from './CanvasToolbar'
import {
  addCanvasNode,
  deleteCanvasNode,
  insertExampleCanvasBlock,
  parseCanvasBlock,
  type CanvasNodeSpec,
  type CanvasShape,
  updateCanvasNodeProperties,
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const selectedNode = useMemo(() => (
    parsed.ok && selectedNodeId
      ? parsed.document.nodes.find((node) => node.id === selectedNodeId) ?? null
      : null
  ), [parsed, selectedNodeId])

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

  useEffect(() => {
    if (parsed.ok && selectedNodeId && !parsed.document.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null)
    }
  }, [parsed, selectedNodeId])

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

  const addNode = useCallback((shape: CanvasShape) => {
    if (!tabId || disabled || !parsed.ok) return
    const id = nextNodeId(parsed.document.nodes)
    const pane = document.querySelector('.canvas-editor')?.getBoundingClientRect()
    const center = flow?.screenToFlowPosition({
      x: pane ? pane.left + pane.width / 2 : window.innerWidth / 2,
      y: pane ? pane.top + pane.height / 2 : window.innerHeight / 2
    }) ?? { x: 180, y: 140 }
    const node: CanvasNodeSpec = {
      id,
      x: Math.round(center.x - 110),
      y: Math.round(center.y - 60),
      w: shape === 'bubble' ? 230 : 240,
      h: 120,
      shape,
      color: shape === 'bubble' ? 'yellow' : 'blue',
      text: shape === 'bubble' ? 'New bubble' : 'New box'
    }
    setSelectedNodeId(id)
    onChange(tabId, addCanvasNode(body, node))
  }, [body, disabled, flow, onChange, parsed, tabId])

  const deleteSelectedNode = useCallback(() => {
    if (!tabId || disabled || !selectedNodeId) return
    onChange(tabId, deleteCanvasNode(body, selectedNodeId))
    setSelectedNodeId(null)
  }, [body, disabled, onChange, selectedNodeId, tabId])

  const applyInspectorUpdates = useCallback((id: string, updates: Partial<CanvasNodeSpec>) => {
    if (!tabId || disabled) return
    const nextBody = updateCanvasNodeProperties(body, id, updates)
    const nextId = updates.id?.trim()
    if (nextId) setSelectedNodeId(nextId)
    onChange(tabId, nextBody)
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
        onSelectionChange={({ nodes }) => {
          setSelectedNodeId(nodes.length === 1 ? nodes[0].id : null)
        }}
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
      <CanvasToolbar
        canDelete={!!selectedNodeId}
        inspectorOpen={inspectorOpen}
        onAddNode={addNode}
        onDeleteSelected={deleteSelectedNode}
        onToggleInspector={() => setInspectorOpen((current) => !current)}
      />
      {inspectorOpen && (
        <CanvasInspector
          node={selectedNode}
          existingIds={parsed.document.nodes.map((node) => node.id)}
          onApply={applyInspectorUpdates}
        />
      )}
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

function nextNodeId(nodes: CanvasNodeSpec[]): string {
  let index = nodes.length + 1
  const existing = new Set(nodes.map((node) => node.id))
  while (existing.has(`node-${index}`)) index += 1
  return `node-${index}`
}
