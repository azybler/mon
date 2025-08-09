import { useState, useEffect, useCallback } from 'react'
import WysiwygEditor from 'components/WysiwygEditor/WysiwygEditor'
import TagsFilter from 'components/TagsFilter/TagsFilter'
import SearchInput from 'components/SearchInput/SearchInput'
import Modal from 'components/Modal/Modal'
import TagAutocompleteInput from 'components/TagAutocomplete/TagAutocompleteInput'

const Notes = () => {
  // Debounce hook for performance optimization
  function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value)

    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedValue(value)
      }, delay)

      return () => {
        clearTimeout(handler)
      }
    }, [value, delay])

    return debouncedValue
  }

  const [notes, setNotes] = useState([])
  const [tags, setTags] = useState([])
  const [selectedTags, setSelectedTags] = useState([]) // New state for selected tags
  const [filterMode, setFilterMode] = useState('include') // 'include' or 'exclude'
  const [searchKeywords, setSearchKeywords] = useState('') // New state for keyword search
  const [loading, setLoading] = useState(true)
  const [tagsLoading, setTagsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [saving, setSaving] = useState(false)
  const [generatingTags, setGeneratingTags] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    tags: []
  })

  // Debounce filter changes to prevent excessive API calls
  const debouncedSelectedTags = useDebounce(selectedTags, 300)
  const debouncedFilterMode = useDebounce(filterMode, 300)
  const debouncedSearchKeywords = useDebounce(searchKeywords, 300)

  // Initial data fetch - only runs once
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Fetch both tags and notes in parallel
        const [tagsResponse, notesResponse] = await Promise.all([
          fetch('http://localhost:8081/api/note/tag/list'),
          fetch('http://localhost:8081/api/note/list')
        ])
        
        const [tagsData, notesData] = await Promise.all([
          tagsResponse.json(),
          notesResponse.json()
        ])
        
        if (tagsData.success) {
          setTags(tagsData.data || [])
        } else {
          console.error('Failed to fetch tags:', tagsData.message)
        }

        if (notesData.success) {
          // Filter out notes with empty id
          setNotes(notesData.data || [])
          setError(null)
        } else {
          setError(notesData.message || 'Failed to fetch notes')
        }
      } catch (err) {
        setError('Error connecting to the server')
        console.error('Error fetching initial data:', err)
      } finally {
        setLoading(false)
        setTagsLoading(false)
        setIsInitialized(true)
      }
    }
    
    initializeData()
  }, [])

  const fetchNotes = useCallback(async () => {
    try {
      // Only show loading spinner for non-search operations to avoid focus loss
      if (!debouncedSearchKeywords.trim()) {
        setLoading(true)
      }
      
      // Build URL with tag filters if any are selected
      let url = 'http://localhost:8081/api/note/list'
      const params = new URLSearchParams()
      
      if (filterMode === 'include' && selectedTags.length > 0) {
        // Include mode: send selected tags to show notes with any of these tags
        params.append('tags', selectedTags.join(','))
      } else if (filterMode === 'exclude' && tags.length > 0) {
        // Exclude mode: send unselected tags to exclude notes with these tags
        const allTagNames = tags.map(tagString => tagString.split(',')[0])
        const unselectedTags = allTagNames.filter(tag => !selectedTags.includes(tag))
        if (unselectedTags.length > 0) {
          params.append('exclude_tags', unselectedTags.join(','))
        }
      }
      
      const tokens = debouncedSearchKeywords.split(' ').filter(word => word.trim() !== '').map(word => word.trim())
      
      // find the first token that starts with a open round bracket "("
      const openParenIndex = tokens.findIndex(token => token.startsWith('('))
      
      // find the last token that ends with a open round bracket ")"
      const closeParenIndex = tokens.findLastIndex(token => token.endsWith(')'))

      // form a new keyword string from tokens array but excluding everything from openParenIndex to closeParenIndex
      if (openParenIndex !== -1 && closeParenIndex !== -1 && openParenIndex <= closeParenIndex) {
        const newKeywords = tokens.slice(0, openParenIndex).concat(tokens.slice(closeParenIndex + 1)).join(' ')
        if (newKeywords.trim() !== '') {
          params.append('keywords', newKeywords)
        }
      } else {
        if (debouncedSearchKeywords.trim() !== '') {
          params.append('keywords', debouncedSearchKeywords.trim())
        }
      }

      // form a new advanced expression from tokens array that includes everything from openParenIndex to closeParenIndex
      if (openParenIndex !== -1 && closeParenIndex !== -1 && openParenIndex <= closeParenIndex) {
        const newAdvancedExpression = tokens.slice(openParenIndex, closeParenIndex + 1).join(' ').replace(/#/g, '')
        if (newAdvancedExpression.trim() !== '') {
          params.append('advanced', newAdvancedExpression)
        }
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`
      }
      
      const response = await fetch(url)
      const notesData = await response.json()
      
      if (notesData.success) {
        setNotes(notesData.data || [])
        setError(null)
      } else {
        setError(notesData.message || 'Failed to fetch notes')
      }
    } catch (err) {
      setError('Error connecting to the server')
      console.error('Error fetching notes:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedTags, filterMode, tags, debouncedSearchKeywords])

  // Fetch notes when filters change (but only after initial load)
  useEffect(() => {
    if (isInitialized) {
      fetchNotes()
    }
  }, [debouncedSelectedTags, debouncedFilterMode, debouncedSearchKeywords, isInitialized, fetchNotes])

  const fetchTags = useCallback(async () => {
    try {
      setTagsLoading(true)
      const response = await fetch('http://localhost:8081/api/note/tag/list')
      const data = await response.json()
      
      if (data.success) {
        setTags(data.data || [])
      } else {
        console.error('Failed to fetch tags:', data.message)
      }
    } catch (err) {
      console.error('Error fetching tags:', err)
    } finally {
      setTagsLoading(false)
    }
  }, [])

  const createNote = async (e) => {
    e.preventDefault()
    
    // Function to strip HTML tags for validation
    const stripHtml = (html) => {
      const tmp = document.createElement('div')
      tmp.innerHTML = html
      return tmp.textContent || tmp.innerText || ''
    }
    
    if (!formData.title.trim() || !stripHtml(formData.description).trim()) {
      alert('Title and Description are required')
      return
    }

    try {
      setSaving(true)
      
      // Use tags array directly (already parsed)
      const tags = formData.tags.map(tag => tag.toLowerCase())

      const url = editingNote 
        ? `http://localhost:8081/api/note/edit/${editingNote.id}`
        : 'http://localhost:8081/api/note/create'

      const method = editingNote ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim(),
          tags: tags
        })
      })

      const data = await response.json()
      
      if (data.success) {
        // Reset form
        setFormData({ title: '', description: '', tags: [] })
        setEditingNote(null)
        setShowModal(false)
        
        // Optimistically update the UI without refetching everything
        if (editingNote) {
          // Update existing note in state
          setNotes(prev => prev.map(b => 
            b.id === editingNote.id ? data.data : b
          ))
        } else {
          // Add new note to state
          setNotes(prev => [data.data, ...prev])
        }
        
        // Only refetch tags if we added/changed tags
        const newTags = formData.tags
        const oldTags = editingNote?.tags || []
        const tagsChanged = JSON.stringify(newTags.sort()) !== JSON.stringify(oldTags.sort())
        
        if (tagsChanged) {
          fetchTags()
        }
      } else {
        alert(data.message || `Failed to ${editingNote ? 'update' : 'create'} note`)
      }
    } catch (err) {
      alert(`Error ${editingNote ? 'updating' : 'creating'} note: ` + err.message)
      console.error(`Error ${editingNote ? 'updating' : 'creating'} note:`, err)
    } finally {
      setSaving(false)
    }
  }

  const editNote = (note) => {
    setEditingNote(note)
    setFormData({
      title: note.title,
      description: note.description,
      tags: note.tags || []
    })
    setShowModal(true)
  }

  const generateTags = async () => {
    // Function to strip HTML tags for validation
    const stripHtml = (html) => {
      const tmp = document.createElement('div')
      tmp.innerHTML = html
      return tmp.textContent || tmp.innerText || ''
    }
    
    if (!formData.title.trim() || !stripHtml(formData.description).trim()) {
      alert('Please enter a title and description first')
      return
    }

    try {
      setGeneratingTags(true)
      
      // Get AI config from localStorage
      const savedConfig = localStorage.getItem('mon-ai-config')
      if (!savedConfig) {
        alert('Please configure AI settings first in the Settings page')
        return
      }

      const aiConfig = JSON.parse(savedConfig)
      if (!aiConfig.apiKey) {
        alert('Please set your OpenRouter API key in Settings')
        return
      }

      // Strip HTML from description for AI processing
      const cleanDescription = stripHtml(formData.description)
      const prompt = `${aiConfig.tagPrompt}\n\nTitle: ${formData.title}\nDescription: ${cleanDescription}`
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Mon Note Manager'
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 100,
          temperature: 0.3
        })
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`)
      }

      const data = await response.json()
      const suggestedTags = data.choices[0]?.message?.content?.trim()
      
      if (suggestedTags) {
        // Parse the AI-generated tags into an array (comma-separated -> array)
        const tagsArray = suggestedTags
          .split(',')
          .map(tag => tag.trim().toLowerCase())
          .filter(tag => tag.length > 0)

        setFormData(prev => ({
          ...prev,
          tags: tagsArray
        }))
      } else {
        alert('No tags were generated. Please try again.')
      }
    } catch (err) {
      console.error('Error generating tags:', err)
      alert('Error generating tags: ' + err.message)
    } finally {
      setGeneratingTags(false)
    }
  }

  // Handle search input changes with focus preservation
  const handleSearchChange = useCallback((value) => {
    setSearchKeywords(value)
  }, [])

  // Handle clear search
  const handleClearSearch = useCallback(() => {
    setSearchKeywords('')
  }, [])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingNote(null)
    setFormData({ title: '', description: '', tags: [] })
  }

  const deleteNote = async (note) => {
    if (!confirm(`Are you sure you want to delete "${note.title}"?`)) {
      return
    }

    try {
      const response = await fetch(`http://localhost:8081/api/note/delete/${note.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      
      if (data.success) {
        // Optimistically remove note from state
        setNotes(prev => prev.filter(b => b.id !== note.id))

        // Only refetch tags if the deleted note had tags
        if (note.tags && note.tags.length > 0) {
          fetchTags()
        }
      } else {
        alert(data.message || 'Failed to delete note')
      }
    } catch (err) {
      alert('Error deleting note: ' + err.message)
      console.error('Error deleting note:', err)
    }
  }

  // Toggle tag selection for filtering
  const toggleTagFilter = useCallback((tagName) => {
    setSelectedTags(prev => {
      if (prev.includes(tagName)) {
        // Remove tag from selection
        return prev.filter(tag => tag !== tagName)
      } else {
        // Add tag to selection
        return [...prev, tagName]
      }
    })
  }, [])

  // Clear all tag filters
  const clearTagFilters = useCallback(() => {
    if (filterMode === 'exclude') {
      // In exclude mode, "clear filters" means select all tags (exclude none)
      const allTagNames = tags.map(tagString => tagString.split(',')[0])
      setSelectedTags(allTagNames)
    } else {
      // In include mode, clear all selections
      setSelectedTags([])
    }
  }, [filterMode, tags])

  // Toggle filter mode between include and exclude
  const toggleFilterMode = useCallback(() => {
    setFilterMode(prev => {
      const newMode = prev === 'include' ? 'exclude' : 'include'
      
      if (newMode === 'exclude') {
        // When switching to exclude mode, select all tags initially
        const allTagNames = tags.map(tagString => tagString.split(',')[0])
        setSelectedTags(allTagNames)
      } else {
        // When switching to include mode, clear all selections
        setSelectedTags([])
      }
      
      return newMode
    })
  }, [tags])

  if (loading) {
    return (
      <div className="section-content">
        <h2>Notes</h2>
        <p>Loading your notes...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="section-content">
        <h2>Notes</h2>
        <div className="error-message">
          <p>Error: {error}</p>
          <button onClick={fetchNotes} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="section-content">
      <div className="notes-header">
        <div>
          {filterMode === 'include' && selectedTags.length > 0 ? (
            <>
              {notes.length} Note{notes.length !== 1 ? 's' : ''} 
              <span className="filter-indicator"> (showing notes with {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''})</span>
            </>
          ) : filterMode === 'exclude' && selectedTags.length < tags.length ? (
            <>
              {notes.length} Note{notes.length !== 1 ? 's' : ''} 
              <span className="filter-indicator"> (excluding {tags.length - selectedTags.length} tag{tags.length - selectedTags.length !== 1 ? 's' : ''})</span>
            </>
          ) : (
            `${notes.length} Note${notes.length !== 1 ? 's' : ''}`
          )}
          {searchKeywords && (
            <span className="search-indicator"> (searching: "{searchKeywords}")</span>
          )}
        </div>
        <button 
          className="add-note-button"
          onClick={() => setShowModal(true)}
        >
          + Add Note
        </button>
      </div>

      {/* Tags section */}
      <TagsFilter
        tags={tags}
        selectedTags={selectedTags}
        filterMode={filterMode}
        tagsLoading={tagsLoading}
        itemType="note"
        onToggleTagFilter={toggleTagFilter}
        onClearTagFilters={clearTagFilters}
        onToggleFilterMode={toggleFilterMode}
      />

      {/* Search section */}
      <SearchInput 
        searchTerm={searchKeywords}
        onSearchChange={handleSearchChange}
        onClearSearch={handleClearSearch}
        placeholder="Enter keywords to search... (use -word to exclude, or use advanced tag expressions e.g. ((#tag1 AND #tag2) OR NOT #tag3))"
        tags={tags}
      />

      {notes.length === 0 ? (
        <div className="empty-state">
          <p>No notes found. Start adding some notes to see them here!</p>
          <button 
            className="add-first-note-button"
            onClick={() => setShowModal(true)}
          >
            Add Your First Note
          </button>
        </div>
      ) : (
        <div className="notes-grid">
          {notes.map((note) => (
            <div key={note.id} className="note-card">
              <div className="note-header">
                <h4 className="note-title">{note.title}</h4>
                <div className="note-actions">
                  <button 
                    className="note-edit"
                    onClick={() => editNote(note)}
                    title="Edit note"
                  >
                    ✏️
                  </button>
                  <button 
                    className="note-delete"
                    onClick={() => deleteNote(note)}
                    title="Delete note"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              <div className="note-description">
                <div dangerouslySetInnerHTML={{ __html: note.description }} />
              </div>

              {note.tags && note.tags.length > 0 && (
                <div className="note-tags">
                  {note.tags.map((tag, index) => (
                    <span key={index} className="note-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingNote ? 'Edit Note' : 'Add New Note'}
        size="large"
        actions={
          <>
            <button 
              type="button" 
              className="cancel-button"
              onClick={closeModal}
              disabled={saving}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="save-button"
              disabled={saving}
              form="note-form"
            >
              {saving 
                ? (editingNote ? 'Updating...' : 'Saving...') 
                : (editingNote ? 'Update Note' : 'Save Note')
              }
            </button>
          </>
        }
      >
        <form id="note-form" onSubmit={createNote} className="note-form">
          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Enter note title"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <WysiwygEditor
              value={formData.description}
              onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
              placeholder="Enter note description with formatting..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="tags">Tags</label>
            <div className="tags-input-container">
              <TagAutocompleteInput
                selectedTags={formData.tags}
                onTagsChange={(newTags) => setFormData(prev => ({ ...prev, tags: newTags }))}
                availableTags={tags}
                placeholder="Add tags..."
                className="tags-input"
              />
              <button 
                type="button"
                className="ai-button"
                onClick={generateTags}
                disabled={generatingTags}
                title="Generate tags with AI"
              >
                {generatingTags ? '⏳' : '🤖'}
              </button>
            </div>
            <small>Type to add tags, press Enter to create new ones, or use AI to generate them</small>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default Notes
