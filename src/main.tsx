import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { availableMonitors, getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window'
import {
  Annotation,
  Compartment,
  RangeSetBuilder,
  EditorState,
  EditorSelection,
  StateField,
  type Extension
} from '@codemirror/state'
import { autocompletion, startCompletion, type CompletionContext } from '@codemirror/autocomplete'
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
  defaultHighlightStyle,
  syntaxHighlighting
} from '@codemirror/language'
import { searchKeymap } from '@codemirror/search'
import { typst } from 'codemirror-lang-typst'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import MarkdownIt from 'markdown-it'
import { TrackChangesEditor, createInitialTrackState } from './track/TrackChangesEditor'
import { markdownToTiptap } from './track/markdown'
import type { TrackState } from './track/types'
import './styles.css'

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
}

type TypstPreview = {
  format: TypstPreviewFormat
  content: string
  updatedAt: number
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

type SearchHighlight = {
  path: string
  query: string
  offset: number
}

type TypstPreviewState = {
  tabId: string
  format: TypstPreviewFormat
  content: string | null
  loading: boolean
  error: string | null
}

type EditorMode = 'markdown' | 'track'
type SearchView = 'file' | 'content'

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
}

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
const LAST_VAULT_KEY = 'notesproject:last-vault'
const SESSION_KEY_PREFIX = 'notesproject:session:'
const WINDOW_PLACEMENT_KEY = 'notesproject:window-placement'

type AppProfile = {
  autosaveDelayMs: number
  checkpointIntervalMs: number
  gitStatusPollIntervalMs: number
  typstPreviewDebounceMs: number
  closeMarkdownBeforeTrack: boolean
}

const DEFAULT_PROFILE: AppProfile = {
  autosaveDelayMs: 5000,
  checkpointIntervalMs: 3 * 60 * 1000,
  gitStatusPollIntervalMs: 5 * 60 * 1000,
  typstPreviewDebounceMs: 250,
  closeMarkdownBeforeTrack: true
}

let currentPathsCaseSensitive = true

type StoredSession = {
  openTabs: Array<{ path: string; mode: EditorMode }>
  openPaths?: string[]
  activeId?: string | null
  activePath?: string | null
  expanded: string[]
  pinnedPaths?: string[]
  fileQuery: string
  contentUsesFileFilter: boolean
}

type RestoredSession = {
  tabs: OpenTab[]
  activeId: string | null
  expanded: string[]
  pinnedPaths: string[]
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
  const [activeId, setActiveId] = useState<string | null>(null)
  const [fileQuery, setFileQuery] = useState('')
  const [contentQuery, setContentQuery] = useState('')
  const [activeSearchView, setActiveSearchView] = useState<SearchView>('file')
  const [contentUsesFileFilter, setContentUsesFileFilter] = useState(false)
  const [contentMatches, setContentMatches] = useState<ContentMatch[]>([])
  const [backlinks, setBacklinks] = useState<BacklinkMatch[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(() => new Set())
  const [searchRevealedFolders, setSearchRevealedFolders] = useState<Set<string>>(() => new Set())
  const [jumpOffset, setJumpOffset] = useState<number | null>(null)
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlight | null>(null)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touchedPaths, setTouchedPaths] = useState<Set<string>>(() => new Set())
  const [profile, setProfile] = useState<AppProfile>(DEFAULT_PROFILE)
  const [showPreview, setShowPreview] = useState(false)
  const [typstPreviewFormat, setTypstPreviewFormat] = useState<TypstPreviewFormat>('svg')
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [loadingBacklinks, setLoadingBacklinks] = useState(false)
  const [typstPreview, setTypstPreview] = useState<TypstPreviewState | null>(null)
  const [editorFocusRequest, setEditorFocusRequest] = useState(0)
  const [editorSelectAllRequest, setEditorSelectAllRequest] = useState(0)
  const tabsRef = useRef<OpenTab[]>([])
  const touchedPathsRef = useRef<Set<string>>(new Set())
  const vaultRef = useRef<VaultInfo | null>(null)
  const closingRef = useRef(false)
  const activeTabHintRef = useRef<{ path: string; mode: EditorMode } | null>(null)

  const activeTab = useMemo(
    () => {
      const byId = tabs.find((tab) => tab.id === activeId)
      if (byId) return byId
      const hint = activeTabHintRef.current
      if (!hint) return null
      const activeMode = activeId?.startsWith('track:') ? 'track' : activeId?.startsWith('markdown:') ? 'markdown' : hint.mode
      return tabs.find((tab) => tab.mode === activeMode && samePath(tab.path, hint.path)) ?? null
    },
    [activeId, tabs]
  )
  const activePath = activeTab?.path ?? null
  const dirty = !!activeTab && activeTab.body !== activeTab.savedBody

  useEffect(() => {
    if (activeTab) activeTabHintRef.current = { path: activeTab.path, mode: activeTab.mode }
    if (activeTab && activeTab.id !== activeId) setActiveId(activeTab.id)
  }, [activeId, activeTab])

  useEffect(() => {
    void invoke<AppProfile>('load_profile')
      .then((profile) => setProfile(profile))
      .catch((err) => setError(String(err)))
  }, [])

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    touchedPathsRef.current = touchedPaths
  }, [touchedPaths])

  useEffect(() => {
    vaultRef.current = vault
    currentPathsCaseSensitive = vault?.pathsCaseSensitive ?? true
  }, [vault])

  const refreshTree = useCallback(async () => {
    const next = await invoke<TreeEntry[]>('list_tree')
    setTree(next)
    setExpanded((prev) => {
      if (prev.size > 0) return prev
      return new Set(next.filter((entry) => entry.kind === 'dir').map((entry) => entry.path))
    })
  }, [])

  const loadStoredSession = useCallback(async (root: string): Promise<RestoredSession | null> => {
    const session = readStoredSession(root)
    if (!session) return null

    const storedTabs = session.openTabs ?? session.openPaths?.map((path) => ({ path, mode: 'markdown' as const })) ?? []
    const restoredTabs: OpenTab[] = []
    for (const storedTab of storedTabs) {
      try {
        const note = await invoke<NoteContent>('read_note', { path: storedTab.path })
        const trackState = storedTab.mode === 'track'
          ? await loadOrCreateTrackState(note.path, note.body)
          : undefined
        const id = tabId(note.path, storedTab.mode)
        const existingIndex = restoredTabs.findIndex((tab) => tab.id === id)
        const restoredTab = {
          id,
          path: note.path,
          mode: storedTab.mode,
          body: note.body,
          savedBody: note.body,
          bodyVersion: 0,
          updatedAt: note.updatedAt,
          size: note.size,
          trackState
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
    return {
      tabs: restoredTabs,
      activeId: active?.id ?? null,
      expanded: session.expanded,
      pinnedPaths: session.pinnedPaths ?? [],
      fileQuery: session.fileQuery,
      contentUsesFileFilter: session.contentUsesFileFilter
    }
  }, [])

  const reconcileExternalTab = useCallback(async (path: string) => {
    try {
      const note = await invoke<NoteContent>('read_note', { path })
      const activeTabForPath = tabs.find((tab) => tab.id === activeId && samePath(tab.path, path))
      setTabs((prev) =>
        prev.map((tab) => {
          if (!samePath(tab.path, path)) return tab
          const nextId = tabId(note.path, tab.mode)
          if (tab.savedBody === note.body) {
            return { ...tab, path: note.path, id: nextId, updatedAt: note.updatedAt, size: note.size, externalStatus: undefined }
          }
          return { ...tab, path: note.path, id: nextId, externalStatus: 'changed' }
        })
      )
      if (activeTabForPath) setActiveId(tabId(note.path, activeTabForPath.mode))
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
      setExpanded(new Set(restoredSession?.expanded ?? []))
      setPinnedPaths(new Set(restoredSession?.pinnedPaths ?? []))
      setFileQuery(restoredSession?.fileQuery ?? '')
      setContentUsesFileFilter(restoredSession?.contentUsesFileFilter ?? false)
      setContentMatches([])
      await refreshTree()
      await invoke('watch_vault')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [loadStoredSession, refreshTree, vaultPath])

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
    })

    return () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer)
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [reconcileExternalTab, refreshTree, tabs, vault])

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
      expanded: [...expanded],
      pinnedPaths: [...pinnedPaths],
      fileQuery,
      contentUsesFileFilter
    })
  }, [activeId, activePath, contentUsesFileFilter, expanded, fileQuery, pinnedPaths, tabs, vault])

  const openNote = useCallback(async (path: string, offset: number | null = null) => {
    const existing = tabs.find((tab) => tab.id === tabId(path, 'markdown'))
    if (existing) {
      setActiveId(existing.id)
      setJumpOffset(offset)
      return
    }
    const conflicting = tabs.find((tab) => samePath(tab.path, path) && tab.mode !== 'markdown' && tab.body !== tab.savedBody)
    if (conflicting) {
      const proceed = window.confirm(`${path} is modified in Track mode. Save or close it before opening Markdown mode?`)
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
          size: note.size
        }
      ])
      setActiveId(id)
      setJumpOffset(offset)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [tabs])

  const openTrackNote = useCallback(async (path: string) => {
    const existing = tabs.find((tab) => tab.id === tabId(path, 'track'))
    if (existing) {
      setActiveId(existing.id)
      return
    }
    const markdownTab = tabs.find((tab) => samePath(tab.path, path) && tab.mode === 'markdown')
    if (markdownTab && profile.closeMarkdownBeforeTrack) {
      const closeMarkdown = window.confirm(`${path} is already open in Markdown mode. Close that tab before opening Track mode?`)
      if (closeMarkdown) {
        const dirtyMarkdown = markdownTab.body !== markdownTab.savedBody
        const canClose = !dirtyMarkdown || window.confirm(`Close ${markdownTab.path} with unsaved changes?`)
        if (canClose) {
          setTabs((prev) => {
            const index = prev.findIndex((tab) => tab.id === markdownTab.id)
            const next = prev.filter((tab) => tab.id !== markdownTab.id)
            if (activeId === markdownTab.id) {
              const replacement = next[Math.min(index, next.length - 1)] ?? null
              setActiveId(replacement?.id ?? null)
            }
            return next
          })
        }
      }
    }
    setBusy(true)
    setError(null)
    try {
      const note = await invoke<NoteContent>('read_note', { path })
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
          trackState
        }
      ])
      setActiveId(id)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activeId, profile.closeMarkdownBeforeTrack, tabs])

  const openSearchMatch = useCallback((match: ContentMatch) => {
    const query = contentQuery.trim()
    setSearchHighlight(query ? { path: match.path, query, offset: match.offset } : null)
    void openNote(match.path, match.offset)
  }, [contentQuery, openNote])

  const saveActive = useCallback(async () => {
    if (!activeTab) return
    const requestedBody = activeTab.body
    setBusy(true)
    setError(null)
    try {
      if (activeTab.mode === 'track') {
        const disk = await invoke<NoteContent>('read_note', { path: activeTab.path })
        if (disk.body !== activeTab.savedBody) {
          const candidate = await invoke<NoteContent>('write_track_merge_candidate', {
            path: activeTab.path,
            body: requestedBody
          })
          if (activeTab.trackState) {
            await invoke('save_track_state', { path: activeTab.path, trackState: activeTab.trackState })
          }
          setTouchedPaths((prev) => new Set([...prev, candidate.path]))
          await refreshTree()
          setError(`Disk changed for ${activeTab.path}. Wrote Track output to ${candidate.path} for diff/merge.`)
          return
        }
      }
      const saved = await invoke<NoteContent>('save_note', {
        path: activeTab.path,
        body: requestedBody
      })
      const savedId = tabId(saved.path, activeTab.mode)
      if (activeTab.mode === 'track' && activeTab.trackState) {
        await invoke('save_track_state', { path: activeTab.path, trackState: activeTab.trackState })
      }
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTab.id
            ? {
                ...tab,
                id: savedId,
                path: saved.path,
                body: tab.body === requestedBody ? saved.body : tab.body,
                savedBody: saved.body,
                updatedAt: saved.updatedAt,
                size: saved.size,
                externalStatus: undefined
              }
            : tab
        )
      )
      setActiveId((current) => (current === activeTab.id ? savedId : current))
      setTouchedPaths((prev) => new Set([...prev, saved.path]))
      await refreshTree()
      if (activeTab.mode === 'markdown') setEditorFocusRequest((request) => request + 1)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activeTab, refreshTree])

  const saveTab = useCallback(async (tab: OpenTab) => {
    const requestedBody = tab.body
    if (tab.mode === 'track') {
      const disk = await invoke<NoteContent>('read_note', { path: tab.path })
      if (disk.body !== tab.savedBody) {
        const candidate = await invoke<NoteContent>('write_track_merge_candidate', {
          path: tab.path,
          body: requestedBody
        })
        if (tab.trackState) {
          await invoke('save_track_state', { path: tab.path, trackState: tab.trackState })
        }
        setTouchedPaths((prev) => new Set([...prev, candidate.path]))
        await refreshTree()
        setError(`Disk changed for ${tab.path}. Wrote Track output to ${candidate.path} for diff/merge.`)
        return
      }
    }
    const saved = await invoke<NoteContent>('save_note', {
      path: tab.path,
      body: requestedBody
    })
    const savedId = tabId(saved.path, tab.mode)
    if (tab.mode === 'track' && tab.trackState) {
      await invoke('save_track_state', { path: tab.path, trackState: tab.trackState })
    }
    setTabs((prev) =>
      prev.map((item) =>
        item.id === tab.id
            ? {
              ...item,
              id: savedId,
              path: saved.path,
              body: item.body === requestedBody ? saved.body : item.body,
              savedBody: saved.body,
              updatedAt: saved.updatedAt,
              size: saved.size,
              externalStatus: undefined
            }
          : item
      )
    )
    setActiveId((current) => (current === tab.id ? savedId : current))
    setTouchedPaths((prev) => new Set([...prev, saved.path]))
    await refreshTree()
  }, [refreshTree])

  const checkpointNow = useCallback(async () => {
    if (!vault?.git.isRepo || vault.git.currentBranch !== 'inuse') return
    const paths = [...touchedPaths]
    if (paths.length === 0) return
    const touched = new Set(paths)
    setBusy(true)
    setError(null)
    try {
      for (const tab of tabs) {
        if (tab.mode === 'track' && tab.trackState && hasPath(touched, tab.path)) {
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

  const finalizeBeforeClose = useCallback(async () => {
    const vault = vaultRef.current
    const dirtyTabs = tabsRef.current.filter((tab) => tab.body !== tab.savedBody)
    const paths = new Set(touchedPathsRef.current)

    for (const tab of dirtyTabs) {
      if (tab.mode === 'track') {
        const disk = await invoke<NoteContent>('read_note', { path: tab.path })
        if (disk.body !== tab.savedBody) {
          const candidate = await invoke<NoteContent>('write_track_merge_candidate', {
            path: tab.path,
            body: tab.body
          })
          if (tab.trackState) {
            await invoke('save_track_state', { path: tab.path, trackState: tab.trackState })
          }
          paths.add(candidate.path)
          continue
        }
      }
      const saved = await invoke<NoteContent>('save_note', {
        path: tab.path,
        body: tab.body
      })
      if (tab.mode === 'track' && tab.trackState) {
        await invoke('save_track_state', { path: tab.path, trackState: tab.trackState })
      }
      paths.add(saved.path)
    }

    if (vault?.git.isRepo && vault.git.currentBranch === 'inuse' && paths.size > 0) {
      await invoke<GitInfo>('checkpoint_inuse', { paths: uniquePaths([...paths]) })
    }
  }, [])

  const createNoteAction = useCallback(async () => {
    const path = window.prompt('New note path', fileQuery ? `${fileQuery}.md` : 'untitled.md')
    if (!path) return
    setBusy(true)
    setError(null)
    try {
      const note = await invoke<NoteContent>('create_note', { path, body: '' })
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
          size: note.size
        }
      ])
      setActiveId(tabId(note.path, 'markdown'))
      setJumpOffset(0)
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [fileQuery, refreshTree])

  const createFolderAction = useCallback(async () => {
    const path = window.prompt('New folder path', '')
    if (!path) return
    setBusy(true)
    setError(null)
    try {
      await invoke('create_folder', { path })
      await refreshTree()
      setExpanded((prev) => new Set([...prev, path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')]))
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [refreshTree])

  const renameNoteAction = useCallback(async (oldPath: string) => {
    const nextPath = window.prompt('Rename note path', oldPath)
    if (!nextPath || nextPath === oldPath) return
    setBusy(true)
    setError(null)
    try {
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
                trackState: tab.trackState ? { ...tab.trackState, path: note.path } : undefined
              }
            : tab
        )
      )
      setActiveId((current) => {
        const activeTab = tabs.find((tab) => tab.id === current)
        return activeTab && samePath(activeTab.path, oldPath) ? tabId(note.path, activeTab.mode) : current
      })
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activePath, refreshTree, tabs])

  const deleteNoteAction = useCallback(async (path: string) => {
    const tab = tabs.find((tab) => samePath(tab.path, path))
    if (tab && tab.body !== tab.savedBody) {
      const proceedDirty = window.confirm(`${path} has unsaved changes. Delete it anyway?`)
      if (!proceedDirty) return
    }
    const proceed = window.confirm(`Delete ${path}?`)
    if (!proceed) return
    setBusy(true)
    setError(null)
    try {
      await invoke('delete_note', { path })
      setTabs((prev) => {
        const index = prev.findIndex((tab) => samePath(tab.path, path))
        const next = prev.filter((tab) => !samePath(tab.path, path))
        if (activePath != null && samePath(activePath, path)) {
          const replacement = next[Math.min(index, next.length - 1)] ?? null
          setActiveId(replacement?.id ?? null)
        }
        return next
      })
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activePath, refreshTree, tabs])

  const renameFolderAction = useCallback(async (oldPath: string) => {
    const nextPath = window.prompt('Rename folder path', oldPath)
    if (!nextPath || nextPath === oldPath) return
    setBusy(true)
    setError(null)
    try {
      await invoke('rename_folder', { oldPath, newPath: nextPath })
      setTabs((prev) =>
        prev.map((tab) =>
          isPathInsideFolder(tab.path, oldPath)
            ? {
                ...tab,
                path: `${nextPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/${tab.path.slice(oldPath.length + 1)}`,
                id: tabId(`${nextPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/${tab.path.slice(oldPath.length + 1)}`, tab.mode),
                trackState: tab.trackState
                  ? { ...tab.trackState, path: `${nextPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/${tab.path.slice(oldPath.length + 1)}` }
                  : undefined
              }
            : tab
        )
      )
      if (activePath != null && isPathInsideFolder(activePath, oldPath)) {
        const currentMode = activeTab?.mode ?? 'markdown'
        setActiveId(tabId(`${nextPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/${activePath.slice(oldPath.length + 1)}`, currentMode))
      }
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activePath, activeTab?.mode, refreshTree])

  const deleteFolderAction = useCallback(async (path: string) => {
    const affectedDirty = tabs.some((tab) => isPathInsideFolder(tab.path, path) && tab.body !== tab.savedBody)
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
      setTabs((prev) => prev.filter((tab) => !isPathInsideFolder(tab.path, path)))
      if (activePath != null && isPathInsideFolder(activePath, path)) setActiveId(null)
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activePath, refreshTree, tabs])

  const closeTab = useCallback((id: string) => {
    const closing = tabs.find((tab) => tab.id === id)
    if (closing && closing.body !== closing.savedBody) {
      const proceed = window.confirm(`Close ${closing.path} with unsaved changes?`)
      if (!proceed) return
    }
    setTabs((prev) => {
      const index = prev.findIndex((tab) => tab.id === id)
      const next = prev.filter((tab) => tab.id !== id)
      if (activeId === id) {
        const replacement = next[Math.min(index, next.length - 1)] ?? null
        setActiveId(replacement?.id ?? null)
      }
      return next
    })
  }, [activeId, tabs])

  const updateTabBody = useCallback((id: string, body: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              body,
              bodyVersion: body === tab.body ? tab.bodyVersion : tab.bodyVersion + 1
            }
          : tab
      )
    )
  }, [])

  const updateTrackState = useCallback((id: string, trackState: TrackState) => {
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
    setTouchedPaths((prev) => new Set([...prev, trackState.path]))
  }, [])

  const togglePinnedPath = useCallback((path: string) => {
    setPinnedPaths((prev) => {
      const next = new Set([...prev].filter((pinnedPath) => !samePath(pinnedPath, path)))
      if (next.size === prev.size) next.add(path)
      return next
    })
  }, [])

  useEffect(() => {
    const dirtyTabs = tabs.filter((tab) => tab.body !== tab.savedBody)
    if (dirtyTabs.length === 0) return
    const timer = window.setTimeout(() => {
      for (const tab of dirtyTabs) {
        void saveTab(tab).catch((err) => setError(String(err)))
      }
    }, profile.autosaveDelayMs)
    return () => window.clearTimeout(timer)
  }, [profile.autosaveDelayMs, saveTab, tabs])

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

      if (key === 'a' && activeTab?.mode === 'markdown' && isAppChromeTarget(event.target)) {
        event.preventDefault()
        setEditorFocusRequest((request) => request + 1)
        setEditorSelectAllRequest((request) => request + 1)
        return
      }

      if (key === 'w') {
        if (!activeId) return
        event.preventDefault()
        closeTab(activeId)
        return
      }

      if (key === 'tab' || key === 'pagedown' || key === ']') {
        if (tabs.length <= 1 || !activeId) return
        event.preventDefault()
        selectAdjacentTab(tabs, activeId, event.shiftKey ? -1 : 1, setActiveId)
        return
      }

      if (key === 'pageup' || key === '[') {
        if (tabs.length <= 1 || !activeId) return
        event.preventDefault()
        selectAdjacentTab(tabs, activeId, -1, setActiveId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeId, activeTab?.mode, closeTab, saveActive, tabs])

  useEffect(() => {
    setSearchRevealedFolders(new Set())
  }, [fileQuery])

  const filteredTree = useMemo(
    () => filterTree(tree, fileQuery, searchRevealedFolders, pinnedPaths),
    [fileQuery, pinnedPaths, searchRevealedFolders, tree]
  )
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
    if (!vault || !activePath || !isMarkdownPath(activePath) || !showBacklinks) {
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
  }, [activePath, showBacklinks, tabs, tree, vault])

  const totalFiles = useMemo(() => countFiles(tree), [tree])
  const allFilePaths = useMemo(() => collectFilePaths(tree), [tree])
  const previewHtml = useMemo(
    () => ({
      html: renderMarkdownPreview(activeTab?.body ?? '', allFilePaths),
      version: activeTab?.bodyVersion ?? 0
    }),
    [activeTab?.body, activeTab?.bodyVersion, allFilePaths]
  )
  const activeIsTypst = !!activeTab && isTypstPath(activeTab.path)

  useEffect(() => {
    if (!showPreview || !activeTab || !isTypstPath(activeTab.path)) return
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
    activeTab?.path,
    profile.typstPreviewDebounceMs,
    showPreview,
    typstPreviewFormat
  ])

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <header className="vault-header">
          <div className="vault-title">
            <span className="app-mark">N</span>
            <div className="vault-labels">
              <strong>{vault?.name ?? 'NotesProject'}</strong>
              <span>{vault?.root ?? 'No vault open'}</span>
            </div>
          </div>
          {vault && <GitBadge git={vault.git} />}
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
            <button type="button" onClick={() => void createNoteAction()} disabled={!vault || busy}>
              New note
            </button>
            <button type="button" onClick={() => void createFolderAction()} disabled={!vault || busy}>
              New folder
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
          <div className="note-heading">
            <span className="note-path">{activeTab?.path ?? 'Open a Markdown file'}</span>
            {dirty && <span className="dirty-pill">Modified</span>}
            {activeTab?.externalStatus === 'changed' && <span className="external-pill">Changed on disk</span>}
            {activeTab?.externalStatus === 'deleted' && <span className="external-pill danger">Deleted on disk</span>}
          </div>
          <div className="editor-actions">
            <button
              type="button"
              className={showPreview ? 'secondary-button active' : 'secondary-button'}
              onClick={() => setShowPreview((current) => !current)}
              disabled={!activeTab}
            >
              Preview
            </button>
            {activeIsTypst && showPreview && (
              <button
                type="button"
                className={typstPreviewFormat === 'html' ? 'secondary-button active' : 'secondary-button'}
                onClick={() => setTypstPreviewFormat((current) => current === 'html' ? 'svg' : 'html')}
              >
                HTML
              </button>
            )}
            <button
              type="button"
              className={showBacklinks ? 'secondary-button active' : 'secondary-button'}
              onClick={() => setShowBacklinks((current) => !current)}
              disabled={!activeTab || !isMarkdownPath(activeTab.path)}
            >
              Backlinks
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void saveActive()}
              disabled={!activeTab || !dirty || busy}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void checkpointNow()}
              disabled={!vault?.git.isRepo || vault.git.currentBranch !== 'inuse' || touchedPaths.size === 0 || busy}
            >
              Checkpoint
            </button>
          </div>
        </header>

        <TabStrip
          tabs={tabs}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={closeTab}
        />

        {error && <div className="error-banner">{error}</div>}

        <div className={(showPreview || showBacklinks) && activeTab ? 'workspace split' : 'workspace'}>
          {activeTab?.mode === 'track' && activeTab.trackState ? (
            <TrackChangesEditor
              tabId={activeTab.id}
              path={activeTab.path}
              state={activeTab.trackState}
              onMarkdownChange={updateTabBody}
              onTrackStateChange={updateTrackState}
            />
            ) : (
              <MarkdownEditor
                activePath={activeTab?.id ?? null}
                filePath={activeTab?.path ?? null}
              body={activeTab?.body ?? ''}
              disabled={!activeTab}
              notePaths={allFilePaths}
              searchHighlight={searchHighlight && activePath != null && samePath(searchHighlight.path, activePath) ? searchHighlight : null}
              jumpOffset={jumpOffset}
              focusRequest={editorFocusRequest}
              selectAllRequest={editorSelectAllRequest}
              onJumpHandled={() => setJumpOffset(null)}
              onChange={updateTabBody}
              onOpenWikiLink={(path) => void openNote(path)}
            />
          )}
          {showPreview && activeTab && (
            activeIsTypst ? (
              <TypstPreviewPane preview={typstPreview?.tabId === activeTab.id ? typstPreview : null} />
            ) : (
              <MarkdownPreview
                html={previewHtml.html}
                version={previewHtml.version}
                notePaths={allFilePaths}
                onOpenWikiLink={(path) => void openNote(path)}
              />
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
    </main>
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

const markdownRenderer = MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false
})

function renderMarkdownPreview(markdown: string, notePaths: string[]): string {
  const snippets: string[] = []
  const prepared = preprocessPreviewMarkdown(markdown, notePaths, snippets)
  return markdownRenderer.render(prepared)
    .replace(/<p>@@NZHTML(\d+)@@<\/p>/g, (_match, index: string) => snippets[Number(index)] ?? '')
    .replace(/@@NZHTML(\d+)@@/g, (_match, index: string) => snippets[Number(index)] ?? '')
}

function htmlPlaceholder(html: string, snippets: string[]): string {
  const index = snippets.push(html) - 1
  return `@@NZHTML${index}@@`
}

function pushPreviewBlockHtml(out: string[], html: string, snippets: string[]): void {
  if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('')
  out.push(htmlPlaceholder(html, snippets))
  out.push('')
}

function preprocessPreviewMarkdown(markdown: string, notePaths: string[], snippets: string[]): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inDisplayMath = false
  let displayMath: string[] = []

  for (const line of lines) {
    if (line.trim() === '$$') {
      if (inDisplayMath) {
        pushPreviewBlockHtml(out, renderDisplayMath(displayMath.join('\n')), snippets)
        displayMath = []
        inDisplayMath = false
      } else {
        inDisplayMath = true
      }
      continue
    }

    if (inDisplayMath) {
      displayMath.push(line)
      continue
    }

    const callout = line.match(/^\s*>\s*\[!([A-Za-z][A-Za-z0-9_-]*)\]\s*(.*)$/)
    if (callout) {
      const kind = escapeHtml(callout[1].toLowerCase())
      const title = escapeHtml(callout[1].toUpperCase())
      const rest = callout[2].trim()
      out.push(htmlPlaceholder(`<div class="preview-callout preview-callout-${kind}"><div class="preview-callout-title">${title}</div>`, snippets))
      if (rest) out.push(renderInlinePreviewSyntax(rest, notePaths, snippets))
      continue
    }

    if (/^\s*>\s*$/.test(line) && isCalloutOpenPlaceholder(out[out.length - 1], snippets)) {
      out.push(htmlPlaceholder('</div>', snippets))
      continue
    }

    out.push(renderInlinePreviewSyntax(line, notePaths, snippets))
  }

  if (inDisplayMath) {
    out.push('$$')
    out.push(...displayMath)
  }

  const closed: string[] = []
  let calloutOpen = false
  for (const line of out) {
    if (isCalloutOpenPlaceholder(line, snippets)) {
      if (calloutOpen) closed.push(htmlPlaceholder('</div>', snippets))
      calloutOpen = true
      closed.push(line)
      continue
    }
    if (calloutOpen && line.trim() === '') {
      closed.push(htmlPlaceholder('</div>', snippets))
      calloutOpen = false
      closed.push(line)
      continue
    }
    closed.push(line)
  }
  if (calloutOpen) closed.push(htmlPlaceholder('</div>', snippets))

  return closed.join('\n')
}

function isCalloutOpenPlaceholder(line: string | undefined, snippets: string[]): boolean {
  const match = line?.match(/^@@NZHTML(\d+)@@$/)
  if (!match) return false
  return (snippets[Number(match[1])] ?? '').startsWith('<div class="preview-callout')
}

function renderInlinePreviewSyntax(line: string, notePaths: string[], snippets: string[]): string {
  const withWiki = line.replace(
    /\[\[([^\]\n|#]+)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g,
    (_match, rawLabel: string, rawAnchor: string | undefined, rawAlias: string | undefined) => {
      const label = rawLabel.trim()
      const target = resolveWikiPath(label, notePaths)
      const text = escapeHtml(rawAlias?.trim() || label)
      const anchor = rawAnchor ? escapeHtml(rawAnchor) : ''
      if (!target) return htmlPlaceholder(`<span class="preview-wiki missing">${text}${anchor}</span>`, snippets)
      return htmlPlaceholder(`<a class="preview-wiki" href="notesproject-wiki:${encodeURIComponent(target)}">${text}${anchor}</a>`, snippets)
    }
  )

  return withWiki.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (_match, before: string, source: string) => {
    return `${before}${htmlPlaceholder(renderInlineMath(source.trim()), snippets)}`
  })
}

function renderInlineMath(source: string): string {
  return katex.renderToString(source, {
    displayMode: false,
    throwOnError: false,
    strict: false,
    trust: false
  })
}

function renderDisplayMath(source: string): string {
  return `<div class="preview-math-block">${katex.renderToString(source.trim(), {
    displayMode: true,
    throwOnError: false,
    strict: false,
    trust: false
  })}</div>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function MarkdownPreview({
  html,
  version,
  notePaths,
  onOpenWikiLink
}: {
  html: string
  version: number
  notePaths: string[]
  onOpenWikiLink: (path: string) => void
}): JSX.Element {
  return (
    <article
      className="preview-pane"
      data-body-version={version}
      onClick={(event) => {
        const target = event.target as HTMLElement | null
        const link = target?.closest('a.preview-wiki') as HTMLAnchorElement | null
        if (!link) return
        const href = link.getAttribute('href') ?? ''
        if (!href.startsWith('notesproject-wiki:')) return
        event.preventDefault()
        const path = decodeURIComponent(href.slice('notesproject-wiki:'.length))
        if (notePaths.includes(path)) onOpenWikiLink(path)
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
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

function MarkdownEditor({
  activePath,
  filePath,
  body,
  disabled,
  notePaths,
  searchHighlight,
  jumpOffset,
  focusRequest,
  selectAllRequest,
  onJumpHandled,
  onChange,
  onOpenWikiLink
}: {
  activePath: string | null
  filePath: string | null
  body: string
  disabled: boolean
  notePaths: string[]
  searchHighlight: SearchHighlight | null
  jumpOffset: number | null
  focusRequest: number
  selectAllRequest: number
  onJumpHandled: () => void
  onChange: (path: string, body: string) => void
  onOpenWikiLink: (path: string) => void
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const editableRef = useRef<Compartment | null>(null)
  const pathRef = useRef<string | null>(null)
  const statesRef = useRef<Map<string, EditorState>>(new Map())
  const pendingEditorEchoesRef = useRef<Map<string, string[]>>(new Map())
  const baseExtensionsRef = useRef<Extension[] | null>(null)
  const onChangeRef = useRef(onChange)
  const notePathsRef = useRef(notePaths)
  const searchHighlightRef = useRef<SearchHighlight | null>(searchHighlight)
  const onOpenWikiLinkRef = useRef(onOpenWikiLink)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    notePathsRef.current = notePaths
    viewRef.current?.dispatch({})
  }, [notePaths])

  useEffect(() => {
    searchHighlightRef.current = searchHighlight
    viewRef.current?.dispatch({})
  }, [searchHighlight])

  useEffect(() => {
    onOpenWikiLinkRef.current = onOpenWikiLink
  }, [onOpenWikiLink])

  useEffect(() => {
    const host = hostRef.current
    if (!host || viewRef.current) return

    const editable = new Compartment()
    editableRef.current = editable

    const extensions: Extension[] = [
      history({ minDepth: 10000, newGroupDelay: 500 }),
      editorDocumentVersion,
      drawSelection(),
      lineNumbers(),
      highlightActiveLine(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      noteMarkdownTools(notePathsRef, searchHighlightRef, onOpenWikiLinkRef),
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
        if (!path) return
        const nextBody = update.state.doc.toString()
        rememberEditorEcho(pendingEditorEchoesRef.current, path, nextBody)
        onChangeRef.current(path, nextBody)
      })
    ]
    baseExtensionsRef.current = extensions

    const view = new EditorView({
      parent: host,
      state: createEditorState(body, extensions, filePath)
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
      editableRef.current = null
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
      view.setState(createEditorState('', baseExtensionsRef.current ?? [], filePath))
      applyEditable(view, editableRef.current, false)
      return
    }

    const cached = statesRef.current.get(activePath)
    if (cached) {
      view.setState(cached)
      applyEditable(view, editableRef.current, true)
      if (cached.doc.toString() !== body) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: body },
          annotations: programmaticChange.of(true),
          selection: { anchor: Math.min(view.state.selection.main.head, body.length) }
        })
      }
      return
    }

    view.setState(createEditorState(body, baseExtensionsRef.current ?? [], filePath))
    applyEditable(view, editableRef.current, true)
    view.scrollDOM.scrollTop = 0
  }, [activePath, body, filePath])

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

  return (
    <div className={disabled ? 'editor-host is-empty' : 'editor-host'}>
      <div ref={hostRef} className="cm-host" />
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
  searchHighlightRef: React.MutableRefObject<SearchHighlight | null>,
  onOpenWikiLinkRef: React.MutableRefObject<(path: string) => void>
): Extension {
  const wikiLinkPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildVersionedNoteDecorations(view, notePathsRef.current, searchHighlightRef.current)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.transactions.length > 0) {
          this.decorations = buildVersionedNoteDecorations(update.view, notePathsRef.current, searchHighlightRef.current)
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations
    }
  )

  return [
    wikiLinkPlugin,
    autocompletion({
      override: [wikiCompletionSource(notePathsRef)],
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
      mousedown(event, view) {
        if (!(event.ctrlKey || event.metaKey)) return false
        const target = event.target as HTMLElement | null
        if (!target?.closest('.cm-wiki-link')) return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos == null) return false
        const link = wikiLinkAt(view.state, pos, notePathsRef.current)
        if (!link) return false
        event.preventDefault()
        onOpenWikiLinkRef.current(link.path)
        return true
      }
    }),
    keymap.of([
      {
        key: 'Mod-Enter',
        run(view) {
          const link = wikiLinkAt(view.state, view.state.selection.main.head, notePathsRef.current)
          if (!link) return false
          onOpenWikiLinkRef.current(link.path)
          return true
        }
      }
    ])
  ]
}

function buildVersionedNoteDecorations(
  view: EditorView,
  notePaths: string[],
  searchHighlight: SearchHighlight | null
): DecorationSet {
  const version = view.state.field(editorDocumentVersion)
  const decorations = buildNoteDecorations(view, notePaths, searchHighlight, version)
  return version === view.state.field(editorDocumentVersion) ? decorations : Decoration.none
}

function buildNoteDecorations(
  view: EditorView,
  notePaths: string[],
  searchHighlight: SearchHighlight | null,
  version: number
): DecorationSet {
  const ranges: Array<{ from: number; to: number; decoration: Decoration }> = []
  const doc = view.state.doc
  const blockMathRanges: Array<{ from: number; to: number }> = []

  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to)
    const blockRegex = /\$\$([\s\S]*?)\$\$/g
    let blockMatch: RegExpExecArray | null
    while ((blockMatch = blockRegex.exec(text))) {
      const blockFrom = from + blockMatch.index
      const blockTo = blockFrom + blockMatch[0].length
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
      const text = line.text
      const callout = text.match(/^\s*>\s*\[!([A-Za-z][A-Za-z0-9_-]*)\]/)
      if (callout) {
        ranges.push({ from: line.from, to: line.from, decoration: Decoration.line({
          class: `cm-callout-line cm-callout-${callout[1].toLowerCase()}`
        }) })
      }

      for (const match of text.matchAll(/\[\[([^\]\n|#]+)(?:#[^\]\n|]+)?(?:\|[^\]\n]+)?\]\]/g)) {
        const label = match[1].trim()
        const start = line.from + (match.index ?? 0)
        const end = start + match[0].length
        const target = resolveWikiPath(label, notePaths)
        ranges.push({ from: start, to: end, decoration: Decoration.mark({
          class: target ? 'cm-wiki-link' : 'cm-wiki-link cm-wiki-missing',
          attributes: {
            title: target
              ? `Ctrl+click or Ctrl+Enter to open ${target}`
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
    try {
      element.innerHTML = katex.renderToString(this.source, {
        displayMode: this.displayMode,
        throwOnError: false,
        strict: false,
        trust: false
      })
    } catch {
      element.textContent = this.source
      element.classList.add('error')
    }
    return element
  }

  ignoreEvent(): boolean {
    return true
  }
}

function wikiCompletionSource(notePathsRef: React.MutableRefObject<string[]>) {
  return (context: CompletionContext) => {
    const before = context.matchBefore(/\[\[[^\]\n]*/)
    if (!before) return null
    const query = before.text.slice(2).trim().toLowerCase()
    const notePaths = notePathsRef.current
    if (!context.explicit && before.text === '') return null
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

function wikiLinkAt(
  state: EditorState,
  pos: number,
  notePaths: string[]
): { path: string; from: number; to: number } | null {
  const line = state.doc.lineAt(pos)
  for (const match of line.text.matchAll(/\[\[([^\]\n|#]+)(?:#[^\]\n|]+)?(?:\|[^\]\n]+)?\]\]/g)) {
    const from = line.from + (match.index ?? 0)
    const to = from + match[0].length
    if (pos < from || pos > to) continue
    const path = resolveWikiPath(match[1].trim(), notePaths)
    return path ? { path, from, to } : null
  }
  return null
}

function resolveWikiPath(label: string, notePaths: string[]): string | null {
  const normalized = normalizeWikiLabel(label)
  if (!normalized) return null
  const exact = notePaths.find((path) => normalizeWikiLabel(path) === normalized)
  if (exact) return exact
  const withExtension = notePaths.find((path) => normalizeWikiLabel(stripMarkdownExtension(path)) === normalized)
  if (withExtension) return withExtension
  return notePaths.find((path) => normalizeWikiLabel(wikiLabel(path)) === normalized) ?? null
}

function wikiSearchText(path: string): string {
  return `${path} ${wikiLabel(path)} ${stripMarkdownExtension(path)}`.toLowerCase()
}

function wikiLabel(path: string): string {
  return stripMarkdownExtension(basename(path))
}

function stripMarkdownExtension(path: string): string {
  return path.replace(/\.md$/i, '')
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

function GitBadge({ git }: { git: GitInfo }): JSX.Element {
  if (!git.isRepo) {
    return <div className="git-badge muted">{git.message}</div>
  }
  const branch = git.currentBranch ?? 'detached'
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
    </div>
  )
}

function createEditorState(doc: string, extensions: Extension[], path: string | null): EditorState {
  return EditorState.create({
    doc,
    extensions: [editorLanguage(path), ...extensions]
  })
}

function editorLanguage(path: string | null): Extension {
  return isTypstPath(path) ? typst() : markdown()
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
  onSelect,
  onClose
}: {
  tabs: OpenTab[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
}): JSX.Element | null {
  if (tabs.length === 0) return null
  return (
    <nav className="tab-strip" aria-label="Open files">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        const dirty = tab.body !== tab.savedBody
        return (
          <button
            key={tab.id}
            type="button"
            className={active ? 'tab active' : 'tab'}
            onClick={() => onSelect(tab.id)}
            title={tab.mode === 'track' ? `${tab.path} - Track` : tab.path}
          >
            <span className="tab-title">{basename(tab.path)}{tab.mode === 'track' ? ' - Track' : ''}</span>
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
      if (revealedFolders.has(entry.path)) {
        return [entry]
      }
      const children = filterTree(entry.children, query, revealedFolders, pinnedPaths)
      const visibleTopLevel = new Set(children.map((child) => child.path))
      const hiddenChildren = entry.children.filter((child) => !visibleTopLevel.has(child.path))
      return [{ ...entry, children, hiddenChildren }]
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

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path)
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
          typeof tab?.path === 'string' && (tab.mode === 'markdown' || tab.mode === 'track')
        )
      : []
    return {
      openTabs,
      openPaths: Array.isArray(parsed.openPaths)
        ? parsed.openPaths.filter((path): path is string => typeof path === 'string')
        : [],
      activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
      activePath: typeof parsed.activePath === 'string' ? parsed.activePath : null,
      expanded: Array.isArray(parsed.expanded)
        ? parsed.expanded.filter((path): path is string => typeof path === 'string')
        : [],
      pinnedPaths: Array.isArray(parsed.pinnedPaths)
        ? parsed.pinnedPaths.filter((path): path is string => typeof path === 'string')
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

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
