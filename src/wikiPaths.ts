export function resolveWikiDocumentPath(
  label: string,
  notePaths: string[],
  sourcePath: string | null = null
): string | null {
  const normalized = normalizeWikiLabel(label)
  if (!normalized) return null

  const sourceRelative = resolveRelativeToExternalDocument(sourcePath, label)
  if (sourceRelative) return sourceRelative

  const exact = notePaths.find((path) => normalizeWikiLabel(path) === normalized)
  if (exact) return exact
  const withExtension = notePaths.find((path) => normalizeWikiLabel(stripMarkdownExtension(path)) === normalized)
  if (withExtension) return withExtension
  const byLabel = notePaths.find((path) => normalizeWikiLabel(wikiLabel(path)) === normalized)
  if (byLabel) return byLabel
  return isExplicitDocumentPath(label) ? label.replace(/\\/g, '/') : null
}

export function isExplicitDocumentPath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, '/')
  return isDocumentPath(normalized) && (
    normalized.startsWith('../') ||
    normalized.startsWith('./') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.includes('/')
  )
}

function resolveRelativeToExternalDocument(sourcePath: string | null, label: string): string | null {
  const source = parseAbsolutePath(sourcePath ?? '')
  if (!source || source.segments.length === 0) return null

  const rawTarget = label.trim().replace(/\\/g, '/')
  if (!rawTarget) return null
  const target = parseAbsolutePath(rawTarget)
  const root = target?.root ?? source.root
  const segments = target ? [] : source.segments.slice(0, -1)
  const targetSegments = target?.segments ?? rawTarget.split('/')

  for (const segment of targetSegments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  if (segments.length === 0) return null

  const resolved = joinAbsolutePath(root, segments)
  return isDocumentPath(resolved) ? resolved : `${resolved}.md`
}

type AbsolutePathParts = {
  root: string
  segments: string[]
}

function parseAbsolutePath(path: string): AbsolutePathParts | null {
  const normalized = path.trim().replace(/\\/g, '/')
  const drive = normalized.match(/^([A-Za-z]:)\/(.*)$/)
  if (drive) {
    return {
      root: drive[1],
      segments: drive[2].split('/').filter(Boolean)
    }
  }

  if (normalized.startsWith('//')) {
    const segments = normalized.slice(2).split('/').filter(Boolean)
    if (segments.length < 2) return null
    return {
      root: `//${segments[0]}/${segments[1]}`,
      segments: segments.slice(2)
    }
  }

  if (normalized.startsWith('/')) {
    return {
      root: '',
      segments: normalized.slice(1).split('/').filter(Boolean)
    }
  }

  return null
}

function joinAbsolutePath(root: string, segments: string[]): string {
  if (!root) return `/${segments.join('/')}`
  return `${root}/${segments.join('/')}`
}

function normalizeWikiLabel(label: string): string {
  return stripMarkdownExtension(label).replace(/\\/g, '/').trim().toLowerCase()
}

function wikiLabel(path: string): string {
  return stripMarkdownExtension(basename(path))
}

function stripMarkdownExtension(path: string): string {
  return path.replace(/\.(md|markdown)$/i, '')
}

function isDocumentPath(path: string): boolean {
  return /\.(md|markdown|typ)$/i.test(path)
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() ?? path
}
