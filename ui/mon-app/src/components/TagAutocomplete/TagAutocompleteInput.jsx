import React, { useRef } from 'react';
import useTagAutocomplete from '../../hooks/useTagAutocomplete';
import './TagAutocomplete.css';

/**
 * Reusable TagAutocompleteInput component
 * Provides tag input functionality with visual tag chips
 */
const TagAutocompleteInput = ({
  selectedTags = [],
  onTagsChange,
  availableTags = [],
  placeholder = "Add tags...",
  className = "",
  disabled = false,
  ...inputProps
}) => {
  const inputRef = useRef(null);
  
  const {
    inputValue,
    showDropdown,
    selectedIndex,
    filteredTags,
    editingIndex,
    dropdownRef,
    handleInputChange,
    handleKeyDown,
    handleTagClick,
    handleTagMouseEnter,
    removeTag,
    startEditingTag
  } = useTagAutocomplete(availableTags, selectedTags, onTagsChange, inputRef);

  return (
    <div className="tag-autocomplete-container">
      <div className="tag-input-wrapper">
        {/* Render selected tags as chips */}
        {selectedTags.map((tag, index) => (
          <div
            key={`${tag}-${index}`}
            className={`tag-chip ${editingIndex === index ? 'editing' : ''}`}
          >
            <span
              className="tag-text"
              onClick={() => !disabled && startEditingTag(index)}
            >
              {tag}
            </span>
            <button
              type="button"
              className="tag-remove"
              onClick={() => !disabled && removeTag(index)}
              disabled={disabled}
              aria-label={`Remove ${tag} tag`}
            >
              ×
            </button>
          </div>
        ))}
        
        {/* Input field */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? placeholder : ""}
          className={`tag-autocomplete-input ${className}`}
          disabled={disabled}
          {...inputProps}
        />
      </div>
      
      {/* Autocomplete dropdown */}
      {showDropdown && (
        <div ref={dropdownRef} className="tag-autocomplete-dropdown">
          {filteredTags.map((tag, index) => (
            <div
              key={tag}
              className={`tag-autocomplete-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleTagClick(tag)}
              onMouseEnter={() => handleTagMouseEnter(index)}
            >
              {tag}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TagAutocompleteInput;