import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { useUserRole } from '../../hooks/useUserRole'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, where, orderBy,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore'

// ── Categories ──────────────────────────────────────────────
const CATEGORIES = [
  'Grocery', 'Dining', 'Transportation', 'Pets', 'Shopping', 'Transfer',
  'Bill', 'Subscription', 'Entertainment', 'Spaulding', 'Aiden', 'Other',
]

const CAT_STYLES = {
  Grocery:        { color: '#1D9E75', bg: '#E1F5EE' },
  Dining:         { color: '#854F0B', bg: '#FAEEDA' },
  Transportation: { color: '#185FA5', bg: '#E6F1FB' },
  Pets:           { color: '#993C1D', bg: '#FAECE7' },
  Shopping:       { color: '#534AB7', bg: '#EEEDFE' },
  Bill:           { color: '#3B6D11', bg: '#EAF3DE' },
  Subscription:   { color: '#A32D2D', bg: '#FCEBEB' },
  Entertainment:  { color: '#72243E', bg: '#FBEAF0' },
  Spaulding:      { color: '#0C447C', bg: '#E6F1FB' },
  Aiden:          { color: '#ffffff', bg: '#000000' },
  Transfer:       { color: '#000000', bg: '#ffffff' },
  Other:          { color: '#5F5E5A', bg: '#F1EFE8' },
}

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const ACCOUNTS = ['AMEX', 'Checking', 'Savings', 'Cash', 'Other']

const emptyForm = {
  description: '', amount: '', category: 'Other', account: 'Checking', notes: '',
  date: new Date().toISOString().split('T')[0],
}

export default function Spending() {
  const { user } = useAuth()
  const { loading: roleLoading, isAdmin, isBlocked } = useUserRole()
  const now = new Date()
  const [year, setYear]           = useState(now.getFullYear())
  const [month, setMonth]         = useState(now.getMonth())
  const [transactions, setTransactions] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)
  const [showNoteFor, setShowNoteFor] = useState(null)
  const [noteText, setNoteText]   = useState('')

  const key = monthKey(year, month)

  useEffect(() => {
    const q = query(
      collection(db, 'spendingTransactions'),
      where('month', '==', key),
      orderBy('date', 'desc')
    )
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [key])

  const navigate = (dir) => {
    let m = month + dir, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y)
  }

  const handleAdd = async () => {
    if (!form.description.trim() || !form.amount) return
    setSaving(true)
    const txMonth = form.date.slice(0, 7)
    await addDoc(collection(db, 'spendingTransactions'), {
      description: form.description.trim(),
      amount:      Number(form.amount),
      category:    form.category,
      account:     form.account,
      date:        form.date,
      month:       txMonth,
      type:        'spend',
      source:      'manual',
      notes:       form.notes.trim() || null,
      addedBy:     user?.uid || null,
      createdAt:   serverTimestamp(),
    })
    setForm(emptyForm)
    setShowModal(false)
    setSaving(false)
  }

  const handleDelete = (id) => deleteDoc(doc(db, 'spendingTransactions', id))

  const handleSaveNote = async () => {
    if (!showNoteFor) return
    await updateDoc(doc(db, 'spendingTransactions', showNoteFor), { notes: noteText.trim() || null })
    setShowNoteFor(null)
    setNoteText('')
  }

  // ── Derived stats ──────────────────────────────────────────
  const visibleTx   = isAdmin ? transactions : transactions.filter((t) => t.addedBy === user?.uid)
  const spendTx     = visibleTx.filter((t) => t.type !== 'income')
  const incomeTx    = visibleTx.filter((t) => t.type === 'income')
  const totalSpent  = spendTx.reduce((s, t) => s + Number(t.amount), 0)
  const totalIncome = incomeTx.reduce((s, t) => s + Number(t.amount), 0)

  const byCategory = CATEGORIES
    .map((cat) => ({
      cat,
      total: spendTx.filter((t) => t.category === cat).reduce((s, t) => s + Number(t.amount), 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)

  const maxCat = byCategory[0]?.total || 1

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
        <h1 className="page-title" style={{ marginBottom: '1rem' }}>Spending</h1>
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
        <button className="icon-btn" onClick={() => setShowModal(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <h1 className="page-title" style={{ marginBottom: '1rem' }}>Spending</h1>

      {/* Monthly summary */}
      <div className="profile-card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <button onClick={() => navigate(-1)} className="bl-nav-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14 }}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div style={{ fontSize: '15px', fontWeight: 500 }}>{monthLabel(year, month)}</div>
          <button onClick={() => navigate(1)} className="bl-nav-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14 }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        <div className="stats-grid" style={{ marginBottom: '16px' }}>
          <div className="stat-box">
            <div className="stat-val">${fmt(totalSpent)}</div>
            <div className="stat-lbl">Spent</div>
          </div>
          <div className="stat-box">
            <div className="stat-val" style={totalIncome > 0 ? { color: '#1D9E75' } : {}}>
              {totalIncome > 0 ? `+$${fmt(totalIncome)}` : visibleTx.length}
            </div>
            <div className="stat-lbl">{totalIncome > 0 ? 'Income' : 'Transactions'}</div>
          </div>
        </div>

        {byCategory.length > 0 && (
          <>
            <div className="section-label">By category</div>
            {byCategory.map(({ cat, total }) => {
              const style = CAT_STYLES[cat] || CAT_STYLES.Other
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#555', width: '88px', flexShrink: 0 }}>{cat}</div>
                  <div style={{ flex: 1, height: '6px', background: '#f0ede8', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: style.color, borderRadius: '3px', width: `${Math.round((total / maxCat) * 100)}%` }} />
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 500, width: '64px', textAlign: 'right', flexShrink: 0 }}>
                    ${fmt(total)}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Transaction list */}
      {visibleTx.length > 0 && (
        <div className="profile-card">
          <div className="profile-section-title">Transactions</div>
          {visibleTx.map((tx, i) => {
            const isIncome = tx.type === 'income'
            const style = isIncome
              ? { color: '#1D9E75', bg: '#E1F5EE' }
              : (CAT_STYLES[tx.category] || CAT_STYLES.Other)
            return (
              <div key={tx.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '9px 0',
                borderBottom: i < visibleTx.length - 1 ? '0.5px solid #f5f4f1' : 'none',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: style.color, flexShrink: 0, marginTop: '5px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tx.description}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#aaa' }}>
                      {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {isIncome ? (
                      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: '#E1F5EE', color: '#1D9E75' }}>
                        income
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: style.bg, color: style.color }}>
                        {tx.category}
                      </span>
                    )}
                    {tx.account && (
                      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: '#f0ede8', color: '#666' }}>
                        {tx.account}
                      </span>
                    )}
                  </div>
                  {tx.notes ? (
                    <div
                      style={{ fontSize: '11px', color: '#aaa', marginTop: '3px', cursor: 'pointer' }}
                      onClick={() => { setShowNoteFor(tx.id); setNoteText(tx.notes) }}
                    >
                      {tx.notes}
                    </div>
                  ) : (
                    <button
                      onClick={() => { setShowNoteFor(tx.id); setNoteText('') }}
                      style={{ fontSize: '11px', color: '#ccc', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', marginTop: '3px' }}
                    >
                      + note
                    </button>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: isIncome ? '#1D9E75' : 'inherit' }}>
                    {isIncome ? '+' : ''}${fmt(tx.amount)}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(tx.id)}
                      style={{ fontSize: '10px', color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {visibleTx.length === 0 && (
        <div className="empty-state">No transactions this month — add one manually or import a CSV from the Finances home page.</div>
      )}

      {/* Manual add modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">Add transaction</h2>

            <input
              className="form-input"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
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
              style={{ width: '100%', marginBottom: '10px' }}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>

            <select
              className="form-select"
              style={{ width: '100%', marginBottom: '10px' }}
              value={form.account}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
            >
              {ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
            </select>

            <textarea
              className="form-input"
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              style={{ resize: 'none' }}
            />

            <button
              className="btn-primary"
              onClick={handleAdd}
              disabled={saving || !form.description.trim() || !form.amount}
            >
              {saving ? 'Saving...' : 'Add transaction'}
            </button>
          </div>
        </div>
      )}

      {/* Note edit modal */}
      {showNoteFor && (
        <div className="modal-overlay" onClick={() => setShowNoteFor(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">Note</h2>
            <textarea
              className="form-input"
              placeholder="Add a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSaveNote()}
              rows={3}
              style={{ resize: 'none' }}
              autoFocus
            />
            <button className="btn-primary" onClick={handleSaveNote}>
              Save note
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
