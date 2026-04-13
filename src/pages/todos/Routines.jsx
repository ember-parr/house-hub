import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import {
  collection, doc, query, orderBy,
  onSnapshot, setDoc, getDoc,
} from 'firebase/firestore'

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function weeksInMonth(year, month) {
  return Math.ceil(daysInMonth(year, month) / 7)
}

export default function Routines() {
  const { user } = useAuth()
  const now = new Date()
  const [year, setYear]           = useState(now.getFullYear())
  const [month, setMonth]         = useState(now.getMonth())
  const [routines, setRoutines]   = useState([])
  const [completions, setCompletions] = useState({})
  const [collapsed, setCollapsed] = useState(true)

  const key = monthKey(year, month)

  // Real-time routines
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'routines'), orderBy('createdAt'))
    return onSnapshot(q, (snap) => {
      setRoutines(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  // Load completions for current month
  useEffect(() => {
    if (!user) return
    const load = async () => {
      const snap = await getDoc(doc(db, 'users', user.uid, 'routineCompletions', key))
      setCompletions(snap.exists() ? snap.data() : {})
    }
    load()
  }, [user, key])

  const navigate = (dir) => {
    let m = month + dir, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y)
  }

  const toggle = async (routineId, ck) => {
    const current = completions[routineId]?.[ck] || false
    const updated = { ...completions, [routineId]: { ...(completions[routineId] || {}), [ck]: !current } }
    setCompletions(updated)
    await setDoc(
      doc(db, 'users', user.uid, 'routineCompletions', key),
      { [routineId]: { [ck]: !current } },
      { merge: true }
    )
  }

  const isChecked = (routineId, ck) => completions[routineId]?.[ck] === true

  const daily   = routines.filter((r) => r.frequency === 'daily').sort((a, b) => {
    // AM before PM before null
    const order = { AM: 0, PM: 1, null: 2 }
    return (order[a.timeOfDay] ?? 2) - (order[b.timeOfDay] ?? 2)
  })
  const weekly  = routines.filter((r) => r.frequency === 'weekly')
  const monthly = routines.filter((r) => r.frequency === 'monthly')

  const days  = daysInMonth(year, month)
  const weeks = weeksInMonth(year, month)

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const today = now.getDate()

  // Completion fraction helper
  const fraction = (routineId, total, keyFn) => {
    const done = Array.from({ length: total }, (_, i) => keyFn(i + 1))
      .filter((k) => isChecked(routineId, k)).length
    return `${done}/${total}`
  }

  const hasAny = routines.length > 0

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/todos" className="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          To-Dos
        </Link>
      </div>

      <h1 className="page-title" style={{ marginBottom: '1rem' }}>Routines</h1>

      {/* Month nav */}
      <div className="profile-card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => navigate(-1)} className="bl-nav-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14 }}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ fontSize: '15px', fontWeight: 500 }}>{monthLabel(year, month)}</div>
          <button onClick={() => navigate(1)} className="bl-nav-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* My Routines — collapsible */}
      <div className="profile-card">
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
        >
          <div className="profile-section-title" style={{ margin: 0 }}>My Routines</div>
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{ width: 16, height: 16, color: '#aaa', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {!collapsed && (
          <div style={{ marginTop: '16px' }}>
            {!hasAny && (
              <div style={{ fontSize: '13px', color: '#aaa', padding: '8px 0' }}>
                No routines yet — add them from your Profile page.
              </div>
            )}

            {/* ── Daily ── */}
            {daily.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Daily
                </div>
                {daily.map((r) => {
                  const frac = fraction(r.id, days, (d) => String(d))
                  return (
                    <div key={r.id} style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{r.text}</span>
                        {r.timeOfDay && (
                          <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '20px', background: '#E6F1FB', color: '#185FA5' }}>
                            {r.timeOfDay}
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: '#ccc', marginLeft: 'auto' }}>{frac}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                          const checked = isChecked(r.id, String(d))
                          const isToday = isCurrentMonth && d === today
                          return (
                            <button
                              key={d}
                              onClick={() => toggle(r.id, String(d))}
                              style={{
                                width: 28, height: 28, borderRadius: 6,
                                border: isToday && !checked ? '1.5px solid #534AB7' : checked ? 'none' : '0.5px solid #e0ddd8',
                                background: checked ? '#534AB7' : 'white',
                                color: checked ? 'white' : isToday ? '#534AB7' : '#888',
                                fontSize: 11, fontWeight: checked || isToday ? 600 : 400,
                                cursor: 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {d}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Weekly ── */}
            {weekly.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Weekly
                </div>
                {weekly.map((r) => {
                  const frac = fraction(r.id, weeks, (w) => String(w))
                  return (
                    <div key={r.id} style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{r.text}</span>
                        <span style={{ fontSize: '11px', color: '#ccc', marginLeft: 'auto' }}>{frac}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => {
                          const checked = isChecked(r.id, String(w))
                          return (
                            <button
                              key={w}
                              onClick={() => toggle(r.id, String(w))}
                              style={{
                                flex: 1, height: 32, borderRadius: 8,
                                border: checked ? 'none' : '0.5px solid #e0ddd8',
                                background: checked ? '#1D9E75' : 'white',
                                color: checked ? 'white' : '#888',
                                fontSize: 11, fontWeight: checked ? 600 : 400,
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              Wk {w}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Monthly ── */}
            {monthly.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Monthly
                </div>
                {monthly.map((r, i) => {
                  const checked = isChecked(r.id, 'done')
                  return (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 0',
                      borderBottom: i < monthly.length - 1 ? '0.5px solid #f5f4f1' : 'none',
                    }}>
                      <button
                        onClick={() => toggle(r.id, 'done')}
                        style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          border: checked ? 'none' : '0.5px solid #e0ddd8',
                          background: checked ? '#854F0B' : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {checked && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" style={{ width: 12, height: 12 }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                      <span style={{ fontSize: '13px', fontWeight: 500, opacity: checked ? 0.5 : 1 }}>{r.text}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
