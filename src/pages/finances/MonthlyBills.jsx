import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot,
  getDocs, setDoc, serverTimestamp,
} from 'firebase/firestore'

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const STATUS_CYCLE = { unpaid: 'paid', paid: 'autopay', autopay: 'unpaid' }

const STATUS_STYLES = {
  unpaid:  { badge: { background: '#FAECE7', color: '#993C1D' }, label: 'Unpaid',  check: null },
  paid:    { badge: { background: '#EAF3DE', color: '#3B6D11' }, label: 'Paid',     check: '#1D9E75' },
  autopay: { badge: { background: '#E6F1FB', color: '#185FA5' }, label: 'Autopay',  check: '#185FA5' },
}

const emptyBillForm = { name: '', amount: '', dueDay: '', isAutopay: false }

export default function Bills() {
  const now = new Date()
  const [year, setYear]           = useState(now.getFullYear())
  const [month, setMonth]         = useState(now.getMonth())
  const [bills, setBills]         = useState([])
  const [records, setRecords]     = useState({})
  const [showModal, setShowModal] = useState(false)
  const [showNoteFor, setShowNoteFor] = useState(null)
  const [noteText, setNoteText]   = useState('')
  const [billForm, setBillForm]   = useState(emptyBillForm)
  const [saving, setSaving]       = useState(false)

  // Real-time bills list
  useEffect(() => {
    const q = query(collection(db, 'bills'), orderBy('dueDay'))
    return onSnapshot(q, (snap) => {
      setBills(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  // Load or create records for current month
  const ensureRecords = useCallback(async (billsList, yr, mo) => {
    const key = monthKey(yr, mo)
    const snap = await getDocs(collection(db, 'billRecords'))
    const existing = {}
    snap.docs.forEach((d) => {
      const data = d.data()
      if (data.month === key) existing[data.billId] = { id: d.id, ...data }
    })

    // Create missing records for this month
    for (const bill of billsList) {
      if (!existing[bill.id]) {
        const ref = await addDoc(collection(db, 'billRecords'), {
          billId:   bill.id,
          billName: bill.name,
          month:    key,
          amount:   bill.amount,
          dueDay:   bill.dueDay,
          status:   bill.isAutopay ? 'autopay' : 'unpaid',
          notes:    '',
          createdAt: serverTimestamp(),
        })
        existing[bill.id] = { id: ref.id, billId: bill.id, month: key, amount: bill.amount, dueDay: bill.dueDay, status: bill.isAutopay ? 'autopay' : 'unpaid', notes: '' }
      }
    }
    setRecords(existing)
  }, [])

  useEffect(() => {
    if (bills.length > 0) ensureRecords(bills, year, month)
    else setRecords({})
  }, [bills, year, month, ensureRecords])

  const navigate = (dir) => {
    let m = month + dir
    let y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m)
    setYear(y)
  }

  const cycleStatus = async (billId) => {
    const record = records[billId]
    if (!record) return
    const next = STATUS_CYCLE[record.status] || 'unpaid'
    await updateDoc(doc(db, 'billRecords', record.id), { status: next })
    setRecords((prev) => ({ ...prev, [billId]: { ...prev[billId], status: next } }))
  }

  const saveNote = async (billId) => {
    const record = records[billId]
    if (!record) return
    await updateDoc(doc(db, 'billRecords', record.id), { notes: noteText })
    setRecords((prev) => ({ ...prev, [billId]: { ...prev[billId], notes: noteText } }))
    setShowNoteFor(null)
    setNoteText('')
  }

  const handleAddBill = async () => {
    if (!billForm.name.trim() || !billForm.amount || !billForm.dueDay) return
    setSaving(true)
    await addDoc(collection(db, 'bills'), {
      name:      billForm.name.trim(),
      amount:    Number(billForm.amount),
      dueDay:    Number(billForm.dueDay),
      isAutopay: billForm.isAutopay,
      createdAt: serverTimestamp(),
    })
    setBillForm(emptyBillForm)
    setShowModal(false)
    setSaving(false)
  }

  const handleDeleteBill = async (billId) => {
    await deleteDoc(doc(db, 'bills', billId))
  }

  // Summary totals
  const billsWithRecords = bills.map((b) => ({ ...b, record: records[b.id] }))
  const totalDue  = billsWithRecords.reduce((s, b) => s + Number(b.record?.amount || b.amount), 0)
  const totalPaid = billsWithRecords.filter((b) => b.record?.status !== 'unpaid').reduce((s, b) => s + Number(b.record?.amount || b.amount), 0)
  const totalUnpaid = totalDue - totalPaid

  const unpaidBills = billsWithRecords.filter((b) => b.record?.status === 'unpaid')
  const paidBills   = billsWithRecords.filter((b) => b.record?.status !== 'unpaid')

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
          style={{ background: '#FAEEDA', color: '#BA7517' }}
          onClick={() => setShowModal(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <h1 className="page-title" style={{ marginBottom: '1rem' }}>Monthly Bills</h1>

      <div className="profile-card">
        {/* Month navigator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
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

        {/* Summary */}
        <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '16px' }}>
          <div className="stat-box">
            <div className="stat-val">${fmt(totalDue)}</div>
            <div className="stat-lbl">Total due</div>
          </div>
          <div className="stat-box">
            <div className="stat-val" style={{ color: '#1D9E75' }}>${fmt(totalPaid)}</div>
            <div className="stat-lbl">Paid</div>
          </div>
          <div className="stat-box">
            <div className="stat-val" style={{ color: totalUnpaid > 0 ? '#993C1D' : '#1a1a1a' }}>${fmt(totalUnpaid)}</div>
            <div className="stat-lbl">Unpaid</div>
          </div>
        </div>

        {bills.length === 0 && (
          <div className="empty-state" style={{ padding: '1.5rem 0' }}>No bills yet — add your first one!</div>
        )}

        {/* Unpaid bills */}
        {unpaidBills.length > 0 && (
          <>
            <div className="section-label">Unpaid · {unpaidBills.length}</div>
            {unpaidBills.map((bill, i) => (
              <BillRow
                key={bill.id}
                bill={bill}
                isLast={i === unpaidBills.length - 1 && paidBills.length === 0}
                year={year} month={month}
                onCycle={cycleStatus}
                onNote={(id, current) => { setShowNoteFor(id); setNoteText(current || '') }}
                onDelete={handleDeleteBill}
              />
            ))}
          </>
        )}

        {/* Paid / autopay bills */}
        {paidBills.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: unpaidBills.length > 0 ? '14px' : 0 }}>
              Paid · {paidBills.length}
            </div>
            {paidBills.map((bill, i) => (
              <BillRow
                key={bill.id}
                bill={bill}
                isLast={i === paidBills.length - 1}
                year={year} month={month}
                onCycle={cycleStatus}
                onNote={(id, current) => { setShowNoteFor(id); setNoteText(current || '') }}
                onDelete={handleDeleteBill}
              />
            ))}
          </>
        )}
      </div>

      {/* Note editor */}
      {showNoteFor && (
        <div className="modal-overlay" onClick={() => setShowNoteFor(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">Add note</h2>
            <input
              className="form-input"
              placeholder="e.g. Higher than usual this month"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveNote(showNoteFor)}
              autoFocus
            />
            <button className="btn-primary" style={{ background: '#BA7517' }} onClick={() => saveNote(showNoteFor)}>
              Save note
            </button>
          </div>
        </div>
      )}

      {/* Add bill modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">Add recurring bill</h2>

            <input
              className="form-input"
              placeholder="Bill name (e.g. Electric, Mortgage)"
              value={billForm.name}
              onChange={(e) => setBillForm({ ...billForm, name: e.target.value })}
              autoFocus
            />
            <div className="form-row">
              <input
                className="form-input"
                style={{ margin: 0 }}
                type="number"
                placeholder="Typical amount $"
                value={billForm.amount}
                onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })}
              />
              <input
                className="form-input"
                style={{ margin: 0 }}
                type="number"
                placeholder="Due day (1–31)"
                min="1" max="31"
                value={billForm.dueDay}
                onChange={(e) => setBillForm({ ...billForm, dueDay: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <input
                type="checkbox"
                id="autopay"
                checked={billForm.isAutopay}
                onChange={(e) => setBillForm({ ...billForm, isAutopay: e.target.checked })}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="autopay" style={{ fontSize: '13px', color: '#555', cursor: 'pointer' }}>
                This bill is on autopay
              </label>
            </div>

            <button
              className="btn-primary"
              style={{ background: '#BA7517' }}
              onClick={handleAddBill}
              disabled={saving || !billForm.name.trim() || !billForm.amount || !billForm.dueDay}
            >
              {saving ? 'Saving...' : 'Add bill'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BillRow({ bill, isLast, year, month, onCycle, onNote, onDelete }) {
  const record  = bill.record
  const status  = record?.status || 'unpaid'
  const styles  = STATUS_STYLES[status]
  const amount  = record?.amount ?? bill.amount
  const notes   = record?.notes || ''
  const isPaid  = status !== 'unpaid'

  // Due date label
  const dueDay = bill.dueDay
  const dueDate = dueDay
    ? new Date(year, month, dueDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      padding: '10px 0',
      borderBottom: isLast ? 'none' : '0.5px solid #f5f4f1',
      opacity: isPaid ? 0.6 : 1,
    }}>
      {/* Status circle — tap to cycle */}
      <button
        onClick={() => onCycle(bill.id)}
        style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 2,
          border: isPaid ? 'none' : '1.5px solid #ddd',
          background: styles.check || 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        {isPaid && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" style={{ width: 10, height: 10 }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500 }}>{bill.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', ...styles.badge }}>
            {styles.label}
          </span>
          {!isPaid && dueDate && (
            <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: '#FAEEDA', color: '#854F0B' }}>
              Due {dueDate}
            </span>
          )}
        </div>
        {notes ? (
          <div
            style={{ fontSize: '11px', color: '#aaa', marginTop: '3px', cursor: 'pointer' }}
            onClick={() => onNote(bill.id, notes)}
          >
            {notes}
          </div>
        ) : (
          <button
            onClick={() => onNote(bill.id, '')}
            style={{ fontSize: '11px', color: '#ccc', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', marginTop: '3px' }}
          >
            + note
          </button>
        )}
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500 }}>${fmt(amount)}</div>
        <button
          onClick={() => onDelete(bill.id)}
          style={{ fontSize: '10px', color: '#ddd', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', marginTop: '3px' }}
        >
          Remove
        </button>
      </div>
    </div>
  )
}