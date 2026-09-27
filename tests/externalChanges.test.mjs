import assert from 'node:assert/strict'
import test from 'node:test'
import { createExternalChangeMonitor } from '../src/externalChanges.ts'

const tick = () => new Promise((resolve) => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function harness({ dirty = false, twoFiles = false } = {}) {
  const path = 'C:/outside/note.md'
  const tab = { id: `${path}:markdown`, path, outOfVault: true, body: dirty ? 'unsaved' : 'saved', savedBody: 'saved', bodyVersion: 0 }
  const other = { ...tab, id: 'C:/outside/other.md:markdown', path: 'C:/outside/other.md' }
  const state = { tabs: twoFiles ? [tab, other] : [tab], errors: [], reads: [], updates: [] }
  const prompts = []
  const bodies = new Map()
  const disk = new Map(state.tabs.map((tab) => [tab.path, 'changed']))
  const monitor = createExternalChangeMonitor({
    getTabs: () => state.tabs,
    getBody: (tab) => bodies.get(tab.id) ?? tab.body,
    pathKey: (path) => path.toLowerCase(),
    async read(path) {
      state.reads.push(path)
      const body = disk.get(path)
      if (body instanceof Error) throw body
      return { path, body, updatedAt: 123, size: body.length }
    },
    confirm(message) {
      const result = deferred()
      prompts.push({ ...result, message })
      return result.promise
    },
    update(snapshots, note, reload) {
      const expected = snapshots.map(({ tab }) => tab)
      state.updates.push({ note, reload })
      state.tabs = state.tabs.map((tab) => expected.includes(tab) ? {
        ...tab,
        ...(reload ? { body: note.body, savedBody: note.body, bodyVersion: tab.bodyVersion + 1 } : {}),
        updatedAt: note.updatedAt, size: note.size, externalStatus: undefined
      } : tab)
      if (reload) for (const tab of expected) bodies.set(tab.id, note.body)
      return true
    },
    mark(expected, externalStatus) {
      state.tabs = state.tabs.map((tab) => expected.includes(tab) ? { ...tab, externalStatus } : tab)
    },
    error(message) { state.errors.push(message) }
  })
  return { monitor, state, prompts, tab, other, disk, bodies, check: () => monitor.check([path]) }
}

test('an outside change reloads only after confirmation, using the latest disk text', async () => {
  const app = harness()
  const checking = app.check()
  await tick()
  assert.equal(app.prompts.length, 1)
  assert.match(app.prompts[0].message, /Unsaved edits when Bricriu detected this change: NO/)
  assert.equal(app.state.tabs[0].body, 'saved')
  app.disk.set(app.tab.path, 'newer while dialog was open')
  app.prompts[0].resolve(true)
  await checking
  assert.equal(app.state.tabs[0].body, 'newer while dialog was open')
  assert.equal(app.state.tabs[0].savedBody, app.state.tabs[0].body)
  assert.equal(app.state.tabs[0].bodyVersion, 1)
  assert.equal(app.state.tabs[0].updatedAt, 123)
})

test('Keep editing preserves dirty text and suppresses duplicate events for the same disk contents', async () => {
  const app = harness({ dirty: true })
  const checking = app.check()
  await tick()
  app.monitor.check([app.tab.path, app.tab.path.toUpperCase()])
  assert.match(app.prompts[0].message, /discard unsaved changes/)
  assert.match(app.prompts[0].message, /Unsaved edits when Bricriu detected this change: YES/)
  assert.equal(app.monitor.isBlocked(app.tab.path), true)
  app.prompts[0].resolve(false)
  // The monitor uses the most recently supplied spelling; simulate Windows reads.
  app.disk.set(app.tab.path.toUpperCase(), 'changed')
  await checking
  await app.check()
  assert.equal(app.prompts.length, 1)
  assert.equal(app.state.tabs[0].body, 'unsaved')
  assert.equal(app.state.tabs[0].savedBody, 'saved')
  assert.equal(app.state.tabs[0].externalStatus, 'changed')
  app.disk.set(app.tab.path, 'changed again')
  const next = app.check()
  await tick()
  assert.equal(app.prompts.length, 2)
  app.prompts[1].resolve(true)
  await next
  assert.equal(app.state.tabs[0].body, 'changed again')
  assert.equal(app.monitor.isBlocked(app.tab.path), false)
})

test('a save already on disk does not prompt before its UI acknowledgement', async () => {
  const app = harness({ dirty: true })
  app.disk.set(app.tab.path, 'unsaved')
  await app.check()
  assert.equal(app.prompts.length, 0)
  assert.equal(app.state.tabs[0].savedBody, 'unsaved')
  assert.equal(app.monitor.isBlocked(app.tab.path), false)
})

test('focus and duplicate notifications during a dialog do not prompt again after Keep editing', async () => {
  const app = harness({ dirty: true })
  const checking = app.check()
  await tick()
  app.check()
  app.monitor.check([app.tab.path], { force: true })
  app.prompts[0].resolve(false)
  await checking
  assert.equal(app.prompts.length, 1)
  assert.equal(app.monitor.isBlocked(app.tab.path), true)
  assert.equal(app.state.tabs[0].body, 'unsaved')
})

test('an explicit save/review can ask again after Keep editing without enabling overwrite', async () => {
  const app = harness({ dirty: true })
  const checking = app.check()
  await tick()
  app.prompts[0].resolve(false)
  await checking
  const review = app.monitor.check([app.tab.path], { force: true })
  await tick()
  assert.equal(app.prompts.length, 2)
  assert.equal(app.monitor.isBlocked(app.tab.path), true)
  assert.match(app.prompts[1].message, /Save As/)
  app.prompts[1].resolve(false)
  await review
  assert.equal(app.state.tabs[0].body, 'unsaved')
  assert.equal(app.state.tabs[0].savedBody, 'saved')
})

test('a genuinely newer disk revision is identified in the next prompt', async () => {
  const app = harness()
  const checking = app.check()
  await tick()
  app.prompts[0].resolve(false)
  await checking
  app.disk.set(app.tab.path, 'a later sync revision')
  const second = app.check()
  await tick()
  assert.match(app.prompts[1].message, /changed again since your last choice/)
  app.prompts[1].resolve(false)
  await second
})

test('own saves and metadata-only changes do not prompt or erase current edits', async () => {
  const app = harness({ dirty: true })
  app.disk.set(app.tab.path, 'saved')
  await app.check()
  assert.equal(app.prompts.length, 0)
  assert.equal(app.state.tabs[0].body, 'unsaved')
  assert.equal(app.state.tabs[0].updatedAt, 123)
})

test('the latest editor buffer is used when warning about unsaved changes', async () => {
  const app = harness()
  app.bodies.set(app.tab.id, 'edit ahead of React state')
  const checking = app.check()
  await tick()
  assert.match(app.prompts[0].message, /discard unsaved changes/)
  app.prompts[0].resolve(false)
  await checking
  assert.equal(app.bodies.get(app.tab.id), 'edit ahead of React state')
})

test('edits arriving during confirmation require fresh consent before replacement', async () => {
  const app = harness()
  const checking = app.check()
  await tick()
  app.bodies.set(app.tab.id, 'new local edit')
  app.prompts[0].resolve(true)
  await tick()
  assert.equal(app.state.tabs[0].body, 'saved')
  assert.equal(app.prompts.length, 2)
  assert.match(app.prompts[1].message, /discard unsaved changes/)
  app.prompts[1].resolve(false)
  await checking
  assert.equal(app.bodies.get(app.tab.id), 'new local edit')
})

test('only one dialog is shown at a time when several outside files change', async () => {
  const app = harness({ twoFiles: true })
  const checking = app.monitor.check([app.tab.path, app.other.path])
  await tick()
  assert.equal(app.prompts.length, 1)
  app.prompts[0].resolve(true)
  await tick()
  assert.equal(app.prompts.length, 2)
  app.prompts[1].resolve(false)
  await checking
  assert.equal(app.state.tabs[0].body, 'changed')
  assert.equal(app.state.tabs[1].body, 'saved')
})

test('all open views of a file refresh together after one confirmation', async () => {
  const app = harness()
  app.state.tabs.push({ ...app.tab, id: `${app.tab.path}:canvas` })
  const checking = app.check()
  await tick()
  assert.equal(app.prompts.length, 1)
  app.prompts[0].resolve(true)
  await checking
  assert.ok(app.state.tabs.every((tab) => tab.body === 'changed' && tab.savedBody === 'changed'))
})

test('deleted or unreadable files keep the editor text and can be reloaded after recreation', async () => {
  const app = harness({ dirty: true })
  app.disk.set(app.tab.path, new Error('file missing'))
  await app.check()
  await app.check()
  assert.equal(app.state.tabs[0].externalStatus, 'unavailable')
  assert.equal(app.state.tabs[0].body, 'unsaved')
  assert.equal(app.state.errors.length, 1)
  assert.equal(app.prompts.length, 0)
  app.disk.set(app.tab.path, 'recreated')
  const checking = app.check()
  await tick()
  app.prompts[0].resolve(true)
  await checking
  assert.equal(app.state.tabs[0].body, 'recreated')
  assert.equal(app.state.tabs[0].externalStatus, undefined)
})

test('Keep editing is remembered across a temporary sync-service read failure', async () => {
  const app = harness({ dirty: true })
  const checking = app.check()
  await tick()
  app.prompts[0].resolve(false)
  await checking
  app.disk.set(app.tab.path, new Error('temporarily locked by sync service'))
  await app.check()
  app.disk.set(app.tab.path, 'changed')
  const retry = app.check()
  await tick()
  // Settle an unexpected dialog so a failure cannot leave a test hanging.
  app.prompts[1]?.resolve(false)
  await retry
  assert.equal(app.prompts.length, 1)
  assert.equal(app.state.tabs[0].body, 'unsaved')
  assert.equal(app.state.tabs[0].externalStatus, 'changed')
})

test('file deletion while the confirmation is open cannot clear the buffer', async () => {
  const app = harness({ dirty: true })
  const checking = app.check()
  await tick()
  app.disk.set(app.tab.path, new Error('file deleted'))
  app.prompts[0].resolve(true)
  await checking
  assert.equal(app.state.tabs[0].body, 'unsaved')
  assert.equal(app.state.tabs[0].externalStatus, 'unavailable')
})

test('closing a tab or switching vaults invalidates a pending reload', async () => {
  for (const dispose of [false, true]) {
    const app = harness()
    const checking = app.check()
    await tick()
    if (dispose) app.monitor.dispose()
    else app.state.tabs = []
    app.prompts[0].resolve(true)
    await checking
    assert.equal(app.state.updates.length, 0)
  }
})

test('vault files and closed outside files are ignored', async () => {
  const app = harness()
  app.state.tabs[0].outOfVault = false
  await app.monitor.check([app.tab.path, 'C:/outside/closed.md'])
  assert.equal(app.state.reads.length, 0)
  assert.equal(app.prompts.length, 0)
})

test('a change queued as an empty scan finishes is still processed', async () => {
  const app = harness()
  const emptyScan = app.monitor.check([])
  const checking = app.check()
  await tick()
  assert.equal(app.prompts.length, 1)
  app.prompts[0].resolve(false)
  await Promise.all([emptyScan, checking])
})

test('dialog failure preserves the text and allows a later retry', async () => {
  const app = harness()
  const checking = app.check()
  await tick()
  app.prompts[0].reject(new Error('dialog failed'))
  await checking
  assert.equal(app.state.tabs[0].body, 'saved')
  assert.match(app.state.errors[0], /confirmation/)
  const retry = app.check()
  await tick()
  assert.equal(app.prompts.length, 2)
  app.prompts[1].resolve(false)
  await retry
})
