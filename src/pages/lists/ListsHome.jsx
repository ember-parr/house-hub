import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'

export default function ListsHome() {
  const [showGenerate, setShowGenerate] = useState(false)
  const [items, setItems]               = useState([])
  const [selectedStores, setSelectedStores] = useState(new Set())
  const [copied, setCopied]             = useState(false)

  // Keep a live snapshot of all shopping items; filter client-side
  useEffect(() => {
    const q = query(collection(db, 'shopping'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  const storeLabel = (item) =>
    item.store === 'Other' ? (item.storeName || 'Other') : item.store

  const unpurchased    = items.filter((i) => !i.bought)
  const availableStores = [...new Set(unpurchased.map(storeLabel).filter(Boolean))].sort()

  const openGenerate = () => {
    setSelectedStores(new Set(availableStores))
    setCopied(false)
    setShowGenerate(true)
  }

  const toggleStore = (store) => {
    setSelectedStores((prev) => {
      const next = new Set(prev)
      if (next.has(store)) next.delete(store)
      else next.add(store)
      return next
    })
  }

  const filteredItems = unpurchased
    .filter((i) => selectedStores.has(storeLabel(i)))
    .sort((a, b) => storeLabel(a).localeCompare(storeLabel(b)) || a.thing.localeCompare(b.thing))

  // Group filtered items by store for display and copy
  const grouped = availableStores
    .filter((s) => selectedStores.has(s))
    .map((store) => ({ store, items: filteredItems.filter((i) => storeLabel(i) === store) }))
    .filter((g) => g.items.length > 0)

  const generateText = () => {
    const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const lines = ['SHOPPING LIST', `Generated ${date}`, '']
    for (const { store, items: storeItems } of grouped) {
      lines.push(store.toUpperCase())
      for (const item of storeItems) {
        let line = `${item.thing}`
        // if (item.estimatedCost != null) line += ` — $${item.estimatedCost.toFixed(2)}`
        lines.push(line)
        if (item.notes) lines.push(`  ${item.notes}`)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  const copyList = () => {
    navigator.clipboard.writeText(generateText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="page">
      <div className="home-greeting">
        <h1>Lists</h1>
        <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="card-grid">
        <Link to="/lists/inventory" className="nav-card"><h2>Inventory</h2></Link>
        <Link to="/lists/shopping"  className="nav-card"><h2>Shopping</h2></Link>
        <Link to="/lists/Wishlist"  className="nav-card"><h2>Wish Lists</h2></Link>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <div className="section-label">Tools</div>
        <div className="dashboard-grid">
          <button
            className="dashboard-card"
            onClick={openGenerate}
            style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', background: 'white', border: '0.5px solid #e8e6e1' }}
          >
            <div className="card-icon" style={{ background: '#E1F5EE', color: '#0F6E56' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
              </svg>
            </div>
            <div className="card-title">Generate</div>
            <div className="card-subtitle">Shopping list</div>
          </button>
        </div>
      </div>

      {/* Generate modal */}
      {showGenerate && (
        <div className="modal-overlay" onClick={() => setShowGenerate(false)}>
          <div
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ overflowY: 'auto', maxHeight: '85vh' }}
          >
            <div className="modal-handle" />
            <h2 className="modal-title">Generate shopping list</h2>

            {availableStores.length === 0 ? (
              <div className="empty-state" style={{ padding: '1rem 0' }}>
                No unpurchased items on the shopping list
              </div>
            ) : (
              <>
                {/* Store picker */}
                <div style={labelStyle}>Select stores</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                  {availableStores.map((store) => (
                    <button
                      key={store}
                      className={`chip ${selectedStores.has(store) ? 'chip-active' : ''}`}
                      onClick={() => toggleStore(store)}
                    >
                      {store}
                    </button>
                  ))}
                </div>

                {/* Preview */}
                {grouped.length > 0 ? (
                  <>
                    <div style={labelStyle}>Preview</div>
                    <div style={{ background: '#f8f8f6', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px', fontSize: '12px', lineHeight: 1.8 }}>
                      {grouped.map(({ store, items: storeItems }) => (
                        <div key={store} style={{ marginBottom: '10px' }}>
                          <div style={{ fontWeight: 600, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555', marginBottom: '3px' }}>
                            {store}
                          </div>
                          {storeItems.map((item) => (
                            <div key={item.id}>
                              {/* <span style={{ color: '#bbb', marginRight: '6px' }}>□</span> */}
                              <span style={{ fontWeight: 500, color: '#333' }}>{item.thing}</span>
                              {/* <span style={{ color: '#999' }}> · {item.type}</span> */}
                              {/* {item.estimatedCost != null && (
                                <span style={{ color: '#999' }}> · ${item.estimatedCost.toFixed(2)}</span>
                              )}
                              {item.notes && (
                                <div style={{ paddingLeft: '18px', color: '#aaa', fontSize: '11px', lineHeight: 1.5 }}>{item.notes}</div>
                              )} */}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    <button className="btn-primary" onClick={copyList}>
                      {copied ? '✓ Copied to clipboard' : 'Copy list'}
                    </button>
                  </>
                ) : (
                  <div className="empty-state" style={{ padding: '0.5rem 0' }}>
                    Select at least one store to generate a list
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle = {
  fontSize: '11px', fontWeight: 500, color: '#aaa',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
}
