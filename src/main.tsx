import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  Annotation,
  Compartment,
  RangeSetBuilder,
  EditorState,
  type Extension
} from '@codemirror/state'
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
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
  indentWithTab
} from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import {
  defaultHighlightStyle,
  syntaxHighlighting
} from '@codemirror/language'
import { searchKeymap } from '@codemirror/search'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import MarkdownIt from 'markdown-it'
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

type OpenTab = {
  path: string
  body: string
  savedBody: string
  updatedAt: number
  size: number
  externalStatus?: 'changed' | 'deleted'
}

type VaultChangeEvent = {
  paths: string[]
}

const programmaticChange = Annotation.define<boolean>()
const LAST_VAULT_KEY = 'notesproject:last-vault'
const SESSION_KEY_PREFIX = 'notesproject:session:'

type AppProfile = {
  autosaveDelayMs: number
  checkpointIntervalMs: number
}

const DEFAULT_PROFILE: AppProfile = {
  autosaveDelayMs: 5000,
  checkpointIntervalMs: 3 * 60 * 1000
}

type StoredSession = {
  openPaths: string[]
  activePath: string | null
  expanded: string[]
  fileQuery: string
  contentUsesFileFilter: boolean
}

type RestoredSession = {
  tabs: OpenTab[]
  activePath: string | null
  expanded: string[]
  fileQuery: string
  contentUsesFileFilter: boolean
}

function App(): JSX.Element {
  const [vaultPath, setVaultPath] = useState(() => localStorage.getItem(LAST_VAULT_KEY) ?? '')
  const [vault, setVault] = useState<VaultInfo | null>(null)
  const [tree, setTree] = useState<TreeEntry[]>([])
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [fileQuery, setFileQuery] = useState('')
  const [contentQuery, setContentQuery] = useState('')
  const [contentUsesFileFilter, setContentUsesFileFilter] = useState(false)
  const [contentMatches, setContentMatches] = useState<ContentMatch[]>([])
  const [backlinks, setBacklinks] = useState<BacklinkMatch[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [searchRevealedFolders, setSearchRevealedFolders] = useState<Set<string>>(() => new Set())
  const [jumpOffset, setJumpOffset] = useState<number | null>(null)
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlight | null>(null)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touchedPaths, setTouchedPaths] = useState<Set<string>>(() => new Set())
  const [profile, setProfile] = useState<AppProfile>(DEFAULT_PROFILE)
  const [showPreview, setShowPreview] = useState(false)
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [loadingBacklinks, setLoadingBacklinks] = useState(false)
  const tabsRef = useRef<OpenTab[]>([])
  const touchedPathsRef = useRef<Set<string>>(new Set())
  const vaultRef = useRef<VaultInfo | null>(null)
  const closingRef = useRef(false)

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.path === activePath) ?? null,
    [activePath, tabs]
  )
  const dirty = !!activeTab && activeTab.body !== activeTab.savedBody

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

    const restoredTabs: OpenTab[] = []
    for (const path of session.openPaths) {
      try {
        const note = await invoke<NoteContent>('read_note', { path })
        restoredTabs.push({
          path: note.path,
          body: note.body,
          savedBody: note.body,
          updatedAt: note.updatedAt,
          size: note.size
        })
      } catch {
        // The file may have been moved or deleted outside the app.
      }
    }
    const active = restoredTabs.find((tab) => tab.path === session.activePath) ?? restoredTabs[0] ?? null
    return {
      tabs: restoredTabs,
      activePath: active?.path ?? null,
      expanded: session.expanded,
      fileQuery: session.fileQuery,
      contentUsesFileFilter: session.contentUsesFileFilter
    }
  }, [])

  const reconcileExternalTab = useCallback(async (path: string) => {
    try {
      const note = await invoke<NoteContent>('read_note', { path })
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.path !== path) return tab
          if (tab.savedBody === note.body) {
            return { ...tab, updatedAt: note.updatedAt, size: note.size, externalStatus: undefined }
          }
          return { ...tab, externalStatus: 'changed' }
        })
      )
    } catch {
      setTabs((prev) =>
        prev.map((tab) => (tab.path === path ? { ...tab, externalStatus: 'deleted' } : tab))
      )
    }
  }, [])

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
      const restoredSession = await loadStoredSession(openedVault.root)
      setVault(openedVault)
      setTabs(restoredSession?.tabs ?? [])
      setActivePath(restoredSession?.activePath ?? null)
      setExpanded(new Set(restoredSession?.expanded ?? []))
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
      const changedPaths = new Set(event.payload.paths)
      if (refreshTimer != null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        void refreshTree()
        refreshTimer = null
      }, 180)

      for (const tab of tabs) {
        if (changedPaths.has(tab.path)) {
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
    if (!vault) return
    writeStoredSession(vault.root, {
      openPaths: tabs.map((tab) => tab.path),
      activePath,
      expanded: [...expanded],
      fileQuery,
      contentUsesFileFilter
    })
  }, [activePath, contentUsesFileFilter, expanded, fileQuery, tabs, vault])

  const openNote = useCallback(async (path: string, offset: number | null = null) => {
    const existing = tabs.find((tab) => tab.path === path)
    if (existing) {
      setActivePath(path)
      setJumpOffset(offset)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const note = await invoke<NoteContent>('read_note', { path })
      setTabs((prev) => [
        ...prev,
        {
          path: note.path,
          body: note.body,
          savedBody: note.body,
          updatedAt: note.updatedAt,
          size: note.size
        }
      ])
      setActivePath(note.path)
      setJumpOffset(offset)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [tabs])

  const openSearchMatch = useCallback((match: ContentMatch) => {
    const query = contentQuery.trim()
    setSearchHighlight(query ? { path: match.path, query, offset: match.offset } : null)
    void openNote(match.path, match.offset)
  }, [contentQuery, openNote])

  const saveActive = useCallback(async () => {
    if (!activeTab) return
    setBusy(true)
    setError(null)
    try {
      const saved = await invoke<NoteContent>('save_note', {
        path: activeTab.path,
        body: activeTab.body
      })
      setTabs((prev) =>
        prev.map((tab) =>
          tab.path === saved.path
            ? {
                path: saved.path,
                body: saved.body,
                savedBody: saved.body,
                updatedAt: saved.updatedAt,
                size: saved.size,
                externalStatus: undefined
              }
            : tab
        )
      )
      setTouchedPaths((prev) => new Set([...prev, saved.path]))
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activeTab, refreshTree])

  const saveTab = useCallback(async (tab: OpenTab) => {
    const saved = await invoke<NoteContent>('save_note', {
      path: tab.path,
      body: tab.body
    })
    setTabs((prev) =>
      prev.map((item) =>
        item.path === saved.path
          ? {
              ...item,
              body: saved.body,
              savedBody: saved.body,
              updatedAt: saved.updatedAt,
              size: saved.size,
              externalStatus: undefined
            }
          : item
      )
    )
    setTouchedPaths((prev) => new Set([...prev, saved.path]))
    await refreshTree()
  }, [refreshTree])

  const checkpointNow = useCallback(async () => {
    if (!vault?.git.isRepo || vault.git.currentBranch !== 'inuse') return
    const paths = [...touchedPaths]
    if (paths.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const git = await invoke<GitInfo>('checkpoint_inuse', { paths })
      setVault((prev) => (prev ? { ...prev, git } : prev))
      setTouchedPaths(new Set())
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [touchedPaths, vault])

  const finalizeBeforeClose = useCallback(async () => {
    const vault = vaultRef.current
    const dirtyTabs = tabsRef.current.filter((tab) => tab.body !== tab.savedBody)
    const paths = new Set(touchedPathsRef.current)

    for (const tab of dirtyTabs) {
      const saved = await invoke<NoteContent>('save_note', {
        path: tab.path,
        body: tab.body
      })
      paths.add(saved.path)
    }

    if (vault?.git.isRepo && vault.git.currentBranch === 'inuse' && paths.size > 0) {
      await invoke<GitInfo>('checkpoint_inuse', { paths: [...paths] })
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
        ...prev.filter((tab) => tab.path !== note.path),
        {
          path: note.path,
          body: note.body,
          savedBody: note.body,
          updatedAt: note.updatedAt,
          size: note.size
        }
      ])
      setActivePath(note.path)
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
          tab.path === oldPath
            ? {
                path: note.path,
                body: note.body,
                savedBody: note.body,
                updatedAt: note.updatedAt,
                size: note.size
              }
            : tab
        )
      )
      if (activePath === oldPath) setActivePath(note.path)
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activePath, refreshTree])

  const deleteNoteAction = useCallback(async (path: string) => {
    const tab = tabs.find((tab) => tab.path === path)
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
        const index = prev.findIndex((tab) => tab.path === path)
        const next = prev.filter((tab) => tab.path !== path)
        if (activePath === path) {
          const replacement = next[Math.min(index, next.length - 1)] ?? null
          setActivePath(replacement?.path ?? null)
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
          tab.path.startsWith(`${oldPath}/`)
            ? { ...tab, path: `${nextPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/${tab.path.slice(oldPath.length + 1)}` }
            : tab
        )
      )
      if (activePath?.startsWith(`${oldPath}/`)) {
        setActivePath(`${nextPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/${activePath.slice(oldPath.length + 1)}`)
      }
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activePath, refreshTree])

  const deleteFolderAction = useCallback(async (path: string) => {
    const affectedDirty = tabs.some((tab) => tab.path.startsWith(`${path}/`) && tab.body !== tab.savedBody)
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
      setTabs((prev) => prev.filter((tab) => !tab.path.startsWith(`${path}/`)))
      if (activePath?.startsWith(`${path}/`)) setActivePath(null)
      await refreshTree()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }, [activePath, refreshTree, tabs])

  const closeTab = useCallback((path: string) => {
    const closing = tabs.find((tab) => tab.path === path)
    if (closing && closing.body !== closing.savedBody) {
      const proceed = window.confirm(`Close ${path} with unsaved changes?`)
      if (!proceed) return
    }
    setTabs((prev) => {
      const index = prev.findIndex((tab) => tab.path === path)
      const next = prev.filter((tab) => tab.path !== path)
      if (activePath === path) {
        const replacement = next[Math.min(index, next.length - 1)] ?? null
        setActivePath(replacement?.path ?? null)
      }
      return next
    })
  }, [activePath, tabs])

  const updateTabBody = useCallback((path: string, body: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.path === path
          ? {
              ...tab,
              body
            }
          : tab
      )
    )
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
    const unlistenPromise = appWindow.onCloseRequested(async (event) => {
      if (closingRef.current) return
      event.preventDefault()
      closingRef.current = true
      setBusy(true)
      setError(null)
      try {
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

      if (key === 'w') {
        if (!activePath) return
        event.preventDefault()
        closeTab(activePath)
        return
      }

      if (key === 'tab' || key === 'pagedown' || key === ']') {
        if (tabs.length <= 1 || !activePath) return
        event.preventDefault()
        selectAdjacentTab(tabs, activePath, event.shiftKey ? -1 : 1, setActivePath)
        return
      }

      if (key === 'pageup' || key === '[') {
        if (tabs.length <= 1 || !activePath) return
        event.preventDefault()
        selectAdjacentTab(tabs, activePath, -1, setActivePath)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activePath, closeTab, saveActive, tabs])

  useEffect(() => {
    setSearchRevealedFolders(new Set())
  }, [fileQuery])

  const filteredTree = useMemo(
    () => filterTree(tree, fileQuery, searchRevealedFolders),
    [fileQuery, searchRevealedFolders, tree]
  )
  const filteredFilePaths = useMemo(() => collectFilePaths(filteredTree), [filteredTree])
  const visibleExpanded = useMemo(() => {
    if (!fileQuery.trim()) return expanded
    return new Set([...expanded, ...collectDirPaths(filteredTree)])
  }, [expanded, fileQuery, filteredTree])

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
    if (!vault || !activePath || !showBacklinks) {
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
    () => renderMarkdownPreview(activeTab?.body ?? '', allFilePaths),
    [activeTab?.body, allFilePaths]
  )

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
              onChange={(event) => setFileQuery(event.target.value)}
              placeholder="Filter paths"
              spellCheck={false}
            />
          </label>
          <label>
            <span>Content</span>
            <input
              value={contentQuery}
              onChange={(event) => setContentQuery(event.target.value)}
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
          {contentQuery.trim() ? (
            <SearchResults
              matches={contentMatches}
              searching={searching}
              activePath={activePath}
              onOpen={openSearchMatch}
            />
          ) : (
            <FileTree
              entries={filteredTree}
              activePath={activePath}
              expanded={visibleExpanded}
              onToggle={(path) => {
                setExpanded((prev) => {
                  const next = new Set(prev)
                  if (next.has(path)) next.delete(path)
                  else next.add(path)
                  return next
                })
              }}
              onOpen={(path) => void openNote(path)}
              onRenameFile={(path) => void renameNoteAction(path)}
              onDeleteFile={(path) => void deleteNoteAction(path)}
              onRenameFolder={(path) => void renameFolderAction(path)}
              onDeleteFolder={(path) => void deleteFolderAction(path)}
              onRevealHidden={(path) => {
                setSearchRevealedFolders((prev) => new Set([...prev, path]))
              }}
            />
          )}
        </section>

        <footer className="sidebar-footer">
          <span>{totalFiles} Markdown files</span>
          {busy && <span>Working...</span>}
        </footer>
      </aside>

      <section className="editor-pane">
        <header className="editor-header">
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
            <button
              type="button"
              className={showBacklinks ? 'secondary-button active' : 'secondary-button'}
              onClick={() => setShowBacklinks((current) => !current)}
              disabled={!activeTab}
            >
              Backlinks
            </button>
            <button type="button" onClick={() => void saveActive()} disabled={!activeTab || !dirty || busy}>
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
          activePath={activePath}
          onSelect={setActivePath}
          onClose={closeTab}
        />

        {error && <div className="error-banner">{error}</div>}

        <div className={(showPreview || showBacklinks) && activeTab ? 'workspace split' : 'workspace'}>
          <MarkdownEditor
            activePath={activePath}
            body={activeTab?.body ?? ''}
            disabled={!activeTab}
            notePaths={allFilePaths}
            searchHighlight={searchHighlight?.path === activePath ? searchHighlight : null}
            jumpOffset={jumpOffset}
            onJumpHandled={() => setJumpOffset(null)}
            onChange={updateTabBody}
            onOpenWikiLink={(path) => void openNote(path)}
          />
          {showPreview && activeTab && (
            <MarkdownPreview
              html={previewHtml}
              notePaths={allFilePaths}
              onOpenWikiLink={(path) => void openNote(path)}
            />
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

function preprocessPreviewMarkdown(markdown: string, notePaths: string[], snippets: string[]): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inDisplayMath = false
  let displayMath: string[] = []

  for (const line of lines) {
    if (line.trim() === '$$') {
      if (inDisplayMath) {
        out.push(htmlPlaceholder(renderDisplayMath(displayMath.join('\n')), snippets))
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
  notePaths,
  onOpenWikiLink
}: {
  html: string
  notePaths: string[]
  onOpenWikiLink: (path: string) => void
}): JSX.Element {
  return (
    <article
      className="preview-pane"
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

function MarkdownEditor({
  activePath,
  body,
  disabled,
  notePaths,
  searchHighlight,
  jumpOffset,
  onJumpHandled,
  onChange,
  onOpenWikiLink
}: {
  activePath: string | null
  body: string
  disabled: boolean
  notePaths: string[]
  searchHighlight: SearchHighlight | null
  jumpOffset: number | null
  onJumpHandled: () => void
  onChange: (path: string, body: string) => void
  onOpenWikiLink: (path: string) => void
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const editableRef = useRef<Compartment | null>(null)
  const pathRef = useRef<string | null>(null)
  const statesRef = useRef<Map<string, EditorState>>(new Map())
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
      drawSelection(),
      lineNumbers(),
      highlightActiveLine(),
      markdown(),
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
          backgroundColor: '#b9d7f2'
        },
        '.cm-content ::selection': {
          backgroundColor: '#b9d7f2'
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
        onChangeRef.current(path, update.state.doc.toString())
      })
    ]
    baseExtensionsRef.current = extensions

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: body,
        extensions
      })
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
    if (previousPath && previousPath !== activePath) {
      statesRef.current.set(previousPath, view.state)
    }
    if (previousPath === activePath) {
      const current = view.state.doc.toString()
      if (current === body) return
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: body },
        annotations: programmaticChange.of(true),
        selection: { anchor: 0 }
      })
      view.scrollDOM.scrollTop = 0
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

    view.setState(createEditorState(body, baseExtensionsRef.current ?? []))
    applyEditable(view, editableRef.current, true)
    view.scrollDOM.scrollTop = 0
  }, [activePath, body])

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
        this.decorations = buildNoteDecorations(view, notePathsRef.current, searchHighlightRef.current)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.transactions.length > 0) {
          this.decorations = buildNoteDecorations(update.view, notePathsRef.current, searchHighlightRef.current)
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

function buildNoteDecorations(
  view: EditorView,
  notePaths: string[],
  searchHighlight: SearchHighlight | null
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
        widget: new MathPreviewWidget(blockMatch[1].trim(), true),
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
            widget: new MathPreviewWidget(math.source, false),
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
    private readonly displayMode: boolean
  ) {
    super()
  }

  eq(other: MathPreviewWidget): boolean {
    return this.source === other.source && this.displayMode === other.displayMode
  }

  toDOM(): HTMLElement {
    const element = document.createElement(this.displayMode ? 'div' : 'span')
    element.className = this.displayMode ? 'cm-math-preview block' : 'cm-math-preview inline'
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
    if (!context.explicit && before.text === '') return null
    const options = notePathsRef.current
      .filter((path) => wikiSearchText(path).includes(query))
      .slice(0, 40)
      .map((path) => ({
        label: wikiLabel(path),
        detail: path,
        type: 'file',
        apply: `[[${wikiLabel(path)}]]`
      }))
    return {
      from: before.from,
      options,
      validFor: /^\[\[[^\]\n]*$/
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

function createEditorState(doc: string, extensions: Extension[]): EditorState {
  return EditorState.create({
    doc,
    extensions
  })
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

function TabStrip({
  tabs,
  activePath,
  onSelect,
  onClose
}: {
  tabs: OpenTab[]
  activePath: string | null
  onSelect: (path: string) => void
  onClose: (path: string) => void
}): JSX.Element | null {
  if (tabs.length === 0) return null
  return (
    <nav className="tab-strip" aria-label="Open files">
      {tabs.map((tab) => {
        const active = tab.path === activePath
        const dirty = tab.body !== tab.savedBody
        return (
          <button
            key={tab.path}
            type="button"
            className={active ? 'tab active' : 'tab'}
            onClick={() => onSelect(tab.path)}
            title={tab.path}
          >
            <span className="tab-title">{basename(tab.path)}</span>
            {dirty && <span className="tab-dirty" aria-label="Modified" />}
            {tab.externalStatus && <span className="tab-external" aria-label={tab.externalStatus} />}
            <span
              role="button"
              tabIndex={0}
              className="tab-close"
              aria-label={`Close ${tab.path}`}
              onClick={(event) => {
                event.stopPropagation()
                onClose(tab.path)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                onClose(tab.path)
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
  onToggle,
  onOpen,
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
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  onRenameFile: (path: string) => void
  onDeleteFile: (path: string) => void
  onRenameFolder: (path: string) => void
  onDeleteFolder: (path: string) => void
  onRevealHidden: (path: string) => void
  depth?: number
}): JSX.Element {
  if (entries.length === 0) {
    return <div className="empty-list">No Markdown files</div>
  }

  return (
    <div className="tree-list">
      {entries.map((entry) => {
        const isDir = entry.kind === 'dir'
        const isExpanded = expanded.has(entry.path)
        const active = activePath === entry.path
        return (
          <div key={entry.path}>
            <button
              type="button"
              className={active ? 'tree-row active' : 'tree-row'}
              style={{ paddingLeft: 10 + depth * 16 }}
              onClick={() => {
                if (isDir) onToggle(entry.path)
                else onOpen(entry.path)
              }}
              title={entry.path}
            >
              <span className="tree-chevron">{isDir ? (isExpanded ? 'v' : '>') : ''}</span>
              <span className="tree-icon">{isDir ? 'folder' : 'md'}</span>
              <span className="tree-name">{entry.name}</span>
              <span className="tree-actions">
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
                  onToggle={onToggle}
                  onOpen={onOpen}
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
          className={activePath === match.path ? 'result-row active' : 'result-row'}
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
  revealedFolders: Set<string>
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
      const children = filterTree(entry.children, query, revealedFolders)
      const visibleTopLevel = new Set(children.map((child) => child.path))
      const hiddenChildren = entry.children.filter((child) => !visibleTopLevel.has(child.path))
      return [{ ...entry, children, hiddenChildren }]
    }

    const children = filterTree(entry.children, query, revealedFolders)
    if (children.length > 0) {
      return [{ ...entry, children }]
    }
    return []
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

function selectAdjacentTab(
  tabs: OpenTab[],
  activePath: string,
  direction: -1 | 1,
  select: (path: string) => void
): void {
  const index = tabs.findIndex((tab) => tab.path === activePath)
  if (index < 0) return
  const nextIndex = (index + direction + tabs.length) % tabs.length
  select(tabs[nextIndex].path)
}

function sessionKey(root: string): string {
  return `${SESSION_KEY_PREFIX}${root}`
}

function readStoredSession(root: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(root))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    return {
      openPaths: Array.isArray(parsed.openPaths)
        ? parsed.openPaths.filter((path): path is string => typeof path === 'string')
        : [],
      activePath: typeof parsed.activePath === 'string' ? parsed.activePath : null,
      expanded: Array.isArray(parsed.expanded)
        ? parsed.expanded.filter((path): path is string => typeof path === 'string')
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
