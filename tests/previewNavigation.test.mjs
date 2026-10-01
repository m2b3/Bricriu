import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { EditorState } from '@codemirror/state'
import ts from 'typescript'
import { renderMarkdownPreview } from '../src/preview/MarkdownPreview.tsx'
import { findPreviewBlock, scrollPreviewToLine } from '../src/preview/sourceNavigation.ts'

function blocks(html) {
  return [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].flatMap(([opening, tag, attributes]) => {
    const start = attributes.match(/data-source-line="(\d+)"/)
    const end = attributes.match(/data-source-end="(\d+)"/)
    return start && end ? [{ tag, opening, start: Number(start[1]), end: Number(end[1]) }] : []
  })
}

test('rendered paragraphs, nested lists, fences, math and table rows retain source ranges', () => {
  const markdown = '# Heading\n\nfirst\nsecond\n\n- one\n- two\n  - child\n\n```js\nlet x=1\n```\n\n$$\nx=1\n$$\n\n| A | B |\n| - | - |\n| a | b |\n'
  const rendered = blocks(renderMarkdownPreview(markdown, [], 'note.md'))
  for (const [tag, start, end] of [['h1', 0, 1], ['p', 2, 4], ['li', 5, 6], ['li', 7, 9], ['pre', 9, 12], ['p', 13, 16], ['tr', 19, 20]]) {
    assert.ok(rendered.some((block) => block.tag === tag && block.start === start && block.end === end), `${tag} at ${start}:${end}`)
  }
  assert.equal(findPreviewBlock(rendered, 7).tag, 'li')
  assert.equal(findPreviewBlock(rendered, 19).tag, 'tr')
})

test('callout preprocessing preserves original line numbers and subsequent heading anchors', () => {
  const markdown = '> [!NOTE] Title\n> body\n\n# After callout\n\n{color:red|coloured}\n\n[[somewhere]]\n'
  const html = renderMarkdownPreview(markdown, ['somewhere.md'], 'note.md')
  const rendered = blocks(html)
  assert.ok(rendered.some((block) => block.tag === 'div' && block.start === 0 && block.end === 1))
  assert.ok(rendered.some((block) => block.tag === 'h1' && block.start === 3 && block.end === 4))
  assert.ok(rendered.some((block) => block.tag === 'p' && block.start === 5 && block.end === 6))
  assert.ok(rendered.some((block) => block.tag === 'a' && block.start === 7 && block.end === 8))
  assert.match(html, /id="after-callout"/)
  assert.match(html, /data-markdown-color="red"/)
  assert.match(html, /href="notesproject-wiki:somewhere.md"/)
  assert.doesNotMatch(html, /@@NZHTML|data-source-(?:line|end)="(?:undefined|NaN)"/)
})

test('Windows line endings, multiline Setext headings and indented code map correctly', () => {
  const markdown = '> [!NOTE]\r\n>\r\n\r\nLong\r\nheading\r\n====\r\n\r\n    indented\r\n    code\r\n'
  const rendered = blocks(renderMarkdownPreview(markdown, [], 'note.md'))
  assert.ok(rendered.some((block) => block.tag === 'h1' && block.start === 3 && block.end === 6))
  const code = rendered.find((block) => block.tag === 'pre')
  assert.equal(code.start, 7)
  assert.equal(code.end, 9)
  assert.equal(code.opening.match(/data-source-line=/g).length, 1)
})

test('source attributes do not enable raw HTML or change code rendering', () => {
  const html = renderMarkdownPreview('<script>alert(1)</script>\n\n```html\n<img src=x onerror=alert(1)>\n```', [], 'note.md')
  assert.doesNotMatch(html, /<script>|<img src=x/)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
})

test('navigation prefers nested blocks and handles blank lines, definitions and document edges', () => {
  const list = { start: 2, end: 8, name: 'list' }
  const first = { start: 2, end: 4, name: 'first item' }
  const second = { start: 4, end: 8, name: 'second item' }
  const paragraph = { start: 4, end: 8, name: 'item paragraph' }
  const next = { start: 10, end: 11, name: 'next paragraph' }
  const rendered = [list, first, second, paragraph, next]
  assert.equal(findPreviewBlock(rendered, 3), first)
  assert.equal(findPreviewBlock(rendered, 5), paragraph)
  assert.equal(findPreviewBlock(rendered, 8), paragraph)
  assert.equal(findPreviewBlock(rendered, 9), next)
  assert.equal(findPreviewBlock(rendered, 0), first)
  assert.equal(findPreviewBlock(rendered, 99), next)
  assert.equal(findPreviewBlock([], 0), null)
})

test('following scrolls only the preview, estimates positions inside long blocks, and clamps edges', () => {
  const calls = []
  const element = { dataset: { sourceLine: '30', sourceEnd: '40' },
    getBoundingClientRect: () => ({ top: 400, height: 200 }) }
  const container = {
    scrollTop: 80, clientHeight: 240, scrollHeight: 1200,
    querySelectorAll: () => [element], getBoundingClientRect: () => ({ top: 100 }),
    scrollTo: (options) => calls.push(options)
  }
  scrollPreviewToLine(container, 35)
  assert.equal(calls[0].top, 420)
  assert.equal(calls[0].behavior, 'instant')
  element.getBoundingClientRect = () => ({ top: -1000, height: 200 })
  scrollPreviewToLine(container, 0)
  assert.equal(calls[1].top, 0)
  element.getBoundingClientRect = () => ({ top: 4000, height: 200 })
  scrollPreviewToLine(container, 99)
  assert.equal(calls[2].top, 960)
  container.querySelectorAll = () => []
  scrollPreviewToLine(container, 0)
  assert.equal(calls.length, 3)
})

// Execute the app's real click handler and preference gate without a WebView.
const source = ts.createSourceFile('main.tsx',
  readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function findNode(predicate, node = source) {
  if (predicate(node)) return node
  return ts.forEachChild(node, (child) => findNode(predicate, child))
}
function evaluate(node, context) {
  return runInContext(ts.transpileModule(`(${node.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }
  }).outputText, context)
}

test('editor clicks follow the correct tab; disabled/hidden preview and link clicks do not follow', () => {
  const requests = []
  const context = createContext({
    showPreview: true, profile: { markdownPreviewFollowCursor: true },
    pathRef: { current: 'C:/outside/note.md' }, changeIdRef: { current: 'split-file:markdown' },
    onPreviewNavigateRef: { current: null },
    isMarkdownPath: (path) => /\.(md|markdown)$/i.test(path),
    setPreviewFollowRequest(update) { requests.push(update(requests.at(-1))) }
  })
  const declaration = (name) => findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === name)
  const defaults = evaluate(declaration('DEFAULT_PROFILE').initializer, context)
  assert.equal(defaults.markdownPreviewFollowCursor, true)
  context.onPreviewNavigateRef.current = evaluate(declaration('followMarkdownPreview').initializer.arguments[0], context)
  const handlers = findNode((node) => ts.isCallExpression(node) && node.expression.getText(source) === 'EditorView.domEventHandlers'
    && node.arguments[0].getText(source).includes('onPreviewNavigateRef'))
  const click = evaluate(handlers.arguments[0], context).click
  const target = {}
  const view = { state: EditorState.create({ doc: 'first\nsecond\nthird', selection: { anchor: 8 } }),
    contentDOM: { contains: (node) => node === target } }
  const event = { button: 0, target }
  assert.equal(click(event, view), false)
  assert.equal(requests[0].tabId, 'split-file:markdown')
  assert.equal(requests[0].line, 1)
  click(event, view)
  assert.equal(requests[1].request, requests[0].request + 1)
  for (const ignored of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { button: 2 }, { target: {} }]) {
    click({ ...event, ...ignored }, view)
  }
  context.profile.markdownPreviewFollowCursor = false
  click(event, view)
  context.profile.markdownPreviewFollowCursor = true
  context.showPreview = false
  click(event, view)
  context.showPreview = true
  for (const path of [null, 'note.typ', 'note.txt']) {
    context.pathRef.current = path
    click(event, view)
  }
  assert.equal(requests.length, 2)
})
