package main

import (
	"compress/gzip"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"mon-api/handlers"

	"github.com/dgraph-io/badger/v4"
)

// Gzip sync pool for reusing gzip writers
var gzipWriterPool = sync.Pool{
	New: func() interface{} {
		// Use fastest compression level for best performance
		w, _ := gzip.NewWriterLevel(nil, gzip.BestSpeed)
		return w
	},
}

// Gzip compression middleware with sync pool
func gzipMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check if client accepts gzip encoding
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next(w, r)
			return
		}

		// Get gzip writer from pool
		gzw := gzipWriterPool.Get().(*gzip.Writer)
		defer func() {
			gzw.Close()
			gzw.Reset(nil)
			gzipWriterPool.Put(gzw)
		}()

		// Reset and configure the writer for this response
		gzw.Reset(w)

		// Set response headers
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Vary", "Accept-Encoding")

		// Create a wrapper that implements http.ResponseWriter
		gzipResponseWriter := &gzipResponseWriterWrapper{
			ResponseWriter: w,
			gzipWriter:     gzw,
		}

		// Call the next handler with the gzip wrapper
		next(gzipResponseWriter, r)
	}
}

// gzipResponseWriterWrapper wraps http.ResponseWriter to compress response
type gzipResponseWriterWrapper struct {
	http.ResponseWriter
	gzipWriter *gzip.Writer
}

func (w *gzipResponseWriterWrapper) Write(data []byte) (int, error) {
	return w.gzipWriter.Write(data)
}

func (w *gzipResponseWriterWrapper) WriteHeader(statusCode int) {
	w.ResponseWriter.WriteHeader(statusCode)
}

// CORS middleware with gzip compression
func corsGzipMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return gzipMiddleware(corsMiddleware(next))
}

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

// Static file handler that serves the React app with gzip compression and cache headers
func staticFileHandler(distDir string) http.HandlerFunc {
	return gzipMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Remove /static prefix if present
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// Set cache headers based on file type
		setCacheHeaders(w, path)

		// Build the full file path
		fullPath := filepath.Join(distDir, path)

		// Check if file exists
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			// If file doesn't exist, serve index.html for SPA routing
			fullPath = filepath.Join(distDir, "index.html")
			// Reset cache headers for index.html fallback (SPA routing)
			w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		}

		// Serve the file
		http.ServeFile(w, r, fullPath)
	})
}

// setCacheHeaders sets appropriate cache headers based on file type and naming
func setCacheHeaders(w http.ResponseWriter, path string) {
	// Check if this is a hashed asset (contains hash in filename)
	isHashedAsset := strings.Contains(path, "index-") || strings.Contains(path, "vendor-") || strings.Contains(path, "main-")

	if strings.HasPrefix(path, "assets/") && (strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".css")) && isHashedAsset {
		// Long cache for hashed assets (1 year)
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("Expires", "Thu, 31 Dec 2025 23:59:59 GMT")
	} else if strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".css") || strings.HasSuffix(path, ".png") || strings.HasSuffix(path, ".jpg") || strings.HasSuffix(path, ".jpeg") || strings.HasSuffix(path, ".gif") || strings.HasSuffix(path, ".svg") || strings.HasSuffix(path, ".ico") || strings.HasSuffix(path, ".woff") || strings.HasSuffix(path, ".woff2") {
		// Medium cache for other static assets (1 week)
		w.Header().Set("Cache-Control", "public, max-age=604800")
	} else if path == "index.html" || path == "" {
		// No cache for HTML files (for SPA routing)
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
	} else {
		// Default short cache for other files
		w.Header().Set("Cache-Control", "public, max-age=3600")
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
	noteHandler := handlers.NewNoteHandler(db)

	// Register API routes with CORS and gzip middleware
	http.HandleFunc("/api/bookmark/create", corsGzipMiddleware(bookmarkHandler.NewBookmark))
	http.HandleFunc("/api/bookmark/list", corsGzipMiddleware(bookmarkHandler.GetBookmarks))
	http.HandleFunc("/api/bookmark/tag/list", corsGzipMiddleware(bookmarkHandler.GetBookmarkTags))
	http.HandleFunc("/api/bookmark/edit/", corsGzipMiddleware(bookmarkHandler.EditBookmark))
	http.HandleFunc("/api/bookmark/delete/", corsGzipMiddleware(bookmarkHandler.DeleteBookmark))

	// Register note API routes with CORS and gzip middleware
	http.HandleFunc("/api/note/create", corsGzipMiddleware(noteHandler.NewNote))
	http.HandleFunc("/api/note/list", corsGzipMiddleware(noteHandler.GetNotes))
	http.HandleFunc("/api/note/tag/list", corsGzipMiddleware(noteHandler.GetNoteTags))
	http.HandleFunc("/api/note/edit/", corsGzipMiddleware(noteHandler.EditNote))
	http.HandleFunc("/api/note/delete/", corsGzipMiddleware(noteHandler.DeleteNote))

	// Serve robots.txt to deny all crawlers
	http.HandleFunc("/robots.txt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Cache-Control", "public, max-age=86400") // Cache for 1 day
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "User-agent: *\nDisallow: /\n")
	})

	// Serve static files from the React build
	distDir := "./dist"
	if _, err := os.Stat(distDir); err == nil {
		// Serve static assets with gzip compression and cache headers
		assetsHandler := http.StripPrefix("/assets/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Set cache headers for assets
			setCacheHeaders(w, "assets/"+r.URL.Path)
			// Serve the file
			http.FileServer(http.Dir(filepath.Join(distDir, "assets"))).ServeHTTP(w, r)
		}))
		http.Handle("/assets/", gzipMiddleware(assetsHandler.ServeHTTP))

		// Serve the React app for all non-API routes
		http.HandleFunc("/", staticFileHandler(distDir))
		fmt.Println("📱 Serving React app from ./dist with gzip compression and cache optimization")
	} else {
		fmt.Println("⚠️  React build not found. Run the build script first.")
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprintf(w, "React app not built. Please run the build script first.")
		})
	}

	// Start the server
	port := ":8080"
	fmt.Printf("🚀 Server starting on port %s\n", port)
	fmt.Printf("🌐 App available at: http://localhost%s\n", port)

	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
