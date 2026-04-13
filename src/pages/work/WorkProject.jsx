import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTION_STATUSES = ['Not started', 'In progress', 'Blocked', 'Complete']

const STATUS_CYCLE = {
  'Not started': 'In progress',
  'In progress': 'Complete',
  'Blocked':     'Not started',
  'Complete':    'Not started',
}

const STATUS_STYLES = {
  'Not started': { bg: '#f5f4f1',  color: '#888'    },
  'In progress': { bg: '#EEEDFE',  color: '#534AB7' },
  'Blocked':     { bg: '#FAECE7',  color: '#993C1D' },
  'Complete':    { bg: '#EAF3DE',  color: '#3B6D11' },
}

const labelStyle = {
  fontSize: '11px', fontWeight: 500, color: '#aaa',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px',
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function weekKey(monday) {
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const d = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function weekLabel(monday) {
  const end = new Date(monday)
  end.setDate(end.getDate() + 6)
  const fmt = (d, opts) => d.toLocaleDateString('en-US', opts)
  return `${fmt(monday, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function fmtDate(str) {
  if (!str) return ''
  const d = parseLocalDate(str)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getActiveWeeks(startDate, endDate) {
  const start = getMonday(parseLocalDate(startDate))
  const end   = parseLocalDate(endDate)
  const weeks = []
  const cur   = new Date(start)
  while (cur <= end) {
    weeks.push(new Date(cur))
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorkProject() {
  const { projectId } = useParams()
  const { user } = useAuth()

  const [project, setProject]   = useState(null)
  const [currentWeek, setCurrentWeek] = useState(null) // Monday Date

  // Week data
  const [weekData, setWeekData] = useState({ actionItems: [], notes: [], recap: '' })

  // Action items modal: null | { id?, title, completeBy, status }
  const [actionModal, setActionModal] = useState(null)

  // Notes
  const [noteInput, setNoteInput]     = useState('')
  const [noteFollowUp, setNoteFollowUp] = useState(false)
  const [editingNote, setEditingNote] = useState(null) // null | { id, text, followUp }

  // Recap
  const [recap, setRecap]         = useState('')
  const [recapSaved, setRecapSaved] = useState(false)

  // ── Load project ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user || !projectId) return
    const load = async () => {
      const snap = await getDoc(doc(db, 'users', user.uid, 'workProjects', projectId))
      if (!snap.exists()) return
      const data = { id: snap.id, ...snap.data() }
      setProject(data)

      if (data.startDate && data.endDate) {
        const weeks   = getActiveWeeks(data.startDate, data.endDate)
        if (weeks.length === 0) return
        const todayMonday = getMonday(new Date())
        const todayKey    = weekKey(todayMonday)
        const found       = weeks.find((w) => weekKey(w) === todayKey)
        if (found) {
          setCurrentWeek(found)
        } else if (todayMonday < weeks[0]) {
          setCurrentWeek(weeks[0])
        } else {
          setCurrentWeek(weeks[weeks.length - 1])
        }
      }
    }
    load()
  }, [user, projectId])

  // ── Live week data ──────────────────────────────────────────────────────────

  const wKey = currentWeek ? weekKey(currentWeek) : null

  useEffect(() => {
    if (!user || !projectId || !wKey) return
    const unsub = onSnapshot(
      doc(db, 'users', user.uid, 'workProjects', projectId, 'weekData', wKey),
      (snap) => {
        const data = snap.exists()
          ? snap.data()
          : { actionItems: [], notes: [], recap: '' }
        setWeekData(data)
        setRecap(data.recap || '')
      }
    )
    return unsub
  }, [user, projectId, wKey])

  // ── Week navigation ─────────────────────────────────────────────────────────

  const activeWeeks = (project?.startDate && project?.endDate)
    ? getActiveWeeks(project.startDate, project.endDate)
    : []

  const currentIdx = currentWeek
    ? activeWeeks.findIndex((w) => weekKey(w) === weekKey(currentWeek))
    : -1

  const navigateWeek = (dir) => {
    const idx = currentIdx + dir
    if (idx >= 0 && idx < activeWeeks.length) setCurrentWeek(activeWeeks[idx])
  }

  // ── Firestore writer ────────────────────────────────────────────────────────

  const updateField = async (field, value) => {
    if (!user || !projectId || !wKey) return
    await setDoc(
      doc(db, 'users', user.uid, 'workProjects', projectId, 'weekData', wKey),
      { [field]: value },
      { merge: true }
    )
  }

  // ── Action items ────────────────────────────────────────────────────────────

  const saveActionItem = async () => {
    if (!actionModal?.title?.trim()) return
    const items = [...(weekData.actionItems || [])]
    if (actionModal.id) {
      const idx = items.findIndex((i) => i.id === actionModal.id)
      if (idx >= 0) {
        items[idx] = {
          ...items[idx],
          title:      actionModal.title.trim(),
          completeBy: actionModal.completeBy || null,
          status:     actionModal.status,
        }
      }
    } else {
      items.push({
        id:         newId(),
        title:      actionModal.title.trim(),
        completeBy: actionModal.completeBy || null,
        status:     'Not started',
        createdAt:  new Date().toISOString(),
      })
    }
    await updateField('actionItems', items)
    setActionModal(null)
  }

  const deleteActionItem = async (id) => {
    await updateField('actionItems', (weekData.actionItems || []).filter((i) => i.id !== id))
    setActionModal(null)
  }

  const cycleStatus = async (item) => {
    const items = (weekData.actionItems || []).map((i) =>
      i.id === item.id ? { ...i, status: STATUS_CYCLE[i.status] || 'Not started' } : i
    )
    await updateField('actionItems', items)
  }

  // ── Notes ───────────────────────────────────────────────────────────────────

  const addNote = async () => {
    if (!noteInput.trim()) return
    const notes = [
      ...(weekData.notes || []),
      { id: newId(), text: noteInput.trim(), followUp: noteFollowUp, createdAt: new Date().toISOString() },
    ]
    await updateField('notes', notes)
    setNoteInput('')
    setNoteFollowUp(false)
  }

  const saveNote = async () => {
    if (!editingNote?.text?.trim()) return
    const notes = (weekData.notes || []).map((n) =>
      n.id === editingNote.id ? { ...n, text: editingNote.text.trim(), followUp: editingNote.followUp } : n
    )
    await updateField('notes', notes)
    setEditingNote(null)
  }

  const deleteNote = async (id) => {
    await updateField('notes', (weekData.notes || []).filter((n) => n.id !== id))
    setEditingNote(null)
  }

  // ── Recap ───────────────────────────────────────────────────────────────────

  const saveRecap = async () => {
    await updateField('recap', recap)
    setRecapSaved(true)
    setTimeout(() => setRecapSaved(false), 2000)
  }

  // ── Guard ───────────────────────────────────────────────────────────────────

  if (!project) return null

  const noDates      = !project.startDate || !project.endDate
  const hasWeeks     = activeWeeks.length > 0
  const canPrev      = currentIdx > 0
  const canNext      = currentIdx < activeWeeks.length - 1

  const actionItems  = weekData.actionItems || []
  const notes        = weekData.notes        || []
  const activeItems  = actionItems.filter((i) => i.status !== 'Complete')
  const doneItems    = actionItems.filter((i) => i.status === 'Complete')

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/work" className="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Work
        </Link>
      </div>

      <h1 className="page-title" style={{ marginBottom: '4px' }}>{project.name}</h1>
      {(project.startDate || project.endDate) && (
        <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '1.25rem' }}>
          {project.startDate ? fmtDate(project.startDate) : '—'} → {project.endDate ? fmtDate(project.endDate) : '—'}
        </div>
      )}

      {/* No dates prompt */}
      {noDates && (
        <div className="profile-card">
          <div style={{ fontSize: '13px', color: '#aaa' }}>
            Add start and end dates to this project from your Profile page to enable weekly tracking.
          </div>
        </div>
      )}

      {!noDates && !hasWeeks && (
        <div className="profile-card">
          <div style={{ fontSize: '13px', color: '#aaa' }}>No active weeks found for this project's date range.</div>
        </div>
      )}

      {!noDates && hasWeeks && currentWeek && (
        <>
          {/* Week nav */}
          <div className="profile-card" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={() => navigateWeek(-1)}
                disabled={!canPrev}
                className="bl-nav-btn"
                style={{ opacity: canPrev ? 1 : 0.25 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14 }}>
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{weekLabel(currentWeek)}</div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                  Week {currentIdx + 1} of {activeWeeks.length}
                </div>
              </div>
              <button
                onClick={() => navigateWeek(1)}
                disabled={!canNext}
                className="bl-nav-btn"
                style={{ opacity: canNext ? 1 : 0.25 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14 }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Action Items ── */}
          <div className="profile-card" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div className="profile-section-title" style={{ margin: 0 }}>Action Items</div>
              <button
                onClick={() => setActionModal({ title: '', completeBy: '', status: 'Not started' })}
                className="icon-btn"
                style={{ width: 28, height: 28 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 14, height: 14 }}>
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {actionItems.length === 0 && (
              <div style={{ fontSize: '13px', color: '#ccc' }}>No action items yet</div>
            )}

            {activeItems.map((item) => <ActionRow key={item.id} item={item} onCycle={cycleStatus} onEdit={setActionModal} />)}

            {doneItems.length > 0 && (
              <>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#ccc', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '10px 0 6px' }}>
                  Complete · {doneItems.length}
                </div>
                {doneItems.map((item) => <ActionRow key={item.id} item={item} onCycle={cycleStatus} onEdit={setActionModal} />)}
              </>
            )}
          </div>

          {/* ── Notes ── */}
          <div className="profile-card" style={{ marginBottom: '12px' }}>
            <div className="profile-section-title">Notes</div>

            {/* Quick add */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'flex-start' }}>
              <textarea
                className="form-input"
                style={{ margin: 0, flex: 1, resize: 'none', fontSize: '13px' }}
                placeholder="Add a note..."
                rows={2}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote() } }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  title="Flag for follow-up"
                  onClick={() => setNoteFollowUp((f) => !f)}
                  style={{
                    width: 32, height: 32, borderRadius: '8px', border: 'none', cursor: 'pointer', flexShrink: 0,
                    background: noteFollowUp ? '#FAEEDA' : '#f5f4f1',
                    color:      noteFollowUp ? '#854F0B' : '#bbb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                  }}
                >
                  🚩
                </button>
                <button
                  onClick={addNote}
                  disabled={!noteInput.trim()}
                  style={{
                    width: 32, height: 32, borderRadius: '8px', border: 'none', cursor: 'pointer', flexShrink: 0,
                    background: noteInput.trim() ? '#534AB7' : '#f0ede8',
                    color:      noteInput.trim() ? 'white'   : '#bbb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 14, height: 14 }}>
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>

            {notes.length === 0 && (
              <div style={{ fontSize: '13px', color: '#ccc' }}>No notes yet</div>
            )}

            {notes.map((note) => (
              <div key={note.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 0', borderBottom: '0.5px solid #f5f4f1' }}>
                <span style={{ fontSize: '13px', flexShrink: 0, marginTop: '1px', opacity: note.followUp ? 1 : 0, userSelect: 'none' }}>🚩</span>
                <div style={{ flex: 1, fontSize: '13px', color: '#444', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note.text}</div>
                <button
                  onClick={() => setEditingNote({ id: note.id, text: note.text, followUp: note.followUp })}
                  style={{ fontSize: '11px', color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0 }}
                >
                  Edit
                </button>
              </div>
            ))}
          </div>

          {/* ── Weekly Recap ── */}
          <div className="profile-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div className="profile-section-title" style={{ margin: 0 }}>Weekly Recap</div>
              <button
                className="btn-primary"
                style={{ width: 'auto', padding: '6px 14px', marginTop: 0, fontSize: '12px' }}
                onClick={saveRecap}
              >
                {recapSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
            <textarea
              className="form-input"
              style={{ margin: 0, width: '100%', resize: 'vertical', minHeight: '120px', fontSize: '13px', boxSizing: 'border-box' }}
              placeholder="How did this week go? Key wins, blockers, and next steps..."
              value={recap}
              onChange={(e) => setRecap(e.target.value)}
            />
          </div>
        </>
      )}

      {/* ── Action item modal ── */}
      {actionModal && (
        <div className="modal-overlay" onClick={() => setActionModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">{actionModal.id ? 'Edit action item' : 'Add action item'}</h2>
            <input
              className="form-input"
              placeholder="What needs to be done?"
              value={actionModal.title}
              onChange={(e) => setActionModal({ ...actionModal, title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && saveActionItem()}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Complete by</div>
                <input
                  className="form-input"
                  style={{ margin: 0 }}
                  type="date"
                  value={actionModal.completeBy || ''}
                  onChange={(e) => setActionModal({ ...actionModal, completeBy: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Status</div>
                <select
                  className="form-select"
                  style={{ width: '100%' }}
                  value={actionModal.status}
                  onChange={(e) => setActionModal({ ...actionModal, status: e.target.value })}
                >
                  {ACTION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              {actionModal.id && (
                <button
                  onClick={() => deleteActionItem(actionModal.id)}
                  style={{ background: 'none', border: '0.5px solid #f5c5c5', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', color: '#c0392b', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Delete
                </button>
              )}
              <button
                className="btn-primary"
                style={{ flex: 1, margin: 0 }}
                onClick={saveActionItem}
                disabled={!actionModal.title?.trim()}
              >
                {actionModal.id ? 'Save changes' : 'Add item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Note edit modal ── */}
      {editingNote && (
        <div className="modal-overlay" onClick={() => setEditingNote(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">Edit note</h2>
            <textarea
              className="form-input"
              rows={4}
              style={{ resize: 'none' }}
              value={editingNote.text}
              onChange={(e) => setEditingNote({ ...editingNote, text: e.target.value })}
              autoFocus
            />
            <button
              onClick={() => setEditingNote({ ...editingNote, followUp: !editingNote.followUp })}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', padding: '9px 14px', borderRadius: '8px', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', marginBottom: '14px',
                background: editingNote.followUp ? '#FAEEDA' : '#f0ede8',
                color:      editingNote.followUp ? '#854F0B' : '#666',
              }}
            >
              <span>🚩</span>
              {editingNote.followUp ? 'Follow-up flagged' : 'Flag for follow-up'}
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => deleteNote(editingNote.id)}
                style={{ background: 'none', border: '0.5px solid #f5c5c5', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', color: '#c0392b', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Delete
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, margin: 0 }}
                onClick={saveNote}
                disabled={!editingNote.text?.trim()}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-component ──────────────────────────────────────────────────────────────

function ActionRow({ item, onCycle, onEdit }) {
  const isDone  = item.status === 'Complete'
  const sStyle  = STATUS_STYLES[item.status] || STATUS_STYLES['Not started']

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '0.5px solid #f5f4f1' }}>
      {/* Circle toggle */}
      <button
        onClick={() => onCycle(item)}
        style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: '1px',
          border: isDone ? 'none' : '1.5px solid #ddd',
          background: isDone ? '#3B6D11' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {isDone && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" style={{ width: 10, height: 10 }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, opacity: isDone ? 0.45 : 1, textDecoration: isDone ? 'line-through' : 'none' }}>
          {item.title}
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => onCycle(item)}
            style={{
              fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: sStyle.bg, color: sStyle.color,
            }}
          >
            {item.status}
          </button>
          {item.completeBy && (
            <span style={{ fontSize: '11px', color: '#bbb' }}>
              Due {new Date(item.completeBy + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onEdit({ id: item.id, title: item.title, completeBy: item.completeBy || '', status: item.status })}
        style={{ fontSize: '11px', color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0 }}
      >
        Edit
      </button>
    </div>
  )
}
