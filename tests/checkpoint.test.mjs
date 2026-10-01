import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'

// Exercise the actual UI callbacks, including saving, without a WebView.
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

function harness({ outside = false, dirty = true } = {}) {
  const tab = { id: 'markdown:note.md', path: 'note.md', mode: 'markdown', outOfVault: outside,
    body: dirty ? 'edited' : 'saved', savedBody: 'saved', bodyVersion: 0 }
  const git = { isRepo: true, currentBranch: 'inuse', message: 'Checkpoint committed.' }
  const state = { tabs: [tab], disk: 'saved', vault: { root: '/vault', git }, touched: new Set(),
    commands: [], busy: false, error: null, notice: null }
  const context = createContext({
    tabs: state.tabs, vault: state.vault, touchedPaths: state.touched, privatePending: false,
    tabsRef: { current: state.tabs }, touchedPathsRef: { current: state.touched },
    checkpointRunningRef: { current: false }, latestBodiesRef: { current: new Map() },
    externalMonitorRef: { current: null },
    latestTabBody: (tab) => context.latestBodiesRef.current.get(tab.id) ?? tab.body,
    isTabDirty: (tab) => context.latestTabBody(tab) !== tab.savedBody,
    samePath: (a, b) => a === b, pathKey: (path) => path, tabId: (path, mode) => `${mode}:${path}`,
    isMarkdownPath: (path) => path.endsWith('.md'), isRawSourceMode: (mode) => ['markdown', 'canvas'].includes(mode),
    isPrivateVaultPath: (path) => path === '.h' || path.startsWith('.h/'),
    uniquePaths: (paths) => [...new Set(paths)], hasPath: (paths, path) => paths.has(path),
    setTabs(update) { state.tabs = typeof update === 'function' ? update(state.tabs) : update; context.tabs = state.tabs; context.tabsRef.current = state.tabs },
    setVault(update) { state.vault = typeof update === 'function' ? update(state.vault) : update; context.vault = state.vault },
    setTouchedPaths(update) {
      state.touched = typeof update === 'function' ? update(state.touched) : update
      context.touchedPaths = state.touched
      context.touchedPathsRef.current = state.touched
    },
    setActiveId() {}, setSplitId() {}, rememberRecentPath() {}, clearStatusLater() {},
    setBusy(value) { state.busy = value }, setError(value) { state.error = value },
    setNotice(value) { state.notice = value }, async refreshTree() {},
    async invoke(command, payload) {
      state.commands.push({ command, payload })
      if (command === 'save_note_if_unchanged') {
        const note = (body) => ({ path: tab.path, body, updatedAt: 123, size: body.length, outOfVault: outside })
        if (payload.expectedBody !== state.disk) return { status: 'conflict', current: note(state.disk) }
        state.disk = payload.body
        await state.afterSave?.()
        return { status: 'saved', note: note(payload.body) }
      }
      if (command === 'write_track_merge_candidate') return { path: 'note.track-merge.md', body: payload.body }
      if (command === 'save_track_state') return
      if (command === 'checkpoint_vault' || command === 'checkpoint_inuse') {
        await state.onCommit?.()
        return git
      }
      throw new Error(`Unexpected command: ${command}`)
    }
  })
  for (const name of ['saveTabBodyWithConflictCheck', 'uniqueSaveTargets']) {
    context[name] = evaluate(findNode((node) => ts.isFunctionDeclaration(node) && node.name?.text === name), context)
  }
  for (const name of ['saveTab', 'checkpointNow', 'checkpointVaultNow']) {
    const declaration = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === name)
    context[name] = evaluate(declaration.initializer.arguments[0], context)
  }
  return { state, context, tab }
}

function checkpointControl(kind, context) {
  const attribute = (node, name) => node.attributes.properties.find((attr) => attr.name?.getText(source) === name)?.initializer
  const control = findNode((node) => {
    if (kind === 'menu') return ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'AppMenuBar'
    if (!ts.isJsxOpeningElement(node) || node.tagName.getText(source) !== 'button') return false
    return kind === 'sidebar'
      ? attribute(node, 'className')?.getText(source) === '"sidebar-checkpoint-button"'
      : attribute(node, 'title')?.getText(source) === '{editorCheckpointTitle}'
  })
  assert.ok(control, `Missing ${kind} checkpoint`)
  return {
    disabled: () => evaluate(attribute(control, kind === 'menu' ? 'checkpointDisabled' : 'disabled').expression, context),
    click: evaluate(attribute(control, kind === 'menu' ? 'onCheckpoint' : 'onClick').expression, context)
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

test('unlocked toolbar and menu checkpoints require inuse and select only session-touched paths', async () => {
  for (const kind of ['toolbar', 'menu']) {
    const { state, context } = harness({ dirty: false })
    Object.assign(context, { activeOutOfVault: false, busy: false })
    const control = checkpointControl(kind, context)
    assert.equal(control.disabled(), true)
    context.setTouchedPaths(new Set(['note.md']))
    context.vault.git.currentBranch = 'main'
    assert.equal(control.disabled(), true)
    context.vault.git.currentBranch = 'inuse'
    assert.equal(control.disabled(), false)
    control.click()
    await tick()
    assert.deepEqual(state.commands.map(({ command }) => command), ['checkpoint_inuse'])
    assert.deepEqual([...state.commands[0].payload.paths], ['note.md'])
  }
})

test('locked toolbar and menu retain the public-only checkpoint exception', async () => {
  for (const kind of ['toolbar', 'menu']) {
    const { state, context } = harness({ dirty: false })
    Object.assign(context, { activeOutOfVault: false, busy: false, privatePending: true })
    context.vault.git.currentBranch = 'main'
    const control = checkpointControl(kind, context)
    assert.equal(control.disabled(), false)
    control.click()
    await tick()
    assert.deepEqual(state.commands.map(({ command }) => command), ['checkpoint_vault'])
    context.busy = true
    assert.equal(control.disabled(), true)
    context.busy = false
    context.activeOutOfVault = true
    assert.equal(control.disabled(), true)
  }
})

test('sidebar checkpoint retains its existing whole-vault scope on the current branch', async () => {
  const { state, context } = harness({ dirty: false })
  context.busy = false
  context.vault.git.currentBranch = 'main'
  const control = checkpointControl('sidebar', context)
  assert.equal(control.disabled(), false)
  control.click()
  await tick()
  assert.deepEqual(state.commands.map(({ command }) => command), ['checkpoint_vault'])
})

test('checkpoint saves the latest editor buffer and updates the saved baseline before committing', async () => {
  const { state, context, tab } = harness()
  context.latestBodiesRef.current.set(tab.id, 'typed just now')
  await context.checkpointVaultNow()
  assert.deepEqual(state.commands.map(({ command }) => command), ['save_note_if_unchanged', 'checkpoint_vault'])
  assert.equal(state.disk, 'typed just now')
  assert.equal(state.tabs[0].savedBody, 'typed just now')
  assert.equal(context.isTabDirty(state.tabs[0]), false)
  assert.equal(state.notice, 'Checkpoint committed.')
  assert.equal(state.busy, false)
})

test('vault checkpoint leaves unsaved outside files alone', async () => {
  const { state, context } = harness({ outside: true })
  state.disk = 'outside changes'
  await context.checkpointVaultNow()
  assert.deepEqual(state.commands.map(({ command }) => command), ['checkpoint_vault'])
  assert.equal(state.tabs[0].body, 'edited')
  assert.equal(state.disk, 'outside changes')
})

test('a locked private vault permits public checkpointing without saving or clearing private edits', async () => {
  const { state, context, tab } = harness()
  context.privatePending = true
  const privateTab = { ...tab, id: 'markdown:.h/secret.md', path: '.h/secret.md', body: 'private edit' }
  context.setTabs([tab, privateTab])
  context.setTouchedPaths(new Set(['.h/secret.md']))
  await context.checkpointVaultNow()
  assert.deepEqual(state.commands.map(({ command }) => command), ['save_note_if_unchanged', 'checkpoint_vault'])
  assert.equal(state.commands[0].payload.path, 'note.md')
  assert.equal(state.tabs[1], privateTab)
  assert.deepEqual([...state.touched], ['.h/secret.md'])
  assert.equal(state.error, null)
})

test('edits made during a checkpoint save remain unsaved in the editor', async () => {
  const { state, context, tab } = harness()
  state.afterSave = () => context.latestBodiesRef.current.set(tab.id, 'newer edits')
  await context.checkpointVaultNow()
  assert.equal(state.disk, 'edited')
  assert.equal(state.tabs[0].savedBody, 'edited')
  assert.equal(context.latestTabBody(state.tabs[0]), 'newer edits')
  assert.equal(context.isTabDirty(state.tabs[0]), true)
})

test('save conflicts stop the checkpoint and retain a merge candidate for recovery', async () => {
  const { state, context } = harness()
  state.disk = 'external edit'
  await context.checkpointVaultNow()
  assert.equal(state.commands.some(({ command }) => command.startsWith('checkpoint')), false)
  assert.equal(state.disk, 'external edit')
  assert.match(state.error, /Disk changed/)
  assert.equal(state.touched.has('note.track-merge.md'), true)
  assert.equal(state.busy, false)
})

test('a failed commit retains saved state and pending paths so retry succeeds', async () => {
  const { state, context } = harness()
  state.onCommit = () => { throw new Error('Git identity missing') }
  await context.checkpointVaultNow()
  assert.match(state.error, /Git identity missing/)
  assert.equal(state.touched.has('note.md'), true)
  assert.equal(state.tabs[0].savedBody, 'edited')
  state.onCommit = undefined
  await context.checkpointVaultNow()
  assert.equal(state.error, null)
  assert.equal(state.notice, 'Checkpoint committed.')
  assert.equal(state.touched.size, 0)
})

test('manual and periodic checkpoints cannot overlap; changes during commit stay pending', async () => {
  const { state, context } = harness({ dirty: false })
  let finish
  state.onCommit = () => new Promise((resolve) => { finish = resolve })
  context.setTouchedPaths(new Set(['note.md']))
  const pending = context.checkpointVaultNow()
  await context.checkpointVaultNow()
  await context.checkpointNow()
  assert.equal(state.commands.filter(({ command }) => command.startsWith('checkpoint')).length, 1)
  context.setTouchedPaths(new Set(['note.md', 'other.md']))
  finish()
  await pending
  assert.equal(state.touched.has('other.md'), true)
  assert.equal(state.busy, false)
})
