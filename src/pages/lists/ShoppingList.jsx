import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'

const STORES = ['Grocery Store','Costco', 'Kroger', 'Walmart', 'Amazon', 'Other']

const STORE_STYLES = {
  Costco:  'badge-coral',
  Kroger:  'badge-accent',
  Walmart: 'badge-blue',
  Amazon:  'badge-secondary',
  Other:   'badge-gray',
}

// type field stores: Consumable | Need | Want | Someday
const TYPE_STYLES = {
  Consumable: 'badge-green',
  Need:       'badge-coral',
  Want:       'badge-secondary',
  Someday:    'badge-gray',
}

// formType drives the toggle; regularCategory drives the sub-dropdown
const emptyForm = {
  formType: 'Consumable', regularCategory: 'Need',
  thing: '', store: 'Grocery Store', storeName: '', notes: '', estimatedCost: '',
}

export default function ShoppingList() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const addConsumable = searchParams.get('add') === 'consumable'
  const [items, setItems]         = useState([])
  const [showModal, setShowModal] = useState(addConsumable)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm]           = useState(() => addConsumable ? { ...emptyForm, formType: 'Consumable' } : emptyForm)
  const [saving, setSaving]       = useState(false)
  const [activeFilters, setActiveFilters] = useState(new Set())

  const toggleFilter = (store) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(store)) next.delete(store)
      else next.add(store)
      return next
    })
  }

  useEffect(() => {
    const q = query(collection(db, 'shopping'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  useEffect(() => {
    if (addConsumable) setSearchParams({}, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const openEdit = (item) => {
    const storedType = item.type || 'Consumable'
    setForm({
      formType:        storedType === 'Consumable' ? 'Consumable' : 'Regular',
      regularCategory: storedType !== 'Consumable' ? storedType : 'Need',
      thing:           item.thing     || '',
      store:           item.store     || 'Costco',
      storeName:       item.storeName || '',
      notes:           item.notes     || '',
      estimatedCost:   item.estimatedCost != null ? String(item.estimatedCost) : '',
    })
    setEditingId(item.id)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.thing.trim()) return
    setSaving(true)
    const resolvedType = form.formType === 'Consumable' ? 'Consumable' : form.regularCategory
    const payload = {
      type:          resolvedType,
      thing:         form.thing.trim(),
      store:         form.store,
      storeName:     form.store === 'Other' ? (form.storeName.trim() || null) : null,
      notes:         form.notes.trim() || null,
      estimatedCost: form.estimatedCost !== '' ? parseFloat(form.estimatedCost) : null,
    }
    if (editingId) {
      await updateDoc(doc(db, 'shopping', editingId), payload)
    } else {
      await addDoc(collection(db, 'shopping'), {
        ...payload,
        bought:       false,
        boughtAt:     null,
        addedBy:      user?.uid          || null,
        addedByName:  user?.displayName  || user?.email || null,
        createdAt:    serverTimestamp(),
      })
    }
    closeModal()
    setSaving(false)
  }

  const handleDelete = (id) => deleteDoc(doc(db, 'shopping', id))

  const toggleBought = (item) => updateDoc(doc(db, 'shopping', item.id), {
    bought:   !item.bought,
    boughtAt: !item.bought ? serverTimestamp() : null,
  })

  const storeLabel = (item) => item.store === 'Other' ? (item.storeName || 'Other') : item.store

  const availableStores = [...new Set(items.map((i) => storeLabel(i)).filter(Boolean))].sort()
  const applyFilters    = (list) => activeFilters.size === 0 ? list : list.filter((i) => activeFilters.has(storeLabel(i)))

  const activeItems = applyFilters(items.filter((i) => !i.bought))
  const boughtItems = applyFilters(items.filter((i) =>  i.bought))

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Shopping</h1>
        <button className="icon-btn" onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true) }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {availableStores.length > 0 && (
        <div className="filter-row">
          {availableStores.map((store) => (
            <button
              key={store}
              className={`chip ${activeFilters.has(store) ? 'chip-active' : ''}`}
              onClick={() => toggleFilter(store)}
            >
              {store}
            </button>
          ))}
        </div>
      )}

      {activeItems.length > 0 && (
        <>
          <div className="section-label">To get · {activeItems.length}</div>
          {activeItems.map((item) => (
            <ItemRow key={item.id} item={item} displayStore={storeLabel(item)} onToggle={toggleBought} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </>
      )}
      {activeItems.length === 0 && (
        <div className="empty-state">Nothing on the list — tap + to add an item</div>
      )}

      {boughtItems.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: '1.25rem' }}>Purchased · {boughtItems.length}</div>
          {boughtItems.map((item) => (
            <ItemRow key={item.id} item={item} displayStore={storeLabel(item)} onToggle={toggleBought} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ overflowY: 'auto', maxHeight: '85vh' }}>
            <div className="modal-handle" />
            <h2 className="modal-title">{editingId ? 'Edit item' : 'Add item'}</h2>

            {/* Consumable / Regular toggle */}
            <div style={{ display: 'flex', background: '#f5f4f1', borderRadius: '8px', padding: '3px', marginBottom: '10px', gap: '3px' }}>
              {['Consumable', 'Regular'].map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, formType: t })}
                  style={{
                    flex: 1, padding: '7px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: form.formType === t ? 'white' : 'transparent',
                    boxShadow: form.formType === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    fontFamily: 'inherit', fontSize: '13px',
                    fontWeight: form.formType === t ? 500 : 400,
                    color: form.formType === t ? '#1A2920' : '#888',
                    transition: 'all 0.15s',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Category — only shown for Regular items */}
            {form.formType === 'Regular' && (
              <select
                className="form-select"
                style={{ width: '100%', marginBottom: '10px' }}
                value={form.regularCategory}
                onChange={(e) => setForm({ ...form, regularCategory: e.target.value })}
              >
                <option>Need</option>
                <option>Want</option>
                <option>Someday</option>
              </select>
            )}

            <input
              className="form-input"
              placeholder="Item name *"
              value={form.thing}
              onChange={(e) => setForm({ ...form, thing: e.target.value })}
              autoFocus
            />

            <select
              className="form-select"
              style={{ width: '100%', marginBottom: '10px' }}
              value={form.store}
              onChange={(e) => setForm({ ...form, store: e.target.value, storeName: '' })}
            >
              {STORES.map((s) => <option key={s}>{s}</option>)}
            </select>

            {form.store === 'Other' && (
              <input
                className="form-input"
                placeholder="Store name"
                value={form.storeName}
                onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              />
            )}

            <textarea
              className="form-input"
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              style={{ resize: 'none' }}
            />

            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: '13px', pointerEvents: 'none' }}>$</span>
              <input
                className="form-input"
                style={{ margin: 0, paddingLeft: '24px' }}
                placeholder="Estimated cost"
                type="number"
                min="0"
                step="0.01"
                value={form.estimatedCost}
                onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
              />
            </div>

            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.thing.trim()}>
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add item'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, displayStore, onToggle, onEdit, onDelete }) {
  return (
    <div className={`task-card ${item.bought ? 'task-done' : ''}`}>
      <button
        className={`task-check ${item.bought ? 'task-check-done' : ''}`}
        onClick={() => onToggle(item)}
      >
        {item.bought && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      <div className="task-body">
        <div className="task-title">{item.thing}</div>
        {item.notes && (
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', marginTop: '2px' }}>{item.notes}</div>
        )}
        <div className="task-meta">
          <span className={`badge ${TYPE_STYLES[item.type] || 'badge-gray'}`}>{item.type}</span>
          <span className={`badge ${STORE_STYLES[item.store] || 'badge-gray'}`}>{displayStore}</span>
          {item.estimatedCost != null && (
            <span style={{ fontSize: '10px', color: '#888' }}>${item.estimatedCost.toFixed(2)}</span>
          )}
          {item.bought && item.boughtAt && (
            <span style={{ fontSize: '10px', color: '#aaa' }}>
              Purchased {item.boughtAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      <button className="task-delete" onClick={() => onEdit(item)} style={{ color: '#bbb' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button className="task-delete" onClick={() => onDelete(item.id)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          <path d="M10 11v6M14 11v6M9 6V4h6v2" />
        </svg>
      </button>
    </div>
  )
}
