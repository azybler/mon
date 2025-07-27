package handlers

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/dgraph-io/badger/v4"
)

// Pre-compiled common error responses to reduce allocations
var (
	invalidJSONResponseNote = NoteResponse{
		Success: false,
		Message: "Invalid JSON format",
	}
	titleRequiredResponseNote = NoteResponse{
		Success: false,
		Message: "Title is required",
	}
	descriptionRequiredResponse = NoteResponse{
		Success: false,
		Message: "Description is required",
	}
)

type Note struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Tags        []string  `json:"tags"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type NewNoteRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
}

type EditNoteRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
}

type NoteResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    Note   `json:"data,omitempty"`
}

type NotesListResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    []Note `json:"data,omitempty"`
	Count   int    `json:"count"`
}

type DeleteNoteResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type NoteTagsResponse struct {
	Success bool     `json:"success"`
	Message string   `json:"message"`
	Data    []string `json:"data,omitempty"`
	Count   int      `json:"count"`
}

type NoteHandler struct {
	db *badger.DB
}

// evaluateNoteTagExpression evaluates a tag expression against a set of note tags
func evaluateNoteTagExpression(noteTags []string, expression string) bool {
	if expression == "" {
		return true // Empty expression matches all
	}

	// Create a case-insensitive set of note tags
	tagSet := make(map[string]bool)
	for _, tag := range noteTags {
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

	// Use the same simple expression evaluator as bookmarks
	return evaluateNoteSimpleBooleanExpression(expr)
}

// evaluateNoteSimpleBooleanExpression evaluates a simple boolean expression for notes
func evaluateNoteSimpleBooleanExpression(expr string) bool {
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
				result := evaluateNoteSimpleBooleanExpression(inner)
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
	return evaluateNoteWithoutParentheses(expr)
}

// evaluateNoteWithoutParentheses evaluates a boolean expression without parentheses for notes
func evaluateNoteWithoutParentheses(expr string) bool {
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

func NewNoteHandler(db *badger.DB) *NoteHandler {
	handler := &NoteHandler{db: db}

	// Initialize tag counts if they don't exist (for migration)
	handler.initializeNoteTagCounts()

	return handler
}

// initializeNoteTagCounts creates the note_tag_counts key if it doesn't exist
// This is useful for migrating from the old all_tags system
func (h *NoteHandler) initializeNoteTagCounts() error {
	return h.db.View(func(txn *badger.Txn) error {
		// Check if note_tag_counts already exists
		_, err := txn.Get([]byte("note_tag_counts"))
		if err == badger.ErrKeyNotFound {
			// note_tag_counts doesn't exist, rebuild it
			return h.rebuildNoteTagCounts()
		}
		return err
	})
}

// updateNoteTagCounts maintains tag counts for efficient retrieval
func (h *NoteHandler) updateNoteTagCounts(oldTags, newTags []string) error {
	return h.db.Update(func(txn *badger.Txn) error {
		// Get existing tag counts
		tagCounts := make(map[string]int)

		item, err := txn.Get([]byte("note_tag_counts"))
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

		return txn.Set([]byte("note_tag_counts"), countsJSON)
	})
}

// rebuildNoteTagCounts rebuilds the note_tag_counts key by scanning all existing notes
func (h *NoteHandler) rebuildNoteTagCounts() error {
	return h.db.Update(func(txn *badger.Txn) error {
		// Get all tags and their counts from existing notes
		tagCounts := make(map[string]int)

		opts := badger.DefaultIteratorOptions
		opts.PrefetchSize = 50 // Increase prefetch size for better performance
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			key := item.Key()

			// Only process keys that start with "note_"
			if len(key) >= 5 && string(key[:5]) == "note_" {
				err := item.Value(func(val []byte) error {
					var note Note
					if err := json.Unmarshal(val, &note); err != nil {
						// Skip invalid JSON entries
						return nil
					}
					// Count all tags from this note
					for _, tag := range note.Tags {
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

		return txn.Set([]byte("note_tag_counts"), countsJSON)
	})
}

func (h *NoteHandler) NewNote(w http.ResponseWriter, r *http.Request) {
	// Only allow POST requests
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Parse JSON request body using helper function
	var req NewNoteRequest
	if err := readJSONRequest(r, &req); err != nil {
		response := NoteResponse{
			Success: false,
			Message: "Invalid JSON format",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Validate required fields
	if req.Title == "" {
		response := NoteResponse{
			Success: false,
			Message: "Title is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	if req.Description == "" {
		response := NoteResponse{
			Success: false,
			Message: "Description is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Initialize tags if nil
	if req.Tags == nil {
		req.Tags = []string{}
	}

	// Generate unique ID (simple timestamp + title hash for now)
	now := time.Now()
	noteID := fmt.Sprintf("note_%d", now.UnixNano())

	// Create note object
	note := Note{
		ID:          noteID,
		Title:       req.Title,
		Description: req.Description,
		Tags:        req.Tags,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// Serialize note to JSON for storage
	noteJSON, err := json.Marshal(note)
	if err != nil {
		response := NoteResponse{
			Success: false,
			Message: "Error serializing note data",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Store in BadgerDB
	err = h.db.Update(func(txn *badger.Txn) error {
		return txn.Set([]byte(noteID), noteJSON)
	})
	if err != nil {
		response := NoteResponse{
			Success: false,
			Message: "Error saving note to database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Update the tag counts
	if err := h.updateNoteTagCounts([]string{}, note.Tags); err != nil {
		// Log error but don't fail the request since note was saved
		fmt.Printf("Warning: Failed to update note tag counts: %v\n", err)
	}

	// Return success response
	response := NoteResponse{
		Success: true,
		Message: "Note created successfully",
		Data:    note,
	}

	writeJSONResponse(w, http.StatusCreated, response)
}

func (h *NoteHandler) GetNotes(w http.ResponseWriter, r *http.Request) {
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

	var notes []Note

	// Pre-allocate slice with estimated capacity to reduce allocations
	notes = make([]Note, 0, 100)

	// Read all notes from BadgerDB
	err := h.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchSize = 50 // Increase prefetch size for better performance
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			key := item.Key()

			// Only process keys that start with "note_"
			if len(key) >= 5 && string(key[:5]) == "note_" {
				err := item.Value(func(val []byte) error {
					var note Note
					if err := json.Unmarshal(val, &note); err != nil {
						// Skip invalid JSON entries
						return nil
					}

					// Apply tag filtering based on mode
					if advancedExpression != "" {
						// Use advanced expression evaluation
						if !evaluateNoteTagExpression(note.Tags, advancedExpression) {
							return nil
						}
					} else if len(filterTags) > 0 {
						// Apply include tag filtering if filter tags are specified
						hasAnyTag := false
						for _, filterTag := range filterTags {
							for _, noteTag := range note.Tags {
								if noteTag == filterTag {
									hasAnyTag = true
									break
								}
							}
							if hasAnyTag {
								break
							}
						}
						// Only include note if it has any of the required tags
						if !hasAnyTag {
							return nil
						}
					} else if len(excludeTags) > 0 {
						// Apply exclude tag filtering if exclude tags are specified
						hasExcludedTag := false
						for _, excludeTag := range excludeTags {
							for _, noteTag := range note.Tags {
								if noteTag == excludeTag {
									hasExcludedTag = true
									break
								}
							}
							if hasExcludedTag {
								break
							}
						}
						// Exclude note if it has any of the excluded tags
						if hasExcludedTag {
							return nil
						}
					}

					// Apply keyword search if keywords are specified
					if keywords != "" {
						// Split keywords into individual words and normalize
						keywordWords := strings.Fields(strings.ToLower(keywords))
						if len(keywordWords) > 0 {
							// Create searchable text by combining title, description, and tags
							searchableText := strings.ToLower(note.Title + " " + note.Description + " " + strings.Join(note.Tags, " "))

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
									// Exclude this note if it contains any exclude word
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

								// Only include note if all include words are found
								if !allIncludeWordsMatch {
									return nil
								}
							}
						}
					}

					notes = append(notes, note)
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
		response := NotesListResponse{
			Success: false,
			Message: "Error reading notes from database",
			Data:    []Note{},
			Count:   0,
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Return success response
	response := NotesListResponse{
		Success: true,
		Message: "Notes retrieved successfully",
		Data:    notes,
		Count:   len(notes),
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func (h *NoteHandler) GetNoteTags(w http.ResponseWriter, r *http.Request) {
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
		item, err := txn.Get([]byte("note_tag_counts"))
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
		response := NoteTagsResponse{
			Success: false,
			Message: "Error reading note tags from database",
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
	response := NoteTagsResponse{
		Success: true,
		Message: "Note tags retrieved successfully",
		Data:    tags,
		Count:   len(tags),
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func (h *NoteHandler) DeleteNote(w http.ResponseWriter, r *http.Request) {
	// Only allow DELETE requests
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Get note ID from URL path
	// Expected format: /api/delete-note/{id}
	noteID := r.URL.Path[len("/api/delete-note/"):]

	if noteID == "" {
		response := DeleteNoteResponse{
			Success: false,
			Message: "Note ID is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Get the note first to retrieve its tags for count updates
	var deletedTags []string
	err := h.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(noteID))
		if err != nil {
			return err
		}

		return item.Value(func(val []byte) error {
			var note Note
			if err := json.Unmarshal(val, &note); err != nil {
				return err
			}
			deletedTags = note.Tags
			return nil
		})
	})

	if err != nil {
		if err == badger.ErrKeyNotFound {
			response := DeleteNoteResponse{
				Success: false,
				Message: "Note not found",
			}
			writeJSONResponse(w, http.StatusNotFound, response)
			return
		}

		response := DeleteNoteResponse{
			Success: false,
			Message: "Error reading note from database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Delete the note
	err = h.db.Update(func(txn *badger.Txn) error {
		return txn.Delete([]byte(noteID))
	})

	if err != nil {
		response := DeleteNoteResponse{
			Success: false,
			Message: "Error deleting note from database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Update tag counts by removing the deleted note's tags
	if err := h.updateNoteTagCounts(deletedTags, []string{}); err != nil {
		// Log error but don't fail the request since note was deleted
		fmt.Printf("Warning: Failed to update note tag counts: %v\n", err)
	}

	// Return success response
	response := DeleteNoteResponse{
		Success: true,
		Message: "Note deleted successfully",
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func (h *NoteHandler) EditNote(w http.ResponseWriter, r *http.Request) {
	// Only allow PUT requests
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Get note ID from URL path
	// Expected format: /api/edit-note/{id}
	noteID := r.URL.Path[len("/api/edit-note/"):]

	if noteID == "" {
		response := NoteResponse{
			Success: false,
			Message: "Note ID is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Parse JSON request body
	var req EditNoteRequest
	if err := readJSONRequest(r, &req); err != nil {
		response := NoteResponse{
			Success: false,
			Message: "Invalid JSON format",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Validate required fields
	if req.Title == "" {
		response := NoteResponse{
			Success: false,
			Message: "Title is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	if req.Description == "" {
		response := NoteResponse{
			Success: false,
			Message: "Description is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Initialize tags if nil
	if req.Tags == nil {
		req.Tags = []string{}
	}

	var updatedNote Note
	var oldTags []string

	// Update note in BadgerDB
	err := h.db.Update(func(txn *badger.Txn) error {
		// First get the existing note
		item, err := txn.Get([]byte(noteID))
		if err != nil {
			return err
		}

		var existingNote Note
		err = item.Value(func(val []byte) error {
			return json.Unmarshal(val, &existingNote)
		})
		if err != nil {
			return err
		}

		// Store old tags for count update
		oldTags = existingNote.Tags

		// Update the note with new values
		updatedNote = Note{
			ID:          existingNote.ID,
			Title:       req.Title,
			Description: req.Description,
			Tags:        req.Tags,
			CreatedAt:   existingNote.CreatedAt, // Keep original creation time
			UpdatedAt:   time.Now(),             // Update the modification time
		}

		// Serialize updated note to JSON
		noteJSON, err := json.Marshal(updatedNote)
		if err != nil {
			return err
		}

		// Save updated note
		return txn.Set([]byte(noteID), noteJSON)
	})

	if err != nil {
		if err == badger.ErrKeyNotFound {
			response := NoteResponse{
				Success: false,
				Message: "Note not found",
			}
			writeJSONResponse(w, http.StatusNotFound, response)
			return
		}

		response := NoteResponse{
			Success: false,
			Message: "Error updating note in database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Update the tag counts with old and new tags
	if err := h.updateNoteTagCounts(oldTags, updatedNote.Tags); err != nil {
		// Log error but don't fail the request since note was updated
		fmt.Printf("Warning: Failed to update note tag counts: %v\n", err)
	}

	// Return success response
	response := NoteResponse{
		Success: true,
		Message: "Note updated successfully",
		Data:    updatedNote,
	}

	writeJSONResponse(w, http.StatusOK, response)
}
