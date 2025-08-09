package handlers

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/dgraph-io/badger/v4"
)

type YoutubeVideo struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	URL       string    `json:"url"`
	VideoID   string    `json:"video_id"`
	Tags      []string  `json:"tags"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type NewYoutubeVideoRequest struct {
	Title string   `json:"title"`
	URL   string   `json:"url"`
	Tags  []string `json:"tags"`
}

type EditYoutubeVideoRequest struct {
	Title string   `json:"title"`
	URL   string   `json:"url"`
	Tags  []string `json:"tags"`
}

type YoutubeVideoResponse struct {
	Success bool         `json:"success"`
	Message string       `json:"message"`
	Data    YoutubeVideo `json:"data,omitempty"`
}

type YoutubeVideosListResponse struct {
	Success bool           `json:"success"`
	Message string         `json:"message"`
	Data    []YoutubeVideo `json:"data,omitempty"`
	Count   int            `json:"count"`
}

type DeleteYoutubeVideoResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type YoutubeTagsResponse struct {
	Success bool     `json:"success"`
	Message string   `json:"message"`
	Data    []string `json:"data,omitempty"`
	Count   int      `json:"count"`
}

type YoutubeHandler struct {
	db *badger.DB
}

// extractYouTubeVideoID extracts the video ID from various YouTube URL formats
func extractYouTubeVideoID(url string) string {
	// YouTube URL patterns
	patterns := []string{
		`(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})`,
		`youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(url)
		if len(matches) > 1 {
			return matches[1]
		}
	}
	return ""
}

// isValidYouTubeURL checks if the URL is a valid YouTube URL
func isValidYouTubeURL(url string) bool {
	return extractYouTubeVideoID(url) != ""
}

func NewYoutubeHandler(db *badger.DB) *YoutubeHandler {
	handler := &YoutubeHandler{db: db}

	// Initialize tag counts if they don't exist
	handler.initializeYoutubeTagCounts()

	return handler
}

// initializeYoutubeTagCounts creates the youtube_tag_counts key if it doesn't exist
func (h *YoutubeHandler) initializeYoutubeTagCounts() error {
	return h.db.View(func(txn *badger.Txn) error {
		// Check if youtube_tag_counts already exists
		_, err := txn.Get([]byte("youtube_tag_counts"))
		if err == badger.ErrKeyNotFound {
			// youtube_tag_counts doesn't exist, rebuild it
			return h.rebuildYoutubeTagCounts()
		}
		return err
	})
}

// updateYoutubeTagCounts maintains tag counts for efficient retrieval
func (h *YoutubeHandler) updateYoutubeTagCounts(oldTags, newTags []string) error {
	return h.db.Update(func(txn *badger.Txn) error {
		// Get existing tag counts
		tagCounts := make(map[string]int)

		item, err := txn.Get([]byte("youtube_tag_counts"))
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

		return txn.Set([]byte("youtube_tag_counts"), countsJSON)
	})
}

// rebuildYoutubeTagCounts rebuilds the youtube_tag_counts key by scanning all existing videos
func (h *YoutubeHandler) rebuildYoutubeTagCounts() error {
	return h.db.Update(func(txn *badger.Txn) error {
		// Get all tags and their counts from existing youtube videos
		tagCounts := make(map[string]int)

		opts := badger.DefaultIteratorOptions
		opts.PrefetchSize = 50
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			key := item.Key()

			// Only process keys that start with "youtube_" and are video IDs (not tag counts)
			keyStr := string(key)
			if len(keyStr) >= 8 && strings.HasPrefix(keyStr, "youtube_") && keyStr != "youtube_tag_counts" {
				err := item.Value(func(val []byte) error {
					var video YoutubeVideo
					if err := json.Unmarshal(val, &video); err != nil {
						// Skip invalid JSON entries
						return nil
					}
					// Count all tags from this video
					for _, tag := range video.Tags {
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

		return txn.Set([]byte("youtube_tag_counts"), countsJSON)
	})
}

func (h *YoutubeHandler) NewYoutubeVideo(w http.ResponseWriter, r *http.Request) {
	// Only allow POST requests
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Parse JSON request body
	var req NewYoutubeVideoRequest
	if err := readJSONRequest(r, &req); err != nil {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "Invalid JSON format",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Validate required fields
	if req.Title == "" {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "Title is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	if req.URL == "" {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "URL is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Validate YouTube URL
	videoID := extractYouTubeVideoID(req.URL)
	if videoID == "" {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "Invalid YouTube URL. Please provide a valid YouTube video URL.",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Initialize tags if nil
	if req.Tags == nil {
		req.Tags = []string{}
	}
	// Normalize tags via aliases (youtube)
	aliasHandler := NewTagAliasHandler(h.db)
	_ = h.db.View(func(txn *badger.Txn) error {
		aliases, err := aliasHandler.getAliasMap(txn, "youtube")
		if err == nil {
			req.Tags = normalizeTags(req.Tags, aliases)
		}
		return nil
	})

	// Generate unique ID
	now := time.Now()
	videoIDKey := fmt.Sprintf("youtube_%d", now.UnixNano())

	// Create youtube video object
	video := YoutubeVideo{
		ID:        videoIDKey,
		Title:     req.Title,
		URL:       req.URL,
		VideoID:   videoID,
		Tags:      req.Tags,
		CreatedAt: now,
		UpdatedAt: now,
	}

	// Serialize video to JSON for storage
	videoJSON, err := json.Marshal(video)
	if err != nil {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "Error serializing video data",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Store in BadgerDB
	err = h.db.Update(func(txn *badger.Txn) error {
		return txn.Set([]byte(videoIDKey), videoJSON)
	})
	if err != nil {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "Error saving video to database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Update the tag counts
	if err := h.updateYoutubeTagCounts([]string{}, video.Tags); err != nil {
		// Log error but don't fail the request since video was saved
		fmt.Printf("Warning: Failed to update YouTube tag counts: %v\n", err)
	}

	// Return success response
	response := YoutubeVideoResponse{
		Success: true,
		Message: "YouTube video created successfully",
		Data:    video,
	}

	writeJSONResponse(w, http.StatusCreated, response)
}

func (h *YoutubeHandler) GetYoutubeVideos(w http.ResponseWriter, r *http.Request) {
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
		m, err := aliasHandler.getAliasMap(txn, "youtube")
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

	// Normalize filter tags, exclude tags and expression
	if len(filterTags) > 0 && aliasMap != nil {
		filterTags = normalizeTags(filterTags, aliasMap)
	}
	if len(excludeTags) > 0 && aliasMap != nil {
		excludeTags = normalizeTags(excludeTags, aliasMap)
	}
	if advancedExpression != "" && aliasMap != nil {
		advancedExpression = normalizeExpression(advancedExpression, aliasMap)
	}

	var videos []YoutubeVideo

	// Pre-allocate slice with estimated capacity to reduce allocations
	videos = make([]YoutubeVideo, 0, 100)

	// Read all youtube videos from BadgerDB
	err := h.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchSize = 50
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			key := item.Key()

			// Only process keys that start with "youtube_" and are video IDs (not tag counts)
			keyStr := string(key)
			if len(keyStr) >= 8 && strings.HasPrefix(keyStr, "youtube_") && keyStr != "youtube_tag_counts" {
				err := item.Value(func(val []byte) error {
					var video YoutubeVideo
					if err := json.Unmarshal(val, &video); err != nil {
						// Skip invalid JSON entries
						return nil
					}
					// Normalize tags for search/UI
					if aliasMap != nil && len(video.Tags) > 0 {
						video.Tags = normalizeTags(video.Tags, aliasMap)
					}

					// Skip empty videos (videos with empty ID, title, or URL)
					if video.ID == "" || video.Title == "" || video.URL == "" {
						return nil
					}

					// Apply tag filtering based on mode
					if advancedExpression != "" {
						// Use advanced expression evaluation
						if !evaluateTagExpression(video.Tags, advancedExpression) {
							return nil
						}
					} else if len(filterTags) > 0 {
						// Apply include tag filtering if filter tags are specified
						hasAnyTag := false
						for _, filterTag := range filterTags {
							for _, videoTag := range video.Tags {
								if videoTag == filterTag {
									hasAnyTag = true
									break
								}
							}
							if hasAnyTag {
								break
							}
						}
						// Only include video if it has any of the required tags
						if !hasAnyTag {
							return nil
						}
					} else if len(excludeTags) > 0 {
						// Apply exclude tag filtering if exclude tags are specified
						hasExcludedTag := false
						for _, excludeTag := range excludeTags {
							for _, videoTag := range video.Tags {
								if videoTag == excludeTag {
									hasExcludedTag = true
									break
								}
							}
							if hasExcludedTag {
								break
							}
						}
						// Exclude video if it has any of the excluded tags
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
							searchableText := strings.ToLower(video.Title + " " + video.URL + " " + strings.Join(video.Tags, " "))

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
									// Exclude this video if it contains any exclude word
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

								// Only include video if all include words are found
								if !allIncludeWordsMatch {
									return nil
								}
							}
						}
					}

					videos = append(videos, video)
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
		response := YoutubeVideosListResponse{
			Success: false,
			Message: "Error reading YouTube videos from database",
			Data:    []YoutubeVideo{},
			Count:   0,
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Return success response
	response := YoutubeVideosListResponse{
		Success: true,
		Message: "YouTube videos retrieved successfully",
		Data:    videos,
		Count:   len(videos),
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func (h *YoutubeHandler) GetYoutubeTags(w http.ResponseWriter, r *http.Request) {
	// Only allow GET requests
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	var tags []string

	// Load alias map
	aliasHandler := NewTagAliasHandler(h.db)
	var aliasMap map[string]string
	_ = h.db.View(func(txn *badger.Txn) error {
		m, err := aliasHandler.getAliasMap(txn, "youtube")
		if err == nil {
			aliasMap = m
		}
		return nil
	})

	// Read tag counts from BadgerDB
	err := h.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("youtube_tag_counts"))
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
			// Merge counts using alias map
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
		response := YoutubeTagsResponse{
			Success: false,
			Message: "Error reading YouTube tags from database",
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
	response := YoutubeTagsResponse{
		Success: true,
		Message: "YouTube tags retrieved successfully",
		Data:    tags,
		Count:   len(tags),
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func (h *YoutubeHandler) DeleteYoutubeVideo(w http.ResponseWriter, r *http.Request) {
	// Only allow DELETE requests
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Get video ID from URL path
	videoID := r.URL.Path[len("/api/youtube/delete/"):]

	if videoID == "" {
		response := DeleteYoutubeVideoResponse{
			Success: false,
			Message: "Video ID is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Get the video first to retrieve its tags for count updates
	var deletedTags []string
	err := h.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(videoID))
		if err != nil {
			return err
		}

		return item.Value(func(val []byte) error {
			var video YoutubeVideo
			if err := json.Unmarshal(val, &video); err != nil {
				return err
			}
			deletedTags = video.Tags
			return nil
		})
	})

	if err != nil {
		if err == badger.ErrKeyNotFound {
			response := DeleteYoutubeVideoResponse{
				Success: false,
				Message: "YouTube video not found",
			}
			writeJSONResponse(w, http.StatusNotFound, response)
			return
		}

		response := DeleteYoutubeVideoResponse{
			Success: false,
			Message: "Error reading YouTube video from database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Delete the video
	err = h.db.Update(func(txn *badger.Txn) error {
		return txn.Delete([]byte(videoID))
	})

	if err != nil {
		response := DeleteYoutubeVideoResponse{
			Success: false,
			Message: "Error deleting YouTube video from database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Update tag counts by removing the deleted video's tags
	if err := h.updateYoutubeTagCounts(deletedTags, []string{}); err != nil {
		// Log error but don't fail the request since video was deleted
		fmt.Printf("Warning: Failed to update YouTube tag counts: %v\n", err)
	}

	// Return success response
	response := DeleteYoutubeVideoResponse{
		Success: true,
		Message: "YouTube video deleted successfully",
	}

	writeJSONResponse(w, http.StatusOK, response)
}

func (h *YoutubeHandler) EditYoutubeVideo(w http.ResponseWriter, r *http.Request) {
	// Only allow PUT requests
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set content type to JSON
	w.Header().Set("Content-Type", "application/json")

	// Get video ID from URL path
	videoID := r.URL.Path[len("/api/youtube/edit/"):]

	if videoID == "" {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "Video ID is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Parse JSON request body
	var req EditYoutubeVideoRequest
	if err := readJSONRequest(r, &req); err != nil {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "Invalid JSON format",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Validate required fields
	if req.Title == "" {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "Title is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	if req.URL == "" {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "URL is required",
		}
		writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Validate YouTube URL
	youtubeVideoID := extractYouTubeVideoID(req.URL)
	if youtubeVideoID == "" {
		response := YoutubeVideoResponse{
			Success: false,
			Message: "Invalid YouTube URL. Please provide a valid YouTube video URL.",
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
		aliases, err := aliasHandler.getAliasMap(txn, "youtube")
		if err == nil {
			req.Tags = normalizeTags(req.Tags, aliases)
		}
		return nil
	})

	var updatedVideo YoutubeVideo
	var oldTags []string

	// Update video in BadgerDB
	err := h.db.Update(func(txn *badger.Txn) error {
		// First get the existing video
		item, err := txn.Get([]byte(videoID))
		if err != nil {
			return err
		}

		var existingVideo YoutubeVideo
		err = item.Value(func(val []byte) error {
			return json.Unmarshal(val, &existingVideo)
		})
		if err != nil {
			return err
		}

		// Store old tags for count update
		oldTags = existingVideo.Tags

		// Update the video with new values
		updatedVideo = YoutubeVideo{
			ID:        existingVideo.ID,
			Title:     req.Title,
			URL:       req.URL,
			VideoID:   youtubeVideoID,
			Tags:      req.Tags,
			CreatedAt: existingVideo.CreatedAt, // Keep original creation time
			UpdatedAt: time.Now(),              // Update the modification time
		}

		// Serialize updated video to JSON
		videoJSON, err := json.Marshal(updatedVideo)
		if err != nil {
			return err
		}

		// Save updated video
		return txn.Set([]byte(videoID), videoJSON)
	})

	if err != nil {
		if err == badger.ErrKeyNotFound {
			response := YoutubeVideoResponse{
				Success: false,
				Message: "YouTube video not found",
			}
			writeJSONResponse(w, http.StatusNotFound, response)
			return
		}

		response := YoutubeVideoResponse{
			Success: false,
			Message: "Error updating YouTube video in database",
		}
		writeJSONResponse(w, http.StatusInternalServerError, response)
		return
	}

	// Update the tag counts with old and new tags
	if err := h.updateYoutubeTagCounts(oldTags, updatedVideo.Tags); err != nil {
		// Log error but don't fail the request since video was updated
		fmt.Printf("Warning: Failed to update YouTube tag counts: %v\n", err)
	}

	// Return success response
	response := YoutubeVideoResponse{
		Success: true,
		Message: "YouTube video updated successfully",
		Data:    updatedVideo,
	}

	writeJSONResponse(w, http.StatusOK, response)
}
