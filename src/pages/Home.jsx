import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import {
  collection, addDoc, updateDoc, doc, query, orderBy, onSnapshot,
  getDoc, setDoc, deleteField, serverTimestamp,
} from 'firebase/firestore'

const Hubs = [
  {
    to: '/todos',
    title: 'ToDos',
    subtitle: 'Home tasks & repairs',
    colorClass: 'card-teal',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2"/>
        <path d="M7 12l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    to: '/lists',
    title: 'Lists',
    subtitle: 'Shopping lists',
    colorClass: 'card-amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
  },
  {
    to: '/finances',
    title: 'Finances',
    subtitle: 'Mo Money Mo Problems',
    colorClass: 'card-blue',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />
      </svg>
    ),
  },
  {
    to: '/work',
    title: 'Work',
    subtitle: 'Desk Prison Stuff',
    colorClass: 'card-blue',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2" />
      </svg>
    ),
  },
]

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function nameInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

const TODO_CATEGORIES = ['General', 'Personal', 'Household', 'Work', 'Health', 'Errands']

function TaskRow({ todo, onComplete, todayStr, tomorrowStr }) {
  const isOverdue  = todo.endDate < todayStr
  const isToday    = todo.endDate === todayStr
  const dateLabel  = isOverdue ? 'Overdue' : isToday ? 'Today' : 'Tomorrow'
  const dateColor  = isOverdue ? '#993C1D' : isToday ? '#534AB7' : '#888'

  return (
    <div className="task-card" style={{ marginBottom: '6px' }}>
      <button
        className="task-check"
        onClick={() => onComplete(todo.id)}
        aria-label="Mark complete"
      />
      <div className="task-body">
        <div className="task-title">{todo.title}</div>
        <div className="task-meta">
          <span style={{ fontSize: '10px', color: dateColor, fontWeight: 500 }}>{dateLabel}</span>
        </div>
      </div>
    </div>
  )
}

function RoutineRow({ routine, onToggle }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 0', borderBottom: '0.5px solid #f5f4f1',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          border: '1.5px solid #ddd', background: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Mark done"
      />
      <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{routine.text}</span>
      {routine.room && (
        <span className="badge badge-gray" style={{ fontSize: '10px' }}>{routine.room}</span>
      )}
      {routine.timeOfDay && (
        <span style={{ fontSize: '10px', color: '#888', background: '#f5f4f1', borderRadius: '20px', padding: '2px 6px' }}>
          {routine.timeOfDay}
        </span>
      )}
    </div>
  )
}

export default function Home() {
  const { user } = useAuth()
  const now            = new Date()
  const hour           = now.getHours()
  const greeting       = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today          = now.getDate()
  const currentMonth   = now.getMonth()
  const currentYear    = now.getFullYear()
  const currentWeek    = Math.ceil(today / 7)
  const currentQuarter = Math.ceil((currentMonth + 1) / 3)
  const curMonthKey    = monthKey(currentYear, currentMonth)
  const curYearKey     = String(currentYear)
  const todayStr       = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(today).padStart(2, '0')}`
  const tomorrowDate   = new Date(now); tomorrowDate.setDate(today + 1)
  const tomorrowStr    = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`
  const curQuarterKey  = `Q${currentQuarter}`

  const [todos, setTodos]                   = useState([])
  const [personalRoutines, setPersonalRoutines] = useState([])
  const [personalComps, setPersonalComps]   = useState({})
  const [hhRoutines, setHhRoutines]         = useState([])
  const [hhMonthComps, setHhMonthComps]     = useState({})
  const [hhYearComps, setHhYearComps]       = useState({})
  const [myProfile, setMyProfile]           = useState(null)
  const [showTodoModal, setShowTodoModal]   = useState(false)
  const [todoTitle, setTodoTitle]           = useState('')
  const [todoCategory, setTodoCategory]     = useState('General')
  const [savingTodo, setSavingTodo]         = useState(false)

  // Todos
  useEffect(() => {
    const q = query(collection(db, 'todos'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => setTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [])

  // Personal routines
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'routines'), orderBy('createdAt'))
    return onSnapshot(q, (snap) => setPersonalRoutines(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [user])

  // Personal completions for current month
  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid, 'routineCompletions', curMonthKey))
      .then((snap) => setPersonalComps(snap.exists() ? snap.data() : {}))
  }, [user, curMonthKey])

  // Household routines
  useEffect(() => {
    const q = query(collection(db, 'householdRoutines'), orderBy('createdAt'))
    return onSnapshot(q, (snap) => setHhRoutines(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [])

  // Household monthly completions
  useEffect(() => {
    return onSnapshot(doc(db, 'householdRoutineTracking', curMonthKey), (snap) => {
      setHhMonthComps(snap.exists() ? snap.data() : {})
    })
  }, [curMonthKey])

  // Household yearly completions (for quarterly)
  useEffect(() => {
    return onSnapshot(doc(db, 'householdRoutineYearTracking', curYearKey), (snap) => {
      setHhYearComps(snap.exists() ? snap.data() : {})
    })
  }, [curYearKey])

  // My profile (for initials/color when completing household routines)
  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) setMyProfile(snap.data())
    })
  }, [user])

  // ── Derived data ──────────────────────────────────────────────────────────

  const dueTasks = todos.filter((t) =>
    t.status !== 'Complete' &&
    ['Work', 'Household', 'Personal'].includes(t.category) &&
    t.endDate && t.endDate <= tomorrowStr
  )
  const workTasks      = dueTasks.filter((t) => t.category === 'Work')
  const householdTasks = dueTasks.filter((t) => t.category === 'Household')
  const personalTasks  = dueTasks.filter((t) => t.category === 'Personal')

  const pendingDaily = [
    ...personalRoutines
      .filter((r) => r.frequency === 'daily' && !personalComps[r.id]?.[String(today)])
      .map((r) => ({ ...r, source: 'personal' })),
    ...hhRoutines
      .filter((r) => r.frequency === 'daily' && !hhMonthComps[r.id]?.[String(today)])
      .map((r) => ({ ...r, source: 'household' })),
  ]

  const pendingWeekly = [
    ...personalRoutines
      .filter((r) => r.frequency === 'weekly' && !personalComps[r.id]?.[String(currentWeek)])
      .map((r) => ({ ...r, source: 'personal' })),
    ...hhRoutines
      .filter((r) => r.frequency === 'weekly' && !hhMonthComps[r.id]?.[String(currentWeek)])
      .map((r) => ({ ...r, source: 'household' })),
  ]

  const pendingMonthly = [
    ...personalRoutines
      .filter((r) => r.frequency === 'monthly' && !personalComps[r.id]?.['done'])
      .map((r) => ({ ...r, source: 'personal' })),
    ...hhRoutines
      .filter((r) => r.frequency === 'monthly' && !hhMonthComps[r.id]?.['done'])
      .map((r) => ({ ...r, source: 'household' })),
  ]

  const pendingQuarterly = hhRoutines
    .filter((r) => r.frequency === 'quarterly' && !hhYearComps[r.id]?.[curQuarterKey])
    .map((r) => ({ ...r, source: 'household' }))

  const hasAnyTasks    = dueTasks.length > 0
  const hasAnyRoutines = pendingDaily.length + pendingWeekly.length + pendingMonthly.length + pendingQuarterly.length > 0

  // ── Actions ───────────────────────────────────────────────────────────────

  const markTaskDone = (id) => updateDoc(doc(db, 'todos', id), { status: 'Complete' })

  const togglePersonalRoutine = async (routineId, ck) => {
    const current = personalComps[routineId]?.[ck] || false
    setPersonalComps((prev) => ({
      ...prev,
      [routineId]: { ...(prev[routineId] || {}), [ck]: !current },
    }))
    await setDoc(
      doc(db, 'users', user.uid, 'routineCompletions', curMonthKey),
      { [routineId]: { [ck]: !current } },
      { merge: true }
    )
  }

  const toggleHhMonthRoutine = async (routineId, ck) => {
    const current = hhMonthComps[routineId]?.[ck]
    if (current) {
      setHhMonthComps((prev) => {
        const next = { ...prev }
        const rd = { ...(next[routineId] || {}) }
        delete rd[ck]
        next[routineId] = rd
        return next
      })
      await setDoc(doc(db, 'householdRoutineTracking', curMonthKey), { [routineId]: { [ck]: deleteField() } }, { merge: true })
    } else {
      const entry = {
        uid: user?.uid || '',
        initials: nameInitials(myProfile?.nickname || user?.displayName),
        color: myProfile?.color || 'teal',
      }
      setHhMonthComps((prev) => ({ ...prev, [routineId]: { ...(prev[routineId] || {}), [ck]: entry } }))
      await setDoc(doc(db, 'householdRoutineTracking', curMonthKey), { [routineId]: { [ck]: entry } }, { merge: true })
    }
  }

  const toggleHhYearRoutine = async (routineId, ck) => {
    const current = hhYearComps[routineId]?.[ck]
    if (current) {
      setHhYearComps((prev) => {
        const next = { ...prev }
        const rd = { ...(next[routineId] || {}) }
        delete rd[ck]
        next[routineId] = rd
        return next
      })
      await setDoc(doc(db, 'householdRoutineYearTracking', curYearKey), { [routineId]: { [ck]: deleteField() } }, { merge: true })
    } else {
      const entry = {
        uid: user?.uid || '',
        initials: nameInitials(myProfile?.nickname || user?.displayName),
        color: myProfile?.color || 'teal',
      }
      setHhYearComps((prev) => ({ ...prev, [routineId]: { ...(prev[routineId] || {}), [ck]: entry } }))
      await setDoc(doc(db, 'householdRoutineYearTracking', curYearKey), { [routineId]: { [ck]: entry } }, { merge: true })
    }
  }

  const handleRoutineToggle = (routine, ck, isYear = false) => {
    if (routine.source === 'personal') {
      togglePersonalRoutine(routine.id, ck)
    } else if (isYear) {
      toggleHhYearRoutine(routine.id, ck)
    } else {
      toggleHhMonthRoutine(routine.id, ck)
    }
  }

  const quickAddTodo = async () => {
    if (!todoTitle.trim()) return
    setSavingTodo(true)
    await addDoc(collection(db, 'todos'), {
      title: todoTitle.trim(),
      category: todoCategory,
      status: 'Not yet started',
      prerequisites: [],
      subtasks: [],
      details: null,
      createdAt: serverTimestamp(),
    })
    setTodoTitle('')
    setTodoCategory('General')
    setShowTodoModal(false)
    setSavingTodo(false)
  }

  const closeTodoModal = () => {
    setShowTodoModal(false)
    setTodoTitle('')
    setTodoCategory('General')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">

      {/* Greeting */}
      <div className="home-greeting">
        <h1>{greeting}</h1>
        <p>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Hubs */}
      <div className="section-label">Hubs</div>
      <div className="dashboard-grid">
        {Hubs.map((section) => (
          <Link key={section.to} to={section.to} className={`dashboard-card ${section.colorClass}`}>
            <div className="card-icon">{section.icon}</div>
            <div className="card-title">{section.title}</div>
            <div className="card-subtitle">{section.subtitle}</div>
          </Link>
        ))}
      </div>

      {/* Quick Add */}
      <div style={{ marginTop: '1.5rem' }}>
        <div className="section-label">Quick Add</div>
        <Link to="/lists/shopping?add=consumable" className="quick-add-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16">
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          Add to shopping list
        </Link>
        <button
          onClick={() => setShowTodoModal(true)}
          className="quick-add-bar"
          style={{ marginTop: '8px', width: '100%', border: '0.5px solid #e8e6e1', background: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', color: 'var(--text-color)', textAlign: 'left' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16" style={{ color: 'var(--secondary)', flexShrink: 0 }}>
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          Add a to-do
        </button>
      </div>

      {/* Tasks due today / tomorrow / overdue */}
      {hasAnyTasks && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="section-label">Due Soon</div>
          {[
            { label: 'Work',      tasks: workTasks },
            { label: 'Household', tasks: householdTasks },
            { label: 'Personal',  tasks: personalTasks },
          ].filter(({ tasks }) => tasks.length > 0).map(({ label, tasks }) => (
            <div key={label}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', marginTop: '10px' }}>
                {label}
              </div>
              {tasks.map((todo) => (
                <TaskRow
                  key={todo.id}
                  todo={todo}
                  onComplete={markTaskDone}
                  todayStr={todayStr}
                  tomorrowStr={tomorrowStr}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Pending routines */}
      {hasAnyRoutines && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="section-label">Pending Routines</div>
          <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #e8e6e1', padding: '4px 14px 4px' }}>
            {[
              { label: 'Today',      items: pendingDaily,     ck: String(today),        isYear: false },
              { label: 'This Week',  items: pendingWeekly,    ck: String(currentWeek),  isYear: false },
              { label: 'This Month', items: pendingMonthly,   ck: 'done',               isYear: false },
              { label: curQuarterKey, items: pendingQuarterly, ck: curQuarterKey,        isYear: true  },
            ].filter(({ items }) => items.length > 0).map(({ label, items, ck, isYear }, gi, arr) => (
              <div key={label} style={{ marginBottom: gi < arr.length - 1 ? '12px' : '0', paddingTop: gi > 0 ? '12px' : '4px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>
                  {label}
                </div>
                {items.map((r) => (
                  <RoutineRow
                    key={r.id}
                    routine={r}
                    onToggle={() => handleRoutineToggle(r, ck, isYear)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick add to-do modal */}
      {showTodoModal && (
        <div className="modal-overlay" onClick={closeTodoModal}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">New to-do</h2>
            <input
              className="form-input"
              placeholder="Title *"
              value={todoTitle}
              onChange={(e) => setTodoTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') quickAddTodo() }}
              autoFocus
            />
            <select
              className="form-select"
              style={{ width: '100%', marginBottom: '12px' }}
              value={todoCategory}
              onChange={(e) => setTodoCategory(e.target.value)}
            >
              {TODO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button
              className="btn-primary"
              onClick={quickAddTodo}
              disabled={savingTodo || !todoTitle.trim()}
            >
              {savingTodo ? 'Adding...' : 'Add to-do'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
