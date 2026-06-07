import { useEffect, useMemo, useState } from 'react'
import type { CanvasNodeSpec, CanvasShape } from './canvasBlock'

const colors = ['neutral', 'yellow', 'blue', 'green', 'red']

type InspectorDraft = {
  id: string
  x: string
  y: string
  w: string
  h: string
  shape: CanvasShape
  color: string
}

export function CanvasInspector({
  node,
  existingIds,
  onApply
}: {
  node: CanvasNodeSpec | null
  existingIds: string[]
  onApply: (id: string, updates: Partial<CanvasNodeSpec>) => void
}): JSX.Element {
  const [draft, setDraft] = useState<InspectorDraft | null>(null)

  useEffect(() => {
    if (!node) {
      setDraft(null)
      return
    }
    setDraft({
      id: node.id,
      x: String(node.x),
      y: String(node.y),
      w: String(node.w ?? 220),
      h: String(node.h ?? 120),
      shape: node.shape ?? 'box',
      color: node.color ?? 'neutral'
    })
  }, [node])

  const duplicateId = useMemo(() => {
    if (!node || !draft) return false
    return draft.id !== node.id && existingIds.includes(draft.id)
  }, [draft, existingIds, node])

  if (!node || !draft) {
    return <></>
  }

  const apply = () => {
    if (duplicateId) return
    onApply(node.id, {
      id: draft.id.trim() || node.id,
      x: numberOr(node.x, draft.x),
      y: numberOr(node.y, draft.y),
      w: numberOr(node.w ?? 220, draft.w),
      h: numberOr(node.h ?? 120, draft.h),
      shape: draft.shape,
      color: draft.color === 'neutral' ? undefined : draft.color
    })
  }
  const applyOnEnter = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    apply()
  }

  return (
    <aside className="canvas-inspector">
      <div className="canvas-inspector-header">
        <strong>Inspector</strong>
        <button type="button" onClick={apply} disabled={duplicateId}>
          Apply
        </button>
      </div>
      <label>
        <span>ID</span>
        <input
          value={draft.id}
          onChange={(event) => setDraft({ ...draft, id: event.target.value })}
          onKeyDown={applyOnEnter}
          spellCheck={false}
        />
      </label>
      {duplicateId && <span className="canvas-inspector-error">ID already exists.</span>}
      <div className="canvas-inspector-grid">
        <label>
          <span>X</span>
          <input value={draft.x} onChange={(event) => setDraft({ ...draft, x: event.target.value })} onKeyDown={applyOnEnter} />
        </label>
        <label>
          <span>Y</span>
          <input value={draft.y} onChange={(event) => setDraft({ ...draft, y: event.target.value })} onKeyDown={applyOnEnter} />
        </label>
        <label>
          <span>W</span>
          <input value={draft.w} onChange={(event) => setDraft({ ...draft, w: event.target.value })} onKeyDown={applyOnEnter} />
        </label>
        <label>
          <span>H</span>
          <input value={draft.h} onChange={(event) => setDraft({ ...draft, h: event.target.value })} onKeyDown={applyOnEnter} />
        </label>
      </div>
      <label>
        <span>Shape</span>
        <select value={draft.shape} onChange={(event) => setDraft({ ...draft, shape: event.target.value as CanvasShape })}>
          <option value="bubble">Bubble</option>
          <option value="box">Box</option>
        </select>
      </label>
      <label>
        <span>Color</span>
        <select value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })}>
          {colors.map((color) => (
            <option key={color} value={color}>{color}</option>
          ))}
        </select>
      </label>
    </aside>
  )
}

function numberOr(fallback: number, value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
