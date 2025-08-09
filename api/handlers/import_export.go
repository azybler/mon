package handlers

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/dgraph-io/badger/v4"
)

// ExportData is the on-disk format for full export
type ExportData struct {
	Version    int            `json:"version"`
	ExportedAt time.Time      `json:"exported_at"`
	Bookmarks  []Bookmark     `json:"bookmarks"`
	Notes      []Note         `json:"notes"`
	Youtube    []YoutubeVideo `json:"youtube"`
}

type ImportSummary struct {
	BookmarksInserted int `json:"bookmarks_inserted"`
	BookmarksSkipped  int `json:"bookmarks_skipped"`
	NotesInserted     int `json:"notes_inserted"`
	NotesSkipped      int `json:"notes_skipped"`
	YoutubeInserted   int `json:"youtube_inserted"`
	YoutubeSkipped    int `json:"youtube_skipped"`
}

type ImportExportHandler struct {
	db *badger.DB
}

func NewImportExportHandler(db *badger.DB) *ImportExportHandler {
	return &ImportExportHandler{db: db}
}

// ExportAll returns a single JSON file with all content
func (h *ImportExportHandler) ExportAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Aggregate all items
	out := ExportData{
		Version:    1,
		ExportedAt: time.Now(),
		Bookmarks:  []Bookmark{},
		Notes:      []Note{},
		Youtube:    []YoutubeVideo{},
	}

	err := h.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.PrefetchSize = 100
		it := txn.NewIterator(opts)
		defer it.Close()

		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			key := string(item.Key())

			if strings.HasPrefix(key, "bookmark_") {
				if key == "bookmark_tag_counts" || key == "tag_counts" { // ignore counts or legacy
					continue
				}
				if err := item.Value(func(val []byte) error {
					var b Bookmark
					if e := json.Unmarshal(val, &b); e == nil && b.ID != "" {
						out.Bookmarks = append(out.Bookmarks, b)
					}
					return nil
				}); err != nil {
					return err
				}
				continue
			}

			if strings.HasPrefix(key, "note_") {
				if key == "note_tag_counts" {
					continue
				}
				if err := item.Value(func(val []byte) error {
					var n Note
					if e := json.Unmarshal(val, &n); e == nil && n.ID != "" {
						out.Notes = append(out.Notes, n)
					}
					return nil
				}); err != nil {
					return err
				}
				continue
			}

			if strings.HasPrefix(key, "youtube_") {
				if key == "youtube_tag_counts" {
					continue
				}
				if err := item.Value(func(val []byte) error {
					var y YoutubeVideo
					if e := json.Unmarshal(val, &y); e == nil && y.ID != "" {
						out.Youtube = append(out.Youtube, y)
					}
					return nil
				}); err != nil {
					return err
				}
				continue
			}
		}
		return nil
	})

	if err != nil {
		http.Error(w, "Failed to read database for export", http.StatusInternalServerError)
		return
	}

	// Serialize and send as attachment
	data, err := json.Marshal(out)
	if err != nil {
		http.Error(w, "Failed to encode export", http.StatusInternalServerError)
		return
	}

	ts := time.Now().UTC().Format("20060102T150405Z")
	filename := fmt.Sprintf("mon-export-%s.json", ts)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// ImportAll ingests a previously exported file and recreates content without duplicating
func (h *ImportExportHandler) ImportAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Read body as JSON, supporting multipart/form-data (file field named "file")
	var payload []byte
	var err error

	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") {
		if err = r.ParseMultipartForm(32 << 20); err != nil { // 32MB
			http.Error(w, "Invalid multipart form", http.StatusBadRequest)
			return
		}
		file, _, ferr := r.FormFile("file")
		if ferr != nil {
			http.Error(w, "Missing file field", http.StatusBadRequest)
			return
		}
		defer file.Close()
		payload, err = io.ReadAll(file)
		if err != nil {
			http.Error(w, "Failed to read uploaded file", http.StatusBadRequest)
			return
		}
	} else {
		payload, err = io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Failed to read request body", http.StatusBadRequest)
			return
		}
	}

	var in ExportData
	if err := json.Unmarshal(payload, &in); err != nil {
		http.Error(w, "Invalid JSON export format", http.StatusBadRequest)
		return
	}

	// Build fast lookup sets to avoid duplicates
	bookmarkURLs := make(map[string]struct{})
	noteKeys := make(map[string]struct{}) // title\x00description
	ytIDs := make(map[string]struct{})

	if err := h.db.View(func(txn *badger.Txn) error {
		it := txn.NewIterator(badger.DefaultIteratorOptions)
		defer it.Close()
		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			k := string(item.Key())
			switch {
			case strings.HasPrefix(k, "bookmark_"):
				if k == "bookmark_tag_counts" || k == "tag_counts" {
					continue
				}
				_ = item.Value(func(val []byte) error {
					var b Bookmark
					if e := json.Unmarshal(val, &b); e == nil {
						u := strings.TrimSpace(strings.ToLower(b.URL))
						if u != "" {
							bookmarkURLs[u] = struct{}{}
						}
					}
					return nil
				})
			case strings.HasPrefix(k, "note_"):
				if k == "note_tag_counts" {
					continue
				}
				_ = item.Value(func(val []byte) error {
					var n Note
					if e := json.Unmarshal(val, &n); e == nil {
						key := strings.TrimSpace(strings.ToLower(n.Title)) + "\x00" + strings.TrimSpace(strings.ToLower(n.Description))
						if strings.TrimSpace(n.Title) != "" && strings.TrimSpace(n.Description) != "" {
							noteKeys[key] = struct{}{}
						}
					}
					return nil
				})
			case strings.HasPrefix(k, "youtube_"):
				if k == "youtube_tag_counts" {
					continue
				}
				_ = item.Value(func(val []byte) error {
					var y YoutubeVideo
					if e := json.Unmarshal(val, &y); e == nil {
						vid := strings.TrimSpace(y.VideoID)
						if vid == "" {
							vid = extractYouTubeVideoID(y.URL)
						}
						if vid != "" {
							ytIDs[vid] = struct{}{}
						}
					}
					return nil
				})
			}
		}
		return nil
	}); err != nil {
		http.Error(w, "Failed to scan database", http.StatusInternalServerError)
		return
	}

	// Insert new items
	sum := ImportSummary{}

	err = h.db.Update(func(txn *badger.Txn) error {
		// Bookmarks
		for _, b := range in.Bookmarks {
			normURL := strings.TrimSpace(strings.ToLower(b.URL))
			if normURL == "" {
				continue
			}
			if _, exists := bookmarkURLs[normURL]; exists {
				sum.BookmarksSkipped++
				continue
			}
			// Generate/ensure ID
			id := b.ID
			if id == "" {
				id = fmt.Sprintf("bookmark_%d", time.Now().UnixNano())
			} else {
				// If key exists, generate a new one to avoid collision
				if _, err := txn.Get([]byte(id)); err == nil {
					id = fmt.Sprintf("bookmark_%d", time.Now().UnixNano())
				}
			}
			// Ensure times
			if b.CreatedAt.IsZero() {
				b.CreatedAt = time.Now()
			}
			if b.UpdatedAt.IsZero() {
				b.UpdatedAt = b.CreatedAt
			}
			b.ID = id
			data, _ := json.Marshal(b)
			if err := txn.Set([]byte(id), data); err != nil {
				return err
			}
			bookmarkURLs[normURL] = struct{}{}
			sum.BookmarksInserted++
		}

		// Notes
		for _, n := range in.Notes {
			if strings.TrimSpace(n.Title) == "" || strings.TrimSpace(n.Description) == "" {
				continue
			}
			key := strings.TrimSpace(strings.ToLower(n.Title)) + "\x00" + strings.TrimSpace(strings.ToLower(n.Description))
			if _, exists := noteKeys[key]; exists {
				sum.NotesSkipped++
				continue
			}
			id := n.ID
			if id == "" {
				id = fmt.Sprintf("note_%d", time.Now().UnixNano())
			} else {
				if _, err := txn.Get([]byte(id)); err == nil {
					id = fmt.Sprintf("note_%d", time.Now().UnixNano())
				}
			}
			if n.CreatedAt.IsZero() {
				n.CreatedAt = time.Now()
			}
			if n.UpdatedAt.IsZero() {
				n.UpdatedAt = n.CreatedAt
			}
			n.ID = id
			data, _ := json.Marshal(n)
			if err := txn.Set([]byte(id), data); err != nil {
				return err
			}
			noteKeys[key] = struct{}{}
			sum.NotesInserted++
		}

		// YouTube
		for _, y := range in.Youtube {
			vid := y.VideoID
			if vid == "" {
				vid = extractYouTubeVideoID(y.URL)
			}
			if vid == "" {
				continue
			}
			if _, exists := ytIDs[vid]; exists {
				sum.YoutubeSkipped++
				continue
			}
			id := y.ID
			if id == "" {
				id = fmt.Sprintf("youtube_%d", time.Now().UnixNano())
			} else {
				if _, err := txn.Get([]byte(id)); err == nil {
					id = fmt.Sprintf("youtube_%d", time.Now().UnixNano())
				}
			}
			if y.CreatedAt.IsZero() {
				y.CreatedAt = time.Now()
			}
			if y.UpdatedAt.IsZero() {
				y.UpdatedAt = y.CreatedAt
			}
			y.ID = id
			y.VideoID = vid
			data, _ := json.Marshal(y)
			if err := txn.Set([]byte(id), data); err != nil {
				return err
			}
			ytIDs[vid] = struct{}{}
			sum.YoutubeInserted++
		}
		return nil
	})

	if err != nil {
		http.Error(w, "Failed to import data", http.StatusInternalServerError)
		return
	}

	// Rebuild tag counts to ensure consistency after bulk import
	// These helpers are private but available within this package.
	_ = (&BookmarkHandler{db: h.db}).rebuildTagCounts()
	_ = (&NoteHandler{db: h.db}).rebuildNoteTagCounts()
	_ = (&YoutubeHandler{db: h.db}).rebuildYoutubeTagCounts()

	resp := struct {
		Success bool          `json:"success"`
		Message string        `json:"message"`
		Summary ImportSummary `json:"summary"`
	}{
		Success: true,
		Message: "Import completed",
		Summary: sum,
	}

	_ = writeJSONResponse(w, http.StatusOK, resp)
}

// Ensure the http package keeps multipart imported even when not used directly in some builds
var _ = multipart.FileHeader{}
