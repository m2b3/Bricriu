import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'

// Exercise the app's actual startup, search, unlock and note-opening callbacks.
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
const plain = (value) => JSON.parse(JSON.stringify(value))

function harness(session = null) {
  const commands = []
  const timers = []
  const vault = { root: 'C:/vault', pathsCaseSensitive: false, git: { status: 'ready' },
    privateVault: { enabled: true, message: 'Private .h is locked.' } }
  const context = createContext({
    vault, vaultRef: { current: vault }, privatePending: true, privatePendingRef: { current: true },
    privatePreparationIdRef: { current: 0 }, privateUnlockWaitersRef: { current: [] },
    deferredPrivateRestoreRef: { current: null }, tabsRef: { current: [] }, activeIdRef: { current: null },
    splitOpenRef: { current: false }, recentPathsRef: { current: [] },
    privatePassword: '', privatePasswordPath: '', privatePasswordOpen: false, privatePasswordBusy: false,
    contentQuery: '', contentUsesFileFilter: false, filteredFilePaths: [],
    tabs: [], activeId: null, splitId: null, latestBodiesRef: { current: new Map() },
    profile: { persistRecentFiles: true, closeMarkdownBeforeTrack: false }, currentPathsCaseSensitive: false,
    PRIVATE_VAULT_PASSWORD_REQUIRED: 'PRIVATE_VAULT_PASSWORD_REQUIRED:', LAST_VAULT_KEY: 'last-vault',
    MAX_RECENT_FILES: 20, localStorage: { setItem() {} }, window: { setTimeout(callback) { timers.push(callback) }, clearTimeout() {} },
    readStoredSession: () => session, resolveNoteJumpOffset: () => null,
    splitWikiDestination: (path) => ({ path, heading: null }),
    latestTabBody: (tab) => tab.body, isTabDirty: (tab) => tab.body !== tab.savedBody,
    isRawSourceMode: (mode) => mode === 'markdown' || mode === 'canvas',
    rememberRecentPath() {}, selectTabInPane(id) { context.selected = id },
    async loadCalendarEvents() {}, async loadOrCreateTrackState() { return {} },
    async refreshTree() { commands.push({ command: 'list_tree' }) },
    async confirmAction() { throw new Error('Unexpected confirmation') },
    async invoke(command, payload) {
      commands.push({ command, payload })
      if (command === 'watch_vault') return
      if (command === 'search_content') return []
      if (command === 'read_note') {
        assert.ok(!context.privatePending || !context.isPrivateVaultRequest(payload.path, vault.root), 'No private read before unlock')
        return { path: payload.path, body: 'from disk', updatedAt: 1, size: 9, outOfVault: false }
      }
      if (command === 'prepare_private_vault') {
        await context.beforePrepare?.()
        if (payload.privatePassword !== 'correct') throw new Error('PRIVATE_VAULT_PASSWORD_REQUIRED: wrong password')
        return { enabled: true, message: 'Private notes unlocked.' }
      }
      throw new Error(`Unexpected command ${command}`)
    }
  })
  for (const name of ['PrivatePassword', 'PrivatePasswordPath', 'PrivatePasswordOpen', 'PrivatePasswordError',
    'PrivatePasswordBusy', 'Error', 'Notice', 'Vault', 'PrivatePending', 'Tabs', 'ActiveId', 'SplitOpen',
    'SplitId', 'FocusedPane', 'Expanded', 'PinnedPaths', 'RecentPaths', 'FileQuery', 'ContentUsesFileFilter',
    'ContentMatches', 'ContentQuery', 'Searching', 'SearchHighlight', 'WorkspaceMode', 'JumpOffset', 'Busy', 'ActiveSearchView']) {
    const key = name[0].toLowerCase() + name.slice(1)
    context[`set${name}`] = (value) => {
      context[key] = typeof value === 'function' ? value(context[key]) : value
      if (context[`${key}Ref`]) context[`${key}Ref`].current = context[key]
    }
  }
  context.expanded = new Set()
  context.pinnedPaths = new Set()
  for (const name of ['pathKey', 'samePath', 'isPrivateVaultPath', 'isPrivateVaultRequest', 'tabId', 'uniquePaths', 'withDeferredPrivateTabs']) {
    context[name] = evaluate(findNode((node) => ts.isFunctionDeclaration(node) && node.name?.text === name), context)
  }
  for (const name of ['loadStoredSession', 'completePrivateVaultPreparation', 'finishPrivateVaultUnlock',
    'cancelPrivateVaultUnlock', 'requestPrivateVaultUnlock', 'ensurePrivateVaultAccess', 'activateOpenedVault',
    'unlockPrivateVault', 'openNote', 'openTrackNote', 'openCanvasNote']) {
    const declaration = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === name)
    context[name] = evaluate(declaration.initializer.arguments[0], context)
  }
  const attribute = (node, name) => node.attributes.properties.find((attr) => attr.name?.getText(source) === name)?.initializer
  const fileInput = findNode((node) => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(source) === 'input' && attribute(node, 'value')?.getText(source) === '{fileQuery}')
  const changeFileQuery = evaluate(attribute(fileInput, 'onChange').expression, context)
  const contentInput = findNode((node) => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(source) === 'input' && attribute(node, 'value')?.getText(source) === '{contentQuery}')
  const changeContentQuery = evaluate(attribute(contentInput, 'onChange').expression, context)
  const searchEffect = evaluate(findNode((node) => ts.isCallExpression(node)
    && node.expression.getText(source) === 'useEffect'
    && node.arguments[0].getText(source).includes("'search_content'")).arguments[0], context)
  return { context, commands, timers,
    search(query) { changeFileQuery({ target: { value: query } }) },
    async searchContent(query) {
      changeContentQuery({ target: { value: query } })
      const cleanup = searchEffect()
      await timers.shift()?.()
      cleanup?.()
    }
  }
}

test('opening a vault restores public tabs without preparing private notes or prompting, even with a saved .h search', async () => {
  const app = harness({ openTabs: [{ path: 'public.md', mode: 'markdown' }, { path: '.h/private.md', mode: 'markdown' }],
    activePath: '.h/private.md', expanded: ['.h'], fileQuery: '.h', contentUsesFileFilter: true })
  await app.context.activateOpenedVault(app.context.vault, 'C:/vault')
  assert.deepEqual(app.commands.map(({ command }) => command), ['read_note', 'list_tree', 'watch_vault'])
  assert.deepEqual(plain(app.context.tabs.map(({ path }) => path)), ['public.md'])
  assert.equal(app.context.privatePasswordOpen, false)
  assert.equal(app.context.privatePending, true)
  assert.equal(app.context.fileQuery, '.h')
  assert.equal(app.timers.length, 0)
})

test('searching explicitly for .h prompts, and cancellation makes no backend request', async () => {
  const app = harness()
  for (const query of ['public', '.html', '.history']) app.search(query)
  assert.equal(app.context.privatePasswordOpen, false)
  app.search('.h')
  assert.equal(app.context.privatePasswordOpen, true)
  assert.equal(app.context.privatePasswordPath, 'C:/vault')
  assert.equal(app.commands.length, 0)
  app.context.cancelPrivateVaultUnlock()
  assert.equal(app.context.privatePasswordOpen, false)
  assert.equal(app.context.privatePending, true)
  assert.equal(app.commands.length, 0)
  app.search('.h/private')
  assert.equal(app.context.privatePasswordOpen, true)
  app.context.cancelPrivateVaultUnlock()
  await tick()
})

test('private note opens wait for an entered password, then resume in each editor mode', async () => {
  for (const callback of ['openNote', 'openTrackNote', 'openCanvasNote']) {
    const app = harness()
    const opened = app.context[callback]('C:/vault/.h/private.md')
    await tick()
    assert.equal(app.context.privatePasswordOpen, true)
    assert.equal(app.commands.length, 0)
    await app.context.unlockPrivateVault()
    assert.equal(app.commands.length, 0, 'Blank password must not use a saved password')
    app.context.privatePassword = 'correct'
    await app.context.unlockPrivateVault()
    assert.equal(await opened, true)
    assert.equal(app.context.privatePending, false)
    assert.equal(app.context.privatePasswordOpen, false)
    assert.equal(app.context.privatePassword, '')
    assert.deepEqual(app.commands.map(({ command }) => command), ['prepare_private_vault', 'list_tree', 'read_note'])
    assert.equal(app.commands[0].payload.privatePassword, 'correct')
    assert.equal(app.context.tabs[0].path, 'C:/vault/.h/private.md')
  }
})

test('wrong passwords keep the request pending for retry; cancel resolves all pending opens', async () => {
  const app = harness()
  const first = app.context.openNote('.h/first.md')
  const second = app.context.openNote('.h/second.md')
  app.context.privatePassword = 'wrong'
  await app.context.unlockPrivateVault()
  assert.equal(app.context.privatePasswordOpen, true)
  assert.equal(app.context.privatePending, true)
  assert.match(app.context.privatePasswordError, /incorrect/)
  assert.equal(app.context.privateUnlockWaitersRef.current.length, 2)
  app.context.cancelPrivateVaultUnlock()
  assert.equal(await first, false)
  assert.equal(await second, false)
  assert.ok(!app.commands.some(({ command }) => command === 'read_note'))
  const retry = app.context.openNote('.h/first.md')
  app.context.privatePassword = 'correct'
  await app.context.unlockPrivateVault()
  assert.equal(await retry, true)
})

test('public files open while locked without prompting or preparing private notes', async () => {
  const app = harness()
  assert.equal(await app.context.openNote('public.md'), true)
  assert.equal(app.context.privatePasswordOpen, false)
  assert.equal(app.context.privatePending, true)
  assert.deepEqual(app.commands.map(({ command }) => command), ['read_note'])
})

test('content searches never prompt for or prepare private notes, including a literal .h query', async () => {
  const app = harness()
  for (const query of ['private words', '.h', '.h/private.md']) {
    await app.searchContent(query)
    assert.equal(app.context.privatePasswordOpen, false)
    assert.equal(app.context.privatePending, true)
    assert.equal(app.context.privateUnlockWaitersRef.current.length, 0)
    assert.equal(app.context.error, null)
  }
  assert.deepEqual(app.commands.map(({ command }) => command), ['search_content', 'search_content', 'search_content'])
})

test('changing vault cancels pending private access and ignores an old unlock result', async () => {
  const app = harness()
  const pending = app.context.openNote('.h/private.md')
  let complete
  app.context.beforePrepare = () => new Promise((resolve) => { complete = resolve })
  app.context.privatePassword = 'correct'
  const unlocking = app.context.unlockPrivateVault()
  const next = { ...app.context.vault, root: 'C:/other' }
  await app.context.activateOpenedVault(next, next.root)
  complete()
  await unlocking
  assert.equal(await pending, false)
  assert.equal(app.context.privatePasswordOpen, false)
  assert.equal(app.context.privatePending, true)
  assert.ok(!app.commands.some(({ command }) => command === 'read_note'))
})

test('private request recognition covers relative and Windows absolute paths without matching other vaults', () => {
  const { context } = harness()
  for (const path of ['.h', '.h/note.md', './.h/note.md', 'C:\\vault\\.h\\note.md', 'c:/VAULT/.h/note.md']) {
    assert.equal(context.isPrivateVaultRequest(path, 'C:/vault'), true, path)
  }
  for (const path of ['.history.md', '.html', 'C:/other/.h/note.md', 'C:/vault2/.h/note.md']) {
    assert.equal(context.isPrivateVaultRequest(path, 'C:/vault'), false, path)
  }
})

test('public session updates retain deferred private tabs without resurrecting closed public tabs', () => {
  const { context } = harness()
  const current = { openTabs: [{ path: 'new.md', mode: 'markdown' }], activePath: 'new.md', fileQuery: 'new' }
  const deferred = { openTabs: [{ path: 'closed.md', mode: 'markdown' }, { path: '.h/private.md', mode: 'track' }] }
  const result = plain(context.withDeferredPrivateTabs(current, deferred))
  assert.deepEqual(result.openTabs, [...current.openTabs, deferred.openTabs[1]])
  assert.equal(result.activePath, 'new.md')
  assert.equal(result.fileQuery, 'new')
  assert.deepEqual(plain(context.withDeferredPrivateTabs(result, deferred)), result)
  assert.equal(context.withDeferredPrivateTabs(current, null), current)
})
