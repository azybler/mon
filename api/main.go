package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"mon-api/handlers"

	"github.com/dgraph-io/badger/v4"
)

// CORS middleware
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Call the next handler
		next(w, r)
	}
}

func main() {
	// Initialize BadgerDB
	dbPath := "./data/bookmarks"
	if err := os.MkdirAll(dbPath, 0755); err != nil {
		log.Fatal("Failed to create database directory:", err)
	}

	opts := badger.DefaultOptions(dbPath)
	opts.Logger = nil // Disable default logger to reduce noise

	db, err := badger.Open(opts)
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}
	defer db.Close()

	// Initialize handlers
	bookmarkHandler := handlers.NewBookmarkHandler(db)

	// Register API routes with CORS middleware
	http.HandleFunc("/api/create-bookmark", corsMiddleware(bookmarkHandler.NewBookmark))
	http.HandleFunc("/api/get-bookmarks", corsMiddleware(bookmarkHandler.GetBookmarks))
	http.HandleFunc("/api/get-tags", corsMiddleware(bookmarkHandler.GetTags))
	http.HandleFunc("/api/edit-bookmark/", corsMiddleware(bookmarkHandler.EditBookmark))
	http.HandleFunc("/api/delete-bookmark/", corsMiddleware(bookmarkHandler.DeleteBookmark))

	// Start the server
	port := ":8080"
	fmt.Printf("Server starting on port %s\n", port)
	fmt.Println("API Endpoints:")
	fmt.Println("  POST   /api/create-bookmark - Create a new bookmark")
	fmt.Println("  GET    /api/get-bookmarks - Get all bookmarks")
	fmt.Println("  GET    /api/get-tags - Get all unique tags")
	fmt.Println("  PUT    /api/edit-bookmark/{id} - Edit a bookmark")
	fmt.Println("  DELETE /api/delete-bookmark/{id} - Delete a bookmark")

	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
