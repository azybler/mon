import { useState, useEffect, useCallback } from 'react'
import TagsFilter from 'components/TagsFilter/TagsFilter'
import SearchInput from 'components/SearchInput/SearchInput'
import Modal from 'components/Modal/Modal'
import TagAutocompleteInput from 'components/TagAutocomplete/TagAutocompleteInput'

const Bookmarks = () => {
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

  const [bookmarks, setBookmarks] = useState([])
  const [tags, setTags] = useState([])
  const [selectedTags, setSelectedTags] = useState([]) // New state for selected tags
  const [filterMode, setFilterMode] = useState('include') // 'include' or 'exclude'
  const [searchKeywords, setSearchKeywords] = useState('') // New state for keyword search
  const [loading, setLoading] = useState(true)
  const [tagsLoading, setTagsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState(null)
  const [saving, setSaving] = useState(false)
  const [generatingTags, setGeneratingTags] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState(null)
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    tags: []
  })

  // Debounce filter changes to prevent excessive API calls
  const debouncedSelectedTags = useDebounce(selectedTags, 300)
  const debouncedFilterMode = useDebounce(filterMode, 300)
  const debouncedSearchKeywords = useDebounce(searchKeywords, 300)
  const debouncedFormTitle = useDebounce(formData.title, 500)
  const debouncedFormURL = useDebounce(formData.url, 500)

  // Initial data fetch - only runs once
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Fetch both tags and bookmarks in parallel
        const [tagsResponse, bookmarksResponse] = await Promise.all([
          fetch('http://localhost:8081/api/bookmark/tag/list'),
          fetch('http://localhost:8081/api/bookmark/list')
        ])
        
        const [tagsData, bookmarksData] = await Promise.all([
          tagsResponse.json(),
          bookmarksResponse.json()
        ])
        
        if (tagsData.success) {
          setTags(tagsData.data || [])
        } else {
          console.error('Failed to fetch tags:', tagsData.message)
        }
        
        if (bookmarksData.success) {
          setBookmarks(bookmarksData.data || [])
          setError(null)
        } else {
          setError(bookmarksData.message || 'Failed to fetch bookmarks')
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

    const fetchBookmarks = useCallback(async () => {
    try {
      // Only show loading spinner for non-search operations to avoid focus loss
      if (!debouncedSearchKeywords.trim()) {
        setLoading(true)
      }
      
      // Build URL with different filtering approaches
      let url = 'http://localhost:8081/api/bookmark/list'
      const params = new URLSearchParams()
      
      if (filterMode === 'include' && selectedTags.length > 0) {
        // Include mode: send selected tags to show bookmarks with any of these tags
        params.append('tags', selectedTags.join(','))
      } else if (filterMode === 'exclude' && tags.length > 0) {
        // Exclude mode: send unselected tags to exclude bookmarks with these tags
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
      const data = await response.json()
      
      if (data.success) {
        setBookmarks(data.data || [])
        setError(null)
      } else {
        setError(data.message || 'Failed to fetch bookmarks')
      }
    } catch (err) {
      setError('Error connecting to the server')
      console.error('Error fetching bookmarks:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedTags, filterMode, tags, debouncedSearchKeywords])

  // Fetch bookmarks when filters change (but only after initial load)
  useEffect(() => {
    if (isInitialized) {
      fetchBookmarks()
    }
  }, [debouncedSelectedTags, debouncedFilterMode, debouncedSearchKeywords, isInitialized, fetchBookmarks])

  const fetchTags = useCallback(async () => {
    try {
      setTagsLoading(true)
      const response = await fetch('http://localhost:8081/api/bookmark/tag/list')
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

  const checkDuplicates = useCallback(async (title, url) => {
    // Skip check if both title and URL are empty
    if (!title.trim() && !url.trim()) {
      setDuplicateWarning(null)
      return
    }

    try {
      setCheckingDuplicates(true)
      
      const response = await fetch('http://localhost:8081/api/bookmark/check-duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          url: url.trim(),
          id: editingBookmark?.id // Exclude current bookmark when editing
        })
      })

      const data = await response.json()
      
      if (data.success) {
        if (data.has_duplicates && data.duplicates.length > 0) {
          const duplicateMessages = []
          
          // Check for title duplicates
          const titleDuplicates = data.duplicates.filter(d => 
            title.trim() && d.title.trim().toLowerCase() === title.trim().toLowerCase()
          )
          if (titleDuplicates.length > 0) {
            duplicateMessages.push(`Title "${title}" already exists`)
          }
          
          // Check for URL duplicates
          const urlDuplicates = data.duplicates.filter(d => 
            url.trim() && d.url.trim().toLowerCase() === url.trim().toLowerCase()
          )
          if (urlDuplicates.length > 0) {
            duplicateMessages.push(`URL "${url}" already exists`)
          }
          
          if (duplicateMessages.length > 0) {
            setDuplicateWarning({
              message: duplicateMessages.join(' and '),
              duplicates: data.duplicates
            })
          } else {
            setDuplicateWarning(null)
          }
        } else {
          setDuplicateWarning(null)
        }
      }
    } catch (err) {
      console.error('Error checking duplicates:', err)
      // Don't show error to user for duplicate checking - it's not critical
    } finally {
      setCheckingDuplicates(false)
    }
  }, [editingBookmark?.id])

  // Check for duplicates when title or URL changes
  useEffect(() => {
    if (showModal && (debouncedFormTitle || debouncedFormURL)) {
      checkDuplicates(debouncedFormTitle, debouncedFormURL)
    } else {
      setDuplicateWarning(null)
    }
  }, [debouncedFormTitle, debouncedFormURL, showModal, checkDuplicates])

  const createBookmark = async (e) => {
    e.preventDefault()
    
    if (!formData.title.trim() || !formData.url.trim()) {
      alert('Title and URL are required')
      return
    }

    try {
      setSaving(true)
      
      // Use tags array directly (already parsed)
      const tags = formData.tags.map(tag => tag.toLowerCase())

      const url = editingBookmark 
        ? `http://localhost:8081/api/bookmark/edit/${editingBookmark.id}`
        : 'http://localhost:8081/api/bookmark/create'
      
      const method = editingBookmark ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          url: formData.url.trim(),
          tags: tags
        })
      })

      const data = await response.json()
      
      if (data.success) {
        // Reset form
        setFormData({ title: '', url: '', tags: [] })
        setEditingBookmark(null)
        setShowModal(false)
        
        // Optimistically update the UI without refetching everything
        if (editingBookmark) {
          // Update existing bookmark in state
          setBookmarks(prev => prev.map(b => 
            b.id === editingBookmark.id ? data.data : b
          ))
        } else {
          // Add new bookmark to state
          setBookmarks(prev => [data.data, ...prev])
        }
        
        // Only refetch tags if we added/changed tags
        const newTags = formData.tags
        const oldTags = editingBookmark?.tags || []
        const tagsChanged = JSON.stringify(newTags.sort()) !== JSON.stringify(oldTags.sort())
        
        if (tagsChanged) {
          fetchTags()
        }
      } else {
        alert(data.message || `Failed to ${editingBookmark ? 'update' : 'create'} bookmark`)
      }
    } catch (err) {
      alert(`Error ${editingBookmark ? 'updating' : 'creating'} bookmark: ` + err.message)
      console.error(`Error ${editingBookmark ? 'updating' : 'creating'} bookmark:`, err)
    } finally {
      setSaving(false)
    }
  }

  const editBookmark = (bookmark) => {
    setEditingBookmark(bookmark)
    setFormData({
      title: bookmark.title,
      url: bookmark.url,
      tags: bookmark.tags || []
    })
    setShowModal(true)
  }

  const generateTags = async () => {
    if (!formData.title.trim() || !formData.url.trim()) {
      alert('Please enter a title and URL first')
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

      const prompt = `${aiConfig.tagPrompt}\n\nTitle: ${formData.title}\nURL: ${formData.url}`
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Mon Bookmark Manager'
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
        // Parse the AI-generated tags into an array
        // Assuming tags are comma-separated, split and clean them
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
    setEditingBookmark(null)
    setFormData({ title: '', url: '', tags: [] })
    setDuplicateWarning(null)
  }

  const openBookmark = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const deleteBookmark = async (bookmark) => {
    if (!confirm(`Are you sure you want to delete "${bookmark.title}"?`)) {
      return
    }

    try {
      const response = await fetch(`http://localhost:8081/api/bookmark/delete/${bookmark.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      
      if (data.success) {
        // Optimistically remove bookmark from state
        setBookmarks(prev => prev.filter(b => b.id !== bookmark.id))
        
        // Only refetch tags if the deleted bookmark had tags
        if (bookmark.tags && bookmark.tags.length > 0) {
          fetchTags()
        }
      } else {
        alert(data.message || 'Failed to delete bookmark')
      }
    } catch (err) {
      alert('Error deleting bookmark: ' + err.message)
      console.error('Error deleting bookmark:', err)
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
        <h2>Bookmarks</h2>
        <p>Loading your bookmarks...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="section-content">
        <h2>Bookmarks</h2>
        <div className="error-message">
          <p>Error: {error}</p>
          <button onClick={fetchBookmarks} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="section-content">
      <div className="bookmarks-header">
        <div>
          {filterMode === 'include' && selectedTags.length > 0 ? (
            <>
              {bookmarks.length} Bookmark{bookmarks.length !== 1 ? 's' : ''} 
              <span className="filter-indicator"> (showing bookmarks with {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''})</span>
            </>
          ) : filterMode === 'exclude' && selectedTags.length < tags.length ? (
            <>
              {bookmarks.length} Bookmark{bookmarks.length !== 1 ? 's' : ''} 
              <span className="filter-indicator"> (excluding {tags.length - selectedTags.length} tag{tags.length - selectedTags.length !== 1 ? 's' : ''})</span>
            </>
          ) : (
            `${bookmarks.length} Bookmark${bookmarks.length !== 1 ? 's' : ''}`
          )}
          {searchKeywords && (
            <span className="search-indicator"> (searching: "{searchKeywords}")</span>
          )}
        </div>
        <button 
          className="add-bookmark-button"
          onClick={() => setShowModal(true)}
        >
          + Add Bookmark
        </button>
      </div>

      {/* Tags section */}
      <TagsFilter
        tags={tags}
        selectedTags={selectedTags}
        filterMode={filterMode}
        tagsLoading={tagsLoading}
        itemType="bookmark"
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

      {bookmarks.length === 0 ? (
        <div className="empty-state">
          <p>No bookmarks found. Start adding some bookmarks to see them here!</p>
          <button 
            className="add-first-bookmark-button"
            onClick={() => setShowModal(true)}
          >
            Add Your First Bookmark
          </button>
        </div>
      ) : (
        <div className="bookmarks-grid">
          {bookmarks.map((bookmark) => (
            <div key={bookmark.id} className="bookmark-card">
              <div className="bookmark-header">
                <h4 className="bookmark-title" onClick={() => openBookmark(bookmark.url)}>{bookmark.title}</h4>
                <div className="bookmark-actions">
                  <button 
                    className="bookmark-edit"
                    onClick={() => editBookmark(bookmark)}
                    title="Edit bookmark"
                  >
                    ✏️
                  </button>
                  <button 
                    className="bookmark-delete"
                    onClick={() => deleteBookmark(bookmark)}
                    title="Delete bookmark"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              <div className="bookmark-url">
                <a 
                  href={bookmark.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={(e) => e.preventDefault()}
                >
                  {bookmark.url}
                </a>
              </div>

              {bookmark.tags && bookmark.tags.length > 0 && (
                <div className="bookmark-tags">
                  {bookmark.tags.map((tag, index) => (
                    <span key={index} className="bookmark-tag">
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
        title={editingBookmark ? 'Edit Bookmark' : 'Add New Bookmark'}
        size="medium"
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
              form="bookmark-form"
            >
              {saving 
                ? (editingBookmark ? 'Updating...' : 'Saving...') 
                : (editingBookmark ? 'Update Bookmark' : 'Save Bookmark')
              }
            </button>
          </>
        }
      >
        <form id="bookmark-form" onSubmit={createBookmark} className="bookmark-form">
          {/* Duplicate warning */}
          {duplicateWarning && (
            <div className="duplicate-warning" style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeaa7',
              borderRadius: '4px',
              padding: '12px',
              marginBottom: '16px',
              color: '#856404'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                ⚠️ Potential Duplicate Detected
              </div>
              <div style={{ marginBottom: '8px' }}>
                {duplicateWarning.message}
              </div>
              {duplicateWarning.duplicates && duplicateWarning.duplicates.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.9em', marginBottom: '6px' }}>
                    Existing bookmark(s):
                  </div>
                  {duplicateWarning.duplicates.map((duplicate, index) => (
                    <div key={duplicate.id} style={{ 
                      fontSize: '0.85em', 
                      marginLeft: '12px',
                      marginBottom: '4px',
                      color: '#6c757d'
                    }}>
                      • {duplicate.title} - {duplicate.url}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: '0.85em', marginTop: '8px', fontStyle: 'italic' }}>
                You can still proceed if this is intentional.
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Enter bookmark title"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="url">URL *</label>
            <input
              type="url"
              id="url"
              name="url"
              value={formData.url}
              onChange={handleInputChange}
              placeholder="https://example.com"
              required
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

export default Bookmarks
