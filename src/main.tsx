import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { availableMonitors, getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window'
import {
  Annotation,
  Compartment,
  Prec,
  RangeSetBuilder,
  EditorState,
  EditorSelection,
  StateField,
  type Extension
} from '@codemirror/state'
import { acceptCompletion, autocompletion, startCompletion, type CompletionContext } from '@codemirror/autocomplete'
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo
} from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import {
  HighlightStyle,
  syntaxTree,
  syntaxHighlighting
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { searchKeymap } from '@codemirror/search'
import { renderCanvasMarkdown } from './canvas/canvasMarkdown'
import { markdownToTiptap } from './track/markdown'
import type { CalendarEvent } from './calendar/CalendarView'
import type { TrackState } from './track/types'
import './styles.css'

const CanvasEditor = React.lazy(() =>
  import('./canvas/CanvasEditor').then((module) => ({ default: module.CanvasEditor }))
)
const TrackChangesEditor = React.lazy(() =>
  import('./track/TrackChangesEditor').then((module) => ({ default: module.TrackChangesEditor }))
)
const MarkdownPreview = React.lazy(() =>
  import('./preview/MarkdownPreview').then((module) => ({ default: module.MarkdownPreview }))
)
const CalendarView = React.lazy(() =>
  import('./calendar/CalendarView').then((module) => ({ default: module.CalendarView }))
)

type EntryKind = 'file' | 'dir'

type TreeEntry = {
  path: string
  name: string
  kind: EntryKind
  children: TreeEntry[]
  hiddenChildren?: TreeEntry[]
  updatedAt?: number
  size?: number
}

type VaultInfo = {
  root: string
  name: string
  pathsCaseSensitive: boolean
  git: GitInfo
}

type GitInfo = {
  isRepo: boolean
  currentBranch: string | null
  inuseBranch: string | null
  status: GitStatus
  message: string
}

type GitStatus =
  | 'notRepo'
  | 'ready'
  | 'dirtyOnInuse'
  | 'needsCheckpoint'
  | 'gitUnavailable'

type NoteContent = {
  path: string
  body: string
  updatedAt: number
  size: number
  outOfVault: boolean
}

type CreateNoteResult = {
  note: NoteContent
  createdFolder?: string | null
}

type SaveNoteCommandResult =
  | { status: 'saved'; note: NoteContent }
  | { status: 'conflict'; current: NoteContent }

type TypstPreview = {
  format: TypstPreviewFormat
  content: string
  updatedAt: number
}

type PdfExportResult = {
  path: string
}

type TypstPreviewFormat = 'svg' | 'html'

type ContentMatch = {
  path: string
  lineNumber: number
  lineText: string
  offset: number
}

type BacklinkMatch = {
  path: string
  lineNumber: number
  lineText: string
  offset: number
}

type DirtyGitFile = {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
}

type SearchHighlight = {
  path: string
  query: string
  offset: number
}

type TextCountResult = {
  scope: 'selection' | 'document'
  words: number
  characters: number
}

type TypstPreviewState = {
  tabId: string
  format: TypstPreviewFormat
  content: string | null
  loading: boolean
  error: string | null
}

type EditorMode = 'markdown' | 'track' | 'canvas'
type WorkspaceMode = 'notes' | 'calendar'
type SearchView = 'file' | 'content'
type EditorPane = 'main' | 'split'
type CanvasMarkdownDisplayMode = 'summary' | 'raw'
type CanvasDocumentDisplayMode = 'node' | 'panel'

type OpenTab = {
  id: string
  path: string
  mode: EditorMode
  body: string
  savedBody: string
  bodyVersion: number
  updatedAt: number
  size: number
  trackState?: TrackState
  externalStatus?: 'changed' | 'deleted'
  outOfVault?: boolean
}

type SaveConflictResult = {
  saved: false
  conflictPath?: string
  message: string
}

type SaveSuccessResult = {
  saved: true
  note: NoteContent
}

type SaveResult = SaveSuccessResult | SaveConflictResult

type VaultChangeEvent = {
  paths: string[]
}

const programmaticChange = Annotation.define<boolean>()
const editorDocumentVersion = StateField.define<number>({
  create: () => 0,
  update(value, transaction) {
    return transaction.docChanged ? value + 1 : value
  }
})
const notesHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: '#404740' },
  { tag: tags.heading, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.keyword, color: '#708' },
  { tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName], color: '#219' },
  { tag: [tags.literal, tags.inserted], color: '#164' },
  { tag: [tags.string, tags.deleted], color: '#a11' },
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], color: '#e40' },
  { tag: tags.definition(tags.variableName), color: '#00f' },
  { tag: tags.local(tags.variableName), color: '#30a' },
  { tag: [tags.typeName, tags.namespace], color: '#085' },
  { tag: tags.className, color: '#167' },
  { tag: [tags.special(tags.variableName), tags.macroName], color: '#256' },
  { tag: tags.definition(tags.propertyName), color: '#00c' },
  { tag: tags.comment, color: '#940' },
  { tag: tags.invalid, color: '#f00' }
])
const LAST_VAULT_KEY = 'notesproject:last-vault'
const SESSION_KEY_PREFIX = 'notesproject:session:'
const WINDOW_PLACEMENT_KEY = 'notesproject:window-placement'
const CANVAS_MARKDOWN_DISPLAY_KEY = 'notesproject:canvas-markdown-display'
const CANVAS_DOCUMENT_DISPLAY_KEY = 'notesproject:canvas-document-display'
const SIDEBAR_WIDTH_KEY = 'notesproject:sidebar-width'
const EDITOR_SPLIT_RATIO_KEY = 'notesproject:editor-split-ratio'
const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 560
const EDITOR_MIN_WIDTH = 360
const EDITOR_SPLIT_MIN_RATIO = 0.2
const EDITOR_SPLIT_MAX_RATIO = 0.8

type AppProfile = {
  autosaveDelayMs: number
  checkpointIntervalMs: number
  gitStatusPollIntervalMs: number
  typstPreviewDebounceMs: number
  closeMarkdownBeforeTrack: boolean
  persistRecentFiles: boolean
}

const DEFAULT_PROFILE: AppProfile = {
  autosaveDelayMs: 5000,
  checkpointIntervalMs: 3 * 60 * 1000,
  gitStatusPollIntervalMs: 5 * 60 * 1000,
  typstPreviewDebounceMs: 250,
  closeMarkdownBeforeTrack: true,
  persistRecentFiles: true
}

const MAX_RECENT_FILES = 20

let currentPathsCaseSensitive = true

type StoredSession = {
  openTabs: Array<{ path: string; mode: EditorMode }>
  openPaths?: string[]
  activeId?: string | null
  activePath?: string | null
  splitOpen?: boolean
  splitPath?: string | null
  splitMode?: EditorMode | null
  expanded: string[]
  pinnedPaths?: string[]
  recentPaths?: string[]
  fileQuery: string
  contentUsesFileFilter: boolean
}

type RestoredSession = {
  tabs: OpenTab[]
  activeId: string | null
  splitOpen: boolean
  splitId: string | null
  expanded: string[]
  pinnedPaths: string[]
  recentPaths: string[]
  fileQuery: string
  contentUsesFileFilter: boolean
}

type StoredWindowPlacement = {
  x: number
  y: number
  width: number
  height: number
}

function App(): JSX.Element {
  const [vaultPath, setVaultPath] = useState(() => localStorage.getItem(LAST_VAULT_KEY) ?? '')
  const [vault, setVault] = useState<VaultInfo | null>(null)
  const [tree, setTree] = useState<TreeEntry[]>([])
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('notes')
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [calendarSaving, setCalendarSaving] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitId, setSplitId] = useState<string | null>(null)
  const [focusedPane, setFocusedPane] = useState<EditorPane>('main')
  const [fileQuery, setFileQuery] = useState('')
  const [contentQuery, setContentQuery] = useState('')
  const [newNoteOpen, setNewNoteOpen] = useState(false)
  const [newNotePath, setNewNotePath] = useState('')
  const [newNoteError, setNewNoteError] = useState<string | null>(null)
  const [activeSearchView, setActiveSearchView] = useState<SearchView>('file')
  const [contentUsesFileFilter, setContentUsesFileFilter] = useState(false)
  const [contentMatches, setContentMatches] = useState<ContentMatch[]>([])
  const [backlinks, setBacklinks] = useState<BacklinkMatch[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(() => new Set())
  const [recentPaths, setRecentPaths] = useState<string[]>([])
  const [searchRevealedFolders, setSearchRevealedFolders] = useState<Set<string>>(() => new Set())
  const [jumpOffset, setJumpOffset] = useState<number | null>(null)
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlight | null>(null)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showToCommit, setShowToCommit] = useState(false)
  const [toCommitFiles, setToCommitFiles] = useState<DirtyGitFile[]>([])
  const [loadingToCommit, setLoadingToCommit] = useState(false)
  const [touchedPaths, setTouchedPaths] = useState<Set<string>>(() => new Set())
  const [profile, setProfile] = useState<AppProfile>(DEFAULT_PROFILE)
  const [showPreview, setShowPreview] = useState(false)
  const [canvasMarkdownDisplayMode, setCanvasMarkdownDisplayMode] = useState<CanvasMarkdownDisplayMode>(() => readCanvasMarkdownDisplayMode())
  const [canvasDocumentDisplayMode, setCanvasDocumentDisplayMode] = useState<CanvasDocumentDisplayMode>(() => readCanvasDocumentDisplayMode())
  const [typstPreviewFormat, setTypstPreviewFormat] = useState<TypstPreviewFormat>('svg')
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [loadingBacklinks, setLoadingBacklinks] = useState(false)
  const [typstPreview, setTypstPreview] = useState<TypstPreviewState | null>(null)
  const [editorFocusRequest, setEditorFocusRequest] = useState(0)
  const [editorSelectAllRequest, setEditorSelectAllRequest] = useState(0)
  const [editorBulletListRequest, setEditorBulletListRequest] = useState(0)
  const [editorNumberedListRequest, setEditorNumberedListRequest] = useState(0)
  const [editorTextCountRequest, setEditorTextCountRequest] = useState(0)
  const [textCountResult, setTextCountResult] = useState<TextCountResult | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth)
  const [editorSplitRatio, setEditorSplitRatio] = useState(readStoredEditorSplitRatio)
  const appShellRef = useRef<HTMLElement | null>(null)
  const mainPaneSlotRef = useRef<HTMLDivElement | null>(null)
  const splitPaneSlotRef = useRef<HTMLDivElement | null>(null)
  const newNoteInputRef = useRef<HTMLInputElement | null>(null)
  const tabsRef = useRef<OpenTab[]>([])
  const latestBodiesRef = useRef<Map<string, string>>(new Map())
  const activeIdRef = useRef<string | null>(null)
  const activePathRef = useRef<string | null>(null)
  const activeIdHistoryRef = useRef<string[]>([])
  const lastMainActiveIdRef = useRef<string | null>(null)
  const splitOpenRef = useRef(false)
  const splitPathRef = useRef<string | null>(null)
  const splitModeRef = useRef<EditorMode | null>(null)
  const expandedRef = useRef<Set<string>>(new Set())
  const pinnedPathsRef = useRef<Set<string>>(new Set())
  const recentPathsRef = useRef<string[]>([])
  const fileQueryRef = useRef('')
  const contentUsesFileFilterRef = useRef(false)
  const touchedPathsRef = useRef<Set<string>>(new Set())
  const vaultRef = useRef<VaultInfo | null>(null)
  const closingRef = useRef(false)
  const activeTabHintRef = useRef<{ path: string; mode: EditorMode } | null>(null)

  const latestTabBody = useCallback((tab: OpenTab) => (
    latestBodiesRef.current.get(tab.id) ?? tab.body
  ), [])

  const updateCanvasMarkdownDisplayMode = useCallback((mode: CanvasMarkdownDisplayMode) => {
    setCanvasMarkdownDisplayMode(mode)
    try {
      localStorage.setItem(CANVAS_MARKDOWN_DISPLAY_KEY, mode)
    } catch {
      // Ignore storage failures; the in-memory setting still applies.
    }
  }, [])

  const updateCanvasDocumentDisplayMode = useCallback((mode: CanvasDocumentDisplayMode) => {
    setCanvasDocumentDisplayMode(mode)
    try {
      localStorage.setItem(CANVAS_DOCUMENT_DISPLAY_KEY, mode)
    } catch {
      // Ignore storage failures; the in-memory setting still applies.
    }
  }, [])

  const isTabDirty = useCallback((tab: OpenTab) => (
    latestTabBody(tab) !== tab.savedBody
  ), [latestTabBody])

  const rememberRecentPath = useCallback((path: string) => {
    if (!profile.persistRecentFiles) return
    setRecentPaths((prev) => {
      const next = [path, ...prev.filter((candidate) => !samePath(candidate, path))]
      const trimmed = next.slice(0, MAX_RECENT_FILES)
      recentPathsRef.current = trimmed
      return trimmed
    })
  }, [profile.persistRecentFiles])

  const forgetRecentPath = useCallback((path: string) => {
    if (!profile.persistRecentFiles) return
    setRecentPaths((prev) => {
      const next = prev.filter((candidate) => !samePath(candidate, path))
      recentPathsRef.current = next
      return next
    })
  }, [profile.persistRecentFiles])

  const mainTab = useMemo(
    () => {
      const byId = tabs.find((tab) => tab.id === activeId)
      if (byId) return byId
      const hint = activeTabHintRef.current
      if (!hint) return null
      const activeMode = activeId?.startsWith('track:')
        ? 'track'
        : activeId?.startsWith('canvas:')
          ? 'canvas'
          : activeId?.startsWith('markdown:')
            ? 'markdown'
            : hint.mode
      return tabs.find((tab) => tab.mode === activeMode && samePath(tab.path, hint.path)) ?? null
    },
    [activeId, tabs]
  )
  const splitTab = useMemo(
    () => tabs.find((tab) => tab.id === splitId) ?? null,
    [splitId, tabs]
  )
  const splitCandidates = useMemo(
    () => tabs.filter((tab) => tab.id !== activeId),
    [activeId, tabs]
  )
  const activeTab = focusedPane === 'split' ? splitTab : mainTab
  const activePath = activeTab?.path ?? null
  const dirty = !!activeTab && isTabDirty(activeTab)
  const activeOutOfVault = activeTab?.outOfVault === true
  const activePrintBody = activeTab ? latestTabBody(activeTab) : ''
  const gitHasDirtyFiles = vault?.git.status === 'dirtyOnInuse' || vault?.git.status === 'needsCheckpoint'

  useEffect(() => {
    if (activeTab) activeTabHintRef.current = { path: activeTab.path, mode: activeTab.mode }
    if (mainTab && mainTab.id !== activeId) setActiveId(mainTab.id)
    activeIdRef.current = activeTab?.id ?? activeId
    activePathRef.current = activeTab?.path ?? null
  }, [activeId, activeTab, mainTab])

  useEffect(() => {
    setTextCountResult(null)
  }, [activeTab?.id, workspaceMode])

  useEffect(() => {
    const previousId = lastMainActiveIdRef.current
    if (previousId && previousId !== activeId) {
      activeIdHistoryRef.current = [
        previousId,
        ...activeIdHistoryRef.current.filter((id) => id !== previousId)
      ]
    }
    lastMainActiveIdRef.current = activeId

    const liveIds = new Set(tabs.map((tab) => tab.id))
    activeIdHistoryRef.current = activeIdHistoryRef.current.filter(
      (id) => id !== activeId && liveIds.has(id)
    )
  }, [activeId, tabs])

  useEffect(() => {
    if (focusedPane === 'split' && !splitOpen) setFocusedPane('main')
  }, [focusedPane, splitOpen])

  useEffect(() => {
    if (!newNoteOpen) return
    window.requestAnimationFrame(() => {
      newNoteInputRef.current?.focus()
      newNoteInputRef.current?.select()
    })
  }, [newNoteOpen])

  useEffect(() => {
    splitOpenRef.current = splitOpen
    splitPathRef.current = splitOpen ? splitTab?.path ?? null : null
    splitModeRef.current = splitOpen ? splitTab?.mode ?? null : null
  }, [splitOpen, splitTab])

  const selectMainTab = useCallback((id: string | null) => {
    if (id === splitId) setSplitId(null)
    setActiveId(id)
    setFocusedPane('main')
  }, [splitId])

  useEffect(() => {
    if (splitId && splitId === activeId) setSplitId(null)
  }, [activeId, splitId])

  const closeSplitPane = useCallback(() => {
    setSplitOpen(false)
    setSplitId(null)
    setFocusedPane('main')
  }, [])

  const closeMainPane = useCallback(() => {
    if (!splitOpen || !splitTab) return
    setActiveId(splitTab.id)
    setSplitId(null)
    setSplitOpen(false)
    setFocusedPane('main')
  }, [splitOpen, splitTab])

  const moveMainTabToSplit = useCallback(() => {
    if (!mainTab) return
    setSplitOpen(true)
    if (splitTab) {
      setActiveId(splitTab.id)
      setSplitId(mainTab.id)
    } else {
      const replacement = tabs.find((tab) => tab.id !== mainTab.id) ?? null
      setActiveId(replacement?.id ?? null)
      setSplitId(mainTab.id)
    }
    setFocusedPane('split')
  }, [mainTab, splitTab, tabs])

  const toggleSplitPane = useCallback(() => {
    if (splitOpen) {
      closeSplitPane()
      return
    }
    setSplitOpen(true)
    setSplitId(null)
    setFocusedPane('split')
  }, [closeSplitPane, splitOpen])

  const printActiveDocument = useCallback(async (mode: 'raw' | 'preview') => {
    if (!activeTab || workspaceMode !== 'notes') return
    if (mode === 'preview' && !isTypstPath(activeTab.path)) {
      await import('./preview/MarkdownPreview')
    }
    const body = document.body
    const cleanup = () => {
      if (body.dataset.printMode === mode) delete body.dataset.printMode
      window.removeEventListener('afterprint', cleanup)
    }
    body.dataset.printMode = mode
    window.addEventListener('afterprint', cleanup)
    window.setTimeout(cleanup, 30000)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print())
    })
  }, [activeTab, workspaceMode])

  const clearStatusLater = useCallback((kind: 'error' | 'notice', message: string) => {
    window.setTimeout(() => {
      if (kind === 'error') {
        setError((current) => (current === message ? null : current))
      } else {
        setNotice((current) => (current === message ? null : current))
      }
    }, 7000)
  }, [])

  const exportPreviewPdf = useCallback(async () => {
    if (!activeTab || activeTab.outOfVault || workspaceMode !== 'notes') return
    setError(null)
    setNotice(null)
    try {
      const result = await invoke<PdfExportResult>('export_pdf', {
        path: activeTab.path,
        body: latestTabBody(activeTab)
      })
      const message = `Exported PDF: ${result.path}`
      setNotice(message)
      clearStatusLater('notice', message)
    } catch (err) {
      const message = String(err)
      setNotice(null)
      setError(message)
      clearStatusLater('error', message)
    }
  }, [activeTab, clearStatusLater, latestTabBody, workspaceMode])

  useEffect(() => {
    void invoke<AppProfile>('load_profile')
      .then((profile) => {
        setProfile(profile)
        if (!profile.persistRecentFiles) {
          recentPathsRef.current = []
          setRecentPaths([])
        }
      })
      .catch((err) => setError(String(err)))
  }, [])

  const updateProfile = useCallback((nextProfile: AppProfile) => {
    setProfile(nextProfile)
    void invoke<AppProfile>('save_profile', { profile: nextProfile })
      .then((savedProfile) => {
        setProfile(savedProfile)
        if (!savedProfile.persistRecentFiles) {
          recentPathsRef.current = []
          setRecentPaths([])
          const currentVault = vaultRef.current
          if (currentVault) {
            const existing = readStoredSession(currentVault.root)
            if (existing) writeStoredSession(currentVault.root, { ...existing, recentPaths: [] })
          }
        }
      })
      .catch((err) => setError(String(err)))
  }, [])

  useEffect(() => {
    tabsRef.current = tabs
    const liveIds = new Set(tabs.map((tab) => tab.id))
    for (const id of latestBodiesRef.current.keys()) {
      if (!liveIds.has(id)) latestBodiesRef.current.delete(id)
    }
    for (const tab of tabs) {
      const latestBody = latestBodiesRef.current.get(tab.id)
      if (latestBody == null || latestBody === tab.savedBody || tab.body !== tab.savedBody) {
        latestBodiesRef.current.set(tab.id, tab.body)
      }
    }
  }, [isTabDirty, tabs])

  useEffect(() => {
    recentPathsRef.current = recentPaths
  }, [recentPaths])

  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])

  useEffect(() => {
    pinnedPathsRef.current = pinnedPaths
  }, [pinnedPaths])

  useEffect(() => {
    fileQueryRef.current = fileQuery
  }, [fileQuery])

  useEffect(() => {
    contentUsesFileFilterRef.current = contentUsesFileFilter
  }, [contentUsesFileFilter])

  useEffect(() => {
    touchedPathsRef.current = touchedPaths
  }, [touchedPaths])

  useEffect(() => {
    vaultRef.current = vault
    currentPathsCaseSensitive = vault?.pathsCaseSensitive ?? true
  }, [vault])

  useEffect(() => {
    if (vault) return
    setSplitOpen(false)
    setSplitId(null)
    setFocusedPane('main')
    setWorkspaceMode('notes')
    setCalendarEvents([])
    setShowToCommit(false)
    setToCommitFiles([])
  }, [vault])

  useEffect(() => {
    if (gitHasDirtyFiles) return
    setShowToCommit(false)
    setToCommitFiles([])
  }, [gitHasDirtyFiles])

  const refreshTree = useCallback(async () => {
    const next = await invoke<TreeEntry[]>('list_tree')
    setTree(next)
    setExpanded((prev) => {
      if (prev.size > 0) return prev
      return new Set(next.filter((entry) => entry.kind === 'dir').map((entry) => entry.path))
    })
  }, [])

  const loadCalendarEvents = useCallback(async () => {
    const events = await invoke<CalendarEvent[]>('read_calendar_events')
    setCalendarEvents(normalizeCalendarEvents(events))
  }, [])

  const saveCalendarEvents = useCallback(async (events: CalendarEvent[]) => {
    const normalized = normalizeCalendarEvents(events)
    setCalendarEvents(normalized)
    setCalendarSaving(true)
    setError(null)
    try {
      await invoke('save_calendar_events', { events: normalized })
      setTouchedPaths((prev) => new Set([...prev, '.vault-calendar/events.json']))
    } catch (err) {
      setError(String(err))
    } finally {
      setCalendarSaving(false)
    }
  }, [])

  const loadWikiCompletionBody = useCallback(async (path: string): Promise<string | null> => {
    const openTab = tabsRef.current.find((tab) => samePath(tab.path, path) && (tab.mode === 'markdown' || tab.mode === 'canvas'))
    if (openTab) return latestBodiesRef.current.get(openTab.id) ?? openTab.body
    try {
      const note = await invoke<NoteContent>('read_note', { path })
      return note.body
    } catch {
      return null
    }
  }, [])

  const loadStoredSession = useCallback(async (root: string): Promise<RestoredSession | null> => {
    const session = readStoredSession(root)
    if (!session) return null

    const storedTabs = session.openTabs ?? session.openPaths?.map((path) => ({ path, mode: 'markdown' as const })) ?? []
    const restoredTabs: OpenTab[] = []
    for (const storedTab of storedTabs) {
      try {
        const note = await invoke<NoteContent>('read_note', { path: storedTab.path })
        const restoredMode = note.outOfVault ? 'markdown' : storedTab.mode
        const trackState = restoredMode === 'track'
          ? await loadOrCreateTrackState(note.path, note.body)
          : undefined
        const id = tabId(note.path, restoredMode)
        const existingIndex = restoredTabs.findIndex((tab) => tab.id === id)
        const restoredTab = {
          id,
          path: note.path,
          mode: restoredMode,
          body: note.body,
          savedBody: note.body,
          bodyVersion: 0,
          updatedAt: note.updatedAt,
          size: note.size,
          trackState,
          outOfVault: note.outOfVault
        }
        if (existingIndex >= 0) restoredTabs[existingIndex] = restoredTab
        else restoredTabs.push(restoredTab)
      } catch {
        // The file may have been moved or deleted outside the app.
      }
    }
    const active = restoredTabs.find((tab) => tab.id === session.activeId)
      ?? restoredTabs.find((tab) => session.activePath != null && samePath(tab.path, session.activePath))
      ?? restoredTabs[0]
      ?? null
    const split = session.splitOpen
      ? restoredTabs.find((tab) =>
          session.splitPath != null &&
          tab.mode === (session.splitMode ?? 'markdown') &&
          samePath(tab.path, session.splitPath)
        ) ?? null
      : null
    const splitId = split && active && split.id !== active.id ? split.id : null
    return {
      tabs: restoredTabs,
      activeId: active?.id ?? null,
      splitOpen: session.splitOpen === true,
      splitId,
      expanded: session.expanded,
      pinnedPaths: session.pinnedPaths ?? [],
      recentPaths: profile.persistRecentFiles
        ? uniquePaths(session.recentPaths ?? []).slice(0, MAX_RECENT_FILES)
        : [],
      fileQuery: session.fileQuery,
      contentUsesFileFilter: session.contentUsesFileFilter
    }
  }, [profile.persistRecentFiles])

  const reconcileExternalTab = useCallback(async (path: string) => {
    try {
      const note = await invoke<NoteContent>('read_note', { path })
      const activeTabForPath = tabs.find((tab) => tab.id === activeId && samePath(tab.path, path))
      setTabs((prev) =>
        prev.map((tab) => {
          if (!samePath(tab.path, path)) return tab
          const nextId = tabId(note.path, tab.mode)
          if (tab.savedBody === note.body) {
            return { ...tab, path: note.path, id: nextId, updatedAt: note.updatedAt, size: note.size, externalStatus: undefined, outOfVault: note.outOfVault }
          }
          return { ...tab, path: note.path, id: nextId, externalStatus: 'changed', outOfVault: note.outOfVault }
        })
      )
      if (activeTabForPath) setActiveId(tabId(note.path, activeTabForPath.mode))
      setSplitId((current) => {
        const splitTabForPath = tabs.find((tab) => tab.id === current && samePath(tab.path, path))
        return splitTabForPath ? tabId(note.path, splitTabForPath.mode) : current
      })
    } catch {
      setTabs((prev) =>
        prev.map((tab) => (samePath(tab.path, path) ? { ...tab, externalStatus: 'deleted' } : tab))
      )
    }
  }, [activeId, tabs])

  const openVault = useCallback(async () => {
    const trimmed = vaultPath.trim()
    if (!trimmed) {
      setError('Enter a vault folder path.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const nextVault = await invoke<VaultInfo>('open_vault', { path: trimmed })
      let openedVault = nextVault
      localStorage.setItem(LAST_VAULT_KEY, trimmed)
      if (nextVault.git.status === 'needsCheckpoint') {
        const proceed = window.confirm(
          `${nextVault.git.message}\n\nCreate a checkpoint commit and switch to inuse?`
        )
        if (proceed) {
          const git = await invoke<GitInfo>('checkpoint_and_switch_inuse')
          openedVault = { ...nextVault, git }
        }
      }
      vaultRef.current = openedVault
      currentPathsCaseSensitive = openedVault.pathsCaseSensitive
      const restoredSession = await loadStoredSession(openedVault.root)
      setVault(openedVault)
      setTabs(restoredSession?.tabs ?? [])
      setActiveId(restoredSession?.activeId ?? null)
      setSplitOpen(restoredSession?.splitOpen ?? false)
      setSplitId(restoredSession?.splitId ?? null)
      setFocusedPane(restoredSession?.splitOpen ? 'split' : 'main')
      setExpanded(new Set(restoredSession?.expanded ?? []))
      setPinnedPaths(new Set(restoredSession?.pinnedPaths ?? []))
      recentPathsRef.current = profile.persistRecentFiles ? restoredSession?.recentPaths ?? [] : []
      setRecentPaths(profile.persistRecentFiles ? restoredSession?.recentPaths ?? [] : [])
      setFileQuery(restoredSession?.fileQuery ?? '')
      setContentUsesFileFilter(restoredSession?.contentUsesFileFilter ?? false)
      setContentMatches([])
      await refreshTree()
      await loadCalendarEvents()
      await invoke('watch_vault')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [loadCalendarEvents, loadStoredSession, profile.persistRecentFiles, refreshTree, vaultPath])

  useEffect(() => {
    if (!vault) return
    let refreshTimer: number | null = null
    const unlistenPromise = listen<VaultChangeEvent>('vault://changed', (event) => {
      const changedPaths = new Set(event.payload.paths.map(pathKey))
      if (refreshTimer != null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        void refreshTree()
        refreshTimer = null
      }, 180)

      for (const tab of tabs) {
        if (changedPaths.has(pathKey(tab.path))) {
          void reconcileExternalTab(tab.path)
        }
      }
      if (changedPaths.has(pathKey('.vault-calendar/events.json'))) {
        void loadCalendarEvents()
      }
    })

    return () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer)
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [loadCalendarEvents, reconcileExternalTab, refreshTree, tabs, vault])

  useEffect(() => {
    if (!vault?.git.isRepo) return
    let stopped = false

    const refreshGitInfo = async () => {
      try {
        const git = await invoke<GitInfo>('refresh_git_info')
        if (!stopped) {
          setVault((prev) => (prev ? { ...prev, git } : prev))
        }
      } catch (err) {
        if (!stopped) setError(String(err))
      }
    }

    const timer = window.setInterval(() => {
      void refreshGitInfo()
    }, profile.gitStatusPollIntervalMs)

    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [profile.gitStatusPollIntervalMs, vault?.git.isRepo, vault?.root])

  useEffect(() => {
    if (!vault) return
    writeStoredSession(vault.root, {
      openTabs: tabs.map((tab) => ({ path: tab.path, mode: tab.mode })),
      activeId,
      activePath,
      splitOpen,
      splitPath: splitOpen ? splitTab?.path ?? null : null,
      splitMode: splitOpen ? splitTab?.mode ?? null : null,
      expanded: [...expanded],
      pinnedPaths: [...pinnedPaths],
      recentPaths: profile.persistRecentFiles ? recentPaths : [],
      fileQuery,
      contentUsesFileFilter
    })
  }, [activeId, activePath, contentUsesFileFilter, expanded, fileQuery, pinnedPaths, profile.persistRecentFiles, recentPaths, splitOpen, splitTab, tabs, vault])

  const openNote = useCallback(async (destination: string, offset: number | null = null) => {
    const { path, heading } = splitWikiDestination(destination)
    setWorkspaceMode('notes')
    const existing = tabs.find((tab) => tab.mode === 'markdown' && samePath(tab.path, path))
    if (existing) {
      selectMainTab(existing.id)
      setJumpOffset(resolveNoteJumpOffset(latestTabBody(existing), heading, offset))
      rememberRecentPath(existing.path)
      return
    }
    const rawSource = tabs.find((tab) => tab.mode === 'canvas' && samePath(tab.path, path))
    if (rawSource) {
      const id = tabId(rawSource.path, 'markdown')
      const body = latestTabBody(rawSource)
      latestBodiesRef.current.set(id, body)
      setTabs((prev) => [
        ...prev.filter((tab) => tab.id !== id),
        {
          id,
          path: rawSource.path,
          mode: 'markdown',
          body,
          savedBody: rawSource.savedBody,
          bodyVersion: rawSource.bodyVersion,
          updatedAt: rawSource.updatedAt,
          size: rawSource.size,
          externalStatus: rawSource.externalStatus,
          outOfVault: rawSource.outOfVault
        }
      ])
      selectMainTab(id)
      setJumpOffset(resolveNoteJumpOffset(body, heading, offset))
      rememberRecentPath(rawSource.path)
      return
    }
    const conflicting = tabs.find((tab) => samePath(tab.path, path) && tab.mode !== 'markdown' && !isRawSourceMode(tab.mode) && isTabDirty(tab))
    if (conflicting) {
      const proceed = window.confirm(`${path} is modified in another mode. Save or close it before opening Markdown mode?`)
      if (!proceed) return
    }
    setBusy(true)
    setError(null)
    try {
      const note = await invoke<NoteContent>('read_note', { path })
      const id = tabId(note.path, 'markdown')
      setTabs((prev) => [
        ...prev.filter((tab) => tab.id !== id),
        {
          id,
          path: note.path,
          mode: 'markdown',
          body: note.body,
          savedBody: note.body,
          bodyVersion: 0,
          updatedAt: note.updatedAt,
          size: note.size,
          outOfVault: note.outOfVault
        }
      ])
      selectMainTab(id)
      setJumpOffset(resolveNoteJumpOffset(note.body, heading, offset))
      rememberRecentPath(note.path)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [isTabDirty, latestTabBody, rememberRecentPath, selectMainTab, tabs])

  const openTrackNote = useCallback(async (path: string) => {
    setWorkspaceMode('notes')
    if (tabs.some((tab) => samePath(tab.path, path) && tab.outOfVault)) {
      setError('Track Changes is disabled for files outside the vault.')
      return
    }
    const existing = tabs.find((tab) => tab.mode === 'track' && samePath(tab.path, path))
    if (existing) {
      selectMainTab(existing.id)
      rememberRecentPath(existing.path)
      return
    }
    const markdownTab = tabs.find((tab) => samePath(tab.path, path) && tab.mode === 'markdown')
    if (markdownTab && profile.closeMarkdownBeforeTrack) {
      const closeMarkdown = window.confirm(`${path} is already open in Markdown mode. Close that tab before opening Track mode?`)
      if (closeMarkdown) {
        const dirtyMarkdown = isTabDirty(markdownTab)
        const canClose = !dirtyMarkdown || window.confirm(`Close ${markdownTab.path} with unsaved changes?`)
        if (canClose) {
          setTabs((prev) => {
            const index = prev.findIndex((tab) => tab.id === markdownTab.id)
            const next = prev.filter((tab) => tab.id !== markdownTab.id)
            if (activeId === markdownTab.id) {
              const replacement = next[Math.min(index, next.length - 1)] ?? null
              setActiveId(replacement?.id ?? null)
            }
            if (splitId === markdownTab.id) setSplitId(null)
            return next
          })
        }
      }
    }
    setBusy(true)
    setError(null)
    try {
      const note = await invoke<NoteContent>('read_note', { path })
      if (note.outOfVault) {
        setError('Track Changes is disabled for files outside the vault.')
        return
      }
      const trackState = await loadOrCreateTrackState(note.path, note.body)
      const id = tabId(note.path, 'track')
      setTabs((prev) => [
        ...prev.filter((tab) => tab.id !== id),
        {
          id,
          path: note.path,
          mode: 'track',
          body: note.body,
          savedBody: note.body,
          bodyVersion: 0,
          updatedAt: note.updatedAt,
          size: note.size,
          trackState,
          outOfVault: note.outOfVault
        }
      ])
      selectMainTab(id)
      rememberRecentPath(note.path)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activeId, isTabDirty, profile.closeMarkdownBeforeTrack, rememberRecentPath, selectMainTab, splitId, tabs])

  const openCanvasNote = useCallback(async (path: string) => {
    setWorkspaceMode('notes')
    if (tabs.some((tab) => samePath(tab.path, path) && tab.outOfVault)) {
      setError('Canvas is disabled for files outside the vault.')
      return
    }
    const existing = tabs.find((tab) => tab.mode === 'canvas' && samePath(tab.path, path))
    if (existing) {
      selectMainTab(existing.id)
      rememberRecentPath(existing.path)
      return
    }
    const rawSource = tabs.find((tab) => tab.mode === 'markdown' && samePath(tab.path, path))
    if (rawSource) {
      const id = tabId(rawSource.path, 'canvas')
      const body = latestTabBody(rawSource)
      latestBodiesRef.current.set(id, body)
      setTabs((prev) => [
        ...prev.filter((tab) => tab.id !== id),
        {
          id,
          path: rawSource.path,
          mode: 'canvas',
          body,
          savedBody: rawSource.savedBody,
          bodyVersion: rawSource.bodyVersion,
          updatedAt: rawSource.updatedAt,
          size: rawSource.size,
          externalStatus: rawSource.externalStatus,
          outOfVault: rawSource.outOfVault
        }
      ])
      selectMainTab(id)
      rememberRecentPath(rawSource.path)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const note = await invoke<NoteContent>('read_note', { path })
      if (note.outOfVault) {
        setError('Canvas is disabled for files outside the vault.')
        return
      }
      const id = tabId(note.path, 'canvas')
      setTabs((prev) => [
        ...prev.filter((tab) => tab.id !== id),
        {
          id,
          path: note.path,
          mode: 'canvas',
          body: note.body,
          savedBody: note.body,
          bodyVersion: 0,
          updatedAt: note.updatedAt,
          size: note.size,
          outOfVault: note.outOfVault
        }
      ])
      selectMainTab(id)
      rememberRecentPath(note.path)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [rememberRecentPath, selectMainTab, tabs])

  const openSearchMatch = useCallback((match: ContentMatch) => {
    const query = contentQuery.trim()
    setSearchHighlight(query ? { path: match.path, query, offset: match.offset } : null)
    void openNote(match.path, match.offset)
  }, [contentQuery, openNote])

  const saveActive = useCallback(async () => {
    if (!activeTab) return
    const requestedBody = latestTabBody(activeTab)
    setBusy(true)
    setError(null)
    try {
      const result = await saveTabBodyWithConflictCheck(activeTab, requestedBody)
      if (!result.saved) {
        if (!activeTab.outOfVault && activeTab.mode === 'track' && activeTab.trackState) {
          await invoke('save_track_state', { path: activeTab.path, trackState: activeTab.trackState })
        }
        const conflictPath = result.conflictPath
        if (conflictPath) setTouchedPaths((prev) => new Set([...prev, conflictPath]))
        setTabs((prev) => prev.map((tab) => (tab.id === activeTab.id ? { ...tab, externalStatus: 'changed' } : tab)))
        await refreshTree()
        setError(result.message)
        return
      }
      const saved = result.note
      const savedId = tabId(saved.path, activeTab.mode)
      if (!activeTab.outOfVault && activeTab.mode === 'track' && activeTab.trackState) {
        await invoke('save_track_state', { path: activeTab.path, trackState: activeTab.trackState })
      }
      setTabs((prev) =>
        prev.map((tab) =>
          samePath(tab.path, activeTab.path) && (activeTab.mode === 'markdown' || activeTab.mode === 'canvas') && (tab.mode === 'markdown' || tab.mode === 'canvas')
            ? (() => {
                const nextId = tabId(saved.path, tab.mode)
                const latestBody = latestBodiesRef.current.get(tab.id) ?? tab.body
                const nextBody = latestBody === requestedBody ? saved.body : latestBody
                latestBodiesRef.current.delete(tab.id)
                latestBodiesRef.current.set(nextId, nextBody)
                return {
                  ...tab,
                  id: nextId,
                  path: saved.path,
                  body: nextBody,
                  savedBody: saved.body,
                  updatedAt: saved.updatedAt,
                  size: saved.size,
                  externalStatus: undefined,
                  outOfVault: saved.outOfVault
                }
              })()
            : tab.id === activeTab.id
              ? (() => {
                  const latestBody = latestBodiesRef.current.get(activeTab.id) ?? tab.body
                  const nextBody = latestBody === requestedBody ? saved.body : latestBody
                  latestBodiesRef.current.delete(activeTab.id)
                  latestBodiesRef.current.set(savedId, nextBody)
                  return {
                    ...tab,
                    id: savedId,
                    path: saved.path,
                    body: nextBody,
                    savedBody: saved.body,
                    updatedAt: saved.updatedAt,
                    size: saved.size,
                    externalStatus: undefined,
                    outOfVault: saved.outOfVault
                  }
                })()
            : tab
        )
      )
      setActiveId((current) => (current === activeTab.id ? savedId : current))
      setSplitId((current) => (current === activeTab.id ? savedId : current))
      if (!saved.outOfVault) setTouchedPaths((prev) => new Set([...prev, saved.path]))
      rememberRecentPath(saved.path)
      if (!saved.outOfVault) await refreshTree()
      if (activeTab.mode === 'markdown') setEditorFocusRequest((request) => request + 1)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activeTab, latestTabBody, refreshTree, rememberRecentPath])

  const saveTab = useCallback(async (tab: OpenTab) => {
    const requestedBody = latestTabBody(tab)
    const result = await saveTabBodyWithConflictCheck(tab, requestedBody)
    if (!result.saved) {
      if (!tab.outOfVault && tab.mode === 'track' && tab.trackState) {
        await invoke('save_track_state', { path: tab.path, trackState: tab.trackState })
      }
      const conflictPath = result.conflictPath
      if (conflictPath) setTouchedPaths((prev) => new Set([...prev, conflictPath]))
      setTabs((prev) => prev.map((item) => (item.id === tab.id ? { ...item, externalStatus: 'changed' } : item)))
      await refreshTree()
      setError(result.message)
      return
    }
    const saved = result.note
    const savedId = tabId(saved.path, tab.mode)
    if (!tab.outOfVault && tab.mode === 'track' && tab.trackState) {
      await invoke('save_track_state', { path: tab.path, trackState: tab.trackState })
    }
    setTabs((prev) =>
      prev.map((item) =>
        samePath(item.path, tab.path) && (tab.mode === 'markdown' || tab.mode === 'canvas') && (item.mode === 'markdown' || item.mode === 'canvas')
          ? (() => {
              const nextId = tabId(saved.path, item.mode)
              const latestBody = latestBodiesRef.current.get(item.id) ?? item.body
              const nextBody = latestBody === requestedBody ? saved.body : latestBody
              latestBodiesRef.current.delete(item.id)
              latestBodiesRef.current.set(nextId, nextBody)
              return {
                ...item,
                id: nextId,
                path: saved.path,
                body: nextBody,
                savedBody: saved.body,
                updatedAt: saved.updatedAt,
                size: saved.size,
                externalStatus: undefined,
                outOfVault: saved.outOfVault
              }
            })()
          : item.id === tab.id
            ? (() => {
                const latestBody = latestBodiesRef.current.get(tab.id) ?? item.body
                const nextBody = latestBody === requestedBody ? saved.body : latestBody
                latestBodiesRef.current.delete(tab.id)
                latestBodiesRef.current.set(savedId, nextBody)
                return {
                  ...item,
                  id: savedId,
                  path: saved.path,
                  body: nextBody,
                  savedBody: saved.body,
                  updatedAt: saved.updatedAt,
                  size: saved.size,
                  externalStatus: undefined,
                  outOfVault: saved.outOfVault
                }
              })()
          : item
      )
    )
    setActiveId((current) => (current === tab.id ? savedId : current))
    setSplitId((current) => (current === tab.id ? savedId : current))
    if (!saved.outOfVault) setTouchedPaths((prev) => new Set([...prev, saved.path]))
    rememberRecentPath(saved.path)
    if (!saved.outOfVault) await refreshTree()
  }, [latestTabBody, refreshTree, rememberRecentPath])

  const checkpointNow = useCallback(async () => {
    if (!vault?.git.isRepo || vault.git.currentBranch !== 'inuse') return
    const paths = [...touchedPaths]
    if (paths.length === 0) return
    const touched = new Set(paths)
    setBusy(true)
    setError(null)
    try {
      for (const tab of tabs) {
        if (!tab.outOfVault && tab.mode === 'track' && tab.trackState && hasPath(touched, tab.path)) {
          await invoke('save_track_state', { path: tab.path, trackState: tab.trackState })
        }
      }
      const git = await invoke<GitInfo>('checkpoint_inuse', { paths: uniquePaths(paths) })
      setVault((prev) => (prev ? { ...prev, git } : prev))
      setTouchedPaths(new Set())
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [tabs, touchedPaths, vault])

  const checkpointVaultNow = useCallback(async () => {
    if (!vault?.git.isRepo) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      for (const tab of uniqueSaveTargets(tabs)) {
        if (isTabDirty(tab)) {
          const result = await saveTabBodyWithConflictCheck(tab, latestTabBody(tab))
          if (!result.saved) {
            throw new Error(result.message)
          }
        }
        if (!tab.outOfVault && tab.mode === 'track' && tab.trackState) {
          await invoke('save_track_state', { path: tab.path, trackState: tab.trackState })
        }
      }
      const git = await invoke<GitInfo>('checkpoint_vault')
      setVault((prev) => (prev ? { ...prev, git } : prev))
      setTouchedPaths(new Set())
      await refreshTree()
      const message = git.message || 'Checkpoint committed.'
      setNotice(message)
      clearStatusLater('notice', message)
    } catch (err) {
      const message = String(err)
      setError(message)
      clearStatusLater('error', message)
    } finally {
      setBusy(false)
    }
  }, [clearStatusLater, isTabDirty, latestTabBody, refreshTree, saveTabBodyWithConflictCheck, tabs, vault])

  const toggleToCommitFiles = useCallback(async () => {
    if (!gitHasDirtyFiles || loadingToCommit) return
    if (showToCommit) {
      setShowToCommit(false)
      return
    }
    setLoadingToCommit(true)
    setError(null)
    try {
      const files = await invoke<DirtyGitFile[]>('dirty_git_files')
      setToCommitFiles(files)
      setShowToCommit(true)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingToCommit(false)
    }
  }, [gitHasDirtyFiles, loadingToCommit, showToCommit])

  const finalizeBeforeClose = useCallback(async () => {
    const vault = vaultRef.current
    if (vault) {
      writeStoredSession(vault.root, {
        openTabs: tabsRef.current.map((tab) => ({ path: tab.path, mode: tab.mode })),
        activeId: activeIdRef.current,
        activePath: activePathRef.current,
        splitOpen: splitOpenRef.current,
        splitPath: splitPathRef.current,
        splitMode: splitModeRef.current,
        expanded: [...expandedRef.current],
        pinnedPaths: [...pinnedPathsRef.current],
        recentPaths: profile.persistRecentFiles ? recentPathsRef.current : [],
        fileQuery: fileQueryRef.current,
        contentUsesFileFilter: contentUsesFileFilterRef.current
      })
    }
    const paths = new Set(touchedPathsRef.current)

    if (vault?.git.isRepo && vault.git.currentBranch === 'inuse' && paths.size > 0) {
      await invoke<GitInfo>('checkpoint_inuse', { paths: uniquePaths([...paths]) })
    }
  }, [])

  const openNewNoteDialog = useCallback(() => {
    if (!vault) return
    setNewNotePath(fileQuery ? `${fileQuery}.md` : 'untitled.md')
    setNewNoteError(null)
    setNewNoteOpen(true)
  }, [fileQuery, vault])

  const createNoteAction = useCallback(async () => {
    const path = newNotePath.trim()
    if (!path) {
      setNewNoteError('Enter a note path.')
      return
    }
    setBusy(true)
    setError(null)
    setNewNoteError(null)
    try {
      const result = await invoke<CreateNoteResult>('create_note', { path, body: '' })
      const { note } = result
      setTabs((prev) => [
        ...prev.filter((tab) => tab.id !== tabId(note.path, 'markdown')),
        {
          id: tabId(note.path, 'markdown'),
          path: note.path,
          mode: 'markdown',
          body: note.body,
          savedBody: note.body,
          bodyVersion: 0,
          updatedAt: note.updatedAt,
          size: note.size,
          outOfVault: note.outOfVault
        }
      ])
      selectMainTab(tabId(note.path, 'markdown'))
      setJumpOffset(0)
      rememberRecentPath(note.path)
      if (!note.outOfVault) await refreshTree()
      if (!note.outOfVault && result.createdFolder) {
        const message = `Created folder: ${result.createdFolder}`
        setNotice(message)
        clearStatusLater('notice', message)
        setExpanded((prev) => new Set([...prev, ...folderAncestors(result.createdFolder ?? '')]))
      }
      setNewNoteOpen(false)
      setNewNotePath('')
    } catch (err) {
      setNewNoteError(String(err))
    } finally {
      setBusy(false)
    }
  }, [clearStatusLater, newNotePath, refreshTree, rememberRecentPath, selectMainTab])

  const renameNoteAction = useCallback(async (oldPath: string) => {
    const nextPath = window.prompt('Rename note path', oldPath)
    if (!nextPath || nextPath === oldPath) return
    const dirtyTabsForPath = tabs.filter((tab) => samePath(tab.path, oldPath) && isTabDirty(tab))
    if (dirtyTabsForPath.length > 0) {
      const proceed = window.confirm(`${oldPath} has unsaved changes. Save them before renaming?`)
      if (!proceed) return
    }
    setBusy(true)
    setError(null)
    try {
      for (const tab of dirtyTabsForPath) {
        const result = await saveTabBodyWithConflictCheck(tab, latestTabBody(tab))
        if (!result.saved) {
          const conflictPath = result.conflictPath
          if (conflictPath) setTouchedPaths((prev) => new Set([...prev, conflictPath]))
          setError(result.message)
          await refreshTree()
          return
        }
      }
      const note = await invoke<NoteContent>('rename_note', { oldPath, newPath: nextPath })
      setTabs((prev) =>
        prev.map((tab) =>
          samePath(tab.path, oldPath)
            ? {
                ...tab,
                id: tabId(note.path, tab.mode),
                path: note.path,
                body: note.body,
                savedBody: note.body,
                bodyVersion: tab.bodyVersion + 1,
                updatedAt: note.updatedAt,
                size: note.size,
                trackState: tab.trackState ? { ...tab.trackState, path: note.path } : undefined,
                outOfVault: note.outOfVault
              }
            : tab
        )
      )
      setActiveId((current) => {
        const activeTab = tabs.find((tab) => tab.id === current)
        return activeTab && samePath(activeTab.path, oldPath) ? tabId(note.path, activeTab.mode) : current
      })
      setSplitId((current) => {
        const activeTab = tabs.find((tab) => tab.id === current)
        return activeTab && samePath(activeTab.path, oldPath) ? tabId(note.path, activeTab.mode) : current
      })
      forgetRecentPath(oldPath)
      rememberRecentPath(note.path)
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [forgetRecentPath, isTabDirty, latestTabBody, refreshTree, rememberRecentPath, tabs])

  const deleteNoteAction = useCallback(async (path: string) => {
    const tab = tabs.find((tab) => samePath(tab.path, path))
    if (tab && isTabDirty(tab)) {
      const proceedDirty = window.confirm(`${path} has unsaved changes. Delete it anyway?`)
      if (!proceedDirty) return
    }
    const proceed = window.confirm(`Delete ${path}?`)
    if (!proceed) return
    setBusy(true)
    setError(null)
    try {
      await invoke('delete_note', { path })
      forgetRecentPath(path)
      setTabs((prev) => {
        const index = prev.findIndex((tab) => samePath(tab.path, path))
        const next = prev.filter((tab) => !samePath(tab.path, path))
        if (mainTab != null && samePath(mainTab.path, path)) {
          const replacement = next[Math.min(index, next.length - 1)] ?? null
          setActiveId(replacement?.id ?? null)
        }
        setSplitId((current) => {
          if (!current) return current
          const splitTab = prev.find((item) => item.id === current)
          return splitTab && samePath(splitTab.path, path) ? null : current
        })
        return next
      })
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [forgetRecentPath, isTabDirty, mainTab, refreshTree, tabs])

  const renameFolderAction = useCallback(async (oldPath: string) => {
    const nextPath = window.prompt('Rename folder path', oldPath)
    if (!nextPath || nextPath === oldPath) return
    const dirtyTabsInFolder = tabs.filter((tab) => isPathInsideFolder(tab.path, oldPath) && isTabDirty(tab))
    if (dirtyTabsInFolder.length > 0) {
      const proceed = window.confirm(`Folder ${oldPath} contains open notes with unsaved changes. Save them before renaming?`)
      if (!proceed) return
    }
    setBusy(true)
    setError(null)
    try {
      const savedBodiesById = new Map<string, string>()
      for (const tab of dirtyTabsInFolder) {
        const body = latestTabBody(tab)
        const result = await saveTabBodyWithConflictCheck(tab, body)
        if (!result.saved) {
          const conflictPath = result.conflictPath
          if (conflictPath) setTouchedPaths((prev) => new Set([...prev, conflictPath]))
          setError(result.message)
          await refreshTree()
          return
        }
        savedBodiesById.set(tab.id, result.note.body)
      }
      await invoke('rename_folder', { oldPath, newPath: nextPath })
      const normalizedNextPath = nextPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
      setTabs((prev) =>
        prev.map((tab) =>
          isPathInsideFolder(tab.path, oldPath)
            ? (() => {
                const nextTabPath = `${normalizedNextPath}/${tab.path.slice(oldPath.length + 1)}`
                const savedBody = savedBodiesById.get(tab.id)
                return {
                ...tab,
                path: nextTabPath,
                id: tabId(nextTabPath, tab.mode),
                body: savedBody ?? tab.body,
                savedBody: savedBody ?? tab.savedBody,
                trackState: tab.trackState
                  ? { ...tab.trackState, path: nextTabPath }
                  : undefined
                }
              })()
            : tab
        )
      )
      if (mainTab != null && isPathInsideFolder(mainTab.path, oldPath)) {
        setActiveId(tabId(`${normalizedNextPath}/${mainTab.path.slice(oldPath.length + 1)}`, mainTab.mode))
      }
      setSplitId((current) => {
        const splitTab = tabs.find((tab) => tab.id === current)
        if (!splitTab || !isPathInsideFolder(splitTab.path, oldPath)) return current
        return tabId(`${normalizedNextPath}/${splitTab.path.slice(oldPath.length + 1)}`, splitTab.mode)
      })
      setRecentPaths((prev) =>
        prev.map((path) =>
          isPathInsideFolder(path, oldPath)
            ? `${normalizedNextPath}/${path.slice(oldPath.length + 1)}`
            : path
        )
      )
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [isTabDirty, latestTabBody, mainTab, refreshTree, tabs])

  const deleteFolderAction = useCallback(async (path: string) => {
    const affectedDirty = tabs.some((tab) => isPathInsideFolder(tab.path, path) && isTabDirty(tab))
    if (affectedDirty) {
      const proceedDirty = window.confirm(`Folder ${path} contains open notes with unsaved changes. Delete anyway?`)
      if (!proceedDirty) return
    }
    const proceed = window.confirm(`Delete folder ${path} and everything inside it?`)
    if (!proceed) return
    setBusy(true)
    setError(null)
    try {
      await invoke('delete_folder', { path })
      setRecentPaths((prev) => prev.filter((recentPath) => !isPathInsideFolder(recentPath, path)))
      setTabs((prev) => prev.filter((tab) => !isPathInsideFolder(tab.path, path)))
      if (mainTab != null && isPathInsideFolder(mainTab.path, path)) setActiveId(null)
      setSplitId((current) => {
        const splitTab = tabs.find((tab) => tab.id === current)
        return splitTab && isPathInsideFolder(splitTab.path, path) ? null : current
      })
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [isTabDirty, mainTab, refreshTree, tabs])

  const closeTab = useCallback((id: string) => {
    const closing = tabs.find((tab) => tab.id === id)
    if (closing && isTabDirty(closing)) {
      const proceed = window.confirm(`Close ${closing.path} with unsaved changes?`)
      if (!proceed) return
    }
    setTabs((prev) => {
      const index = prev.findIndex((tab) => tab.id === id)
      const next = prev.filter((tab) => tab.id !== id)
      if (activeId === id) {
        const liveNextIds = new Set(next.map((tab) => tab.id))
        const recentId = activeIdHistoryRef.current.find((candidate) => liveNextIds.has(candidate)) ?? null
        const replacement = next.find((tab) => tab.id === recentId) ?? next[Math.min(index, next.length - 1)] ?? null
        setActiveId(replacement?.id ?? null)
        if (replacement?.id === splitId) setSplitId(null)
      }
      if (splitId === id) setSplitId(null)
      activeIdHistoryRef.current = activeIdHistoryRef.current.filter(
        (candidate) => candidate !== id && next.some((tab) => tab.id === candidate)
      )
      return next
    })
  }, [activeId, isTabDirty, splitId, tabs])

  const updateTabBody = useCallback((id: string, body: string) => {
    const sourceTab = tabsRef.current.find((tab) => tab.id === id)
    const syncSourceModes = sourceTab?.mode === 'markdown' || sourceTab?.mode === 'canvas'
    const syncedIds = syncSourceModes
      ? tabsRef.current
        .filter((tab) => samePath(tab.path, sourceTab.path) && (tab.mode === 'markdown' || tab.mode === 'canvas'))
        .map((tab) => tab.id)
      : [id]
    for (const syncedId of syncedIds) latestBodiesRef.current.set(syncedId, body)
    setTabs((prev) =>
      prev.map((tab) =>
        syncedIds.includes(tab.id)
          ? {
              ...tab,
              body,
              bodyVersion: body === tab.body ? tab.bodyVersion : tab.bodyVersion + 1
            }
          : tab
      )
    )
  }, [profile.persistRecentFiles])

  const updateTrackState = useCallback((id: string, trackState: TrackState) => {
    const sourceTab = tabsRef.current.find((tab) => tab.id === id)
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              trackState
            }
          : tab
      )
    )
    if (!sourceTab?.outOfVault) setTouchedPaths((prev) => new Set([...prev, trackState.path]))
  }, [])

  const togglePinnedPath = useCallback((path: string) => {
    setPinnedPaths((prev) => {
      const next = new Set([...prev].filter((pinnedPath) => !samePath(pinnedPath, path)))
      if (next.size === prev.size) next.add(path)
      return next
    })
  }, [])

  useEffect(() => {
    const dirtyTabs = uniqueSaveTargets(tabs.filter(isTabDirty))
    if (dirtyTabs.length === 0) return
    const timer = window.setTimeout(() => {
      for (const tab of dirtyTabs) {
        void saveTab(tab).catch((err) => setError(String(err)))
      }
    }, profile.autosaveDelayMs)
    return () => window.clearTimeout(timer)
  }, [isTabDirty, profile.autosaveDelayMs, saveTab, tabs])

  useEffect(() => {
    if (!vault?.git.isRepo || vault.git.currentBranch !== 'inuse') return
    if (touchedPaths.size === 0) return
    const timer = window.setTimeout(() => {
      void checkpointNow()
    }, profile.checkpointIntervalMs)
    return () => window.clearTimeout(timer)
  }, [checkpointNow, profile.checkpointIntervalMs, touchedPaths, vault])

  useEffect(() => {
    const appWindow = getCurrentWindow()
    let saveTimer: number | null = null

    const scheduleSave = () => {
      if (saveTimer != null) window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        void saveWindowPlacement(appWindow)
        saveTimer = null
      }, 250)
    }

    void restoreWindowPlacement(appWindow).catch(() => {
      // Bad saved geometry should not block startup.
    })

    const unlistenMoved = appWindow.onMoved(scheduleSave)
    const unlistenResized = appWindow.onResized(scheduleSave)

    return () => {
      if (saveTimer != null) window.clearTimeout(saveTimer)
      void unlistenMoved.then((unlisten) => unlisten())
      void unlistenResized.then((unlisten) => unlisten())
    }
  }, [])

  useEffect(() => {
    const appWindow = getCurrentWindow()
    const unlistenPromise = appWindow.onCloseRequested(async (event) => {
      if (closingRef.current) return
      event.preventDefault()

      const dirtyTabs = uniqueSaveTargets(tabsRef.current.filter((tab) => {
        const body = latestBodiesRef.current.get(tab.id) ?? tab.body
        return body !== tab.savedBody
      }))
      for (const tab of dirtyTabs) {
        const proceed = window.confirm(`Close ${tab.path} with unsaved changes?`)
        if (!proceed) return
      }

      closingRef.current = true
      setBusy(true)
      setError(null)
      try {
        await saveWindowPlacement(appWindow)
        await finalizeBeforeClose()
        await appWindow.destroy()
      } catch (err) {
        closingRef.current = false
        setBusy(false)
        setError(`Close checkpoint failed: ${String(err)}`)
      }
    })

    return () => {
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [finalizeBeforeClose])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()

      if (key === 's') {
        event.preventDefault()
        void saveActive()
        return
      }

      if (key === 'n') {
        event.preventDefault()
        if (vault) {
          setWorkspaceMode('notes')
          openNewNoteDialog()
        }
        return
      }

      if (key === 'p') {
        event.preventDefault()
        void printActiveDocument(event.shiftKey ? 'raw' : 'preview')
        return
      }

      if (key === 'a' && activeTab?.mode === 'markdown' && isAppChromeTarget(event.target)) {
        event.preventDefault()
        setEditorFocusRequest((request) => request + 1)
        setEditorSelectAllRequest((request) => request + 1)
        return
      }

      if (key === 'w') {
        if (focusedPane === 'split' && splitOpen) {
          event.preventDefault()
          closeSplitPane()
          return
        }
        if (!activeTab) return
        event.preventDefault()
        closeTab(activeTab.id)
        return
      }

      if (key === 'tab' || key === 'pagedown' || key === ']') {
        const tabForNavigation = mainTab ?? activeTab
        if (tabs.length <= 1 || !tabForNavigation) return
        event.preventDefault()
        selectAdjacentTab(tabs, tabForNavigation.id, event.shiftKey ? -1 : 1, selectMainTab)
        return
      }

      if (key === 'pageup' || key === '[') {
        const tabForNavigation = mainTab ?? activeTab
        if (tabs.length <= 1 || !tabForNavigation) return
        event.preventDefault()
        selectAdjacentTab(tabs, tabForNavigation.id, -1, selectMainTab)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTab, closeSplitPane, closeTab, focusedPane, mainTab, openNewNoteDialog, printActiveDocument, saveActive, selectMainTab, splitOpen, tabs, vault])

  useEffect(() => {
    setSearchRevealedFolders(new Set())
  }, [fileQuery])

  const filteredTree = useMemo(
    () => filterTree(tree, fileQuery, searchRevealedFolders, pinnedPaths),
    [fileQuery, pinnedPaths, searchRevealedFolders, tree]
  )

  const newNoteSimilarPaths = useMemo(() => {
    const needle = stripMarkdownExtension(basename(newNotePath.trim()))
      .toLowerCase()
      .trim()
    if (needle.length < 2) return []
    const exactKey = pathKey(newNotePath.trim())
    return collectFilePaths(tree)
      .filter((path) => isMarkdownPath(path) || isTypstPath(path))
      .filter((path) => {
        const name = stripMarkdownExtension(basename(path)).toLowerCase()
        return pathKey(path) === exactKey || name.includes(needle) || needle.includes(name)
      })
      .slice(0, 6)
  }, [newNotePath, tree])

  useEffect(() => {
    if (!fileQuery.trim()) return
    setExpanded((prev) => new Set([...prev, ...collectDirPaths(filteredTree)]))
  }, [fileQuery, filteredTree])

  const pinnedEntries = useMemo(
    () => collectPinnedFiles(tree, pinnedPaths),
    [pinnedPaths, tree]
  )
  const filteredFilePaths = useMemo(() => collectFilePaths(filteredTree), [filteredTree])

  useEffect(() => {
    if (!vault || !contentQuery.trim()) {
      setContentMatches([])
      setSearchHighlight(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const matches = await invoke<ContentMatch[]>('search_content', {
          query: contentQuery,
          paths: contentUsesFileFilter ? filteredFilePaths : null,
          limit: 80
        })
        if (!cancelled) {
          setContentMatches(matches)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [contentQuery, contentUsesFileFilter, filteredFilePaths, vault])

  useEffect(() => {
    if (!vault || !activePath || activeTab?.outOfVault || !isMarkdownPath(activePath) || !showBacklinks) {
      setBacklinks([])
      setLoadingBacklinks(false)
      return
    }
    let cancelled = false
    setLoadingBacklinks(true)
    const timer = window.setTimeout(async () => {
      try {
        const matches = await invoke<BacklinkMatch[]>('get_backlinks', {
          path: activePath,
          limit: 120
        })
        if (!cancelled) {
          setBacklinks(matches)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoadingBacklinks(false)
      }
    }, 160)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activePath, activeTab?.outOfVault, showBacklinks, tabs, tree, vault])

  const totalFiles = useMemo(() => countFiles(tree), [tree])
  const allFilePaths = useMemo(() => collectFilePaths(tree), [tree])
  const recentClosedPaths = useMemo(
    () => recentPaths.filter((path) => !tabs.some((tab) => samePath(tab.path, path))),
    [recentPaths, tabs]
  )
  const activeIsTypst = !!activeTab && isTypstPath(activeTab.path)

  useEffect(() => {
    if (!showPreview || !activeTab || activeTab.outOfVault || !isTypstPath(activeTab.path)) return
    const tab = activeTab
    let cancelled = false
    setTypstPreview((current) => ({
      tabId: tab.id,
      format: typstPreviewFormat,
      content: current?.tabId === tab.id && current.format === typstPreviewFormat ? current.content : null,
      loading: true,
      error: null
    }))
    const timer = window.setTimeout(async () => {
      try {
        const preview = await invoke<TypstPreview>('compile_typst_preview', {
          path: tab.path,
          body: tab.body,
          format: typstPreviewFormat
        })
        if (cancelled) return
        setTypstPreview({
          tabId: tab.id,
          format: preview.format,
          content: preview.content,
          loading: false,
          error: null
        })
      } catch (err) {
        if (cancelled) return
        setTypstPreview({
          tabId: tab.id,
          format: typstPreviewFormat,
          content: null,
          loading: false,
          error: String(err)
        })
      }
    }, profile.typstPreviewDebounceMs)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    activeTab?.body,
    activeTab?.id,
    activeTab?.outOfVault,
    activeTab?.path,
    profile.typstPreviewDebounceMs,
    showPreview,
    typstPreviewFormat
  ])

  const resizeSidebarTo = useCallback((clientX: number) => {
    const shell = appShellRef.current
    const shellRect = shell?.getBoundingClientRect()
    const shellWidth = shellRect?.width ?? window.innerWidth
    const shellLeft = shellRect?.left ?? 0
    const maxWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, shellWidth - EDITOR_MIN_WIDTH))
    const nextWidth = clamp(Math.round(clientX - shellLeft), SIDEBAR_MIN_WIDTH, maxWidth)
    setSidebarWidth(nextWidth)
    writeStoredSidebarWidth(nextWidth)
  }, [])

  useEffect(() => {
    const clampSidebarWidthToWindow = () => {
      const shellWidth = appShellRef.current?.getBoundingClientRect().width ?? window.innerWidth
      const maxWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, shellWidth - EDITOR_MIN_WIDTH))
      setSidebarWidth((current) => {
        const next = clamp(current, SIDEBAR_MIN_WIDTH, maxWidth)
        if (next !== current) writeStoredSidebarWidth(next)
        return next
      })
    }
    clampSidebarWidthToWindow()
    window.addEventListener('resize', clampSidebarWidthToWindow)
    return () => window.removeEventListener('resize', clampSidebarWidthToWindow)
  }, [])

  const startSidebarResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.classList.add('is-resizing-sidebar')
    resizeSidebarTo(event.clientX)
  }, [resizeSidebarTo])

  const handleSidebarResizeKey = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16
    let nextWidth: number | null = null
    if (event.key === 'ArrowLeft') nextWidth = sidebarWidth - step
    if (event.key === 'ArrowRight') nextWidth = sidebarWidth + step
    if (event.key === 'Home') nextWidth = SIDEBAR_MIN_WIDTH
    if (event.key === 'End') nextWidth = SIDEBAR_MAX_WIDTH
    if (nextWidth == null) return
    event.preventDefault()
    const shellWidth = appShellRef.current?.getBoundingClientRect().width ?? window.innerWidth
    const maxWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, shellWidth - EDITOR_MIN_WIDTH))
    const clampedWidth = clamp(nextWidth, SIDEBAR_MIN_WIDTH, maxWidth)
    setSidebarWidth(clampedWidth)
    writeStoredSidebarWidth(clampedWidth)
  }, [sidebarWidth])

  const resizeEditorSplitTo = useCallback((clientX: number) => {
    const mainRect = mainPaneSlotRef.current?.getBoundingClientRect()
    const splitRect = splitPaneSlotRef.current?.getBoundingClientRect()
    if (!mainRect || !splitRect) return
    const totalWidth = splitRect.right - mainRect.left
    if (totalWidth <= 0) return
    const nextRatio = clamp(
      (clientX - mainRect.left) / totalWidth,
      EDITOR_SPLIT_MIN_RATIO,
      EDITOR_SPLIT_MAX_RATIO
    )
    setEditorSplitRatio(nextRatio)
    writeStoredEditorSplitRatio(nextRatio)
  }, [])

  const startEditorSplitResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.classList.add('is-resizing-editor-split')
    resizeEditorSplitTo(event.clientX)
  }, [resizeEditorSplitTo])

  const handleEditorSplitResizeKey = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.04
    let nextRatio: number | null = null
    if (event.key === 'ArrowLeft') nextRatio = editorSplitRatio - step
    if (event.key === 'ArrowRight') nextRatio = editorSplitRatio + step
    if (event.key === 'Home') nextRatio = EDITOR_SPLIT_MIN_RATIO
    if (event.key === 'End') nextRatio = EDITOR_SPLIT_MAX_RATIO
    if (nextRatio == null) return
    event.preventDefault()
    const clampedRatio = clamp(nextRatio, EDITOR_SPLIT_MIN_RATIO, EDITOR_SPLIT_MAX_RATIO)
    setEditorSplitRatio(clampedRatio)
    writeStoredEditorSplitRatio(clampedRatio)
  }, [editorSplitRatio])

  return (
    <>
    <main
      ref={appShellRef}
      className="app-shell"
      style={{ gridTemplateColumns: `${sidebarWidth}px 6px minmax(0, 1fr)` }}
    >
      <aside className="sidebar">
        <header className="vault-header">
          <div className="vault-title">
            <span className="app-mark">N</span>
            <div className="vault-labels">
              <strong>{vault?.name ?? 'NotesProject'}</strong>
              <span>{vault?.root ?? 'No vault open'}</span>
            </div>
          </div>
          {vault && (
            <GitBadge
              git={vault.git}
              loadingToCommit={loadingToCommit}
              showToCommit={showToCommit}
              onToggleToCommit={() => void toggleToCommitFiles()}
            />
          )}
          {showToCommit && (
            <div className="to-commit-panel">
              {loadingToCommit ? (
                <span>Loading...</span>
              ) : toCommitFiles.length > 0 ? (
                toCommitFiles.map((file) => (
                  <code key={`${file.status}:${file.path}`}>
                    {file.path}{file.status === 'deleted' ? ' (deleted)' : ''}
                  </code>
                ))
              ) : (
                <span>No dirty files.</span>
              )}
            </div>
          )}
          <form
            className="vault-open"
            onSubmit={(event) => {
              event.preventDefault()
              void openVault()
            }}
          >
            <input
              value={vaultPath}
              onChange={(event) => setVaultPath(event.target.value)}
              placeholder="Vault folder path"
              spellCheck={false}
            />
            <button type="submit" disabled={busy}>
              Open
            </button>
          </form>
        </header>

        <section className="search-panel">
          <div className="sidebar-actions">
            <button
              type="button"
              className="sidebar-checkpoint-button"
              onClick={() => void checkpointVaultNow()}
              disabled={!vault?.git.isRepo || busy}
            >
              <span className="checkpoint-label-full">Checkpoint</span>
              <span className="checkpoint-label-short">CP</span>
            </button>
            <button type="button" onClick={openNewNoteDialog} disabled={!vault || busy}>
              New note
            </button>
          </div>
          <label>
            <span>File name</span>
            <input
              value={fileQuery}
              onChange={(event) => {
                setActiveSearchView('file')
                setFileQuery(event.target.value)
              }}
              onFocus={() => setActiveSearchView('file')}
              placeholder="Filter paths"
              spellCheck={false}
            />
          </label>
          <label>
            <span>Content</span>
            <input
              value={contentQuery}
              onChange={(event) => {
                setActiveSearchView('content')
                setContentQuery(event.target.value)
              }}
              onFocus={() => setActiveSearchView('content')}
              placeholder="Search note text"
              spellCheck={false}
            />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={contentUsesFileFilter}
              onChange={(event) => setContentUsesFileFilter(event.target.checked)}
            />
            <span>Search filtered files only</span>
          </label>
        </section>

        <section className="tree-panel">
          {activeSearchView === 'content' && contentQuery.trim() ? (
            <>
              <PinnedNotes
                entries={pinnedEntries}
                activePath={activePath}
                onOpen={(path) => void openNote(path)}
                onOpenTrack={(path) => void openTrackNote(path)}
                onTogglePin={togglePinnedPath}
                onRenameFile={(path) => void renameNoteAction(path)}
                onDeleteFile={(path) => void deleteNoteAction(path)}
              />
              <SearchResults
                matches={contentMatches}
                searching={searching}
                activePath={activePath}
                onOpen={openSearchMatch}
              />
            </>
          ) : (
            <>
              <PinnedNotes
                entries={pinnedEntries}
                activePath={activePath}
                onOpen={(path) => void openNote(path)}
                onOpenTrack={(path) => void openTrackNote(path)}
                onTogglePin={togglePinnedPath}
                onRenameFile={(path) => void renameNoteAction(path)}
                onDeleteFile={(path) => void deleteNoteAction(path)}
              />
              <FileTree
                entries={filteredTree}
                activePath={activePath}
                expanded={expanded}
                pinnedPaths={pinnedPaths}
                onToggle={(path) => {
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(path)) next.delete(path)
                    else next.add(path)
                    return next
                  })
                }}
                onOpen={(path) => void openNote(path)}
                onOpenTrack={(path) => void openTrackNote(path)}
                onTogglePin={togglePinnedPath}
                onRenameFile={(path) => void renameNoteAction(path)}
                onDeleteFile={(path) => void deleteNoteAction(path)}
                onRenameFolder={(path) => void renameFolderAction(path)}
                onDeleteFolder={(path) => void deleteFolderAction(path)}
                onRevealHidden={(path) => {
                  setSearchRevealedFolders((prev) => new Set([...prev, path]))
                }}
              />
            </>
          )}
        </section>

        <footer className="sidebar-footer">
          <span>{totalFiles} files</span>
          {busy && <span>Working...</span>}
        </footer>
      </aside>

      <div
        className="pane-resizer"
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={startSidebarResize}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          resizeSidebarTo(event.clientX)
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          document.body.classList.remove('is-resizing-sidebar')
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          document.body.classList.remove('is-resizing-sidebar')
        }}
        onKeyDown={handleSidebarResizeKey}
      />

      <section className="editor-pane">
        <header
          className="editor-header"
          onMouseDown={(event) => {
            const target = event.target as HTMLElement | null
            if (target?.closest('button, input, select, textarea, a, [role="button"]')) return
            event.preventDefault()
            setEditorFocusRequest((request) => request + 1)
          }}
        >
          <AppMenuBar
            activeTab={activeTab}
            activeIsTypst={activeIsTypst}
            busy={busy}
            canvasDocumentDisplayMode={canvasDocumentDisplayMode}
            checkpointDisabled={activeOutOfVault || !vault?.git.isRepo || vault.git.currentBranch !== 'inuse' || touchedPaths.size === 0 || busy}
            profile={profile}
            recentClosedPaths={recentClosedPaths}
            showBacklinks={showBacklinks}
            showPreview={showPreview}
            typstPreviewFormat={typstPreviewFormat}
            vaultOpen={!!vault}
            onCheckpoint={() => void checkpointNow()}
            onDeleteCurrent={() => {
              if (activeTab) void deleteNoteAction(activeTab.path)
            }}
            onOpenRecent={(path) => void openNote(path)}
            onSetCanvasDocumentDisplay={updateCanvasDocumentDisplayMode}
            onSetTypstPreviewFormat={setTypstPreviewFormat}
            onToggleBacklinks={() => setShowBacklinks((current) => !current)}
            onToggleHistory={(persistRecentFiles) => updateProfile({ ...profile, persistRecentFiles })}
            onTogglePreview={() => setShowPreview((current) => !current)}
            onExportPreviewPdf={() => void exportPreviewPdf()}
            onPrintPreview={() => printActiveDocument('preview')}
            onPrintRaw={() => printActiveDocument('raw')}
            pathKey={pathKey}
          />
          <div className="note-heading">
            <span className="note-path">
              {workspaceMode === 'calendar' ? 'Calendar' : activeTab?.path ?? 'Open a Markdown file'}
            </span>
            {textCountResult && workspaceMode === 'notes' && activeTab?.mode === 'markdown' && (
              <span className="text-count-pill">
                {textCountResult.scope === 'selection' ? 'Selection' : 'Document'}: {formatCount(textCountResult.words)} words, {formatCount(textCountResult.characters)} characters
              </span>
            )}
            {workspaceMode === 'notes' && activeTab?.outOfVault && <span className="outside-pill">Outside vault</span>}
            {workspaceMode === 'calendar' && calendarSaving && <span className="dirty-pill">Saving</span>}
            {workspaceMode === 'notes' && dirty && <span className="dirty-pill">Modified</span>}
            {workspaceMode === 'notes' && activeTab?.externalStatus === 'changed' && <span className="external-pill">Changed on disk</span>}
            {workspaceMode === 'notes' && activeTab?.externalStatus === 'deleted' && <span className="external-pill danger">Deleted on disk</span>}
          </div>
          <div className="editor-actions">
            <label className={canvasMarkdownDisplayMode === 'raw' ? 'raw-toggle active' : 'raw-toggle'}>
              <input
                type="checkbox"
                checked={canvasMarkdownDisplayMode === 'raw'}
                onChange={(event) => updateCanvasMarkdownDisplayMode(event.target.checked ? 'raw' : 'summary')}
                disabled={workspaceMode === 'calendar' || activeTab?.mode !== 'markdown'}
              />
              <span>Raw</span>
            </label>
            <button
              type="button"
              className={workspaceMode === 'calendar' ? 'secondary-button active' : 'secondary-button'}
              onClick={() => setWorkspaceMode((mode) => (mode === 'calendar' ? 'notes' : 'calendar'))}
              disabled={!vault}
            >
              Calendar
            </button>
            <button
              type="button"
              className={activeTab?.mode === 'canvas' ? 'secondary-button active' : 'secondary-button'}
              onClick={() => {
                setWorkspaceMode('notes')
                if (activeTab) void openCanvasNote(activeTab.path)
              }}
              disabled={workspaceMode === 'calendar' || !activeTab || activeTab.outOfVault || !isMarkdownPath(activeTab.path)}
            >
              Canvas
            </button>
            <button
              type="button"
              className={activeTab?.mode === 'markdown' ? 'secondary-button active' : 'secondary-button'}
              onClick={() => {
                setWorkspaceMode('notes')
                if (activeTab) void openNote(activeTab.path)
              }}
              disabled={workspaceMode === 'calendar' || !activeTab || activeTab.outOfVault || !isMarkdownPath(activeTab.path)}
            >
              Text
            </button>
            <button
              type="button"
              className="secondary-button"
              title="Count words and characters in the selection or document"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setEditorTextCountRequest((request) => request + 1)}
              disabled={workspaceMode === 'calendar' || activeTab?.mode !== 'markdown'}
            >
              Count
            </button>
            <button
              type="button"
              className="secondary-button"
              title="Make selection a bulleted Markdown list"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setEditorBulletListRequest((request) => request + 1)}
              disabled={workspaceMode === 'calendar' || activeTab?.mode !== 'markdown'}
            >
              Bullets
            </button>
            <button
              type="button"
              className="secondary-button"
              title="Make selection a numbered Markdown list"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setEditorNumberedListRequest((request) => request + 1)}
              disabled={workspaceMode === 'calendar' || activeTab?.mode !== 'markdown'}
            >
              Numbers
            </button>
            {splitOpen && (
              <button
                type="button"
                className="secondary-button"
                onClick={moveMainTabToSplit}
                disabled={!mainTab}
              >
                Move right
              </button>
            )}
            <button
              type="button"
              className={splitOpen ? 'secondary-button active' : 'secondary-button'}
              onClick={toggleSplitPane}
              disabled={!vault || workspaceMode === 'calendar'}
            >
              {splitOpen ? 'Close split' : 'Split'}
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void saveActive()}
              disabled={workspaceMode === 'calendar' || !activeTab || !dirty || busy}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void checkpointNow()}
              disabled={activeOutOfVault || !vault?.git.isRepo || vault.git.currentBranch !== 'inuse' || touchedPaths.size === 0 || busy}
            >
              Checkpoint
            </button>
          </div>
        </header>

        {workspaceMode === 'notes' && (
          <TabStrip
            tabs={tabs}
            activeId={activeId}
            isDirty={isTabDirty}
            onSelect={(id) => {
              setWorkspaceMode('notes')
              setFocusedPane('main')
              if (id === splitId) setSplitId(null)
              setActiveId(id)
            }}
            onClose={closeTab}
          />
        )}

        {error && <div className="error-banner">{error}</div>}
        {notice && <div className="notice-banner">{notice}</div>}

        {workspaceMode === 'calendar' && (
          <React.Suspense fallback={<EditorLoading label="Loading Calendar..." />}>
            <CalendarView
              events={calendarEvents}
              saving={calendarSaving}
              onSaveEvents={(events) => void saveCalendarEvents(events)}
            />
          </React.Suspense>
        )}
        <div
          className={`${splitOpen || ((showPreview || showBacklinks) && activeTab) ? 'workspace split' : 'workspace'}${splitOpen ? ' editor-split' : ''}${workspaceMode === 'calendar' ? ' is-hidden-workspace' : ''}`}
          aria-hidden={workspaceMode === 'calendar' ? 'true' : undefined}
        >
          <div
            ref={mainPaneSlotRef}
            className={focusedPane === 'main' ? 'editor-pane-slot active' : 'editor-pane-slot'}
            style={splitOpen ? { flex: `${editorSplitRatio} 1 0` } : undefined}
            onMouseDown={() => setFocusedPane('main')}
          >
            {splitOpen && (
              <div className="pane-toolbar">
                <span>{mainTab?.path ?? 'Left pane'}</span>
                <button type="button" onClick={closeMainPane} disabled={!splitTab}>Close left</button>
              </div>
            )}
            {mainTab?.mode === 'track' && mainTab.trackState ? (
              <React.Suspense fallback={<EditorLoading label="Loading Track editor..." />}>
                <TrackChangesEditor
                  tabId={mainTab.id}
                  path={mainTab.path}
                  state={mainTab.trackState}
                  onMarkdownChange={updateTabBody}
                  onTrackStateChange={updateTrackState}
                />
              </React.Suspense>
              ) : mainTab?.mode === 'canvas' ? (
                <React.Suspense fallback={<EditorLoading label="Loading Canvas..." />}>
                  <CanvasEditor
                    tabId={mainTab.id}
                    body={mainTab.body}
                    disabled={!mainTab}
                    documentDisplayMode={canvasDocumentDisplayMode}
                    notePaths={allFilePaths}
                    onChange={updateTabBody}
                    onOpenWikiLink={(path) => void openNote(path)}
                  />
                </React.Suspense>
              ) : (
                <MarkdownEditor
                  activePath={mainTab?.path ?? null}
                  changeId={mainTab?.id ?? null}
                  filePath={mainTab?.path ?? null}
                  body={mainTab?.body ?? ''}
                  disabled={!mainTab}
                  notePaths={allFilePaths}
                  canvasMarkdownDisplayMode={canvasMarkdownDisplayMode}
                  searchHighlight={searchHighlight && mainTab?.path != null && samePath(searchHighlight.path, mainTab.path) ? searchHighlight : null}
                  jumpOffset={focusedPane === 'main' ? jumpOffset : null}
                  focusRequest={focusedPane === 'main' ? editorFocusRequest : 0}
                  selectAllRequest={focusedPane === 'main' ? editorSelectAllRequest : 0}
                  bulletListRequest={focusedPane === 'main' ? editorBulletListRequest : 0}
                  numberedListRequest={focusedPane === 'main' ? editorNumberedListRequest : 0}
                  textCountRequest={focusedPane === 'main' ? editorTextCountRequest : 0}
                  onJumpHandled={() => setJumpOffset(null)}
                  onTextCount={setTextCountResult}
                  onChange={updateTabBody}
                  onOpenWikiLink={(path) => void openNote(path)}
                  onLoadWikiCompletionBody={loadWikiCompletionBody}
                />
            )}
          </div>
          {splitOpen && (
            <div
              className="editor-split-resizer"
              role="separator"
              aria-label="Resize editor panes"
              aria-orientation="vertical"
              aria-valuemin={Math.round(EDITOR_SPLIT_MIN_RATIO * 100)}
              aria-valuemax={Math.round(EDITOR_SPLIT_MAX_RATIO * 100)}
              aria-valuenow={Math.round(editorSplitRatio * 100)}
              tabIndex={0}
              onPointerDown={startEditorSplitResize}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
                resizeEditorSplitTo(event.clientX)
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }
                document.body.classList.remove('is-resizing-editor-split')
              }}
              onPointerCancel={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }
                document.body.classList.remove('is-resizing-editor-split')
              }}
              onKeyDown={handleEditorSplitResizeKey}
            />
          )}
          {splitOpen && (
            <div
              ref={splitPaneSlotRef}
              className={focusedPane === 'split' ? 'editor-pane-slot active' : 'editor-pane-slot'}
              style={{ flex: `${1 - editorSplitRatio} 1 0` }}
              onMouseDown={() => setFocusedPane('split')}
            >
              <div className="pane-toolbar">
                <select
                  className="split-file-select"
                  value={splitTab?.id ?? ''}
                  onChange={(event) => {
                    setSplitId(event.target.value || null)
                    setFocusedPane('split')
                  }}
                  disabled={splitCandidates.length === 0}
                  title="Split pane file"
                >
                  <option value="">Choose file</option>
                  {splitCandidates.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tabLabel(tab)}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={closeSplitPane}>Close right</button>
              </div>
              {splitTab?.mode === 'track' && splitTab.trackState ? (
                <React.Suspense fallback={<EditorLoading label="Loading Track editor..." />}>
                  <TrackChangesEditor
                    tabId={splitTab.id}
                    path={splitTab.path}
                    state={splitTab.trackState}
                    onMarkdownChange={updateTabBody}
                    onTrackStateChange={updateTrackState}
                  />
                </React.Suspense>
                ) : splitTab?.mode === 'canvas' ? (
                  <React.Suspense fallback={<EditorLoading label="Loading Canvas..." />}>
                    <CanvasEditor
                      tabId={splitTab.id}
                      body={splitTab.body}
                      disabled={!splitTab}
                      documentDisplayMode={canvasDocumentDisplayMode}
                      notePaths={allFilePaths}
                      onChange={updateTabBody}
                      onOpenWikiLink={(path) => void openNote(path)}
                    />
                  </React.Suspense>
                ) : (
                  <MarkdownEditor
                    activePath={splitTab?.path ?? null}
                    changeId={splitTab?.id ?? null}
                    filePath={splitTab?.path ?? null}
                    body={splitTab?.body ?? ''}
                    disabled={!splitTab}
                    notePaths={allFilePaths}
                    canvasMarkdownDisplayMode={canvasMarkdownDisplayMode}
                    searchHighlight={searchHighlight && splitTab?.path != null && samePath(searchHighlight.path, splitTab.path) ? searchHighlight : null}
                    jumpOffset={focusedPane === 'split' ? jumpOffset : null}
                    focusRequest={focusedPane === 'split' ? editorFocusRequest : 0}
                    selectAllRequest={focusedPane === 'split' ? editorSelectAllRequest : 0}
                    bulletListRequest={focusedPane === 'split' ? editorBulletListRequest : 0}
                    numberedListRequest={focusedPane === 'split' ? editorNumberedListRequest : 0}
                    textCountRequest={focusedPane === 'split' ? editorTextCountRequest : 0}
                    onJumpHandled={() => setJumpOffset(null)}
                    onTextCount={setTextCountResult}
                    onChange={updateTabBody}
                    onOpenWikiLink={(path) => void openNote(path)}
                    onLoadWikiCompletionBody={loadWikiCompletionBody}
                  />
              )}
            </div>
          )}
          {showPreview && activeTab && !(activeTab.outOfVault && activeIsTypst) && (
            activeIsTypst ? (
              <TypstPreviewPane preview={typstPreview?.tabId === activeTab.id ? typstPreview : null} />
            ) : (
              <React.Suspense fallback={<EditorLoading label="Loading Preview..." />}>
                <MarkdownPreview
                  body={activeTab.body}
                  version={activeTab.bodyVersion}
                  notePaths={allFilePaths}
                  onOpenWikiLink={(path) => void openNote(path)}
                />
              </React.Suspense>
            )
          )}
          {showBacklinks && activeTab && (
            <BacklinksPanel
              activePath={activeTab.path}
              backlinks={backlinks}
              loading={loadingBacklinks}
              onOpen={(match) => void openNote(match.path, match.offset)}
            />
          )}
        </div>
      </section>
      {activeTab && workspaceMode === 'notes' && (
        <div className="print-root" aria-hidden="true">
          <article className="print-document print-raw-document">
            <header className="print-document-header">
              <h1>{activeTab.path}</h1>
              <span>Raw Markdown</span>
            </header>
            <pre>{activePrintBody}</pre>
          </article>
          <div className="print-document print-preview-document">
            {activeIsTypst ? (
              <TypstPreviewPane preview={typstPreview?.tabId === activeTab.id ? typstPreview : null} />
            ) : (
              <React.Suspense fallback={<div className="preview-status">Loading preview...</div>}>
                <MarkdownPreview
                  body={activePrintBody}
                  version={activeTab.bodyVersion}
                  notePaths={allFilePaths}
                  onOpenWikiLink={() => undefined}
                />
              </React.Suspense>
            )}
          </div>
        </div>
      )}
    </main>
    {newNoteOpen && (
      <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewNoteOpen(false)}>
        <form
          className="new-note-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-note-title"
          onMouseDown={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault()
            void createNoteAction()
          }}
        >
          <header>
            <strong id="new-note-title">New note</strong>
            <button type="button" className="icon-button" onClick={() => setNewNoteOpen(false)} aria-label="Close new note dialog">
              x
            </button>
          </header>
          <label>
            <span>Path</span>
            <input
              ref={newNoteInputRef}
              value={newNotePath}
              onChange={(event) => {
                setNewNotePath(event.target.value)
                setNewNoteError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setNewNoteOpen(false)
                }
              }}
              placeholder="untitled.md"
              spellCheck={false}
            />
          </label>
          {newNoteError && <div className="dialog-error">{newNoteError}</div>}
          {newNoteSimilarPaths.length > 0 && (
            <div className="similar-notes">
              <span>Similar existing notes</span>
              <ul>
                {newNoteSimilarPaths.map((path) => (
                  <li key={pathKey(path)}>{path}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => setNewNoteOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              Create
            </button>
          </div>
        </form>
      </div>
    )}
    </>
  )
}

function BacklinksPanel({
  activePath,
  backlinks,
  loading,
  onOpen
}: {
  activePath: string
  backlinks: BacklinkMatch[]
  loading: boolean
  onOpen: (match: BacklinkMatch) => void
}): JSX.Element {
  return (
    <aside className="backlinks-pane">
      <header className="backlinks-header">
        <strong>Backlinks</strong>
        <span>{loading ? 'Scanning...' : `${backlinks.length} found`}</span>
      </header>
      {backlinks.length === 0 ? (
        <div className="empty-list">
          {loading ? 'Scanning for links...' : `No notes link to ${basename(activePath)}`}
        </div>
      ) : (
        <div className="backlinks-list">
          {backlinks.map((match, index) => (
            <button
              key={`${match.path}:${match.lineNumber}:${index}`}
              type="button"
              className="backlink-row"
              onClick={() => onOpen(match)}
              title={`${match.path}:${match.lineNumber}`}
            >
              <span className="backlink-path">{match.path}</span>
              <span className="backlink-line">{match.lineNumber}</span>
              <span className="backlink-text">{match.lineText}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}

function TypstPreviewPane({ preview }: { preview: TypstPreviewState | null }): JSX.Element {
  const hasContent = !!preview?.content
  return (
    <article className="preview-pane typst-preview-pane">
      {preview?.error && <pre className="preview-error">{preview.error}</pre>}
      {preview?.content && !preview.error && (
        preview.format === 'html' ? (
          <iframe
            className="typst-html-preview-frame"
            sandbox=""
            title="Typst HTML preview"
            srcDoc={preview.content}
          />
        ) : (
          <div
            className="typst-preview-frame"
            dangerouslySetInnerHTML={{ __html: preview.content }}
          />
        )
      )}
      {preview?.loading && !hasContent && !preview.error && (
        <div className="preview-status">Compiling...</div>
      )}
      {!preview?.loading && !preview?.error && !hasContent && (
        <div className="preview-status">No Typst preview yet.</div>
      )}
    </article>
  )
}

function EditorLoading({ label }: { label: string }): JSX.Element {
  return (
    <div className="editor-host">
      <div className="empty-editor">
        <strong>{label}</strong>
      </div>
    </div>
  )
}

function AppMenuBar({
  activeTab,
  activeIsTypst,
  busy,
  canvasDocumentDisplayMode,
  checkpointDisabled,
  profile,
  recentClosedPaths,
  showBacklinks,
  showPreview,
  typstPreviewFormat,
  vaultOpen,
  onCheckpoint,
  onDeleteCurrent,
  onOpenRecent,
  onSetCanvasDocumentDisplay,
  onSetTypstPreviewFormat,
  onToggleBacklinks,
  onToggleHistory,
  onTogglePreview,
  onExportPreviewPdf,
  onPrintPreview,
  onPrintRaw,
  pathKey
}: {
  activeTab: OpenTab | null
  activeIsTypst: boolean
  busy: boolean
  canvasDocumentDisplayMode: CanvasDocumentDisplayMode
  checkpointDisabled: boolean
  profile: AppProfile
  recentClosedPaths: string[]
  showBacklinks: boolean
  showPreview: boolean
  typstPreviewFormat: TypstPreviewFormat
  vaultOpen: boolean
  onCheckpoint: () => void
  onDeleteCurrent: () => void
  onOpenRecent: (path: string) => void
  onSetCanvasDocumentDisplay: (mode: CanvasDocumentDisplayMode) => void
  onSetTypstPreviewFormat: React.Dispatch<React.SetStateAction<TypstPreviewFormat>>
  onToggleBacklinks: () => void
  onToggleHistory: (persistRecentFiles: boolean) => void
  onTogglePreview: () => void
  onExportPreviewPdf: () => void
  onPrintPreview: () => void
  onPrintRaw: () => void
  pathKey: (path: string) => string
}): JSX.Element {
  const activeIsMarkdown = !!activeTab && isMarkdownPath(activeTab.path)
  const activeOutOfVault = activeTab?.outOfVault === true
  const [openMenu, setOpenMenu] = useState<'file' | 'view' | 'options' | null>(null)
  const menuRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!openMenu) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null
      if (target && menuRef.current?.contains(target)) return
      setOpenMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenu])

  const toggleMenu = (menu: 'file' | 'view' | 'options') => {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  return (
    <nav ref={menuRef} className="app-menu-bar" aria-label="Application menu">
      <details className="app-menu" open={openMenu === 'file'}>
        <summary onClick={(event) => {
          event.preventDefault()
          toggleMenu('file')
        }}>File</summary>
        <div className="app-menu-popover">
          <label className="app-menu-field">
            <span>Recent</span>
            <select
              value=""
              onChange={(event) => {
                const path = event.target.value
                event.currentTarget.value = ''
                if (path) onOpenRecent(path)
              }}
              disabled={!vaultOpen || recentClosedPaths.length === 0}
            >
              <option value="">Open recent...</option>
              {recentClosedPaths.map((path) => (
                <option key={pathKey(path)} value={path}>{path}</option>
              ))}
            </select>
          </label>
          <label className="app-menu-check">
            <input
              type="checkbox"
              checked={profile.persistRecentFiles}
              onChange={(event) => onToggleHistory(event.target.checked)}
            />
            <span>Persist recent files</span>
          </label>
          <button
            type="button"
            onClick={() => {
              setOpenMenu(null)
              onDeleteCurrent()
            }}
            disabled={!activeTab || activeOutOfVault || busy}
          >
            Delete current file
          </button>
          <button
            type="button"
            onClick={() => {
              setOpenMenu(null)
              onPrintRaw()
            }}
            disabled={!activeTab || busy}
          >
            Print raw Markdown
          </button>
          <button
            type="button"
            onClick={() => {
              setOpenMenu(null)
              onPrintPreview()
            }}
            disabled={!activeTab || (activeOutOfVault && activeIsTypst) || busy}
          >
            Print preview / PDF
          </button>
          <button
            type="button"
            onClick={() => {
              setOpenMenu(null)
              onExportPreviewPdf()
            }}
            disabled={!activeTab || activeOutOfVault || busy}
          >
            Export PDF
          </button>
        </div>
      </details>

      <details className="app-menu" open={openMenu === 'view'}>
        <summary onClick={(event) => {
          event.preventDefault()
          toggleMenu('view')
        }}>View</summary>
        <div className="app-menu-popover">
          <label className="app-menu-check">
            <input type="checkbox" checked={showPreview} onChange={onTogglePreview} disabled={!activeTab || (activeOutOfVault && activeIsTypst)} />
            <span>Preview</span>
          </label>
          <label className="app-menu-check">
            <input type="checkbox" checked={showBacklinks} onChange={onToggleBacklinks} disabled={!activeIsMarkdown || activeOutOfVault} />
            <span>Backlinks</span>
          </label>
          {activeIsTypst && showPreview && (
            <label className="app-menu-field">
              <span>Typst preview</span>
              <select
                value={typstPreviewFormat}
                onChange={(event) => onSetTypstPreviewFormat(event.target.value as TypstPreviewFormat)}
              >
                <option value="svg">SVG</option>
                <option value="html">HTML</option>
              </select>
            </label>
          )}
        </div>
      </details>

      <details className="app-menu" open={openMenu === 'options'}>
        <summary onClick={(event) => {
          event.preventDefault()
          toggleMenu('options')
        }}>Options</summary>
        <div className="app-menu-popover">
          <label className="app-menu-field">
            <span>Canvas document</span>
            <select
              value={canvasDocumentDisplayMode}
              onChange={(event) => onSetCanvasDocumentDisplay(event.target.value as CanvasDocumentDisplayMode)}
              disabled={activeTab?.mode !== 'canvas'}
            >
              <option value="node">Node</option>
              <option value="panel">Panel</option>
            </select>
          </label>
          <button type="button" onClick={onCheckpoint} disabled={checkpointDisabled}>
            Checkpoint
          </button>
        </div>
      </details>
    </nav>
  )
}

function MarkdownEditor({
  activePath,
  changeId,
  filePath,
  body,
  disabled,
  notePaths,
  canvasMarkdownDisplayMode,
  searchHighlight,
  jumpOffset,
  focusRequest,
  selectAllRequest,
  bulletListRequest,
  numberedListRequest,
  textCountRequest,
  onJumpHandled,
  onTextCount,
  onChange,
  onOpenWikiLink,
  onLoadWikiCompletionBody
}: {
  activePath: string | null
  changeId: string | null
  filePath: string | null
  body: string
  disabled: boolean
  notePaths: string[]
  canvasMarkdownDisplayMode: CanvasMarkdownDisplayMode
  searchHighlight: SearchHighlight | null
  jumpOffset: number | null
  focusRequest: number
  selectAllRequest: number
  bulletListRequest: number
  numberedListRequest: number
  textCountRequest: number
  onJumpHandled: () => void
  onTextCount: (result: TextCountResult) => void
  onChange: (path: string, body: string) => void
  onOpenWikiLink: (path: string) => void
  onLoadWikiCompletionBody: (path: string) => Promise<string | null>
}): JSX.Element {
  type ColorMenuState = {
    x: number
    y: number
    colorOpen: boolean
    colorValue: string
    message: string | null
    selectionRanges: Array<{ from: number; to: number }>
  }

  const hostRef = useRef<HTMLDivElement | null>(null)
  const colorInputRef = useRef<HTMLInputElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const editableRef = useRef<Compartment | null>(null)
  const languageRef = useRef<Compartment | null>(null)
  const markdownToolsRef = useRef<Compartment | null>(null)
  const pathRef = useRef<string | null>(null)
  const changeIdRef = useRef<string | null>(changeId)
  const statesRef = useRef<Map<string, EditorState>>(new Map())
  const pendingEditorEchoesRef = useRef<Map<string, string[]>>(new Map())
  const baseExtensionsRef = useRef<Extension[] | null>(null)
  const onChangeRef = useRef(onChange)
  const notePathsRef = useRef(notePaths)
  const canvasMarkdownDisplayModeRef = useRef(canvasMarkdownDisplayMode)
  const searchHighlightRef = useRef<SearchHighlight | null>(searchHighlight)
  const onOpenWikiLinkRef = useRef(onOpenWikiLink)
  const onLoadWikiCompletionBodyRef = useRef(onLoadWikiCompletionBody)
  const [colorMenu, setColorMenu] = useState<ColorMenuState | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    changeIdRef.current = changeId
  }, [changeId])

  useEffect(() => {
    notePathsRef.current = notePaths
  }, [notePaths])

  useEffect(() => {
    canvasMarkdownDisplayModeRef.current = canvasMarkdownDisplayMode
  }, [canvasMarkdownDisplayMode])

  useEffect(() => {
    const view = viewRef.current
    const markdownTools = markdownToolsRef.current
    if (!view || !markdownTools) return
    view.dispatch({
      effects: markdownTools.reconfigure(noteMarkdownTools(
        notePathsRef,
        canvasMarkdownDisplayModeRef,
        searchHighlightRef,
        onOpenWikiLinkRef,
        onLoadWikiCompletionBodyRef
      ))
    })
  }, [canvasMarkdownDisplayMode, notePaths])

  useEffect(() => {
    searchHighlightRef.current = searchHighlight
    viewRef.current?.dispatch({})
  }, [searchHighlight])

  useEffect(() => {
    onOpenWikiLinkRef.current = onOpenWikiLink
  }, [onOpenWikiLink])

  useEffect(() => {
    onLoadWikiCompletionBodyRef.current = onLoadWikiCompletionBody
  }, [onLoadWikiCompletionBody])

  useEffect(() => {
    if (!colorMenu) return
    const close = () => setColorMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('scroll', close, true)
    }
  }, [colorMenu])

  useEffect(() => {
    if (!colorMenu?.colorOpen) return
    window.requestAnimationFrame(() => {
      colorInputRef.current?.focus()
      colorInputRef.current?.select()
    })
  }, [colorMenu?.colorOpen])

  const openColorMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!event.shiftKey) return
    const view = viewRef.current
    if (!view || disabled) return
    event.preventDefault()
    event.stopPropagation()
    setColorMenu({
      x: event.clientX,
      y: event.clientY,
      colorOpen: false,
      colorValue: 'red',
      message: null,
      selectionRanges: view.state.selection.ranges
        .filter((range) => !range.empty)
        .map((range) => ({ from: range.from, to: range.to }))
    })
  }, [disabled])

  const preserveSelectionForColorMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!event.shiftKey || event.button !== 2) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const applyColorValueToSelection = useCallback((rawColor: string) => {
    const view = viewRef.current
    if (!view || !colorMenu || disabled) return
    const color = rawColor.trim()
    if (colorMenu.selectionRanges.length === 0) {
      setColorMenu((current) => current ? { ...current, message: 'No selection.' } : current)
      return
    }
    if (!isSafeEditorColor(color)) {
      setColorMenu((current) => current ? { ...current, message: 'Wrong color name.' } : current)
      return
    }
    const changes = buildApplyColorChanges(view.state.doc.toString(), colorMenu.selectionRanges, color)
    if (changes === 'crosses-color-markup') {
      setColorMenu((current) => current ? { ...current, message: 'Selection crosses color markup.' } : current)
      return
    }
    view.dispatch({ changes })
    view.focus()
    setColorMenu((current) => current ? { ...current, message: `Applied ${color}.` } : current)
  }, [colorMenu, disabled])

  const applyColorToSelection = useCallback(() => {
    applyColorValueToSelection(colorMenu?.colorValue ?? '')
  }, [applyColorValueToSelection, colorMenu?.colorValue])

  useEffect(() => {
    const host = hostRef.current
    if (!host || viewRef.current) return

    const editable = new Compartment()
    const language = new Compartment()
    const markdownTools = new Compartment()
    editableRef.current = editable
    languageRef.current = language
    markdownToolsRef.current = markdownTools

    const extensions: Extension[] = [
      language.of(markdown()),
      history({ minDepth: 10000, newGroupDelay: 500 }),
      editorDocumentVersion,
      drawSelection(),
      lineNumbers(),
      highlightActiveLine(),
      syntaxHighlighting(notesHighlightStyle, { fallback: true }),
      markdownTools.of(noteMarkdownTools(notePathsRef, canvasMarkdownDisplayModeRef, searchHighlightRef, onOpenWikiLinkRef, onLoadWikiCompletionBodyRef)),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '15px'
        },
        '.cm-scroller': {
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.62'
        },
        '.cm-content': {
          padding: '22px 28px 48px',
          caretColor: '#226b52'
        },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
          backgroundColor: '#d7c6ff'
        },
        '.cm-content ::selection': {
          backgroundColor: '#d7c6ff'
        },
        '.cm-gutters': {
          backgroundColor: '#f6f4ef',
          borderRight: '1px solid #ddd8cf',
          color: '#948d82'
        },
        '.cm-activeLine': {
          backgroundColor: '#ece8df'
        },
        '.cm-activeLineGutter': {
          backgroundColor: '#ece8df',
          color: '#2d2a25'
        },
        '&.cm-focused': {
          outline: 'none'
        }
      }),
      keymap.of([
        { key: 'Tab', run: indentMarkdownList },
        { key: 'Shift-Tab', run: outdentMarkdownList },
        { key: 'Enter', run: continueMarkdownList },
        {
          key: 'Ctrl-Space',
          run: startCompletion
        },
        { key: 'Ctrl-b', run: toggleMarkdownBold, preventDefault: true },
        { key: 'Ctrl-i', run: toggleMarkdownItalic, preventDefault: true },
        { key: 'Ctrl-Shift-8', run: (view) => formatMarkdownListSelection(view, 'bullet'), preventDefault: true },
        { key: 'Ctrl-Shift-7', run: (view) => formatMarkdownListSelection(view, 'numbered'), preventDefault: true },
        { key: 'Ctrl-Enter', run: calculateMarkdownLine, preventDefault: true },
        { key: 'Ctrl-y', run: redo, preventDefault: true },
        { key: 'Ctrl-Shift-z', run: redo, preventDefault: true },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap
      ]),
      editable.of(EditorView.editable.of(!disabled)),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        if (update.transactions.some((tr) => tr.annotation(programmaticChange))) return
        const path = pathRef.current
        const changeId = changeIdRef.current
        if (!path || !changeId) return
        const nextBody = update.state.doc.toString()
        rememberEditorEcho(pendingEditorEchoesRef.current, path, nextBody)
        onChangeRef.current(changeId, nextBody)
      })
    ]
    baseExtensionsRef.current = extensions

    const view = new EditorView({
      parent: host,
      state: createEditorState(body, extensions)
    })
    viewRef.current = view
    pathRef.current = activePath
    return () => {
      view.destroy()
      viewRef.current = null
      editableRef.current = null
      languageRef.current = null
      markdownToolsRef.current = null
      baseExtensionsRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    const editable = editableRef.current
    if (!view || !editable) return
    view.dispatch({
      effects: editable.reconfigure(EditorView.editable.of(!disabled))
    })
  }, [disabled])

  useEffect(() => {
    const view = viewRef.current
    const language = languageRef.current
    if (!view || !language) return
    let cancelled = false
    if (!isTypstPath(filePath)) {
      view.dispatch({ effects: language.reconfigure(markdown()) })
      return
    }
    void import('codemirror-lang-typst')
      .then(({ typst }) => {
        if (!cancelled) view.dispatch({ effects: language.reconfigure(typst()) })
      })
      .catch(() => {
        if (!cancelled) view.dispatch({ effects: language.reconfigure(markdown()) })
      })
    return () => {
      cancelled = true
    }
  }, [filePath])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const previousPath = pathRef.current
    const sameActivePath = previousPath != null && activePath != null && samePath(previousPath, activePath)
    if (previousPath && !sameActivePath) {
      statesRef.current.set(previousPath, view.state)
    }
    if (sameActivePath) {
      const current = view.state.doc.toString()
      if (current === body) return
      if (activePath && consumeEditorEcho(pendingEditorEchoesRef.current, activePath, body)) return
      const anchor = Math.min(view.state.selection.main.head, body.length)
      const scrollTop = view.scrollDOM.scrollTop
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: body },
        annotations: programmaticChange.of(true),
        selection: { anchor }
      })
      view.scrollDOM.scrollTop = scrollTop
      return
    }

    pathRef.current = activePath
    if (!activePath) {
      view.setState(createEditorState('', baseExtensionsRef.current ?? []))
      applyEditable(view, editableRef.current, false)
      return
    }

    const cached = statesRef.current.get(activePath)
    if (cached) {
      view.setState(cached)
      applyEditable(view, editableRef.current, !disabled)
      if (cached.doc.toString() !== body) {
        const scrollTop = view.scrollDOM.scrollTop
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: body },
          annotations: programmaticChange.of(true),
          selection: { anchor: Math.min(view.state.selection.main.head, body.length) }
        })
        view.scrollDOM.scrollTop = scrollTop
      }
      return
    }

    view.setState(createEditorState(body, baseExtensionsRef.current ?? []))
    applyEditable(view, editableRef.current, !disabled)
    view.scrollDOM.scrollTop = 0
  }, [activePath, body, disabled, filePath])

  useEffect(() => {
    const view = viewRef.current
    if (!view || jumpOffset == null) return
    const anchor = Math.max(0, Math.min(jumpOffset, view.state.doc.length))
    view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'center' })
    })
    view.focus()
    onJumpHandled()
  }, [jumpOffset, onJumpHandled])

  useEffect(() => {
    if (disabled || focusRequest === 0) return
    viewRef.current?.focus()
  }, [disabled, focusRequest])

  useEffect(() => {
    const view = viewRef.current
    if (disabled || selectAllRequest === 0 || !view) return
    view.dispatch({
      selection: EditorSelection.range(0, view.state.doc.length)
    })
    view.focus()
  }, [disabled, selectAllRequest])

  useEffect(() => {
    const view = viewRef.current
    if (disabled || bulletListRequest === 0 || !view) return
    formatMarkdownListSelection(view, 'bullet')
    view.focus()
  }, [bulletListRequest, disabled])

  useEffect(() => {
    const view = viewRef.current
    if (disabled || numberedListRequest === 0 || !view) return
    formatMarkdownListSelection(view, 'numbered')
    view.focus()
  }, [disabled, numberedListRequest])

  useEffect(() => {
    const view = viewRef.current
    if (disabled || textCountRequest === 0 || !view) return
    onTextCount(countEditorText(view.state))
    view.focus()
  }, [disabled, onTextCount, textCountRequest])

  return (
    <div
      className={disabled ? 'editor-host is-empty' : 'editor-host'}
      onMouseDownCapture={preserveSelectionForColorMenu}
      onContextMenu={openColorMenu}
    >
      <div ref={hostRef} className="cm-host" />
      {colorMenu && (
        <div
          className="markdown-action-menu"
          style={{ left: colorMenu.x, top: colorMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {!colorMenu.colorOpen ? (
            <button
              type="button"
              onClick={() => setColorMenu((current) => current ? { ...current, colorOpen: true, message: null } : current)}
            >
              Color selection
            </button>
          ) : (
            <form
              className="markdown-color-form"
              onSubmit={(event) => {
                event.preventDefault()
                applyColorToSelection()
              }}
            >
              <label>
                <span>Color</span>
                <input
                  ref={colorInputRef}
                  value={colorMenu.colorValue}
                  onChange={(event) => setColorMenu((current) => current ? { ...current, colorValue: event.target.value, message: null } : current)}
                  placeholder="red, #b33, rgb(180, 30, 30)"
                  spellCheck={false}
                />
              </label>
              <div className="markdown-color-swatches">
                {['red', 'orange', 'gold', 'green', 'blue', 'purple'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setColorMenu((current) => current ? { ...current, colorValue: color, message: null } : current)
                      applyColorValueToSelection(color)
                    }}
                  />
                ))}
              </div>
              {colorMenu.message && <div className="markdown-color-message">{colorMenu.message}</div>}
            </form>
          )}
        </div>
      )}
      {disabled && (
        <div className="empty-editor">
          <strong>No file selected</strong>
          <span>Open a vault, then choose a Markdown file from the left pane.</span>
        </div>
      )}
    </div>
  )
}

function noteMarkdownTools(
  notePathsRef: React.MutableRefObject<string[]>,
  canvasMarkdownDisplayModeRef: React.MutableRefObject<CanvasMarkdownDisplayMode>,
  searchHighlightRef: React.MutableRefObject<SearchHighlight | null>,
  onOpenWikiLinkRef: React.MutableRefObject<(path: string) => void>,
  onLoadWikiCompletionBodyRef: React.MutableRefObject<(path: string) => Promise<string | null>>
): Extension {
  const canvasSummaryField = StateField.define<DecorationSet>({
    create(state) {
      return buildCanvasSummaryDecorations(state, notePathsRef.current, canvasMarkdownDisplayModeRef.current, onOpenWikiLinkRef)
    },
    update(_decorations, transaction) {
      return buildCanvasSummaryDecorations(transaction.state, notePathsRef.current, canvasMarkdownDisplayModeRef.current, onOpenWikiLinkRef)
    },
    provide: (field) => EditorView.decorations.from(field)
  })

  const wikiLinkPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildVersionedNoteDecorations(view, notePathsRef.current, canvasMarkdownDisplayModeRef.current, searchHighlightRef.current, onOpenWikiLinkRef.current)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.transactions.length > 0) {
          this.decorations = buildVersionedNoteDecorations(update.view, notePathsRef.current, canvasMarkdownDisplayModeRef.current, searchHighlightRef.current, onOpenWikiLinkRef.current)
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations
    }
  )

  return [
    canvasSummaryField,
    wikiLinkPlugin,
    Prec.highest(keymap.of([
      { key: 'Tab', run: acceptCompletion }
    ])),
    autocompletion({
      override: [wikiCompletionSource(notePathsRef, onLoadWikiCompletionBodyRef)],
      activateOnTyping: true
    }),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || !update.state.selection.main.empty) return
      const position = update.state.selection.main.head
      if (position < 2) return
      if (update.state.doc.sliceString(position - 2, position) === '[[') {
        window.setTimeout(() => startCompletion(update.view), 0)
      }
    }),
    EditorView.domEventHandlers({
      copy(event, view) {
        return copyExpandedConcealedMarkdownSelection(event, view, canvasMarkdownDisplayModeRef.current)
      },
      cut(event, view) {
        return cutExpandedConcealedMarkdownSelection(event, view, canvasMarkdownDisplayModeRef.current)
      },
      mousedown(event, view) {
        if (!(event.ctrlKey || event.metaKey)) return false
        const target = event.target as HTMLElement | null
        if (!target?.closest('.cm-wiki-link')) return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos == null) return false
        const link = wikiLinkAt(view.state, pos, notePathsRef.current)
        if (!link) return false
        event.preventDefault()
        onOpenWikiLinkRef.current(link.destination)
        return true
      }
    }),
    keymap.of([
      {
        key: 'Backspace',
        run(view) {
          return deleteExpandedConcealedMarkdownSelection(view, canvasMarkdownDisplayModeRef.current)
        }
      },
      {
        key: 'Delete',
        run(view) {
          return deleteExpandedConcealedMarkdownSelection(view, canvasMarkdownDisplayModeRef.current)
        }
      },
      {
        key: 'Mod-Enter',
        run(view) {
          const link = wikiLinkAt(view.state, view.state.selection.main.head, notePathsRef.current)
          if (!link) return false
          onOpenWikiLinkRef.current(link.destination)
          return true
        }
      }
    ])
  ]
}

function buildVersionedNoteDecorations(
  view: EditorView,
  notePaths: string[],
  canvasMarkdownDisplayMode: CanvasMarkdownDisplayMode,
  searchHighlight: SearchHighlight | null,
  onOpenWikiLink: (path: string) => void
): DecorationSet {
  const version = view.state.field(editorDocumentVersion)
  const decorations = buildNoteDecorations(view, notePaths, canvasMarkdownDisplayMode, searchHighlight, version, onOpenWikiLink)
  return version === view.state.field(editorDocumentVersion) ? decorations : Decoration.none
}

function buildNoteDecorations(
  view: EditorView,
  notePaths: string[],
  canvasMarkdownDisplayMode: CanvasMarkdownDisplayMode,
  searchHighlight: SearchHighlight | null,
  version: number,
  _onOpenWikiLink: (path: string) => void
): DecorationSet {
  const ranges: Array<{ from: number; to: number; decoration: Decoration }> = []
  const doc = view.state.doc
  const fullText = doc.toString()
  const blockMathRanges: Array<{ from: number; to: number }> = []
  const showRawMarkdown = canvasMarkdownDisplayMode === 'raw'
  const canvasBlockRanges = canvasMarkdownDisplayMode === 'summary'
    ? findCanvasBlockRanges(doc.toString(), view.visibleRanges)
    : []

  if (!showRawMarkdown) {
    for (const colorSpan of findColorSpans(fullText)) {
      if (rangesOverlapAny(colorSpan.from, colorSpan.to, canvasBlockRanges)) continue
      if (!view.visibleRanges.some((range) => colorSpan.from <= range.to && colorSpan.to >= range.from)) continue
      ranges.push({ from: colorSpan.from, to: colorSpan.textFrom, decoration: Decoration.replace({}) })
      const closeFrom = colorSpan.textFrom < doc.lineAt(colorSpan.textTo).from && /^\s*$/.test(doc.sliceString(doc.lineAt(colorSpan.textTo).from, colorSpan.textTo))
        ? doc.lineAt(colorSpan.textTo).from
        : colorSpan.textTo
      let lineNumber = doc.lineAt(colorSpan.textFrom).number
      const lastLineNumber = doc.lineAt(closeFrom).number
      while (lineNumber <= lastLineNumber) {
        const line = doc.line(lineNumber)
        const from = Math.max(colorSpan.textFrom, line.from)
        const to = Math.min(closeFrom, line.to)
        if (from < to) {
          ranges.push({
            from,
            to,
            decoration: Decoration.mark({
              class: 'cm-color-span',
              attributes: {
                style: `color: ${colorSpan.color}`
              }
            })
          })
        }
        lineNumber += 1
      }
      ranges.push({ from: closeFrom, to: colorSpan.to, decoration: Decoration.replace({}) })
    }

    for (const emphasisSpan of findMarkdownEmphasisSpans(view)) {
      if (rangesOverlapAny(emphasisSpan.from, emphasisSpan.to, canvasBlockRanges)) continue
      if (!view.visibleRanges.some((range) => emphasisSpan.from <= range.to && emphasisSpan.to >= range.from)) continue
      ranges.push({ from: emphasisSpan.from, to: emphasisSpan.textFrom, decoration: Decoration.replace({}) })
      ranges.push({
        from: emphasisSpan.textFrom,
        to: emphasisSpan.textTo,
        decoration: Decoration.mark({
          class: emphasisSpan.kind === 'strong' ? 'cm-markdown-strong' : 'cm-markdown-emphasis'
        })
      })
      ranges.push({ from: emphasisSpan.textTo, to: emphasisSpan.to, decoration: Decoration.replace({}) })
    }

    for (const escape of findMarkdownEscapes(view)) {
      if (rangesOverlapAny(escape.from, escape.to, canvasBlockRanges)) continue
      ranges.push({ from: escape.from, to: escape.from + 1, decoration: Decoration.replace({}) })
    }
  }

  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to)
    const blockRegex = /\$\$([\s\S]*?)\$\$/g
    let blockMatch: RegExpExecArray | null
    while ((blockMatch = blockRegex.exec(text))) {
      const blockFrom = from + blockMatch.index
      const blockTo = blockFrom + blockMatch[0].length
      if (rangesOverlapAny(blockFrom, blockTo, canvasBlockRanges)) continue
      blockMathRanges.push({ from: blockFrom, to: blockTo })
      ranges.push({ from: blockTo, to: blockTo, decoration: Decoration.widget({
        widget: new MathPreviewWidget(blockMatch[1].trim(), true, version),
        block: true,
        side: 1
      }) })
    }
  }

  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      if (line.from >= to) break
      if (rangesOverlapAny(line.from, line.to, canvasBlockRanges)) {
        pos = line.to + 1
        continue
      }
      const text = line.text
      const callout = text.match(/^\s*>\s*\[!([A-Za-z][A-Za-z0-9_-]*)\]/)
      if (callout) {
        ranges.push({ from: line.from, to: line.from, decoration: Decoration.line({
          class: `cm-callout-line cm-callout-${callout[1].toLowerCase()}`
        }) })
      }

      for (const match of text.matchAll(/\[\[([^\]\n|#]+)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g)) {
        const label = match[1].trim()
        const heading = match[2]?.slice(1).trim()
        const start = line.from + (match.index ?? 0)
        const end = start + match[0].length
        const linkStart = start + 2
        const linkEnd = end - 2
        const displayRange = wikiLinkDisplayRange(line.from + (match.index ?? 0), match)
        const target = resolveWikiPath(label, notePaths)
        if (!showRawMarkdown) {
          ranges.push({ from: start, to: linkStart, decoration: Decoration.replace({}) })
          ranges.push({ from: linkEnd, to: end, decoration: Decoration.replace({}) })
          if (displayRange.from > linkStart) {
            ranges.push({ from: linkStart, to: displayRange.from, decoration: Decoration.replace({}) })
          }
          if (displayRange.to < linkEnd) {
            ranges.push({ from: displayRange.to, to: linkEnd, decoration: Decoration.replace({}) })
          }
        }
        ranges.push({ from: showRawMarkdown ? start : displayRange.from, to: showRawMarkdown ? end : displayRange.to, decoration: Decoration.mark({
          class: target ? 'cm-wiki-link' : 'cm-wiki-link cm-wiki-missing',
          attributes: {
            title: target
              ? `Ctrl+click or Ctrl+Enter to open ${formatWikiDestination(target, heading)}`
              : `No matching note for ${label}`
          }
        }) })
      }

      for (const math of findInlineMath(text)) {
        const start = line.from + math.from
        const end = line.from + math.to
        if (!blockMathRanges.some((range) => start >= range.from && end <= range.to)) {
          ranges.push({ from: end, to: end, decoration: Decoration.widget({
            widget: new MathPreviewWidget(math.source, false, version),
            side: 1
          }) })
        }
      }
      pos = line.to + 1
    }
  }

  if (searchHighlight?.query.trim()) {
    const query = searchHighlight.query.trim()
    const needle = query.toLowerCase()
    for (const { from, to } of view.visibleRanges) {
      const text = doc.sliceString(from, to)
      const haystack = text.toLowerCase()
      let index = haystack.indexOf(needle)
      while (index >= 0) {
        const start = from + index
        const end = start + query.length
        if (rangesOverlapAny(start, end, canvasBlockRanges)) {
          index = haystack.indexOf(needle, index + Math.max(needle.length, 1))
          continue
        }
        const active =
          searchHighlight.offset >= start &&
          searchHighlight.offset <= end
        ranges.push({
          from: start,
          to: end,
          decoration: Decoration.mark({
            class: active ? 'cm-search-hit cm-search-hit-active' : 'cm-search-hit'
          })
        })
        index = haystack.indexOf(needle, index + Math.max(needle.length, 1))
      }
    }
  }

  ranges.sort((left, right) => left.from - right.from || left.to - right.to)
  const builder = new RangeSetBuilder<Decoration>()
  for (const range of ranges) {
    builder.add(range.from, range.to, range.decoration)
  }
  return builder.finish()
}

function buildCanvasSummaryDecorations(
  state: EditorState,
  notePaths: string[],
  canvasMarkdownDisplayMode: CanvasMarkdownDisplayMode,
  onOpenWikiLinkRef: React.MutableRefObject<(path: string) => void>
): DecorationSet {
  if (canvasMarkdownDisplayMode !== 'summary') return Decoration.none

  const version = state.field(editorDocumentVersion)
  const builder = new RangeSetBuilder<Decoration>()
  const text = state.doc.toString()
  const canvasBlockRegex = /(^|\n)```canvas[ \t]*\n([\s\S]*?)(?:\n```)(?=\n|$)/g
  let match: RegExpExecArray | null
  while ((match = canvasBlockRegex.exec(text))) {
    const from = match.index + match[1].length
    const to = match.index + match[0].length
    builder.add(from, to, Decoration.replace({
      widget: new CanvasMarkdownSummaryWidget(extractCanvasNodeTexts(match[2]), notePaths, onOpenWikiLinkRef, version),
      block: true
    }))
  }
  return builder.finish()
}

function findCanvasBlockRanges(
  text: string,
  visibleRanges: readonly { from: number; to: number }[]
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  const canvasBlockRegex = /(^|\n)```canvas[ \t]*\n([\s\S]*?)(?:\n```)(?=\n|$)/g
  let match: RegExpExecArray | null
  while ((match = canvasBlockRegex.exec(text))) {
    const from = match.index + match[1].length
    const to = match.index + match[0].length
    if (visibleRanges.some((range) => from <= range.to && to >= range.from)) {
      ranges.push({ from, to })
    }
  }
  return ranges
}

class MathPreviewWidget extends WidgetType {
  constructor(
    private readonly source: string,
    private readonly displayMode: boolean,
    private readonly version: number
  ) {
    super()
  }

  eq(other: MathPreviewWidget): boolean {
    return this.source === other.source && this.displayMode === other.displayMode && this.version === other.version
  }

  toDOM(): HTMLElement {
    const element = document.createElement(this.displayMode ? 'div' : 'span')
    element.className = this.displayMode ? 'cm-math-preview block' : 'cm-math-preview inline'
    element.dataset.editorVersion = String(this.version)
    element.textContent = this.source
    return element
  }

  ignoreEvent(): boolean {
    return true
  }
}

class CanvasMarkdownSummaryWidget extends WidgetType {
  constructor(
    private readonly nodeTexts: string[],
    private readonly notePaths: string[],
    private readonly onOpenWikiLinkRef: React.MutableRefObject<(path: string) => void>,
    private readonly version: number
  ) {
    super()
  }

  eq(other: CanvasMarkdownSummaryWidget): boolean {
    return (
      this.version === other.version &&
      this.nodeTexts.join('\n---\n') === other.nodeTexts.join('\n---\n') &&
      this.notePaths.join('\n') === other.notePaths.join('\n')
    )
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('section')
    wrapper.className = 'cm-canvas-summary'
    wrapper.dataset.editorVersion = String(this.version)

    const header = document.createElement('div')
    header.className = 'cm-canvas-summary-header'
    header.textContent = 'Canvas'
    wrapper.appendChild(header)

    const content = document.createElement('div')
    content.className = 'cm-canvas-summary-content'
    if (this.nodeTexts.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'cm-canvas-summary-empty'
      empty.textContent = 'Empty canvas'
      content.appendChild(empty)
    } else {
      for (const text of this.nodeTexts) {
        const node = document.createElement('div')
        node.className = 'cm-canvas-summary-node'
        node.innerHTML = renderCanvasMarkdown(text || 'Empty block', this.notePaths)
        content.appendChild(node)
      }
    }
    content.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest('a.canvas-wiki') as HTMLAnchorElement | null
        : null
      const href = target?.getAttribute('href')
      if (!href?.startsWith('notesproject-wiki:')) return

      event.preventDefault()
      event.stopPropagation()
      this.onOpenWikiLinkRef.current(decodeURIComponent(href.slice('notesproject-wiki:'.length)))
    })
    wrapper.appendChild(content)

    return wrapper
  }

  ignoreEvent(): boolean {
    return false
  }
}

function extractCanvasNodeTexts(source: string): string[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const texts: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const blockStart = lines[index].match(/^(\s*)text:\s*\|[+-]?\s*$/)
    if (blockStart) {
      const keyIndent = blockStart[1].length
      const collected: string[] = []
      index += 1
      while (index < lines.length) {
        const line = lines[index]
        const indent = leadingWhitespaceLength(line)
        if (line.trim() && indent <= keyIndent) {
          index -= 1
          break
        }
        collected.push(line)
        index += 1
      }
      texts.push(stripCommonIndent(collected).trim())
      continue
    }

    const inlineText = lines[index].match(/^\s*text:\s+(.+?)\s*$/)
    if (inlineText) texts.push(inlineText[1].replace(/^['"]|['"]$/g, '').trim())
  }
  return texts.filter((text) => text.length > 0)
}

function stripCommonIndent(lines: string[]): string {
  const nonBlankIndents = lines
    .filter((line) => line.trim())
    .map(leadingWhitespaceLength)
  const commonIndent = nonBlankIndents.length > 0 ? Math.min(...nonBlankIndents) : 0
  return lines.map((line) => line.slice(Math.min(commonIndent, leadingWhitespaceLength(line)))).join('\n')
}

function leadingWhitespaceLength(value: string): number {
  const match = value.match(/^\s*/)
  return match?.[0].length ?? 0
}

function rangesOverlapAny(from: number, to: number, ranges: Array<{ from: number; to: number }>): boolean {
  return ranges.some((range) => from < range.to && to > range.from)
}

type ConcealedMarkdownSpan = {
  from: number
  to: number
  textFrom: number
  textTo: number
}

function copyExpandedConcealedMarkdownSelection(
  event: ClipboardEvent,
  view: EditorView,
  canvasMarkdownDisplayMode: CanvasMarkdownDisplayMode
): boolean {
  const expandedRanges = expandedConcealedMarkdownSelectionRanges(view, canvasMarkdownDisplayMode)
  if (!expandedRanges) return false
  const clipboard = event.clipboardData
  if (!clipboard) return false

  clipboard.setData('text/plain', expandedRanges
    .map((range) => view.state.doc.sliceString(range.from, range.to))
    .join('\n'))
  event.preventDefault()
  return true
}

function cutExpandedConcealedMarkdownSelection(
  event: ClipboardEvent,
  view: EditorView,
  canvasMarkdownDisplayMode: CanvasMarkdownDisplayMode
): boolean {
  const expandedRanges = expandedConcealedMarkdownSelectionRanges(view, canvasMarkdownDisplayMode)
  if (!expandedRanges) return false
  const clipboard = event.clipboardData
  if (!clipboard) return false

  clipboard.setData('text/plain', expandedRanges
    .map((range) => view.state.doc.sliceString(range.from, range.to))
    .join('\n'))
  event.preventDefault()
  deleteConcealedMarkdownRanges(view, expandedRanges)
  return true
}

function deleteExpandedConcealedMarkdownSelection(
  view: EditorView,
  canvasMarkdownDisplayMode: CanvasMarkdownDisplayMode
): boolean {
  const expandedRanges = expandedConcealedMarkdownSelectionRanges(view, canvasMarkdownDisplayMode)
  if (!expandedRanges) return false
  deleteConcealedMarkdownRanges(view, expandedRanges)
  return true
}

function deleteConcealedMarkdownRanges(
  view: EditorView,
  ranges: Array<{ from: number; to: number }>
): void {
  const transaction = view.state.changeByRange((range) => {
    const expanded = ranges.find((candidate) => range.from >= candidate.from && range.to <= candidate.to)
    if (!expanded) return { range }
    return {
      changes: { from: expanded.from, to: expanded.to },
      range: EditorSelection.cursor(expanded.from)
    }
  })
  view.dispatch({
    ...transaction,
    userEvent: 'delete.selection'
  })
}

function expandedConcealedMarkdownSelectionRanges(
  view: EditorView,
  canvasMarkdownDisplayMode: CanvasMarkdownDisplayMode
): Array<{ from: number; to: number }> | null {
  if (canvasMarkdownDisplayMode === 'raw') return null

  const selectedRanges = view.state.selection.ranges.filter((range) => !range.empty)
  if (selectedRanges.length === 0) return null

  const spans = findConcealedMarkdownSpans(view)
  if (spans.length === 0) return null

  let changed = false
  const expandedRanges = selectedRanges.map((range) => {
    const expanded = expandConcealedMarkdownRange(range.from, range.to, spans)
    if (expanded.from !== range.from || expanded.to !== range.to) changed = true
    return expanded
  })

  return changed ? expandedRanges : null
}

function expandConcealedMarkdownRange(
  from: number,
  to: number,
  spans: ConcealedMarkdownSpan[]
): { from: number; to: number } {
  let expandedFrom = from
  let expandedTo = to
  let changed = true

  while (changed) {
    changed = false
    for (const span of spans) {
      if (expandedFrom === span.textFrom && expandedTo >= span.textTo && expandedFrom !== span.from) {
        expandedFrom = span.from
        changed = true
      }
      if (expandedTo === span.textTo && expandedFrom <= span.textFrom && expandedTo !== span.to) {
        expandedTo = span.to
        changed = true
      }
    }
  }

  return { from: expandedFrom, to: expandedTo }
}

function findConcealedMarkdownSpans(view: EditorView): ConcealedMarkdownSpan[] {
  const text = view.state.doc.toString()
  const spans: ConcealedMarkdownSpan[] = [
    ...findColorSpans(text).map((span) => ({
      from: span.from,
      to: span.to,
      textFrom: span.textFrom,
      textTo: span.textTo
    })),
    ...findMarkdownEmphasisSpans(view).map((span) => ({
      from: span.from,
      to: span.to,
      textFrom: span.textFrom,
      textTo: span.textTo
    })),
    ...findWikiLinkSpans(view)
  ]

  return spans.sort((left, right) => (left.to - left.from) - (right.to - right.from))
}

function findWikiLinkSpans(view: EditorView): ConcealedMarkdownSpan[] {
  const spans: ConcealedMarkdownSpan[] = []
  const doc = view.state.doc
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      if (line.from >= to) break
      for (const match of line.text.matchAll(/\[\[([^\]\n|#]+)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g)) {
        const start = line.from + (match.index ?? 0)
        const end = start + match[0].length
        const displayRange = wikiLinkDisplayRange(start, match)
        spans.push({
          from: start,
          to: end,
          textFrom: displayRange.from,
          textTo: displayRange.to
        })
      }
      pos = line.to + 1
    }
  }
  return spans
}

function wikiCompletionSource(
  notePathsRef: React.MutableRefObject<string[]>,
  onLoadWikiCompletionBodyRef: React.MutableRefObject<(path: string) => Promise<string | null>>
) {
  return async (context: CompletionContext) => {
    const before = context.matchBefore(/\[\[[^\]\n]*/)
    if (!before) return null
    const source = before.text.slice(2)
    const hashIndex = source.indexOf('#')
    const notePaths = notePathsRef.current
    if (!context.explicit && before.text === '') return null

    if (hashIndex >= 0) {
      const label = source.slice(0, hashIndex).trim()
      const headingQuery = source.slice(hashIndex + 1)
      if (!label || headingQuery.includes('|')) return null

      const target = resolveWikiPath(label, notePaths)
      if (!target) return null

      const body = await onLoadWikiCompletionBodyRef.current(target)
      if (body == null) return null

      const needle = headingQuery.trim().toLowerCase()
      const options = collectMarkdownHeadings(body)
        .filter((heading) => heading.searchText.includes(needle))
        .slice(0, 40)
        .map((heading) => ({
          label: heading.text,
          detail: `${target} H${heading.level}`,
          type: 'text',
          apply: `${heading.text}]]`
        }))

      return {
        from: before.from + 2 + hashIndex + 1,
        options,
        validFor: /^[^\]\n|]*$/
      }
    }

    const query = source.trim().toLowerCase()
    const options = notePaths
      .filter((path) => wikiSearchText(path).includes(query))
      .slice(0, 40)
      .map((path) => ({
        label: wikiLabel(path),
        detail: path,
        type: 'file',
        apply: `${wikiLabel(path)}]]`
      }))
    return {
      from: before.from + 2,
      options,
      validFor: /^[^\]\n]*$/
    }
  }
}

function collectMarkdownHeadings(markdown: string): Array<{ text: string; level: number; searchText: string }> {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap((line) => {
      const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
      if (!match) return []
      const text = stripMarkdownInlineSyntax(match[2])
      if (!text) return []
      return [{
        text,
        level: match[1].length,
        searchText: `${text} ${slugifyHeading(text)}`.toLowerCase()
      }]
    })
}

function wikiLinkAt(
  state: EditorState,
  pos: number,
  notePaths: string[]
): { destination: string; from: number; to: number } | null {
  const line = state.doc.lineAt(pos)
  for (const match of line.text.matchAll(/\[\[([^\]\n|#]+)(#[^\]\n|]+)?(?:\|[^\]\n]+)?\]\]/g)) {
    const from = line.from + (match.index ?? 0)
    const to = from + match[0].length
    if (pos < from || pos > to) continue
    const path = resolveWikiPath(match[1].trim(), notePaths)
    const heading = match[2]?.slice(1).trim()
    return path ? { destination: formatWikiDestination(path, heading), from, to } : null
  }
  return null
}

function wikiLinkDisplayRange(
  matchStart: number,
  match: RegExpMatchArray
): { from: number; to: number } {
  const linkStart = matchStart + 2
  const linkEnd = matchStart + match[0].length - 2
  const labelLength = match[1].length
  const anchorLength = match[2]?.length ?? 0
  if (match[3]) {
    const aliasStart = linkStart + labelLength + anchorLength + 1
    return { from: aliasStart, to: linkEnd }
  }
  if (match[2]) {
    const headingStart = linkStart + labelLength + 1
    return { from: headingStart, to: linkEnd }
  }
  return { from: linkStart, to: linkEnd }
}

function splitWikiDestination(destination: string): { path: string; heading: string | null } {
  const hashIndex = destination.indexOf('#')
  if (hashIndex < 0) return { path: destination, heading: null }
  const path = destination.slice(0, hashIndex)
  const heading = destination.slice(hashIndex + 1).trim()
  return { path, heading: heading || null }
}

function formatWikiDestination(path: string, heading: string | null | undefined): string {
  const normalizedHeading = heading?.trim()
  return normalizedHeading ? `${path}#${normalizedHeading}` : path
}

function resolveNoteJumpOffset(body: string, heading: string | null, fallbackOffset: number | null): number | null {
  if (!heading) return fallbackOffset
  return findHeadingOffset(body, heading)
}

function findHeadingOffset(markdown: string, target: string): number | null {
  const targetKey = normalizeHeadingKey(target)
  const targetSlug = slugifyHeading(target)
  let offset = 0
  const lineRegex = /([^\r\n]*)(\r\n|\r|\n|$)/g
  let lineMatch: RegExpExecArray | null
  while ((lineMatch = lineRegex.exec(markdown))) {
    const line = lineMatch[1]
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (match) {
      const headingText = stripMarkdownInlineSyntax(match[2])
      if (normalizeHeadingKey(headingText) === targetKey || slugifyHeading(headingText) === targetSlug) {
        return offset + line.search(/\S|$/)
      }
    }
    offset += line.length + lineMatch[2].length
    if (!lineMatch[2]) break
  }
  return null
}

function normalizeHeadingKey(value: string): string {
  return stripMarkdownInlineSyntax(value)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function slugifyHeading(value: string): string {
  return normalizeHeadingKey(value)
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

function stripMarkdownInlineSyntax(value: string): string {
  return value
    .replace(/\\([\\`*_[\]#])/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]+/g, '')
    .trim()
}

function resolveWikiPath(label: string, notePaths: string[]): string | null {
  const normalized = normalizeWikiLabel(label)
  if (!normalized) return null
  const exact = notePaths.find((path) => normalizeWikiLabel(path) === normalized)
  if (exact) return exact
  const withExtension = notePaths.find((path) => normalizeWikiLabel(stripMarkdownExtension(path)) === normalized)
  if (withExtension) return withExtension
  const byLabel = notePaths.find((path) => normalizeWikiLabel(wikiLabel(path)) === normalized)
  if (byLabel) return byLabel
  return isExplicitDocumentPath(label) ? label.replace(/\\/g, '/') : null
}

function wikiSearchText(path: string): string {
  return `${path} ${wikiLabel(path)} ${stripMarkdownExtension(path)}`.toLowerCase()
}

function wikiLabel(path: string): string {
  return stripMarkdownExtension(basename(path))
}

function stripMarkdownExtension(path: string): string {
  return path.replace(/\.(md|markdown)$/i, '')
}

function normalizeWikiLabel(label: string): string {
  return stripMarkdownExtension(label).replace(/\\/g, '/').trim().toLowerCase()
}

function findInlineMath(text: string): Array<{ from: number; to: number; source: string }> {
  const results: Array<{ from: number; to: number; source: string }> = []
  let start = -1
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '$') continue
    if (text[index - 1] === '\\' || text[index + 1] === '$') continue
    if (start < 0) {
      start = index
      continue
    }
    const source = text.slice(start + 1, index).trim()
    if (source) results.push({ from: start, to: index + 1, source })
    start = -1
  }
  return results
}

function findColorSpans(text: string): Array<{ from: number; to: number; textFrom: number; textTo: number; color: string }> {
  const spans: Array<{ from: number; to: number; textFrom: number; textTo: number; color: string }> = []
  const trigger = '{color:'
  let index = 0

  while (index < text.length) {
    const start = text.indexOf(trigger, index)
    if (start < 0) break
    if (isEscaped(text, start)) {
      index = start + trigger.length
      continue
    }

    const colorStart = start + trigger.length
    const separator = findNextUnescaped(text, '|', colorStart)
    if (separator < 0) break

    const rawColor = text.slice(colorStart, separator).trim()
    if (!isSafeEditorColor(rawColor)) {
      index = start + trigger.length
      continue
    }

    const end = findNextUnescaped(text, '}', separator + 1)
    if (end < 0) break
    spans.push({
      from: start,
      to: end + 1,
      textFrom: separator + 1,
      textTo: end,
      color: rawColor
    })
    index = end + 1
  }

  return spans
}

function findMarkdownEmphasisSpans(view: EditorView): Array<{ from: number; to: number; textFrom: number; textTo: number; kind: 'strong' | 'emphasis' }> {
  const spans: Array<{ from: number; to: number; textFrom: number; textTo: number; kind: 'strong' | 'emphasis' }> = []
  const tree = syntaxTree(view.state)

  for (const range of view.visibleRanges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter(ref) {
        if (ref.name !== 'Emphasis' && ref.name !== 'StrongEmphasis') return

        const marks: Array<{ from: number; to: number }> = []
        const cursor = ref.node.cursor()
        if (cursor.firstChild()) {
          do {
            if (cursor.name === 'EmphasisMark') marks.push({ from: cursor.from, to: cursor.to })
          } while (cursor.nextSibling())
        }
        if (marks.length < 2) return

        const firstMark = marks[0]
        const lastMark = marks[marks.length - 1]
        if (firstMark.to >= lastMark.from) return
        spans.push({
          from: firstMark.from,
          to: lastMark.to,
          textFrom: firstMark.to,
          textTo: lastMark.from,
          kind: ref.name === 'StrongEmphasis' ? 'strong' : 'emphasis'
        })
      }
    })
  }

  return spans
}

function findMarkdownEscapes(view: EditorView): Array<{ from: number; to: number }> {
  const escapes: Array<{ from: number; to: number }> = []
  const tree = syntaxTree(view.state)

  for (const range of view.visibleRanges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter(ref) {
        if (ref.name === 'Escape' && ref.to > ref.from + 1) {
          escapes.push({ from: ref.from, to: ref.to })
        }
      }
    })
  }

  return escapes
}

function findNextUnescaped(text: string, needle: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1
      continue
    }
    if (text[index] === needle) return index
  }
  return -1
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}

function isSafeEditorColor(color: string): boolean {
  if (!color || color.length > 80 || /[;"'{}<>]/.test(color)) return false
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', color)
  }
  return /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([^)]+\)|hsla?\([^)]+\))$/i.test(color)
}

function buildApplyColorChanges(
  text: string,
  ranges: Array<{ from: number; to: number }>,
  color: string
): Array<{ from: number; to: number; insert: string }> | 'crosses-color-markup' {
  const spans = findColorSpans(text)
  const changes: Array<{ from: number; to: number; insert: string }> = []
  const recoloredSpanStarts = new Set<number>()

  for (const range of ranges) {
    const containingSpan = spans.find((span) => range.from >= span.textFrom && range.to <= span.textTo)
    if (containingSpan) {
      if (recoloredSpanStarts.has(containingSpan.from)) continue
      const colorStart = containingSpan.from + '{color:'.length
      const colorEnd = findNextUnescaped(text, '|', colorStart)
      if (colorEnd < 0) return 'crosses-color-markup'
      changes.push({ from: colorStart, to: colorEnd, insert: color })
      recoloredSpanStarts.add(containingSpan.from)
      continue
    }

    if (spans.some((span) => range.from < span.to && range.to > span.from)) {
      return 'crosses-color-markup'
    }

    changes.push({
      from: range.from,
      to: range.to,
      insert: `{color:${color}|${escapeColorSpanText(text.slice(range.from, range.to))}}`
    })
  }

  return changes.sort((left, right) => left.from - right.from)
}

function escapeColorSpanText(text: string): string {
  return text.replace(/([\\}])/g, '\\$1')
}

function GitBadge({
  git,
  loadingToCommit,
  showToCommit,
  onToggleToCommit
}: {
  git: GitInfo
  loadingToCommit: boolean
  showToCommit: boolean
  onToggleToCommit: () => void
}): JSX.Element {
  if (!git.isRepo) {
    return <div className="git-badge muted">{git.message}</div>
  }
  const branch = git.currentBranch ?? 'detached'
  const hasDirtyFiles = git.status === 'dirtyOnInuse' || git.status === 'needsCheckpoint'
  const className =
    git.status === 'needsCheckpoint' || git.status === 'gitUnavailable'
      ? 'git-badge warn'
      : git.status === 'dirtyOnInuse'
        ? 'git-badge dirty'
        : 'git-badge'
  return (
    <div className={className} title={git.message}>
      <span>Git</span>
      <strong>{branch}</strong>
      {git.status === 'dirtyOnInuse' && <em>dirty</em>}
      {git.status === 'needsCheckpoint' && <em>needs checkpoint</em>}
      {hasDirtyFiles && (
        <button
          type="button"
          className={showToCommit ? 'to-commit-button active' : 'to-commit-button'}
          onClick={onToggleToCommit}
          disabled={loadingToCommit}
          aria-pressed={showToCommit}
        >
          ToCommit
        </button>
      )}
    </div>
  )
}

function createEditorState(doc: string, extensions: Extension[]): EditorState {
  return EditorState.create({
    doc,
    extensions
  })
}

function isTypstPath(path: string | null): boolean {
  return !!path && path.toLowerCase().endsWith('.typ')
}

function rememberEditorEcho(
  pendingEchoes: Map<string, string[]>,
  path: string,
  body: string
): void {
  const echoes = pendingEchoes.get(path) ?? []
  echoes.push(body)
  pendingEchoes.set(path, echoes.slice(-20))
}

function consumeEditorEcho(
  pendingEchoes: Map<string, string[]>,
  path: string,
  body: string
): boolean {
  const echoes = pendingEchoes.get(path)
  if (!echoes) return false
  const index = echoes.indexOf(body)
  if (index < 0) return false
  const remaining = echoes.slice(index + 1)
  if (remaining.length > 0) {
    pendingEchoes.set(path, remaining)
  } else {
    pendingEchoes.delete(path)
  }
  return true
}

function applyEditable(
  view: EditorView,
  editable: Compartment | null,
  enabled: boolean
): void {
  if (!editable) return
  view.dispatch({
    effects: editable.reconfigure(EditorView.editable.of(enabled))
  })
}

function indentMarkdownList(view: EditorView): boolean {
  const range = view.state.selection.main
  if (!range.empty) return false
  const line = view.state.doc.lineAt(range.head)
  const match = parseMarkdownListLine(line.text)
  if (!match) return false

  view.dispatch({
    changes: { from: line.from, insert: '    ' },
    selection: EditorSelection.cursor(range.head + 4),
    userEvent: 'input.indent'
  })
  renumberMarkdownOrderedLists(view)
  return true
}

function outdentMarkdownList(view: EditorView): boolean {
  const range = view.state.selection.main
  if (!range.empty) return false
  const line = view.state.doc.lineAt(range.head)
  const match = parseMarkdownListLine(line.text)
  if (!match || match.indent.length === 0) return false

  const remove = Math.min(4, match.indent.length)
  view.dispatch({
    changes: { from: line.from, to: line.from + remove },
    selection: EditorSelection.cursor(Math.max(line.from, range.head - remove)),
    userEvent: 'input.dedent'
  })
  renumberMarkdownOrderedLists(view)
  return true
}

function continueMarkdownList(view: EditorView): boolean {
  const range = view.state.selection.main
  if (!range.empty) return false
  const line = view.state.doc.lineAt(range.head)
  const match = parseMarkdownListLine(line.text)
  if (!match) return false

  if (match.body.trim().length === 0) {
    view.dispatch({
      changes: { from: line.from, to: line.from + match.markerEnd },
      selection: EditorSelection.cursor(line.from),
      userEvent: 'input'
    })
    renumberMarkdownOrderedLists(view)
    return true
  }

  const nextMarker = match.ordered
    ? `${match.indent}${match.number + 1}${match.delimiter} `
    : `${match.indent}${match.bullet} `
  view.dispatch({
    changes: { from: range.head, insert: `\n${nextMarker}` },
    selection: EditorSelection.cursor(range.head + nextMarker.length + 1),
    userEvent: 'input'
  })
  renumberMarkdownOrderedLists(view)
  return true
}

type MarkdownListStyle = 'bullet' | 'numbered'

function formatMarkdownListSelection(view: EditorView, style: MarkdownListStyle): boolean {
  const transaction = view.state.changeByRange((range) => {
    const startLine = view.state.doc.lineAt(range.from)
    const endPosition = range.to > range.from && range.to === view.state.doc.lineAt(range.to).from
      ? range.to - 1
      : range.to
    const endLine = view.state.doc.lineAt(Math.max(range.from, endPosition))
    const lines: string[] = []

    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
      lines.push(view.state.doc.line(lineNumber).text)
    }

    const counters = new Map<number, number>()
    const formattedLines = lines.map((line) => {
      if (line.trim().length === 0) {
        counters.clear()
        return line
      }

      const existing = parseMarkdownListLine(line)
      const indent = existing?.indent ?? line.match(/^\s*/)?.[0] ?? ''
      const body = existing ? existing.body : line.slice(indent.length)

      if (style === 'bullet') return `${indent}- ${body.trimStart()}`

      const level = Math.floor(indentColumn(indent) / 4)
      for (const key of [...counters.keys()]) {
        if (key > level) counters.delete(key)
      }
      const next = (counters.get(level) ?? 0) + 1
      counters.set(level, next)
      return `${indent}${next}. ${body.trimStart()}`
    })

    const insert = formattedLines.join('\n')
    return {
      changes: { from: startLine.from, to: endLine.to, insert },
      range: EditorSelection.range(startLine.from, startLine.from + insert.length)
    }
  })

  if (transaction.changes.empty) return false
  view.dispatch({
    ...transaction,
    userEvent: 'input'
  })
  if (style === 'numbered') renumberMarkdownOrderedLists(view)
  return true
}

type MarkdownListLine = {
  indent: string
  markerEnd: number
  body: string
} & (
  | {
      ordered: true
      number: number
      delimiter: string
      bullet?: never
    }
  | {
      ordered: false
      bullet: string
      number?: never
      delimiter?: never
    }
)

function parseMarkdownListLine(text: string): MarkdownListLine | null {
  const ordered = text.match(/^(\s*)(\d+)([.)])(\s+)(.*)$/)
  if (ordered) {
    return {
      ordered: true,
      indent: ordered[1],
      number: Number.parseInt(ordered[2], 10),
      delimiter: ordered[3],
      markerEnd: ordered[1].length + ordered[2].length + ordered[3].length + ordered[4].length,
      body: ordered[5]
    }
  }

  const bullet = text.match(/^(\s*)([-+*])(\s+)(.*)$/)
  if (bullet) {
    return {
      ordered: false,
      indent: bullet[1],
      bullet: bullet[2],
      markerEnd: bullet[1].length + bullet[2].length + bullet[3].length,
      body: bullet[4]
    }
  }

  return null
}

function renumberMarkdownOrderedLists(view: EditorView): void {
  const changes: Array<{ from: number; to: number; insert: string }> = []
  const counters = new Map<number, number>()
  let previousWasList = false

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber)
    const match = line.text.match(/^(\s*)(\d+)([.)])(\s+)/)
    const unordered = line.text.match(/^\s*[-+*]\s+/)
    if (!match) {
      if (!unordered && line.text.trim().length === 0) {
        counters.clear()
        previousWasList = false
      } else if (!unordered && !previousWasList) {
        counters.clear()
      }
      previousWasList = !!unordered
      continue
    }

    const level = Math.floor(indentColumn(match[1]) / 4)
    for (const key of [...counters.keys()]) {
      if (key > level) counters.delete(key)
    }
    const next = (counters.get(level) ?? 0) + 1
    counters.set(level, next)
    const current = Number.parseInt(match[2], 10)
    if (current !== next) {
      const from = line.from + match[1].length
      changes.push({
        from,
        to: from + match[2].length,
        insert: String(next)
      })
    }
    previousWasList = true
  }

  if (changes.length > 0) {
    view.dispatch({
      changes,
      userEvent: 'input'
    })
  }
}

function indentColumn(indent: string): number {
  return [...indent].reduce((total, char) => total + (char === '\t' ? 4 : 1), 0)
}

function calculateMarkdownLine(view: EditorView): boolean {
  const range = view.state.selection.main
  if (!range.empty) return false
  const line = view.state.doc.lineAt(range.head)
  const calculation = parseMarkdownCalculationLine(line.text)
  if (!calculation) return false

  const value = evaluateArithmeticExpression(calculation.expression)
  if (value == null) return false

  const result = formatCalculationResult(value)
  const nextText = `${calculation.prefix}${calculation.expression} = ${result}`
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: nextText },
    selection: EditorSelection.cursor(line.from + nextText.length),
    userEvent: 'input'
  })
  return true
}

function parseMarkdownCalculationLine(text: string): { prefix: string; expression: string } | null {
  const match = text.match(/^(\s*)((?:[-+*/().%\d\s]|\*\*)+?)(?:\s*=\s*[-+.\deE]*)?\s*$/)
  if (!match) return null
  const expression = match[2].trim()
  if (!/[+\-*/%]/.test(expression)) return null
  if (!/\d/.test(expression)) return null
  return {
    prefix: match[1],
    expression
  }
}

function evaluateArithmeticExpression(expression: string): number | null {
  if (!/^[\d+\-*/().%\s]+$/.test(expression)) return null
  if (!/\d/.test(expression)) return null
  try {
    const value = Function(`"use strict"; return (${expression})`)()
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function formatCalculationResult(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return Number.parseFloat(value.toPrecision(12)).toString()
}

function toggleMarkdownBold(view: EditorView): boolean {
  return toggleMarkdownWrap(view, '**')
}

function toggleMarkdownItalic(view: EditorView): boolean {
  return toggleMarkdownWrap(view, '*')
}

function toggleMarkdownWrap(view: EditorView, marker: string): boolean {
  const transaction = view.state.changeByRange((range) => {
    if (range.empty) {
      return {
        changes: { from: range.head, insert: `${marker}${marker}` },
        range: EditorSelection.cursor(range.head + marker.length)
      }
    }

    const selected = view.state.doc.sliceString(range.from, range.to)
    const beforeFrom = Math.max(0, range.from - marker.length)
    const afterTo = Math.min(view.state.doc.length, range.to + marker.length)
    const before = view.state.doc.sliceString(beforeFrom, range.from)
    const after = view.state.doc.sliceString(range.to, afterTo)

    if (before === marker && after === marker) {
      return {
        changes: [
          { from: afterTo - marker.length, to: afterTo },
          { from: beforeFrom, to: range.from }
        ],
        range: EditorSelection.range(beforeFrom, range.to - marker.length)
      }
    }

    return {
      changes: [
        { from: range.from, insert: marker },
        { from: range.to, insert: marker }
      ],
      range: EditorSelection.range(
        range.from + marker.length,
        range.to + marker.length
      )
    }
  })
  view.dispatch({
    ...transaction,
    userEvent: 'input'
  })
  return true
}

function TabStrip({
  tabs,
  activeId,
  isDirty,
  onSelect,
  onClose
}: {
  tabs: OpenTab[]
  activeId: string | null
  isDirty: (tab: OpenTab) => boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
}): JSX.Element | null {
  if (tabs.length === 0) return null
  return (
    <nav className="tab-strip" aria-label="Open files">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        const dirty = isDirty(tab)
        return (
          <button
            key={tab.id}
            type="button"
            className={active ? 'tab active' : 'tab'}
            onClick={() => onSelect(tab.id)}
            title={tabLabel(tab)}
          >
            <span className="tab-title">{basename(tab.path)}{tab.mode === 'markdown' ? '' : ` - ${modeLabel(tab.mode)}`}</span>
            {tab.outOfVault && <span className="tab-outside" aria-label="Outside vault">OUT</span>}
            {dirty && <span className="tab-dirty" aria-label="Modified" />}
            {tab.externalStatus && <span className="tab-external" aria-label={tab.externalStatus} />}
            <span
              role="button"
              tabIndex={0}
              className="tab-close"
              aria-label={`Close ${tab.path}`}
              onClick={(event) => {
                event.stopPropagation()
                onClose(tab.id)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                onClose(tab.id)
              }}
            >
              x
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function FileTree({
  entries,
  activePath,
  expanded,
  pinnedPaths,
  onToggle,
  onOpen,
  onOpenTrack,
  onTogglePin,
  onRenameFile,
  onDeleteFile,
  onRenameFolder,
  onDeleteFolder,
  onRevealHidden,
  depth = 0
}: {
  entries: TreeEntry[]
  activePath: string | null
  expanded: Set<string>
  pinnedPaths: Set<string>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  onOpenTrack: (path: string) => void
  onTogglePin: (path: string) => void
  onRenameFile: (path: string) => void
  onDeleteFile: (path: string) => void
  onRenameFolder: (path: string) => void
  onDeleteFolder: (path: string) => void
  onRevealHidden: (path: string) => void
  depth?: number
}): JSX.Element {
  if (entries.length === 0) {
    return <div className="empty-list">No note files</div>
  }

  const visibleEntries = orderTreeEntries(entries, pinnedPaths).filter(
    (entry) => entry.kind === 'dir' || !hasPath(pinnedPaths, entry.path)
  )
  if (visibleEntries.length === 0) return <></>

  return (
    <div className="tree-list">
      {visibleEntries.map((entry) => {
        const isDir = entry.kind === 'dir'
        const isExpanded = expanded.has(entry.path)
        const active = activePath != null && samePath(activePath, entry.path)
        const pinned = hasPath(pinnedPaths, entry.path)
        return (
          <div key={entry.path}>
            <button
              type="button"
              className={`${active ? 'tree-row active' : 'tree-row'}${pinned ? ' pinned' : ''}`}
              style={{ paddingLeft: 10 + depth * 16 }}
              onClick={() => {
                if (isDir) onToggle(entry.path)
                else onOpen(entry.path)
              }}
              title={entry.path}
            >
              <span className="tree-chevron">{isDir ? (isExpanded ? 'v' : '>') : ''}</span>
              <span className="tree-icon">{isDir ? 'folder' : fileIcon(entry.path)}</span>
              <span className="tree-name">{entry.name}</span>
              <span className="tree-actions">
                {!isDir && (
                  <span
                    role="button"
                    tabIndex={0}
                    title={pinned ? 'Unpin note' : 'Pin note'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onTogglePin(entry.path)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      event.stopPropagation()
                      onTogglePin(entry.path)
                    }}
                  >
                    {pinned ? 'unpin' : 'pin'}
                  </span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  title={isDir ? 'Open folder' : isMarkdownPath(entry.path) ? 'Open with Track Changes' : 'Track Changes is Markdown-only'}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!isDir && isMarkdownPath(entry.path)) onOpenTrack(entry.path)
                  }}
                  onKeyDown={(event) => {
                    if (isDir || !isMarkdownPath(entry.path) || (event.key !== 'Enter' && event.key !== ' ')) return
                    event.preventDefault()
                    event.stopPropagation()
                    onOpenTrack(entry.path)
                  }}
                >
                  track
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  title={isDir ? 'Rename folder' : 'Rename note'}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (isDir) onRenameFolder(entry.path)
                    else onRenameFile(entry.path)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    event.stopPropagation()
                    if (isDir) onRenameFolder(entry.path)
                    else onRenameFile(entry.path)
                  }}
                >
                  rename
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  title={isDir ? 'Delete folder' : 'Delete note'}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (isDir) onDeleteFolder(entry.path)
                    else onDeleteFile(entry.path)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    event.stopPropagation()
                    if (isDir) onDeleteFolder(entry.path)
                    else onDeleteFile(entry.path)
                  }}
                >
                  delete
                </span>
              </span>
            </button>
            {isDir && isExpanded && (
              <>
                <FileTree
                  entries={entry.children}
                  activePath={activePath}
                  expanded={expanded}
                  pinnedPaths={pinnedPaths}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  onOpenTrack={onOpenTrack}
                  onTogglePin={onTogglePin}
                  onRenameFile={onRenameFile}
                  onDeleteFile={onDeleteFile}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onRevealHidden={onRevealHidden}
                  depth={depth + 1}
                />
                {entry.hiddenChildren && entry.hiddenChildren.length > 0 && (
                  <button
                    type="button"
                    className="tree-row tree-reveal-row"
                    style={{ paddingLeft: 10 + (depth + 1) * 16 }}
                    onClick={() => onRevealHidden(entry.path)}
                    title={`Show hidden files under ${entry.path}`}
                  >
                    <span className="tree-chevron" />
                    <span className="tree-icon">+</span>
                    <span className="tree-name">Show {countFiles(entry.hiddenChildren)} more files</span>
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PinnedNotes({
  entries,
  activePath,
  onOpen,
  onOpenTrack,
  onTogglePin,
  onRenameFile,
  onDeleteFile
}: {
  entries: TreeEntry[]
  activePath: string | null
  onOpen: (path: string) => void
  onOpenTrack: (path: string) => void
  onTogglePin: (path: string) => void
  onRenameFile: (path: string) => void
  onDeleteFile: (path: string) => void
}): JSX.Element | null {
  if (entries.length === 0) return null
  return (
    <div className="pinned-notes">
      <div className="tree-list">
        {entries.map((entry) => (
          <button
            key={entry.path}
            type="button"
            className={`${activePath != null && samePath(activePath, entry.path) ? 'tree-row active' : 'tree-row'} pinned`}
            onClick={() => onOpen(entry.path)}
            title={entry.path}
          >
            <span className="tree-chevron" />
            <span className="tree-icon">{fileIcon(entry.path)}</span>
            <span className="tree-name">{entry.path}</span>
            <span className="tree-actions">
              <span
                role="button"
                tabIndex={0}
                title="Unpin note"
                onClick={(event) => {
                  event.stopPropagation()
                  onTogglePin(entry.path)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  event.stopPropagation()
                  onTogglePin(entry.path)
                }}
              >
                unpin
              </span>
              <span
                role="button"
                tabIndex={0}
                title={isMarkdownPath(entry.path) ? 'Open with Track Changes' : 'Track Changes is Markdown-only'}
                onClick={(event) => {
                  event.stopPropagation()
                  if (isMarkdownPath(entry.path)) onOpenTrack(entry.path)
                }}
                onKeyDown={(event) => {
                  if (!isMarkdownPath(entry.path) || (event.key !== 'Enter' && event.key !== ' ')) return
                  event.preventDefault()
                  event.stopPropagation()
                  onOpenTrack(entry.path)
                }}
              >
                track
              </span>
              <span
                role="button"
                tabIndex={0}
                title="Rename note"
                onClick={(event) => {
                  event.stopPropagation()
                  onRenameFile(entry.path)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  event.stopPropagation()
                  onRenameFile(entry.path)
                }}
              >
                rename
              </span>
              <span
                role="button"
                tabIndex={0}
                title="Delete note"
                onClick={(event) => {
                  event.stopPropagation()
                  onDeleteFile(entry.path)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  event.stopPropagation()
                  onDeleteFile(entry.path)
                }}
              >
                delete
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function SearchResults({
  matches,
  searching,
  activePath,
  onOpen
}: {
  matches: ContentMatch[]
  searching: boolean
  activePath: string | null
  onOpen: (match: ContentMatch) => void
}): JSX.Element {
  if (searching && matches.length === 0) {
    return <div className="empty-list">Searching...</div>
  }
  if (matches.length === 0) {
    return <div className="empty-list">No content matches</div>
  }
  return (
    <div className="result-list">
      {matches.map((match, index) => (
        <button
          key={`${match.path}:${match.lineNumber}:${index}`}
          type="button"
          className={activePath != null && samePath(activePath, match.path) ? 'result-row active' : 'result-row'}
          onClick={() => onOpen(match)}
          title={`${match.path}:${match.lineNumber}`}
        >
          <span className="result-path">{match.path}</span>
          <span className="result-line">{match.lineNumber}</span>
          <span className="result-text">{match.lineText}</span>
        </button>
      ))}
    </div>
  )
}

function filterTree(
  entries: TreeEntry[],
  query: string,
  revealedFolders: Set<string>,
  pinnedPaths: Set<string>
): TreeEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return entries

  return entries.flatMap((entry) => {
    const selfMatches =
      entry.name.toLowerCase().includes(needle) ||
      entry.path.toLowerCase().includes(needle)
    if (entry.kind === 'file') return selfMatches ? [entry] : []

    if (selfMatches) {
      return [entry]
    }

    const children = filterTree(entry.children, query, revealedFolders, pinnedPaths)
    if (children.length > 0) {
      return [{ ...entry, children }]
    }
    return []
  })
}

function orderTreeEntries(entries: TreeEntry[], pinnedPaths: Set<string>): TreeEntry[] {
  return [...entries].sort((left, right) => {
    const leftPinned = left.kind === 'file' && hasPath(pinnedPaths, left.path)
    const rightPinned = right.kind === 'file' && hasPath(pinnedPaths, right.path)
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1
    return 0
  })
}

function countFiles(entries: TreeEntry[]): number {
  return entries.reduce((total, entry) => {
    if (entry.kind === 'file') return total + 1
    return total + countFiles(entry.children)
  }, 0)
}

function collectFilePaths(entries: TreeEntry[]): string[] {
  return entries.flatMap((entry) => {
    if (entry.kind === 'file') return [entry.path]
    return collectFilePaths(entry.children)
  })
}

function collectPinnedFiles(entries: TreeEntry[], pinnedPaths: Set<string>): TreeEntry[] {
  const filesByPath = new Map<string, TreeEntry>()
  const visit = (items: TreeEntry[]) => {
    for (const item of items) {
      if (item.kind === 'file') {
        filesByPath.set(pathKey(item.path), item)
      } else {
        visit(item.children)
      }
    }
  }
  visit(entries)
  const seen = new Set<string>()
  return [...pinnedPaths]
    .map((path) => filesByPath.get(pathKey(path)))
    .filter((entry): entry is TreeEntry => Boolean(entry))
    .filter((entry) => {
      const key = pathKey(entry.path)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function collectDirPaths(entries: TreeEntry[]): string[] {
  return entries.flatMap((entry) => {
    if (entry.kind === 'file') return []
    return [entry.path, ...collectDirPaths(entry.children)]
  })
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() ?? path
}

function folderAncestors(path: string): string[] {
  const parts = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path)
}

function isDocumentPath(path: string): boolean {
  return /\.(md|markdown|typ)$/i.test(path)
}

function isExplicitDocumentPath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, '/')
  return isDocumentPath(normalized) && (
    normalized.startsWith('../') ||
    normalized.startsWith('./') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.includes('/')
  )
}

function fileIcon(path: string): string {
  return isTypstPath(path) ? 'typ' : 'md'
}

function selectAdjacentTab(
  tabs: OpenTab[],
  activeId: string,
  direction: -1 | 1,
  select: (id: string) => void
): void {
  const index = tabs.findIndex((tab) => tab.id === activeId)
  if (index < 0) return
  const nextIndex = (index + direction + tabs.length) % tabs.length
  select(tabs[nextIndex].id)
}

function tabId(path: string, mode: EditorMode): string {
  return `${mode}:${pathKey(path)}`
}

function modeLabel(mode: EditorMode): string {
  if (mode === 'track') return 'Track'
  if (mode === 'canvas') return 'Canvas'
  return 'Markdown'
}

function tabLabel(tab: OpenTab): string {
  return tab.mode === 'markdown' ? tab.path : `${tab.path} - ${modeLabel(tab.mode)}`
}

function pathKey(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return currentPathsCaseSensitive ? normalized : normalized.toLowerCase()
}

function samePath(left: string, right: string): boolean {
  return pathKey(left) === pathKey(right)
}

function hasPath(paths: Set<string>, path: string): boolean {
  const key = pathKey(path)
  return [...paths].some((candidate) => pathKey(candidate) === key)
}

function isPathInsideFolder(path: string, folder: string): boolean {
  const folderKey = pathKey(folder)
  return pathKey(path).startsWith(`${folderKey}/`)
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  return paths.filter((path) => {
    const key = pathKey(path)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isRawSourceMode(mode: EditorMode): boolean {
  return mode === 'markdown' || mode === 'canvas'
}

function countEditorText(state: EditorState): TextCountResult {
  const selectedRanges = state.selection.ranges.filter((range) => !range.empty)
  const scope = selectedRanges.length > 0 ? 'selection' : 'document'
  const texts = selectedRanges.length > 0
    ? selectedRanges.map((range) => state.doc.sliceString(range.from, range.to))
    : [state.doc.toString()]
  const characters = texts.reduce((total, text) => total + text.length, 0)
  const words = texts.reduce((total, text) => total + countWords(text), 0)
  return { scope, words, characters }
}

function countWords(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0
}

function formatCount(count: number): string {
  return new Intl.NumberFormat().format(count)
}

function uniqueSaveTargets(tabs: OpenTab[]): OpenTab[] {
  const seenRawPaths = new Set<string>()
  return tabs.filter((tab) => {
    if (!isRawSourceMode(tab.mode)) return true
    const key = pathKey(tab.path)
    if (seenRawPaths.has(key)) return false
    seenRawPaths.add(key)
    return true
  })
}

async function saveTabBodyWithConflictCheck(tab: OpenTab, body: string): Promise<SaveResult> {
  let result: SaveNoteCommandResult
  try {
    result = await invoke<SaveNoteCommandResult>('save_note_if_unchanged', {
      path: tab.path,
      body,
      expectedBody: tab.savedBody
    })
  } catch (err) {
    return {
      saved: false,
      message: `Could not verify disk state for ${tab.path}; save blocked to avoid overwriting a moved or deleted file. ${String(err)}`
    }
  }

  if (result.status === 'conflict') {
    const disk = result.current
    if (disk.body === body) {
      return { saved: true, note: disk }
    }
    if (isMarkdownPath(tab.path) && !tab.outOfVault) {
      const candidate = await invoke<NoteContent>('write_track_merge_candidate', {
        path: tab.path,
        body
      })
      return {
        saved: false,
        conflictPath: candidate.path,
        message: `Disk changed for ${tab.path}. Wrote your unsaved version to ${candidate.path} for diff/merge; original disk file was not overwritten.`
      }
    }
    return {
      saved: false,
      message: `Disk changed for ${tab.path}. Save blocked to avoid overwriting external changes.`
    }
  }

  return { saved: true, note: result.note }
}

async function saveWindowPlacement(appWindow: ReturnType<typeof getCurrentWindow>): Promise<void> {
  try {
    const [position, size] = await Promise.all([
      appWindow.outerPosition(),
      appWindow.innerSize()
    ])
    writeStoredWindowPlacement({
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height
    })
  } catch {
    // Window placement is best effort.
  }
}

async function restoreWindowPlacement(appWindow: ReturnType<typeof getCurrentWindow>): Promise<void> {
  const placement = readStoredWindowPlacement()
  if (!placement) return

  const monitors = await availableMonitors()
  if (!windowPlacementIsVisible(placement, monitors)) return

  await appWindow.setSize(new PhysicalSize(placement.width, placement.height))
  await appWindow.setPosition(new PhysicalPosition(placement.x, placement.y))
}

function readStoredWindowPlacement(): StoredWindowPlacement | null {
  try {
    const raw = localStorage.getItem(WINDOW_PLACEMENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredWindowPlacement>
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number' ||
      parsed.width < 480 ||
      parsed.height < 320
    ) {
      return null
    }
    return {
      x: Math.round(parsed.x),
      y: Math.round(parsed.y),
      width: Math.round(parsed.width),
      height: Math.round(parsed.height)
    }
  } catch {
    return null
  }
}

function writeStoredWindowPlacement(placement: StoredWindowPlacement): void {
  try {
    localStorage.setItem(WINDOW_PLACEMENT_KEY, JSON.stringify(placement))
  } catch {
    // Ignore quota/storage failures; placement restore is best effort.
  }
}

function readStoredSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    if (!raw) return 340
    return clamp(Number(raw), SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
  } catch {
    return 340
  }
}

function writeStoredSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // Ignore storage failures; the in-memory width still applies.
  }
}

function readStoredEditorSplitRatio(): number {
  try {
    const raw = localStorage.getItem(EDITOR_SPLIT_RATIO_KEY)
    if (!raw) return 0.5
    return clamp(Number(raw), EDITOR_SPLIT_MIN_RATIO, EDITOR_SPLIT_MAX_RATIO)
  } catch {
    return 0.5
  }
}

function writeStoredEditorSplitRatio(ratio: number): void {
  try {
    localStorage.setItem(EDITOR_SPLIT_RATIO_KEY, String(clamp(ratio, EDITOR_SPLIT_MIN_RATIO, EDITOR_SPLIT_MAX_RATIO)))
  } catch {
    // Ignore storage failures; the in-memory ratio still applies.
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

function readCanvasMarkdownDisplayMode(): CanvasMarkdownDisplayMode {
  try {
    return localStorage.getItem(CANVAS_MARKDOWN_DISPLAY_KEY) === 'raw' ? 'raw' : 'summary'
  } catch {
    return 'summary'
  }
}

function readCanvasDocumentDisplayMode(): CanvasDocumentDisplayMode {
  try {
    return localStorage.getItem(CANVAS_DOCUMENT_DISPLAY_KEY) === 'panel' ? 'panel' : 'node'
  } catch {
    return 'node'
  }
}

function windowPlacementIsVisible(
  placement: StoredWindowPlacement,
  monitors: Awaited<ReturnType<typeof availableMonitors>>
): boolean {
  if (monitors.length === 0) return true
  const centerX = placement.x + placement.width / 2
  const centerY = placement.y + placement.height / 2
  return monitors.some((monitor) => {
    const area = monitor.workArea
    return (
      centerX >= area.position.x &&
      centerX <= area.position.x + area.size.width &&
      centerY >= area.position.y &&
      centerY <= area.position.y + area.size.height
    )
  })
}

function isAppChromeTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return true
  return !element.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"], .cm-editor')
}

async function loadOrCreateTrackState(path: string, body: string): Promise<TrackState> {
  const saved = await invoke<TrackState | null>('read_track_state', { path })
  if (saved) return saved
  const { createInitialTrackState } = await import('./track/TrackChangesEditor')
  return createInitialTrackState(path, markdownToTiptap(body))
}

function sessionKey(root: string): string {
  return `${SESSION_KEY_PREFIX}${root}`
}

function readStoredSession(root: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(root))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    const openTabs = Array.isArray(parsed.openTabs)
        ? parsed.openTabs.filter((tab): tab is { path: string; mode: EditorMode } =>
          typeof tab?.path === 'string' && (tab.mode === 'markdown' || tab.mode === 'track' || tab.mode === 'canvas')
        )
      : []
    return {
      openTabs,
      openPaths: Array.isArray(parsed.openPaths)
        ? parsed.openPaths.filter((path): path is string => typeof path === 'string')
        : [],
      activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
      activePath: typeof parsed.activePath === 'string' ? parsed.activePath : null,
      splitOpen: parsed.splitOpen === true,
      splitPath: typeof parsed.splitPath === 'string' ? parsed.splitPath : null,
      splitMode: parsed.splitMode === 'markdown' || parsed.splitMode === 'track' || parsed.splitMode === 'canvas' ? parsed.splitMode : null,
      expanded: Array.isArray(parsed.expanded)
        ? parsed.expanded.filter((path): path is string => typeof path === 'string')
        : [],
      pinnedPaths: Array.isArray(parsed.pinnedPaths)
        ? parsed.pinnedPaths.filter((path): path is string => typeof path === 'string')
        : [],
      recentPaths: Array.isArray(parsed.recentPaths)
        ? parsed.recentPaths.filter((path): path is string => typeof path === 'string')
        : [],
      fileQuery: typeof parsed.fileQuery === 'string' ? parsed.fileQuery : '',
      contentUsesFileFilter: parsed.contentUsesFileFilter === true
    }
  } catch {
    return null
  }
}

function writeStoredSession(root: string, session: StoredSession): void {
  try {
    localStorage.setItem(sessionKey(root), JSON.stringify(session))
  } catch {
    // Ignore quota/storage failures; session restore is best effort.
  }
}

function normalizeCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events
    .map(normalizeCalendarEvent)
    .filter((event) => event.id && event.date && event.title)
    .sort(compareCalendarEvents)
}

function normalizeCalendarEvent(event: CalendarEvent): CalendarEvent {
  const date = isIsoDate(event.date) ? event.date : todayIsoDate()
  const recurrence = normalizeCalendarRecurrence(event.recurrence)
  const recurrenceEndDate =
    recurrence !== 'none' && isIsoDate(event.recurrenceEndDate) && event.recurrenceEndDate >= date
      ? event.recurrenceEndDate
      : ''
  return {
    id: event.id || createCalendarEventId(),
    date,
    title: event.title.trim(),
    time: isTimeValue(event.time) ? event.time : '',
    notes: event.notes ?? '',
    recurrence,
    recurrenceEndDate
  }
}

function compareCalendarEvents(left: CalendarEvent, right: CalendarEvent): number {
  return (
    left.date.localeCompare(right.date) ||
    (left.time || '99:99').localeCompare(right.time || '99:99') ||
    left.title.localeCompare(right.title)
  )
}

function createCalendarEventId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `evt_${random}`
}

function todayIsoDate(): string {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isTimeValue(value: string): boolean {
  return value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function normalizeCalendarRecurrence(value: string | undefined): CalendarEvent['recurrence'] {
  return value === 'daily' || value === 'weekly' || value === 'monthly' ? value : 'none'
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
