import { Extension, type JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type ReviewChangeKind = 'modified' | 'added' | 'deleted'

export type ReviewDecorationChange = {
  blockId: string
  kind: ReviewChangeKind
}

export const reviewDecorationsKey = new PluginKey<DecorationSet>('reviewDecorations')

function buildDecorations(doc: Parameters<typeof DecorationSet.create>[0], changes: ReviewDecorationChange[]) {
  const byBlockId = new Map(changes.map((change) => [change.blockId, change.kind]))
  const decorations: Decoration[] = []

  doc.descendants((node, position) => {
    const blockId = node.attrs?.blockId
    if (!blockId || !byBlockId.has(blockId)) return
    const kind = byBlockId.get(blockId)

    decorations.push(
      Decoration.node(position, position + node.nodeSize, {
        class: `review-block review-block--${kind}`,
        'data-review-kind': kind ?? 'modified'
      })
    )
  })

  return DecorationSet.create(doc, decorations)
}

export const ReviewDecorationsExtension = Extension.create({
  name: 'reviewDecorations',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: reviewDecorationsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, decorationSet) {
            const nextChanges = transaction.getMeta(reviewDecorationsKey) as
              | ReviewDecorationChange[]
              | undefined

            if (nextChanges) return buildDecorations(transaction.doc, nextChanges)
            if (transaction.docChanged) return decorationSet.map(transaction.mapping, transaction.doc)
            return decorationSet
          }
        },
        props: {
          decorations(state) {
            return reviewDecorationsKey.getState(state)
          }
        }
      })
    ]
  }
})

export function applyReviewDecorations(editor: Editor, changes: ReviewDecorationChange[]) {
  editor.view.dispatch(editor.state.tr.setMeta(reviewDecorationsKey, changes))
}

export function clearReviewDecorations(editor: Editor) {
  applyReviewDecorations(editor, [])
}

export function findBlockNodeById(doc: JSONContent, blockId: string): JSONContent | undefined {
  return (doc.content ?? []).find((node) => node.attrs?.blockId === blockId)
}
