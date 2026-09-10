import assert from 'node:assert/strict'
import test from 'node:test'
import { renderCanvasMarkdown } from '../src/canvas/canvasMarkdown.ts'
import { collectMarkdownHeadings, findHeadingOffset } from '../src/markdown/headings.ts'
import { renderMarkdownPreview } from '../src/preview/MarkdownPreview.tsx'

test('collects ATX and Setext headings while ignoring fenced code', () => {
  const markdown = [
    '# First **heading**',
    '',
    'Second',
    'heading',
    '--------------',
    '',
    '```md',
    '# Not a heading',
    '```'
  ].join('\n')

  assert.deepEqual(
    collectMarkdownHeadings(markdown).map(({ text, level, slug, style }) => ({ text, level, slug, style })),
    [
      { text: 'First heading', level: 1, slug: 'first-heading', style: 'atx' },
      { text: 'Second heading', level: 2, slug: 'second-heading', style: 'setext' }
    ]
  )
})

test('assigns collision-free slugs and resolves duplicate anchors', () => {
  const markdown = '# Intro\n# Intro\n# Intro-1\n'
  const headings = collectMarkdownHeadings(markdown)

  assert.deepEqual(headings.map((heading) => heading.slug), ['intro', 'intro-1', 'intro-1-1'])
  assert.equal(findHeadingOffset(markdown, 'intro'), 0)
  assert.equal(findHeadingOffset(markdown, 'intro-1'), 8)
  assert.equal(findHeadingOffset(markdown, 'intro-1-1'), 16)
})

test('resolves a multiline Setext heading to its first source line', () => {
  const markdown = 'Before\n\nA multiline\nheading\n=======\n'
  assert.equal(collectMarkdownHeadings(markdown)[0].slug, 'a-multiline-heading')
  assert.equal(findHeadingOffset(markdown, 'a-multiline-heading'), 8)
})

test('renders preview IDs, standard fragment links, and same-note wiki anchors', () => {
  const markdown = [
    '# Intro',
    '# Intro',
    '[Second](#intro-1)',
    '[[#intro-1|Same note]]'
  ].join('\n')
  const html = renderMarkdownPreview(markdown, ['folder/note.md'], 'folder/note.md')

  assert.match(html, /<h1 id="intro">Intro<\/h1>/)
  assert.match(html, /<h1 id="intro-1">Intro<\/h1>/)
  assert.match(html, /<a href="#intro-1">Second<\/a>/)
  assert.match(html, /class="preview-wiki" href="notesproject-wiki:folder%2Fnote\.md%23intro-1"/)
})

test('uses the same heading IDs and anchor links in Canvas rendering', () => {
  const html = renderCanvasMarkdown(
    '# Intro\nIntro\n=====\n[Top](#intro)\n[[#intro|Same note]]',
    ['note.md'],
    'note.md'
  )

  assert.match(html, /<h1 id="intro">Intro<\/h1>/)
  assert.match(html, /<h1 id="intro-1">Intro<\/h1>/)
  assert.match(html, /class="canvas-heading-anchor" href="#intro"/)
  assert.match(html, /notesproject-wiki:note\.md%23intro/)
})
