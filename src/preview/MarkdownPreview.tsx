import { ClipboardEvent, useCallback, useMemo } from 'react'
import { katex as markdownItKatex } from '@mdit/plugin-katex'
import MarkdownIt from 'markdown-it'
import { isExplicitDocumentPath, resolveWikiDocumentPath } from '../wikiPaths'

const markdownRenderer = MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false
}).use(markdownItKatex, {
  delimiters: 'all',
  mathFence: true,
  throwOnError: false,
  trust: false,
  logger: (): 'ignore' => 'ignore'
})

markdownRenderer.linkify.set({ fuzzyLink: true })

export function MarkdownPreview({
  body,
  version,
  notePaths,
  sourcePath,
  onOpenWikiLink
}: {
  body: string
  version: number
  notePaths: string[]
  sourcePath: string | null
  onOpenWikiLink: (path: string) => void
}): JSX.Element {
  const html = useMemo(() => renderMarkdownPreview(body, notePaths, sourcePath), [body, notePaths, sourcePath])
  const handleCopy = useCallback((event: ClipboardEvent<HTMLElement>) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return

    const range = selection.getRangeAt(0)
    const container = event.currentTarget
    if (
      !container.contains(range.commonAncestorContainer) &&
      !selectionContainsNodeIn(container, range)
    ) {
      return
    }

    const fragment = range.cloneContents()
    const wrapper = document.createElement('div')
    wrapper.append(fragment.cloneNode(true))
    const plain = markdownFromNode(fragment).trim()
    const rich = wrapper.innerHTML
    if (!plain && !rich) return

    event.preventDefault()
    event.clipboardData.setData('text/plain', plain || wrapper.textContent || '')
    if (rich) event.clipboardData.setData('text/html', rich)
  }, [])

  return (
    <article
      className="preview-pane"
      data-body-version={version}
      onCopy={handleCopy}
      onClick={(event) => {
        const target = event.target as HTMLElement | null
        const link = target?.closest('a.preview-wiki') as HTMLAnchorElement | null
        if (!link) return
        const href = link.getAttribute('href') ?? ''
        if (!href.startsWith('notesproject-wiki:')) return
        event.preventDefault()
        const destination = decodeURIComponent(href.slice('notesproject-wiki:'.length))
        const { path } = splitWikiDestination(destination)
        if (notePaths.includes(path) || isExplicitDocumentPath(path)) onOpenWikiLink(destination)
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function selectionContainsNodeIn(container: HTMLElement, range: Range): boolean {
  const selectedNodes = range.cloneContents().querySelectorAll?.('*') ?? []
  for (const node of selectedNodes) {
    if (container.contains(node)) return true
  }
  return false
}

function markdownFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return markdownFromChildren(node)
  }
  if (!(node instanceof HTMLElement)) return markdownFromChildren(node)

  const tag = node.tagName.toLowerCase()
  const children = markdownFromChildren(node)

  switch (tag) {
    case 'strong':
    case 'b':
      return wrapInline(children, '**')
    case 'em':
    case 'i':
      return wrapInline(children, '*')
    case 's':
    case 'del':
      return wrapInline(children, '~~')
    case 'code':
      if (node.closest('pre')) return node.textContent ?? ''
      return `\`${(node.textContent ?? '').replace(/`/g, '\\`')}\``
    case 'pre':
      return block(`\`\`\`\n${node.textContent?.replace(/\n$/, '') ?? ''}\n\`\`\``)
    case 'br':
      return '\n'
    case 'p':
      return block(children)
    case 'h1':
      return block(`# ${children.trim()}`)
    case 'h2':
      return block(`## ${children.trim()}`)
    case 'h3':
      return block(`### ${children.trim()}`)
    case 'h4':
      return block(`#### ${children.trim()}`)
    case 'h5':
      return block(`##### ${children.trim()}`)
    case 'h6':
      return block(`###### ${children.trim()}`)
    case 'blockquote':
      return block(children.trim().split('\n').map((line) => `> ${line}`).join('\n'))
    case 'li':
      return `${children.trim()}\n`
    case 'ul':
      return block(listItemsMarkdown(node, false))
    case 'ol':
      return block(listItemsMarkdown(node, true))
    case 'a': {
      const href = node.getAttribute('href') ?? ''
      const wikiMarkdown = node.dataset.wikiMarkdown
      if (wikiMarkdown) return wikiMarkdown
      const text = children.trim() || href
      if (!href || href.startsWith('notesproject-wiki:')) return text
      return `[${text}](${href})`
    }
    case 'span': {
      const wikiMarkdown = node.dataset.wikiMarkdown
      if (wikiMarkdown) return wikiMarkdown
      return children
    }
    default:
      return children
  }
}

function markdownFromChildren(node: Node): string {
  return Array.from(node.childNodes).map(markdownFromNode).join('')
}

function wrapInline(value: string, marker: string): string {
  const leading = value.match(/^\s*/)?.[0] ?? ''
  const trailing = value.match(/\s*$/)?.[0] ?? ''
  const inner = value.trim()
  if (!inner) return value
  return `${leading}${marker}${inner}${marker}${trailing}`
}

function block(value: string): string {
  const trimmed = value.trim()
  return trimmed ? `${trimmed}\n\n` : ''
}

function listItemsMarkdown(node: HTMLElement, ordered: boolean): string {
  return Array.from(node.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === 'li')
    .map((child, index) => `${ordered ? `${index + 1}.` : '-'} ${markdownFromNode(child).trim()}`)
    .join('\n')
}

export function renderMarkdownPreview(markdown: string, notePaths: string[], sourcePath: string | null = null): string {
  const snippets: string[] = []
  const prepared = preprocessPreviewMarkdown(markdown, notePaths, sourcePath, snippets)
  return markdownRenderer.render(prepared)
    .replace(/<p>@@NZHTML(\d+)@@<\/p>/g, (_match, index: string) => snippets[Number(index)] ?? '')
    .replace(/@@NZHTML(\d+)@@/g, (_match, index: string) => snippets[Number(index)] ?? '')
}

function htmlPlaceholder(html: string, snippets: string[]): string {
  const index = snippets.push(html) - 1
  return `@@NZHTML${index}@@`
}

function pushPreviewBlockHtml(out: string[], html: string, snippets: string[]): void {
  if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('')
  out.push(htmlPlaceholder(html, snippets))
  out.push('')
}

function preprocessPreviewMarkdown(markdown: string, notePaths: string[], sourcePath: string | null, snippets: string[]): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let codeFence: CodeFence | null = null

  for (const line of lines) {
    if (codeFence) {
      out.push(line)
      if (isClosingCodeFence(line, codeFence)) codeFence = null
      continue
    }

    const openingFence = parseOpeningCodeFence(line)
    if (openingFence) {
      codeFence = openingFence
      out.push(line)
      continue
    }

    const callout = line.match(/^\s*>\s*\[!([A-Za-z][A-Za-z0-9_-]*)\]\s*(.*)$/)
    if (callout) {
      const kind = escapeHtml(callout[1].toLowerCase())
      const title = escapeHtml(callout[1].toUpperCase())
      const rest = callout[2].trim()
      out.push(htmlPlaceholder(`<div class="preview-callout preview-callout-${kind}"><div class="preview-callout-title">${title}</div>`, snippets))
      if (rest) out.push(renderInlinePreviewSyntax(rest, notePaths, sourcePath, snippets))
      continue
    }

    if (/^\s*>\s*$/.test(line) && isCalloutOpenPlaceholder(out[out.length - 1], snippets)) {
      out.push(htmlPlaceholder('</div>', snippets))
      continue
    }

    out.push(renderInlinePreviewSyntax(line, notePaths, sourcePath, snippets))
  }

  const closed: string[] = []
  let calloutOpen = false
  for (const line of out) {
    if (isCalloutOpenPlaceholder(line, snippets)) {
      if (calloutOpen) closed.push(htmlPlaceholder('</div>', snippets))
      calloutOpen = true
      closed.push(line)
      continue
    }
    if (calloutOpen && line.trim() === '') {
      closed.push(htmlPlaceholder('</div>', snippets))
      calloutOpen = false
      closed.push(line)
      continue
    }
    closed.push(line)
  }
  if (calloutOpen) closed.push(htmlPlaceholder('</div>', snippets))

  return closed.join('\n')
}

type CodeFence = {
  marker: '`' | '~'
  length: number
}

function parseOpeningCodeFence(line: string): CodeFence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/)
  if (!match) return null
  return {
    marker: match[1][0] as '`' | '~',
    length: match[1].length
  }
}

function isClosingCodeFence(line: string, fence: CodeFence): boolean {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/)
  return !!match && match[1][0] === fence.marker && match[1].length >= fence.length
}

function isCalloutOpenPlaceholder(line: string | undefined, snippets: string[]): boolean {
  const match = line?.match(/^@@NZHTML(\d+)@@$/)
  if (!match) return false
  return (snippets[Number(match[1])] ?? '').startsWith('<div class="preview-callout')
}

function renderInlinePreviewSyntax(line: string, notePaths: string[], sourcePath: string | null, snippets: string[]): string {
  return mapOutsideInlineCode(line, (source) => {
    return source.replace(
      /\[\[([^\]\n|#]+)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g,
      (match: string, rawLabel: string, rawAnchor: string | undefined, rawAlias: string | undefined) => {
        const label = rawLabel.trim()
        const target = resolveWikiPath(label, notePaths, sourcePath)
        const text = wikiDisplayText(label, rawAnchor, rawAlias)
        const wikiMarkdown = escapeHtml(match)
        if (!target) return htmlPlaceholder(`<span class="preview-wiki missing" data-wiki-markdown="${wikiMarkdown}">${text}</span>`, snippets)
        return htmlPlaceholder(`<a class="preview-wiki" href="notesproject-wiki:${encodeURIComponent(formatWikiDestination(target, rawAnchor))}" data-wiki-markdown="${wikiMarkdown}">${text}</a>`, snippets)
      }
    )
  })
}

function mapOutsideInlineCode(source: string, transform: (text: string) => string): string {
  let result = ''
  let plainStart = 0
  let index = 0

  while (index < source.length) {
    if (source[index] !== '`') {
      index += 1
      continue
    }

    const markerStart = index
    while (source[index] === '`') index += 1
    const marker = source.slice(markerStart, index)
    const closingIndex = source.indexOf(marker, index)
    if (closingIndex < 0) continue

    result += transform(source.slice(plainStart, markerStart))
    const codeEnd = closingIndex + marker.length
    result += source.slice(markerStart, codeEnd)
    index = codeEnd
    plainStart = codeEnd
  }

  return result + transform(source.slice(plainStart))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function resolveWikiPath(label: string, notePaths: string[], sourcePath: string | null = null): string | null {
  return resolveWikiDocumentPath(label, notePaths, sourcePath)
}

function wikiDisplayText(label: string, rawAnchor: string | undefined, rawAlias: string | undefined): string {
  if (rawAlias?.trim()) return escapeHtml(rawAlias.trim())
  const heading = rawAnchor?.replace(/^#/, '').trim()
  return escapeHtml(heading || label)
}

function formatWikiDestination(path: string, rawAnchor: string | undefined): string {
  const heading = rawAnchor?.replace(/^#/, '').trim()
  return heading ? `${path}#${heading}` : path
}

function splitWikiDestination(destination: string): { path: string; heading: string | null } {
  const hashIndex = destination.indexOf('#')
  if (hashIndex < 0) return { path: destination, heading: null }
  const heading = destination.slice(hashIndex + 1).trim()
  return {
    path: destination.slice(0, hashIndex),
    heading: heading || null
  }
}
