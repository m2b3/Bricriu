import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'
import { createExternalChangeMonitor } from '../src/externalChanges.ts'

// Exercise the actual watcher effect and save callbacks, without a WebView.
const source = ts.createSourceFile('main.tsx',
  readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function findNode(predicate, node = source) {
  if (predicate(node)) return node
  return ts.forEachChild(node, (child) => findNode(predicate, child))
}

function evaluate(node, context) {
  const { outputText } = ts.transpileModule(`(${node.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }
  })
  return runInContext(outputText, context)
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function harness() {
  const tab = { id: 'outside:markdown', path: 'C:/outside/note.md', mode: 'markdown', outOfVault: true,
    body: 'local edits', savedBody: 'saved', bodyVersion: 0 }
  const state = { tabs: [tab], disk: 'external edits', prompts: [], saves: [], writes: [], timers: new Map(),
    renders: [], unlistened: 0 }
  const timerApi = {
    setTimeout(callback) { const key = Symbol(); state.timers.set(key, callback); return key },
    clearTimeout(key) { state.timers.delete(key) }
  }
  const context = createContext({
    busy: false, vault: { root: 'C:/vault' }, tabs: state.tabs, activeTab: tab, profile: { autosaveDelayMs: 5000 },
    tabsRef: { current: state.tabs }, latestBodiesRef: { current: new Map([[tab.id, tab.body]]) },
    externalMonitorRef: { current: null }, externalWatchSyncRef: { current: Promise.resolve() },
    createExternalChangeMonitor(options) { state.options = options; return createExternalChangeMonitor(options) },
    pathKey: (path) => path.toLowerCase(), isMarkdownPath: (path) => path.endsWith('.md'),
    latestTabBody: (tab) => context.latestBodiesRef.current.get(tab.id) ?? tab.body,
    isTabDirty: (tab) => context.latestTabBody(tab) !== tab.savedBody,
    uniqueSaveTargets: (tabs) => tabs,
    flushSync: (callback) => callback(),
    setTabs(update) {
      // React StrictMode can invoke an updater twice with the same previous state.
      const previous = state.tabs
      const first = update(previous)
      const second = update(previous)
      assert.deepEqual(first, second)
      state.tabs = second
      context.tabs = second
      state.renders.push({ body: second[0].body, dirty: context.isTabDirty(second[0]),
        blocked: context.externalMonitorRef.current?.isBlocked(tab.path) })
      context.tabsRef.current = second
    },
    setError(value) { state.error = value }, setBusy(value) { state.busy = value },
    async refreshTree() { throw new Error('Outside files do not refresh the vault tree') },
    confirmDialog(message, options) {
      return new Promise((resolve) => state.prompts.push({ message, options, resolve }))
    },
    async invoke(command, payload) {
      if (state.disk instanceof Error) throw state.disk
      const note = () => ({ path: tab.path, body: state.disk, size: state.disk.length, updatedAt: 123, outOfVault: true })
      if (command === 'read_note') return note()
      if (command === 'save_note_if_unchanged') {
        state.saves.push(payload)
        if (payload.expectedBody !== state.disk) return { status: 'conflict', current: note() }
        state.writes.push(payload.body)
        state.disk = payload.body
        return { status: 'saved', note: note() }
      }
      throw new Error(`Unexpected command ${command}`)
    },
    getCurrentWindow: () => ({ async onFocusChanged(callback) {
      state.focus = callback
      return () => { state.unlistened++ }
    } }),
    async listen(name, callback) {
      assert.equal(name, 'external-files://changed')
      state.notify = callback
      return () => { state.unlistened++ }
    },
    ...timerApi, window: timerApi
  })
  const effect = (marker) => evaluate(findNode((node) => ts.isCallExpression(node)
    && node.expression.getText(source) === 'useEffect'
    && node.arguments[0].getText(source).includes(marker)).arguments[0], context)
  for (const name of ['saveTab', 'saveActive']) {
    const declaration = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === name)
    context[name] = evaluate(declaration.initializer.arguments[0], context)
  }
  context.saveTabBodyWithConflictCheck = evaluate(findNode((node) => ts.isFunctionDeclaration(node)
    && node.name?.text === 'saveTabBodyWithConflictCheck'), context)
  const cleanup = effect('const monitor = createExternalChangeMonitor')()
  return { tab, state, context, cleanup, monitor: context.externalMonitorRef.current,
    autosave: effect('const dirtyTabs = uniqueSaveTargets') }
}

test('focus checks open outside files; duplicate events after Keep editing produce one dialog', async () => {
  const app = harness()
  app.state.focus({ payload: false })
  await tick()
  assert.equal(app.state.prompts.length, 0)
  app.state.focus({ payload: true })
  await tick()
  assert.equal(app.state.prompts.length, 1)
  assert.match(app.state.prompts[0].message, /Unsaved edits.*YES/)
  assert.equal(app.state.prompts[0].options.cancelLabel, 'Keep editing')
  app.state.prompts[0].resolve(false)
  await app.monitor.check([])
  app.state.focus({ payload: true })
  app.state.notify({ payload: { paths: [app.tab.path] } })
  for (const callback of app.state.timers.values()) callback()
  await app.monitor.check([])
  assert.equal(app.state.prompts.length, 1)
  assert.equal(app.state.tabs[0].body, 'local edits')
  app.cleanup()
  await tick()
  assert.equal(app.state.unlistened, 2)
  app.state.focus({ payload: true })
  await tick()
  assert.equal(app.state.prompts.length, 1)
})

test('reload commits the buffer and saved baseline together even with double state updater calls', async () => {
  const app = harness()
  const checking = app.monitor.check([app.tab.path])
  await tick()
  app.state.prompts[0].resolve(true)
  await checking
  assert.equal(app.state.tabs[0].body, 'external edits')
  assert.equal(app.state.tabs[0].savedBody, 'external edits')
  assert.equal(app.state.tabs[0].bodyVersion, 1)
  assert.equal(app.context.latestTabBody(app.state.tabs[0]), 'external edits')
  assert.equal(app.context.tabsRef.current, app.state.tabs)
  assert.deepEqual(app.state.renders.at(-1), { body: 'external edits', dirty: false, blocked: false })
  await app.monitor.check([app.tab.path])
  assert.equal(app.state.prompts.length, 1)
  app.cleanup()
})

test('a newer editor buffer or queued replacement prevents a stale reload commit', () => {
  const app = harness()
  const snapshot = [{ tab: app.tab, body: app.tab.body }]
  const note = { path: app.tab.path, body: 'external edits', updatedAt: 1, size: 14 }
  app.context.latestBodiesRef.current.set(app.tab.id, 'typed just now')
  assert.equal(app.state.options.update(snapshot, note, true), false)
  assert.equal(app.context.latestTabBody(app.tab), 'typed just now')
  app.context.latestBodiesRef.current.set(app.tab.id, app.tab.body)
  app.state.tabs = [{ ...app.tab, bodyVersion: 1 }]
  assert.equal(app.state.options.update(snapshot, note, true), false)
  assert.equal(app.state.tabs[0].body, 'local edits')
  app.cleanup()
})

test('autosave waits while a native dialog or another busy operation is active', () => {
  const app = harness()
  app.context.busy = true
  app.autosave()
  assert.equal(app.state.timers.size, 0)
  app.context.busy = false
  const cancel = app.autosave()
  assert.equal(app.state.timers.size, 1)
  cancel()
  app.cleanup()
})

test('autosave pauses even for an old timer; explicit Save rechecks and offers review without writing', async () => {
  const app = harness()
  app.autosave()
  assert.equal(app.state.timers.size, 1)
  const oldTimer = [...app.state.timers.values()][0]
  const checking = app.monitor.check([app.tab.path])
  await tick()
  oldTimer()
  await tick()
  assert.equal(app.state.saves.length, 0)
  app.state.prompts[0].resolve(false)
  await checking
  app.state.timers.clear()
  app.autosave()
  assert.equal(app.state.timers.size, 0)
  app.context.activeTab = app.state.tabs[0]
  await app.context.saveActive()
  await tick()
  assert.equal(app.state.saves.length, 1)
  assert.equal(app.state.saves[0].expectedBody, 'saved')
  assert.equal(app.state.prompts.length, 2)
  app.state.prompts[1].resolve(false)
  await app.monitor.check([])
  assert.equal(app.state.writes.length, 0)
  assert.equal(app.state.disk, 'external edits')
  assert.equal(app.state.tabs[0].body, 'local edits')
  assert.equal(app.state.tabs[0].savedBody, 'saved')
  assert.equal(app.state.busy, false)
  app.cleanup()
})

test('when disk returns to the saved baseline, local edits can autosave again', async () => {
  const app = harness()
  const checking = app.monitor.check([app.tab.path])
  await tick()
  app.state.prompts[0].resolve(false)
  await checking
  app.state.disk = 'saved'
  await app.monitor.check([app.tab.path])
  assert.equal(app.state.tabs[0].body, 'local edits')
  assert.equal(app.state.tabs[0].externalStatus, undefined)
  assert.deepEqual(app.state.renders.at(-1), { body: 'local edits', dirty: true, blocked: false })
  app.autosave()
  assert.equal(app.state.timers.size, 1)
  app.cleanup()
})
