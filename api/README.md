# Mon API

This is the backend API for the Mon organizational web app.

## Endpoints

### POST /api/create-bookmark

Creates a new bookmark.

**Request Body:**
```json
{
  "title": "Example Website",
  "url": "https://example.com",
  "tags": ["work", "reference"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bookmark created successfully",
  "data": {
    "id": "bookmark_1234567890",
    "title": "Example Website",
    "url": "https://example.com",
    "tags": ["work", "reference"],
    "created_at": "2025-07-26T10:30:00Z",
    "updated_at": "2025-07-26T10:30:00Z"
  }
}
```

### GET /api/get-bookmarks

Retrieves all bookmarks.

**Response:**
```json
{
  "success": true,
  "message": "Bookmarks retrieved successfully",
  "count": 2,
  "data": [
    {
      "id": "bookmark_1234567890",
      "title": "Example Website",
      "url": "https://example.com",
      "tags": ["work", "reference"],
      "created_at": "2025-07-26T10:30:00Z",
      "updated_at": "2025-07-26T10:30:00Z"
    },
    {
      "id": "bookmark_1234567891",
      "title": "GitHub",
      "url": "https://github.com",
      "tags": ["development", "code"],
      "created_at": "2025-07-26T10:31:00Z",
      "updated_at": "2025-07-26T10:31:00Z"
    }
  ]
}
```

### PUT /api/edit-bookmark/{id}

Updates an existing bookmark by ID.

**Request Body:**
```json
{
  "title": "Updated Website Title",
  "url": "https://updated-example.com",
  "tags": ["updated", "tags"]
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Bookmark updated successfully",
  "data": {
    "id": "bookmark_1234567890",
    "title": "Updated Website Title",
    "url": "https://updated-example.com",
    "tags": ["updated", "tags"],
    "created_at": "2025-07-26T10:30:00Z",
    "updated_at": "2025-07-26T10:35:00Z"
  }
}
```

**Response (Not Found):**
```json
{
  "success": false,
  "message": "Bookmark not found"
}
```

### DELETE /api/delete-bookmark/{id}

Deletes a bookmark by ID.

**Response (Success):**
```json
{
  "success": true,
  "message": "Bookmark deleted successfully"
}
```

**Response (Not Found):**
```json
{
  "success": false,
  "message": "Bookmark not found"
}
```

## Running the Server

```bash
go run main.go
```

The server will start on port 8080.

## Testing the API

You can test the bookmark creation endpoint using curl:

```bash
curl -X POST http://localhost:8080/api/create-bookmark \
  -H "Content-Type: application/json" \
  -d '{
    "title": "GitHub",
    "url": "https://github.com",
    "tags": ["development", "code", "git"]
  }'
```

You can get all bookmarks using:

```bash
curl -X GET http://localhost:8080/api/get-bookmarks
```

You can edit a bookmark using its ID:

```bash
curl -X PUT http://localhost:8080/api/edit-bookmark/bookmark_1234567890 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated GitHub",
    "url": "https://github.com",
    "tags": ["development", "code", "git", "updated"]
  }'
```

You can delete a bookmark using its ID:

```bash
curl -X DELETE http://localhost:8080/api/delete-bookmark/bookmark_1234567890
```

## Database

The application uses BadgerDB for data persistence. Database files are stored in `./data/bookmarks/`.
