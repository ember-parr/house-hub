import { useRef, useState } from 'react'
import { storage } from '../firebase'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'

const newId = () =>
  (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const sanitize = (name) => name.replace(/[^\w.-]+/g, '_').slice(0, 80)

function formatBytes(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeUrl(u) {
  const trimmed = (u || '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export default function Attachments({ mode, attachments = [], onChange, storagePrefix }) {
  const fileInputRef = useRef(null)
  const [uploads, setUploads] = useState({}) // { tempId: { name, progress, error } }
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const isView = mode === 'view'

  const addFiles = async (fileList) => {
    if (!storagePrefix) return
    const files = Array.from(fileList || [])
    for (const file of files) {
      const tempId = newId()
      const attachmentId = newId()
      const safeName = sanitize(file.name) || 'file'
      const path = `${storagePrefix}/${attachmentId}-${safeName}`
      setUploads((u) => ({ ...u, [tempId]: { name: file.name, progress: 0 } }))
      try {
        const task = uploadBytesResumable(ref(storage, path), file, {
          contentType: file.type || undefined,
        })
        await new Promise((resolve, reject) => {
          task.on(
            'state_changed',
            (s) => {
              const pct = s.totalBytes ? Math.round((s.bytesTransferred / s.totalBytes) * 100) : 0
              setUploads((u) => ({ ...u, [tempId]: { ...u[tempId], progress: pct } }))
            },
            reject,
            resolve,
          )
        })
        const url = await getDownloadURL(task.snapshot.ref)
        const newAttachment = {
          id: attachmentId,
          kind: 'file',
          name: file.name,
          url,
          path,
          contentType: file.type || '',
          size: file.size || 0,
          addedAt: Date.now(),
        }
        onChange?.([...(attachments || []), newAttachment])
      } catch (err) {
        setUploads((u) => ({ ...u, [tempId]: { ...u[tempId], error: err.message || 'Upload failed' } }))
        continue
      }
      setUploads((u) => {
        const { [tempId]: _, ...rest } = u
        return rest
      })
    }
  }

  const addLink = () => {
    const url = normalizeUrl(linkUrl)
    if (!url) return
    const newAttachment = {
      id: newId(),
      kind: 'link',
      name: linkName.trim() || url,
      url,
      addedAt: Date.now(),
    }
    onChange?.([...(attachments || []), newAttachment])
    setLinkName('')
    setLinkUrl('')
    setShowLinkForm(false)
  }

  const remove = (att) => {
    onChange?.((attachments || []).filter((a) => a.id !== att.id))
  }

  const hasContent = (attachments && attachments.length > 0) || Object.keys(uploads).length > 0

  if (isView && !hasContent) return null

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={labelStyle}>Attachments</div>

      {hasContent && (
        <div style={{ border: '0.5px solid #f5f4f1', borderRadius: '8px', overflow: 'hidden', marginBottom: isView ? 0 : '8px' }}>
          {(attachments || []).map((att, i) => (
            <div
              key={att.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px',
                borderBottom: i < (attachments.length - 1) || Object.keys(uploads).length > 0 ? '0.5px solid #f5f4f1' : 'none',
              }}
            >
              <span style={{ fontSize: '14px' }}>{att.kind === 'file' ? '📎' : '🔗'}</span>
              <a
                href={att.url}
                target="_blank"
                rel="noreferrer"
                style={{ flex: 1, minWidth: 0, fontSize: '13px', color: '#185FA5', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {att.name}
              </a>
              {att.kind === 'file' && att.size != null && (
                <span style={{ fontSize: '11px', color: '#bbb', flexShrink: 0 }}>{formatBytes(att.size)}</span>
              )}
              {!isView && (
                <button
                  onClick={() => remove(att)}
                  aria-label="Remove attachment"
                  style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', padding: '2px 6px', fontFamily: 'inherit', fontSize: '16px', lineHeight: 1 }}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {Object.entries(uploads).map(([id, u], idx, arr) => (
            <div
              key={id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px',
                borderBottom: idx < arr.length - 1 ? '0.5px solid #f5f4f1' : 'none',
              }}
            >
              <span style={{ fontSize: '14px' }}>⬆️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: '#1a2920', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.name}
                </div>
                {u.error ? (
                  <div style={{ fontSize: '11px', color: '#c0392b' }}>{u.error}</div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#bbb' }}>Uploading… {u.progress}%</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isView && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={chipBtnStyle}
            >
              + File
            </button>
            <button
              type="button"
              onClick={() => setShowLinkForm((s) => !s)}
              style={chipBtnStyle}
            >
              + Link
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {showLinkForm && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <input
                className="form-input"
                placeholder="Label (optional)"
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                style={{ flex: '1 1 140px', margin: 0 }}
              />
              <input
                className="form-input"
                placeholder="https://…"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
                style={{ flex: '2 1 200px', margin: 0 }}
              />
              <button
                type="button"
                onClick={addLink}
                disabled={!linkUrl.trim()}
                style={{ ...chipBtnStyle, color: '#185FA5', background: '#E6F1FB', border: 'none' }}
              >
                Add
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const labelStyle = {
  fontSize: '11px', fontWeight: 500, color: '#aaa',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px',
}

const chipBtnStyle = {
  fontSize: '12px', fontWeight: 500, color: '#555',
  background: 'white', border: '0.5px solid #e8e6e1',
  borderRadius: '6px', padding: '6px 10px',
  cursor: 'pointer', fontFamily: 'inherit',
}
