import React from 'react';
import './SearchInput.css';

const SearchInput = ({ 
  searchTerm, 
  onSearchChange, 
  onClearSearch, 
  placeholder = "Search..." 
}) => {
  return (
    <div className="search-section">
      <div className="search-container">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
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
      </div>
    </div>
  );
};

export default SearchInput;
