import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { useUserRole } from '../../hooks/useUserRole'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

// ── Categories & guessing ────────────────────────────────────
const CATEGORIES = [
  'Grocery', 'Dining', 'Transportation', 'Pets', 'Shopping', 'Transfer',
  'Bill', 'Subscription', 'Entertainment', 'Spaulding', 'Aiden', 'Other',
]

const KEYWORDS = {
  Grocery:        ['kroger', 'safeway', 'whole foods', 'trader joe', 'walmart', 'target', 'costco', 'king soopers', 'hellofresh', 'albertsons', 'publix', 'aldi', 'heb', 'wegmans', 'grocery', 'market'],
  Dining:         ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonald', 'chick-fil', 'chipotle', 'subway', 'pizza', 'doordash', 'grubhub', 'uber eats', 'taco', 'burger', 'sushi', 'diner', 'grill', 'bistro', 'kitchen', 'eatery', 'shake shack', 'jimmy john', 'chicken', 'dave buster'],
  Transportation: ['shell', 'chevron', 'exxon', 'bp ', 'sunoco', 'circle k', 'gas station', 'fuel', '76 '],
  Pets:           ['petco', 'petsmart', 'pet supplies', 'banfield', 'veterinary', 'vet ', 'animal hospital', 'pet store'],
  Shopping:       ['amazon', 'ebay', 'etsy', 'best buy', 'home depot', "lowe's", 'ikea', 'nordstrom', 'macy', 'gap ', 'old navy', 'zara', 'h&m', 'tiktok'],
  Bill:           ['electric', 'gas & electric', 'water', 'internet', 'comcast', 'BLACKHILLS', 'att ', 'payment', 'forcebb', 'MOUNTAIN VIEW ELEC', 'utility', 'onemain', 'klarna'],
  Subscription:   ['netflix', 'hulu', 'youtube', 'cricut', 'hp', 'spotify', 'apple.com', 'adobe', 'health', 'urgent care', 'audible'],
  Entertainment:  ['steam', 'ticketmaster', 'cinema', 'theater', 'amc '],
  Spaulding:      ['airline', 'united ', 'delta ', 'southwest', 'american air', 'hotel', 'marriott', 'hilton', 'airbnb', 'uber ', 'lyft', 'parking', 'navan', 'NVN* TRP FEE'],
  Aiden:          ['school bucks', 'lewis palmer', 'lpms'],
  Transfer:       ['zelle', 'venmo', 'transfer', 'deposit from', 'deposit to'],
}

function guessCategory(description) {
  const lower = description.toLowerCase()
  for (const [cat, keywords] of Object.entries(KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) return cat
  }
  return 'Other'
}

const ACCOUNTS = ['AMEX', 'Checking', 'Savings', 'Cash', 'Other']

// Normalise various date formats to YYYY-MM-DD
function normaliseDate(raw) {
  if (!raw) return new Date().toISOString().split('T')[0]
  const cleaned = raw.trim()
  // M/D/YY or MM/DD/YY (2-digit year → 20xx)
  const mdy2 = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/)
  if (mdy2) return `20${mdy2[3]}-${mdy2[1].padStart(2, '0')}-${mdy2[2].padStart(2, '0')}`
  // MM/DD/YYYY or MM-DD-YYYY
  const mdy4 = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (mdy4) return `${mdy4[3]}-${mdy4[1].padStart(2, '0')}-${mdy4[2].padStart(2, '0')}`
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned
  return new Date().toISOString().split('T')[0]
}

// Parse CSV — handles both AMEX (signed amounts) and checking (Transaction Type column)
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return []

  const header = lines[0].toLowerCase().replace(/"/g, '')
  const cols   = header.split(',').map((c) => c.trim())

  const dateIdx = cols.findIndex((c) => c.includes('date'))
  const descIdx = cols.findIndex((c) => c.includes('desc') || c.includes('merchant') || c.includes('name') || c.includes('memo'))
  const amtIdx  = cols.findIndex((c) => c.includes('amount') || c.includes('debit') || c.includes('charge'))
  const typeIdx = cols.findIndex((c) => c === 'transaction type' || (c.includes('type') && !c.includes('account')))

  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1) return null

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells    = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const rawAmt   = cells[amtIdx]?.replace(/[^0-9.-]/g, '')
    const rawAmount = parseFloat(rawAmt)
    const date     = cells[dateIdx]
    if (!rawAmount) continue

    const description = cells[descIdx] || 'Unknown'
    const rawType = typeIdx !== -1 ? cells[typeIdx]?.toLowerCase().trim() : null

    let type, amount
    if (rawType === 'credit') {
      // Checking account credit = money received (income)
      type   = 'income'
      amount = Math.abs(rawAmount)
    } else if (rawType === 'debit') {
      // Checking account debit = money spent
      type   = 'spend'
      amount = Math.abs(rawAmount)
    } else {
      // No Transaction Type column (e.g., AMEX) — use sign
      type   = rawAmount < 0 ? 'payment' : 'spend'
      amount = rawAmount // preserve sign; AMEX uses negative for payments
    }

    rows.push({ date, description, amount, type, category: guessCategory(description) })
  }
  return rows
}

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Nav cards ────────────────────────────────────────────────
const sections = [
  {
    to: '/finances/amex',
    title: 'AMEX Expenses',
    subtitle: 'Track shared card transactions',
    colorClass: 'card-teal',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    to: '/finances/loan',
    title: 'Loan Tracker',
    subtitle: 'Log payments & balance',
    colorClass: 'card-purple',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" />
      </svg>
    ),
  },
  {
    to: '/finances/bills',
    title: 'Monthly Bills',
    subtitle: 'Recurring bills & payment status',
    colorClass: 'card-amber',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    to: '/finances/spending',
    title: 'Spending Tracker',
    subtitle: 'Categorize & review transactions',
    colorClass: 'card-blue',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
]

export default function Finances() {
  const { user } = useAuth()
  const { loading, isBlocked } = useUserRole()
  const [csvRows, setCsvRows]     = useState(null)
  const [csvAccount, setCsvAccount] = useState('Checking')
  const [saving, setSaving]       = useState(false)
  const fileRef = useRef(null)

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
        alert('No transactions found in this CSV.')
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
      const isPayment = row.type === 'payment'
      const isIncome  = row.type === 'income'

      if (csvAccount === 'AMEX') {
        // AMEX: write signed amount to amexTransactions; charges also go to spending
        writes.push(addDoc(collection(db, 'amexTransactions'), {
          merchant:        row.description,
          amount:          row.amount,         // signed: negative = payment
          category:        row.category,
          date:            normDate,
          assignedTo:      user?.uid  || null,
          assignedToName:  user?.displayName || user?.email || null,
          assignedToColor: null,
          settled:         false,
          source:          'csv',
          createdAt:       serverTimestamp(),
        }))
        if (!isPayment) {
          writes.push(addDoc(collection(db, 'spendingTransactions'), {
            description: row.description,
            amount:      row.amount,
            category:    row.category,
            account:     'AMEX',
            date:        normDate,
            month:       rowMonth,
            type:        'spend',
            source:      'csv',
            notes:       null,
            addedBy:     user?.uid || null,
            createdAt:   serverTimestamp(),
          }))
        }
      } else {
        // Checking / other: write to spendingTransactions with income/spend type
        writes.push(addDoc(collection(db, 'spendingTransactions'), {
          description: row.description,
          amount:      row.amount,             // always positive (abs'd in parser)
          category:    row.category,
          account:     csvAccount,
          date:        normDate,
          month:       rowMonth,
          type:        isIncome ? 'income' : 'spend',
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

  if (loading) return null

  if (isBlocked) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Finances</h1>
        </div>
        <AccessBlocked />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Finances</h1>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
        <button
          className="icon-btn"
          style={{ background: '#E6F1FB', color: '#185FA5', width: 'auto', padding: '0 12px', fontSize: '11px', fontWeight: 500, gap: '5px', display: 'flex', alignItems: 'center' }}
          onClick={() => fileRef.current?.click()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 12, height: 12 }}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Import CSV
        </button>
      </div>

      {/* CSV preview */}
      {csvRows && (
        <div className="profile-card" style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
            CSV preview — {csvRows.filter((r) => !r.omit).length} of {csvRows.length} transactions
          </div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px' }}>
            Review categories, choose account, and uncheck rows to skip
          </div>

          {/* Account picker */}
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
            const isIncome  = row.type === 'income'
            const isPayment = row.type === 'payment'
            const isGreen   = isIncome || isPayment
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
                    {isIncome && (
                      <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 6px', borderRadius: '20px', background: '#E1F5EE', color: '#1D9E75' }}>
                        income
                      </span>
                    )}
                    {isPayment && (
                      <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 6px', borderRadius: '20px', background: '#EAF3DE', color: '#3B6D11' }}>
                        payment
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 500, flexShrink: 0, color: isGreen ? '#1D9E75' : 'inherit' }}>
                  {isGreen ? `+$${fmt(Math.abs(row.amount))}` : `$${fmt(row.amount)}`}
                </div>
                {!isIncome && (
                  <select
                    value={row.category}
                    onChange={(e) => updateCsvRow(i, 'category', e.target.value)}
                    style={{ border: '0.5px solid #e0ddd8', borderRadius: '6px', padding: '4px 6px', fontSize: '11px', background: '#faf9f7', color: '#555', fontFamily: 'inherit', flexShrink: 0 }}
                  >
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                )}
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

      {!csvRows && (
        <div className="dashboard-grid">
          {sections.map((section) => (
            <Link key={section.to} to={section.to} className={`dashboard-card ${section.colorClass}`}>
              <div className="card-icon">{section.icon}</div>
              <div className="card-title">{section.title}</div>
              <div className="card-subtitle">{section.subtitle}</div>
            </Link>
          ))}
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
