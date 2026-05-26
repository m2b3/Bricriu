import type { JSONContent } from '@tiptap/core'
import { extractTrackableBlocks } from './blockIds'

export type DiffPart = {
  type: 'equal' | 'insert' | 'delete'
  value: string
}

export type ReviewChange = {
  blockId: string
  type: 'modified' | 'added' | 'deleted'
  nodeType: string
  oldText: string
  newText: string
  oldIndex: number
  newIndex: number
}

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/gu) ?? []
}

export function diffWords(oldText: string, newText: string): DiffPart[] {
  const oldTokens = tokenize(oldText)
  const newTokens = tokenize(newText)
  const rows = oldTokens.length + 1
  const cols = newTokens.length + 1
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))

  for (let oldIndex = oldTokens.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newTokens.length - 1; newIndex >= 0; newIndex -= 1) {
      dp[oldIndex][newIndex] = oldTokens[oldIndex] === newTokens[newIndex]
        ? dp[oldIndex + 1][newIndex + 1] + 1
        : Math.max(dp[oldIndex + 1][newIndex], dp[oldIndex][newIndex + 1])
    }
  }

  const parts: DiffPart[] = []
  let oldIndex = 0
  let newIndex = 0

  const pushPart = (type: DiffPart['type'], value: string) => {
    const previous = parts[parts.length - 1]
    if (previous?.type === type) {
      previous.value += value
      return
    }
    parts.push({ type, value })
  }

  while (oldIndex < oldTokens.length && newIndex < newTokens.length) {
    if (oldTokens[oldIndex] === newTokens[newIndex]) {
      pushPart('equal', oldTokens[oldIndex])
      oldIndex += 1
      newIndex += 1
    } else if (dp[oldIndex + 1][newIndex] >= dp[oldIndex][newIndex + 1]) {
      pushPart('delete', oldTokens[oldIndex])
      oldIndex += 1
    } else {
      pushPart('insert', newTokens[newIndex])
      newIndex += 1
    }
  }

  while (oldIndex < oldTokens.length) pushPart('delete', oldTokens[oldIndex++])
  while (newIndex < newTokens.length) pushPart('insert', newTokens[newIndex++])

  return parts
}

export function compareSnapshots(oldDoc: JSONContent, newDoc: JSONContent): ReviewChange[] {
  const oldBlocks = extractTrackableBlocks(oldDoc)
  const newBlocks = extractTrackableBlocks(newDoc)
  const oldById = new Map(oldBlocks.map((block) => [block.blockId, block]))
  const newById = new Map(newBlocks.map((block) => [block.blockId, block]))
  const changes: ReviewChange[] = []

  new Set([...oldById.keys(), ...newById.keys()]).forEach((blockId) => {
    const oldBlock = oldById.get(blockId)
    const newBlock = newById.get(blockId)

    if (!oldBlock && newBlock) {
      changes.push({
        blockId,
        type: 'added',
        nodeType: newBlock.type,
        oldText: '',
        newText: newBlock.text,
        oldIndex: -1,
        newIndex: newBlock.index
      })
    } else if (oldBlock && !newBlock) {
      changes.push({
        blockId,
        type: 'deleted',
        nodeType: oldBlock.type,
        oldText: oldBlock.text,
        newText: '',
        oldIndex: oldBlock.index,
        newIndex: -1
      })
    } else if (oldBlock && newBlock && oldBlock.text !== newBlock.text) {
      changes.push({
        blockId,
        type: 'modified',
        nodeType: newBlock.type,
        oldText: oldBlock.text,
        newText: newBlock.text,
        oldIndex: oldBlock.index,
        newIndex: newBlock.index
      })
    }
  })

  return changes.sort((left, right) => {
    const leftIndex = left.newIndex >= 0 ? left.newIndex : left.oldIndex
    const rightIndex = right.newIndex >= 0 ? right.newIndex : right.oldIndex
    return leftIndex - rightIndex
  })
}
