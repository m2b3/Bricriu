import { collectMarkdownHeadings } from '../markdown/headings'
import { resolveWikiDocumentPath } from '../wikiPaths'

export function renderCanvasMarkdown(source: string, notePaths: string[] = [], sourcePath: string | null = null): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const headingsByLine = new Map(collectMarkdownHeadings(source).map((heading) => [heading.line, heading]))
  const html: string[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length === 0) return
    html.push(`<ul>${listItems.join('')}</ul>`)
    listItems = []
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }

    const heading = headingsByLine.get(lineIndex)
    if (heading) {
      flushList()
      html.push(`<h${heading.level} id="${escapeHtml(heading.slug)}">${renderInlineCanvasMarkdown(heading.markup, notePaths, sourcePath)}</h${heading.level}>`)
      if (heading.style === 'setext') lineIndex = heading.endLine
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
    .replace(/\[([^\]\n]+)\]\((#[^\s)]+)\)/g, '<a class="canvas-heading-anchor" href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function renderWikiLinks(source: string, notePaths: string[], sourcePath: string | null): string {
  return source.replace(
    /\[\[([^\]\n|#]*)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g,
    (_match, rawLabel: string, rawAnchor: string | undefined, rawAlias: string | undefined) => {
      const label = unescapeHtml(rawLabel).trim()
      if (!label && !rawAnchor) return _match
      const target = resolveWikiPath(label, notePaths, sourcePath)
      const text = wikiDisplayText(label, rawAnchor, rawAlias)
      if (!target) return `<span class="canvas-wiki missing">${text}</span>`
      return `<a class="canvas-wiki" href="notesproject-wiki:${encodeURIComponent(formatWikiDestination(target, rawAnchor))}">${text}</a>`
    }
  )
}

function resolveWikiPath(label: string, notePaths: string[], sourcePath: string | null = null): string | null {
  return label.trim() ? resolveWikiDocumentPath(label, notePaths, sourcePath) : sourcePath
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
