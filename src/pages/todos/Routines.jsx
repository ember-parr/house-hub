import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { useUserRole } from '../../hooks/useUserRole'
import {
  collection, doc, query, orderBy,
  onSnapshot, setDoc, getDoc, deleteField,
  addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'

const COLOR_STYLES = {
  teal:   { bg: '#E1F5EE', color: '#0F6E56' },
  purple: { bg: '#EEEDFE', color: '#534AB7' },
  amber:  { bg: '#FAEEDA', color: '#854F0B' },
  coral:  { bg: '#FAECE7', color: '#993C1D' },
  blue:   { bg: '#E6F1FB', color: '#185FA5' },
  green:  { bg: '#EAF3DE', color: '#3B6D11' },
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

function mondaysInMonth(year, month) {
  const firstDow = new Date(year, month, 1).getDay()
  const firstMonday = firstDow === 1 ? 1 : 1 + (8 - firstDow) % 7
  let count = 0
  for (let d = firstMonday; d <= daysInMonth(year, month); d += 7) count++
  return count
}

function getActiveZone(date) {
  const y = date.getFullYear(), m = date.getMonth(), day = date.getDate()
  const firstDow = new Date(y, m, 1).getDay()
  const firstMonday = firstDow === 1 ? 1 : 1 + (8 - firstDow) % 7
  if (day < firstMonday) {
    // Before first Monday — show zone 5 if previous month had 5 Mondays
    const py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1
    return mondaysInMonth(py, pm) >= 5 ? 5 : null
  }
  return Math.min(Math.floor((day - firstMonday) / 7) + 1, 5)
}

function nameInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

const HH_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'annual']
const HH_ROOMS = ['Kitchen', 'Living Room', 'Primary Bedroom', 'Primary Bathroom', 'Entryway',
  'Stairs', 'Loft', 'Ember Office', 'Justin Office', 'Aiden Room', 'Laundry Room', 
  'Upstairs Bath', 'Guest Bathroom', 'Guest Bedroom', 'Garage', 'Outdoor', 'Basement', 'Other']

export default function Routines() {
  const { user } = useAuth()
  const { isAdmin, isContributor } = useUserRole()
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [viewedZone, setViewedZone] = useState(() => getActiveZone(now) || 1)

  // Personal routines
  const [routines, setRoutines]       = useState([])
  const [completions, setCompletions] = useState({})
  const [collapsed, setCollapsed]     = useState(true)

  // Daily recap (today + 3 days back)
  const [recaps, setRecaps]                 = useState(null)  // null = loading; {} once loaded
  const [recapDrafts, setRecapDrafts]       = useState({})
  const [recapSaving, setRecapSaving]       = useState({})
  const [recapSavedFlag, setRecapSavedFlag] = useState({})

  // Household management
  const [hhCollapsed, setHhCollapsed]         = useState(true)
  const [hhRoutines, setHhRoutines]           = useState([])
  const [hhModal, setHhModal]                 = useState(null)
  const [roomZones, setRoomZones]             = useState({})
  const [roomZonesCollapsed, setRoomZonesCollapsed] = useState(true)
  const [hhRoomFilter, setHhRoomFilter]       = useState(null) // null = All, 'unassigned', or a room name

  // Household tracker UI state
  const [trackerRoomFilter, setTrackerRoomFilter]       = useState(null) // null = All, 'unassigned', or a room name
  const [trackerFreqFilter, setTrackerFreqFilter]       = useState(null) // null = All, or one of HH_FREQUENCIES
  const [collapsedTrackerRooms, setCollapsedTrackerRooms] = useState(() => new Set())

  // Household tracker
  const [trackerCompletions, setTrackerCompletions]         = useState({})
  const [trackerYearCompletions, setTrackerYearCompletions] = useState({})
  const [myProfile, setMyProfile]                           = useState(null)
  const [lastCompletedMap, setLastCompletedMap]             = useState({})

  const key     = monthKey(year, month)
  const yearKey = String(year)

  const canSeeHousehold = isAdmin || isContributor
  const canCreate       = isAdmin || isContributor
  const canEdit         = isAdmin

  // Personal routines — real-time
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'routines'), orderBy('createdAt'))
    return onSnapshot(q, (snap) => {
      setRoutines(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  // Personal completions for current month
  useEffect(() => {
    if (!user) return
    const load = async () => {
      const snap = await getDoc(doc(db, 'users', user.uid, 'routineCompletions', key))
      setCompletions(snap.exists() ? snap.data() : {})
    }
    load()
  }, [user, key])

  // Daily recap — last 4 days (today + 3 past)
  const recentDays = (() => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return Array.from({ length: 4 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      return { key: ymd(d), date: d }
    })
  })()
  const recentDayKeysStr = recentDays.map((d) => d.key).join('|')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = async () => {
      const keys = recentDayKeysStr.split('|')
      const snaps = await Promise.all(
        keys.map((k) => getDoc(doc(db, 'users', user.uid, 'dailyRecaps', k)))
      )
      if (cancelled) return
      const map = {}
      const drafts = {}
      snaps.forEach((s, i) => {
        const k = keys[i]
        const data = s.exists() ? s.data() : null
        map[k] = data
        if (data) drafts[k] = data.content || ''
      })
      setRecaps(map)
      // Preserve any in-progress drafts the user has typed but not saved.
      setRecapDrafts((prev) => ({ ...drafts, ...prev }))
    }
    load()
    return () => { cancelled = true }
  }, [user, recentDayKeysStr])

  const saveRecap = async (recapKey) => {
    const content = (recapDrafts[recapKey] || '').trim()
    if (!content || !user) return
    setRecapSaving((p) => ({ ...p, [recapKey]: true }))
    const existing = recaps?.[recapKey]
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'dailyRecaps', recapKey),
        {
          date: recapKey,
          content,
          updatedAt: serverTimestamp(),
          ...(existing ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      )
      setRecaps((p) => ({ ...(p || {}), [recapKey]: { ...(p?.[recapKey] || {}), date: recapKey, content } }))
      setRecapSavedFlag((p) => ({ ...p, [recapKey]: true }))
      setTimeout(() => {
        setRecapSavedFlag((p) => ({ ...p, [recapKey]: false }))
      }, 2000)
    } finally {
      setRecapSaving((p) => ({ ...p, [recapKey]: false }))
    }
  }

  // Household routines — real-time
  useEffect(() => {
    const q = query(collection(db, 'householdRoutines'), orderBy('createdAt'))
    return onSnapshot(q, (snap) => {
      setHhRoutines(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // Room → zone assignments
  useEffect(() => {
    return onSnapshot(doc(db, 'householdConfig', 'roomZones'), (snap) => {
      setRoomZones(snap.exists() ? snap.data() : {})
    })
  }, [])

  // Household tracker completions — real-time (monthly)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'householdRoutineTracking', key), (snap) => {
      setTrackerCompletions(snap.exists() ? snap.data() : {})
    })
    return unsub
  }, [key])

  // Household tracker completions — real-time (yearly: quarterly + annual)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'householdRoutineYearTracking', yearKey), (snap) => {
      setTrackerYearCompletions(snap.exists() ? snap.data() : {})
    })
    return unsub
  }, [yearKey])

  // Current user profile (for color + initials when logging completions)
  useEffect(() => {
    if (!user) return
    const load = async () => {
      const snap = await getDoc(doc(db, 'users', user.uid))
      if (snap.exists()) setMyProfile(snap.data())
    }
    load()
  }, [user])

  // Last-completed history for weekly / monthly / quarterly / annual
  useEffect(() => {
    if (!hhRoutines.length) return
    const load = async () => {
      const n = new Date()
      const ny = n.getFullYear()
      const nm = n.getMonth()

      // Build last-12-months keys (most recent first)
      const monthKeys = Array.from({ length: 12 }, (_, i) => {
        let m = nm - i, y = ny
        if (m < 0) { m += 12; y-- }
        return monthKey(y, m)
      })

      // Build last-3-year keys (most recent first)
      const yearKeys = [String(ny), String(ny - 1), String(ny - 2)]

      const [monthSnaps, yearSnaps] = await Promise.all([
        Promise.all(monthKeys.map((mk) => getDoc(doc(db, 'householdRoutineTracking', mk)))),
        Promise.all(yearKeys.map((yk) => getDoc(doc(db, 'householdRoutineYearTracking', yk)))),
      ])

      const result = {}

      for (const r of hhRoutines) {
        if (r.frequency === 'weekly') {
          for (let i = 0; i < monthSnaps.length; i++) {
            const snap = monthSnaps[i]
            if (!snap.exists()) continue
            const data = snap.data()
            const entry = data[r.id]
            if (!entry) continue
            const completedWeeks = Object.keys(entry).map(Number).filter((n) => !isNaN(n) && entry[String(n)])
            if (completedWeeks.length > 0) {
              const lastWk = Math.max(...completedWeeks)
              const [ky, km] = monthKeys[i].split('-').map(Number)
              result[r.id] = `Wk ${lastWk}, ${new Date(ky, km - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}`
              break
            }
          }
        } else if (r.frequency === 'monthly') {
          for (let i = 0; i < monthSnaps.length; i++) {
            const snap = monthSnaps[i]
            if (!snap.exists()) continue
            const data = snap.data()
            if (data[r.id]?.['done']) {
              const [ky, km] = monthKeys[i].split('-').map(Number)
              result[r.id] = new Date(ky, km - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
              break
            }
          }
        } else if (r.frequency === 'quarterly') {
          outer: for (let i = 0; i < yearSnaps.length; i++) {
            const snap = yearSnaps[i]
            if (!snap.exists()) continue
            const data = snap.data()
            for (const qk of ['Q4', 'Q3', 'Q2', 'Q1']) {
              if (data[r.id]?.[qk]) {
                result[r.id] = `${qk} '${yearKeys[i].slice(2)}`
                break outer
              }
            }
          }
        } else if (r.frequency === 'annual') {
          for (let i = 0; i < yearSnaps.length; i++) {
            const snap = yearSnaps[i]
            if (!snap.exists()) continue
            const data = snap.data()
            if (data[r.id]?.['done']) {
              result[r.id] = yearKeys[i]
              break
            }
          }
        }
      }

      setLastCompletedMap(result)
    }
    load()
  }, [hhRoutines])

  const navigate = (dir) => {
    let m = month + dir, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y)
    const isCurrent = y === now.getFullYear() && m === now.getMonth()
    setViewedZone(isCurrent ? (getActiveZone(now) || 1) : 1)
  }

  const viewedMonthZones = mondaysInMonth(year, month)

  // Personal toggle
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

  // Tracker helpers
  const myInitials = nameInitials(myProfile?.nickname || user?.displayName)
  const myColor    = myProfile?.color || 'teal'

  const getTracked     = (routineId, ck) => trackerCompletions[routineId]?.[ck] || null
  const getTrackedYear = (routineId, ck) => trackerYearCompletions[routineId]?.[ck] || null

  const toggleTracker = async (routineId, ck) => {
    const current = getTracked(routineId, ck)
    if (current) {
      const updated = { ...trackerCompletions }
      const routineData = { ...(updated[routineId] || {}) }
      delete routineData[ck]
      updated[routineId] = routineData
      setTrackerCompletions(updated)
      await setDoc(doc(db, 'householdRoutineTracking', key), { [routineId]: { [ck]: deleteField() } }, { merge: true })
    } else {
      const entry = { uid: user.uid, initials: myInitials, color: myColor }
      const updated = { ...trackerCompletions, [routineId]: { ...(trackerCompletions[routineId] || {}), [ck]: entry } }
      setTrackerCompletions(updated)
      await setDoc(doc(db, 'householdRoutineTracking', key), { [routineId]: { [ck]: entry } }, { merge: true })
    }
  }

  const toggleTrackerYear = async (routineId, ck) => {
    const current = getTrackedYear(routineId, ck)
    if (current) {
      const updated = { ...trackerYearCompletions }
      const routineData = { ...(updated[routineId] || {}) }
      delete routineData[ck]
      updated[routineId] = routineData
      setTrackerYearCompletions(updated)
      await setDoc(doc(db, 'householdRoutineYearTracking', yearKey), { [routineId]: { [ck]: deleteField() } }, { merge: true })
    } else {
      const entry = { uid: user.uid, initials: myInitials, color: myColor }
      const updated = { ...trackerYearCompletions, [routineId]: { ...(trackerYearCompletions[routineId] || {}), [ck]: entry } }
      setTrackerYearCompletions(updated)
      await setDoc(doc(db, 'householdRoutineYearTracking', yearKey), { [routineId]: { [ck]: entry } }, { merge: true })
    }
  }

  // Household CRUD
  const saveHhRoutine = async () => {
    if (!hhModal?.text?.trim() || !user) return
    const isDaily = hhModal.frequency === 'daily'
    const resolvedZone = hhModal.zone
      ? Number(hhModal.zone)
      : (hhModal.room && roomZones[hhModal.room]) ? roomZones[hhModal.room] : null
    if (hhModal.id) {
      await updateDoc(doc(db, 'householdRoutines', hhModal.id), {
        text:      hhModal.text.trim(),
        timeOfDay: isDaily ? (hhModal.timeOfDay || 'AM') : null,
        room:      hhModal.room || null,
        zone:      resolvedZone,
      })
    } else {
      await addDoc(collection(db, 'householdRoutines'), {
        text:      hhModal.text.trim(),
        frequency: hhModal.frequency,
        timeOfDay: isDaily ? (hhModal.timeOfDay || 'AM') : null,
        room:      hhModal.room || null,
        zone:      resolvedZone,
        createdAt: serverTimestamp(),
      })
    }
    setHhModal(null)
  }

  const saveRoomZone = async (room, zone) => {
    const updated = zone ? { ...roomZones, [room]: zone } : { ...roomZones }
    if (!zone) delete updated[room]
    setRoomZones(updated)
    await setDoc(doc(db, 'householdConfig', 'roomZones'), updated)
  }

  const deleteHhRoutine = async (id) => {
    await deleteDoc(doc(db, 'householdRoutines', id))
    setHhModal(null)
  }

  const hhByFreq = (freq) => {
    const items = hhRoutines.filter((r) => r.frequency === freq)
    if (freq === 'daily') {
      return items.sort((a, b) => {
        const order = { AM: 0, PM: 1, null: 2 }
        return (order[a.timeOfDay] ?? 2) - (order[b.timeOfDay] ?? 2)
      })
    }
    return items
  }

  const personal = {
    daily: routines.filter((r) => r.frequency === 'daily').sort((a, b) => {
      const order = { AM: 0, PM: 1, null: 2 }
      return (order[a.timeOfDay] ?? 2) - (order[b.timeOfDay] ?? 2)
    }),
    weekly:  routines.filter((r) => r.frequency === 'weekly'),
    monthly: routines.filter((r) => r.frequency === 'monthly'),
  }

  const days    = daysInMonth(year, month)
  const weeks   = weeksInMonth(year, month)

  const activeZone     = getActiveZone(now)
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const isCurrentYear  = year === now.getFullYear()
  const today          = now.getDate()
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3)

  // Personal fraction helpers
  const fraction = (routineId, total, keyFn) => {
    const done = Array.from({ length: total }, (_, i) => keyFn(i + 1))
      .filter((k) => isChecked(routineId, k)).length
    return `${done}/${total}`
  }

  // Tracker fraction helpers
  const trackerFraction = (routineId, total, keyFn) => {
    const done = Array.from({ length: total }, (_, i) => keyFn(i + 1))
      .filter((k) => !!getTracked(routineId, k)).length
    return `${done}/${total}`
  }

  const trackerFractionYear = (routineId, keys) => {
    const done = keys.filter((k) => !!getTrackedYear(routineId, k)).length
    return `${done}/${keys.length}`
  }

  const hasAny = routines.length > 0

  // Rooms that actually have routines, in HH_ROOMS order
  const trackerRooms = HH_ROOMS.filter((room) => hhRoutines.some((r) => r.room === room))
  const trackerUnassigned = hhRoutines.filter((r) => !r.room)

  const renderTrackerGroup = (groupItems) => {
    const quarterKeys = ['Q1', 'Q2', 'Q3', 'Q4']
    return HH_FREQUENCIES.map((freq) => {
      let freqItems = groupItems.filter((r) => r.frequency === freq)
      if (freq === 'monthly') {
        freqItems = freqItems.filter((r) => !r.zone || r.zone === viewedZone)
      }
      if (freq === 'daily') {
        freqItems = [...freqItems].sort((a, b) => {
          const order = { AM: 0, PM: 1, null: 2 }
          return (order[a.timeOfDay] ?? 2) - (order[b.timeOfDay] ?? 2)
        })
      }
      if (freqItems.length === 0) return null

      return (
        <div key={freq} style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#ccc', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            {freq}
          </div>

          {freqItems.map((r) => {
            // ── Daily ──
            if (freq === 'daily') {
              const frac = trackerFraction(r.id, days, (d) => String(d))
              return (
                <div key={r.id} style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{r.text}</span>
                    {r.timeOfDay && (
                      <span style={{
                        fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '20px',
                        background: r.timeOfDay === 'AM' ? '#FAEEDA' : '#EEEDFE',
                        color:      r.timeOfDay === 'AM' ? '#854F0B' : '#534AB7',
                      }}>
                        {r.timeOfDay}
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: '#ccc', marginLeft: 'auto' }}>{frac}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                      const tracked = getTracked(r.id, String(d))
                      const isToday = isCurrentMonth && d === today
                      const cStyle  = tracked ? (COLOR_STYLES[tracked.color] || COLOR_STYLES.teal) : null
                      return (
                        <button
                          key={d}
                          onClick={() => toggleTracker(r.id, String(d))}
                          style={{
                            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                            border: tracked ? 'none' : isToday ? '1.5px solid #534AB7' : '0.5px solid #e0ddd8',
                            background: tracked ? cStyle.bg : 'white',
                            color: tracked ? cStyle.color : isToday ? '#534AB7' : '#888',
                            fontSize: tracked ? 8 : 11,
                            fontWeight: tracked || isToday ? 600 : 400,
                            cursor: 'pointer', fontFamily: 'inherit',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {tracked ? tracked.initials : d}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            }

            // ── Weekly ──
            if (freq === 'weekly') {
              const frac = trackerFraction(r.id, weeks, (w) => String(w))
              const last = lastCompletedMap[r.id]
              return (
                <div key={r.id} style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{r.text}</span>
                    {last && <span style={{ fontSize: '10px', color: '#bbb' }}>Last: {last}</span>}
                    <span style={{ fontSize: '11px', color: '#ccc', marginLeft: 'auto' }}>{frac}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => {
                      const tracked    = getTracked(r.id, String(w))
                      const isThisWeek = isCurrentMonth && w === Math.ceil(today / 7)
                      const cStyle     = tracked ? (COLOR_STYLES[tracked.color] || COLOR_STYLES.teal) : null
                      return (
                        <button
                          key={w}
                          onClick={() => toggleTracker(r.id, String(w))}
                          style={{
                            flex: 1, height: 32, borderRadius: 8,
                            border: tracked ? 'none' : isThisWeek ? '1.5px solid #1D9E75' : '0.5px solid #e0ddd8',
                            background: tracked ? cStyle.bg : 'white',
                            color: tracked ? cStyle.color : isThisWeek ? '#1D9E75' : '#888',
                            fontSize: 11, fontWeight: tracked || isThisWeek ? 600 : 400,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          {tracked ? tracked.initials : `Wk ${w}`}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            }

            // ── Monthly ──
            if (freq === 'monthly') {
              const tracked = getTracked(r.id, 'done')
              const cStyle  = tracked ? (COLOR_STYLES[tracked.color] || COLOR_STYLES.teal) : null
              const last    = lastCompletedMap[r.id]
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '0.5px solid #f5f4f1' }}>
                  <button
                    onClick={() => toggleTracker(r.id, 'done')}
                    style={{
                      width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                      border: tracked ? 'none' : '0.5px solid #e0ddd8',
                      background: tracked ? cStyle.bg : 'white',
                      color: tracked ? cStyle.color : '#aaa',
                      fontSize: 9, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {tracked ? tracked.initials : ''}
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: 500, opacity: tracked ? 0.5 : 1 }}>{r.text}</span>
                  {r.zone && (
                    <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '20px', background: '#E1F5EE', color: '#0F6E56', flexShrink: 0 }}>
                      Zone {r.zone}
                    </span>
                  )}
                  {last && <span style={{ fontSize: '10px', color: '#bbb', marginLeft: 'auto' }}>Last: {last}</span>}
                </div>
              )
            }

            // ── Quarterly ──
            if (freq === 'quarterly') {
              const frac = trackerFractionYear(r.id, quarterKeys)
              const last = lastCompletedMap[r.id]
              return (
                <div key={r.id} style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{r.text}</span>
                    {last && <span style={{ fontSize: '10px', color: '#bbb' }}>Last: {last}</span>}
                    <span style={{ fontSize: '11px', color: '#ccc', marginLeft: 'auto' }}>{frac}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {quarterKeys.map((qk, qi) => {
                      const tracked   = getTrackedYear(r.id, qk)
                      const isCurrent = isCurrentYear && (qi + 1) === currentQuarter
                      const cStyle    = tracked ? (COLOR_STYLES[tracked.color] || COLOR_STYLES.teal) : null
                      return (
                        <button
                          key={qk}
                          onClick={() => toggleTrackerYear(r.id, qk)}
                          style={{
                            flex: 1, height: 32, borderRadius: 8,
                            border: tracked ? 'none' : isCurrent ? '1.5px solid #185FA5' : '0.5px solid #e0ddd8',
                            background: tracked ? cStyle.bg : 'white',
                            color: tracked ? cStyle.color : isCurrent ? '#185FA5' : '#888',
                            fontSize: 11, fontWeight: tracked || isCurrent ? 600 : 400,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          {tracked ? tracked.initials : qk}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            }

            // ── Annual ──
            if (freq === 'annual') {
              const tracked = getTrackedYear(r.id, 'done')
              const cStyle  = tracked ? (COLOR_STYLES[tracked.color] || COLOR_STYLES.teal) : null
              const last    = lastCompletedMap[r.id]
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '0.5px solid #f5f4f1' }}>
                  <button
                    onClick={() => toggleTrackerYear(r.id, 'done')}
                    style={{
                      width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                      border: tracked ? 'none' : '0.5px solid #e0ddd8',
                      background: tracked ? cStyle.bg : 'white',
                      color: tracked ? cStyle.color : '#aaa',
                      fontSize: 9, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {tracked ? tracked.initials : ''}
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: 500, opacity: tracked ? 0.5 : 1 }}>{r.text}</span>
                  {last && <span style={{ fontSize: '10px', color: '#bbb', marginLeft: 'auto' }}>Last: {last}</span>}
                </div>
              )
            }

            return null
          })}
        </div>
      )
    })
  }

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/todos" className="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          To-Dos
        </Link>
        {!isCurrentMonth && (
          <button
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setViewedZone(getActiveZone(now) || 1) }}
            style={{ background: 'none', border: '0.5px solid #d0cdc8', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: 500, color: '#666', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Today
          </button>
        )}
      </div>

      <h1 className="page-title" style={{ marginBottom: '1rem' }}>Routines</h1>

      {/* Month nav + zone selector */}
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
        <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
          {Array.from({ length: viewedMonthZones }, (_, i) => i + 1).map((z) => {
            const isSelected = viewedZone === z
            const isCurrent  = activeZone === z && isCurrentMonth
            return (
              <button
                key={z}
                onClick={() => setViewedZone(z)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: '8px', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600,
                  background: isSelected ? '#0F6E56' : isCurrent ? '#E1F5EE' : '#f5f4f1',
                  color: isSelected ? '#fff' : isCurrent ? '#0F6E56' : '#999',
                  position: 'relative',
                }}
              >
                Zone {z}
                {isCurrent && !isSelected && (
                  <span style={{
                    position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                    width: 4, height: 4, borderRadius: '50%', background: '#0F6E56',
                  }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* My Routines — collapsible */}
      <div className="profile-card" style={{ marginBottom: '12px' }}>
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

            {/* Personal — Daily */}
            {personal.daily.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Daily
                </div>
                {personal.daily.map((r) => {
                  const frac = fraction(r.id, days, (d) => String(d))
                  return (
                    <div key={r.id} style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{r.text}</span>
                        {r.timeOfDay && (
                          <span style={{
                            fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '20px',
                            background: r.timeOfDay === 'AM' ? '#FAEEDA' : '#EEEDFE',
                            color:      r.timeOfDay === 'AM' ? '#854F0B' : '#534AB7',
                          }}>
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

            {/* Personal — Weekly */}
            {personal.weekly.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Weekly
                </div>
                {personal.weekly.map((r) => {
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
                          const isThisWeek = isCurrentMonth && w === Math.ceil(today / 7)
                          return (
                            <button
                              key={w}
                              onClick={() => toggle(r.id, String(w))}
                              style={{
                                flex: 1, height: 32, borderRadius: 8,
                                border: isThisWeek && !checked ? '1.5px solid #1D9E75' : checked ? 'none' : '0.5px solid #e0ddd8',
                                background: checked ? '#1D9E75' : 'white',
                                color: checked ? 'white' : isThisWeek ? '#1D9E75' : '#888',
                                fontSize: 11, fontWeight: checked || isThisWeek ? 600 : 400,
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

            {/* Personal — Monthly */}
            {personal.monthly.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Monthly
                </div>
                {personal.monthly.map((r, i) => {
                  const checked = isChecked(r.id, 'done')
                  return (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 0',
                      borderBottom: i < personal.monthly.length - 1 ? '0.5px solid #f5f4f1' : 'none',
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

      {/* ── Daily Recap — always expanded ── */}
      <div className="profile-card" style={{ marginBottom: '12px' }}>
        <div className="profile-section-title">Daily Recap</div>
        <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '14px' }}>
          One entry per day. Missed days can be filled in for up to 3 days.
        </div>

        {recaps === null ? (
          <div style={{ fontSize: '13px', color: '#ccc' }}>Loading…</div>
        ) : (
          recentDays.map(({ key: dayKey, date }, idx) => {
            const isToday   = idx === 0
            const existing  = recaps[dayKey]
            const readOnly  = !isToday && !!existing
            const diff      = idx  // 0 = today, 1 = yesterday, etc.
            const headline  = diff === 0
              ? 'Today'
              : diff === 1
                ? 'Yesterday'
                : date.toLocaleDateString('en-US', { weekday: 'long' })
            const subline   = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

            return (
              <div
                key={dayKey}
                style={{
                  paddingTop:  idx === 0 ? 0 : '14px',
                  marginTop:   idx === 0 ? 0 : '14px',
                  borderTop:   idx === 0 ? 'none' : '0.5px solid #f5f4f1',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: isToday ? '#1a2920' : '#666' }}>{headline}</span>
                    <span style={{ fontSize: '11px', color: '#bbb', marginLeft: '6px' }}>{subline}</span>
                  </div>
                  {recapSavedFlag[dayKey] && (
                    <span style={{ fontSize: '11px', color: '#3B6D11' }}>✓ Saved</span>
                  )}
                  {!isToday && !existing && (
                    <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: '#FAEEDA', color: '#854F0B' }}>
                      Missed
                    </span>
                  )}
                </div>

                {readOnly ? (
                  <div style={{
                    fontSize: '13px', color: '#444', whiteSpace: 'pre-wrap', lineHeight: 1.5,
                    padding: '10px 12px', background: '#f5f4f1', borderRadius: '8px',
                  }}>
                    {existing.content}
                  </div>
                ) : (
                  <>
                    <textarea
                      className="form-input"
                      style={{ margin: 0, width: '100%', resize: 'vertical', minHeight: isToday ? '90px' : '70px', fontSize: '13px', boxSizing: 'border-box' }}
                      placeholder={isToday ? 'How was today? Key wins, blockers, what to remember…' : 'Recap this day…'}
                      value={recapDrafts[dayKey] || ''}
                      onChange={(e) => setRecapDrafts((p) => ({ ...p, [dayKey]: e.target.value }))}
                    />
                    <button
                      className="btn-primary"
                      style={{ width: 'auto', padding: '6px 14px', marginTop: '6px', fontSize: '12px' }}
                      onClick={() => saveRecap(dayKey)}
                      disabled={recapSaving[dayKey] || !(recapDrafts[dayKey] || '').trim()}
                    >
                      {recapSaving[dayKey] ? 'Saving…' : (existing ? 'Save changes' : 'Save')}
                    </button>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── Household Tracker — always expanded ── */}
      {canSeeHousehold && (
        <div className="profile-card" style={{ marginBottom: '12px' }}>
          <div className="profile-section-title">Household Tracker</div>

          {hhRoutines.length === 0 && (
            <div style={{ fontSize: '13px', color: '#aaa', padding: '4px 0 8px' }}>
              No household routines yet — add them below.
            </div>
          )}

          {/* Filter pills — room + frequency */}
          {hhRoutines.length > 0 && (() => {
            const pillStyle = (active, palette) => ({
              padding: '5px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap',
              background: active ? palette.bg : '#f0ede8',
              color:      active ? palette.color : '#888',
              flexShrink: 0,
            })
            const roomPalette = { bg: '#FAEEDA', color: '#854F0B' }
            const freqPalette = { bg: '#E1F5EE', color: '#0F6E56' }
            const hasUnassigned = trackerUnassigned.length > 0
            return (
              <>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                  <button onClick={() => setTrackerRoomFilter(null)} style={pillStyle(trackerRoomFilter === null, roomPalette)}>
                    All rooms
                  </button>
                  {hasUnassigned && (
                    <button onClick={() => setTrackerRoomFilter('unassigned')} style={pillStyle(trackerRoomFilter === 'unassigned', roomPalette)}>
                      Unassigned
                    </button>
                  )}
                  {trackerRooms.map((room) => (
                    <button key={room} onClick={() => setTrackerRoomFilter(room)} style={pillStyle(trackerRoomFilter === room, roomPalette)}>
                      {room}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto', paddingBottom: '4px' }}>
                  <button onClick={() => setTrackerFreqFilter(null)} style={pillStyle(trackerFreqFilter === null, freqPalette)}>
                    All frequencies
                  </button>
                  {HH_FREQUENCIES.map((f) => (
                    <button
                      key={f}
                      onClick={() => setTrackerFreqFilter(f)}
                      style={{ ...pillStyle(trackerFreqFilter === f, freqPalette), textTransform: 'capitalize' }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </>
            )
          })()}

          {(() => {
            const toggleCollapsed = (k) => setCollapsedTrackerRooms((prev) => {
              const next = new Set(prev)
              if (next.has(k)) next.delete(k); else next.add(k)
              return next
            })
            // When a specific filter is active, always expand. Otherwise honor the collapse set.
            const isExpanded = (k) => trackerRoomFilter !== null ? true : !collapsedTrackerRooms.has(k)

            const renderHeader = (key, label, count) => {
              const expanded = isExpanded(key)
              const isUnassigned = key === 'unassigned'
              return (
                <button
                  onClick={() => trackerRoomFilter === null && toggleCollapsed(key)}
                  disabled={trackerRoomFilter !== null}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: '8px',
                    marginBottom: '12px', marginTop: '4px',
                    background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
                    cursor: trackerRoomFilter === null ? 'pointer' : 'default',
                  }}
                >
                  <span style={{
                    fontSize: '12px', fontWeight: 600,
                    color:      isUnassigned ? '#888'    : '#854F0B',
                    background: isUnassigned ? '#f0ede8' : '#FAEEDA',
                    padding: '3px 10px', borderRadius: '20px',
                  }}>
                    {label}
                  </span>
                  <span style={{ fontSize: '11px', color: '#bbb' }}>
                    {count} routine{count !== 1 ? 's' : ''}
                  </span>
                  <div style={{ flex: 1, height: '0.5px', background: '#f0ede8' }} />
                  {trackerRoomFilter === null && (
                    <svg
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      style={{ width: 14, height: 14, color: '#bbb', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  )}
                </button>
              )
            }

            const matchesFreq = (r) => !trackerFreqFilter || r.frequency === trackerFreqFilter

            const unassignedItems = trackerUnassigned.filter(matchesFreq)
            const showUnassigned = unassignedItems.length > 0
              && (trackerRoomFilter === null || trackerRoomFilter === 'unassigned')

            const visibleRooms = trackerRooms
              .filter((r) => trackerRoomFilter === null || trackerRoomFilter === r)
              .map((room) => ({ room, items: hhRoutines.filter((r) => r.room === room && matchesFreq(r)) }))
              .filter(({ items }) => items.length > 0)

            if (!showUnassigned && visibleRooms.length === 0) {
              return (
                <div style={{ fontSize: '13px', color: '#aaa', padding: '4px 0 8px' }}>
                  No routines match the current filters.
                </div>
              )
            }

            return (
              <>
                {showUnassigned && (
                  <div style={{ marginBottom: '4px' }}>
                    {renderHeader('unassigned', 'Unassigned', unassignedItems.length)}
                    {isExpanded('unassigned') && renderTrackerGroup(unassignedItems)}
                  </div>
                )}

                {visibleRooms.map(({ room, items }) => (
                  <div key={room} style={{ marginBottom: '4px' }}>
                    {renderHeader(room, room, items.length)}
                    {isExpanded(room) && renderTrackerGroup(items)}
                  </div>
                ))}
              </>
            )
          })()}
        </div>
      )}

      {/* ── Household Routines — collapsible management ── */}
      {canSeeHousehold && (
        <div className="profile-card">
          <button
            onClick={() => setHhCollapsed((c) => !c)}
            style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            <div className="profile-section-title" style={{ margin: 0 }}>Manage Household Routines</div>
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ width: 16, height: 16, color: '#aaa', transform: hhCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {!hhCollapsed && (
            <div style={{ marginTop: '16px' }}>
              {/* Room filter pills */}
              {(() => {
                const roomsInUse = HH_ROOMS.filter((room) => hhRoutines.some((r) => r.room === room))
                const hasUnassigned = hhRoutines.some((r) => !r.room)
                if (roomsInUse.length === 0 && !hasUnassigned) return null

                const pillStyle = (active) => ({
                  padding: '5px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap',
                  background: active ? '#FAEEDA' : '#f0ede8',
                  color:      active ? '#854F0B' : '#888',
                  flexShrink: 0,
                })

                return (
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
                    <button onClick={() => setHhRoomFilter(null)} style={pillStyle(hhRoomFilter === null)}>
                      All
                    </button>
                    {hasUnassigned && (
                      <button onClick={() => setHhRoomFilter('unassigned')} style={pillStyle(hhRoomFilter === 'unassigned')}>
                        Unassigned
                      </button>
                    )}
                    {roomsInUse.map((room) => (
                      <button key={room} onClick={() => setHhRoomFilter(room)} style={pillStyle(hhRoomFilter === room)}>
                        {room}
                      </button>
                    ))}
                  </div>
                )
              })()}

              {HH_FREQUENCIES.map((freq) => {
                let items = hhByFreq(freq)
                if (hhRoomFilter === 'unassigned') {
                  items = items.filter((r) => !r.room)
                } else if (hhRoomFilter) {
                  items = items.filter((r) => r.room === hhRoomFilter)
                }
                return (
                  <div key={freq} style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                      {freq}
                    </div>
                    {items.length === 0 && (
                      <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '6px' }}>
                        {hhRoomFilter ? `No ${freq} routines in this view` : `No ${freq} routines yet`}
                      </div>
                    )}
                    {items.map((r) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '0.5px solid #f5f4f1' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d0cdc8', flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: '13px' }}>{r.text}</div>
                        {r.timeOfDay && (
                          <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '20px', background: '#E6F1FB', color: '#185FA5' }}>
                            {r.timeOfDay}
                          </span>
                        )}
                        {r.room && (
                          <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '20px', background: '#FAEEDA', color: '#854F0B' }}>
                            {r.room}
                          </span>
                        )}
                        {r.zone && (
                          <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '20px', background: '#E1F5EE', color: '#0F6E56' }}>
                            Zone {r.zone}
                          </span>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => setHhModal({ frequency: freq, id: r.id, text: r.text, timeOfDay: r.timeOfDay || 'AM', room: r.room || '', zone: r.zone || '' })}
                            style={{ fontSize: '11px', color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    ))}
                    {canCreate && (
                      <button
                        onClick={() => setHhModal({
                          frequency: freq,
                          text: '',
                          timeOfDay: freq === 'daily' ? 'AM' : null,
                          room: hhRoomFilter && hhRoomFilter !== 'unassigned' ? hhRoomFilter : '',
                          zone: '',
                        })}
                        style={{ fontSize: '12px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0 0', fontFamily: 'inherit' }}
                      >
                        + Add {freq} routine
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Room Zone Assignments ── */}
      {canSeeHousehold && (
        <div className="profile-card" style={{ marginTop: '12px' }}>
          <button
            onClick={() => setRoomZonesCollapsed((c) => !c)}
            style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >
            <div className="profile-section-title" style={{ margin: 0 }}>Room Zone Assignments</div>
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ width: 16, height: 16, color: '#aaa', transform: roomZonesCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {!roomZonesCollapsed && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '12px', color: '#bbb', marginBottom: '14px' }}>
                Assign a zone to each room. Routines created without a zone will inherit it automatically.
              </div>
              {HH_ROOMS.map((room) => {
                const assigned = roomZones[room] || null
                return (
                  <div key={room} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '0.5px solid #f5f4f1' }}>
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{room}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[1, 2, 3, 4, 5].map((z) => {
                        const active = assigned === z
                        return (
                          <button
                            key={z}
                            onClick={() => saveRoomZone(room, active ? null : z)}
                            style={{
                              width: 28, height: 28, borderRadius: '6px', border: 'none',
                              cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', fontWeight: 600,
                              background: active ? '#0F6E56' : '#f5f4f1',
                              color: active ? '#fff' : '#aaa',
                            }}
                          >
                            {z}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Household Routine add / edit modal */}
      {hhModal && (
        <div className="modal-overlay" onClick={() => setHhModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">
              {hhModal.id ? 'Edit' : 'Add'} {hhModal.frequency} routine
            </h2>
            <input
              className="form-input"
              placeholder="e.g. Clean common areas, Monthly review"
              value={hhModal.text}
              onChange={(e) => setHhModal({ ...hhModal, text: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && saveHhRoutine()}
              autoFocus
            />
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Room (optional)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {HH_ROOMS.map((room) => (
                  <button
                    key={room}
                    onClick={() => setHhModal({ ...hhModal, room: hhModal.room === room ? '' : room })}
                    style={{
                      padding: '5px 10px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '12px', fontWeight: 500,
                      background: hhModal.room === room ? '#FAEEDA' : '#f0ede8',
                      color: hhModal.room === room ? '#854F0B' : '#888',
                    }}
                  >
                    {room}
                  </button>
                ))}
              </div>
            </div>
            {hhModal.frequency === 'daily' && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                {['AM', 'PM'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setHhModal({ ...hhModal, timeOfDay: t })}
                    style={{
                      flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
                      background: hhModal.timeOfDay === t ? '#185FA5' : '#f0ede8',
                      color: hhModal.timeOfDay === t ? '#fff' : '#666',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Zone (optional)</div>
              <select
                className="form-select"
                value={hhModal.zone || ''}
                onChange={(e) => setHhModal({ ...hhModal, zone: e.target.value })}
              >
                <option value="">— None —</option>
                {[1, 2, 3, 4, 5].map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {hhModal.id && canEdit && (
                <button
                  onClick={() => deleteHhRoutine(hhModal.id)}
                  style={{ background: 'none', border: '0.5px solid #f5c5c5', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', color: '#c0392b', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Delete
                </button>
              )}
              <button
                className="btn-primary"
                style={{ flex: 1, margin: 0 }}
                onClick={saveHhRoutine}
                disabled={!hhModal.text?.trim()}
              >
                {hhModal.id ? 'Save changes' : 'Add routine'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
