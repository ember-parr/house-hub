import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot, getDocs,
  serverTimestamp,
} from 'firebase/firestore'

const CATEGORIES = ['All', 'Plumbing', 'Electrical', 'Outdoor', 'Appliance', 'General']

const PRIORITY_STYLES = {
  High:   'badge-coral',
  Medium: 'badge-amber',
  Low:    'badge-green',
}

const CATEGORY_STYLES = {
  Plumbing:   'badge-blue',
  Electrical: 'badge-amber',
  Outdoor:    'badge-green',
  Appliance:  'badge-purple',
  General:    'badge-gray',
}

const COLOR_STYLES = {
  teal:   { bg: '#E1F5EE', color: '#0F6E56' },
  purple: { bg: '#EEEDFE', color: '#534AB7' },
  amber:  { bg: '#FAEEDA', color: '#854F0B' },
  coral:  { bg: '#FAECE7', color: '#993C1D' },
  blue:   { bg: '#E6F1FB', color: '#185FA5' },
  green:  { bg: '#EAF3DE', color: '#3B6D11' },
}

function formatDueDate(dateStr) {
  if (!dateStr) return null
  const due = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((due - today) / (1000 * 60 * 60 * 24))
  if (diff < 0)  return { label: `Overdue · ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, overdue: true }
  if (diff === 0) return { label: 'Due today', overdue: false }
  if (diff === 1) return { label: 'Due tomorrow', overdue: false }
  return { label: `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, overdue: false }
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

const emptyForm = { title: '', category: 'General', priority: 'Medium', dueDate: '', assignedTo: null }

export default function Maintenance() {
  const { user } = useAuth()
  const [tasks, setTasks]         = useState([])
  const [members, setMembers]     = useState([])
  const [catFilter, setCatFilter] = useState('All')
  const [personFilter, setPersonFilter] = useState('All')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)

  // Real-time tasks
  useEffect(() => {
    const q = query(collection(db, 'maintenance'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // Load household members once
  useEffect(() => {
    getDocs(query(collection(db, 'users'), orderBy('joinedAt'))).then((snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  const applyFilters = (list) => {
    let result = list
    if (catFilter !== 'All')    result = result.filter((t) => t.category === catFilter)
    if (personFilter !== 'All') result = result.filter((t) => t.assignedTo === personFilter)
    return result
  }

  const openTasks = applyFilters(tasks.filter((t) => !t.completed))
  const doneTasks = applyFilters(tasks.filter((t) =>  t.completed))

  const handleAdd = async () => {
    if (!form.title.trim()) return
    setSaving(true)

    const assignee = members.find((m) => m.id === form.assignedTo) || null

    await addDoc(collection(db, 'maintenance'), {
      title:            form.title.trim(),
      category:         form.category,
      priority:         form.priority,
      dueDate:          form.dueDate || null,
      assignedTo:       assignee?.id   || null,
      assignedToName:   assignee ? (assignee.nickname || assignee.displayName) : null,
      assignedToColor:  assignee?.color || null,
      completed:        false,
      createdAt:        serverTimestamp(),
    })
    setForm(emptyForm)
    setShowModal(false)
    setSaving(false)
  }

  const toggleComplete = (task) =>
    updateDoc(doc(db, 'maintenance', task.id), {
      completed:   !task.completed,
      completedAt: !task.completed ? serverTimestamp() : null,
    })

  const handleDelete = (id) => deleteDoc(doc(db, 'maintenance', id))

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Maintenance</h1>
        <button className="icon-btn" onClick={() => setShowModal(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Category filter */}
      <div className="filter-row">
        {CATEGORIES.map((cat) => (
          <button key={cat} className={`chip ${catFilter === cat ? 'chip-active' : ''}`} onClick={() => setCatFilter(cat)}>
            {cat}
          </button>
        ))}
      </div>

      {/* Person filter */}
      {members.length > 0 && (
        <div className="filter-row" style={{ marginBottom: '1rem' }}>
          <button className={`chip ${personFilter === 'All' ? 'chip-active' : ''}`} onClick={() => setPersonFilter('All')}>
            Everyone
          </button>
          {members.map((m) => {
            const name  = m.nickname || m.displayName || 'Member'
            const style = COLOR_STYLES[m.color] || COLOR_STYLES.teal
            const active = personFilter === m.id
            return (
              <button
                key={m.id}
                className={`chip ${active ? 'chip-active' : ''}`}
                onClick={() => setPersonFilter(m.id)}
                style={active ? {} : {}}
              >
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: style.bg, color: style.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 600, flexShrink: 0 }}>
                  {initials(name)[0]}
                </span>
                {name.split(' ')[0]}
              </button>
            )
          })}
        </div>
      )}

      {/* Open tasks */}
      {openTasks.length > 0 && (
        <>
          <div className="section-label">Open · {openTasks.length}</div>
          {openTasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={toggleComplete} onDelete={handleDelete} />
          ))}
        </>
      )}

      {openTasks.length === 0 && (
        <div className="empty-state">No open tasks — enjoy the break!</div>
      )}

      {/* Completed tasks */}
      {doneTasks.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: '1.25rem' }}>Completed · {doneTasks.length}</div>
          {doneTasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={toggleComplete} onDelete={handleDelete} />
          ))}
        </>
      )}

      {/* Add task modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">New task</h2>

            <input
              className="form-input"
              placeholder="Task title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              autoFocus
            />

            <div className="form-row">
              <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.filter((c) => c !== 'All').map((c) => <option key={c}>{c}</option>)}
              </select>
              <select className="form-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option>High</option><option>Medium</option><option>Low</option>
              </select>
            </div>

            <input
              className="form-input"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />

            {/* Assignee picker */}
            {members.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Assign to
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {members.map((m) => {
                    const name    = m.nickname || m.displayName || 'Member'
                    const mStyle  = COLOR_STYLES[m.color] || COLOR_STYLES.teal
                    const selected = form.assignedTo === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setForm({ ...form, assignedTo: selected ? null : m.id })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          padding: '5px 10px 5px 6px', borderRadius: '20px', cursor: 'pointer',
                          border: selected ? `0.5px solid ${mStyle.color}` : '0.5px solid #e0ddd8',
                          background: selected ? mStyle.bg : 'white',
                          color: selected ? mStyle.color : '#555',
                          fontSize: '12px', fontWeight: selected ? 500 : 400,
                          fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ width: 20, height: 20, borderRadius: '50%', background: mStyle.bg, color: mStyle.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 600, border: `1px solid ${mStyle.color}22` }}>
                          {initials(name)}
                        </span>
                        {name.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <button className="btn-primary" onClick={handleAdd} disabled={saving || !form.title.trim()}>
              {saving ? 'Saving...' : 'Add task'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle, onDelete }) {
  const due     = task.dueDate ? formatDueDate(task.dueDate) : null
  const aStyle  = task.assignedToColor ? (COLOR_STYLES[task.assignedToColor] || COLOR_STYLES.teal) : null
  const aName   = task.assignedToName

  return (
    <div className={`task-card ${task.completed ? 'task-done' : ''}`}>
      <button className={`task-check ${task.completed ? 'task-check-done' : ''}`} onClick={() => onToggle(task)}>
        {task.completed && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      <div className="task-body">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          {task.category && <span className={`badge ${CATEGORY_STYLES[task.category] || 'badge-gray'}`}>{task.category}</span>}
          {task.priority && !task.completed && <span className={`badge ${PRIORITY_STYLES[task.priority]}`}>{task.priority}</span>}
          {due && <span className={`task-date ${due.overdue ? 'task-date-overdue' : ''}`}>{due.label}</span>}

          {/* Assignee pill */}
          {aName && aStyle ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#f5f4f1', borderRadius: '20px', padding: '2px 7px 2px 3px' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: aStyle.bg, color: aStyle.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: 700 }}>
                {initials(aName)}
              </span>
              <span style={{ fontSize: '10px', color: '#666', fontWeight: 500 }}>{aName.split(' ')[0]}</span>
            </span>
          ) : (
            !task.completed && <span style={{ fontSize: '10px', color: '#ccc' }}>Unassigned</span>
          )}
        </div>
      </div>

      <button className="task-delete" onClick={() => onDelete(task.id)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          <path d="M10 11v6M14 11v6M9 6V4h6v2" />
        </svg>
      </button>
    </div>
  )
}