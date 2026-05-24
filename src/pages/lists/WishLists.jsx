import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { useUserRole } from '../../hooks/useUserRole'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'

const emptyModal = { name: '', url: '', notes: '', cost: '' }

function formatCost(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return null
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function WishLists() {
  const { user } = useAuth()
  const { isAdmin, isContributor, loading } = useUserRole()

  const [items, setItems]     = useState([])
  const [modal, setModal]     = useState(null) // null | { id?, name, url, notes, cost }
  const [saving, setSaving]   = useState(false)

  const canCreate = isAdmin || isContributor
  const canEdit   = isAdmin

  // Real-time listener
  useEffect(() => {
    const q = query(collection(db, 'wishlist'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  const openAdd  = () => setModal({ ...emptyModal })
  const openEdit = (item) => setModal({ id: item.id, name: item.name, url: item.url || '', notes: item.notes || '', cost: item.cost || '' })
  const close    = () => setModal(null)

  const save = async () => {
    if (!modal?.name?.trim() || !user) return
    setSaving(true)
    const payload = {
      name:   modal.name.trim(),
      url:    modal.url.trim()    || null,
      notes:  modal.notes.trim()  || null,
      cost:   modal.cost.trim()   || null,
    }
    if (modal.id) {
      await updateDoc(doc(db, 'wishlist', modal.id), payload)
    } else {
      await addDoc(collection(db, 'wishlist'), { ...payload, createdAt: serverTimestamp(), addedBy: user.uid })
    }
    setSaving(false)
    close()
  }

  const remove = async (id) => {
    await deleteDoc(doc(db, 'wishlist', id))
    close()
  }

  if (loading) return null

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/Lists" className="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Lists
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Wish Lists</h1>
        {canCreate && (
          <button
            onClick={openAdd}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 500, color: '#185FA5', background: '#E6F1FB', border: 'none', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 14, height: 14 }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add item
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div className="profile-card">
          <div style={{ fontSize: '13px', color: '#aaa' }}>
            {canCreate ? 'No wish list items yet — add one above.' : 'No wish list items yet.'}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="profile-card" style={{ padding: 0, overflow: 'hidden' }}>
          {items.map((item, i) => {
            const cost = formatCost(item.cost)
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  padding: '12px 16px',
                  borderBottom: i < items.length - 1 ? '0.5px solid #f5f4f1' : 'none',
                }}
              >
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1a2920' }}>{item.name}</span>
                    {cost && (
                      <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 7px', borderRadius: '20px', background: '#EAF3DE', color: '#3B6D11' }}>
                        {cost}
                      </span>
                    )}
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'block', fontSize: '12px', color: '#185FA5', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}
                    >
                      {item.url}
                    </a>
                  )}
                  {item.notes && (
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{item.notes}</div>
                  )}
                </div>

                {/* Edit button — admin only */}
                {canEdit && (
                  <button
                    onClick={() => openEdit(item)}
                    style={{ fontSize: '11px', color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0, marginTop: '2px' }}
                  >
                    Edit
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit modal */}
      {modal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 className="modal-title">{modal.id ? 'Edit item' : 'Add wish list item'}</h2>

            {/* Name */}
            <input
              className="form-input"
              placeholder="Name *"
              value={modal.name}
              onChange={(e) => setModal({ ...modal, name: e.target.value })}
              autoFocus
            />

            {/* URL */}
            <input
              className="form-input"
              placeholder="URL (optional)"
              type="url"
              value={modal.url}
              onChange={(e) => setModal({ ...modal, url: e.target.value })}
            />

            {/* Cost */}
            <input
              className="form-input"
              placeholder="Cost (optional, e.g. 49.99)"
              type="number"
              min="0"
              step="0.01"
              value={modal.cost}
              onChange={(e) => setModal({ ...modal, cost: e.target.value })}
            />

            {/* Notes */}
            <textarea
              className="form-input"
              placeholder="Notes (optional)"
              value={modal.notes}
              onChange={(e) => setModal({ ...modal, notes: e.target.value })}
              rows={3}
              style={{ resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              {modal.id && canEdit && (
                <button
                  onClick={() => remove(modal.id)}
                  style={{ background: 'none', border: '0.5px solid #f5c5c5', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', color: '#c0392b', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Delete
                </button>
              )}
              <button
                className="btn-primary"
                style={{ flex: 1, margin: 0 }}
                onClick={save}
                disabled={!modal.name?.trim() || saving}
              >
                {modal.id ? 'Save changes' : 'Add item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
