import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { useUserRole } from '../../hooks/useUserRole'
import {
  collection, addDoc, deleteDoc,
  doc, query, orderBy, onSnapshot,
  getDocs, serverTimestamp,
} from 'firebase/firestore'

const CATEGORIES = ['Grocery', 'Dining', 'Gas', 'Shopping', 'Pets', 'Utilities', 'Medical', 'Entertainment', 'Other']

const COLOR_STYLES = {
  teal:   { bg: '#E1F5EE', color: '#0F6E56' },
  purple: { bg: '#EEEDFE', color: '#534AB7' },
  amber:  { bg: '#FAEEDA', color: '#854F0B' },
  coral:  { bg: '#FAECE7', color: '#993C1D' },
  blue:   { bg: '#E6F1FB', color: '#185FA5' },
  green:  { bg: '#EAF3DE', color: '#3B6D11' },
}

const CATEGORY_ICONS = {
  Grocery:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  Dining:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
  Gas:           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>,
  Shopping:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>,
  Pets:          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 015 5v3.5a3.5 3.5 0 01-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 018 13.5V13a5 5 0 011-3"/></svg>,
  Utilities:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  Medical:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  Entertainment: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  Other:         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const emptyForm = {
  merchant: '', amount: '', category: 'Other',
  date: new Date().toISOString().split('T')[0], assignedTo: null,
}

export default function Expenses() {
  const { user }  = useAuth()
  const { loading: roleLoading, isAdmin, isBlocked } = useUserRole()
  const [transactions, setTransactions] = useState([])
  const [members, setMembers]           = useState([])
  const [personFilter, setPersonFilter] = useState('All')
  const [showModal, setShowModal]       = useState(false)
  const [form, setForm]                 = useState(emptyForm)
  const [saving, setSaving]             = useState(false)

  // Real-time transactions
  useEffect(() => {
    const q = query(collection(db, 'amexTransactions'), orderBy('date', 'desc'))
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // Load members
  useEffect(() => {
    getDocs(query(collection(db, 'users'), orderBy('joinedAt'))).then((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setMembers(list)
      if (list.length > 0) setForm((f) => ({ ...f, assignedTo: user?.uid || list[0].id }))
    })
  }, [user])

  // Outstanding totals per person — payments (negative amounts) reduce the balance
  const outstandingByPerson = members.map((m) => {
    const unsettled = transactions.filter((t) => t.assignedTo === m.id && !t.settled)
    return {
      ...m,
      total: unsettled.reduce((s, t) => s + Number(t.amount), 0),  // net (charges − payments)
      count: unsettled.filter((t) => Number(t.amount) > 0).length, // charges only
    }
  })

  // Filter transactions
  const filtered = transactions.filter((t) => {
    if (personFilter !== 'All' && t.assignedTo !== personFilter) return false
    return true
  })

  const handleAdd = async () => {
    if (!form.merchant.trim() || !form.amount || !form.assignedTo) return
    setSaving(true)
    const member = members.find((m) => m.id === form.assignedTo)
    await addDoc(collection(db, 'amexTransactions'), {
      merchant:        form.merchant.trim(),
      amount:          Number(form.amount),
      category:        form.category,
      date:            form.date,
      assignedTo:      member?.id || null,
      assignedToName:  member ? (member.nickname || member.displayName) : null,
      assignedToColor: member?.color || null,
      settled:         false,
      createdAt:       serverTimestamp(),
    })
    setForm({ ...emptyForm, assignedTo: user?.uid || members[0]?.id || null })
    setShowModal(false)
    setSaving(false)
  }


  const handleDelete = (id) =>
    deleteDoc(doc(db, 'amexTransactions', id))

  // Role-scoped views
  const visibleTransactions   = isAdmin ? filtered : filtered.filter((t) => t.assignedTo === user?.uid)
  const visibleOutstanding    = isAdmin ? outstandingByPerson : outstandingByPerson.filter((m) => m.id === user?.uid)
  const visibleMembers        = isAdmin ? members : members.filter((m) => m.id === user?.uid)

  // Re-group scoped transactions by month
  const visibleGrouped = visibleTransactions.reduce((acc, t) => {
    const key = t.date?.slice(0, 7) || 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  if (roleLoading) return null

  if (isBlocked) {
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
        <h1 className="page-title" style={{ marginBottom: '1rem' }}>AMEX Expenses</h1>
        <AccessBlocked />
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
        {isAdmin && (
          <button className="icon-btn" onClick={() => setShowModal(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>

      <h1 className="page-title" style={{ marginBottom: '1rem' }}>AMEX Expenses</h1>

      {/* Outstanding by person */}
      {visibleMembers.length > 0 && (
        <div className="profile-card" style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Outstanding by person
          </div>
          <div className="stats-grid">
            {visibleOutstanding.map((m) => {
              const mStyle = COLOR_STYLES[m.color] || COLOR_STYLES.teal
              const name   = m.nickname || m.displayName || 'Member'
              return (
                <div key={m.id} className="stat-box">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: mStyle.bg, color: mStyle.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700 }}>
                      {initials(name)}
                    </div>
                    <span style={{ fontSize: '12px', color: '#888' }}>{name.split(' ')[0]}</span>
                  </div>
                  <div className="stat-val">${fmt(m.total)}</div>
                  <div className="stat-lbl">{m.count} unsettled</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters — person filter only shown to admin */}
      {isAdmin && (
        <div className="filter-row" style={{ marginBottom: '8px' }}>
          <button className={`chip ${personFilter === 'All' ? 'chip-active' : ''}`} onClick={() => setPersonFilter('All')}>All</button>
          {members.map((m) => {
            const name   = m.nickname || m.displayName || 'Member'
            const mStyle = COLOR_STYLES[m.color] || COLOR_STYLES.teal
            return (
              <button key={m.id} className={`chip ${personFilter === m.id ? 'chip-active' : ''}`} onClick={() => setPersonFilter(m.id)}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: mStyle.bg, color: mStyle.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: 700 }}>
                  {initials(name)[0]}
                </span>
                {name.split(' ')[0]}
              </button>
            )
          })}
        </div>
      )}

      {/* Transactions grouped by month */}
      {Object.keys(visibleGrouped).length === 0 && (
        <div className="empty-state">No transactions yet — add one above!</div>
      )}

      {Object.entries(visibleGrouped).map(([monthKey, txs]) => {
        const monthNet = txs.reduce((s, t) => s + Number(t.amount), 0)
        return (
          <div key={monthKey} className="profile-card" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {monthLabel(monthKey + '-01')}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: monthNet < 0 ? '#1D9E75' : '#888' }}>
                {monthNet < 0 ? `+$${fmt(Math.abs(monthNet))}` : `$${fmt(monthNet)}`}
              </div>
            </div>

            {txs.map((tx, i) => {
              const mStyle    = COLOR_STYLES[tx.assignedToColor] || COLOR_STYLES.teal
              const aName     = tx.assignedToName || 'Unknown'
              const icon      = CATEGORY_ICONS[tx.category] || CATEGORY_ICONS.Other
              const isPayment = Number(tx.amount) < 0
              return (
                <div key={tx.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 0',
                  borderBottom: i < txs.length - 1 ? '0.5px solid #f5f4f1' : 'none',
                  opacity: tx.settled ? 0.55 : 1,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: '8px', background: isPayment ? '#EAF3DE' : '#f5f4f1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isPayment ? '#1D9E75' : '#888' }}>
                    {isPayment ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 15, height: 15 }}>
                        <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                      </svg>
                    ) : (
                      <span style={{ width: 15, height: 15, display: 'flex' }}>{icon}</span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tx.merchant}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: '#aaa' }}>
                        {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      {isPayment && (
                        <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: '#EAF3DE', color: '#3B6D11' }}>
                          Payment
                        </span>
                      )}
                      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: mStyle.bg, color: mStyle.color }}>
                        {aName.split(' ')[0]}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: isPayment ? '#1D9E75' : 'inherit' }}>
                      {isPayment ? `+$${fmt(Math.abs(Number(tx.amount)))}` : `$${fmt(tx.amount)}`}
                    </div>
                    {isAdmin && (
                      <button onClick={() => handleDelete(tx.id)} style={{ fontSize: '10px', color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', marginTop: '3px' }}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Add transaction modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">Add transaction</h2>

            <input
              className="form-input"
              placeholder="Merchant name"
              value={form.merchant}
              onChange={(e) => setForm({ ...form, merchant: e.target.value })}
              autoFocus
            />

            <div className="form-row">
              <input
                className="form-input"
                style={{ margin: 0 }}
                type="number"
                placeholder="Amount $"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              <input
                className="form-input"
                style={{ margin: 0 }}
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <select
              className="form-select"
              style={{ marginBottom: '10px', width: '100%' }}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>

            {/* Charged to */}
            {members.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Charged to
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {members.map((m) => {
                    const name     = m.nickname || m.displayName || 'Member'
                    const mStyle   = COLOR_STYLES[m.color] || COLOR_STYLES.teal
                    const selected = form.assignedTo === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setForm({ ...form, assignedTo: m.id })}
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

            <button
              className="btn-primary"
              onClick={handleAdd}
              disabled={saving || !form.merchant.trim() || !form.amount || !form.assignedTo}
            >
              {saving ? 'Saving...' : 'Add transaction'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AccessBlocked() {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f5f4f1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2" strokeLinecap="round" style={{ width: 22, height: 22 }}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
      <div style={{ fontWeight: 500, fontSize: '15px', marginBottom: '6px' }}>Access restricted</div>
      <div style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.5 }}>
        An admin needs to add you to the household<br />before you can view finances.
      </div>
    </div>
  )
}