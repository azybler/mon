import React from 'react'
import './TagsFilter.css'

const TagsFilter = ({
  tags,
  selectedTags,
  filterMode,
  tagsLoading,
  itemType = 'item', // 'note', 'bookmark', or generic 'item'
  onToggleTagFilter,
  onClearTagFilters,
  onToggleFilterMode
}) => {
  // Don't render if tags are loading or no tags exist
  if (tagsLoading || tags.length === 0) {
    return null
  }

  return (
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
              onChange={onToggleFilterMode}
            />
            <span className="toggle-text">
              {filterMode === 'include' ? 'Include Mode' : 'Exclude Mode'}
            </span>
          </label>
          {((filterMode === 'include' && selectedTags.length > 0) || 
            (filterMode === 'exclude' && selectedTags.length < tags.length)) && (
            <button 
              className="clear-filters-button"
              onClick={onClearTagFilters}
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
                onClick={() => onToggleTagFilter(tag.name)}
                title={
                  filterMode === 'include'
                    ? `${isSelected ? 'Remove' : 'Add'} ${tag.name} filter (${tag.count} ${itemType}${tag.count !== 1 ? 's' : ''})`
                    : `${isSelected ? 'Include' : 'Exclude'} ${tag.name} (${tag.count} ${itemType}${tag.count !== 1 ? 's' : ''})`
                }
              >
                {tag.name} <span className="tag-count">{tag.count}</span>
              </button>
            )
          })}
      </div>
    </div>
  )
}

export default TagsFilter
