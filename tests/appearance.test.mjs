import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { applyAppearance, MAX_THEME_BYTES, parseThemeFile, readAppearance, saveAppearance } from '../src/appearance.ts'

test('the editable Dark+ CSS palette imports as neutral dark colors', async () => {
  const css = await readFile(new URL('../public/themes/dark-plus.css', import.meta.url), 'utf8')
  const theme = parseThemeFile(css, 'dark-plus.css')
  assert.equal(theme.scheme, 'dark')
  assert.equal(theme.colors['--editor-bg'], '#1e1e1e')
  assert.equal(theme.colors['--panel'], '#252526')
  assert.equal(theme.colors['--syntax-keyword'], '#569cd6')
})

test('imports exported VS Code JSONC with comments, trailing commas and token scopes', () => {
  const theme = parseThemeFile(`{
    // A name containing a URL must survive comment removal.
    "name": "https://example.com/theme,}",
    "type": "dark",
    "colors": {
      "editor.background": "#121212",
      "editor.foreground": "#dddddd",
      "editor.selectionBackground": "#44556688",
      "button.background": "#69aaff",
    },
    "tokenColors": [
      { "scope": "comment, punctuation.definition.comment", "settings": { "foreground": "#888888" } },
      { "scope": ["keyword", "storage"], "settings": { "foreground": "#cc88ff" } },
    ], /* exported settings */
  }`, 'my-theme.json')
  assert.equal(theme.name, 'https://example.com/theme,}')
  assert.equal(theme.colors['--editor-bg'], '#121212')
  assert.equal(theme.colors['--canvas-bg'], '#121212')
  assert.equal(theme.colors['--text'], '#dddddd')
  assert.equal(theme.colors['--selection'], '#44556688')
  assert.equal(theme.colors['--syntax-comment'], '#888888')
  assert.equal(theme.colors['--syntax-keyword'], '#cc88ff')
})

test('detects light palettes and honors their explicit type', () => {
  assert.equal(parseThemeFile('{"colors":{"editor.background":"#ffffff"}}', 'light.json').scheme, 'light')
  assert.equal(parseThemeFile('{"type":"light","colors":{"textLink.foreground":"#333"}}', 'light.json').scheme, 'light')
  assert.equal(parseThemeFile(':root { color-scheme: light; --bg: #eee; }', 'light.css').scheme, 'light')
})

test('explains how to flatten themes with external dependencies', () => {
  assert.throws(() => parseThemeFile('{"include":"./dark_vs.json"}', 'dark_plus.json'), /Generate Color Theme From Current Settings/)
  assert.throws(() => parseThemeFile('{"tokenColors":"tokens.tmTheme"}', 'theme.json'), /Generate Color Theme From Current Settings/)
})

test('rejects broken files, unsupported CSS and oversized files', () => {
  for (const css of [
    ':root { --editor-bg: url(https://example.com); }',
    ':root { --editor-bg: #12345; }',
    ':root { display: none; }',
    '@import "other.css"; :root { --bg: #000; }',
    'body { background: #000; }',
    ':root { color-scheme: dark; }'
  ]) assert.throws(() => parseThemeFile(css, 'bad.css'))
  assert.throws(() => parseThemeFile('not JSON', 'bad.json'), /Could not read theme JSON/)
  assert.throws(() => parseThemeFile('{"colors":{"unknown":"#000"}}', 'bad.json'), /No supported theme colors/)
  assert.throws(() => parseThemeFile('', 'theme.txt'), /Choose a/)
  assert.throws(() => parseThemeFile(' '.repeat(MAX_THEME_BYTES + 1), 'large.css'), /512 KB/)
})

test('migrates existing theme preferences and restores imported colors', (t) => {
  const values = new Map([['notesproject:theme', 'dark']])
  replaceGlobal(t, 'localStorage', {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  })
  assert.deepEqual(readAppearance(), { selected: 'dark', custom: null })
  const custom = parseThemeFile(':root { --editor-bg: #123; }', 'test.css')
  const appearance = { selected: 'custom', custom }
  assert.equal(saveAppearance(appearance), true)
  assert.deepEqual(readAppearance(), appearance)
  saveAppearance({ selected: 'classic', custom })
  assert.deepEqual(readAppearance(), { selected: 'classic', custom })
  values.set('notesproject:appearance', JSON.stringify({ selected: 'custom', custom: { ...custom, colors: { '--bg': 'url(x)' } } }))
  assert.deepEqual(readAppearance(), { selected: 'dark', custom: null })
})

test('storage failures fall back without breaking theme changes', (t) => {
  replaceGlobal(t, 'localStorage', {
    getItem: () => { throw new Error('Storage unavailable') },
    setItem: () => { throw new Error('Quota exceeded') }
  })
  assert.deepEqual(readAppearance(), { selected: 'classic', custom: null })
  assert.equal(saveAppearance({ selected: 'dark', custom: null }), false)
})

test('switching palettes clears old overrides and restores built-in themes', (t) => {
  const properties = new Map()
  const root = {
    dataset: {},
    style: {
      removeProperty: (key) => properties.delete(key),
      setProperty: (key, value) => properties.set(key, value)
    }
  }
  replaceGlobal(t, 'document', { documentElement: root })
  applyAppearance({ selected: 'custom', custom: parseThemeFile(':root { --bg: #111; --text: #ddd; }', 'dark.css') })
  assert.equal(root.dataset.theme, 'dark')
  assert.equal(properties.get('--text'), '#ddd')
  applyAppearance({ selected: 'custom', custom: parseThemeFile(':root { color-scheme: light; --bg: #fff; }', 'light.css') })
  assert.equal(root.dataset.theme, 'bright')
  assert.equal(properties.has('--text'), false)
  applyAppearance({ selected: 'classic', custom: null })
  assert.equal(root.dataset.theme, 'classic')
  assert.equal(properties.size, 0)
})

function replaceGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original)
    else delete globalThis[name]
  })
}
