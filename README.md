# Mon

A self-hosted web application to organize your life. Mon provides a clean, modern interface for managing bookmarks, notes, and more to come - all from one central dashboard.

## Features

- 📖 **Bookmark Management** - Save and organize your favorite websites with tags
- 📝 **Note Management** - Create and organize notes with tags and descriptions
- 🌙 **Theme Support** - Light and dark mode options
- 🔒 **Self-Hosted** - Keep your data private and under your control
- ⚡ **Fast & Lightweight** - Built with Go backend and React frontend

## Tech Stack

- **Backend**: Go with BadgerDB for data persistence
- **Frontend**: React with Vite for fast development and building
- **Compression**: Gzip compression for optimal performance
- **Storage**: Embedded BadgerDB - no external database required

## Quick Start

### Prerequisites

- Go 1.19 or later
- Node.js 18 or later
- npm or yarn

### Building and Running

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd mon
   ```

2. **Build the application**
   ```bash
   ./build.sh
   ```
   This will:
   - Install npm dependencies
   - Build the React frontend
   - Build the Go backend
   - Copy frontend assets to the backend

3. **Run the application**
   ```bash
   cd api
   ./mon-api
   ```

4. **Access the app**
   Open your browser and go to `http://localhost:8080`

### Development Mode

For active development with hot reloading:

```bash
./dev.sh dev
```

This will start both the backend and frontend development servers:
- Backend API: `http://localhost:8080`
- Frontend (with hot reload): `http://localhost:5173`

To stop the development servers, press `Ctrl+C`.

### Alternative Development Setup

You can also run the servers separately:

1. **Start the backend**
   ```bash
   cd api
   go build -o mon-api .
   ./mon-api
   ```

2. **Start the frontend (in another terminal)**
   ```bash
   cd ui/mon-app
   npm install
   npm run dev
   ```

## Project Structure

```
mon/
├── api/                    # Go backend
│   ├── main.go            # Main server file
│   ├── handlers/          # API handlers
│   ├── data/              # BadgerDB data files
│   └── dist/              # Built frontend (auto-generated)
├── ui/mon-app/            # React frontend
│   ├── src/               # Source files
│   ├── public/            # Static assets
│   └── dist/              # Built files (auto-generated)
├── build.sh               # Production build script
└── dev.sh                 # Development script
```

## API Endpoints

The application provides RESTful APIs for managing your data:

### Bookmark API
- `POST /api/bookmark/create` - Create a new bookmark
- `GET /api/bookmark/list` - Retrieve all bookmarks (supports filtering by tags, keywords)
- `GET /api/bookmark/tag/list` - Get all unique bookmark tags with counts
- `PUT /api/bookmark/edit/{id}` - Update a bookmark
- `DELETE /api/bookmark/delete/{id}` - Delete a bookmark

### Notes API
- `POST /api/note/create` - Create a new note
- `GET /api/note/list` - Retrieve all notes (supports filtering by tags, keywords)
- `GET /api/note/tag/list` - Get all unique note tags with counts
- `PUT /api/note/edit/{id}` - Update a note
- `DELETE /api/note/delete/{id}` - Delete a note

For detailed API documentation, see [api/README.md](api/README.md).

## Data Storage

Mon uses BadgerDB, an embedded key-value database written in Go. Your data is stored locally in the `api/data/` directory. No external database setup is required.

## Configuration

The application runs on port 8080 by default. To change this, modify the `port` variable in `api/main.go`.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source. Please see the LICENSE file for details.

## Support

If you encounter any issues or have questions, please open an issue on the repository.
