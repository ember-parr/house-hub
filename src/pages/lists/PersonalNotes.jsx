import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import RichTextEditor, { isEmptyHtml } from '../../components/RichTextEditor'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PersonalNotes() {
  const { user } = useAuth()

  const [notes, setNotes]   = useState([])
  // modal: null | { mode: 'view' | 'edit', id?, title, content, updatedAt? }
  const [modal, setModal]   = useState(null)
  const [saving, setSaving] = useState(false)

  // Real-time listener on the current user's private notes subcollection.
  // Security rules restrict this path to the owner, so no one else can read it.
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'users', user.uid, 'personalNotes'),
      orderBy('updatedAt', 'desc'),
    )
    return onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  const openView = (note) => setModal({
    mode: 'view',
    id: note.id,
    title: note.title,
    content: note.content || '',
    updatedAt: note.updatedAt,
  })

  const openAdd = () => setModal({
    mode: 'edit',
    title: '',
    content: '',
  })

  const startEdit = () => setModal((m) => ({ ...m, mode: 'edit' }))

  const close = () => setModal(null)

  const save = async () => {
    if (!modal?.title?.trim() || !user) return
    setSaving(true)
    const payload = {
      title:     modal.title.trim(),
      content:   modal.content || '',
      updatedAt: serverTimestamp(),
    }
    if (modal.id) {
      await updateDoc(doc(db, 'users', user.uid, 'personalNotes', modal.id), payload)
    } else {
      await addDoc(collection(db, 'users', user.uid, 'personalNotes'), {
        ...payload,
        createdAt: serverTimestamp(),
      })
    }
    setSaving(false)
    close()
  }

  const remove = async (id) => {
    if (!user) return
    await deleteDoc(doc(db, 'users', user.uid, 'personalNotes', id))
    close()
  }

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/lists" className="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Lists
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Personal Notes</h1>
        <button
          onClick={openAdd}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 500, color: '#185FA5', background: '#E6F1FB', border: 'none', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 14, height: 14 }}>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add note
        </button>
      </div>

      {notes.length === 0 && (
        <div className="profile-card">
          <div style={{ fontSize: '13px', color: '#aaa' }}>
            No personal notes yet — add one above. These notes are visible only to you.
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="profile-card" style={{ padding: 0, overflow: 'hidden' }}>
          {notes.map((note, i) => (
            <button
              key={note.id}
              onClick={() => openView(note)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', padding: '12px 16px',
                borderBottom: i < notes.length - 1 ? '0.5px solid #f5f4f1' : 'none',
                display: 'flex', alignItems: 'center', gap: '12px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a2920', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {note.title}
                </div>
                {note.updatedAt && (
                  <div style={{ fontSize: '11px', color: '#bbb', marginTop: '2px' }}>
                    Updated {formatDate(note.updatedAt)}
                  </div>
                )}
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" style={{ width: 14, height: 14, flexShrink: 0 }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {modal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-handle" />

            {modal.mode === 'view' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                  <h2 className="modal-title" style={{ margin: 0, flex: 1 }}>{modal.title}</h2>
                  <button
                    onClick={startEdit}
                    style={{ fontSize: '12px', color: '#185FA5', background: '#E6F1FB', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                  >
                    Edit
                  </button>
                </div>
                {modal.updatedAt && (
                  <div style={{ fontSize: '11px', color: '#bbb', marginBottom: '12px' }}>
                    Updated {formatDate(modal.updatedAt)}
                  </div>
                )}
                {isEmptyHtml(modal.content) ? (
                  <div style={{ fontSize: '13px', color: '#bbb', fontStyle: 'italic' }}>No content.</div>
                ) : (
                  <div
                    className="rich-text-content"
                    style={{ fontSize: '13px', lineHeight: 1.55, color: '#1a2920' }}
                    dangerouslySetInnerHTML={{ __html: modal.content }}
                  />
                )}
              </>
            ) : (
              <>
                <h2 className="modal-title">{modal.id ? 'Edit note' : 'Add personal note'}</h2>
                <input
                  className="form-input"
                  placeholder="Title *"
                  value={modal.title}
                  onChange={(e) => setModal({ ...modal, title: e.target.value })}
                  autoFocus
                />
                <RichTextEditor
                  initialHtml={modal.content}
                  onChange={(html) => setModal((m) => ({ ...m, content: html }))}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  {modal.id && (
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
                    disabled={!modal.title?.trim() || saving}
                  >
                    {saving ? 'Saving...' : (modal.id ? 'Save changes' : 'Add note')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
