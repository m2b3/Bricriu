import { syntaxTree } from '@codemirror/language'
import { forceLinting, linter, lintKeymap, type Action, type Diagnostic } from '@codemirror/lint'
import type { EditorState, Extension } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import nspell from 'nspell'
import canadianAffix from '../../node_modules/dictionary-en-ca/index.aff?raw'
import canadianDictionary from '../../node_modules/dictionary-en-ca/index.dic?raw'

const PERSONAL_DICTIONARY_KEY = 'notesproject:spellcheck-personal-dictionary'
const MAX_DIAGNOSTICS = 500
const MAX_SUGGESTIONS = 5
const WORD_PATTERN = /\p{L}+(?:['’]\p{L}+)*/gu

const excludedMarkdownNodes = new Set([
  'Autolink',
  'CodeBlock',
  'Comment',
  'CommentBlock',
  'FencedCode',
  'HTMLBlock',
  'HTMLTag',
  'InlineCode',
  'LinkLabel',
  'LinkTitle',
  'ProcessingInstructionBlock',
  'URL'
])

type ExcludedRange = {
  from: number
  to: number
}

const checker = nspell(canadianAffix, canadianDictionary)
const personalWords = loadPersonalWords()
const correctnessCache = new Map<string, boolean>()
const suggestionCache = new Map<string, string[]>()

for (const word of personalWords) checker.add(word)

export function createMarkdownSpellcheckExtension(): Extension {
  return [
    linter(
      (view) => collectSpellingDiagnostics(view.state),
      { delay: 650 }
    ),
    keymap.of(lintKeymap)
  ]
}

function collectSpellingDiagnostics(state: EditorState): Diagnostic[] {
  const text = state.doc.toString()
  const excluded = collectExcludedRanges(state, text)
  const diagnostics: Diagnostic[] = []
  let excludedIndex = 0

  WORD_PATTERN.lastIndex = 0
  for (const match of text.matchAll(WORD_PATTERN)) {
    if (diagnostics.length >= MAX_DIAGNOSTICS) break
    const word = match[0]
    const from = match.index
    const to = from + word.length

    while (excludedIndex < excluded.length && excluded[excludedIndex].to <= from) {
      excludedIndex += 1
    }
    if (excludedIndex < excluded.length && excluded[excludedIndex].from < to) continue
    if (!shouldCheckWord(word) || isCorrect(word)) continue

    diagnostics.push({
      from,
      to,
      severity: 'warning',
      source: 'Spellcheck (English Canada)',
      message: `Unknown word “${word}”.`,
      markClass: 'cm-spelling-error',
      get actions() {
        return spellingActions(word)
      }
    })
  }

  return diagnostics
}

function collectExcludedRanges(state: EditorState, text: string): ExcludedRange[] {
  const ranges: ExcludedRange[] = []

  syntaxTree(state).iterate({
    enter(node) {
      if (!excludedMarkdownNodes.has(node.name)) return
      ranges.push({ from: node.from, to: node.to })
      return false
    }
  })

  addFrontmatterRange(text, ranges)
  addRegexRanges(text, /\b(?:https?:\/\/|www\.)[^\s<>]+/giu, ranges)
  addRegexRanges(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, ranges)
  addRegexRanges(text, /(?:^|[\s(])(?:[A-Za-z]:[\\/]|\.{0,2}[\\/])?[^\s<>"'()[\]]*[\\/][^\s<>"'()[\]]+/gmu, ranges, 1)
  addRegexRanges(text, /\b[^\s<>"'()[\]`]+\.(?:md|markdown|mdx|txt|typ|json|ya?ml|toml|tsx?|jsx?|css|html?|rs|py|go|java|c|cpp|h|hpp)\b/giu, ranges)
  addRegexRanges(text, /`{1,3}[^`\n]+`{1,3}/gu, ranges)
  addRegexRanges(text, /\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\s)[^\n$]+?\$/gu, ranges)
  addWikiTargetRanges(text, ranges)

  return mergeRanges(ranges)
}

function addFrontmatterRange(text: string, ranges: ExcludedRange[]): void {
  const opening = /^(---|\+\+\+)[ \t]*\r?\n/.exec(text)
  if (!opening) return
  const marker = opening[1]
  const closing = new RegExp(`^${escapeRegExp(marker)}[ \\t]*\\r?$`, 'm')
  const rest = text.slice(opening[0].length)
  const match = closing.exec(rest)
  if (!match) return
  ranges.push({ from: 0, to: opening[0].length + match.index + match[0].length })
}

function addRegexRanges(
  text: string,
  pattern: RegExp,
  ranges: ExcludedRange[],
  leadingCharacters = 0
): void {
  pattern.lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    ranges.push({
      from: match.index + leadingCharacters,
      to: match.index + match[0].length
    })
  }
}

function addWikiTargetRanges(text: string, ranges: ExcludedRange[]): void {
  const pattern = /!?\[\[([^\]\n]+)\]\]/gu
  for (const match of text.matchAll(pattern)) {
    const full = match[0]
    const content = match[1]
    const contentOffset = match.index + full.indexOf('[[') + 2
    const separator = content.indexOf('|')
    ranges.push({
      from: contentOffset,
      to: contentOffset + (separator >= 0 ? separator : content.length)
    })
  }
}

function mergeRanges(ranges: ExcludedRange[]): ExcludedRange[] {
  ranges.sort((left, right) => left.from - right.from || left.to - right.to)
  const merged: ExcludedRange[] = []

  for (const range of ranges) {
    const previous = merged[merged.length - 1]
    if (!previous || range.from > previous.to) {
      merged.push({ ...range })
      continue
    }
    previous.to = Math.max(previous.to, range.to)
  }

  return merged
}

function shouldCheckWord(word: string): boolean {
  if (word.length < 2) return false
  if (/^\p{Lu}{2,}$/u.test(word)) return false
  if (/\p{Ll}\p{Lu}/u.test(word)) return false
  return true
}

function isCorrect(word: string): boolean {
  const normalized = normalizeWord(word)
  const cacheKey = normalized.toLocaleLowerCase('en-CA')
  if (personalWords.has(cacheKey)) return true

  const cached = correctnessCache.get(normalized)
  if (cached != null) return cached

  let correct = checker.correct(normalized)
  if (!correct && /'s$/i.test(normalized)) {
    correct = checker.correct(normalized.slice(0, -2))
  }
  correctnessCache.set(normalized, correct)
  return correct
}

function spellingActions(word: string): Action[] {
  const normalized = normalizeWord(word)
  let suggestions = suggestionCache.get(normalized)
  if (!suggestions) {
    suggestions = checker.suggest(normalized).slice(0, MAX_SUGGESTIONS)
    suggestionCache.set(normalized, suggestions)
  }

  return [
    ...suggestions.map((suggestion) => ({
      name: matchWordCase(word, suggestion),
      apply(view, from, to) {
        view.dispatch({ changes: { from, to, insert: matchWordCase(word, suggestion) } })
        view.focus()
      }
    } satisfies Action)),
    {
      name: 'Add to dictionary',
      apply(view, from, to) {
        addPersonalWord(view.state.doc.sliceString(from, to) || word)
        forceLinting(view)
        view.focus()
      }
    }
  ]
}

function addPersonalWord(word: string): void {
  const normalized = normalizeWord(word).toLocaleLowerCase('en-CA')
  if (!normalized || personalWords.has(normalized)) return
  personalWords.add(normalized)
  checker.add(normalized)
  correctnessCache.clear()
  suggestionCache.delete(normalized)
  try {
    localStorage.setItem(PERSONAL_DICTIONARY_KEY, JSON.stringify([...personalWords].sort()))
  } catch {
    // Spellchecking still works when local storage is unavailable.
  }
}

function loadPersonalWords(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(PERSONAL_DICTIONARY_KEY) ?? '[]')
    if (!Array.isArray(stored)) return new Set()
    return new Set(stored.filter((word): word is string => typeof word === 'string' && word.length > 0))
  } catch {
    return new Set()
  }
}

function normalizeWord(word: string): string {
  return word.normalize('NFC').replace(/’/g, "'")
}

function matchWordCase(original: string, suggestion: string): string {
  if (/^\p{Lu}/u.test(original) && /^\p{Ll}/u.test(suggestion)) {
    return suggestion[0].toLocaleUpperCase('en-CA') + suggestion.slice(1)
  }
  return suggestion
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
