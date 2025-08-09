package handlers

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/dgraph-io/badger/v4"
	jsoniter "github.com/json-iterator/go"
)

var json = jsoniter.ConfigCompatibleWithStandardLibrary

// Pre-compiled common error responses to reduce allocations
var (
	invalidJSONResponse = BookmarkResponse{
		Success: false,
		Message: "Invalid JSON format",
	}
	titleRequiredResponse = BookmarkResponse{
		Success: false,
		Message: "Title is required",
	}
	urlRequiredResponse = BookmarkResponse{
		Success: false,
		Message: "URL is required",
	}
	methodNotAllowedMsg = "Method not allowed"
)

// Helper functions for JSON encoding/decoding with better performance
func writeJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	return json.NewEncoder(w).Encode(data)
}

func readJSONRequest(r *http.Request, dest interface{}) error {
	return json.NewDecoder(r.Body).Decode(dest)
}

type Bookmark struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	URL       string    `json:"url"`
	Tags      []string  `json:"tags"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type NewBookmarkRequest struct {
	Title string   `json:"title"`
	URL   string   `json:"url"`
	Tags  []string `json:"tags"`
}

type EditBookmarkRequest struct {
	Title string   `json:"title"`
	URL   string   `json:"url"`
	Tags  []string `json:"tags"`
}

type BookmarkResponse struct {
	Success bool     `json:"success"`
	Message string   `json:"message"`
	Data    Bookmark `json:"data,omitempty"`
}

type BookmarksListResponse struct {
	Success bool       `json:"success"`
	Message string     `json:"message"`
	Data    []Bookmark `json:"data,omitempty"`
	Count   int        `json:"count"`
}

type DeleteBookmarkResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type TagsResponse struct {
	Success bool     `json:"success"`
	Message string   `json:"message"`
	Data    []string `json:"data,omitempty"`
	Count   int      `json:"count"`
}

type DuplicateCheckResponse struct {
	Success       bool       `json:"success"`
	Message       string     `json:"message"`
	HasDuplicates bool       `json:"has_duplicates"`
	Duplicates    []Bookmark `json:"duplicates,omitempty"`
}

type BookmarkHandler struct {
	db *badger.DB
}

// evaluateTagExpression evaluates a tag expression against a set of bookmark tags
func evaluateTagExpression(bookmarkTags []string, expression string) bool {
	if expression == "" {
		return true // Empty expression matches all
	}

	// Create a case-insensitive set of bookmark tags
	tagSet := make(map[string]bool)
	for _, tag := range bookmarkTags {
		tagSet[strings.ToLower(tag)] = true
	}

	// Normalize the expression to lowercase
	expr := strings.ToLower(expression)

	// Replace tag names with boolean values
	// Find all words that could be tag names (alphanumeric + underscore + hyphen)
	wordRegex := regexp.MustCompile(`\b[a-zA-Z0-9_-]+\b`)
	expr = wordRegex.ReplaceAllStringFunc(expr, func(word string) string {
		lowerWord := strings.ToLower(word)
		// Skip logical operators
		if lowerWord == "and" || lowerWord == "or" || lowerWord == "not" {
			return word
		}
		// Replace tag names with boolean values
		if tagSet[lowerWord] {
			return "true"
		}
		return "false"
	})

	// Replace logical operators with Go equivalents
	expr = strings.ReplaceAll(expr, " and ", " && ")
	expr = strings.ReplaceAll(expr, " or ", " || ")
	expr = strings.ReplaceAll(expr, " not ", " !")
	expr = strings.ReplaceAll(expr, "not ", "!")

	// Clean up extra spaces
	expr = regexp.MustCompile(`\s+`).ReplaceAllString(expr, " ")
	expr = strings.TrimSpace(expr)

	// Simple expression evaluator for boolean logic
	return evaluateSimpleBooleanExpression(expr)
}

// evaluateSimpleBooleanExpression evaluates a simple boolean expression
func evaluateSimpleBooleanExpression(expr string) bool {
	// Remove all whitespace
	expr = strings.ReplaceAll(expr, " ", "")

	// Handle parentheses recursively
	for strings.Contains(expr, "(") {
		// Find the innermost parentheses
		start := -1
		for i, char := range expr {
			if char == '(' {
				start = i
			} else if char == ')' && start != -1 {
				// Evaluate the expression inside parentheses
				inner := expr[start+1 : i]
				result := evaluateSimpleBooleanExpression(inner)
				resultStr := "false"
				if result {
					resultStr = "true"
				}
				// Replace the parentheses expression with the result
				expr = expr[:start] + resultStr + expr[i+1:]
				break
			}
		}
	}

	// Now evaluate the expression without parentheses
	return evaluateWithoutParentheses(expr)
}

// evaluateWithoutParentheses evaluates a boolean expression without parentheses
func evaluateWithoutParentheses(expr string) bool {
	// Handle NOT operators first
	for strings.Contains(expr, "!") {
		notRegex := regexp.MustCompile(`!(true|false)`)
		expr = notRegex.ReplaceAllStringFunc(expr, func(match string) string {
			if strings.HasSuffix(match, "true") {
				return "false"
			}
			return "true"
		})
	}

	// Handle AND operators (higher precedence than OR)
	for strings.Contains(expr, "&&") {
		andRegex := regexp.MustCompile(`(true|false)&&(true|false)`)
		expr = andRegex.ReplaceAllStringFunc(expr, func(match string) string {
			parts := strings.Split(match, "&&")
			left := parts[0] == "true"
			right := parts[1] == "true"
			if left && right {
				return "true"
			}
			return "false"
		})
	}

	// Handle OR operators
	for strings.Contains(expr, "||") {
		orRegex := regexp.MustCompile(`(true|false)\|\|(true|false)`)
		expr = orRegex.ReplaceAllStringFunc(expr, func(match string) string {
			parts := strings.Split(match, "||")
			left := parts[0] == "true"
			right := parts[1] == "true"
			if left || right {
				return "true"
			}
			return "false"
		})
	}

	// The final result should be either "true" or "false"
	return expr == "true"
}

func NewBookmarkHandler(db *badger.DB) *BookmarkHandler {
	handler := &BookmarkHandler{db: db}

	// Initialize tag counts if they don't exist (for migration)
	handler.initializeTagCounts()

	return handler
}

// initializeTagCounts creates the tag_counts key if it doesn't exist
// This is useful for migrating from the old all_tags system
func (h *BookmarkHandler) initializeTagCounts() error {
	return h.db.View(func(txn *badger.Txn) error {
		// Check if tag_counts already exists
		_, err := txn.Get([]byte("tag_counts"))
		if err == badger.ErrKeyNotFound {
			// tag_counts doesn't exist, rebuild it
			return h.rebuildTagCounts()
		}
		return err
	})
}

// updateTagCounts maintains tag counts for efficient retrieval
func (h *BookmarkHandler) updateTagCounts(oldTags, newTags []string) error {
	return h.db.Update(func(txn *badger.Txn) error {
		// Get existing tag counts
		tagCounts := make(map[string]int)

		item, err := txn.Get([]byte("tag_counts"))
		if err != nil && err != badger.ErrKeyNotFound {
			return err
		}

		if err != badger.ErrKeyNotFound {
			err = item.Value(func(val []byte) error {
				return json.Unmarshal(val, &tagCounts)
			})
			if err != nil {
				return err
			}
		}

		// Decrease counts for old tags
		for _, tag := range oldTags {
			if tag != "" {
				if count, exists := tagCounts[tag]; exists {
					if count <= 1 {
						delete(tagCounts, tag)
					} else {
						tagCounts[tag] = count - 1
					}
				}
			}
		}

		// Increase counts for new tags
		for _, tag := range newTags {
			if tag != "" {
				tagCounts[tag]++
			}
		}

		// Serialize and save
		countsJSON, err := json.Marshal(tagCounts)
		if err != nil {
			return err
		}

		return txn.Set([]byte("tag_counts"), countsJSON)
	})
}

// rebuildTagCounts rebuilds the tag_counts key by scanning all existing bookmarks
func (h *BookmarkHandler) rebuildTagCounts() error {
	return h.db.Update(func(txn *badger.Txn) error {
		// Get all tags and their counts from existing bookmarks
		tagCounts := make(map[string]int)

		opts := badger.DefaultIteratorOptions
		opts.PrefetchSize = 50 // Increase prefetch size for better performance
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			key := item.Key()

			// Only process keys that start with "bookmark_" and are bookmark IDs (not tag counts)
			keyStr := string(key)
			if len(keyStr) >= 9 && strings.HasPrefix(keyStr, "bookmark_") && keyStr != "bookmark_tag_counts" {
				err := item.Value(func(val []byte) error {
					var bookmark Bookmark
					if err := json.Unmarshal(val, &bookmark); err != nil {
						// Skip invalid JSON entries
						return nil
					}
					// Count all tags from this bookmark
					for _, tag := range bookmark.Tags {
						if tag != "" {
							tagCounts[tag]++
						}
					}
					return nil
				})
				if err != nil {
					return err
				}
			}
		}

		// Serialize and save
		countsJSON, err := json.Marshal(tagCounts)
		if err != nil {
			return err
		}

		return txn.Set([]byte("tag_counts"), countsJSON)
	})
}

func (h *BookmarkHandler) NewBookmark(w http.ResponseWriter, r *http.Request) {
	// Only allow POST requests
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Parse JSON request body using helper function
	var req NewBookmarkRequest
	if err := readJSONRequest(r, &req); err != nil {
		response := BookmarkResponse{
			Success: false,
			Message: "Invalid JSON format",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Validate required fields
	if req.Title == "" {
		response := BookmarkResponse{
			Success: false,
			Message: "Title is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	if req.URL == "" {
		response := BookmarkResponse{
			Success: false,
			Message: "URL is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Initialize tags if nil
	if req.Tags == nil {
		req.Tags = []string{}
	}
	// Normalize tags via aliases (bookmark)
	aliasHandler := NewTagAliasHandler(h.db)
	_ = h.db.View(func(txn *badger.Txn) error {
		aliases, err := aliasHandler.getAliasMap(txn, "bookmark")
		if err == nil {
			req.Tags = normalizeTags(req.Tags, aliases)
		}
		return nil
	})

	// Generate unique ID (simple timestamp + title hash for now)
	now := time.Now()
	bookmarkID := fmt.Sprintf("bookmark_%d", now.UnixNano())

	// Create bookmark object
	bookmark := Bookmark{
		ID:        bookmarkID,
		Title:     req.Title,
		URL:       req.URL,
		Tags:      req.Tags,
		CreatedAt: now,
		UpdatedAt: now,
	}

	// Serialize bookmark to JSON for storage
	bookmarkJSON, err := json.Marshal(bookmark)
	if err != nil {
		response := BookmarkResponse{
			Success: false,
			Message: "Error serializing bookmark data",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Store in BadgerDB
	err = h.db.Update(func(txn *badger.Txn) error {
		return txn.Set([]byte(bookmarkID), bookmarkJSON)
	})
	if err != nil {
		response := BookmarkResponse{
			Success: false,
			Message: "Error saving bookmark to database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Update the tag counts
	if err := h.updateTagCounts([]string{}, bookmark.Tags); err != nil {
		// Log error but don't fail the request since bookmark was saved
		fmt.Printf("Warning: Failed to update tag counts: %v\n", err)
	}

	// Return success response
	response := BookmarkResponse{
		Success: true,
		Message: "Bookmark created successfully",
		Data:    bookmark,
	}

	writeJSONResponse(w, http.StatusCreated, response)
}

func (h *BookmarkHandler) GetBookmarks(w http.ResponseWriter, r *http.Request) {
	// Only allow GET requests
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Parse query parameters for tag filtering and keyword search
	queryTags := r.URL.Query().Get("tags")
	queryExcludeTags := r.URL.Query().Get("exclude_tags")
	advancedExpression := strings.TrimSpace(r.URL.Query().Get("advanced"))
	keywords := strings.TrimSpace(r.URL.Query().Get("keywords"))
	var filterTags []string
	var excludeTags []string

	// Load alias map once
	aliasHandler := NewTagAliasHandler(h.db)
	var aliasMap map[string]string
	_ = h.db.View(func(txn *badger.Txn) error {
		m, err := aliasHandler.getAliasMap(txn, "bookmark")
		if err == nil {
			aliasMap = m
		}
		return nil
	})

	if queryTags != "" {
		// Split tags by comma and trim whitespace
		for _, tag := range strings.Split(queryTags, ",") {
			trimmed := strings.TrimSpace(tag)
			if trimmed != "" {
				filterTags = append(filterTags, trimmed)
			}
		}
	}

	if queryExcludeTags != "" {
		// Split exclude tags by comma and trim whitespace
		for _, tag := range strings.Split(queryExcludeTags, ",") {
			trimmed := strings.TrimSpace(tag)
			if trimmed != "" {
				excludeTags = append(excludeTags, trimmed)
			}
		}
	}

	// Normalize filters and advanced expression using aliases
	if len(filterTags) > 0 && aliasMap != nil {
		filterTags = normalizeTags(filterTags, aliasMap)
	}
	if len(excludeTags) > 0 && aliasMap != nil {
		excludeTags = normalizeTags(excludeTags, aliasMap)
	}
	if advancedExpression != "" && aliasMap != nil {
		advancedExpression = normalizeExpression(advancedExpression, aliasMap)
	}

	var bookmarks []Bookmark

	// Pre-allocate slice with estimated capacity to reduce allocations
	bookmarks = make([]Bookmark, 0, 100)

	// Read all bookmarks from BadgerDB
	err := h.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchSize = 50 // Increase prefetch size for better performance
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			key := item.Key()

			// Only process keys that start with "bookmark_"
			if len(key) >= 9 && string(key[:9]) == "bookmark_" {
				err := item.Value(func(val []byte) error {
					var bookmark Bookmark
					if err := json.Unmarshal(val, &bookmark); err != nil {
						// Skip invalid JSON entries
						return nil
					}

					// Normalize stored tags on the fly for UI/search consistency
					if aliasMap != nil && len(bookmark.Tags) > 0 {
						bookmark.Tags = normalizeTags(bookmark.Tags, aliasMap)
					}

					// Apply tag filtering based on mode
					if advancedExpression != "" {
						// Use advanced expression evaluation
						if !evaluateTagExpression(bookmark.Tags, advancedExpression) {
							return nil
						}
					} else if len(filterTags) > 0 {
						// Apply include tag filtering if filter tags are specified
						hasAnyTag := false
						for _, filterTag := range filterTags {
							for _, bookmarkTag := range bookmark.Tags {
								if bookmarkTag == filterTag {
									hasAnyTag = true
									break
								}
							}
							if hasAnyTag {
								break
							}
						}
						// Only include bookmark if it has any of the required tags
						if !hasAnyTag {
							return nil
						}
					} else if len(excludeTags) > 0 {
						// Apply exclude tag filtering if exclude tags are specified
						hasExcludedTag := false
						for _, excludeTag := range excludeTags {
							for _, bookmarkTag := range bookmark.Tags {
								if bookmarkTag == excludeTag {
									hasExcludedTag = true
									break
								}
							}
							if hasExcludedTag {
								break
							}
						}
						// Exclude bookmark if it has any of the excluded tags
						if hasExcludedTag {
							return nil
						}
					}

					// Apply keyword search if keywords are specified
					if keywords != "" {
						// Split keywords into individual words and normalize
						keywordWords := strings.Fields(strings.ToLower(keywords))
						if len(keywordWords) > 0 {
							// Create searchable text by combining title, URL, and tags
							searchableText := strings.ToLower(bookmark.Title + " " + bookmark.URL + " " + strings.Join(bookmark.Tags, " "))

							// Separate include and exclude words
							var includeWords []string
							var excludeWords []string

							for _, word := range keywordWords {
								if strings.HasPrefix(word, "-") && len(word) > 1 {
									// Remove the "-" prefix and add to exclude list
									excludeWords = append(excludeWords, word[1:])
								} else {
									// Add to include list
									includeWords = append(includeWords, word)
								}
							}

							// Check if any exclude words are present
							for _, excludeWord := range excludeWords {
								if strings.Contains(searchableText, excludeWord) {
									// Exclude this bookmark if it contains any exclude word
									return nil
								}
							}

							// Check if all include words are present (only if there are include words)
							if len(includeWords) > 0 {
								allIncludeWordsMatch := true
								for _, word := range includeWords {
									if !strings.Contains(searchableText, word) {
										allIncludeWordsMatch = false
										break
									}
								}

								// Only include bookmark if all include words are found
								if !allIncludeWordsMatch {
									return nil
								}
							}
						}
					}

					bookmarks = append(bookmarks, bookmark)
					return nil
				})
				if err != nil {
					return err
				}
			}
		}
		return nil
	})

	if err != nil {
		response := BookmarksListResponse{
			Success: false,
			Message: "Error reading bookmarks from database",
			Data:    []Bookmark{},
			Count:   0,
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Return success response
	response := BookmarksListResponse{
		Success: true,
		Message: "Bookmarks retrieved successfully",
		Data:    bookmarks,
		Count:   len(bookmarks),
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func (h *BookmarkHandler) GetBookmarkTags(w http.ResponseWriter, r *http.Request) {
	// Only allow GET requests
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	var tags []string

	// Load alias map for bookmarks
	aliasHandler := NewTagAliasHandler(h.db)
	var aliasMap map[string]string
	_ = h.db.View(func(txn *badger.Txn) error {
		m, err := aliasHandler.getAliasMap(txn, "bookmark")
		if err == nil {
			aliasMap = m
		}
		return nil
	})

	// Read tag counts from BadgerDB
	err := h.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("tag_counts"))
		if err != nil {
			if err == badger.ErrKeyNotFound {
				// No tags exist yet, return empty list
				tags = []string{}
				return nil
			}
			return err
		}

		return item.Value(func(val []byte) error {
			var tagCounts map[string]int
			if err := json.Unmarshal(val, &tagCounts); err != nil {
				return err
			}

			// Merge counts by alias -> canonical
			if len(aliasMap) > 0 {
				merged := make(map[string]int)
				for tag, count := range tagCounts {
					canon := aliasMap[tag]
					if canon == "" {
						canon = tag
					}
					merged[canon] += count
				}
				tagCounts = merged
			}

			// Convert to "tag,{count}" format
			tags = make([]string, 0, len(tagCounts))
			for tag, count := range tagCounts {
				tags = append(tags, fmt.Sprintf("%s,%d", tag, count))
			}
			return nil
		})
	})

	if err != nil {
		response := TagsResponse{
			Success: false,
			Message: "Error reading tags from database",
			Data:    []string{},
			Count:   0,
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Initialize empty slice if nil
	if tags == nil {
		tags = []string{}
	}

	// Return success response
	response := TagsResponse{
		Success: true,
		Message: "Tags retrieved successfully",
		Data:    tags,
		Count:   len(tags),
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func (h *BookmarkHandler) DeleteBookmark(w http.ResponseWriter, r *http.Request) {
	// Only allow DELETE requests
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Get bookmark ID from URL path
	// Expected format: /api/delete-bookmark/{id}
	bookmarkID := r.URL.Path[len("/api/delete-bookmark/"):]

	if bookmarkID == "" {
		response := DeleteBookmarkResponse{
			Success: false,
			Message: "Bookmark ID is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Get the bookmark first to retrieve its tags for count updates
	var deletedTags []string
	err := h.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(bookmarkID))
		if err != nil {
			return err
		}

		return item.Value(func(val []byte) error {
			var bookmark Bookmark
			if err := json.Unmarshal(val, &bookmark); err != nil {
				return err
			}
			deletedTags = bookmark.Tags
			return nil
		})
	})

	if err != nil {
		if err == badger.ErrKeyNotFound {
			response := DeleteBookmarkResponse{
				Success: false,
				Message: "Bookmark not found",
			}
			writeJSONResponse(w, http.StatusNotFound, response)
			return
		}

		response := DeleteBookmarkResponse{
			Success: false,
			Message: "Error reading bookmark from database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Delete the bookmark
	err = h.db.Update(func(txn *badger.Txn) error {
		return txn.Delete([]byte(bookmarkID))
	})

	if err != nil {
		response := DeleteBookmarkResponse{
			Success: false,
			Message: "Error deleting bookmark from database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Update tag counts by removing the deleted bookmark's tags
	if err := h.updateTagCounts(deletedTags, []string{}); err != nil {
		// Log error but don't fail the request since bookmark was deleted
		fmt.Printf("Warning: Failed to update tag counts: %v\n", err)
	}

	// Return success response
	response := DeleteBookmarkResponse{
		Success: true,
		Message: "Bookmark deleted successfully",
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func (h *BookmarkHandler) EditBookmark(w http.ResponseWriter, r *http.Request) {
	// Only allow PUT requests
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Get bookmark ID from URL path
	// Expected format: /api/edit-bookmark/{id}
	bookmarkID := r.URL.Path[len("/api/edit-bookmark/"):]

	if bookmarkID == "" {
		response := BookmarkResponse{
			Success: false,
			Message: "Bookmark ID is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Parse JSON request body
	var req EditBookmarkRequest
	if err := readJSONRequest(r, &req); err != nil {
		response := BookmarkResponse{
			Success: false,
			Message: "Invalid JSON format",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Validate required fields
	if req.Title == "" {
		response := BookmarkResponse{
			Success: false,
			Message: "Title is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	if req.URL == "" {
		response := BookmarkResponse{
			Success: false,
			Message: "URL is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Initialize tags if nil
	if req.Tags == nil {
		req.Tags = []string{}
	}
	// Normalize requested tags via aliases
	aliasHandler := NewTagAliasHandler(h.db)
	_ = h.db.View(func(txn *badger.Txn) error {
		aliases, err := aliasHandler.getAliasMap(txn, "bookmark")
		if err == nil {
			req.Tags = normalizeTags(req.Tags, aliases)
		}
		return nil
	})

	var updatedBookmark Bookmark
	var oldTags []string

	// Update bookmark in BadgerDB
	err := h.db.Update(func(txn *badger.Txn) error {
		// First get the existing bookmark
		item, err := txn.Get([]byte(bookmarkID))
		if err != nil {
			return err
		}

		var existingBookmark Bookmark
		err = item.Value(func(val []byte) error {
			return json.Unmarshal(val, &existingBookmark)
		})
		if err != nil {
			return err
		}

		// Store old tags for count update
		oldTags = existingBookmark.Tags

		// Update the bookmark with new values
		updatedBookmark = Bookmark{
			ID:        existingBookmark.ID,
			Title:     req.Title,
			URL:       req.URL,
			Tags:      req.Tags,
			CreatedAt: existingBookmark.CreatedAt, // Keep original creation time
			UpdatedAt: time.Now(),                 // Update the modification time
		}

		// Serialize updated bookmark to JSON
		bookmarkJSON, err := json.Marshal(updatedBookmark)
		if err != nil {
			return err
		}

		// Save updated bookmark
		return txn.Set([]byte(bookmarkID), bookmarkJSON)
	})

	if err != nil {
		if err == badger.ErrKeyNotFound {
			response := BookmarkResponse{
				Success: false,
				Message: "Bookmark not found",
			}
			writeJSONResponse(w, http.StatusNotFound, response)
			return
		}

		response := BookmarkResponse{
			Success: false,
			Message: "Error updating bookmark in database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Update the tag counts with old and new tags
	if err := h.updateTagCounts(oldTags, updatedBookmark.Tags); err != nil {
		// Log error but don't fail the request since bookmark was updated
		fmt.Printf("Warning: Failed to update tag counts: %v\n", err)
	}

	// Return success response
	response := BookmarkResponse{
		Success: true,
		Message: "Bookmark updated successfully",
		Data:    updatedBookmark,
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func (h *BookmarkHandler) CheckDuplicates(w http.ResponseWriter, r *http.Request) {
	// Only allow POST requests
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Parse JSON request body
	var req struct {
		Title string `json:"title"`
		URL   string `json:"url"`
		ID    string `json:"id,omitempty"` // Optional ID to exclude from duplicate check (for editing)
	}

	if err := readJSONRequest(r, &req); err != nil {
		response := DuplicateCheckResponse{
			Success: false,
			Message: "Invalid JSON format",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// At least one field must be provided
	if req.Title == "" && req.URL == "" {
		response := DuplicateCheckResponse{
			Success: false,
			Message: "Either title or URL must be provided",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	var duplicates []Bookmark

	// Check for duplicates in BadgerDB
	err := h.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchSize = 50
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			key := item.Key()

			// Only process keys that start with "bookmark_"
			if len(key) >= 9 && string(key[:9]) == "bookmark_" {
				err := item.Value(func(val []byte) error {
					var bookmark Bookmark
					if err := json.Unmarshal(val, &bookmark); err != nil {
						// Skip invalid JSON entries
						return nil
					}

					// Skip if this is the same bookmark (for editing)
					if req.ID != "" && bookmark.ID == req.ID {
						return nil
					}

					// Check for exact matches
					titleMatch := req.Title != "" && strings.TrimSpace(bookmark.Title) == strings.TrimSpace(req.Title)
					urlMatch := req.URL != "" && strings.TrimSpace(bookmark.URL) == strings.TrimSpace(req.URL)

					if titleMatch || urlMatch {
						duplicates = append(duplicates, bookmark)
					}

					return nil
				})
				if err != nil {
					return err
				}
			}
		}
		return nil
	})

	if err != nil {
		response := DuplicateCheckResponse{
			Success: false,
			Message: "Error checking for duplicates",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Return response
	hasDuplicates := len(duplicates) > 0
	message := "No duplicates found"
	if hasDuplicates {
		message = fmt.Sprintf("Found %d potential duplicate(s)", len(duplicates))
	}

	response := DuplicateCheckResponse{
		Success:       true,
		Message:       message,
		HasDuplicates: hasDuplicates,
		Duplicates:    duplicates,
	}

	writeJSONResponse(w, http.StatusOK, response)
}
