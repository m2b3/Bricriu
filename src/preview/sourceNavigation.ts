export type PreviewFollowRequest = { tabId: string; line: number; request: number }

type SourceBlock = { start: number; end: number }

// Nested blocks overlap (a list contains items, a quote contains paragraphs).
// Prefer the smallest matching range, then the deeper/later rendered element.
// Blank lines and non-rendered definitions fall back to the nearest block.
export function findPreviewBlock<T extends SourceBlock>(blocks: T[], line: number): T | null {
  let best: T | null = null
  let bestDistance = Infinity
  for (const block of blocks) {
    if (!Number.isFinite(block.start) || !Number.isFinite(block.end) || block.end <= block.start) continue
    const distance = line < block.start ? block.start - line : Math.max(0, line - block.end + 1)
    if (distance < bestDistance || (distance === bestDistance && best && (
      block.end - block.start < best.end - best.start
      || (block.start === best.start && block.end === best.end)
    ))) {
      best = block
      bestDistance = distance
    }
  }
  return best
}

export function scrollPreviewToLine(container: HTMLElement, line: number): void {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('[data-source-line][data-source-end]'))
    .map((element) => ({ element, start: Number(element.dataset.sourceLine), end: Number(element.dataset.sourceEnd) }))
  const target = findPreviewBlock(blocks, line)
  if (!target) return
  const viewport = container.getBoundingClientRect()
  const block = target.element.getBoundingClientRect()
  // Estimate a point inside long paragraphs/code blocks, whose rendered lines
  // can wrap differently from the source. Only scroll this preview container.
  const fraction = Math.max(0, Math.min(1, (line - target.start) / (target.end - target.start)))
  const top = container.scrollTop + block.top - viewport.top + block.height * fraction - container.clientHeight * 0.25
  container.scrollTo({ top: Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight)), behavior: 'instant' })
}
