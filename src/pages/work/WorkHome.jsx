import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { collection, query, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore'

// ── Constants ──────────────────────────────────────────────────────────────────

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

// Returns true if the given Monday falls within the project's date range.
// Projects with no dates set are always considered active.
function isProjectActiveThisWeek(project, monday) {
  if (!project.startDate || !project.endDate) return true
  const start = getMonday(parseLocalDate(project.startDate))
  const end   = parseLocalDate(project.endDate)
  return monday >= start && monday <= end
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function WorkHome() {
  const { user } = useAuth()
  const now = new Date()

  const [projects, setProjects]       = useState([])
  const [currentWeek, setCurrentWeek] = useState(() => getMonday(now))
  const [weekDataMap, setWeekDataMap] = useState({}) // { [projectId]: { actionItems, notes, recap } }

  // Quick-add modals
  const [actionModal, setActionModal] = useState(null)  // null | projectId
  const [noteModal, setNoteModal]     = useState(null)  // null | projectId
  const [actionTitle, setActionTitle] = useState('')
  const [actionDate, setActionDate]   = useState('')
  const [noteText, setNoteText]       = useState('')
  const [noteFollowUp, setNoteFollowUp] = useState(false)
  const [saving, setSaving]           = useState(false)

  const wKey = weekKey(currentWeek)

  // ── Load projects (real-time) ────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'workProjects'), orderBy('createdAt'))
    return onSnapshot(q, (snap) => {
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  // ── Load weekData for all projects (real-time, refreshes when week changes) ──

  useEffect(() => {
    if (!user || projects.length === 0) return

    // Set up one onSnapshot listener per project for the current week doc
    const unsubscribers = projects.map((p) =>
      onSnapshot(
        doc(db, 'users', user.uid, 'workProjects', p.id, 'weekData', wKey),
        (snap) => {
          setWeekDataMap((prev) => ({
            ...prev,
            [p.id]: snap.exists()
              ? snap.data()
              : { actionItems: [], notes: [], recap: '' },
          }))
        }
      )
    )

    return () => unsubscribers.forEach((unsub) => unsub())
  }, [user, projects, wKey])

  // ── Week navigation ──────────────────────────────────────────────────────────

  const navigateWeek = (dir) => {
    setCurrentWeek((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + dir * 7)
      return next
    })
  }

  // ── Quick-add helpers ────────────────────────────────────────────────────────

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  }

  const openActionModal = (projectId) => {
    setActionModal(projectId)
    setActionTitle('')
    setActionDate('')
  }

  const openNoteModal = (projectId) => {
    setNoteModal(projectId)
    setNoteText('')
    setNoteFollowUp(false)
  }

  const saveActionItem = async () => {
    if (!actionTitle.trim() || !actionModal) return
    setSaving(true)
    const wd    = weekDataMap[actionModal] || {}
    const items = [...(wd.actionItems || []), {
      id: newId(), title: actionTitle.trim(),
      completeBy: actionDate || null, status: 'Not started',
    }]
    await setDoc(
      doc(db, 'users', user.uid, 'workProjects', actionModal, 'weekData', wKey),
      { actionItems: items }, { merge: true }
    )
    setActionModal(null)
    setSaving(false)
  }

  const saveNote = async () => {
    if (!noteText.trim() || !noteModal) return
    setSaving(true)
    const wd    = weekDataMap[noteModal] || {}
    const notes = [...(wd.notes || []), { id: newId(), text: noteText.trim(), followUp: noteFollowUp }]
    await setDoc(
      doc(db, 'users', user.uid, 'workProjects', noteModal, 'weekData', wKey),
      { notes }, { merge: true }
    )
    setNoteModal(null)
    setSaving(false)
  }

  // ── Status cycling (inline from WorkHome) ───────────────────────────────────

  const cycleStatus = async (projectId, item) => {
    const wd    = weekDataMap[projectId] || {}
    const items = (wd.actionItems || []).map((i) =>
      i.id === item.id ? { ...i, status: STATUS_CYCLE[i.status] || 'Not started' } : i
    )
    await setDoc(
      doc(db, 'users', user.uid, 'workProjects', projectId, 'weekData', wKey),
      { actionItems: items },
      { merge: true }
    )
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const todayStr = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const nonExpiredProjects = projects.filter((p) => !p.endDate || p.endDate >= todayStr)

  // Projects active during the selected week that have at least one action item or note
  const visibleProjects = nonExpiredProjects
    .filter((p) => isProjectActiveThisWeek(p, currentWeek))
    .map((p) => ({ ...p, wd: weekDataMap[p.id] || { actionItems: [], notes: [], recap: '' } }))

  const hasAnyContent = visibleProjects.some(
    (p) => p.wd.actionItems?.length > 0 || p.wd.notes?.length > 0
  )

  const isCurrentWeek =
    weekKey(currentWeek) === weekKey(getMonday(now))

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Work</h1>
      </div>

      {/* Project nav cards */}
      {nonExpiredProjects.length > 0 && (
        <div className="card-grid" style={{ marginBottom: '1.5rem' }}>
          {nonExpiredProjects.map((p) => (
            <div key={p.id} className="nav-card" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link to={`/work/${p.id}`} style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}>
                <h2>{p.name}</h2>
              </Link>
              <button
                onClick={() => openActionModal(p.id)}
                title="Add action item"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#bbb', display: 'flex', flexShrink: 0 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 15, height: 15 }}>
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </button>
              <button
                onClick={() => openNoteModal(p.id)}
                title="Add note"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#bbb', display: 'flex', flexShrink: 0 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 15, height: 15 }}>
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {nonExpiredProjects.length === 0 && (
        <div className="empty-state" style={{ marginBottom: '1.5rem' }}>
          No projects yet — add them from your Profile page.
        </div>
      )}

      {/* Week nav */}
      <div className="profile-card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => navigateWeek(-1)} className="bl-nav-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14 }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '15px', fontWeight: 500 }}>{weekLabel(currentWeek)}</div>
            {isCurrentWeek && (
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>Current week</div>
            )}
          </div>
          <button onClick={() => navigateWeek(1)} className="bl-nav-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Aggregated weekly view */}
      {projects.length > 0 && !hasAnyContent && (
        <div className="profile-card">
          <div style={{ fontSize: '13px', color: '#aaa' }}>
            No action items or notes logged for this week.
          </div>
        </div>
      )}

      {visibleProjects.map((p) => {
        const actionItems = p.wd.actionItems || []
        const notes       = p.wd.notes       || []

        if (actionItems.length === 0 && notes.length === 0) return null

        const activeItems = actionItems.filter((i) => i.status !== 'Complete')
        const doneItems   = actionItems.filter((i) => i.status === 'Complete')

        return (
          <div key={p.id} className="profile-card" style={{ marginBottom: '12px' }}>
            {/* Project header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
              <Link to={`/work/${p.id}`} style={{ flex: 1, textDecoration: 'none' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a2920' }}>{p.name}</div>
                {(p.startDate || p.endDate) && (
                  <div style={{ fontSize: '11px', color: '#bbb', marginTop: '2px' }}>
                    {p.startDate || '—'} → {p.endDate || '—'}
                  </div>
                )}
              </Link>
              <button
                onClick={() => openActionModal(p.id)}
                title="Add action item"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#bbb', display: 'flex', flexShrink: 0 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 15, height: 15 }}>
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </button>
              <button
                onClick={() => openNoteModal(p.id)}
                title="Add note"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#bbb', display: 'flex', flexShrink: 0 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 15, height: 15 }}>
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <Link to={`/work/${p.id}`} style={{ display: 'flex', color: '#ccc' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14 }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            </div>

            {/* Action items */}
            {actionItems.length > 0 && (
              <div style={{ marginBottom: notes.length > 0 ? '14px' : 0 }}>
                <div style={sectionLabelStyle}>Action Items</div>

                {activeItems.map((item) => (
                  <ActionRow key={item.id} item={item} onCycle={() => cycleStatus(p.id, item)} />
                ))}

                {doneItems.length > 0 && (
                  <>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#ccc', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '8px 0 4px' }}>
                      Complete · {doneItems.length}
                    </div>
                    {doneItems.map((item) => (
                      <ActionRow key={item.id} item={item} onCycle={() => cycleStatus(p.id, item)} />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Notes */}
            {notes.length > 0 && (
              <div>
                <div style={sectionLabelStyle}>Notes</div>
                {notes.map((note) => (
                  <div key={note.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '5px 0', borderBottom: '0.5px solid #f5f4f1' }}>
                    <span style={{ fontSize: '12px', flexShrink: 0, marginTop: '1px', opacity: note.followUp ? 1 : 0, userSelect: 'none' }}>🚩</span>
                    <div style={{ flex: 1, fontSize: '13px', color: '#444', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {note.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {/* Add action item modal */}
      {actionModal && (
        <div className="modal-overlay" onClick={() => setActionModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">New action item</h2>
            <input
              className="form-input"
              placeholder="Title *"
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveActionItem() }}
              autoFocus
            />
            <div style={{ marginBottom: '12px' }}>
              <div style={modalLabelStyle}>Due date (optional)</div>
              <input
                className="form-input"
                style={{ margin: 0 }}
                type="date"
                value={actionDate}
                onChange={(e) => setActionDate(e.target.value)}
              />
            </div>
            <button className="btn-primary" onClick={saveActionItem} disabled={saving || !actionTitle.trim()}>
              {saving ? 'Saving...' : 'Add action item'}
            </button>
          </div>
        </div>
      )}

      {/* Add note modal */}
      {noteModal && (
        <div className="modal-overlay" onClick={() => setNoteModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">New note</h2>
            <textarea
              className="form-input"
              placeholder="Note *"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              style={{ resize: 'none' }}
              autoFocus
            />
            <button
              onClick={() => setNoteFollowUp((f) => !f)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: '13px', color: noteFollowUp ? '#534AB7' : '#aaa', padding: 0,
              }}
            >
              <span style={{ fontSize: '14px' }}>🚩</span>
              Mark as follow-up
            </button>
            <button className="btn-primary" onClick={saveNote} disabled={saving || !noteText.trim()}>
              {saving ? 'Saving...' : 'Add note'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

const modalLabelStyle = {
  fontSize: '11px', fontWeight: 500, color: '#aaa',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px',
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActionRow({ item, onCycle }) {
  const isDone  = item.status === 'Complete'
  const sStyle  = STATUS_STYLES[item.status] || STATUS_STYLES['Not started']

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '7px 0', borderBottom: '0.5px solid #f5f4f1' }}>
      <button
        onClick={onCycle}
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
        <div style={{ display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={onCycle}
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
    </div>
  )
}

const sectionLabelStyle = {
  fontSize: '11px', fontWeight: 600, color: '#aaa',
  letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px',
}
