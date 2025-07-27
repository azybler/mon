import { useState, useRef, useEffect } from 'react'
import './WysiwygEditor.css'

const WysiwygEditor = ({ value, onChange, placeholder = "Enter text..." }) => {
  const editorRef = useRef(null)
  const [isEditorFocused, setIsEditorFocused] = useState(false)

  // Update editor content when value prop changes
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || ''
    }
  }, [value])

  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value)
    editorRef.current.focus()
    handleContentChange()
  }

  const handleContentChange = () => {
    if (editorRef.current && onChange) {
      const content = editorRef.current.innerHTML
      onChange(content)
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    handleContentChange()
  }

  const handleKeyDown = (e) => {
    // Handle keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'b':
          e.preventDefault()
          execCommand('bold')
          break
        case 'i':
          e.preventDefault()
          execCommand('italic')
          break
        case 'u':
          e.preventDefault()
          execCommand('underline')
          break
        default:
          break
      }
    }
  }

  const isCommandActive = (command) => {
    return document.queryCommandState(command)
  }

  const insertList = (type) => {
    execCommand(type === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList')
  }

  return (
    <div className="wysiwyg-editor">
      <div className="wysiwyg-toolbar">
        <button
          type="button"
          className={`toolbar-button ${isCommandActive('bold') ? 'active' : ''}`}
          onClick={() => execCommand('bold')}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        
        <button
          type="button"
          className={`toolbar-button ${isCommandActive('italic') ? 'active' : ''}`}
          onClick={() => execCommand('italic')}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>
        
        <button
          type="button"
          className={`toolbar-button ${isCommandActive('underline') ? 'active' : ''}`}
          onClick={() => execCommand('underline')}
          title="Underline (Ctrl+U)"
        >
          <u>U</u>
        </button>

        <div className="toolbar-separator"></div>

        <button
          type="button"
          className={`toolbar-button ${isCommandActive('insertUnorderedList') ? 'active' : ''}`}
          onClick={() => insertList('unordered')}
          title="Bullet List"
        >
          •
        </button>

        <button
          type="button"
          className={`toolbar-button ${isCommandActive('insertOrderedList') ? 'active' : ''}`}
          onClick={() => insertList('ordered')}
          title="Numbered List"
        >
          1.
        </button>

        <div className="toolbar-separator"></div>

        <select
          className="toolbar-select"
          onChange={(e) => {
            if (e.target.value) {
              execCommand('formatBlock', e.target.value)
              e.target.value = ''
            }
          }}
          title="Text Format"
        >
          <option value="">Format</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="p">Paragraph</option>
        </select>

        <div className="toolbar-separator"></div>

        <button
          type="button"
          className="toolbar-button"
          onClick={() => execCommand('removeFormat')}
          title="Clear Formatting"
        >
          Clear
        </button>
      </div>

      <div
        ref={editorRef}
        className={`wysiwyg-content ${isEditorFocused ? 'focused' : ''}`}
        contentEditable
        onInput={handleContentChange}
        onFocus={() => setIsEditorFocused(true)}
        onBlur={() => setIsEditorFocused(false)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        suppressContentEditableWarning={true}
      />
    </div>
  )
}

export default WysiwygEditor
