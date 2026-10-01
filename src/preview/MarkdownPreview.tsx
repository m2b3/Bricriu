import { ClipboardEvent, useCallback, useEffect, useMemo, useRef } from 'react'
import { katex as markdownItKatex } from '@mdit/plugin-katex'
import MarkdownIt from 'markdown-it'
import { escapeColorSpanText, findColorSpans, type ColorMarkupSpan } from '../markdown/colorMarkup'
import { collectMarkdownHeadings, uniqueHeadingSlug } from '../markdown/headings'
import { isExplicitDocumentPath, resolveWikiDocumentPath } from '../wikiPaths'
import { scrollPreviewToLine, type PreviewFollowRequest } from './sourceNavigation'

type PreviewEnvironment = {
  headingAnchorsByLine: Record<number, string>
  sourceLines: number[]
}

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

markdownRenderer.core.ruler.after('inline', 'heading_anchors', (state) => {
  const { headingAnchorsByLine: anchorsByLine, sourceLines } = state.env as PreviewEnvironment
  const usedSlugs = new Set<string>()

  for (let index = 0; index < state.tokens.length; index += 1) {
    const token = state.tokens[index]
    if (token.type !== 'heading_open') continue
    const preferredSlug = token.map ? anchorsByLine[sourceLines[token.map[0]]] : undefined
    const inlineText = state.tokens[index + 1]?.type === 'inline' ? state.tokens[index + 1].content : 'section'
    let slug = preferredSlug
    if (!slug || usedSlugs.has(slug)) slug = uniqueHeadingSlug(slug || inlineText, usedSlugs)
    else usedSlugs.add(slug)
    token.attrSet('id', slug)
  }
})

markdownRenderer.core.ruler.after('heading_anchors', 'preview_source_lines', (state) => {
  const { sourceLines } = state.env as PreviewEnvironment
  for (const token of state.tokens) {
    if (!token.block || !token.map || token.hidden || token.type === 'inline') continue
    token.attrSet('data-source-line', String(sourceLines[token.map[0]]))
    token.attrSet('data-source-end', String(sourceLines[token.map[1] - 1] + 1))
  }
})

// These rules render their own outer HTML instead of using renderToken, which
// would ordinarily carry our source attributes onto the rendered block.
for (const name of ['fence', 'code_block', 'math_block']) {
  const render = markdownRenderer.renderer.rules[name]
  if (!render) continue
  markdownRenderer.renderer.rules[name] = (tokens, index, options, env, renderer) => {
    const html = render(tokens, index, options, env, renderer)
    const token = tokens[index]
    const start = token.attrGet('data-source-line')
    const end = token.attrGet('data-source-end')
    return start === null || end === null ? html : html.replace(/^(\s*<[a-z][\w-]*)([^>]*>)/i,
      (opening, tag: string, attributes: string) => attributes.includes('data-source-line=') ? opening
        : `${tag} data-source-line="${start}" data-source-end="${end}"${attributes}`)
  }
}

export function MarkdownPreview({
  body,
  version,
  notePaths,
  sourcePath,
  followRequest,
  onOpenWikiLink
}: {
  body: string
  version: number
  notePaths: string[]
  sourcePath: string | null
  followRequest?: PreviewFollowRequest | null
  onOpenWikiLink: (path: string) => void
}): JSX.Element {
  const containerRef = useRef<HTMLElement | null>(null)
  const html = useMemo(() => renderMarkdownPreview(body, notePaths, sourcePath), [body, notePaths, sourcePath])
  useEffect(() => {
    if (!followRequest) return
    let cancelled = false
    // Font loading can change wrapping on the first preview. Measure only
    // after the fonts settle, and discard requests superseded by another click.
    void document.fonts.ready.then(() => {
      if (!cancelled && containerRef.current) scrollPreviewToLine(containerRef.current, followRequest.line)
    })
    return () => { cancelled = true }
  }, [followRequest])
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
      ref={containerRef}
      className="preview-pane markdown-preview"
      data-body-version={version}
      onCopy={handleCopy}
      onClick={(event) => {
        const target = event.target as HTMLElement | null
        const headingAnchor = target?.closest('a[href^="#"]') as HTMLAnchorElement | null
        if (headingAnchor) {
          const headingId = decodeFragment(headingAnchor.getAttribute('href')?.slice(1) ?? '')
          const heading = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[id]'))
            .find((element) => element.id === headingId)
          if (heading) {
            event.preventDefault()
            heading.scrollIntoView({ block: 'start' })
          }
          return
        }
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
      const markdownColor = node.dataset.markdownColor
      if (markdownColor) return `{color:${markdownColor}|${escapeColorSpanText(children)}}`
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
  const headingAnchorsByLine = Object.fromEntries(
    collectMarkdownHeadings(markdown).map((heading) => [heading.line, heading.slug])
  )
  return markdownRenderer.render(prepared.markdown, { headingAnchorsByLine, sourceLines: prepared.sourceLines })
    .replace(/<p([^>]*)>@@NZHTML(\d+)@@<\/p>/g, (_match, attributes: string, index: string) => {
      const snippet = snippets[Number(index)] ?? ''
      // Standalone callout/wiki placeholders replace the paragraph; preserve
      // its source location on the snippet's opening element.
      return snippet.replace(/^(<[a-z][\w-]*)([^>]*>)/i,
        (opening, tag: string, existing: string) => existing.includes('data-source-line=') ? opening : `${tag}${attributes}${existing}`)
    })
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

function preprocessPreviewMarkdown(markdown: string, notePaths: string[], sourcePath: string | null, snippets: string[]): { markdown: string; sourceLines: number[] } {
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
  const lines = normalizedMarkdown.split('\n')
  const colorSpans = findColorSpans(normalizedMarkdown)
  const suppressedColorSpanStarts = new Set<number>()
  const out: Array<{ text: string; line: number }> = []
  let codeFence: CodeFence | null = null
  let lineStart = 0

  for (const [sourceLine, line] of lines.entries()) {
    const push = (text: string) => out.push({ text, line: sourceLine })
    if (codeFence) {
      suppressColorSpansStartingOnLine(lineStart, line.length, colorSpans, suppressedColorSpanStarts)
      push(line)
      if (isClosingCodeFence(line, codeFence)) codeFence = null
      lineStart += line.length + 1
      continue
    }

    const openingFence = parseOpeningCodeFence(line)
    if (openingFence) {
      codeFence = openingFence
      suppressColorSpansStartingOnLine(lineStart, line.length, colorSpans, suppressedColorSpanStarts)
      push(line)
      lineStart += line.length + 1
      continue
    }

    suppressInlineCodeColorSpans(line, lineStart, colorSpans, suppressedColorSpanStarts)
    const renderedLine = renderColorMarkupOnLine(line, lineStart, colorSpans, suppressedColorSpanStarts, snippets)
    const callout = renderedLine.match(/^\s*>\s*\[!([A-Za-z][A-Za-z0-9_-]*)\]\s*(.*)$/)
    if (callout) {
      const kind = escapeHtml(callout[1].toLowerCase())
      const title = escapeHtml(callout[1].toUpperCase())
      const rest = callout[2].trim()
      push(htmlPlaceholder(`<div class="preview-callout preview-callout-${kind}" data-source-line="${sourceLine}" data-source-end="${sourceLine + 1}"><div class="preview-callout-title">${title}</div>`, snippets))
      if (rest) push(renderInlinePreviewSyntax(rest, notePaths, sourcePath, snippets))
      lineStart += line.length + 1
      continue
    }

    if (/^\s*>\s*$/.test(renderedLine) && isCalloutOpenPlaceholder(out[out.length - 1]?.text, snippets)) {
      push(htmlPlaceholder('</div>', snippets))
      lineStart += line.length + 1
      continue
    }

    push(renderInlinePreviewSyntax(renderedLine, notePaths, sourcePath, snippets))
    lineStart += line.length + 1
  }

  const closed: typeof out = []
  let calloutOpen = false
  for (const line of out) {
    if (isCalloutOpenPlaceholder(line.text, snippets)) {
      if (calloutOpen) closed.push({ text: htmlPlaceholder('</div>', snippets), line: line.line })
      calloutOpen = true
      closed.push(line)
      continue
    }
    if (calloutOpen && line.text.trim() === '') {
      closed.push({ text: htmlPlaceholder('</div>', snippets), line: line.line })
      calloutOpen = false
      closed.push(line)
      continue
    }
    closed.push(line)
  }
  if (calloutOpen) closed.push({ text: htmlPlaceholder('</div>', snippets), line: lines.length - 1 })

  return { markdown: closed.map(({ text }) => text).join('\n'), sourceLines: closed.map(({ line }) => line) }
}

function renderColorMarkupOnLine(
  line: string,
  lineStart: number,
  spans: ColorMarkupSpan[],
  suppressedSpanStarts: Set<number>,
  snippets: string[]
): string {
  const lineEnd = lineStart + line.length
  const relevantSpans = spans.filter((span) => (
    !suppressedSpanStarts.has(span.from) && span.from < lineEnd && span.to > lineStart
  ))
  if (relevantSpans.length === 0) return line

  const removed = new Set<number>()
  const insertions = new Map<number, string[]>()
  const removeRange = (from: number, to: number) => {
    for (let index = Math.max(0, from); index < Math.min(line.length, to); index += 1) removed.add(index)
  }
  const insertAt = (position: number, value: string) => {
    const values = insertions.get(position) ?? []
    values.push(value)
    insertions.set(position, values)
  }

  for (const span of relevantSpans) {
    removeRange(span.from - lineStart, span.textFrom - lineStart)
    removeRange(span.textTo - lineStart, span.to - lineStart)

    const contentFrom = Math.max(0, span.textFrom - lineStart)
    const contentTo = Math.min(line.length, span.textTo - lineStart)
    if (contentFrom >= contentTo) continue

    const selectedText = line.slice(contentFrom, contentTo)
    const blockPrefixLength = contentFrom === 0 ? markdownBlockPrefixLength(selectedText) : 0
    const color = escapeHtml(span.color)
    insertAt(
      contentFrom + blockPrefixLength,
      htmlPlaceholder(`<span class="preview-color" style="color: ${color}" data-markdown-color="${color}">`, snippets)
    )
    insertAt(contentTo, htmlPlaceholder('</span>', snippets))
  }

  let rendered = ''
  for (let index = 0; index <= line.length; index += 1) {
    rendered += (insertions.get(index) ?? []).join('')
    if (index < line.length && !removed.has(index)) rendered += line[index]
  }
  return rendered
}

function suppressColorSpansStartingOnLine(
  lineStart: number,
  lineLength: number,
  spans: ColorMarkupSpan[],
  suppressedSpanStarts: Set<number>
): void {
  const lineEnd = lineStart + lineLength
  for (const span of spans) {
    if (span.from >= lineStart && span.from < lineEnd) suppressedSpanStarts.add(span.from)
  }
}

function suppressInlineCodeColorSpans(
  line: string,
  lineStart: number,
  spans: ColorMarkupSpan[],
  suppressedSpanStarts: Set<number>
): void {
  const lineEnd = lineStart + line.length
  const startingSpans = spans.filter((span) => span.from >= lineStart && span.from < lineEnd)
  if (startingSpans.length === 0) return

  let index = 0
  while (index < line.length) {
    if (line[index] !== '`') {
      index += 1
      continue
    }

    const markerStart = index
    while (line[index] === '`') index += 1
    const marker = line.slice(markerStart, index)
    const closingIndex = line.indexOf(marker, index)
    if (closingIndex < 0) continue
    const codeEnd = closingIndex + marker.length

    for (const span of startingSpans) {
      const localStart = span.from - lineStart
      if (localStart >= markerStart && localStart < codeEnd) suppressedSpanStarts.add(span.from)
    }
    index = codeEnd
  }
}

function markdownBlockPrefixLength(source: string): number {
  let offset = source.match(/^ {0,3}/)?.[0].length ?? 0

  while (true) {
    const quote = source.slice(offset).match(/^>\s?/)?.[0]
    if (!quote) break
    offset += quote.length
  }

  const callout = source.slice(offset).match(/^\[![A-Za-z][A-Za-z0-9_-]*\]\s*/)?.[0]
  if (callout) offset += callout.length

  const list = source.slice(offset).match(/^(?:[-+*]|\d+[.)])\s+/)?.[0]
  if (list) offset += list.length

  const heading = source.slice(offset).match(/^#{1,6}\s+/)?.[0]
  if (heading) offset += heading.length

  return offset
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
      /\[\[([^\]\n|#]*)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g,
      (match: string, rawLabel: string, rawAnchor: string | undefined, rawAlias: string | undefined) => {
        const label = rawLabel.trim()
        if (!label && !rawAnchor) return match
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
  return label.trim() ? resolveWikiDocumentPath(label, notePaths, sourcePath) : sourcePath
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

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}
