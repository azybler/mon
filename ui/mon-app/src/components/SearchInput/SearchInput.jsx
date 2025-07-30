import React, { useRef } from 'react';
import useTagAutocomplete from '../../hooks/useTagAutocomplete';
import './SearchInput.css';

const SearchInput = ({
  searchTerm,
  onSearchChange,
  onClearSearch,
  placeholder = "Search...",
  tags = []
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
  } = useTagAutocomplete(tags, onSearchChange, inputRef);

  return (
    <div className="search-section">
      <div className="search-container">
        <input
          ref={inputRef}
          id="searchInput"
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="search-input"
        />
        {searchTerm && (
          <button
            onClick={onClearSearch}
            className="clear-search-button"
            title="Clear search"
          >
            ×
          </button>
        )}
        
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
    </div>
  );
};

export default SearchInput;
