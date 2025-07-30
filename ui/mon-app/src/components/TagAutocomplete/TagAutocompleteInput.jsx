import React, { useRef } from 'react';
import useTagAutocomplete from '../../hooks/useTagAutocomplete';
import './TagAutocomplete.css';

/**
 * Reusable TagAutocompleteInput component
 * Provides tag autocomplete functionality for any input field
 */
const TagAutocompleteInput = ({
  value,
  onChange,
  tags = [],
  placeholder = "Enter text...",
  className = "",
  disabled = false,
  ...inputProps
}) => {
  const inputRef = useRef(null);
  
  const {
    showDropdown,
    selectedIndex,
    filteredTags,
    dropdownRef,
    handleInputChange,
    handleKeyDown,
    handleTagClick,
    handleTagMouseEnter
  } = useTagAutocomplete(tags, onChange, inputRef);

  return (
    <div className="tag-autocomplete-container">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`tag-autocomplete-input ${className}`}
        disabled={disabled}
        {...inputProps}
      />
      
      {showDropdown && (
        <div ref={dropdownRef} className="tag-autocomplete-dropdown">
          {filteredTags.map((tag, index) => (
            <div
              key={tag}
              className={`tag-autocomplete-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleTagClick(tag)}
              onMouseEnter={() => handleTagMouseEnter(index)}
            >
              #{tag}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TagAutocompleteInput;