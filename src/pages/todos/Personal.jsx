import { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot, getDocs,
  where, serverTimestamp,
} from 'firebase/firestore'

const PAGE_CATEGORIES = ['Personal', 'Health', 'Errands']

const STATUSES = ['Not yet started', 'In progress', 'Blocked', 'Complete']

const STATUS_STYLES = {
  'Not yet started': 'badge-gray',
  'In progress':     'badge-secondary',
  'Blocked':         'badge-coral',
  'Complete':        'badge-green',
}

const CATEGORY_STYLES = {
  Personal: 'badge-accent',
  Health:   'badge-green',
  Errands:  'badge-secondary',
}

const SUBCATEGORIES = {
  Personal: ['Finance', 'Career', 'Social', 'Learning', 'Other'],
  Health:   ['Exercise', 'Diet', 'Medical', 'Mental', 'Other'],
  Errands:  ['Shopping', 'Transportation', 'Appointments', 'Other'],
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

function fmtEndDate(end) {
  if (!end) return null
  return new Date(end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function makeEmptyForm(uid = null) {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return {
    title: '', details: '', prerequisites: [],
    category: 'Personal', subCategory: '', assignedTo: uid,
    endDate: d.toISOString().split('T')[0], status: 'Not yet started',
    subtasks: [],
  }
}

export default function Personal() {
  const { user } = useAuth()
  const [todos, setTodos]         = useState([])
  const [allTodos, setAllTodos]   = useState([])
  const [members, setMembers]     = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm]           = useState(makeEmptyForm)
  const [saving, setSaving]       = useState(false)
  const [subtaskInput, setSubtaskInput] = useState('')
  const [activeFilters, setActiveFilters] = useState(new Set())

  const toggleFilter = (sub) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(sub)) next.delete(sub)
      else next.add(sub)
      return next
    })
  }

  // Personal + Health + Errands todos
  useEffect(() => {
    const q = query(
      collection(db, 'todos'),
      where('category', 'in', PAGE_CATEGORIES),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q, (snap) => {
      setTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // All todos for prerequisites picker
  useEffect(() => {
    const q = query(collection(db, 'todos'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setAllTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // Household members
  useEffect(() => {
    getDocs(query(collection(db, 'users'), orderBy('joinedAt'))).then((snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.userType === 'admin' || m.userType === 'contributor'))
    })
  }, [])

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setForm(makeEmptyForm(user?.uid))
    setSubtaskInput('')
  }

  const openEdit = (todo) => {
    setForm({
      title:         todo.title        || '',
      details:       todo.details      || '',
      prerequisites: todo.prerequisites || [],
      category:      todo.category     || 'Personal',
      subCategory:   todo.subCategory  || '',
      assignedTo:    todo.assignedTo   || null,
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
      endDate:         form.endDate   || null,
      status:          form.prerequisites.length > 0 && allTodos.some((t) => form.prerequisites.includes(t.id) && t.status !== 'Complete') ? 'Blocked' : form.status,
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

  const updateStatus = async (todo, status) => {
    await updateDoc(doc(db, 'todos', todo.id), { status })
    if (status === 'Complete') {
      const dependents = allTodos.filter((t) => t.prerequisites?.includes(todo.id) && t.status === 'Blocked')
      for (const dep of dependents) {
        const allDone = dep.prerequisites.every((pid) =>
          pid === todo.id ? true : allTodos.find((t) => t.id === pid)?.status === 'Complete'
        )
        if (allDone) await updateDoc(doc(db, 'todos', dep.id), { status: 'Not yet started' })
      }
    }
  }

  const availableSubCats = [...new Set(todos.map((t) => t.subCategory).filter(Boolean))].sort()
  const applyFilters = (list) =>
    activeFilters.size === 0 ? list : list.filter((t) => activeFilters.has(t.subCategory))

  const activeTodos = applyFilters(todos.filter((t) => t.status !== 'Complete'))
  const doneTodos   = applyFilters(todos.filter((t) => t.status === 'Complete'))
  const prereqOptions = allTodos.filter((t) => t.id !== editingId && t.status !== 'Complete')

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Personal</h1>
        <button className="icon-btn" onClick={() => { setForm(makeEmptyForm(user?.uid)); setEditingId(null); setShowModal(true) }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {availableSubCats.length > 0 && (
        <div className="filter-row">
          {availableSubCats.map((sub) => (
            <button
              key={sub}
              className={`chip ${activeFilters.has(sub) ? 'chip-active' : ''}`}
              onClick={() => toggleFilter(sub)}
            >
              {sub}
            </button>
          ))}
        </div>
      )}

      {activeTodos.length > 0 && (
        <>
          <div className="section-label">Active · {activeTodos.length}</div>
          {activeTodos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} allTodos={allTodos} onDelete={handleDelete} onStatusChange={updateStatus} onEdit={openEdit} />
          ))}
        </>
      )}
      {activeTodos.length === 0 && (
        <div className="empty-state">No personal to-dos — tap + to add one</div>
      )}

      {doneTodos.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: '1.25rem' }}>Complete · {doneTodos.length}</div>
          {doneTodos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} allTodos={allTodos} onDelete={handleDelete} onStatusChange={updateStatus} onEdit={openEdit} />
          ))}
        </>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ overflowY: 'auto', maxHeight: '85vh' }}
          >
            <div className="modal-handle" />
            <h2 className="modal-title">{editingId ? 'Edit to-do' : 'New personal to-do'}</h2>

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
                {PAGE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>

            <select className="form-select" style={{ width: '100%', marginBottom: '10px' }} value={form.subCategory} onChange={(e) => setForm({ ...form, subCategory: e.target.value })}>
              <option value="">Sub-category (optional)</option>
              {(SUBCATEGORIES[form.category] || []).map((s) => <option key={s}>{s}</option>)}
            </select>

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

            {/* Goal date */}
            <div style={{ marginBottom: '12px' }}>
              <div style={labelStyle}>Goal date</div>
              <input className="form-input" style={{ margin: 0 }} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>

            {/* Prerequisites */}
            {prereqOptions.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={labelStyle}>Prerequisites</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {prereqOptions.map((t) => {
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

function TodoRow({ todo, allTodos, onDelete, onStatusChange, onEdit }) {
  const aStyle     = todo.assignedToColor ? (COLOR_STYLES[todo.assignedToColor] || COLOR_STYLES.teal) : null
  const endDate    = fmtEndDate(todo.endDate)
  const prereqs    = allTodos.filter((t) => todo.prerequisites?.includes(t.id))
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
            {todo.status && <span className={`badge ${STATUS_STYLES[todo.status]}`}>{todo.status}</span>}
            {endDate && <span className="task-date">{endDate}</span>}

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
