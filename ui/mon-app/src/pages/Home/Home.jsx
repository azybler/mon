function Home() {
  return (
    <div className="welcome-section">
      <h1>Welcome to Mon</h1>
      <p>Your personal organization hub. Choose a section from the navigation above to get started.</p>
      <div className="quick-stats">
        <div className="stat-card">
          <h2>Bookmarks</h2>
          <p>0 saved</p>
        </div>
        <div className="stat-card">
          <h2>YouTube Watchlist</h2>
          <p>0 videos</p>
        </div>
        <div className="stat-card">
          <h2>Notes</h2>
          <p>0 notes</p>
        </div>
      </div>
    </div>
  )
}

export default Home
