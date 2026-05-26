import type { JSONContent } from '@tiptap/core'

export type DocumentSnapshot = {
  id: string
  docId: string
  createdAt: string
  authorId?: string
  label: string
  content: JSONContent
}

export type CommentAnchor = {
  blockId: string
  from: number
  to: number
  quote: string
  prefix?: string
  suffix?: string
}

export type ReviewComment = {
  id: string
  docId: string
  anchor: CommentAnchor
  body: string
  status: 'open' | 'resolved'
}

export type TrackState = {
  path: string
  currentDoc: JSONContent
  snapshots: DocumentSnapshot[]
  resolvedChanges: string[]
  comments: ReviewComment[]
  updatedAt: number
}
