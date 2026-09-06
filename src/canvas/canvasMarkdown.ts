import { resolveWikiDocumentPath } from '../wikiPaths'

export function renderCanvasMarkdown(source: string, notePaths: string[] = [], sourcePath: string | null = null): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length === 0) return
    html.push(`<ul>${listItems.join('')}</ul>`)
    listItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushList()
      const level = heading[1].length
      html.push(`<h${level}>${renderInlineCanvasMarkdown(heading[2], notePaths, sourcePath)}</h${level}>`)
      continue
    }

    const item = trimmed.match(/^[-*]\s+(.+)$/)
    if (item) {
      listItems.push(`<li>${renderInlineCanvasMarkdown(item[1], notePaths, sourcePath)}</li>`)
      continue
    }

    flushList()
    html.push(`<p>${renderInlineCanvasMarkdown(trimmed, notePaths, sourcePath)}</p>`)
  }

  flushList()
  return html.join('')
}

function renderInlineCanvasMarkdown(source: string, notePaths: string[], sourcePath: string | null): string {
  return renderWikiLinks(escapeHtml(source), notePaths, sourcePath)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function renderWikiLinks(source: string, notePaths: string[], sourcePath: string | null): string {
  return source.replace(
    /\[\[([^\]\n|#]+)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g,
    (_match, rawLabel: string, rawAnchor: string | undefined, rawAlias: string | undefined) => {
      const label = unescapeHtml(rawLabel).trim()
      const target = resolveWikiPath(label, notePaths, sourcePath)
      const text = wikiDisplayText(label, rawAnchor, rawAlias)
      if (!target) return `<span class="canvas-wiki missing">${text}</span>`
      return `<a class="canvas-wiki" href="notesproject-wiki:${encodeURIComponent(formatWikiDestination(target, rawAnchor))}">${text}</a>`
    }
  )
}

function resolveWikiPath(label: string, notePaths: string[], sourcePath: string | null = null): string | null {
  return resolveWikiDocumentPath(label, notePaths, sourcePath)
}

function wikiDisplayText(label: string, rawAnchor: string | undefined, rawAlias: string | undefined): string {
  if (rawAlias?.trim()) return rawAlias.trim()
  const heading = rawAnchor?.replace(/^#/, '').trim()
  return heading || escapeHtml(label)
}

function formatWikiDestination(path: string, rawAnchor: string | undefined): string {
  const heading = rawAnchor?.replace(/^#/, '').trim()
  return heading ? `${path}#${heading}` : path
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
}
