import { Extension, type JSONContent } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

const TRACKED_BLOCK_TYPES = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock'])

export type TrackableBlock = {
  blockId: string
  type: string
  text: string
  index: number
  node: JSONContent
}

export function createBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `blk_${crypto.randomUUID()}`
  }
  return `blk_${Math.random().toString(36).slice(2, 10)}`
}

function isTrackableNode(node: JSONContent): boolean {
  return Boolean(node.type && TRACKED_BLOCK_TYPES.has(node.type))
}

export function getNodeText(node: JSONContent | undefined | null): string {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  return (node.content ?? []).map((child) => getNodeText(child)).join('')
}

export function assignMissingBlockIds(doc: JSONContent): JSONContent {
  const visit = (node: JSONContent): JSONContent => {
    const nextNode: JSONContent = {
      ...node,
      attrs: node.attrs ? { ...node.attrs } : undefined,
      content: node.content?.map((child) => visit(child))
    }

    if (isTrackableNode(nextNode) && !nextNode.attrs?.blockId) {
      nextNode.attrs = { ...(nextNode.attrs ?? {}), blockId: createBlockId() }
    }

    return nextNode
  }

  return visit(doc)
}

export function extractTrackableBlocks(doc: JSONContent): TrackableBlock[] {
  return (doc.content ?? [])
    .filter((node) => isTrackableNode(node))
    .map((node, index) => ({
      blockId: String(node.attrs?.blockId ?? createBlockId()),
      type: node.type ?? 'paragraph',
      text: getNodeText(node),
      index,
      node
    }))
}

export const BlockIdExtension = Extension.create({
  name: 'blockIdExtension',

  addGlobalAttributes() {
    return [
      {
        types: Array.from(TRACKED_BLOCK_TYPES),
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-block-id'),
            renderHTML: (attributes: Record<string, unknown>) => {
              const blockId = attributes.blockId
              return blockId ? { 'data-block-id': blockId } : {}
            }
          },
          rawBlankLinesAfter: {
            default: 1,
            parseHTML: (element: HTMLElement) => Number(element.getAttribute('data-raw-blank-lines-after') ?? 1),
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = Number(attributes.rawBlankLinesAfter ?? 1)
              return Number.isFinite(value) && value !== 1
                ? { 'data-raw-blank-lines-after': String(value) }
                : {}
            }
          }
        }
      }
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null

          let nextTransaction = newState.tr
          let changed = false

          newState.doc.descendants((node, position) => {
            if (!TRACKED_BLOCK_TYPES.has(node.type.name) || node.attrs.blockId) return

            nextTransaction = nextTransaction.setNodeMarkup(
              position,
              undefined,
              { ...node.attrs, blockId: createBlockId() },
              node.marks
            )
            changed = true
          })

          return changed ? nextTransaction : null
        }
      })
    ]
  }
})
