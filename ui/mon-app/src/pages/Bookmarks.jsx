import { useState, useEffect, useCallback } from 'react'

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

function Bookmarks() {
  const [bookmarks, setBookmarks] = useState([])
  const [tags, setTags] = useState([])
  const [selectedTags, setSelectedTags] = useState([]) // New state for selected tags
  const [filterMode, setFilterMode] = useState('include') // 'include' or 'exclude'
  const [loading, setLoading] = useState(true)
  const [tagsLoading, setTagsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState(null)
  const [saving, setSaving] = useState(false)
  const [generatingTags, setGeneratingTags] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    tags: ''
  })

  // Debounce filter changes to prevent excessive API calls
  const debouncedSelectedTags = useDebounce(selectedTags, 300)
  const debouncedFilterMode = useDebounce(filterMode, 300)

  // Initial data fetch - only runs once
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Fetch both tags and bookmarks in parallel
        const [tagsResponse, bookmarksResponse] = await Promise.all([
          fetch('http://localhost:8080/api/get-tags'),
          fetch('http://localhost:8080/api/get-bookmarks')
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

  // Fetch bookmarks when filters change (but only after initial load)
  useEffect(() => {
    if (isInitialized) {
      fetchBookmarks()
    }
  }, [debouncedSelectedTags, debouncedFilterMode, isInitialized])

  const fetchTags = useCallback(async () => {
    try {
      setTagsLoading(true)
      const response = await fetch('http://localhost:8080/api/get-tags')
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

  const fetchBookmarks = useCallback(async () => {
    try {
      setLoading(true)
      
      // Build URL with tag filters if any are selected
      let url = 'http://localhost:8080/api/get-bookmarks'
      
      if (filterMode === 'include' && selectedTags.length > 0) {
        // Include mode: send selected tags to show bookmarks with any of these tags
        const tagParams = selectedTags.join(',')
        url += `?tags=${encodeURIComponent(tagParams)}`
      } else if (filterMode === 'exclude' && tags.length > 0) {
        // Exclude mode: send unselected tags to exclude bookmarks with these tags
        const allTagNames = tags.map(tagString => tagString.split(',')[0])
        const unselectedTags = allTagNames.filter(tag => !selectedTags.includes(tag))
        if (unselectedTags.length > 0) {
          const tagParams = unselectedTags.join(',')
          url += `?exclude_tags=${encodeURIComponent(tagParams)}`
        }
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
  }, [selectedTags, filterMode, tags])

  const createBookmark = async (e) => {
    e.preventDefault()
    
    if (!formData.title.trim() || !formData.url.trim()) {
      alert('Title and URL are required')
      return
    }

    try {
      setSaving(true)
      
      // Parse tags from comma-separated string
      const tags = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)

      const url = editingBookmark 
        ? `http://localhost:8080/api/edit-bookmark/${editingBookmark.id}`
        : 'http://localhost:8080/api/create-bookmark'
      
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
        setFormData({ title: '', url: '', tags: '' })
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
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0)
        
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
      tags: bookmark.tags ? bookmark.tags.join(', ') : ''
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
        setFormData(prev => ({
          ...prev,
          tags: suggestedTags
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
    setFormData({ title: '', url: '', tags: '' })
  }

  const openBookmark = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const deleteBookmark = async (bookmark) => {
    if (!confirm(`Are you sure you want to delete "${bookmark.title}"?`)) {
      return
    }

    try {
      const response = await fetch(`http://localhost:8080/api/delete-bookmark/${bookmark.id}`, {
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
  const toggleTagFilter = (tagName) => {
    setSelectedTags(prev => {
      if (prev.includes(tagName)) {
        // Remove tag from selection
        return prev.filter(tag => tag !== tagName)
      } else {
        // Add tag to selection
        return [...prev, tagName]
      }
    })
  }

  // Clear all tag filters
  const clearTagFilters = () => {
    if (filterMode === 'exclude') {
      // In exclude mode, "clear filters" means select all tags (exclude none)
      const allTagNames = tags.map(tagString => tagString.split(',')[0])
      setSelectedTags(allTagNames)
    } else {
      // In include mode, clear all selections
      setSelectedTags([])
    }
  }

  // Toggle filter mode between include and exclude
  const toggleFilterMode = () => {
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
  }

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
        </div>
        <button 
          className="add-bookmark-button"
          onClick={() => setShowModal(true)}
        >
          + Add Bookmark
        </button>
      </div>

      {/* Tags section */}
      {!tagsLoading && tags.length > 0 && (
        <div className="tags-section">
          <div className="tags-header">
            <h3>
              {filterMode === 'include' ? 'Filter by Tags' : 'Exclude Tags'} ({tags.length})
            </h3>
            <div className="tags-controls">
              <label className="filter-mode-toggle">
                <input
                  type="checkbox"
                  checked={filterMode === 'exclude'}
                  onChange={toggleFilterMode}
                />
                <span className="toggle-text">
                  {filterMode === 'include' ? 'Include Mode' : 'Exclude Mode'}
                </span>
              </label>
              {((filterMode === 'include' && selectedTags.length > 0) || 
                (filterMode === 'exclude' && selectedTags.length < tags.length)) && (
                <button 
                  className="clear-filters-button"
                  onClick={clearTagFilters}
                  title={filterMode === 'include' ? 'Clear all tag filters' : 'Reset to exclude none'}
                >
                  {filterMode === 'include' ? `Clear Filters (${selectedTags.length})` : 'Reset'}
                </button>
              )}
            </div>
          </div>
          <div className="all-tags-container">
            {tags
              .map(tagString => {
                // Parse tag and count from "tag,count" format
                const [tagName, countStr] = tagString.split(',')
                const count = parseInt(countStr) || 0
                return { name: tagName, count }
              })
              .sort((a, b) => b.count - a.count) // Sort by count descending
              .map((tag, index) => {
                const isSelected = selectedTags.includes(tag.name)
                // In include mode: active when selected
                // In exclude mode: active when selected (meaning included, not excluded)
                const isActive = isSelected
                return (
                  <button 
                    key={index} 
                    className={`tag-filter ${isActive ? 'tag-filter-active' : ''}`}
                    onClick={() => toggleTagFilter(tag.name)}
                    title={
                      filterMode === 'include'
                        ? `${isSelected ? 'Remove' : 'Add'} ${tag.name} filter (${tag.count} bookmark${tag.count !== 1 ? 's' : ''})`
                        : `${isSelected ? 'Include' : 'Exclude'} ${tag.name} (${tag.count} bookmark${tag.count !== 1 ? 's' : ''})`
                    }
                  >
                    {tag.name} <span className="tag-count">{tag.count}</span>
                  </button>
                )
              })}
          </div>
        </div>
      )}

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
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingBookmark ? 'Edit Bookmark' : 'Add New Bookmark'}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <form onSubmit={createBookmark} className="bookmark-form">
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
                  <input
                    type="text"
                    id="tags"
                    name="tags"
                    value={formData.tags}
                    onChange={handleInputChange}
                    placeholder="work, reference, tutorial (comma separated)"
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
                <small>Separate multiple tags with commas, or use AI to generate them</small>
              </div>

              <div className="modal-actions">
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
                >
                  {saving 
                    ? (editingBookmark ? 'Updating...' : 'Saving...') 
                    : (editingBookmark ? 'Update Bookmark' : 'Save Bookmark')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Bookmarks
