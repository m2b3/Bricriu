export type AppTheme = 'classic' | 'bright' | 'dark' | 'custom'
export type ImportedTheme = {
  name: string
  scheme: 'light' | 'dark'
  colors: Record<string, string>
}
export type Appearance = { selected: AppTheme; custom: ImportedTheme | null }

const STORAGE_KEY = 'notesproject:appearance'
export const MAX_THEME_BYTES = 512 * 1024
const colorProperties = new Set(`
  bg panel panel-2 line line-strong text muted faint accent accent-2 danger
  input-bg editor-bg editor-bg-alt soft-bg sunken-bg hover-bg hover-strong-bg
  danger-hover-bg tab-strip-bg tab-hover-bg toolbar-bg canvas-bg code-editor-bg
  editor-toolbar-bg accent-border on-accent accent-strong-text accent-alt-text
  notice-text link warning warning-text autocomplete-selected calendar-event-bg
  calendar-event-text selection spell-error search-match search-match-active
  search-match-border search-match-text track-line track-neutral track-added
  track-added-bg track-modified track-modified-bg track-deleted track-deleted-bg
  track-card-line track-code track-pill-bg track-added-text track-modified-text
  track-deleted-text track-inline-line track-insert-bg track-delete-bg canvas-node
  canvas-node-line canvas-node-yellow canvas-node-yellow-line canvas-node-blue
  canvas-node-blue-line canvas-node-green canvas-node-green-line canvas-node-red
  canvas-node-red-line canvas-node-code-bg canvas-node-stroke canvas-mask
  cm-gutter-bg cm-gutter-line cm-gutter-text cm-active-line cm-active-gutter-text
  syntax-meta syntax-keyword syntax-atom syntax-inserted syntax-deleted syntax-special
  syntax-definition syntax-local syntax-type syntax-class syntax-macro syntax-property
  syntax-comment syntax-invalid
`.trim().split(/\s+/).map((name) => `--${name}`))

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateTheme(value: unknown): ImportedTheme {
  if (!isObject(value) || typeof value.name !== 'string' || !value.name.trim()
    || (value.scheme !== 'dark' && value.scheme !== 'light') || !isObject(value.colors)) {
    throw new Error('Invalid theme palette.')
  }
  const colors: Record<string, string> = {}
  for (const [property, color] of Object.entries(value.colors)) {
    if (!colorProperties.has(property) || !isHexColor(color)) {
      throw new Error(`Unsupported theme color: ${property}. Use hex colors, such as #1e1e1e.`)
    }
    colors[property] = color
  }
  if (!Object.keys(colors).length) throw new Error('No supported theme colors found.')
  return { name: value.name.trim().slice(0, 100), scheme: value.scheme, colors }
}

// Palette files deliberately contain only color data; arbitrary styles are not mounted.
function parseCssPalette(source: string, name: string): ImportedTheme {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '').trim()
  const block = /^:root\s*\{([^{}]*)\}\s*$/.exec(css)
  if (!block) throw new Error('Use a Bricriu CSS palette with one :root { … } block. Other editors’ CSS needs adapting.')
  let scheme: ImportedTheme['scheme'] = 'dark'
  const colors: Record<string, string> = {}
  for (const declaration of block[1].split(';').map((part) => part.trim()).filter(Boolean)) {
    const colon = declaration.indexOf(':')
    if (colon < 0) throw new Error('Invalid CSS palette declaration.')
    const property = declaration.slice(0, colon).trim()
    const value = declaration.slice(colon + 1).trim()
    if (property === 'color-scheme') {
      if (value !== 'light' && value !== 'dark') throw new Error('color-scheme must be light or dark.')
      scheme = value
    } else {
      colors[property] = value
    }
  }
  return validateTheme({ name, scheme, colors })
}

const vscodeColors: Record<string, string[]> = {
  'editor.background': ['editor-bg', 'editor-bg-alt', 'code-editor-bg', 'canvas-bg', 'canvas-node'],
  'editor.foreground': ['text', 'cm-active-gutter-text', 'track-code'],
  'sideBar.background': ['panel', 'panel-2', 'soft-bg'],
  'sideBar.foreground': ['muted'],
  'activityBar.background': ['bg', 'sunken-bg'],
  'titleBar.activeBackground': ['toolbar-bg', 'editor-toolbar-bg'],
  'editorGroupHeader.tabsBackground': ['tab-strip-bg'],
  'tab.hoverBackground': ['tab-hover-bg'],
  'input.background': ['input-bg'],
  'input.placeholderForeground': ['faint'],
  'panel.border': ['line', 'cm-gutter-line', 'track-line', 'track-card-line', 'track-inline-line'],
  'contrastBorder': ['line-strong', 'canvas-node-line'],
  'focusBorder': ['accent-border'],
  'textLink.foreground': ['link', 'accent', 'accent-2', 'accent-strong-text', 'accent-alt-text'],
  'button.background': ['accent'],
  'button.foreground': ['on-accent'],
  'list.hoverBackground': ['hover-bg'],
  'list.activeSelectionBackground': ['hover-strong-bg', 'autocomplete-selected'],
  'editor.selectionBackground': ['selection'],
  'editor.lineHighlightBackground': ['cm-active-line'],
  'editorGutter.background': ['cm-gutter-bg'],
  'editorLineNumber.foreground': ['cm-gutter-text'],
  'editorLineNumber.activeForeground': ['cm-active-gutter-text'],
  'editorError.foreground': ['danger', 'spell-error', 'syntax-invalid'],
  'editorWarning.foreground': ['warning', 'warning-text'],
  'editor.findMatchBackground': ['search-match-active'],
  'editor.findMatchHighlightBackground': ['search-match'],
  'editor.findMatchBorder': ['search-match-border']
}

const tokenScopes: Record<string, string[]> = {
  'syntax-meta': ['meta'],
  'syntax-keyword': ['keyword', 'storage'],
  'syntax-atom': ['constant.language'],
  'syntax-inserted': ['constant.numeric', 'markup.inserted'],
  'syntax-deleted': ['string', 'markup.deleted'],
  'syntax-special': ['string.regexp', 'constant.character.escape'],
  'syntax-definition': ['entity.name.function', 'support.function'],
  'syntax-local': ['variable'],
  'syntax-type': ['entity.name.type', 'support.type'],
  'syntax-class': ['entity.name.class', 'support.class'],
  'syntax-macro': ['entity.name.function.preprocessor'],
  'syntax-property': ['support.type.property-name', 'variable.other.property'],
  'syntax-comment': ['comment'],
  'syntax-invalid': ['invalid']
}

function parseVscodeTheme(source: string, filename: string): ImportedTheme {
  // Preserve quoted strings when removing JSONC comments and trailing commas.
  const json = source.replace(/^\uFEFF/, '')
    .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (match, quoted: string | undefined) => quoted ?? ' ')
    .replace(/("(?:[^"\\]|\\.)*")|,\s*(?=[}\]])/g, (match, quoted: string | undefined) => quoted ?? '')
  let data: unknown
  try { data = JSON.parse(json) } catch { throw new Error('Could not read theme JSON. Choose a VS Code color-theme JSON file.') }
  if (!isObject(data)) throw new Error('Expected a VS Code color-theme object.')
  if (data.include || typeof data.tokenColors === 'string') {
    throw new Error('This theme depends on another file. In VS Code, run “Developer: Generate Color Theme From Current Settings” and import the generated JSON.')
  }
  const palette = isObject(data.colors) ? data.colors : {}
  const background = palette['editor.background']
  let scheme: ImportedTheme['scheme'] = 'dark'
  if (data.type === 'light' || data.type === 'hc-light') scheme = 'light'
  else if (!data.type && typeof background === 'string' && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(background)) {
    const rgb = [1, 3, 5].map((offset) => parseInt(background.slice(offset, offset + 2), 16))
    if (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 140) scheme = 'light'
  }
  const colors: Record<string, string> = {}
  for (const [key, properties] of Object.entries(vscodeColors)) {
    const color = palette[key]
    if (isHexColor(color)) for (const property of properties) colors[`--${property}`] = color
  }
  // CodeMirror and TextMate use different token systems. Use broad, shared scopes.
  if (Array.isArray(data.tokenColors)) {
    const rules = data.tokenColors.filter(isObject)
    for (const [property, scopes] of Object.entries(tokenScopes)) {
      for (const rule of rules) {
        const selectors = (Array.isArray(rule.scope) ? rule.scope : [rule.scope])
          .filter((scope): scope is string => typeof scope === 'string')
          .flatMap((scope) => scope.split(',').map((part) => part.trim()))
        if (!selectors.some((selector) => scopes.includes(selector))) continue
        if (isObject(rule.settings) && isHexColor(rule.settings.foreground)) {
          colors[`--${property}`] = rule.settings.foreground
        }
      }
    }
  }
  return validateTheme({ name: typeof data.name === 'string' ? data.name : filename, scheme, colors })
}

export function parseThemeFile(source: string, filename: string): ImportedTheme {
  if (source.length > MAX_THEME_BYTES) throw new Error('Theme files must be smaller than 512 KB.')
  const name = filename.replace(/\.(css|jsonc?)$/i, '')
  if (/\.css$/i.test(filename)) return parseCssPalette(source, name)
  if (/\.jsonc?$/i.test(filename)) return parseVscodeTheme(source, name)
  throw new Error('Choose a .css, .json, or .jsonc theme file.')
}

export function readAppearance(): Appearance {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const data: unknown = JSON.parse(stored)
      if (isObject(data)) {
        let custom: ImportedTheme | null = null
        try { if (data.custom) custom = validateTheme(data.custom) } catch { /* Discard an invalid imported palette. */ }
        const selected = data.selected
        if (selected === 'classic' || selected === 'bright' || selected === 'dark' || (selected === 'custom' && custom)) {
          return { selected, custom }
        }
      }
    }
    const legacy = localStorage.getItem('notesproject:theme')
    return { selected: legacy === 'bright' || legacy === 'dark' ? legacy : 'classic', custom: null }
  } catch {
    return { selected: 'classic', custom: null }
  }
}

export function saveAppearance(appearance: Appearance): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance))
    return true
  } catch {
    return false
  }
}

export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement
  // Clear the previous palette so switching back to a built-in fully restores it.
  for (const property of colorProperties) root.style.removeProperty(property)
  const custom = appearance.selected === 'custom' ? appearance.custom : null
  root.dataset.theme = custom ? (custom.scheme === 'dark' ? 'dark' : 'bright') : appearance.selected === 'custom' ? 'dark' : appearance.selected
  if (custom) for (const [property, color] of Object.entries(custom.colors)) root.style.setProperty(property, color)
}
