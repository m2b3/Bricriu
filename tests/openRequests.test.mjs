import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'

// Exercise the app's request effects and real openNote callback without WebView2.
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

function harness({ vault = { root: 'C:/vault' }, tabs = [], requests = [] } = {}) {
  const calls = []
  const context = createContext({
    profileLoaded: true, openRequestsPending: true, busy: false, startupNote: null,
    openRequestFetchingRef: { current: false }, startupNoteOpeningRef: { current: false },
    vault, vaultRef: { current: vault }, tabs, privatePending: false,
    deferredPrivateRestoreRef: { current: null }, latestBodiesRef: { current: new Map() },
    error: null, selected: null, focus: 0,
    LAST_VAULT_KEY: 'last-vault', localStorage: { getItem: () => 'C:/vault' },
    samePath: (a, b) => a.toLowerCase() === b.toLowerCase(),
    isPrivateVaultPath: (path) => path.startsWith('.h/'),
    tabId: (path, mode) => `${path}:${mode}`,
    isRawSourceMode: (mode) => mode === 'markdown' || mode === 'canvas',
    latestTabBody: (tab) => tab.body,
    isTabDirty: (tab) => tab.body !== tab.savedBody,
    resolveNoteJumpOffset: () => null,
    async confirmAction() { throw new Error('Opening a file must not discard edits') },
    setWorkspaceMode() {}, setJumpOffset() {}, rememberRecentPath() {}, setVaultPath() {},
    setOpenRequestsPending(value) { context.openRequestsPending = value },
    setBusy(value) { context.busy = value },
    setStartupNote(value) { context.startupNote = value },
    setError(value) { context.error = value },
    setTabs(update) { context.tabs = update(context.tabs) },
    selectTabInPane(id) { context.selected = id },
    setEditorFocusRequest(update) { context.focus = update(context.focus) },
    async activateOpenedVault(value) { calls.push('activate'); context.vault = value; context.vaultRef.current = value },
    async invoke(command, payload) {
      calls.push(command)
      if (command === 'get_next_open_note') {
        const next = requests.shift() ?? null
        if (next instanceof Error) throw next
        return next
      }
      if (command === 'open_vault') return { root: payload.path }
      if (command === 'read_note') return { path: payload.path, body: 'from disk', updatedAt: 1, size: 9 }
      throw new Error(`Unexpected command ${command}`)
    }
  })
  const declaration = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === 'openNote')
  context.openNote = evaluate(declaration.initializer.arguments[0], context)
  const effect = (name) => evaluate(findNode((node) => ts.isCallExpression(node)
    && node.expression.getText(source) === 'useEffect'
    && node.arguments[0].getText(source).includes(`const ${name} =`)).arguments[0], context)
  const fetchRequest = effect('openRequestedVault')
  const openTab = effect('openRequestedTab')
  return { context, calls, fetchRequest, openTab, async next() {
    fetchRequest()
    await tick()
    openTab()
    await tick()
  } }
}

test('a forwarded file becomes a tab without replacing unsaved tabs or switching vaults', async () => {
  const edited = { id: 'edited.md:markdown', path: 'edited.md', mode: 'markdown', body: 'unsaved', savedBody: 'old' }
  const app = harness({ tabs: [edited], requests: [{ vaultPath: 'C:/vault', path: 'C:/other/résumé #1.typ' }] })
  await app.next()
  assert.equal(app.context.tabs.length, 2)
  assert.equal(app.context.tabs[0], edited)
  assert.equal(app.context.selected, 'C:/other/résumé #1.typ:markdown')
  assert.equal(app.context.focus, 1)
  assert.ok(!app.calls.includes('open_vault'))
})

test('reopening a file selects its existing dirty tab in every editor mode', async () => {
  for (const mode of ['markdown', 'track', 'canvas']) {
    const edited = { id: `note.md:${mode}`, path: 'note.md', mode, body: 'unsaved', savedBody: 'old' }
    const app = harness({ tabs: [edited], requests: [{ vaultPath: 'C:/vault', path: 'note.md' }] })
    await app.next()
    assert.equal(app.context.selected, edited.id)
    assert.equal(app.context.tabs.length, 1)
    assert.equal(app.context.tabs[0], edited)
    assert.ok(!app.calls.includes('read_note'))
  }
})

test('cold launch activates a vault and opens its requested note', async () => {
  const app = harness({ vault: null, requests: [{ vaultPath: 'C:/new', path: 'doc.md' }] })
  await app.next()
  assert.equal(app.context.vault.root, 'C:/new')
  assert.equal(app.context.selected, 'doc.md:markdown')
  assert.equal(app.calls.filter((call) => call === 'activate').length, 1)
})

test('quick launches are drained in order and a duplicate does not create a second tab', async () => {
  const app = harness({ requests: ['one.md', 'two.md', 'one.md'].map((path) => ({ vaultPath: 'C:/vault', path })) })
  await app.next()
  await app.next()
  await app.next()
  await app.next()
  assert.equal(app.context.tabs.length, 2)
  assert.equal(app.context.selected, 'one.md:markdown')
  assert.equal(app.context.openRequestsPending, false)
})

test('an invalid request does not block the next file', async () => {
  const app = harness({ requests: [new Error('file missing'), { vaultPath: 'C:/vault', path: 'valid.md' }] })
  await app.next()
  assert.match(app.context.error, /file missing/)
  await app.next()
  assert.equal(app.context.selected, 'valid.md:markdown')
})

test('requests wait for profile loading and busy operations, and are fetched only once', async () => {
  const app = harness({ requests: [{ vaultPath: 'C:/vault', path: 'note.md' }] })
  app.context.profileLoaded = false
  app.fetchRequest()
  assert.equal(app.calls.length, 0)
  app.context.profileLoaded = true
  app.context.busy = true
  app.fetchRequest()
  assert.equal(app.calls.length, 0)
  app.context.busy = false
  app.fetchRequest()
  app.fetchRequest()
  await tick()
  assert.equal(app.calls.filter((call) => call === 'get_next_open_note').length, 1)
})

test('private notes wait for unlock before opening and releasing the next request', async () => {
  const app = harness({ requests: [{ vaultPath: 'C:/vault', path: '.h/private.md' }] })
  app.context.privatePending = true
  await app.next()
  assert.equal(app.context.tabs.length, 0)
  assert.equal(app.context.startupNote.path, '.h/private.md')
  app.context.privatePending = false
  app.openTab()
  await tick()
  assert.equal(app.context.selected, '.h/private.md:markdown')
  assert.equal(app.context.startupNote, null)
  assert.equal(app.context.openRequestsPending, true)
})

test('TXT, CSV and JSON open in existing tabs without duplicating them', async () => {
  const app = harness({ requests: ['note.txt', 'table.CSV', 'settings.json', 'table.CSV']
    .map((path) => ({ vaultPath: 'C:/vault', path })) })
  for (let index = 0; index < 4; index++) await app.next()
  assert.equal(app.context.tabs.length, 3)
  assert.equal(app.context.selected, 'table.CSV:markdown')
  assert.ok(!app.calls.includes('open_vault'))
})

test('plain-text documents retain their Save As extensions and disable Markdown transformations', () => {
  const context = createContext({})
  for (const name of ['isPlainTextPath', 'basename', 'parentFolder', 'noteName', 'normalizeSaveAsPath', 'suggestSaveAsPath', 'noteMarkdownTools']) {
    context[name] = evaluate(findNode((node) => ts.isFunctionDeclaration(node) && node.name?.text === name), context)
  }
  const commandDeclaration = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === 'markdownCommand')
  context.pathRef = { current: null }
  const wrapCommand = evaluate(commandDeclaration.initializer, context)
  let transformed = 0
  const command = wrapCommand(() => { transformed += 1; return true })
  for (const name of ['note.txt', 'table.CSV', 'settings.json']) {
    context.pathRef.current = name
    assert.equal(context.normalizeSaveAsPath(`nested/${name}`), `nested/${name}`)
    assert.equal(context.suggestSaveAsPath(name, false), name.replace('.', ' copy.'))
    assert.equal(command({}), false)
    assert.equal(context.noteMarkdownTools(null, context.pathRef).length, 0)
  }
  assert.equal(transformed, 0)
  context.pathRef.current = 'note.md'
  assert.equal(command({}), true)
  assert.equal(transformed, 1)
})
