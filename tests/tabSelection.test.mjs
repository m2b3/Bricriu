import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'

// Exercise the real selection callbacks, UI bindings, and shortcuts without Tauri.
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

function declaration(name) {
  return findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === name)
}

function componentProp(name, prop, context) {
  const component = findNode((node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === name)
  const attribute = component.attributes.properties.find((attr) => attr.name?.getText(source) === prop)
  return evaluate(attribute.initializer.expression, context)
}

function harness({ pane = 'split', activeId = 'left', splitId = 'right', splitOpen = true, mode = 'markdown' } = {}) {
  const tabs = ['left', 'right', 'background'].map((id) => Object.freeze({
    id, path: `${id}.md`, mode, body: `unsaved ${id}`, savedBody: 'saved'
  }))
  const context = createContext({
    tabs, activeId, splitId, splitOpen, focusedPane: pane, editorFocusRequest: 0, workspaceMode: 'notes',
    document: { querySelector: () => null },
    setActiveId(value) { context.activeId = value; sync() },
    setSplitId(value) { context.splitId = value; sync() },
    setSplitOpen(value) { context.splitOpen = value },
    setFocusedPane(value) { context.focusedPane = value; sync() },
    setWorkspaceMode(value) { context.workspaceMode = value },
    setEditorFocusRequest(update) { context.editorFocusRequest = update(context.editorFocusRequest) }
  })
  function sync() {
    context.mainTab = tabs.find((tab) => tab.id === context.activeId) ?? null
    context.splitTab = tabs.find((tab) => tab.id === context.splitId) ?? null
    context.activeTab = context.focusedPane === 'split' ? context.splitTab : context.mainTab
  }
  sync()
  for (const name of ['selectTabInPane', 'selectFocusedTab']) {
    context[name] = evaluate(declaration(name).initializer.arguments[0], context)
  }
  context.selectAdjacentTab = evaluate(findNode((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'selectAdjacentTab'), context)
  const click = (id, component = 'TabStrip') => componentProp(component, 'onSelect', context)(id)
  const press = (key, modifiers = {}) => {
    let prevented = false
    evaluate(declaration(key === 'Tab' ? 'onTabKeyDown' : 'onKeyDown').initializer, context)({
      key, ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, isComposing: false,
      preventDefault() { prevented = true }, stopPropagation() {}, ...modifiers
    })
    return prevented
  }
  return { context, tabs, click, press }
}

test('tab strip and sidebar open tabs select in either focused pane without changing the other document', () => {
  for (const component of ['TabStrip', 'OpenTabsList']) {
    for (const pane of ['main', 'split']) {
      for (const mode of ['markdown', 'track', 'canvas']) {
        const { context, tabs, click } = harness({ pane, mode })
        click('background', component)
        assert.equal(context.activeId, pane === 'main' ? 'background' : 'left')
        assert.equal(context.splitId, pane === 'split' ? 'background' : 'right')
        assert.equal(context.focusedPane, pane)
        assert.equal(context.editorFocusRequest, 1)
        assert.deepEqual(tabs.map((tab) => tab.body), ['unsaved left', 'unsaved right', 'unsaved background'])
        assert.equal(componentProp('TabStrip', 'activeId', context), 'background')
      }
    }
  }
})

test('selecting the document in the other pane swaps the two documents', () => {
  for (const pane of ['main', 'split']) {
    const { context, click } = harness({ pane })
    click(pane === 'main' ? 'right' : 'left')
    assert.equal(context.activeId, 'right')
    assert.equal(context.splitId, 'left')
    assert.equal(context.focusedPane, pane)
  }
})

test('moving the opposite document into an empty pane leaves its previous pane empty', () => {
  for (const pane of ['main', 'split']) {
    const { context, click } = harness({ pane, activeId: pane === 'main' ? null : 'left', splitId: pane === 'split' ? null : 'right' })
    assert.equal(componentProp('TabStrip', 'activeId', context), null)
    click(pane === 'main' ? 'right' : 'left')
    assert.equal(context.activeId, pane === 'main' ? 'right' : null)
    assert.equal(context.splitId, pane === 'split' ? 'left' : null)
    assert.equal(context.tabs.length, 3)
  }
})

test('clicking the current tab preserves both pane assignments', () => {
  const { context, click } = harness()
  click('right')
  assert.equal(context.activeId, 'left')
  assert.equal(context.splitId, 'right')
})

test('a closed split always routes tab selection to the main pane', () => {
  const { context, click } = harness({ splitOpen: false, splitId: null })
  click('background')
  assert.equal(context.activeId, 'background')
  assert.equal(context.splitId, null)
  assert.equal(context.splitOpen, false)
  assert.equal(context.focusedPane, 'main')
})

test('tab navigation shortcuts start from the focused document and select in that pane', () => {
  for (const [key, modifiers] of [['Tab', {}], ['PageDown', {}], [']', {}], ['PageDown', { ctrlKey: false, metaKey: true }]]) {
    const { context, press } = harness()
    assert.equal(press(key, modifiers), true)
    assert.equal(context.activeId, 'left')
    assert.equal(context.splitId, 'background')
    assert.equal(context.focusedPane, 'split')
  }
  for (const [key, modifiers] of [['Tab', { shiftKey: true }], ['PageUp', {}], ['[', {}]]) {
    const { context, press } = harness({ splitId: 'background' })
    assert.equal(press(key, modifiers), true)
    assert.equal(context.activeId, 'left')
    assert.equal(context.splitId, 'right')
  }
})
