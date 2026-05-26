import type { JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/react'

type TopLevelBlockPosition = {
  blockId: string
  pos: number
  nodeSize: number
  index: number
}

function getTopLevelBlockPositions(editor: Editor): TopLevelBlockPosition[] {
  const blocks: TopLevelBlockPosition[] = []

  editor.state.doc.descendants((node, position, parent, index) => {
    if (parent !== editor.state.doc) return false
    const blockId = node.attrs?.blockId
    if (blockId) {
      blocks.push({
        blockId,
        pos: position,
        nodeSize: node.nodeSize,
        index
      })
    }
    return false
  })

  return blocks
}

export function replaceBlock(editor: Editor, blockId: string, nextNode: JSONContent) {
  const block = getTopLevelBlockPositions(editor).find((entry) => entry.blockId === blockId)
  if (!block) return false

  editor.chain().focus().command(({ tr, state, dispatch }) => {
    const node = state.schema.nodeFromJSON(nextNode)
    tr.replaceWith(block.pos, block.pos + block.nodeSize, node)
    dispatch?.(tr)
    return true
  }).run()

  return true
}

export function removeBlock(editor: Editor, blockId: string) {
  const block = getTopLevelBlockPositions(editor).find((entry) => entry.blockId === blockId)
  if (!block) return false

  editor.chain().focus().command(({ tr, dispatch }) => {
    tr.delete(block.pos, block.pos + block.nodeSize)
    dispatch?.(tr)
    return true
  }).run()

  return true
}

export function insertBlockAt(editor: Editor, index: number, nextNode: JSONContent) {
  const blocks = getTopLevelBlockPositions(editor)
  const target = blocks.find((entry) => entry.index === index)
  const insertPos = target ? target.pos : editor.state.doc.content.size

  editor.chain().focus().command(({ tr, state, dispatch }) => {
    const node = state.schema.nodeFromJSON(nextNode)
    tr.insert(insertPos, node)
    dispatch?.(tr)
    return true
  }).run()

  return true
}
