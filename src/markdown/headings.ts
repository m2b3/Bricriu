export type MarkdownHeading = {
  text: string
  markup: string
  level: number
  line: number
  endLine: number
  offset: number
  slug: string
  searchText: string
  style: 'atx' | 'setext'
}

type SourceLine = {
  text: string
  offset: number
}

type CodeFence = {
  marker: '`' | '~'
  length: number
}

export function collectMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const lines = sourceLines(markdown)
  const headings: MarkdownHeading[] = []
  const usedSlugs = new Set<string>()
  let codeFence: CodeFence | null = null
  let paragraphStart: number | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (codeFence) {
      if (isClosingCodeFence(line.text, codeFence)) codeFence = null
      paragraphStart = null
      continue
    }

    const openingFence = parseOpeningCodeFence(line.text)
    if (openingFence) {
      codeFence = openingFence
      paragraphStart = null
      continue
    }

    const atx = parseAtxHeading(line.text)
    if (atx) {
      addHeading(headings, usedSlugs, {
        ...atx,
        line: index,
        endLine: index,
        offset: line.offset + atx.column,
        style: 'atx'
      })
      paragraphStart = null
      continue
    }

    const underline = parseSetextUnderline(line.text)
    if (underline && paragraphStart != null) {
      const firstLine = lines[paragraphStart]
      const setextMarkup = lines
        .slice(paragraphStart, index)
        .map((paragraphLine) => paragraphLine.text.trim())
        .join('\n')
      addHeading(headings, usedSlugs, {
        markup: setextMarkup,
        level: underline,
        line: paragraphStart,
        endLine: index,
        offset: firstLine.offset + firstLine.text.search(/\S|$/),
        column: firstLine.text.search(/\S|$/),
        style: 'setext'
      })
      paragraphStart = null
      continue
    }

    if (!isParagraphTextLine(line.text)) paragraphStart = null
    else if (paragraphStart == null) paragraphStart = index
  }

  return headings
}

export function findHeadingOffset(markdown: string, target: string): number | null {
  const normalizedTarget = decodeHeadingTarget(target)
  const headings = collectMarkdownHeadings(markdown)
  const slugMatch = headings.find((heading) => heading.slug === normalizedTarget.toLowerCase())
  if (slugMatch) return slugMatch.offset

  const targetKey = normalizeHeadingKey(normalizedTarget)
  return headings.find((heading) => normalizeHeadingKey(heading.text) === targetKey)?.offset ?? null
}

export function slugifyHeading(value: string): string {
  return normalizeHeadingKey(value)
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
}

export function uniqueHeadingSlug(value: string, usedSlugs: Set<string>): string {
  const base = slugifyHeading(value) || 'section'
  let slug = base
  let suffix = 1
  while (usedSlugs.has(slug)) {
    slug = `${base}-${suffix}`
    suffix += 1
  }
  usedSlugs.add(slug)
  return slug
}

export function stripMarkdownInlineSyntax(value: string): string {
  return value
    .replace(/\\([\\`*_[\]#])/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[\[([^\]\n|#]*)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g, (_match, label: string, anchor: string | undefined, alias: string | undefined) => (
      alias?.trim() || anchor?.slice(1).trim() || label.trim()
    ))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_~]+/g, '')
    .trim()
}

function addHeading(
  headings: MarkdownHeading[],
  usedSlugs: Set<string>,
  heading: {
    markup: string
    level: number
    line: number
    endLine: number
    offset: number
    column: number
    style: 'atx' | 'setext'
  }
): void {
  const text = stripMarkdownInlineSyntax(heading.markup).replace(/\s+/g, ' ')
  if (!text) return
  const slug = uniqueHeadingSlug(text, usedSlugs)
  headings.push({
    text,
    markup: heading.markup,
    level: heading.level,
    line: heading.line,
    endLine: heading.endLine,
    offset: heading.offset,
    slug,
    searchText: `${text} ${slug}`.toLowerCase(),
    style: heading.style
  })
}

function parseAtxHeading(line: string): { markup: string; level: number; column: number } | null {
  const match = line.match(/^( {0,3})(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/)
  if (!match) return null
  const markup = (match[3] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim()
  if (!markup) return null
  return {
    markup,
    level: match[2].length,
    column: match[1].length
  }
}

function parseSetextUnderline(line: string): 1 | 2 | null {
  const match = line.match(/^ {0,3}(=+|-+)[ \t]*$/)
  if (!match) return null
  return match[1][0] === '=' ? 1 : 2
}

function isParagraphTextLine(line: string): boolean {
  if (!line.trim()) return false
  return !/^(?: {4,}| {0,3}(?:>|[-+*][ \t]+|\d{1,9}[.)][ \t]+))/.test(line)
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
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/)
  return !!match && match[1][0] === fence.marker && match[1].length >= fence.length
}

function normalizeHeadingKey(value: string): string {
  return stripMarkdownInlineSyntax(value)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function decodeHeadingTarget(value: string): string {
  const target = value.replace(/^#/, '').trim()
  try {
    return decodeURIComponent(target)
  } catch {
    return target
  }
}

function sourceLines(markdown: string): SourceLine[] {
  const lines: SourceLine[] = []
  const linePattern = /([^\r\n]*)(\r\n|\r|\n|$)/g
  let match: RegExpExecArray | null
  let offset = 0

  while ((match = linePattern.exec(markdown))) {
    lines.push({ text: match[1], offset })
    offset += match[1].length + match[2].length
    if (!match[2]) break
  }

  return lines
}
