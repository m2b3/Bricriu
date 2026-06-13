import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'

export type CalendarEvent = {
  id: string
  date: string
  title: string
  time: string
  notes: string
}

const CALENDAR_EDITOR_WIDTH_KEY = 'notesproject:calendar-editor-width'
const CALENDAR_EDITOR_MIN_WIDTH = 260
const CALENDAR_EDITOR_MAX_WIDTH = 560

export function CalendarView({
  events,
  saving,
  onSaveEvents
}: {
  events: CalendarEvent[]
  saving: boolean
  onSaveEvents: (events: CalendarEvent[]) => void
}): JSX.Element {
  const [draft, setDraft] = useState<CalendarEvent | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayIsoDate())
  const [editorWidth, setEditorWidth] = useState(readStoredCalendarEditorWidth)
  const workspaceRef = useRef<HTMLDivElement | null>(null)

  const calendarItems = useMemo<EventInput[]>(
    () => events.map((event) => ({
      id: event.id,
      title: event.title,
      date: event.date,
      allDay: true,
      extendedProps: {
        time: event.time,
        notes: event.notes
      }
    })),
    [events]
  )

  const selectedDateEvents = useMemo(
    () => events.filter((event) => event.date === selectedDate).sort(compareCalendarEvents),
    [events, selectedDate]
  )

  const resizeEditorTo = useCallback((clientX: number) => {
    const bounds = workspaceRef.current?.getBoundingClientRect()
    if (!bounds) return
    const nextWidth = clamp(
      bounds.right - clientX,
      CALENDAR_EDITOR_MIN_WIDTH,
      Math.min(CALENDAR_EDITOR_MAX_WIDTH, Math.max(CALENDAR_EDITOR_MIN_WIDTH, bounds.width - 360))
    )
    setEditorWidth(nextWidth)
    writeStoredCalendarEditorWidth(nextWidth)
  }, [])

  const openDate = useCallback((date: string) => {
    setSelectedDate(date)
    setDraft(createBlankCalendarEvent(date))
  }, [])

  const openEvent = useCallback((id: string) => {
    const event = events.find((candidate) => candidate.id === id)
    if (!event) return
    setSelectedDate(event.date)
    setDraft({ ...event })
  }, [events])

  const saveDraft = useCallback(() => {
    if (!draft) return
    const normalized = normalizeCalendarEvent(draft)
    if (!normalized.title) return
    const exists = events.some((event) => event.id === normalized.id)
    const next = exists
      ? events.map((event) => (event.id === normalized.id ? normalized : event))
      : [...events, normalized]
    setSelectedDate(normalized.date)
    setDraft({ ...normalized })
    onSaveEvents(next)
  }, [draft, events, onSaveEvents])

  const deleteDraft = useCallback(() => {
    if (!draft) return
    onSaveEvents(events.filter((event) => event.id !== draft.id))
    setDraft(null)
  }, [draft, events, onSaveEvents])

  return (
    <div
      ref={workspaceRef}
      className="calendar-workspace"
      style={{ '--calendar-editor-width': `${editorWidth}px` } as CSSProperties}
    >
      <section className="calendar-main">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: ''
          }}
          height="100%"
          dayMaxEvents={3}
          events={calendarItems}
          dateClick={(arg: DateClickArg) => openDate(arg.dateStr)}
          eventClick={(arg: EventClickArg) => {
            arg.jsEvent.preventDefault()
            openEvent(arg.event.id)
          }}
          eventContent={(arg) => (
            <span className="calendar-event-chip">
              {typeof arg.event.extendedProps.time === 'string' && arg.event.extendedProps.time && (
                <span className="calendar-event-time">{arg.event.extendedProps.time}</span>
              )}
              <span>{arg.event.title}</span>
            </span>
          )}
        />
      </section>
      <div
        className="calendar-resizer"
        role="separator"
        aria-label="Resize calendar event panel"
        aria-orientation="vertical"
        aria-valuemin={CALENDAR_EDITOR_MIN_WIDTH}
        aria-valuemax={CALENDAR_EDITOR_MAX_WIDTH}
        aria-valuenow={editorWidth}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          document.body.classList.add('is-resizing-calendar')
          resizeEditorTo(event.clientX)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          resizeEditorTo(event.clientX)
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          document.body.classList.remove('is-resizing-calendar')
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          document.body.classList.remove('is-resizing-calendar')
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 40 : 16
          let nextWidth: number | null = null
          if (event.key === 'ArrowLeft') nextWidth = editorWidth + step
          if (event.key === 'ArrowRight') nextWidth = editorWidth - step
          if (event.key === 'Home') nextWidth = CALENDAR_EDITOR_MIN_WIDTH
          if (event.key === 'End') nextWidth = CALENDAR_EDITOR_MAX_WIDTH
          if (nextWidth == null) return
          event.preventDefault()
          const clamped = clamp(nextWidth, CALENDAR_EDITOR_MIN_WIDTH, CALENDAR_EDITOR_MAX_WIDTH)
          setEditorWidth(clamped)
          writeStoredCalendarEditorWidth(clamped)
        }}
      />
      <aside className="calendar-editor">
        <header className="calendar-editor-header">
          <strong>{formatCalendarDate(selectedDate)}</strong>
          <button type="button" onClick={() => openDate(selectedDate)}>
            Add event
          </button>
        </header>
        <div className="calendar-day-events">
          {selectedDateEvents.length === 0 ? (
            <div className="empty-list">No events</div>
          ) : (
            selectedDateEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className={draft?.id === event.id ? 'calendar-day-event active' : 'calendar-day-event'}
                onClick={() => openEvent(event.id)}
              >
                <span>{event.time || 'All day'}</span>
                <strong>{event.title}</strong>
              </button>
            ))
          )}
        </div>
        {draft ? (
          <form
            className="calendar-form"
            onSubmit={(event) => {
              event.preventDefault()
              saveDraft()
            }}
          >
            <label>
              <span>Title</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Event title"
              />
            </label>
            <div className="calendar-form-row">
              <label>
                <span>Date</span>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => {
                    const nextDate = event.target.value || todayIsoDate()
                    setSelectedDate(nextDate)
                    setDraft({ ...draft, date: nextDate })
                  }}
                />
              </label>
              <label>
                <span>Time</span>
                <input
                  type="time"
                  value={draft.time}
                  onChange={(event) => setDraft({ ...draft, time: event.target.value })}
                />
              </label>
            </div>
            <label>
              <span>Notes</span>
              <textarea
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                placeholder="Optional notes"
              />
            </label>
            <div className="calendar-form-actions">
              <button type="submit" disabled={!draft.title.trim() || saving}>
                Save
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
              {events.some((event) => event.id === draft.id) && (
                <button
                  type="button"
                  className="secondary-button danger-button"
                  onClick={deleteDraft}
                  disabled={saving}
                >
                  Delete
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="calendar-editor-empty">Select a day or event.</div>
        )}
      </aside>
    </div>
  )
}

function normalizeCalendarEvent(event: CalendarEvent): CalendarEvent {
  return {
    id: event.id || createCalendarEventId(),
    date: isIsoDate(event.date) ? event.date : todayIsoDate(),
    title: event.title.trim(),
    time: isTimeValue(event.time) ? event.time : '',
    notes: event.notes ?? ''
  }
}

function createBlankCalendarEvent(date: string): CalendarEvent {
  return {
    id: createCalendarEventId(),
    date: isIsoDate(date) ? date : todayIsoDate(),
    title: '',
    time: '',
    notes: ''
  }
}

function compareCalendarEvents(left: CalendarEvent, right: CalendarEvent): number {
  return (
    left.date.localeCompare(right.date) ||
    (left.time || '99:99').localeCompare(right.time || '99:99') ||
    left.title.localeCompare(right.title)
  )
}

function createCalendarEventId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `evt_${random}`
}

function todayIsoDate(): string {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isTimeValue(value: string): boolean {
  return value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function formatCalendarDate(date: string): string {
  if (!isIsoDate(date)) return date
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(year, month - 1, day))
}

function readStoredCalendarEditorWidth(): number {
  try {
    const raw = localStorage.getItem(CALENDAR_EDITOR_WIDTH_KEY)
    if (!raw) return 320
    return clamp(Number(raw), CALENDAR_EDITOR_MIN_WIDTH, CALENDAR_EDITOR_MAX_WIDTH)
  } catch {
    return 320
  }
}

function writeStoredCalendarEditorWidth(width: number): void {
  try {
    localStorage.setItem(CALENDAR_EDITOR_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // Ignore storage failures; the in-memory width still applies.
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}
