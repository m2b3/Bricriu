import YAML from 'yaml'

export type CanvasShape = 'box' | 'bubble'

export type CanvasNodeSpec = {
  id: string
  x: number
  y: number
  w?: number
  h?: number
  shape?: CanvasShape
  color?: string
  readonly?: boolean
  text: string
}

export type CanvasEdgeSpec = {
  from: string
  to: string
  label?: string
}

export type CanvasViewportSpec = {
  x: number
  y: number
  zoom: number
}

export type CanvasDocument = {
  nodes: CanvasNodeSpec[]
  edges: CanvasEdgeSpec[]
  viewport?: CanvasViewportSpec
}

export type CanvasBlockResult =
  | { ok: true; document: CanvasDocument; source: string; start: number; end: number }
  | { ok: false; error: string; hasBlock: boolean }

const canvasFencePattern = /(^|\n)```canvas[ \t]*\n([\s\S]*?)(?:\n```)(?=\n|$)/

export const exampleCanvasBlock = `\`\`\`canvas
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
\`\`\``

export function parseCanvasBlock(markdown: string): CanvasBlockResult {
  const match = canvasFencePattern.exec(markdown)
  if (!match) return { ok: false, error: 'No canvas block found.', hasBlock: false }

  const prefixLength = match[1].length
  const start = match.index + prefixLength
  const end = match.index + match[0].length
  const source = match[2]

  try {
    const parsed = YAML.parse(source) as Partial<CanvasDocument> | null
    const document = normalizeCanvasDocument(parsed)
    return { ok: true, document, source, start, end }
  } catch (err) {
    return { ok: false, error: `Could not parse canvas YAML: ${String(err)}`, hasBlock: true }
  }
}

export function hasCanvasBlock(markdown: string): boolean {
  return canvasFencePattern.test(markdown)
}

export function markdownOutsideCanvasBlock(markdown: string): string {
  const match = canvasFencePattern.exec(markdown)
  if (!match) return markdown.trim()
  const prefixLength = match[1].length
  const start = match.index + prefixLength
  const end = match.index + match[0].length
  return `${markdown.slice(0, start)}${markdown.slice(end)}`.trim()
}

export function insertExampleCanvasBlock(markdown: string): string {
  const trimmed = markdown.trimEnd()
  return `${trimmed}${trimmed ? '\n\n' : ''}# Canvas note\n\n${exampleCanvasBlock}\n`
}

export function insertEmptyCanvasBlock(markdown: string): string {
  const trimmed = markdown.trimEnd()
  return `${trimmed}${trimmed ? '\n\n' : ''}\`\`\`canvas\nnodes: []\nedges: []\n\`\`\`\n`
}

export function replaceCanvasDocument(markdown: string, document: CanvasDocument): string {
  const block = parseCanvasBlock(markdown)
  if (!block.ok) return markdown
  const nextYaml = YAML.stringify(document, {
    collectionStyle: 'block',
    lineWidth: 0
  }).trimEnd()
  return `${markdown.slice(0, block.start)}\`\`\`canvas\n${nextYaml}\n\`\`\`${markdown.slice(block.end)}`
}

export function updateCanvasNodePosition(
  markdown: string,
  id: string,
  position: { x: number; y: number }
): string {
  const block = parseCanvasBlock(markdown)
  if (!block.ok) return markdown
  return replaceCanvasDocument(markdown, {
    ...block.document,
    nodes: block.document.nodes.map((node) =>
      node.id === id
        ? { ...node, x: Math.round(position.x), y: Math.round(position.y) }
        : node
    )
  })
}

export function updateCanvasNodeText(markdown: string, id: string, text: string): string {
  const block = parseCanvasBlock(markdown)
  if (!block.ok) return markdown
  return replaceCanvasDocument(markdown, {
    ...block.document,
    nodes: block.document.nodes.map((node) =>
      node.id === id ? { ...node, text } : node
    )
  })
}

export function updateCanvasNodeSize(
  markdown: string,
  id: string,
  size: { width: number; height: number }
): string {
  const block = parseCanvasBlock(markdown)
  if (!block.ok) return markdown
  return replaceCanvasDocument(markdown, {
    ...block.document,
    nodes: block.document.nodes.map((node) =>
      node.id === id
        ? { ...node, w: Math.round(size.width), h: Math.round(size.height) }
        : node
    )
  })
}

export function updateCanvasViewport(markdown: string, viewport: CanvasViewportSpec): string {
  const block = parseCanvasBlock(markdown)
  if (!block.ok) return markdown
  return replaceCanvasDocument(markdown, {
    ...block.document,
    viewport: normalizeViewportForWrite(viewport)
  })
}

export function addCanvasNode(markdown: string, node: CanvasNodeSpec): string {
  const block = parseCanvasBlock(markdown)
  if (!block.ok) return markdown
  return replaceCanvasDocument(markdown, {
    ...block.document,
    nodes: [...block.document.nodes, node]
  })
}

export function deleteCanvasNode(markdown: string, id: string): string {
  const block = parseCanvasBlock(markdown)
  if (!block.ok) return markdown
  return replaceCanvasDocument(markdown, {
    ...block.document,
    nodes: block.document.nodes.filter((node) => node.id !== id),
    edges: block.document.edges.filter((edge) => edge.from !== id && edge.to !== id)
  })
}

export function updateCanvasNodeProperties(
  markdown: string,
  id: string,
  updates: Partial<CanvasNodeSpec>
): string {
  const block = parseCanvasBlock(markdown)
  if (!block.ok) return markdown
  const nextId = typeof updates.id === 'string' && updates.id.trim() ? updates.id.trim() : id
  const duplicateId = nextId !== id && block.document.nodes.some((node) => node.id === nextId)
  if (duplicateId) return markdown

  return replaceCanvasDocument(markdown, {
    ...block.document,
    nodes: block.document.nodes.map((node) =>
      node.id === id
        ? {
            ...node,
            ...updates,
            id: nextId,
            x: typeof updates.x === 'number' ? Math.round(updates.x) : node.x,
            y: typeof updates.y === 'number' ? Math.round(updates.y) : node.y,
            w: typeof updates.w === 'number' ? Math.round(updates.w) : node.w,
            h: typeof updates.h === 'number' ? Math.round(updates.h) : node.h
          }
        : node
    ),
    edges: block.document.edges.map((edge) => ({
      ...edge,
      from: edge.from === id ? nextId : edge.from,
      to: edge.to === id ? nextId : edge.to
    }))
  })
}

function normalizeCanvasDocument(parsed: Partial<CanvasDocument> | null): CanvasDocument {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Canvas block must be a YAML object.')
  }
  if (!Array.isArray(parsed.nodes)) {
    throw new Error('Canvas block needs a nodes list.')
  }

  return {
    nodes: parsed.nodes.map(normalizeCanvasNode),
    edges: Array.isArray(parsed.edges) ? parsed.edges.map(normalizeCanvasEdge) : [],
    viewport: normalizeCanvasViewport(parsed.viewport)
  }
}

function normalizeCanvasNode(raw: unknown): CanvasNodeSpec {
  if (!raw || typeof raw !== 'object') throw new Error('Each node must be an object.')
  const node = raw as Partial<CanvasNodeSpec>
  if (!node.id || typeof node.id !== 'string') throw new Error('Each node needs a string id.')
  if (typeof node.x !== 'number' || typeof node.y !== 'number') {
    throw new Error(`Node ${node.id} needs numeric x and y fields.`)
  }
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    w: typeof node.w === 'number' ? node.w : undefined,
    h: typeof node.h === 'number' ? node.h : undefined,
    shape: node.shape === 'bubble' ? 'bubble' : 'box',
    color: typeof node.color === 'string' ? node.color : undefined,
    text: typeof node.text === 'string' ? node.text : ''
  }
}

function normalizeCanvasViewport(raw: unknown): CanvasViewportSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const viewport = raw as Partial<CanvasViewportSpec>
  if (
    typeof viewport.x !== 'number' ||
    typeof viewport.y !== 'number' ||
    typeof viewport.zoom !== 'number'
  ) {
    return undefined
  }
  return normalizeViewportForWrite(viewport as CanvasViewportSpec)
}

function normalizeViewportForWrite(viewport: CanvasViewportSpec): CanvasViewportSpec {
  return {
    x: roundViewportNumber(viewport.x),
    y: roundViewportNumber(viewport.y),
    zoom: Math.max(0.1, Math.min(4, roundViewportNumber(viewport.zoom)))
  }
}

function roundViewportNumber(value: number): number {
  return Math.round(value * 1000) / 1000
}

function normalizeCanvasEdge(raw: unknown): CanvasEdgeSpec {
  if (!raw || typeof raw !== 'object') throw new Error('Each edge must be an object.')
  const edge = raw as Partial<CanvasEdgeSpec>
  if (!edge.from || !edge.to || typeof edge.from !== 'string' || typeof edge.to !== 'string') {
    throw new Error('Each edge needs string from and to fields.')
  }
  return {
    from: edge.from,
    to: edge.to,
    label: typeof edge.label === 'string' ? edge.label : undefined
  }
}
