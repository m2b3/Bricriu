import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { afterEach } from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import { confirm } from '@tauri-apps/plugin-dialog'
import ts from 'typescript'

// Execute the app's actual callbacks without mounting its editors or starting Tauri.
const source = ts.createSourceFile(
  'main.tsx',
  readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)

function findNode(predicate, node = source) {
  if (predicate(node)) return node
  return ts.forEachChild(node, (child) => findNode(predicate, child))
}

function callback(name, context) {
  const declaration = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === name)
  assert.ok(declaration, `Missing app callback: ${name}`)
  return evaluate(declaration.initializer.arguments[0], context)
}

function evaluate(node, context) {
  const { outputText } = ts.transpileModule(`(${node.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }
  })
  return runInContext(outputText, context)
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function harness({ dirty = true, latestBody } = {}) {
  const tab = { id: 'note.md:markdown', path: 'note.md', mode: 'markdown', body: dirty ? 'edited' : 'saved', savedBody: 'saved' }
  const other = { ...tab, id: 'other.md:markdown', path: 'other.md', body: 'saved' }
  const state = { tabs: [tab, other], activeId: tab.id, splitId: null, error: null, busy: false, finalized: 0, destroyed: 0 }
  const prompts = []
  globalThis.window = {}
  mockIPC((command, payload) => {
    assert.equal(command, 'plugin:dialog|message')
    const answer = deferred()
    prompts.push({ ...answer, payload })
    return answer.promise
  })
  const context = createContext({
    confirmDialog: confirm,
    tabsRef: { current: state.tabs },
    latestBodiesRef: { current: new Map(latestBody === undefined ? [] : [[tab.id, latestBody]]) },
    activeIdRef: { current: tab.id },
    activeIdHistoryRef: { current: [tab.id, other.id] },
    pendingTabCloseIdsRef: { current: new Set() },
    closingRef: { current: false },
    setTabs(update) { state.tabs = update(state.tabs); context.tabsRef.current = state.tabs },
    setActiveId(value) { state.activeId = value; context.activeIdRef.current = value },
    setSplitId(update) { state.splitId = typeof update === 'function' ? update(state.splitId) : update },
    setError(value) { state.error = value },
    setBusy(value) { state.busy = value },
    uniqueSaveTargets(tabs) { return tabs },
    async saveWindowPlacement() {},
    async finalizeBeforeClose() { state.finalized += 1 },
    appWindow: { async destroy() { state.destroyed += 1 } }
  })
  for (const name of ['latestTabBody', 'isTabDirty', 'confirmAction', 'closeTab']) {
    context[name] = callback(name, context)
  }
  const onClose = findNode((node) => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'onCloseRequested')
  context.onCloseRequested = evaluate(onClose.arguments[0], context)
  return { state, context, prompts, tab, other }
}

afterEach(() => {
  if (globalThis.window) clearMocks()
  delete globalThis.window
})

test('dirty tab stays open until discard is confirmed; repeated close does not bypass the prompt', async () => {
  const { state, context, prompts, tab, other } = harness()
  const closing = context.closeTab(tab.id)
  await context.closeTab(tab.id)
  assert.equal(prompts.length, 1)
  assert.equal(state.tabs.length, 2)
  assert.equal(state.tabs[0].body, 'edited')
  assert.equal(state.activeId, tab.id)
  assert.deepEqual(prompts[0].payload.buttons, { OkCancelCustom: ['Discard changes', 'Keep editing'] })
  prompts[0].resolve('Discard changes')
  await closing
  assert.equal(state.tabs.length, 1)
  assert.equal(state.tabs[0].id, other.id)
  assert.equal(state.activeId, other.id)
})

test('Keep editing and dismissing the dialog preserve the tab and its unsaved text', async () => {
  const { state, context, prompts, tab } = harness()
  for (const result of ['Keep editing', 'Cancel']) {
    const closing = context.closeTab(tab.id)
    prompts.at(-1).resolve(result)
    await closing
    assert.equal(state.tabs.length, 2)
    assert.equal(state.tabs[0].body, 'edited')
    assert.equal(state.activeId, tab.id)
  }
})

test('a failed dialog keeps the tab open, reports the error, and allows retry', async () => {
  const { state, context, prompts, tab } = harness()
  const closing = context.closeTab(tab.id)
  prompts[0].reject(new Error('dialog permission denied'))
  await closing
  assert.equal(state.tabs.length, 2)
  assert.match(state.error, /Could not show confirmation:.*dialog permission denied/)
  const retry = context.closeTab(tab.id)
  assert.equal(prompts.length, 2)
  prompts[1].resolve('Keep editing')
  await retry
})

test('saved tabs close without prompting', async () => {
  const { state, context, prompts, tab } = harness({ dirty: false })
  await context.closeTab(tab.id)
  assert.equal(state.tabs.length, 1)
  assert.equal(prompts.length, 0)
})

test('an edit ahead of React state still requires confirmation', async () => {
  const { state, context, prompts, tab } = harness({ dirty: false, latestBody: 'just typed' })
  const closing = context.closeTab(tab.id)
  assert.equal(prompts.length, 1)
  assert.equal(state.tabs.length, 2)
  prompts[0].resolve('Keep editing')
  await closing
  assert.equal(context.latestBodiesRef.current.get(tab.id), 'just typed')
})

test('closing a background tab preserves the current selection', async () => {
  const { state, context, prompts, tab, other } = harness()
  const closing = context.closeTab(tab.id)
  context.setActiveId(other.id)
  prompts[0].resolve('Discard changes')
  await closing
  assert.equal(state.activeId, other.id)
})

test('window closing waits for confirmation and cancellation allows another close attempt', async () => {
  const { state, context, prompts } = harness()
  let prevented = 0
  const event = { preventDefault() { prevented += 1 } }
  const closing = context.onCloseRequested(event)
  await context.onCloseRequested(event)
  assert.equal(prevented, 2)
  assert.equal(prompts.length, 1)
  assert.equal(state.finalized, 0)
  assert.equal(state.destroyed, 0)
  prompts[0].resolve('Keep editing')
  await closing
  assert.equal(state.destroyed, 0)
  assert.equal(context.closingRef.current, false)
  const retry = context.onCloseRequested(event)
  prompts[1].resolve('Discard changes')
  await retry
  assert.equal(state.finalized, 1)
  assert.equal(state.destroyed, 1)
})

test('closing the window cannot bypass a pending tab confirmation', async () => {
  const { state, context, prompts, tab } = harness()
  const closing = context.closeTab(tab.id)
  let prevented = false
  await context.onCloseRequested({ preventDefault() { prevented = true } })
  assert.equal(prevented, true)
  assert.equal(state.destroyed, 0)
  assert.equal(prompts.length, 1)
  prompts[0].resolve('Keep editing')
  await closing
})

test('the desktop capability permits the native confirmation command', () => {
  const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'))
  assert.ok(capability.permissions.includes('dialog:allow-message'))
})
