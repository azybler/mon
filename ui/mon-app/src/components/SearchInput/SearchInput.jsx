import React, { useState, useRef, useEffect } from 'react';
import './SearchInput.css';

const SearchInput = ({ 
  searchTerm, 
  onSearchChange, 
  onClearSearch, 
  placeholder = "Search...",
  tags = []
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [filteredTags, setFilteredTags] = useState([]);
  const [hashPosition, setHashPosition] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Extract unique tag names from tags array (tags come as "tagname,count" format)
  const getTagNames = () => {
    return tags.map(tagString => tagString.split(',')[0]).filter(Boolean);
  };

  // Handle input changes and detect # character
  const handleInputChange = (e) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    onSearchChange(value);
    
    // Find the last # before cursor position
    let lastHashIndex = -1;
    for (let i = cursorPosition - 1; i >= 0; i--) {
      if (value[i] === '#') {
        lastHashIndex = i;
        break;
      }
      if (value[i] === ' ') {
        break;
      }
    }
    
    if (lastHashIndex !== -1) {
      const searchStart = lastHashIndex + 1;
      const searchEnd = cursorPosition;
      const searchTerm = value.substring(searchStart, searchEnd);
      
      // Filter tags based on search term
      const tagNames = getTagNames();
      const filtered = tagNames.filter(tag => 
        tag.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      setFilteredTags(filtered);
      setHashPosition(lastHashIndex);
      setShowDropdown(filtered.length > 0);
      setSelectedIndex(-1);
    } else {
      setShowDropdown(false);
      setHashPosition(-1);
      setFilteredTags([]);
      setSelectedIndex(-1);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredTags.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredTags.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredTags.length) {
          insertTag(filteredTags[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Insert selected tag into input
  const insertTag = (tag) => {
    if (hashPosition === -1) return;

    const currentValue = searchTerm;
    const beforeHash = currentValue.substring(0, hashPosition);
    const afterCursor = currentValue.substring(inputRef.current.selectionStart);
    
    const newValue = beforeHash + '#' + tag + ' ' + afterCursor;
    onSearchChange(newValue);
    
    setShowDropdown(false);
    setSelectedIndex(-1);
    setHashPosition(-1);
    
    // Set cursor position after the inserted tag
    setTimeout(() => {
      const newCursorPos = beforeHash.length + tag.length + 2; // +2 for # and space
      inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      inputRef.current.focus();
    }, 0);
  };

  // Handle tag click
  const handleTagClick = (tag) => {
    insertTag(tag);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          inputRef.current && !inputRef.current.contains(event.target)) {
        setShowDropdown(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
                onMouseEnter={() => setSelectedIndex(index)}
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
