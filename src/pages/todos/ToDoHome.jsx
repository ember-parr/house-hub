import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot, getDocs,
  serverTimestamp,
} from 'firebase/firestore'

const CATEGORIES = ['General', 'Personal', 'Household', 'Work', 'Health', 'Errands']
const STATUSES   = ['Not yet started', 'In progress', 'Blocked', 'Complete']

const SUBCATEGORIES = {
  General:   ['Admin', 'Research', 'Planning', 'Other'],
  Personal:  ['Health', 'Finance', 'Career', 'Social', 'Learning', 'Other'],
  Household: ['Kitchen', 'Bathroom', 'Bedroom', 'Living Room', 'Outdoor', 'Repairs', 'Cleaning', 'Other'],
  Work:      ['Meeting', 'Project', 'Admin', 'Research', 'Other'],
  Health:    ['Exercise', 'Diet', 'Medical', 'Mental', 'Other'],
  Errands:   ['Shopping', 'Transportation', 'Appointments', 'Other'],
}

const STATUS_STYLES = {
  'Not yet started': 'badge-gray',
  'In progress':     'badge-secondary',
  'Blocked':         'badge-coral',
  'Complete':        'badge-green',
}

const CATEGORY_STYLES = {
  General:   'badge-gray',
  Personal:  'badge-accent',
  Household: 'badge-blue',
  Work:      'badge-amber',
  Health:    'badge-green',
  Errands:   'badge-secondary',
}

const COLOR_STYLES = {
  teal:   { bg: '#E1F5EE', color: '#0F6E56' },
  purple: { bg: '#EEEDFE', color: '#534AB7' },
  amber:  { bg: '#FAEEDA', color: '#854F0B' },
  coral:  { bg: '#FAECE7', color: '#993C1D' },
  blue:   { bg: '#E6F1FB', color: '#185FA5' },
  green:  { bg: '#EAF3DE', color: '#3B6D11' },
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

function formatDuration(start, end) {
  if (!start || !end) return null
  const diff = new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')
  if (diff <= 0) return null
  const days = Math.round(diff / 86400000)
  return days === 1 ? '1 day' : `${days} days`
}

const emptyForm = {
  title: '', details: '', prerequisites: [],
  category: 'General', subCategory: '', assignedTo: null,
  startDate: '', endDate: '', status: 'Not yet started',
  subtasks: [],
}

export default function ToDoHome() {
  const [todos, setTodos]         = useState([])
  const [members, setMembers]     = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)
  const [subtaskInput, setSubtaskInput] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'todos'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  useEffect(() => {
    getDocs(query(collection(db, 'users'), orderBy('joinedAt'))).then((snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setForm(emptyForm)
    setSubtaskInput('')
  }

  const openEdit = (todo) => {
    setForm({
      title:         todo.title        || '',
      details:       todo.details      || '',
      prerequisites: todo.prerequisites || [],
      category:      todo.category     || 'General',
      subCategory:   todo.subCategory  || '',
      assignedTo:    todo.assignedTo   || null,
      startDate:     todo.startDate    || '',
      endDate:       todo.endDate      || '',
      status:        todo.status       || 'Not yet started',
      subtasks:      todo.subtasks     || [],
    })
    setEditingId(todo.id)
    setShowModal(true)
  }

  const addSubtask = () => {
    if (!subtaskInput.trim()) return
    setForm((f) => ({ ...f, subtasks: [...f.subtasks, { id: Date.now().toString(), title: subtaskInput.trim(), completed: false }] }))
    setSubtaskInput('')
  }

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const assignee = members.find((m) => m.id === form.assignedTo) || null
    const payload = {
      title:           form.title.trim(),
      details:         form.details.trim() || null,
      prerequisites:   form.prerequisites,
      category:        form.category,
      subCategory:     form.subCategory || null,
      assignedTo:      assignee?.id   || null,
      assignedToName:  assignee ? (assignee.nickname || assignee.displayName) : null,
      assignedToColor: assignee?.color || null,
      startDate:       form.startDate || null,
      endDate:         form.endDate   || null,
      status:          form.status,
      subtasks:        form.subtasks,
    }
    if (editingId) {
      await updateDoc(doc(db, 'todos', editingId), payload)
    } else {
      await addDoc(collection(db, 'todos'), { ...payload, createdAt: serverTimestamp() })
    }
    closeModal()
    setSaving(false)
  }

  const handleDelete = (id) => deleteDoc(doc(db, 'todos', id))

  const updateStatus = (todo, status) =>
    updateDoc(doc(db, 'todos', todo.id), { status })

  const activeTodos = todos.filter((t) => t.status !== 'Complete')
  const doneTodos   = todos.filter((t) => t.status === 'Complete')

  const duration = formatDuration(form.startDate, form.endDate)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">To-Do's</h1>
        <button className="icon-btn" onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true) }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Sub-page nav cards */}
      <div className="card-grid" style={{ marginBottom: '1.5rem' }}>
        <Link to="/todos/personal"   className="nav-card"><h2>Personal</h2></Link>
        <Link to="/todos/household"  className="nav-card"><h2>Household</h2></Link>
        <Link to="/todos/routines"   className="nav-card"><h2>Routines</h2></Link>
      </div>

      {/* Active todos */}
      {activeTodos.length > 0 && (
        <>
          <div className="section-label">Active · {activeTodos.length}</div>
          {activeTodos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} todos={todos} onDelete={handleDelete} onStatusChange={updateStatus} onEdit={openEdit} />
          ))}
        </>
      )}
      {activeTodos.length === 0 && (
        <div className="empty-state">No to-do items yet — tap + to add one</div>
      )}

      {/* Completed todos */}
      {doneTodos.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: '1.25rem' }}>Complete · {doneTodos.length}</div>
          {doneTodos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} todos={todos} onDelete={handleDelete} onStatusChange={updateStatus} onEdit={openEdit} />
          ))}
        </>
      )}

      {/* Add modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ overflowY: 'auto', maxHeight: '85vh' }}
          >
            <div className="modal-handle" />
            <h2 className="modal-title">{editingId ? 'Edit to-do' : 'New to-do'}</h2>

            <input
              className="form-input"
              placeholder="Title *"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              autoFocus
            />

            <textarea
              className="form-input"
              placeholder="Details"
              value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              rows={2}
              style={{ resize: 'none' }}
            />

            <div className="form-row">
              <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, subCategory: '' })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>

            <select className="form-select" style={{ width: '100%', marginBottom: '10px' }} value={form.subCategory} onChange={(e) => setForm({ ...form, subCategory: e.target.value })}>
              <option value="">Sub-category (optional)</option>
              {(SUBCATEGORIES[form.category] || []).map((s) => <option key={s}>{s}</option>)}
            </select>

            {/* Dates */}
            <div className="form-row">
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Start</div>
                <input className="form-input" style={{ margin: 0 }} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>End</div>
                <input className="form-input" style={{ margin: 0 }} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            {duration && (
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '10px', marginTop: '-2px' }}>
                Duration: {duration}
              </div>
            )}

            {/* Subtasks */}
            <div style={{ marginBottom: '12px' }}>
              <div style={labelStyle}>Subtasks</div>
              {form.subtasks.map((st, i) => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #ddd', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '12px', color: '#555' }}>{st.title}</span>
                  <button onClick={() => setForm({ ...form, subtasks: form.subtasks.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: '16px', padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="form-input"
                  style={{ margin: 0, flex: 1 }}
                  placeholder="Add a subtask..."
                  value={subtaskInput}
                  onChange={(e) => setSubtaskInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}
                />
                <button onClick={addSubtask} style={{ background: 'none', border: '0.5px solid #ADCBBA', borderRadius: '8px', padding: '0 14px', cursor: 'pointer', color: '#555', fontFamily: 'inherit', fontSize: '12px', whiteSpace: 'nowrap' }}>
                  Add
                </button>
              </div>
            </div>

            {/* Prerequisites */}
            {todos.filter((t) => t.id !== editingId).length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={labelStyle}>Prerequisites</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {todos.filter((t) => t.id !== editingId).map((t) => {
                    const sel = form.prerequisites.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          const next = sel
                            ? form.prerequisites.filter((id) => id !== t.id)
                            : [...form.prerequisites, t.id]
                          setForm({ ...form, prerequisites: next })
                        }}
                        style={{
                          padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
                          border: sel ? '0.5px solid #8F6779' : '0.5px solid #e0ddd8',
                          background: sel ? '#DED3D9' : 'white',
                          color: sel ? '#1A2920' : '#555',
                          fontSize: '11px', fontWeight: sel ? 500 : 400, fontFamily: 'inherit',
                        }}
                      >
                        {t.title}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Assignee */}
            {members.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={labelStyle}>Assign to</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {members.map((m) => {
                    const name   = m.nickname || m.displayName || 'Member'
                    const mStyle = COLOR_STYLES[m.color] || COLOR_STYLES.teal
                    const sel    = form.assignedTo === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setForm({ ...form, assignedTo: sel ? null : m.id })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          padding: '5px 10px 5px 6px', borderRadius: '20px', cursor: 'pointer',
                          border: sel ? `0.5px solid ${mStyle.color}` : '0.5px solid #e0ddd8',
                          background: sel ? mStyle.bg : 'white',
                          color: sel ? mStyle.color : '#555',
                          fontSize: '12px', fontWeight: sel ? 500 : 400, fontFamily: 'inherit',
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

            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.title.trim()}>
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add to-do'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle = {
  fontSize: '11px', fontWeight: 500, color: '#aaa',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px',
}

function TodoRow({ todo, todos, onDelete, onStatusChange, onEdit }) {
  const aStyle     = todo.assignedToColor ? (COLOR_STYLES[todo.assignedToColor] || COLOR_STYLES.teal) : null
  const duration   = formatDuration(todo.startDate, todo.endDate)
  const prereqs    = todos.filter((t) => todo.prerequisites?.includes(t.id))
  const isComplete = todo.status === 'Complete'

  const toggleSubtask = (stId) => {
    const updated = (todo.subtasks || []).map((s) => s.id === stId ? { ...s, completed: !s.completed } : s)
    updateDoc(doc(db, 'todos', todo.id), { subtasks: updated })
  }

  return (
    <div className={`task-card ${isComplete ? 'task-done' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <button
          className={`task-check ${isComplete ? 'task-check-done' : ''}`}
          onClick={() => onStatusChange(todo, isComplete ? 'Not yet started' : 'Complete')}
        >
          {isComplete && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>

        <div className="task-body">
          <div className="task-title">{todo.title}</div>
          {todo.details && (
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', marginTop: '2px' }}>{todo.details}</div>
          )}
          <div className="task-meta">
            {todo.category && <span className={`badge ${CATEGORY_STYLES[todo.category] || 'badge-gray'}`}>{todo.category}</span>}
            {todo.subCategory && <span className="badge badge-gray">{todo.subCategory}</span>}
            {todo.status   && <span className={`badge ${STATUS_STYLES[todo.status]}`}>{todo.status}</span>}
            {duration && <span className="task-date">{duration}</span>}

            {todo.assignedToName && aStyle ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#f5f4f1', borderRadius: '20px', padding: '2px 7px 2px 3px' }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: aStyle.bg, color: aStyle.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: 700 }}>
                  {initials(todo.assignedToName)}
                </span>
                <span style={{ fontSize: '10px', color: '#666', fontWeight: 500 }}>{todo.assignedToName.split(' ')[0]}</span>
              </span>
            ) : (
              !isComplete && <span style={{ fontSize: '10px', color: '#ccc' }}>Unassigned</span>
            )}

            {prereqs.length > 0 && (
              <span style={{ fontSize: '10px', color: '#aaa' }}>
                {prereqs.length} prereq{prereqs.length !== 1 ? 's' : ''}
              </span>
            )}
            {todo.subtasks?.length > 0 && (() => {
              const done  = todo.subtasks.filter((s) => s.completed).length
              const total = todo.subtasks.length
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: done === total ? '#8F6779' : '#aaa' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  {done}/{total}
                </span>
              )
            })()}
          </div>
        </div>

        <button className="task-delete" onClick={() => onEdit(todo)} style={{ color: '#bbb' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button className="task-delete" onClick={() => onDelete(todo.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6M9 6V4h6v2" />
          </svg>
        </button>
      </div>

      {todo.subtasks?.length > 0 && (
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '0.5px solid #f0ede8', paddingLeft: '30px' }}>
          {todo.subtasks.map((st) => (
            <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
              <button
                onClick={() => toggleSubtask(st.id)}
                style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, border: st.completed ? '1.5px solid #8F6779' : '1.5px solid #ddd', background: st.completed ? '#8F6779' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                {st.completed && (
                  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <span style={{ fontSize: '11px', color: st.completed ? '#bbb' : '#666', textDecoration: st.completed ? 'line-through' : 'none' }}>
                {st.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
