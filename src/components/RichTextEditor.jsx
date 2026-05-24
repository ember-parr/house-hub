import { useEffect, useRef } from 'react'

// Uses contentEditable + document.execCommand. execCommand is technically
// deprecated but still works across all modern browsers and keeps this
// component dependency-free. Content is stored as HTML; render it via
// dangerouslySetInnerHTML where you display it. Only safe to render if the
// content's writer is trusted (e.g. restricted by security rules).

function ToolbarBtn({ label, title, onClick, style }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      style={{
        background: '#f5f4f1', border: 'none', borderRadius: '6px',
        padding: '5px 9px', fontSize: '12px', fontFamily: 'inherit',
        color: '#444', cursor: 'pointer', minWidth: '28px',
        ...style,
      }}
    >
      {label}
    </button>
  )
}

export default function RichTextEditor({ initialHtml, onChange }) {
  const ref = useRef(null)
  const initialized = useRef(false)

  // Seed innerHTML exactly once on mount. After that, the DOM is the source
  // of truth — re-syncing from props on every render would jump the caret
  // back to the start of the field on each keystroke.
  useEffect(() => {
    if (ref.current && !initialized.current) {
      ref.current.innerHTML = initialHtml || ''
      initialized.current = true
    }
  }, [initialHtml])

  // Persist checkbox state into the HTML. Clicking a checkbox toggles the
  // `checked` DOM property, but that doesn't update the `checked` attribute
  // that gets serialized into innerHTML — so we mirror it here.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handle = (e) => {
      const t = e.target
      if (t.tagName === 'INPUT' && t.type === 'checkbox') {
        if (t.checked) t.setAttribute('checked', '')
        else t.removeAttribute('checked')
        onChange(el.innerHTML || '')
      }
    }
    el.addEventListener('change', handle)
    return () => el.removeEventListener('change', handle)
  }, [onChange])

  const exec = (cmd, arg = null) => {
    document.execCommand(cmd, false, arg)
    ref.current?.focus()
    onChange(ref.current?.innerHTML || '')
  }

  const insertTask = () => {
    // A single task line. The browser closes the surrounding block (e.g. a
    // <p>) and inserts this <div> as a sibling. Pressing Enter inside the
    // line will create a regular new line, not another task — click the
    // button again to add another.
    document.execCommand('insertHTML', false,
      '<div class="rte-task"><input type="checkbox"> &nbsp;</div>'
    )
    ref.current?.focus()
    onChange(ref.current?.innerHTML || '')
  }

  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
        <ToolbarBtn label={<b>B</b>}    title="Bold (Ctrl/Cmd+B)" onClick={() => exec('bold')} />
        <ToolbarBtn label={<i>I</i>}    title="Italic (Ctrl/Cmd+I)" onClick={() => exec('italic')} />
        <ToolbarBtn label={<u>U</u>}    title="Underline (Ctrl/Cmd+U)" onClick={() => exec('underline')} />
        <ToolbarBtn label="H1"          title="Heading 1"        onClick={() => exec('formatBlock', '<h1>')} style={{ fontWeight: 600 }} />
        <ToolbarBtn label="H2"          title="Heading 2"        onClick={() => exec('formatBlock', '<h2>')} style={{ fontWeight: 600 }} />
        <ToolbarBtn label="H3"          title="Heading 3"        onClick={() => exec('formatBlock', '<h3>')} style={{ fontWeight: 600 }} />
        <ToolbarBtn label="P"           title="Paragraph"        onClick={() => exec('formatBlock', '<p>')} />
        <ToolbarBtn label="• List"      title="Bulleted list"    onClick={() => exec('insertUnorderedList')} />
        <ToolbarBtn label="1. List"     title="Numbered list"    onClick={() => exec('insertOrderedList')} />
        <ToolbarBtn label="☐ Task"     title="Checkbox task"    onClick={insertTask} />
        <ToolbarBtn label="↶"           title="Undo"             onClick={() => exec('undo')} />
        <ToolbarBtn label="↷"           title="Redo"             onClick={() => exec('redo')} />
      </div>
      <div
        ref={ref}
        className="rich-text-content"
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML || '')}
        style={{
          minHeight: '160px', padding: '10px 12px', borderRadius: '8px',
          border: '0.5px solid #e0ddd8', background: 'white',
          fontSize: '13px', lineHeight: 1.5, color: '#1a2920',
          outline: 'none', overflowY: 'auto', maxHeight: '50vh',
        }}
      />
    </div>
  )
}

// Helper for callers: true if HTML has no visible text or content beyond
// whitespace/empty tags. Useful for "No content" empty states in view mode.
export function isEmptyHtml(html) {
  if (!html) return true
  const stripped = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  return stripped.length === 0
}
