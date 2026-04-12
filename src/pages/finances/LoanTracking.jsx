import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import {
  doc, getDoc, setDoc, collection,
  addDoc, query, orderBy, onSnapshot,
  getDocs, serverTimestamp,
} from 'firebase/firestore'

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

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Loan() {
  const { user } = useAuth()
  const [config, setConfig]         = useState(null)
  const [payments, setPayments]     = useState([])
  const [members, setMembers]       = useState([])
  const [showModal, setShowModal]   = useState(false)
  const [showSetup, setShowSetup]   = useState(false)
  const [saving, setSaving]         = useState(false)

  const [form, setForm] = useState({
    amount: '', date: new Date().toISOString().split('T')[0],
    paidBy: null, notes: '',
  })
  const [setupForm, setSetupForm] = useState({ name: '', originalBalance: '' })

  // Load loan config
  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, 'loan', 'config'))
      if (snap.exists()) setConfig(snap.data())
      else setShowSetup(true)
    }
    load()
  }, [])

  // Real-time payments
  useEffect(() => {
    const q = query(collection(db, 'loan', 'config', 'payments'), orderBy('date', 'desc'))
    return onSnapshot(q, (snap) => {
      setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // Load members
  useEffect(() => {
    getDocs(query(collection(db, 'users'), orderBy('joinedAt'))).then((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setMembers(list)
      if (list.length > 0) setForm((f) => ({ ...f, paidBy: list[0].id }))
    })
  }, [])

  // Derived stats
  const totalPaid    = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const original     = config ? Number(config.originalBalance) : 0
  const balance      = original - totalPaid
  const pctPaid      = original > 0 ? Math.min(100, Math.round((totalPaid / original) * 100)) : 0

  // Estimated payoff — average of last 3 payments
  function estPayoff() {
    if (payments.length === 0 || balance <= 0) return null
    const recent = payments.slice(0, 3)
    const avg    = recent.reduce((s, p) => s + Number(p.amount), 0) / recent.length
    if (avg <= 0) return null
    const months = Math.ceil(balance / avg)
    const d      = new Date()
    d.setMonth(d.getMonth() + months)
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  const handleSetup = async () => {
    if (!setupForm.name || !setupForm.originalBalance) return
    setSaving(true)
    await setDoc(doc(db, 'loan', 'config'), {
      name:            setupForm.name,
      originalBalance: Number(setupForm.originalBalance),
      createdAt:       serverTimestamp(),
    })
    setConfig({ name: setupForm.name, originalBalance: Number(setupForm.originalBalance) })
    setShowSetup(false)
    setSaving(false)
  }

  const handleAdd = async () => {
    if (!form.amount || !form.paidBy) return
    setSaving(true)
    const member   = members.find((m) => m.id === form.paidBy)
    const prevBal  = payments.length > 0
      ? Number(payments[0].balanceAfter)
      : original
    const newBal   = prevBal - Number(form.amount)

    await addDoc(collection(db, 'loan', 'config', 'payments'), {
      amount:       Number(form.amount),
      date:         form.date,
      paidBy:       member?.id || null,
      paidByName:   member ? (member.nickname || member.displayName) : null,
      paidByColor:  member?.color || null,
      notes:        form.notes || null,
      balanceAfter: newBal,
      createdAt:    serverTimestamp(),
    })
    setForm({ amount: '', date: new Date().toISOString().split('T')[0], paidBy: members[0]?.id || null, notes: '' })
    setShowModal(false)
    setSaving(false)
  }

  // Setup screen
  if (showSetup) {
    return (
      <div className="page">
        <div className="page-header">
          <Link to="/finances" className="back-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Finances
          </Link>
        </div>
        <h1 className="page-title" style={{ marginBottom: '1.25rem' }}>Set up loan</h1>
        <div className="profile-card">
          <input
            className="form-input"
            placeholder="Loan name (e.g. Car loan, Personal loan)"
            value={setupForm.name}
            onChange={(e) => setSetupForm({ ...setupForm, name: e.target.value })}
          />
          <input
            className="form-input"
            type="number"
            placeholder="Original balance $"
            value={setupForm.originalBalance}
            onChange={(e) => setSetupForm({ ...setupForm, originalBalance: e.target.value })}
          />
          <button
            className="btn-primary"
            style={{ background: '#534AB7' }}
            onClick={handleSetup}
            disabled={saving || !setupForm.name || !setupForm.originalBalance}
          >
            {saving ? 'Saving...' : 'Set up loan'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/finances" className="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Finances
        </Link>
        <button
          className="icon-btn"
          style={{ background: '#EEEDFE', color: '#534AB7' }}
          onClick={() => setShowModal(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <h1 className="page-title" style={{ marginBottom: '1rem' }}>{config?.name || 'Loan Tracker'}</h1>

      {/* Balance card */}
      <div className="profile-card" style={{ marginBottom: '12px', textAlign: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
          Current balance
        </div>
        <div style={{ fontSize: '38px', fontWeight: 500, letterSpacing: '-1.5px', color: balance <= 0 ? '#1D9E75' : '#1a1a1a' }}>
          <span style={{ fontSize: '22px', color: '#999' }}>$</span>
          {fmt(Math.max(0, balance))}
        </div>

        {/* Progress bar */}
        <div style={{ margin: '14px 0 6px' }}>
          <div style={{ height: '6px', background: '#f0ede8', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#534AB7', borderRadius: '3px', width: `${pctPaid}%`, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#aaa', marginTop: '5px' }}>
            <span>{pctPaid}% paid</span>
            <span>${fmt(original)} original</span>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid" style={{ marginTop: '12px' }}>
          <div className="stat-box">
            <div className="stat-val">${fmt(totalPaid)}</div>
            <div className="stat-lbl">Total paid</div>
          </div>
          <div className="stat-box">
            <div className="stat-val">{estPayoff() || '—'}</div>
            <div className="stat-lbl">Est. payoff</div>
          </div>
        </div>
      </div>

      {/* Payment history */}
      <div className="profile-card">
        <div className="profile-section-title">Payment history</div>
        {payments.length === 0 && (
          <div className="empty-state" style={{ padding: '1.5rem 0' }}>No payments logged yet</div>
        )}
        {payments.map((p, i) => {
          const mStyle = COLOR_STYLES[p.paidByColor] || COLOR_STYLES.teal
          const name   = p.paidByName || 'Unknown'
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 0',
              borderBottom: i < payments.length - 1 ? '0.5px solid #f5f4f1' : 'none',
            }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: mStyle.bg, color: mStyle.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>
                {initials(name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{name}</div>
                <div style={{ fontSize: '11px', color: '#aaa' }}>
                  {new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {p.notes && ` · ${p.notes}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#534AB7' }}>−${fmt(p.amount)}</div>
                <div style={{ fontSize: '11px', color: '#aaa' }}>bal ${fmt(p.balanceAfter)}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Log payment modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">Log payment</h2>

            <div className="form-row">
              <input
                className="form-input"
                style={{ margin: 0 }}
                type="number"
                placeholder="Amount $"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                autoFocus
              />
              <input
                className="form-input"
                style={{ margin: 0 }}
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            {/* Paid by */}
            {members.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Paid by
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {members.map((m) => {
                    const name     = m.nickname || m.displayName || 'Member'
                    const mStyle   = COLOR_STYLES[m.color] || COLOR_STYLES.teal
                    const selected = form.paidBy === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setForm({ ...form, paidBy: m.id })}
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

            <input
              className="form-input"
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <button
              className="btn-primary"
              style={{ background: '#534AB7' }}
              onClick={handleAdd}
              disabled={saving || !form.amount || !form.paidBy}
            >
              {saving ? 'Saving...' : 'Log payment'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}