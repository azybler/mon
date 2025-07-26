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
          <h2>Todo Items</h2>
          <p>0 pending</p>
        </div>
        <div className="stat-card">
          <h2>Watch Lists</h2>
          <p>0 items</p>
        </div>
      </div>
    </div>
  )
}

export default Home
