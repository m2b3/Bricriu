import { useMemo } from 'react'
import katex from 'katex'
import MarkdownIt from 'markdown-it'
import 'katex/dist/katex.min.css'

const markdownRenderer = MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false
})

export function MarkdownPreview({
  body,
  version,
  notePaths,
  onOpenWikiLink
}: {
  body: string
  version: number
  notePaths: string[]
  onOpenWikiLink: (path: string) => void
}): JSX.Element {
  const html = useMemo(() => renderMarkdownPreview(body, notePaths), [body, notePaths])
  return (
    <article
      className="preview-pane"
      data-body-version={version}
      onClick={(event) => {
        const target = event.target as HTMLElement | null
        const link = target?.closest('a.preview-wiki') as HTMLAnchorElement | null
        if (!link) return
        const href = link.getAttribute('href') ?? ''
        if (!href.startsWith('notesproject-wiki:')) return
        event.preventDefault()
        const destination = decodeURIComponent(href.slice('notesproject-wiki:'.length))
        const { path } = splitWikiDestination(destination)
        if (notePaths.includes(path)) onOpenWikiLink(destination)
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function renderMarkdownPreview(markdown: string, notePaths: string[]): string {
  const snippets: string[] = []
  const prepared = preprocessPreviewMarkdown(markdown, notePaths, snippets)
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

function preprocessPreviewMarkdown(markdown: string, notePaths: string[], snippets: string[]): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inDisplayMath = false
  let displayMath: string[] = []

  for (const line of lines) {
    if (line.trim() === '$$') {
      if (inDisplayMath) {
        pushPreviewBlockHtml(out, renderDisplayMath(displayMath.join('\n')), snippets)
        displayMath = []
        inDisplayMath = false
      } else {
        inDisplayMath = true
      }
      continue
    }

    if (inDisplayMath) {
      displayMath.push(line)
      continue
    }

    const callout = line.match(/^\s*>\s*\[!([A-Za-z][A-Za-z0-9_-]*)\]\s*(.*)$/)
    if (callout) {
      const kind = escapeHtml(callout[1].toLowerCase())
      const title = escapeHtml(callout[1].toUpperCase())
      const rest = callout[2].trim()
      out.push(htmlPlaceholder(`<div class="preview-callout preview-callout-${kind}"><div class="preview-callout-title">${title}</div>`, snippets))
      if (rest) out.push(renderInlinePreviewSyntax(rest, notePaths, snippets))
      continue
    }

    if (/^\s*>\s*$/.test(line) && isCalloutOpenPlaceholder(out[out.length - 1], snippets)) {
      out.push(htmlPlaceholder('</div>', snippets))
      continue
    }

    out.push(renderInlinePreviewSyntax(line, notePaths, snippets))
  }

  if (inDisplayMath) {
    out.push('$$')
    out.push(...displayMath)
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

function isCalloutOpenPlaceholder(line: string | undefined, snippets: string[]): boolean {
  const match = line?.match(/^@@NZHTML(\d+)@@$/)
  if (!match) return false
  return (snippets[Number(match[1])] ?? '').startsWith('<div class="preview-callout')
}

function renderInlinePreviewSyntax(line: string, notePaths: string[], snippets: string[]): string {
  const withWiki = line.replace(
    /\[\[([^\]\n|#]+)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g,
    (_match, rawLabel: string, rawAnchor: string | undefined, rawAlias: string | undefined) => {
      const label = rawLabel.trim()
      const target = resolveWikiPath(label, notePaths)
      const text = wikiDisplayText(label, rawAnchor, rawAlias)
      if (!target) return htmlPlaceholder(`<span class="preview-wiki missing">${text}</span>`, snippets)
      return htmlPlaceholder(`<a class="preview-wiki" href="notesproject-wiki:${encodeURIComponent(formatWikiDestination(target, rawAnchor))}">${text}</a>`, snippets)
    }
  )

  return withWiki.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (_match, before: string, source: string) => {
    return `${before}${htmlPlaceholder(renderInlineMath(source.trim()), snippets)}`
  })
}

function renderInlineMath(source: string): string {
  return katex.renderToString(source, {
    displayMode: false,
    throwOnError: false,
    strict: false,
    trust: false
  })
}

function renderDisplayMath(source: string): string {
  return `<div class="preview-math-block">${katex.renderToString(source.trim(), {
    displayMode: true,
    throwOnError: false,
    strict: false,
    trust: false
  })}</div>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() ?? path
}
