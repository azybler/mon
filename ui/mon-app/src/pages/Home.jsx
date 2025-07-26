function Home() {
  return (
    <div className="welcome-section">
      <h1>Welcome to Mon</h1>
      <p>Your personal organization hub. Choose a section from the navigation above to get started.</p>
      <div className="quick-stats">
        <div className="stat-card">
          <h3>Bookmarks</h3>
          <p>0 saved</p>
        </div>
        <div className="stat-card">
          <h3>Todo Items</h3>
          <p>0 pending</p>
        </div>
        <div className="stat-card">
          <h3>Watch Lists</h3>
          <p>0 items</p>
        </div>
      </div>
    </div>
  )
}

export default Home
