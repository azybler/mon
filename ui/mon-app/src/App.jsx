import { useState, useEffect } from 'react'
import './App.css'
import Home from 'pages/Home/Home'
import Bookmarks from 'pages/Bookmarks/Bookmarks'
import Notes from 'pages/Notes/Notes'
import Settings from 'pages/Settings/Settings'
import NotFound from 'pages/NotFound/NotFound'

function App() {
  const [activeSection, setActiveSection] = useState('home')

  const navigationItems = [
    { id: 'home', label: 'Home', path: '/' },
    { id: 'bookmarks', label: 'Bookmarks', path: '/bookmarks' },
    { id: 'notes', label: 'Notes', path: '/notes' },
    { id: 'settings', label: 'Settings', path: '/settings' }
  ]

  // Get section ID from pathname
  const getSectionFromPath = (pathname) => {
    const item = navigationItems.find(item => item.path === pathname)
    return item ? item.id : 'home'
  }

  // Set initial section based on current URL
  useEffect(() => {
    const currentSection = getSectionFromPath(window.location.pathname)
    setActiveSection(currentSection)
  }, [])

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const currentSection = getSectionFromPath(window.location.pathname)
      setActiveSection(currentSection)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Update document title when section changes
  useEffect(() => {
    const item = navigationItems.find(item => item.id === activeSection)
    const title = item ? `${item.label} - mon` : 'mon'
    document.title = title
  }, [activeSection])

  const handleLogoClick = () => {
    const path = '/'
    window.history.pushState(null, '', path)
    setActiveSection('home')
  }

  const handleNavClick = (sectionId) => {
    const item = navigationItems.find(item => item.id === sectionId)
    const path = item ? item.path : '/'
    window.history.pushState(null, '', path)
    setActiveSection(sectionId)
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'home':
        return <Home />
      case 'bookmarks':
        return <Bookmarks />
      case 'notes':
        return <Notes />
      case 'settings':
        return <Settings />
      default:
        return <NotFound />
    }
  }

  return (
    <div className="app">
      {/* Header with logo and navigation */}
      <header className="app-header">
        <div className="header-content">
          {/* Logo */}
          <div className="logo-container" onClick={handleLogoClick}>
            <h1 className="logo">mon</h1>
          </div>
          
          {/* Primary Navigation */}
          <nav className="primary-nav">
            <ul className="nav-list">
              {navigationItems.map((item) => (
                <li key={item.id} className="nav-item">
                  <button
                    className={`nav-button ${activeSection === item.id ? 'active' : ''}`}
                    onClick={() => handleNavClick(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      {/* Main content area */}
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  )
}

export default App
