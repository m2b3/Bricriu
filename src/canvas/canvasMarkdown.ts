export function renderCanvasMarkdown(source: string, notePaths: string[] = []): string {
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
      html.push(`<h${level}>${renderInlineCanvasMarkdown(heading[2], notePaths)}</h${level}>`)
      continue
    }

    const item = trimmed.match(/^[-*]\s+(.+)$/)
    if (item) {
      listItems.push(`<li>${renderInlineCanvasMarkdown(item[1], notePaths)}</li>`)
      continue
    }

    flushList()
    html.push(`<p>${renderInlineCanvasMarkdown(trimmed, notePaths)}</p>`)
  }

  flushList()
  return html.join('')
}

function renderInlineCanvasMarkdown(source: string, notePaths: string[]): string {
  return renderWikiLinks(escapeHtml(source), notePaths)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function renderWikiLinks(source: string, notePaths: string[]): string {
  return source.replace(
    /\[\[([^\]\n|#]+)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g,
    (_match, rawLabel: string, rawAnchor: string | undefined, rawAlias: string | undefined) => {
      const label = unescapeHtml(rawLabel).trim()
      const target = resolveWikiPath(label, notePaths)
      const text = wikiDisplayText(label, rawAnchor, rawAlias)
      if (!target) return `<span class="canvas-wiki missing">${text}</span>`
      return `<a class="canvas-wiki" href="notesproject-wiki:${encodeURIComponent(formatWikiDestination(target, rawAnchor))}">${text}</a>`
    }
  )
}

function resolveWikiPath(label: string, notePaths: string[]): string | null {
  const normalized = normalizeWikiLabel(label)
  if (!normalized) return null
  const exact = notePaths.find((path) => normalizeWikiLabel(path) === normalized)
  if (exact) return exact
  const withExtension = notePaths.find((path) => normalizeWikiLabel(stripMarkdownExtension(path)) === normalized)
  if (withExtension) return withExtension
  return notePaths.find((path) => normalizeWikiLabel(wikiLabel(path)) === normalized) ?? null
}

function wikiLabel(path: string): string {
  return stripMarkdownExtension(basename(path))
}

function stripMarkdownExtension(path: string): string {
  return path.replace(/\.(md|markdown)$/i, '')
}

function normalizeWikiLabel(label: string): string {
  return stripMarkdownExtension(label).replace(/\\/g, '/').trim().toLowerCase()
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

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() ?? path
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
