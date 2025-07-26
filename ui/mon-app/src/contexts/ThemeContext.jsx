import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('light') // Default to light mode

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('mon-theme')
    if (savedTheme) {
      setTheme(savedTheme)
    }
  }, [])

  // Update document class and localStorage when theme changes
  useEffect(() => {
    document.documentElement.className = theme
    localStorage.setItem('mon-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
