package handlers

import (
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"

	"github.com/dgraph-io/badger/v4"
)

// TagAliasHandler manages alias mappings for tags across entities
type TagAliasHandler struct {
	db *badger.DB
}

func NewTagAliasHandler(db *badger.DB) *TagAliasHandler {
	return &TagAliasHandler{db: db}
}

// storage keys per type
func aliasKeyForType(t string) (string, error) {
	switch t {
	case "bookmark", "bookmarks":
		return "bookmark_tag_aliases", nil
	case "note", "notes":
		return "note_tag_aliases", nil
	case "youtube":
		return "youtube_tag_aliases", nil
	default:
		return "", fmt.Errorf("invalid type: %s", t)
	}
}

// getAliasMap loads alias->canonical mapping
func (h *TagAliasHandler) getAliasMap(txn *badger.Txn, t string) (map[string]string, error) {
	key, err := aliasKeyForType(t)
	if err != nil {
		return nil, err
	}
	aliases := make(map[string]string)
	item, err := txn.Get([]byte(key))
	if err == badger.ErrKeyNotFound {
		return aliases, nil
	}
	if err != nil {
		return nil, err
	}
	if err := item.Value(func(val []byte) error { return json.Unmarshal(val, &aliases) }); err != nil {
		return nil, err
	}
	return aliases, nil
}

// setAliasMap saves alias->canonical mapping
func (h *TagAliasHandler) setAliasMap(txn *badger.Txn, t string, m map[string]string) error {
	key, err := aliasKeyForType(t)
	if err != nil {
		return err
	}
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return txn.Set([]byte(key), b)
}

// normalizeTags maps any aliases to their canonical tag and de-duplicates.
func normalizeTags(tags []string, aliases map[string]string) []string {
	if len(tags) == 0 {
		return tags
	}
	out := make([]string, 0, len(tags))
	seen := make(map[string]bool)
	for _, t := range tags {
		if t == "" {
			continue
		}
		canon := aliases[t]
		if canon == "" {
			canon = t
		}
		if !seen[canon] {
			seen[canon] = true
			out = append(out, canon)
		}
	}
	return out
}

// normalizeExpression replaces alias words with canonical in an expression.
func normalizeExpression(expr string, aliases map[string]string) string {
	if strings.TrimSpace(expr) == "" || len(aliases) == 0 {
		return expr
	}
	wordRegex := regexp.MustCompile(`\b[a-zA-Z0-9_-]+\b`)
	return wordRegex.ReplaceAllStringFunc(expr, func(word string) string {
		// Preserve original casing when replacing exact alias
		if canon, ok := aliases[word]; ok && canon != "" {
			return canon
		}
		return word
	})
}

// group view structure for UI
type TagAliasGroupsResponse struct {
	Success bool                `json:"success"`
	Message string              `json:"message"`
	Data    map[string][]string `json:"data,omitempty"` // canonical -> aliases
	Count   int                 `json:"count"`
}

// GET /api/tag-aliases?type=bookmark|note|youtube
func (h *TagAliasHandler) GetAliases(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	t := r.URL.Query().Get("type")
	if t == "" {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{
			"success": false,
			"message": "type is required",
		})
		return
	}
	var groups map[string][]string
	err := h.db.View(func(txn *badger.Txn) error {
		aliases, err := h.getAliasMap(txn, t)
		if err != nil {
			return err
		}
		groups = make(map[string][]string)
		for alias, canon := range aliases {
			if alias == canon || alias == "" || canon == "" {
				continue
			}
			groups[canon] = append(groups[canon], alias)
		}
		// sort aliases for stable UI
		for k := range groups {
			sort.Strings(groups[k])
		}
		return nil
	})
	if err != nil {
		writeJSONResponse(w, http.StatusInternalServerError, TagAliasGroupsResponse{Success: false, Message: "Error reading aliases", Data: map[string][]string{}, Count: 0})
		return
	}
	if groups == nil {
		groups = map[string][]string{}
	}
	writeJSONResponse(w, http.StatusOK, TagAliasGroupsResponse{Success: true, Message: "Aliases retrieved", Data: groups, Count: len(groups)})
}

type setAliasBatchRequest struct {
	Type      string   `json:"type"`
	Canonical string   `json:"canonical"`
	Aliases   []string `json:"aliases"`
}

// POST /api/tag-aliases/batch {type, canonical, aliases[]}
func (h *TagAliasHandler) SetAliasesBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	var req setAliasBatchRequest
	if err := readJSONRequest(r, &req); err != nil {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{"success": false, "message": "Invalid JSON"})
		return
	}
	if req.Type == "" || req.Canonical == "" || len(req.Aliases) == 0 {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{"success": false, "message": "type, canonical, and aliases are required"})
		return
	}
	err := h.db.Update(func(txn *badger.Txn) error {
		m, err := h.getAliasMap(txn, req.Type)
		if err != nil {
			return err
		}
		for _, a := range req.Aliases {
			a = strings.TrimSpace(a)
			if a == "" || a == req.Canonical {
				continue
			}
			m[a] = req.Canonical
		}
		return h.setAliasMap(txn, req.Type, m)
	})
	if err != nil {
		writeJSONResponse(w, http.StatusInternalServerError, map[string]interface{}{"success": false, "message": "Failed to save aliases"})
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Aliases saved"})
}

// DELETE /api/tag-aliases?type=...&alias=... to remove one alias
// or DELETE /api/tag-aliases/group?type=...&canonical=... to remove all aliases pointing to canonical
func (h *TagAliasHandler) DeleteAlias(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	path := r.URL.Path
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	t := q.Get("type")
	if t == "" {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{"success": false, "message": "type is required"})
		return
	}
	err := h.db.Update(func(txn *badger.Txn) error {
		m, err := h.getAliasMap(txn, t)
		if err != nil {
			return err
		}
		if strings.HasSuffix(path, "/group") {
			canonical := q.Get("canonical")
			if canonical == "" {
				return fmt.Errorf("canonical is required")
			}
			// remove all aliases that map to this canonical
			for k, v := range m {
				if v == canonical {
					delete(m, k)
				}
			}
		} else {
			alias := q.Get("alias")
			if alias == "" {
				return fmt.Errorf("alias is required")
			}
			delete(m, alias)
		}
		return h.setAliasMap(txn, t, m)
	})
	if err != nil {
		writeJSONResponse(w, http.StatusBadRequest, map[string]interface{}{"success": false, "message": err.Error()})
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Alias removed"})
}
