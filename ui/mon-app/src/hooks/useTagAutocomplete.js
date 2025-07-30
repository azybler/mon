import { useState, useRef, useEffect } from 'react';

/**
 * Custom hook for tag autocomplete functionality
 * @param {Array} tags - Array of tags in "tagname,count" format
 * @param {Function} onValueChange - Callback when input value changes
 * @param {Object} inputRef - Ref to the input element
 * @returns {Object} Hook state and handlers
 */
const useTagAutocomplete = (tags = [], onValueChange, inputRef) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [filteredTags, setFilteredTags] = useState([]);
  const [hashPosition, setHashPosition] = useState(-1);
  const dropdownRef = useRef(null);

  // Extract unique tag names from tags array (tags come as "tagname,count" format)
  const getTagNames = () => {
    return tags.map(tagString => tagString.split(',')[0]).filter(Boolean);
  };

  // Handle input changes and detect # character
  const handleInputChange = (e) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    // Call the parent's onChange handler
    onValueChange(value);
    
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
    if (hashPosition === -1 || !inputRef.current) return;

    const currentValue = inputRef.current.value;
    const beforeHash = currentValue.substring(0, hashPosition);
    const afterCursor = currentValue.substring(inputRef.current.selectionStart);
    
    const newValue = beforeHash + '#' + tag + ' ' + afterCursor;
    onValueChange(newValue);
    
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

  // Handle mouse enter on tag items
  const handleTagMouseEnter = (index) => {
    setSelectedIndex(index);
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
  }, [inputRef]);

  // Reset dropdown state when tags change
  useEffect(() => {
    if (showDropdown) {
      // Re-filter tags if dropdown is open and tags have changed
      const tagNames = getTagNames();
      if (hashPosition !== -1 && inputRef.current) {
        const currentValue = inputRef.current.value;
        const cursorPosition = inputRef.current.selectionStart;
        const searchStart = hashPosition + 1;
        const searchEnd = cursorPosition;
        const searchTerm = currentValue.substring(searchStart, searchEnd);
        
        const filtered = tagNames.filter(tag => 
          tag.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        setFilteredTags(filtered);
        if (filtered.length === 0) {
          setShowDropdown(false);
        }
      }
    }
  }, [tags, hashPosition, showDropdown, inputRef]);

  return {
    // State
    showDropdown,
    selectedIndex,
    filteredTags,
    hashPosition,
    dropdownRef,
    
    // Handlers
    handleInputChange,
    handleKeyDown,
    handleTagClick,
    handleTagMouseEnter,
    insertTag,
    
    // Utilities
    getTagNames
  };
};

export default useTagAutocomplete;