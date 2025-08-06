import { useState, useEffect, useCallback } from 'react'
import TagsFilter from 'components/TagsFilter/TagsFilter'
import SearchInput from 'components/SearchInput/SearchInput'
import Modal from 'components/Modal/Modal'

const YoutubeWatchlist = () => {
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

  const [videos, setVideos] = useState([])
  const [tags, setTags] = useState([])
  const [selectedTags, setSelectedTags] = useState([])
  const [filterMode, setFilterMode] = useState('include') // 'include' or 'exclude'
  const [searchKeywords, setSearchKeywords] = useState('')
  const [loading, setLoading] = useState(true)
  const [tagsLoading, setTagsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingVideo, setEditingVideo] = useState(null)
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
  const debouncedSearchKeywords = useDebounce(searchKeywords, 300)

  // Extract YouTube video ID from URL
  const extractVideoId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) {
        return match[1]
      }
    }
    return null
  }

  // Initial data fetch - only runs once
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Fetch both tags and videos in parallel
        const [tagsResponse, videosResponse] = await Promise.all([
          fetch('http://localhost:8081/api/youtube/tag/list'),
          fetch('http://localhost:8081/api/youtube/list')
        ])
        
        const [tagsData, videosData] = await Promise.all([
          tagsResponse.json(),
          videosResponse.json()
        ])
        
        if (tagsData.success) {
          setTags(tagsData.data || [])
        } else {
          console.error('Failed to fetch tags:', tagsData.message)
        }
        
        if (videosData.success) {
          setVideos(videosData.data || [])
          setError(null)
        } else {
          setError(videosData.message || 'Failed to fetch YouTube videos')
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

  const fetchVideos = useCallback(async () => {
    try {
      // Only show loading spinner for non-search operations to avoid focus loss
      if (!debouncedSearchKeywords.trim()) {
        setLoading(true)
      }
      
      // Build URL with different filtering approaches
      let url = 'http://localhost:8081/api/youtube/list'
      const params = new URLSearchParams()
      
      if (filterMode === 'include' && selectedTags.length > 0) {
        // Include mode: send selected tags to show videos with any of these tags
        params.append('tags', selectedTags.join(','))
      } else if (filterMode === 'exclude' && tags.length > 0) {
        // Exclude mode: send unselected tags to exclude videos with these tags
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
        setVideos(data.data || [])
        setError(null)
      } else {
        setError(data.message || 'Failed to fetch YouTube videos')
      }
    } catch (err) {
      setError('Error connecting to the server')
      console.error('Error fetching YouTube videos:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedTags, filterMode, tags, debouncedSearchKeywords])

  // Fetch videos when filters change (but only after initial load)
  useEffect(() => {
    if (isInitialized) {
      fetchVideos()
    }
  }, [debouncedSelectedTags, debouncedFilterMode, debouncedSearchKeywords, isInitialized, fetchVideos])

  const fetchTags = useCallback(async () => {
    try {
      setTagsLoading(true)
      const response = await fetch('http://localhost:8081/api/youtube/tag/list')
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

  const createVideo = async (e) => {
    e.preventDefault()
    
    if (!formData.title.trim() || !formData.url.trim()) {
      alert('Title and URL are required')
      return
    }

    // Validate YouTube URL
    const videoId = extractVideoId(formData.url)
    if (!videoId) {
      alert('Please provide a valid YouTube URL')
      return
    }

    try {
      setSaving(true)
      
      // Parse tags from comma-separated string
      const tags = formData.tags
        .split(',')
        .map(tag => tag.trim())
        .map(tag => tag.toLowerCase())
        .filter(tag => tag.length > 0)

      const url = editingVideo 
        ? `http://localhost:8081/api/youtube/edit/${editingVideo.id}`
        : 'http://localhost:8081/api/youtube/create'
      
      const method = editingVideo ? 'PUT' : 'POST'

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
        setEditingVideo(null)
        setShowModal(false)
        
        // Optimistically update the UI without refetching everything
        if (editingVideo) {
          // Update existing video in state
          setVideos(prev => prev.map(v => 
            v.id === editingVideo.id ? data.data : v
          ))
        } else {
          // Add new video to state
          setVideos(prev => [data.data, ...prev])
        }
        
        // Only refetch tags if we added/changed tags
        const newTags = formData.tags
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0)
        
        const oldTags = editingVideo?.tags || []
        const tagsChanged = JSON.stringify(newTags.sort()) !== JSON.stringify(oldTags.sort())
        
        if (tagsChanged) {
          fetchTags()
        }
      } else {
        alert(data.message || `Failed to ${editingVideo ? 'update' : 'create'} YouTube video`)
      }
    } catch (err) {
      alert(`Error ${editingVideo ? 'updating' : 'creating'} YouTube video: ` + err.message)
      console.error(`Error ${editingVideo ? 'updating' : 'creating'} YouTube video:`, err)
    } finally {
      setSaving(false)
    }
  }

  const editVideo = (video) => {
    setEditingVideo(video)
    setFormData({
      title: video.title,
      url: video.url,
      tags: video.tags ? video.tags.join(', ') : ''
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
          'X-Title': 'Mon YouTube Watchlist'
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
    setEditingVideo(null)
    setFormData({ title: '', url: '', tags: '' })
  }

  const openVideo = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const deleteVideo = async (video) => {
    if (!confirm(`Are you sure you want to delete "${video.title}"?`)) {
      return
    }

    try {
      const response = await fetch(`http://localhost:8081/api/youtube/delete/${video.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      
      if (data.success) {
        // Optimistically remove video from state
        setVideos(prev => prev.filter(v => v.id !== video.id))
        
        // Only refetch tags if the deleted video had tags
        if (video.tags && video.tags.length > 0) {
          fetchTags()
        }
      } else {
        alert(data.message || 'Failed to delete YouTube video')
      }
    } catch (err) {
      alert('Error deleting YouTube video: ' + err.message)
      console.error('Error deleting YouTube video:', err)
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
        <h2>YouTube Watchlist</h2>
        <p>Loading your YouTube videos...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="section-content">
        <h2>YouTube Watchlist</h2>
        <div className="error-message">
          <p>Error: {error}</p>
          <button onClick={fetchVideos} className="retry-button">
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
              {videos.length} Video{videos.length !== 1 ? 's' : ''} 
              <span className="filter-indicator"> (showing videos with {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''})</span>
            </>
          ) : filterMode === 'exclude' && selectedTags.length < tags.length ? (
            <>
              {videos.length} Video{videos.length !== 1 ? 's' : ''} 
              <span className="filter-indicator"> (excluding {tags.length - selectedTags.length} tag{tags.length - selectedTags.length !== 1 ? 's' : ''})</span>
            </>
          ) : (
            `${videos.length} Video${videos.length !== 1 ? 's' : ''}`
          )}
          {searchKeywords && (
            <span className="search-indicator"> (searching: "{searchKeywords}")</span>
          )}
        </div>
        <button 
          className="add-bookmark-button"
          onClick={() => setShowModal(true)}
        >
          + Add Video
        </button>
      </div>

      {/* Tags section */}
      <TagsFilter
        tags={tags}
        selectedTags={selectedTags}
        filterMode={filterMode}
        tagsLoading={tagsLoading}
        itemType="video"
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

      {videos.length === 0 ? (
        <div className="empty-state">
          <p>No YouTube videos found. Start adding some videos to see them here!</p>
          <button 
            className="add-first-bookmark-button"
            onClick={() => setShowModal(true)}
          >
            Add Your First Video
          </button>
        </div>
      ) : (
        <div className="bookmarks-grid">
          {videos.map((video) => (
            <div key={video.id} className="bookmark-card youtube-video-card">
              <div className="bookmark-header">
                <h4 className="bookmark-title" onClick={() => openVideo(video.url)}>{video.title}</h4>
                <div className="bookmark-actions">
                  <button 
                    className="bookmark-edit"
                    onClick={() => editVideo(video)}
                    title="Edit video"
                  >
                    ✏️
                  </button>
                  <button 
                    className="bookmark-delete"
                    onClick={() => deleteVideo(video)}
                    title="Delete video"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              {/* YouTube Embed */}
              <div className="youtube-embed-container">
                <iframe
                  src={`https://www.youtube.com/embed/${video.video_id}`}
                  title={video.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                ></iframe>
              </div>

              <div className="bookmark-url">
                <a 
                  href={video.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={(e) => e.preventDefault()}
                >
                  {video.url}
                </a>
              </div>

              {video.tags && video.tags.length > 0 && (
                <div className="bookmark-tags">
                  {video.tags.map((tag, index) => (
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
        title={editingVideo ? 'Edit YouTube Video' : 'Add New YouTube Video'}
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
              form="youtube-form"
            >
              {saving 
                ? (editingVideo ? 'Updating...' : 'Saving...') 
                : (editingVideo ? 'Update Video' : 'Save Video')
              }
            </button>
          </>
        }
      >
        <form id="youtube-form" onSubmit={createVideo} className="bookmark-form">
          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Enter video title"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="url">YouTube URL *</label>
            <input
              type="url"
              id="url"
              name="url"
              value={formData.url}
              onChange={handleInputChange}
              placeholder="https://www.youtube.com/watch?v=..."
              required
            />
            <small>Please provide a valid YouTube video URL</small>
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
                placeholder="tutorial, programming, music (comma separated)"
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
        </form>
      </Modal>
    </div>
  )
}

export default YoutubeWatchlist
