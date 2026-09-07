export type ColorMarkupSpan = {
  from: number
  to: number
  colorFrom: number
  colorTo: number
  textFrom: number
  textTo: number
  color: string
}

export function findColorSpans(text: string): ColorMarkupSpan[] {
  const spans: ColorMarkupSpan[] = []
  const trigger = '{color:'
  let index = 0

  while (index < text.length) {
    const start = text.indexOf(trigger, index)
    if (start < 0) break
    if (isEscaped(text, start)) {
      index = start + trigger.length
      continue
    }

    const colorFrom = start + trigger.length
    const separator = findNextUnescaped(text, '|', colorFrom)
    if (separator < 0) break

    const rawColor = text.slice(colorFrom, separator).trim()
    if (!isSafeEditorColor(rawColor)) {
      index = start + trigger.length
      continue
    }

    const end = findNextUnescaped(text, '}', separator + 1)
    if (end < 0) break
    spans.push({
      from: start,
      to: end + 1,
      colorFrom,
      colorTo: separator,
      textFrom: separator + 1,
      textTo: end,
      color: rawColor
    })
    index = end + 1
  }

  return spans
}

export function isSafeEditorColor(color: string): boolean {
  if (!color || color.length > 80 || /[;"'{}<>]/.test(color)) return false
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', color)
  }
  return /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([^)]+\)|hsla?\([^)]+\))$/i.test(color)
}

export function escapeColorSpanText(text: string): string {
  return text.replace(/([\\}])/g, '\\$1')
}

function findNextUnescaped(text: string, needle: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1
      continue
    }
    if (text[index] === needle) return index
  }
  return -1
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}
