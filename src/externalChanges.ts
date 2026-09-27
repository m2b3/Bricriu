export type ExternalNote = {
  path: string
  body: string
  updatedAt: number
  size: number
}

type ExternalTab = {
  id: string
  path: string
  savedBody: string
  outOfVault?: boolean
}

export type ExternalSnapshot<T> = { tab: T; body: string }

type Options<T extends ExternalTab> = {
  getTabs: () => T[]
  getBody: (tab: T) => string
  pathKey: (path: string) => string
  read: (path: string) => Promise<ExternalNote>
  confirm: (message: string) => Promise<boolean>
  // Commit before returning so queued events observe the new saved baseline.
  // Return false if an intervening edit or tab change prevented the update.
  update: (snapshots: ExternalSnapshot<T>[], note: ExternalNote, reload: boolean) => boolean
  mark: (tabs: T[], status: 'changed' | 'unavailable') => void
  error: (message: string) => void
}

// Serialize dialogs, coalesce notifications, and keep each decision tied to the
// tabs and editor contents that were present when the question was asked.
export function createExternalChangeMonitor<T extends ExternalTab>(options: Options<T>) {
  const pending = new Map<string, { path: string; force: boolean }>()
  const acknowledged = new Map<string, string>()
  const unavailable = new Set<string>()
  const conflicts = new Set<string>()
  let disposed = false
  let running: Promise<void> | undefined
  let promptingKey: string | undefined
  const matchingTabs = (key: string) => disposed ? [] : options.getTabs().filter(
    (tab) => tab.outOfVault && options.pathKey(tab.path) === key
  )
  const snapshot = (tabs: T[]) => tabs.map((tab) => ({ tab, body: options.getBody(tab) }))

  function apply(key: string, snapshots: ExternalSnapshot<T>[], note: ExternalNote, reload: boolean) {
    // React may run autosave effects during this commit. Clear the block first
    // so an unchanged disk baseline can resume autosaving local edits.
    const wasBlocked = conflicts.delete(key)
    if (options.update(snapshots, note, reload)) return true
    if (wasBlocked) conflicts.add(key)
    return false
  }

  async function read(path: string, key: string) {
    try {
      const note = await options.read(path)
      unavailable.delete(key)
      return note
    } catch (err) {
      const tabs = matchingTabs(key)
      if (tabs.length && !unavailable.has(key)) {
        unavailable.add(key)
        // Sync tools can briefly lock, remove, or replace a file. Keep the
        // user's decision for its contents through that temporary failure.
        options.mark(tabs, 'unavailable')
        options.error(`Could not reload ${path}. Your text has been kept. ${String(err)}`)
      }
      return null
    }
  }

  async function process() {
    while (!disposed && pending.size) {
      const [key, { path, force }] = pending.entries().next().value!
      pending.delete(key)
      if (!matchingTabs(key).length) continue
      const note = await read(path, key)
      const tabs = matchingTabs(key)
      if (!note || !tabs.length) continue
      if (tabs.every((tab) => tab.savedBody === note.body)) {
        if (apply(key, snapshot(tabs), note, false)) {
          acknowledged.delete(key)
        }
        continue
      }
      // An app save may reach disk before its IPC response updates React.
      // If disk already equals every editor buffer, no text needs replacing.
      if (tabs.every((tab) => options.getBody(tab) === note.body)) {
        if (apply(key, snapshot(tabs), note, true)) {
          acknowledged.delete(key)
        }
        continue
      }
      conflicts.add(key)
      options.mark(tabs, 'changed')
      if (!force && acknowledged.get(key) === note.body) continue

      const before = snapshot(matchingTabs(key))
      if (!before.length) continue
      const dirty = before.some(({ tab, body }) => body !== tab.savedBody)
      const changedAgain = acknowledged.has(key) && acknowledged.get(key) !== note.body
      const message = `${path}\n\n${changedAgain ? 'The file changed again since your last choice.' : 'This file changed outside Bricriu.'}\n\nUnsaved edits when Bricriu detected this change: ${dirty ? 'YES' : 'NO'}.\n${dirty
        ? 'Reloading will discard unsaved changes in this file’s open tabs.'
        : 'Reloading will update the open tabs. There are no unsaved edits to discard.'}\n\nKeep editing preserves your text. Autosave is paused for this file while the disk change is unresolved. Use Save As to keep a separate copy.`
      promptingKey = key
      try {
        const reload = await options.confirm(message)
        if (disposed) return
        if (!reload) {
          acknowledged.set(key, note.body)
          continue
        }

        // Read again after the dialog: another program may have saved once more.
        const latest = await read(path, key)
        const current = matchingTabs(key)
        if (!latest || !current.length) continue
        if (current.length !== before.length || before.some(({ tab, body }) => {
          const now = current.find((candidate) => candidate.id === tab.id)
          return !now || now.savedBody !== tab.savedBody || options.getBody(now) !== body
        })) {
          // A save or edit invalidates consent to discard the old editor text.
          pending.set(key, { path, force: false })
          continue
        }
        if (apply(key, snapshot(current), latest, true)) {
          acknowledged.set(key, latest.body)
        } else {
          pending.set(key, { path, force: false })
        }
      } catch (err) {
        if (!disposed) options.error(`Could not show reload confirmation: ${String(err)}`)
      } finally {
        promptingKey = undefined
      }
    }
  }

  function check(paths: string[], { force = false } = {}): Promise<void> {
    if (disposed) return Promise.resolve()
    for (const key of acknowledged.keys()) {
      if (!matchingTabs(key).length) acknowledged.delete(key)
    }
    for (const key of unavailable) {
      if (!matchingTabs(key).length) unavailable.delete(key)
    }
    for (const key of conflicts) {
      if (!matchingTabs(key).length) conflicts.delete(key)
    }
    for (const path of paths) {
      const key = options.pathKey(path)
      pending.set(key, { path, force: (force && promptingKey !== key) || pending.get(key)?.force === true })
    }
    running ??= Promise.resolve().then(process).finally(() => {
      running = undefined
      if (!disposed && pending.size) return check([])
    })
    return running
  }

  return {
    check,
    isBlocked: (path: string) => conflicts.has(options.pathKey(path)) || unavailable.has(options.pathKey(path)),
    dispose() {
      disposed = true
      pending.clear()
      acknowledged.clear()
      unavailable.clear()
      conflicts.clear()
    }
  }
}
