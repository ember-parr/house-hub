import { useState, useEffect, useRef } from 'react'
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

// ── Smart category guesser ──────────────────────────────────
const KEYWORDS = {
  Grocery:        ['kroger', 'safeway', 'whole foods', 'trader joe', 'walmart', 'target', 'costco', 'king soopers', 'hellofresh', 'albertsons', 'publix', 'aldi', 'heb', 'wegmans', 'grocery', 'market'],
  Dining:         ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonald', 'chick-fil', 'chipotle', 'subway', 'pizza', 'doordash', 'grubhub', 'uber eats', 'taco', 'burger', 'sushi', 'diner', 'grill', 'bistro', 'kitchen', 'eatery', 'shake shack', 'jimmy john', 'chicken'],
  Transportation: ['shell', 'chevron', 'exxon', 'bp ', 'sunoco', 'circle k', 'gas station', 'fuel', '76 '],
  Pets:           ['petco', 'petsmart', 'pet supplies', 'banfield', 'veterinary', 'vet ', 'animal hospital', 'pet store'],
  Shopping:       ['amazon', 'ebay', 'etsy', 'best buy', 'home depot', "lowe's", 'ikea', 'nordstrom', 'macy', 'gap ', 'old navy', 'zara', 'h&m', 'tiktok'],
  Bill:           ['electric', 'gas & electric', 'water', 'internet', 'comcast', 'BLACKHILLS', 'att ', 'payment', 'forcebb', 'MOUNTAIN VIEW ELEC', 'utility', 'onemain', 'klarna'],
  Subscription:   ['netflix', 'hulu', 'youtube', 'cricut', 'hp', 'spotify', 'apple.com', 'adobe', 'health', 'urgent care'],
  Entertainment:  ['steam', 'ticketmaster', 'cinema', 'theater', 'amc ', 'audible'],
  Spaulding:      ['airline', 'united ', 'delta ', 'southwest', 'american air', 'hotel', 'marriott', 'hilton', 'airbnb', 'uber ', 'lyft', 'parking', 'navan', 'NVN* TRP FEE'],
  Aiden:          ['school bucks', 'lewis palmer', 'lpms'],
  Transfer:       [''],
}

function guessCategory(description) {
  const lower = description.toLowerCase()
  for (const [cat, keywords] of Object.entries(KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat
  }
  return 'Other'
}

// ── CSV parser ──────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return []

  // Try to detect header row and column positions
  const header = lines[0].toLowerCase().replace(/"/g, '')
  const cols   = header.split(',').map((c) => c.trim())

  const dateIdx  = cols.findIndex((c) => c.includes('date'))
  const descIdx  = cols.findIndex((c) => c.includes('desc') || c.includes('merchant') || c.includes('name') || c.includes('memo'))
  const amtIdx   = cols.findIndex((c) => c.includes('amount') || c.includes('debit') || c.includes('charge'))

  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1) return null // unrecognised format

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const rawAmt = cells[amtIdx]?.replace(/[^0-9.-]/g, '')
    const amount = parseFloat(rawAmt)
    const date = cells[dateIdx]
    if (!amount) continue // skip zero / unparseable

    const description = cells[descIdx] || 'Unknown'
    rows.push({
      date,
      description,
      amount,                            // signed: positive = charge, negative = payment
      category:    guessCategory(description),
    })
  }
  return rows
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

// Normalise various date formats to YYYY-MM-DD
function normaliseDate(raw) {
  if (!raw) return new Date().toISOString().split('T')[0]
  const cleaned = raw.trim()
  // M/D/YY or MM/DD/YY (2-digit year → 20xx)
  const mdy2 = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/)
  if (mdy2) return `20${mdy2[3]}-${mdy2[1].padStart(2,'0')}-${mdy2[2].padStart(2,'0')}`
  // MM/DD/YYYY or MM-DD-YYYY
  const mdy4 = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (mdy4) return `${mdy4[3]}-${mdy4[1].padStart(2,'0')}-${mdy4[2].padStart(2,'0')}`
  // YYYY-MM-DD already
  const ymd = cleaned.match(/^\d{4}-\d{2}-\d{2}$/)
  if (ymd) return cleaned
  return new Date().toISOString().split('T')[0]
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
  const [csvRows, setCsvRows]     = useState(null)  // null = no import in progress
  const [csvAccount, setCsvAccount] = useState('Checking')
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)
  const [showNoteFor, setShowNoteFor] = useState(null) // tx id
  const [noteText, setNoteText]   = useState('')
  const fileRef                   = useRef(null)

  const key = monthKey(year, month)

  // Real-time transactions for current month
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

  // ── CSV import ─────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = parseCSV(ev.target.result)
      if (!result) {
        alert("Couldn't recognise this CSV format. Make sure it has Date, Description, and Amount columns.")
        return
      }
      if (result.length === 0) {
        alert('No transactions found — the CSV may only contain credits or refunds.')
        return
      }
      setCsvRows(result)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const updateCsvRow = (i, field, value) => {
    setCsvRows((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  const confirmImport = async () => {
    const toImport = csvRows?.filter((r) => !r.omit)
    if (!toImport?.length) return
    setSaving(true)

    const writes = []
    for (const row of toImport) {
      const normDate  = normaliseDate(row.date)
      const rowMonth  = normDate.slice(0, 7)
      const isPayment = row.amount < 0

      if (csvAccount === 'AMEX') {
        // AMEX charges → both trackers; payments → AMEX only
        writes.push(addDoc(collection(db, 'amexTransactions'), {
          merchant:        row.description,
          amount:          row.amount,
          category:        row.category,
          date:            normDate,
          assignedTo:      user?.uid  || null,
          assignedToName:  user?.displayName || user?.email || null,
          assignedToColor: null,
          settled:         false,   // balance is net of charges + payments; never auto-settle
          source:          'csv',
          createdAt:       serverTimestamp(),
        }))

        if (!isPayment) {
          // Charge also appears in spending tracker
          writes.push(addDoc(collection(db, 'spendingTransactions'), {
            description: row.description,
            amount:      row.amount,
            category:    row.category,
            account:     'AMEX',
            date:        normDate,
            month:       rowMonth,
            source:      'csv',
            notes:       null,
            addedBy:     user?.uid || null,
            createdAt:   serverTimestamp(),
          }))
        }
      } else {
        // Non-AMEX → spending tracker only
        writes.push(addDoc(collection(db, 'spendingTransactions'), {
          description: row.description,
          amount:      Math.abs(row.amount),
          category:    row.category,
          account:     csvAccount,
          date:        normDate,
          month:       rowMonth,
          source:      'csv',
          notes:       null,
          addedBy:     user?.uid || null,
          createdAt:   serverTimestamp(),
        }))
      }
    }

    await Promise.all(writes)
    setCsvRows(null)
    setSaving(false)
  }

  // ── Manual add ─────────────────────────────────────────────
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
  const visibleTx  = isAdmin ? transactions : transactions.filter((t) => t.addedBy === user?.uid)
  const totalSpent = visibleTx.reduce((s, t) => s + Number(t.amount), 0)

  const byCategory = CATEGORIES
    .map((cat) => ({
      cat,
      total: visibleTx.filter((t) => t.category === cat).reduce((s, t) => s + Number(t.amount), 0),
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
        <div style={{ display: 'flex', gap: '6px' }}>
          {/* Hidden file input */}
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
          <button
            className="icon-btn"
            style={{ background: '#E6F1FB', color: '#185FA5', width: 'auto', padding: '0 10px', fontSize: '11px', fontWeight: 500, gap: '5px', display: 'flex', alignItems: 'center' }}
            onClick={() => fileRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 12, height: 12 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import CSV
          </button>
          <button className="icon-btn" onClick={() => setShowModal(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      <h1 className="page-title" style={{ marginBottom: '1rem' }}>Spending</h1>

      {/* CSV preview */}
      {csvRows && (
        <div className="profile-card" style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
            CSV preview — {csvRows.filter((r) => !r.omit).length} of {csvRows.length} transactions
          </div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px' }}>
            Review categories, choose account, and uncheck rows to skip
          </div>

          {/* Account picker for whole import */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '0.5px solid #f0ede8' }}>
            <span style={{ fontSize: '11px', fontWeight: 500, color: '#888', flexShrink: 0 }}>Account</span>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {ACCOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setCsvAccount(a)}
                  style={{
                    padding: '3px 10px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                    fontSize: '11px', fontWeight: csvAccount === a ? 500 : 400, fontFamily: 'inherit',
                    background: csvAccount === a ? '#1A2920' : '#f0ede8',
                    color: csvAccount === a ? '#fff' : '#666',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {csvRows.map((row, i) => {
            const isPayment = row.amount < 0
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 0',
                borderBottom: i < csvRows.length - 1 ? '0.5px solid #f5f4f1' : 'none',
                opacity: row.omit ? 0.35 : 1,
              }}>
                <input
                  type="checkbox"
                  checked={!row.omit}
                  onChange={(e) => updateCsvRow(i, 'omit', !e.target.checked)}
                  style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer', accentColor: '#1A2920' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.description}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontSize: '11px', color: '#aaa' }}>{row.date}</span>
                    {isPayment && (
                      <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 6px', borderRadius: '20px', background: '#EAF3DE', color: '#3B6D11' }}>
                        payment
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 500, flexShrink: 0, color: isPayment ? '#1D9E75' : 'inherit' }}>
                  {isPayment ? `+$${fmt(Math.abs(row.amount))}` : `$${fmt(row.amount)}`}
                </div>
                <select
                  value={row.category}
                  onChange={(e) => updateCsvRow(i, 'category', e.target.value)}
                  style={{ border: '0.5px solid #e0ddd8', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', background: '#faf9f7', color: '#555', fontFamily: 'inherit', flexShrink: 0 }}
                >
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            )
          })}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              onClick={() => setCsvRows(null)}
              style={{ background: 'none', border: '0.5px solid #e0ddd8', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', color: '#888', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              style={{ flex: 1, margin: 0 }}
              onClick={confirmImport}
              disabled={saving || csvRows.filter((r) => !r.omit).length === 0}
            >
              {saving ? 'Importing...' : `Import ${csvRows.filter((r) => !r.omit).length} transactions`}
            </button>
          </div>
        </div>
      )}

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
            <div className="stat-lbl">Total spent</div>
          </div>
          <div className="stat-box">
            <div className="stat-val">{visibleTx.length}</div>
            <div className="stat-lbl">Transactions</div>
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
            const style = CAT_STYLES[tx.category] || CAT_STYLES.Other
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
                    <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: style.bg, color: style.color }}>
                      {tx.category}
                    </span>
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
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>${fmt(tx.amount)}</div>
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

      {visibleTx.length === 0 && !csvRows && (
        <div className="empty-state">No transactions this month — import a CSV or add one manually!</div>
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