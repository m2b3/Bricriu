import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { JSONContent } from '@tiptap/core'
import { assignMissingBlockIds, getNodeText } from './blockIds'
import { BlockIdExtension } from './blockIds'
import { compareSnapshots, diffWords, type ReviewChange } from './diff'
import { insertBlockAt, removeBlock, replaceBlock } from './editorOps'
import { tiptapToMarkdown } from './markdown'
import {
  ReviewDecorationsExtension,
  applyReviewDecorations,
  clearReviewDecorations,
  findBlockNodeById
} from './reviewDecorations'
import type { DocumentSnapshot, TrackState } from './types'

type TrackChangesEditorProps = {
  tabId: string
  path: string
  state: TrackState
  disabled?: boolean
  onMarkdownChange: (tabId: string, body: string) => void
  onTrackStateChange: (tabId: string, state: TrackState) => void
}

function createSnapshot(path: string, label: string, content: JSONContent): DocumentSnapshot {
  return {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    docId: path,
    label,
    createdAt: new Date().toISOString(),
    content: assignMissingBlockIds(content)
  }
}

export function createInitialTrackState(path: string, content: JSONContent): TrackState {
  const currentDoc = assignMissingBlockIds(content)
  return {
    path,
    currentDoc,
    snapshots: [createSnapshot(path, 'Initial import', currentDoc)],
    resolvedChanges: [],
    comments: [],
    updatedAt: Date.now()
  }
}

function InlineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = useMemo(() => diffWords(oldText, newText), [oldText, newText])
  return (
    <div className="inline-diff">
      {parts.map((part, index) => (
        <span key={`${part.type}-${index}`} className={`diff-token diff-token--${part.type}`}>
          {part.value}
        </span>
      ))}
    </div>
  )
}

export function TrackChangesEditor({
  tabId,
  path,
  state,
  disabled = false,
  onMarkdownChange,
  onTrackStateChange
}: TrackChangesEditorProps): JSX.Element {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState(() => state.snapshots[0]?.id ?? '')
  const [changes, setChanges] = useState<ReviewChange[]>([])
  const [bubbleCompareByBlockId, setBubbleCompareByBlockId] = useState<Record<string, string>>({})
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        listKeymap: false,
        underline: false
      }),
      BlockIdExtension,
      ReviewDecorationsExtension
    ],
    content: state.currentDoc,
    editable: !disabled,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'track-editor-surface'
      }
    },
    onUpdate({ editor }) {
      const currentDoc = assignMissingBlockIds(editor.getJSON())
      const latestState = stateRef.current
      const nextState = {
        ...latestState,
        path,
        currentDoc,
        updatedAt: Date.now()
      }
      onTrackStateChange(tabId, nextState)
      onMarkdownChange(tabId, tiptapToMarkdown(currentDoc))
    }
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) return
    const current = JSON.stringify(assignMissingBlockIds(editor.getJSON()))
    const next = JSON.stringify(assignMissingBlockIds(state.currentDoc))
    if (current !== next) editor.commands.setContent(state.currentDoc, { emitUpdate: false })
  }, [editor, state.currentDoc])

  useEffect(() => {
    if (!editor) return
    if (changes.length === 0) {
      clearReviewDecorations(editor)
      return
    }
    applyReviewDecorations(
      editor,
      changes.map((change) => ({
        blockId: change.blockId,
        kind: change.type
      }))
    )
  }, [changes, editor])

  const snapshots = state.snapshots.length > 0
    ? state.snapshots
    : [createSnapshot(path, 'Initial import', state.currentDoc)]
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? snapshots[0]
  const currentDoc = editor ? assignMissingBlockIds(editor.getJSON()) : state.currentDoc

  const saveSnapshot = () => {
    const nextSnapshot = createSnapshot(path, `Snapshot ${snapshots.length + 1}`, currentDoc)
    onTrackStateChange(tabId, {
      ...state,
      currentDoc,
      snapshots: [nextSnapshot, ...snapshots],
      updatedAt: Date.now()
    })
    setSelectedSnapshotId(nextSnapshot.id)
  }

  const runReview = () => {
    if (!selectedSnapshot) return
    const resolved = new Set(state.resolvedChanges)
    setChanges(compareSnapshots(selectedSnapshot.content, currentDoc).filter((change) => !resolved.has(change.blockId)))
  }

  const acceptChange = (blockId: string) => {
    if (disabled) return
    const nextResolved = Array.from(new Set([...state.resolvedChanges, blockId]))
    onTrackStateChange(tabId, { ...state, resolvedChanges: nextResolved, updatedAt: Date.now() })
    setChanges((previous) => previous.filter((change) => change.blockId !== blockId))
  }

  const rejectChange = (change: ReviewChange) => {
    if (disabled) return
    if (!editor || !selectedSnapshot) return
    const compareSnapshotId = bubbleCompareByBlockId[change.blockId] ?? selectedSnapshotId
    const compareSnapshot = snapshots.find((snapshot) => snapshot.id === compareSnapshotId) ?? selectedSnapshot
    const oldNode = findBlockNodeById(compareSnapshot.content, change.blockId)

    if (change.type === 'modified' && oldNode) {
      replaceBlock(editor, change.blockId, oldNode)
    } else if (change.type === 'added') {
      removeBlock(editor, change.blockId)
    } else if (change.type === 'deleted' && oldNode) {
      insertBlockAt(editor, Math.max(change.oldIndex, 0), oldNode)
    }

    const nextDoc = assignMissingBlockIds(editor.getJSON())
    onTrackStateChange(tabId, { ...state, currentDoc: nextDoc, updatedAt: Date.now() })
    onMarkdownChange(tabId, tiptapToMarkdown(nextDoc))
    setChanges(compareSnapshots(compareSnapshot.content, nextDoc))
  }

  return (
    <div className="track-workspace">
      <section className="track-editor-panel">
        <div className="track-toolbar">
          <label>
            <span>Compare</span>
            <select value={selectedSnapshot?.id ?? ''} onChange={(event) => setSelectedSnapshotId(event.target.value)}>
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={saveSnapshot} disabled={disabled}>Snapshot</button>
          <button type="button" onClick={runReview} disabled={disabled}>Review</button>
          <button type="button" className="secondary-button" onClick={() => setChanges([])}>Clear</button>
        </div>
        <EditorContent editor={editor} />
      </section>

      <aside className="track-review-panel">
        <header className="track-review-header">
          <strong>Review</strong>
          <span>{changes.length} open</span>
        </header>
        <div className="track-review-list">
          {changes.length === 0 && <div className="empty-list">No review changes</div>}
          {changes.map((change) => {
            const bubbleSnapshotId = bubbleCompareByBlockId[change.blockId] ?? selectedSnapshot?.id ?? ''
            const bubbleSnapshot = snapshots.find((snapshot) => snapshot.id === bubbleSnapshotId) ?? selectedSnapshot
            const oldNode = bubbleSnapshot ? findBlockNodeById(bubbleSnapshot.content, change.blockId) : undefined
            const currentNode = findBlockNodeById(currentDoc, change.blockId)
            return (
              <article key={change.blockId} className="track-change-card">
                <div className="track-change-card-header">
                  <span className={`track-pill track-pill--${change.type}`}>{change.type}</span>
                  <select
                    value={bubbleSnapshotId}
                    onChange={(event) =>
                      setBubbleCompareByBlockId((previous) => ({
                        ...previous,
                        [change.blockId]: event.target.value
                      }))
                    }
                  >
                    {snapshots.map((snapshot) => (
                      <option key={snapshot.id} value={snapshot.id}>{snapshot.label}</option>
                    ))}
                  </select>
                </div>
                <code>{change.blockId}</code>
                <InlineDiff oldText={getNodeText(oldNode)} newText={getNodeText(currentNode)} />
                <div className="track-change-actions">
                  <button type="button" onClick={() => acceptChange(change.blockId)} disabled={disabled}>Accept</button>
                  <button type="button" className="danger-button" onClick={() => rejectChange(change)} disabled={disabled}>Reject</button>
                </div>
              </article>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
