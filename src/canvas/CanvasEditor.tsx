import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
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
  type OnMoveEnd,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport
} from '@xyflow/react'
import { CanvasNode, type CanvasNodeData } from './CanvasNode'
import { CanvasInspector } from './CanvasInspector'
import { CanvasToolbar } from './CanvasToolbar'
import {
  addCanvasNode,
  deleteCanvasNode,
  insertEmptyCanvasBlock,
  markdownOutsideCanvasBlock,
  parseCanvasBlock,
  type CanvasNodeSpec,
  type CanvasShape,
  updateCanvasNodeProperties,
  updateCanvasNodePosition,
  updateCanvasNodeSize,
  updateCanvasNodeText,
  updateCanvasViewport
} from './canvasBlock'
import { renderCanvasMarkdown } from './canvasMarkdown'

const nodeTypes: NodeTypes = {
  canvasNode: CanvasNode
}

export type DocumentDisplayMode = 'node' | 'panel'

const documentNodeId = '__document'
const documentDisplayStorageKey = 'notesproject:canvas-document-display'

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
  notePaths,
  onChange,
  onOpenWikiLink
}: {
  tabId: string | null
  body: string
  disabled: boolean
  notePaths: string[]
  onChange: (id: string, body: string) => void
  onOpenWikiLink: (path: string) => void
}): JSX.Element {
  const parsed = useMemo(() => parseCanvasBlock(body), [body])
  const canvasDocument = useMemo(() => (
    parsed.ok ? parsed.document : parsed.hasBlock ? null : { nodes: [], edges: [] }
  ), [parsed])
  const documentMarkdown = useMemo(() => markdownOutsideCanvasBlock(body), [body])
  const [nodes, setNodes] = useState<Array<Node<CanvasNodeData>>>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [flow, setFlow] = useState<ReactFlowInstance<Node<CanvasNodeData>, Edge> | null>(null)
  const [editingNode, setEditingNode] = useState<EditingNode | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [documentDisplayMode, setDocumentDisplayMode] = useState<DocumentDisplayMode>(() => readDocumentDisplayMode())
  const applyingStoredViewport = useRef(false)
  const appliedViewportKey = useRef<string | null>(null)

  const selectedNode = useMemo(() => (
    canvasDocument && selectedNodeId && selectedNodeId !== documentNodeId
      ? canvasDocument.nodes.find((node) => node.id === selectedNodeId) ?? null
      : null
    ), [canvasDocument, selectedNodeId])
  const showDocumentNode = documentMarkdown !== '' && documentDisplayMode === 'node'
  const showDocumentPanel = documentMarkdown !== '' && documentDisplayMode === 'panel'
  const storedViewport = canvasDocument?.viewport
  const storedViewportKey = storedViewport ? viewportKey(storedViewport) : null

  const onResizeNode = useCallback((id: string, size: { width: number; height: number }) => {
    if (!tabId || disabled) return
    onChange(tabId, updateCanvasNodeSize(body, id, size))
  }, [body, disabled, onChange, tabId])

  useEffect(() => {
    if (!canvasDocument) {
      setNodes([])
      setEdges([])
      return
    }
    const documentNode: Node<CanvasNodeData>[] = showDocumentNode
      ? [{
          id: documentNodeId,
          type: 'canvasNode',
          position: { x: 40, y: 40 },
          draggable: false,
          selectable: true,
          style: {
            width: 360,
            minHeight: 160
          },
          data: {
            text: documentMarkdown,
            shape: 'box',
            color: 'neutral',
            readonly: true,
            notePaths,
            onOpenWikiLink
          }
        }]
      : []
    setNodes([
      ...documentNode,
      ...canvasDocument.nodes.map((node) => ({
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
        notePaths,
        onResize: onResizeNode,
        onOpenWikiLink
      }
      }))
    ])
    setEdges(canvasDocument.edges.map((edge, index) => ({
      id: `${edge.from}:${edge.to}:${index}`,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      animated: false
    })))
  }, [canvasDocument, documentMarkdown, notePaths, onOpenWikiLink, onResizeNode, showDocumentNode])

  useEffect(() => {
    if (selectedNodeId === documentNodeId && !showDocumentNode) {
      setSelectedNodeId(null)
      return
    }
    if (canvasDocument && selectedNodeId && selectedNodeId !== documentNodeId && !canvasDocument.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null)
    }
  }, [canvasDocument, selectedNodeId, showDocumentNode])

  const setAndStoreDocumentDisplayMode = useCallback((mode: DocumentDisplayMode) => {
    setDocumentDisplayMode(mode)
    try {
      localStorage.setItem(documentDisplayStorageKey, mode)
    } catch {
      // Ignore storage failures; the in-memory setting still applies.
    }
  }, [])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current) as Array<Node<CanvasNodeData>>)
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current))
  }, [])

  const onNodeDragStop: OnNodeDrag<Node<CanvasNodeData>> = useCallback((_event, node) => {
    if (!tabId || disabled || node.id === documentNodeId) return
    onChange(tabId, updateCanvasNodePosition(body, node.id, node.position))
  }, [body, disabled, onChange, tabId])

  useEffect(() => {
    if (!flow || !storedViewport || !storedViewportKey) return
    const scopedKey = `${tabId ?? ''}:${storedViewportKey}`
    if (appliedViewportKey.current === scopedKey) return

    applyingStoredViewport.current = true
    appliedViewportKey.current = scopedKey
    void flow.setViewport(storedViewport, { duration: 0 })
    window.setTimeout(() => {
      applyingStoredViewport.current = false
    }, 0)
  }, [flow, storedViewport, storedViewportKey, tabId])

  const onMoveEnd: OnMoveEnd = useCallback((_event, viewport) => {
    if (!tabId || disabled || !parsed.ok || applyingStoredViewport.current) return

    const nextKey = viewportKey(viewport)
    if (storedViewportKey === nextKey) return

    appliedViewportKey.current = `${tabId}:${nextKey}`
    onChange(tabId, updateCanvasViewport(body, viewport))
  }, [body, disabled, onChange, parsed.ok, storedViewportKey, tabId])

  const onNodeDoubleClick: NodeMouseHandler = useCallback((event, node) => {
    if (!tabId || disabled || node.id === documentNodeId) return
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

  const createCanvasBlock = useCallback(() => {
    if (!tabId || disabled || parsed.ok || parsed.hasBlock) return
    onChange(tabId, insertEmptyCanvasBlock(body))
  }, [body, disabled, onChange, parsed, tabId])

  const addNode = useCallback((shape: CanvasShape) => {
    if (!tabId || disabled || !canvasDocument || !parsed.ok) return
    const id = nextNodeId(canvasDocument.nodes)
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
  }, [body, canvasDocument, disabled, flow, onChange, parsed, tabId])

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

  const openRenderedWikiLink = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest('a.canvas-wiki') as HTMLAnchorElement | null
      : null
    const href = target?.getAttribute('href')
    if (!href?.startsWith('notesproject-wiki:')) return

    event.preventDefault()
    event.stopPropagation()
    onOpenWikiLink(decodeURIComponent(href.slice('notesproject-wiki:'.length)))
  }, [onOpenWikiLink])

  if (disabled) {
    return (
      <div className="canvas-empty">
        <strong>No file selected</strong>
        <span>Open a Markdown file, then switch to Canvas.</span>
      </div>
    )
  }

  if (!parsed.ok && parsed.hasBlock) {
    return (
      <div className="canvas-empty">
        <strong>{parsed.hasBlock ? 'Canvas block has an error' : 'No canvas block'}</strong>
        <span>{parsed.error}</span>
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
        fitView={!storedViewport}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onMoveEnd={onMoveEnd}
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
        canAddNodes={parsed.ok}
        canCreateCanvas={!parsed.ok && !parsed.hasBlock}
        canDelete={!!selectedNodeId && selectedNodeId !== documentNodeId}
        documentDisplayMode={documentDisplayMode}
        hasDocumentMarkdown={documentMarkdown !== ''}
        inspectorOpen={inspectorOpen}
        onAddNode={addNode}
        onCreateCanvas={createCanvasBlock}
        onDocumentDisplayModeChange={setAndStoreDocumentDisplayMode}
        onDeleteSelected={deleteSelectedNode}
        onToggleInspector={() => setInspectorOpen((current) => !current)}
      />
      {inspectorOpen && canvasDocument && (
        <CanvasInspector
          node={selectedNode}
          existingIds={canvasDocument.nodes.map((node) => node.id)}
          onApply={applyInspectorUpdates}
        />
      )}
      {showDocumentPanel && (
        <aside className="canvas-document-panel" aria-label="Document Markdown">
          <div className="canvas-document-panel-header">Document</div>
          <div
            className="canvas-document-panel-content"
            onClick={openRenderedWikiLink}
            dangerouslySetInnerHTML={{ __html: renderCanvasMarkdown(documentMarkdown, notePaths) }}
          />
        </aside>
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
              onClick={openRenderedWikiLink}
              dangerouslySetInnerHTML={{ __html: renderCanvasMarkdown(editingNode.text || 'Empty block', notePaths) }}
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

function viewportKey(viewport: Viewport): string {
  return [
    Math.round(viewport.x * 1000) / 1000,
    Math.round(viewport.y * 1000) / 1000,
    Math.round(viewport.zoom * 1000) / 1000
  ].join(':')
}

function readDocumentDisplayMode(): DocumentDisplayMode {
  try {
    return localStorage.getItem(documentDisplayStorageKey) === 'panel' ? 'panel' : 'node'
  } catch {
    return 'node'
  }
}
