import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { EditorSelection, EditorState } from '@codemirror/state'
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown'
import ts from 'typescript'

// Run the actual editor commands against CodeMirror state without a WebView.
const source = ts.createSourceFile('main.tsx',
  readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const context = createContext({ EditorSelection, commonmarkLanguage })
for (const name of ['formatMarkdownListSelection', 'parseMarkdownListLine',
  'renumberMarkdownOrderedLists', 'indentColumn', 'continueMarkdownList']) {
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(declaration, `Missing editor command: ${name}`)
  runInContext(ts.transpileModule(declaration.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }
  }).outputText, context)
}

function editor(doc, anchor = 0, head = doc.length) {
  return {
    state: EditorState.create({ doc, selection: { anchor, head }, extensions: [markdown()] }),
    dispatch(spec) { this.state = this.state.update(spec).state }
  }
}

test('Numbers keeps counting across empty and whitespace-only lines', () => {
  const view = editor('- first\n\n- second\n  \t\n\n- third')
  assert.equal(context.formatMarkdownListSelection(view, 'numbered'), true)
  assert.equal(view.state.doc.toString(), '1. first\n\n2. second\n  \t\n\n3. third')
})

test('Numbers converts spaced paragraphs and renumbers existing loose lists', () => {
  for (const doc of ['first\n\nsecond\n\nthird', '1. first\n\n1. second\n\n1. third']) {
    const view = editor(doc)
    context.formatMarkdownListSelection(view, 'numbered')
    assert.equal(view.state.doc.toString(), '1. first\n\n2. second\n\n3. third')
  }
})

test('Numbers on part of a loose list keeps numbering consistent with adjacent items', () => {
  const doc = '1. first\n\n1. second\n\n1. third'
  const view = editor(doc, doc.indexOf('second'), doc.indexOf('second'))
  context.formatMarkdownListSelection(view, 'numbered')
  assert.equal(view.state.doc.toString(), '1. first\n\n2. second\n\n3. third')
})

test('nested loose lists have independent counters and retain their spacing', () => {
  const view = editor('- parent\n\n    - child\n\n    - child two\n\n- parent two\n\n    - new child')
  context.formatMarkdownListSelection(view, 'numbered')
  assert.equal(view.state.doc.toString(), '1. parent\n\n    1. child\n\n    2. child two\n\n2. parent two\n\n    1. new child')
})

test('renumbering preserves continuation paragraphs within a loose list', () => {
  const view = editor('1. first\n   continuation\n\n   another paragraph\n\n1. second')
  context.renumberMarkdownOrderedLists(view)
  assert.equal(view.state.doc.toString(), '1. first\n   continuation\n\n   another paragraph\n\n2. second')
})

test('separate Markdown blocks restart numbering', () => {
  for (const separator of ['A separate paragraph.', '# Heading', '---', '- A bullet item']) {
    const view = editor(`1. first\n\n1. second\n\n${separator}\n\n1. next list\n\n1. next item`)
    context.renumberMarkdownOrderedLists(view)
    assert.equal(view.state.doc.toString(), `1. first\n\n2. second\n\n${separator}\n\n1. next list\n\n2. next item`)
  }
})

test('renumbering respects list delimiters and leaves code examples untouched', () => {
  const doc = '1) first\n\n1) second\n\n1. new list\n\n1. next item\n\n```md\n7. code\n\n7. more code\n```\n\n    8. indented code'
  const view = editor(doc)
  context.renumberMarkdownOrderedLists(view)
  assert.equal(view.state.doc.toString(), doc.replace('1) second', '2) second').replace('1. next item', '2. next item'))
})

test('Enter continues a loose list and renumbers subsequent items across blank lines', () => {
  const doc = '1. first\n\n2. second'
  const view = editor(doc, '1. first'.length, '1. first'.length)
  assert.equal(context.continueMarkdownList(view), true)
  assert.equal(view.state.doc.toString(), '1. first\n2. \n\n3. second')
  assert.equal(view.state.selection.main.head, '1. first\n2. '.length)
})

test('a selection ending at the next line leaves that line unformatted', () => {
  const doc = 'first\n\nsecond\nLeave this line alone'
  const view = editor(doc, 0, doc.indexOf('Leave'))
  context.formatMarkdownListSelection(view, 'numbered')
  assert.equal(view.state.doc.toString(), '1. first\n\n2. second\nLeave this line alone')
})
