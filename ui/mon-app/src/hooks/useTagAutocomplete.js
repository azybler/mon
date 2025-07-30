import { useState, useRef, useEffect } from 'react';

/**
 * Custom hook for tag autocomplete functionality
 * Supports both new tag-chip mode and legacy hash-based autocomplete mode
 *
 * New API (tag-chip mode):
 * @param {Array} availableTags - Array of available tags in "tagname,count" format
 * @param {Array} selectedTags - Array of currently selected tag strings
 * @param {Function} onTagsChange - Callback when selected tags change
 * @param {Object} inputRef - Ref to the input element
 *
 * Legacy API (hash-based mode):
 * @param {Array} tags - Array of tags in "tagname,count" format
 * @param {Function} onValueChange - Callback when input value changes
 * @param {Object} inputRef - Ref to the input element
 *
 * @returns {Object} Hook state and handlers
 */
const useTagAutocomplete = (param1 = [], param2 = [], param3, param4) => {
  // Detect usage mode based on parameters
  const isLegacyMode = typeof param2 === 'function' || param2 === undefined;
  
  let availableTags, selectedTags, onTagsChange, inputRef, onValueChange;
  
  if (isLegacyMode) {
    // Legacy mode: (tags, onValueChange, inputRef)
    availableTags = param1;
    selectedTags = [];
    onValueChange = param2;
    inputRef = param3;
  } else {
    // New mode: (availableTags, selectedTags, onTagsChange, inputRef)
    availableTags = param1;
    selectedTags = param2;
    onTagsChange = param3;
    inputRef = param4;
  }
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [filteredTags, setFilteredTags] = useState([]);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [hashPosition, setHashPosition] = useState(-1);
  const dropdownRef = useRef(null);

  // Extract unique tag names from available tags array (tags come as "tagname,count" format)
  const getAvailableTagNames = () => {
    return availableTags.map(tagString => tagString.split(',')[0]).filter(Boolean);
  };

  // Filter available tags based on input and exclude already selected tags
  const updateFilteredTags = (searchTerm) => {
    if (!searchTerm.trim()) {
      setFilteredTags([]);
      setShowDropdown(false);
      return;
    }

    const availableTagNames = getAvailableTagNames();
    const filtered = availableTagNames.filter(tag =>
      tag.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !selectedTags.includes(tag)
    );
    
    setFilteredTags(filtered);
    setShowDropdown(filtered.length > 0);
    setSelectedIndex(-1);
  };

  // Handle input changes for new mode
  const handleInputChange = (e) => {
    const value = e.target.value;
    
    if (isLegacyMode) {
      // Legacy hash-based mode
      handleLegacyInputChange(e);
    } else {
      // New tag-chip mode
      setInputValue(value);
      updateFilteredTags(value);
    }
  };

  // Legacy input change handler (hash-based autocomplete)
  const handleLegacyInputChange = (e) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    // Call the parent's onChange handler
    if (onValueChange) {
      onValueChange(value);
    }
    
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
      const tagNames = getAvailableTagNames();
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

  // Add a new tag
  const addTag = (tagName) => {
    const trimmedTag = tagName.trim();
    if (trimmedTag && !selectedTags.includes(trimmedTag)) {
      const newTags = [...selectedTags, trimmedTag];
      onTagsChange(newTags);
      setInputValue('');
      setShowDropdown(false);
      setSelectedIndex(-1);
      
      // Focus back to input
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
  };

  // Remove a tag
  const removeTag = (indexToRemove) => {
    const newTags = selectedTags.filter((_, index) => index !== indexToRemove);
    onTagsChange(newTags);
  };

  // Start editing a tag
  const startEditingTag = (index) => {
    setEditingIndex(index);
    setInputValue(selectedTags[index]);
    setShowDropdown(false);
    
    // Focus input and select all text
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 0);
  };

  // Finish editing a tag
  const finishEditingTag = (newValue) => {
    if (editingIndex === -1) return;
    
    const trimmedValue = newValue.trim();
    if (trimmedValue && !selectedTags.includes(trimmedValue)) {
      const newTags = [...selectedTags];
      newTags[editingIndex] = trimmedValue;
      onTagsChange(newTags);
    } else if (!trimmedValue) {
      // Remove tag if empty
      removeTag(editingIndex);
    }
    
    setEditingIndex(-1);
    setInputValue('');
    setShowDropdown(false);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingIndex(-1);
    setInputValue('');
    setShowDropdown(false);
  };

  // Handle keyboard navigation and actions
  const handleKeyDown = (e) => {
    if (isLegacyMode) {
      handleLegacyKeyDown(e);
    } else {
      handleNewKeyDown(e);
    }
  };

  // New mode keyboard handler
  const handleNewKeyDown = (e) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (editingIndex !== -1) {
          // Finish editing current tag
          finishEditingTag(inputValue);
        } else if (showDropdown && selectedIndex >= 0 && selectedIndex < filteredTags.length) {
          // Select from dropdown
          addTag(filteredTags[selectedIndex]);
        } else if (inputValue.trim()) {
          // Add new tag
          addTag(inputValue);
        }
        break;
        
      case 'Escape':
        if (editingIndex !== -1) {
          cancelEditing();
        } else {
          setShowDropdown(false);
          setSelectedIndex(-1);
        }
        break;
        
      case 'Backspace':
        if (!inputValue && selectedTags.length > 0 && editingIndex === -1) {
          // Start editing the last tag
          startEditingTag(selectedTags.length - 1);
        }
        break;
        
      case 'ArrowDown':
        if (showDropdown) {
          e.preventDefault();
          setSelectedIndex(prev =>
            prev < filteredTags.length - 1 ? prev + 1 : 0
          );
        }
        break;
        
      case 'ArrowUp':
        if (showDropdown) {
          e.preventDefault();
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : filteredTags.length - 1
          );
        }
        break;
    }
  };

  // Legacy mode keyboard handler
  const handleLegacyKeyDown = (e) => {
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
          insertLegacyTag(filteredTags[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Insert selected tag into input (legacy mode)
  const insertLegacyTag = (tag) => {
    if (hashPosition === -1 || !inputRef.current) return;

    const currentValue = inputRef.current.value;
    const beforeHash = currentValue.substring(0, hashPosition);
    const afterCursor = currentValue.substring(inputRef.current.selectionStart);
    
    const newValue = beforeHash + '#' + tag + ' ' + afterCursor;
    if (onValueChange) {
      onValueChange(newValue);
    }
    
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

  // Handle tag click from dropdown
  const handleTagClick = (tag) => {
    if (isLegacyMode) {
      insertLegacyTag(tag);
    } else {
      addTag(tag);
    }
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

  // Update filtered tags when available tags change
  useEffect(() => {
    if (inputValue) {
      updateFilteredTags(inputValue);
    }
  }, [availableTags, selectedTags, inputValue]);

  return {
    // State
    inputValue,
    showDropdown,
    selectedIndex,
    filteredTags,
    editingIndex,
    dropdownRef,
    
    // Handlers
    handleInputChange,
    handleKeyDown,
    handleTagClick,
    handleTagMouseEnter,
    addTag,
    removeTag,
    startEditingTag,
    finishEditingTag,
    cancelEditing,
    
    // Utilities
    getAvailableTagNames
  };
};

export default useTagAutocomplete;