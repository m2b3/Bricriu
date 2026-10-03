import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'

// Exercise the actual Save As callback without opening a desktop window.
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

function harness({ path = 'nested/note.md', outside = false, mode = 'markdown', selected = 'C:\\vault\\copy.md' } = {}) {
  const tab = { id: `${mode}:${path}`, path, mode, outOfVault: outside,
    body: 'edited', savedBody: 'old', bodyVersion: 0,
    ...(mode === 'track' ? { trackState: { path, changes: [] } } : {}) }
  const state = { tabs: [tab], activeId: tab.id, splitId: null, selected, calls: [], recent: [],
    touched: new Set(), expanded: new Set(), refreshes: 0, busy: false, error: null }
  const context = createContext({
    vault: { root: 'C:\\vault', pathsCaseSensitive: false }, activeTab: tab, activeId: tab.id, splitId: null, busy: false,
    tabsRef: { current: state.tabs }, activeIdRef: { current: tab.id },
    latestBodiesRef: { current: new Map() }, saveAsRunningRef: { current: false },
    samePath: (a, b) => a.toLowerCase() === b.toLowerCase(),
    isRawSourceMode: (value) => value === 'markdown' || value === 'canvas',
    tabId: (value, view) => `${view}:${value}`,
    latestTabBody: (value) => context.latestBodiesRef.current.get(value.id) ?? value.body,
    setTabs(update) { state.tabs = update(state.tabs); context.tabsRef.current = state.tabs },
    setActiveId(update) { state.activeId = update(state.activeId) },
    setSplitId(update) { state.splitId = update(state.splitId) },
    closeSplitPane() { state.splitId = null; state.splitClosed = true },
    setBusy(value) { state.busy = value }, setError(value) { state.error = value },
    setNotice(value) { state.notice = value }, clearStatusLater() {}, setEditorFocusRequest() {},
    setTouchedPaths(update) { state.touched = update(state.touched) },
    setExpanded(update) { state.expanded = update(state.expanded) },
    rememberRecentPath(value) { state.recent.push(value) },
    async refreshTree() { state.refreshes++ },
    async saveFileDialog(options) {
      state.dialog = options
      await state.inDialog?.()
      return state.selected
    },
    async invoke(command, payload) {
      state.calls.push({ command, payload })
      if (command === 'save_track_state') return
      assert.equal(command, 'save_note_as')
      if (state.failure) throw state.failure
      await state.duringWrite?.()
      const outOfVault = /^[A-Z]:/i.test(payload.path)
      return { path: payload.path, body: payload.body, outOfVault, updatedAt: 12, size: payload.body.length }
    }
  })
  for (const name of ['saveAsDefaultPath', 'saveAsRequestPath', 'saveAsFilters', 'isMarkdownPath', 'parentFolder', 'folderAncestors']) {
    context[name] = evaluate(findNode((node) => ts.isFunctionDeclaration(node) && node.name?.text === name), context)
  }
  const callback = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === 'openSaveAsDialog')
  context.saveAs = evaluate(callback.initializer.arguments[0], context)
  return { context, state, tab }
}

test('native Save As defaults to the file folder/name, or the vault root without a saved path', () => {
  const { context } = harness()
  assert.equal(context.saveAsDefaultPath('C:\\vault', 'nested/note.md', false), 'C:/vault/nested/note.md')
  assert.equal(context.saveAsDefaultPath('C:\\vault', 'D:\\other\\note.txt', true), 'D:\\other\\note.txt')
  assert.equal(context.saveAsDefaultPath('C:\\vault', '', false), 'C:\\vault')
  assert.equal(context.saveAsDefaultPath('/', 'note.md', false), '/note.md')
  assert.equal(context.saveAsDefaultPath('\\\\server\\vault', 'nested/note.md', false), '//server/vault/nested/note.md')
  for (const extension of ['md', 'markdown', 'typ', 'txt', 'csv', 'json']) {
    assert.equal(context.saveAsFilters(`note.${extension}`, 'markdown')[0].extensions[0], extension)
  }
})

test('native absolute selections use relative vault paths with case and directory boundaries respected', () => {
  const { context } = harness()
  assert.equal(context.saveAsRequestPath('C:\\vault', 'c:\\VAULT\\nested\\note.md', false), 'nested/note.md')
  assert.equal(context.saveAsRequestPath('C:\\vault', 'C:\\vault-other\\note.md', false), 'C:\\vault-other\\note.md')
  assert.equal(context.saveAsRequestPath('/vault', '/Vault/note.md', true), '/Vault/note.md')
  assert.equal(context.saveAsRequestPath('\\\\server\\vault', '\\\\server\\vault\\note.md', false), 'note.md')
})

test('cancelling the native dialog makes no write or tab changes and releases busy state', async () => {
  const { context, state, tab } = harness({ selected: null })
  await context.saveAs()
  assert.equal(state.dialog.defaultPath, 'C:/vault/nested/note.md')
  assert.equal(state.calls.length, 0)
  assert.equal(state.tabs[0], tab)
  assert.equal(state.busy, false)
  assert.equal(context.saveAsRunningRef.current, false)
})

test('a vault destination becomes the active path and expands its folder', async () => {
  const { context, state } = harness({ selected: 'C:\\vault\\nested\\copy.md' })
  await context.saveAs()
  assert.equal(state.error, null)
  assert.equal(state.calls[0].payload.path, 'nested/copy.md')
  assert.equal(state.calls[0].payload.body, 'edited')
  assert.equal(state.tabs[0].savedBody, 'edited')
  assert.equal(state.tabs[0].outOfVault, false)
  assert.equal(state.activeId, 'markdown:nested/copy.md')
  assert.ok(state.touched.has('nested/copy.md'))
  assert.ok(state.expanded.has('nested'))
  assert.equal(state.refreshes, 1)
})

test('outside destinations stay open as external files and stay out of vault checkpoints', async () => {
  const { context, state } = harness({ selected: 'D:\\elsewhere\\note.md' })
  await context.saveAs()
  assert.equal(state.error, null)
  assert.equal(state.tabs[0].path, 'D:\\elsewhere\\note.md')
  assert.equal(state.tabs[0].outOfVault, true)
  assert.equal(state.activeId, 'markdown:D:\\elsewhere\\note.md')
  assert.equal(state.touched.size, 0)
  assert.equal(state.refreshes, 0)
  assert.deepEqual(state.recent, ['D:\\elsewhere\\note.md'])
})

test('an outside source starts in its own directory and can be saved into the vault', async () => {
  const { context, state } = harness({ path: 'D:\\other\\data.csv', outside: true, selected: 'C:\\vault\\data.csv' })
  await context.saveAs()
  assert.equal(state.dialog.defaultPath, 'D:\\other\\data.csv')
  assert.equal(state.dialog.filters[0].extensions[0], 'csv')
  assert.equal(state.tabs[0].outOfVault, false)
  assert.ok(state.touched.has('data.csv'))
})

test('track copies save metadata only inside the vault, with external copies using the text editor', async () => {
  for (const outside of [false, true]) {
    const { context, state } = harness({ mode: 'track', selected: outside ? 'D:\\copy.md' : 'C:\\vault\\copy.md' })
    await context.saveAs()
    assert.equal(state.error, null)
    assert.equal(state.tabs[0].mode, outside ? 'markdown' : 'track')
    assert.equal(state.calls.some(({ command }) => command === 'save_track_state'), !outside)
    assert.equal(!!state.tabs[0].trackState, !outside)
  }
})

test('synced canvas and text views collapse to one text tab when saved outside', async () => {
  const { context, state, tab } = harness({ mode: 'canvas', selected: 'D:\\copy.md' })
  state.tabs.push({ ...tab, id: 'markdown:nested/note.md', mode: 'markdown' })
  state.splitId = context.splitId = 'markdown:nested/note.md'
  await context.saveAs()
  assert.equal(state.tabs.length, 1)
  assert.equal(state.tabs[0].mode, 'markdown')
  assert.equal(state.activeId, 'markdown:D:\\copy.md')
  assert.equal(state.splitId, null)
  assert.equal(state.splitClosed, true)
})

test('write failures retain source edits, and other open paths are sent for collision protection', async () => {
  const { context, state, tab } = harness()
  state.tabs.push({ ...tab, id: 'markdown:copy.md', path: 'copy.md' })
  state.failure = new Error('That destination is already open in another tab.')
  await context.saveAs()
  assert.deepEqual(Array.from(state.calls[0].payload.openPaths), ['copy.md'])
  assert.match(state.error, /already open/)
  assert.equal(state.tabs[0], tab)
  assert.equal(state.busy, false)
})

test('edits made during writing remain dirty in the renamed tab', async () => {
  const { context, state, tab } = harness()
  state.duringWrite = () => context.latestBodiesRef.current.set(tab.id, 'newest edit')
  await context.saveAs()
  assert.equal(state.tabs[0].body, 'newest edit')
  assert.equal(state.tabs[0].savedBody, 'edited')
  assert.equal(context.latestBodiesRef.current.get(state.tabs[0].id), 'newest edit')
})

test('repeated Save As requests cannot open a second native dialog', async () => {
  const { context, state } = harness({ selected: null })
  let dialogs = 0
  state.inDialog = async () => { dialogs++; await context.saveAs() }
  await context.saveAs()
  assert.equal(dialogs, 1)
})
test('Save As in the split pane keeps the saved tab in that pane', async () => {
  const { context, state, tab } = harness()
  context.activeId = state.activeId = 'markdown:other.md'
  context.splitId = state.splitId = tab.id
  state.tabs.push({ ...tab, id: 'markdown:other.md', path: 'other.md' })
  await context.saveAs()
  assert.equal(state.splitId, 'markdown:copy.md')
  assert.equal(state.activeId, 'markdown:other.md')
  assert.equal(state.splitClosed, undefined)
})
