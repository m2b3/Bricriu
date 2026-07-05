import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'

export type CalendarRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'

export type CalendarEvent = {
  id: string
  date: string
  title: string
  time: string
  notes: string
  recurrence: CalendarRecurrence
  recurrenceEndDate: string
}

type CalendarOccurrence = CalendarEvent & {
  occurrenceDate: string
}

type CalendarVisibleRange = {
  start: string
  end: string
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
  const [visibleRange, setVisibleRange] = useState<CalendarVisibleRange>(() => createInitialVisibleRange())
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const calendarRef = useRef<FullCalendar | null>(null)

  const visibleOccurrences = useMemo(
    () => expandCalendarEvents(events, visibleRange.start, visibleRange.end),
    [events, visibleRange]
  )

  const calendarItems = useMemo<EventInput[]>(
    () => visibleOccurrences.map((event) => ({
      id: createCalendarOccurrenceId(event),
      title: event.title,
      date: event.occurrenceDate,
      allDay: true,
      extendedProps: {
        originalId: event.id,
        time: event.time,
        notes: event.notes,
        recurrence: event.recurrence
      }
    })),
    [visibleOccurrences]
  )

  const selectedDateEvents = useMemo(
    () => events
      .filter((event) => eventOccursOnDate(event, selectedDate))
      .map((event) => ({ ...event, occurrenceDate: selectedDate }))
      .sort(compareCalendarOccurrences),
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

  const focusDate = useCallback((date: string) => {
    const nextDate = isIsoDate(date) ? date : todayIsoDate()
    setSelectedDate(nextDate)
    calendarRef.current?.getApi().gotoDate(nextDate)
    return nextDate
  }, [])

  const openDate = useCallback((date: string) => {
    const nextDate = focusDate(date)
    setDraft(createBlankCalendarEvent(nextDate))
  }, [focusDate])

  const openEvent = useCallback((id: string, occurrenceDate = selectedDate) => {
    const event = events.find((candidate) => candidate.id === id)
    if (!event) return
    if (eventOccursOnDate(event, occurrenceDate)) {
      focusDate(occurrenceDate)
    } else {
      focusDate(event.date)
    }
    setDraft({ ...event })
  }, [events, focusDate, selectedDate])

  const updateDraftDate = useCallback((date: string) => {
    if (!draft) return
    const nextDate = focusDate(date)
    setDraft({ ...draft, date: nextDate })
  }, [draft, focusDate])

  const saveDraft = useCallback(() => {
    if (!draft) return
    const normalized = normalizeCalendarEvent(draft)
    if (!normalized.title) return
    const exists = events.some((event) => event.id === normalized.id)
    const next = exists
      ? events.map((event) => (event.id === normalized.id ? normalized : event))
      : [...events, normalized]
    focusDate(eventOccursOnDate(normalized, selectedDate) ? selectedDate : normalized.date)
    setDraft({ ...normalized })
    onSaveEvents(next)
  }, [draft, events, focusDate, onSaveEvents, selectedDate])

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
          ref={calendarRef}
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
          datesSet={(arg: DatesSetArg) => {
            setVisibleRange({
              start: toIsoDate(arg.start),
              end: toIsoDate(addDays(toIsoDate(arg.end), -1))
            })
          }}
          dateClick={(arg: DateClickArg) => openDate(arg.dateStr)}
          eventClick={(arg: EventClickArg) => {
            arg.jsEvent.preventDefault()
            focusDate(arg.event.startStr.slice(0, 10))
            const originalId = arg.event.extendedProps.originalId
            openEvent(typeof originalId === 'string' ? originalId : arg.event.id, arg.event.startStr.slice(0, 10))
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
                {event.recurrence !== 'none' && <span>{formatRecurrence(event)}</span>}
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
                    updateDraftDate(event.target.value)
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
              <span>Repeat</span>
              <select
                value={draft.recurrence}
                onChange={(event) => {
                  const recurrence = normalizeRecurrence(event.target.value)
                  setDraft({
                    ...draft,
                    recurrence,
                    recurrenceEndDate: recurrence === 'none' ? '' : draft.recurrenceEndDate
                  })
                }}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            {draft.recurrence !== 'none' && (
              <label>
                <span>Repeat until</span>
                <input
                  type="date"
                  value={draft.recurrenceEndDate}
                  min={draft.date}
                  onChange={(event) => setDraft({ ...draft, recurrenceEndDate: event.target.value })}
                />
              </label>
            )}
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
  const date = isIsoDate(event.date) ? event.date : todayIsoDate()
  const recurrence = normalizeRecurrence(event.recurrence)
  const recurrenceEndDate =
    recurrence !== 'none' && isIsoDate(event.recurrenceEndDate) && event.recurrenceEndDate >= date
      ? event.recurrenceEndDate
      : ''
  return {
    id: event.id || createCalendarEventId(),
    date,
    title: event.title.trim(),
    time: isTimeValue(event.time) ? event.time : '',
    notes: event.notes ?? '',
    recurrence,
    recurrenceEndDate
  }
}

function createBlankCalendarEvent(date: string): CalendarEvent {
  return {
    id: createCalendarEventId(),
    date: isIsoDate(date) ? date : todayIsoDate(),
    title: '',
    time: '',
    notes: '',
    recurrence: 'none',
    recurrenceEndDate: ''
  }
}

function compareCalendarOccurrences(left: CalendarOccurrence, right: CalendarOccurrence): number {
  return (
    left.occurrenceDate.localeCompare(right.occurrenceDate) ||
    (left.time || '99:99').localeCompare(right.time || '99:99') ||
    left.title.localeCompare(right.title)
  )
}

function expandCalendarEvents(events: CalendarEvent[], startDate: string, endDate: string): CalendarOccurrence[] {
  return events
    .flatMap((event) => expandCalendarEvent(event, startDate, endDate))
    .sort(compareCalendarOccurrences)
}

function expandCalendarEvent(event: CalendarEvent, startDate: string, endDate: string): CalendarOccurrence[] {
  const normalized = normalizeCalendarEvent(event)
  const occurrenceEndDate =
    normalized.recurrenceEndDate && normalized.recurrenceEndDate < endDate
      ? normalized.recurrenceEndDate
      : endDate
  if (normalized.date > occurrenceEndDate || startDate > occurrenceEndDate) return []
  if (normalized.recurrence === 'none') {
    return normalized.date >= startDate && normalized.date <= endDate
      ? [{ ...normalized, occurrenceDate: normalized.date }]
      : []
  }

  const occurrences: CalendarOccurrence[] = []
  let cursor = normalized.date
  while (cursor < startDate) {
    const next = nextOccurrenceDate(cursor, normalized)
    if (next <= cursor) return occurrences
    cursor = next
  }
  while (cursor <= occurrenceEndDate) {
    occurrences.push({ ...normalized, occurrenceDate: cursor })
    const next = nextOccurrenceDate(cursor, normalized)
    if (next <= cursor) break
    cursor = next
  }
  return occurrences
}

function eventOccursOnDate(event: CalendarEvent, date: string): boolean {
  if (!isIsoDate(date)) return false
  return expandCalendarEvent(event, date, date).length > 0
}

function nextOccurrenceDate(date: string, event: CalendarEvent): string {
  if (event.recurrence === 'daily') return addDays(date, 1)
  if (event.recurrence === 'weekly') return addDays(date, 7)
  if (event.recurrence === 'monthly') return addMonthsClamped(date, 1, Number(event.date.slice(8, 10)))
  return date
}

function createCalendarOccurrenceId(event: CalendarOccurrence): string {
  return event.recurrence === 'none' ? event.id : `${event.id}:${event.occurrenceDate}`
}

function normalizeRecurrence(value: string | undefined): CalendarRecurrence {
  return value === 'daily' || value === 'weekly' || value === 'monthly' ? value : 'none'
}

function formatRecurrence(event: CalendarEvent): string {
  const labels: Record<CalendarRecurrence, string> = {
    none: '',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly'
  }
  return event.recurrenceEndDate
    ? `${labels[event.recurrence]} until ${formatShortDate(event.recurrenceEndDate)}`
    : labels[event.recurrence]
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

function createInitialVisibleRange(): CalendarVisibleRange {
  const today = todayIsoDate()
  return {
    start: addDays(today, -45),
    end: addDays(today, 45)
  }
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(year, month - 1, day)
  next.setDate(next.getDate() + days)
  return toIsoDate(next)
}

function addMonthsClamped(date: string, months: number, preferredDay: number): string {
  const [year, month] = date.split('-').map(Number)
  const next = new Date(year, month - 1 + months, 1)
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(preferredDay, lastDay))
  return toIsoDate(next)
}

function toIsoDate(date: Date): string
function toIsoDate(date: string): string
function toIsoDate(date: Date | string): string {
  if (typeof date === 'string') return date.slice(0, 10)
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10)
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

function formatShortDate(date: string): string {
  if (!isIsoDate(date)) return date
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
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
