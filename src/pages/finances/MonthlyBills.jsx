import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useUserRole } from '../../hooks/useUserRole'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot,
  getDocs, serverTimestamp,
} from 'firebase/firestore'

const ACCOUNTS = ['Ember Checking', 'Ember Savings', 'Joint Checking', 'Joint Savings', 'AMEX', 'ApplePay','Justin Checking', 'Justin Savings', 'Cash', 'Other']

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Autopay bills are only "paid" once their due date has passed
function effectiveStatus(bill, record, year, month) {
  const stored = record?.status || 'unpaid'
  if (stored === 'autopay') {
    const today   = new Date()
    const dueDate = new Date(year, month, Number(bill.dueDay))
    if (today < dueDate) return 'scheduled'
  }
  return stored
}

const STATUS_CYCLE = { unpaid: 'paid', paid: 'autopay', autopay: 'unpaid', scheduled: 'paid' }

const STATUS_STYLES = {
  unpaid:    { badge: { background: '#FAECE7', color: '#993C1D' }, label: 'Unpaid',    check: null },
  paid:      { badge: { background: '#EAF3DE', color: '#3B6D11' }, label: 'Paid',      check: '#1D9E75' },
  autopay:   { badge: { background: '#E6F1FB', color: '#185FA5' }, label: 'Autopay',   check: '#185FA5' },
  scheduled: { badge: { background: '#E6F1FB', color: '#185FA5' }, label: 'Scheduled', check: null },
}

const emptyBillForm = { name: '', amount: '', dueDay: '', isAutopay: false, account: 'Checking' }

export default function Bills() {
  const { loading: roleLoading, isAdmin, isBlocked } = useUserRole()
  const now = new Date()
  const [year, setYear]           = useState(now.getFullYear())
  const [month, setMonth]         = useState(now.getMonth())
  const [bills, setBills]         = useState([])
  const [records, setRecords]     = useState({})
  const [showModal, setShowModal] = useState(false)
  const [showNoteFor, setShowNoteFor] = useState(null)
  const [noteText, setNoteText]   = useState('')
  const [billForm, setBillForm]   = useState(emptyBillForm)
  const [editBill, setEditBill]   = useState(null)   // bill being edited
  const [editForm, setEditForm]   = useState({})
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

    for (const bill of billsList) {
      if (!existing[bill.id]) {
        const ref = await addDoc(collection(db, 'billRecords'), {
          billId:   bill.id,
          billName: bill.name,
          month:    key,
          amount:   bill.amount,
          dueDay:   bill.dueDay,
          account:  bill.account || null,
          status:   bill.isAutopay ? 'autopay' : 'unpaid',
          notes:    '',
          createdAt: serverTimestamp(),
        })
        existing[bill.id] = {
          id: ref.id, billId: bill.id, month: key,
          amount: bill.amount, dueDay: bill.dueDay,
          account: bill.account || null,
          status: bill.isAutopay ? 'autopay' : 'unpaid', notes: '',
        }
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
    // Cycle uses stored status, not effective (so autopay cycles correctly)
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
      account:   billForm.account || null,
      createdAt: serverTimestamp(),
    })
    setBillForm(emptyBillForm)
    setShowModal(false)
    setSaving(false)
  }

  const openEdit = (bill) => {
    const record = records[bill.id]
    setEditBill(bill)
    setEditForm({
      name:      bill.name,
      amount:    record?.amount ?? bill.amount,
      dueDay:    bill.dueDay,
      isAutopay: bill.isAutopay,
      account:   bill.account || record?.account || 'Checking',
    })
  }

  const handleEditSave = async () => {
    if (!editBill || !editForm.name.trim() || !editForm.amount || !editForm.dueDay) return
    setSaving(true)
    // Update bill definition
    await updateDoc(doc(db, 'bills', editBill.id), {
      name:      editForm.name.trim(),
      amount:    Number(editForm.amount),
      dueDay:    Number(editForm.dueDay),
      isAutopay: editForm.isAutopay,
      account:   editForm.account || null,
    })
    // Update this month's record amount and account
    const record = records[editBill.id]
    if (record) {
      await updateDoc(doc(db, 'billRecords', record.id), {
        billName: editForm.name.trim(),
        amount:   Number(editForm.amount),
        dueDay:   Number(editForm.dueDay),
        account:  editForm.account || null,
        status:   editForm.isAutopay ? (record.status === 'unpaid' ? 'autopay' : record.status) : record.status,
      })
      setRecords((prev) => ({
        ...prev,
        [editBill.id]: {
          ...prev[editBill.id],
          billName: editForm.name.trim(),
          amount:   Number(editForm.amount),
          dueDay:   Number(editForm.dueDay),
          account:  editForm.account || null,
          status:   editForm.isAutopay ? (record.status === 'unpaid' ? 'autopay' : record.status) : record.status,
        },
      }))
    }
    setEditBill(null)
    setSaving(false)
  }

  const handleDeleteBill = async (billId) => {
    await deleteDoc(doc(db, 'bills', billId))
  }

  // Summary — use effective status for accurate totals
  const billsWithRecords = bills.map((b) => ({ ...b, record: records[b.id] }))
  const isEffectivelyPaid = (b) => {
    const eff = effectiveStatus(b, b.record, year, month)
    return eff !== 'unpaid' && eff !== 'scheduled'
  }
  const totalDue    = billsWithRecords.reduce((s, b) => s + Number(b.record?.amount || b.amount), 0)
  const totalPaid   = billsWithRecords.filter(isEffectivelyPaid).reduce((s, b) => s + Number(b.record?.amount || b.amount), 0)
  const totalUnpaid = totalDue - totalPaid

  const unpaidBills = billsWithRecords.filter((b) => !isEffectivelyPaid(b))
  const paidBills   = billsWithRecords.filter(isEffectivelyPaid)

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
        <h1 className="page-title" style={{ marginBottom: '1rem' }}>Monthly Bills</h1>
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
          <button
            className="icon-btn"
            style={{ background: '#FAEEDA', color: '#BA7517' }}
            onClick={() => setShowModal(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
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

        {/* Unpaid / scheduled bills */}
        {unpaidBills.length > 0 && (
          <>
            <div className="section-label">Unpaid · {unpaidBills.length}</div>
            {unpaidBills.map((bill, i) => (
              <BillRow
                key={bill.id}
                bill={bill}
                effStatus={effectiveStatus(bill, bill.record, year, month)}
                isLast={i === unpaidBills.length - 1 && paidBills.length === 0}
                year={year} month={month}
                isAdmin={isAdmin}
                onCycle={cycleStatus}
                onNote={(id, current) => { setShowNoteFor(id); setNoteText(current || '') }}
                onDelete={handleDeleteBill}
                onEdit={openEdit}
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
                effStatus={effectiveStatus(bill, bill.record, year, month)}
                isLast={i === paidBills.length - 1}
                year={year} month={month}
                isAdmin={isAdmin}
                onCycle={cycleStatus}
                onNote={(id, current) => { setShowNoteFor(id); setNoteText(current || '') }}
                onDelete={handleDeleteBill}
                onEdit={openEdit}
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

            <select
              className="form-select"
              style={{ width: '100%', marginBottom: '10px' }}
              value={billForm.account}
              onChange={(e) => setBillForm({ ...billForm, account: e.target.value })}
            >
              {ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <input
                type="checkbox"
                id="autopay-add"
                checked={billForm.isAutopay}
                onChange={(e) => setBillForm({ ...billForm, isAutopay: e.target.checked })}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="autopay-add" style={{ fontSize: '13px', color: '#555', cursor: 'pointer' }}>
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

      {/* Edit bill modal */}
      {editBill && (
        <div className="modal-overlay" onClick={() => setEditBill(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">Edit bill</h2>

            <input
              className="form-input"
              placeholder="Bill name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              autoFocus
            />
            <div className="form-row">
              <input
                className="form-input"
                style={{ margin: 0 }}
                type="number"
                placeholder="Amount $"
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              />
              <input
                className="form-input"
                style={{ margin: 0 }}
                type="number"
                placeholder="Due day (1–31)"
                min="1" max="31"
                value={editForm.dueDay}
                onChange={(e) => setEditForm({ ...editForm, dueDay: e.target.value })}
              />
            </div>

            <select
              className="form-select"
              style={{ width: '100%', marginBottom: '10px' }}
              value={editForm.account}
              onChange={(e) => setEditForm({ ...editForm, account: e.target.value })}
            >
              {ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <input
                type="checkbox"
                id="autopay-edit"
                checked={editForm.isAutopay}
                onChange={(e) => setEditForm({ ...editForm, isAutopay: e.target.checked })}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="autopay-edit" style={{ fontSize: '13px', color: '#555', cursor: 'pointer' }}>
                This bill is on autopay
              </label>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { handleDeleteBill(editBill.id); setEditBill(null) }}
                style={{ background: 'none', border: '0.5px solid #f5c5c5', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', color: '#c0392b', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Remove
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, margin: 0, background: '#BA7517' }}
                onClick={handleEditSave}
                disabled={saving || !editForm.name.trim() || !editForm.amount || !editForm.dueDay}
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BillRow({ bill, effStatus, isLast, year, month, isAdmin, onCycle, onNote, onDelete, onEdit }) {
  const record = bill.record
  const styles = STATUS_STYLES[effStatus] || STATUS_STYLES.unpaid
  const amount = record?.amount ?? bill.amount
  const notes  = record?.notes || ''
  const isPaid = effStatus !== 'unpaid' && effStatus !== 'scheduled'

  const dueDay  = bill.dueDay
  const dueDate = dueDay
    ? new Date(year, month, dueDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  const account = record?.account || bill.account

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
          {dueDate && (
            <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: '#FAEEDA', color: '#854F0B' }}>
              {isPaid ? '' : 'Due '}{dueDate}
            </span>
          )}
          {account && (
            <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: '#f0ede8', color: '#666' }}>
              {account}
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
        {isAdmin && (
          <button
            onClick={() => onEdit(bill)}
            style={{ fontSize: '10px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', marginTop: '3px' }}
          >
            Edit
          </button>
        )}
      </div>
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
