export function renderCanvasMarkdown(source: string): string {
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
      html.push(`<h${level}>${renderInlineCanvasMarkdown(heading[2])}</h${level}>`)
      continue
    }

    const item = trimmed.match(/^[-*]\s+(.+)$/)
    if (item) {
      listItems.push(`<li>${renderInlineCanvasMarkdown(item[1])}</li>`)
      continue
    }

    flushList()
    html.push(`<p>${renderInlineCanvasMarkdown(trimmed)}</p>`)
  }

  flushList()
  return html.join('')
}

function renderInlineCanvasMarkdown(source: string): string {
  return escapeHtml(source)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
