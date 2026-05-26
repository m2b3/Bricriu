import type { JSONContent } from '@tiptap/core'
import { assignMissingBlockIds } from './blockIds'

type RawBlock = {
  text: string
  blankLinesAfter: number
}

export function markdownToTiptap(markdown: string): JSONContent {
  const blocks = splitRawMarkdownBlocks(markdown.replace(/\r\n/g, '\n'))
  return assignMissingBlockIds({
    type: 'doc',
    content: blocks.length > 0
      ? blocks.map((block) => ({
          type: 'paragraph',
          attrs: {
            rawBlankLinesAfter: block.blankLinesAfter
          },
          content: rawTextToNodes(block.text)
        }))
      : [{ type: 'paragraph', attrs: { rawBlankLinesAfter: 1 } }]
  })
}

export function tiptapToMarkdown(doc: JSONContent): string {
  const blocks = (doc.content ?? []).map((node) => ({
    text: nodeToRawText(node),
    blankLinesAfter: Number(node.attrs?.rawBlankLinesAfter ?? 1)
  }))

  return blocks.map((block, index) => {
    const separator = index === blocks.length - 1 ? '' : '\n'.repeat(Math.max(1, block.blankLinesAfter + 1))
    return `${block.text}${separator}`
  }).join('')
}

function splitRawMarkdownBlocks(markdown: string): RawBlock[] {
  const lines = markdown.split('\n')
  const blocks: RawBlock[] = []
  let current: string[] = []
  let blankCount = 0

  const flush = () => {
    if (current.length === 0) return
    blocks.push({
      text: current.join('\n'),
      blankLinesAfter: Math.max(1, blankCount)
    })
    current = []
    blankCount = 0
  }

  for (const line of lines) {
    if (line.trim() === '') {
      blankCount += 1
      continue
    }

    if (blankCount > 0 && current.length > 0) {
      flush()
    }

    current.push(line)
    blankCount = 0
  }

  flush()
  return blocks
}

function rawTextToNodes(text: string): JSONContent[] | undefined {
  if (!text) return undefined
  const nodes: JSONContent[] = []
  const lines = text.split('\n')

  lines.forEach((line, index) => {
    if (line) nodes.push({ type: 'text', text: line })
    if (index < lines.length - 1) nodes.push({ type: 'hardBreak' })
  })

  return nodes.length > 0 ? nodes : undefined
}

function nodeToRawText(node: JSONContent): string {
  if (typeof node.text === 'string') return node.text
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(nodeToRawText).join('')
}
