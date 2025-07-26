package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/dgraph-io/badger/v4"
)

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

type BookmarkHandler struct {
	db *badger.DB
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
		opts.PrefetchSize = 10
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			key := item.Key()

			// Only process keys that start with "bookmark_"
			if string(key[:min(len(key), 9)]) == "bookmark_" {
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

	// Parse JSON request body
	var req NewBookmarkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response := BookmarkResponse{
			Success: false,
			Message: "Invalid JSON format",
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	// Validate required fields
	if req.Title == "" {
		response := BookmarkResponse{
			Success: false,
			Message: "Title is required",
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	if req.URL == "" {
		response := BookmarkResponse{
			Success: false,
			Message: "URL is required",
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	// Initialize tags if nil
	if req.Tags == nil {
		req.Tags = []string{}
	}

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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
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

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (h *BookmarkHandler) GetBookmarks(w http.ResponseWriter, r *http.Request) {
	// Only allow GET requests
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Parse query parameters for tag filtering
	queryTags := r.URL.Query().Get("tags")
	queryExcludeTags := r.URL.Query().Get("exclude_tags")
	var filterTags []string
	var excludeTags []string

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

	var bookmarks []Bookmark

	// Read all bookmarks from BadgerDB
	err := h.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchSize = 10
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			key := item.Key()

			// Only process keys that start with "bookmark_"
			if string(key[:min(len(key), 9)]) == "bookmark_" {
				err := item.Value(func(val []byte) error {
					var bookmark Bookmark
					if err := json.Unmarshal(val, &bookmark); err != nil {
						// Skip invalid JSON entries
						return nil
					}

					// Apply tag filtering if filter tags are specified
					if len(filterTags) > 0 {
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
					}

					// Apply exclude tag filtering if exclude tags are specified
					if len(excludeTags) > 0 {
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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	// Return success response
	response := BookmarksListResponse{
		Success: true,
		Message: "Bookmarks retrieved successfully",
		Data:    bookmarks,
		Count:   len(bookmarks),
	}

	json.NewEncoder(w).Encode(response)
}

func (h *BookmarkHandler) GetTags(w http.ResponseWriter, r *http.Request) {
	// Only allow GET requests
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	var tags []string

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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
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

	json.NewEncoder(w).Encode(response)
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
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
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
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(response)
			return
		}

		response := DeleteBookmarkResponse{
			Success: false,
			Message: "Error reading bookmark from database",
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
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

	json.NewEncoder(w).Encode(response)
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
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	// Parse JSON request body
	var req EditBookmarkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response := BookmarkResponse{
			Success: false,
			Message: "Invalid JSON format",
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	// Validate required fields
	if req.Title == "" {
		response := BookmarkResponse{
			Success: false,
			Message: "Title is required",
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	if req.URL == "" {
		response := BookmarkResponse{
			Success: false,
			Message: "URL is required",
		}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	// Initialize tags if nil
	if req.Tags == nil {
		req.Tags = []string{}
	}

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
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(response)
			return
		}

		response := BookmarkResponse{
			Success: false,
			Message: "Error updating bookmark in database",
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
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

	json.NewEncoder(w).Encode(response)
}
