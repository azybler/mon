import { useState, useEffect } from 'react'
import { useTheme } from 'contexts/ThemeContext'

function Settings() {
  const { theme, toggleTheme } = useTheme()
  const [aiConfig, setAiConfig] = useState({
    apiKey: '',
    model: 'deepseek/deepseek-chat-v3-0324:free',
    tagPrompt: 'Based on the title and URL provided, suggest 3-5 relevant tags for this bookmark. Return only the tags separated by commas, tag should not have symbols or spaces and be delimited by dash (-). Don\'t use acronyms. Focus on categories like: artificial-intelligence, large-language-model, open-source, programming, technology, work, reference, tutorial, news, entertainment, development, design, etc.'
  })
  const [saved, setSaved] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState(null)

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('mon-ai-config')
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig)
        setAiConfig(prev => ({ ...prev, ...parsed }))
      } catch (err) {
        console.error('Error parsing saved AI config:', err)
      }
    }
  }, [])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setAiConfig(prev => ({
      ...prev,
      [name]: value
    }))
    setSaved(false)
  }

  const saveSettings = () => {
    try {
      localStorage.setItem('mon-ai-config', JSON.stringify(aiConfig))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Error saving AI config:', err)
      alert('Error saving settings')
    }
  }

  const resetToDefaults = () => {
    setAiConfig({
      apiKey: '',
      model: 'anthropic/claude-3.5-sonnet',
      tagPrompt: 'Based on the title and URL provided, suggest 3-5 relevant tags for this bookmark. Return only the tags separated by commas, nothing else. Focus on categories like: technology, work, reference, tutorial, news, entertainment, development, design, etc.'
    })
    setSaved(false)
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      const res = await fetch('http://localhost:8081/api/export/')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="?([^";]+)"?/)
      const filename = match ? match[1] : `mon-export-${Date.now()}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (file) => {
    if (!file) return
    try {
      setImporting(true)
      setImportSummary(null)
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('http://localhost:8081/api/import/', {
        method: 'POST',
        body: form
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.message || 'Import failed')
      setImportSummary(data?.summary || null)
      alert('Import completed')
    } catch (e) {
      console.error(e)
      alert(e.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="section-content">
      <h2>Settings</h2>

      <div className="settings-section">
        <h3>Appearance</h3>
        <p className="settings-description">
          Customize the appearance of the application.
        </p>

        <div className="settings-form">
          <div className="form-group">
            <label htmlFor="theme">Theme</label>
            <div className="theme-toggle-container">
              <button
                type="button"
                className="theme-toggle-button"
                onClick={toggleTheme}
              >
                <span className="theme-icon">
                  {theme === 'light' ? '🌙' : '☀️'}
                </span>
                <span className="theme-text">
                  {theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                </span>
              </button>
            </div>
            <small>
              Current theme: {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
            </small>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>AI Tag Suggestions</h3>
        <p className="settings-description">
          Configure AI-powered tag suggestions for bookmarks using OpenRouter API.
        </p>

        <div className="settings-form">
          <div className="form-group">
            <label htmlFor="apiKey">OpenRouter API Key</label>
            <input
              type="password"
              id="apiKey"
              name="apiKey"
              value={aiConfig.apiKey}
              onChange={handleInputChange}
              placeholder="sk-or-v1-..."
              className="settings-input"
            />
            <small>
              Get your API key from{' '}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
                OpenRouter
              </a>
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="model">Model</label>
            <select
              id="model"
              name="model"
              value={aiConfig.model}
              onChange={handleInputChange}
              className="settings-input"
            >
              <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="anthropic/claude-3-haiku">Claude 3 Haiku (faster/cheaper)</option>
              <option value="openai/gpt-4o">GPT-4o</option>
              <option value="deepseek/deepseek-chat-v3-0324:free">DeepSeek Chat V3 (free)</option>
              <option value="openai/gpt-4o-mini">GPT-4o Mini (faster/cheaper)</option>
              <option value="meta-llama/llama-3.1-8b-instruct:free">Llama 3.1 8B (free)</option>
              <option value="microsoft/wizardlm-2-8x22b">WizardLM 2 8x22B</option>
            </select>
            <small>Choose the AI model for tag suggestions</small>
          </div>

          <div className="form-group">
            <label htmlFor="tagPrompt">Tag Generation Prompt</label>
            <textarea
              id="tagPrompt"
              name="tagPrompt"
              value={aiConfig.tagPrompt}
              onChange={handleInputChange}
              rows="4"
              className="settings-textarea"
              placeholder="Enter the prompt for AI tag generation..."
            />
            <small>Customize how the AI generates tags for your bookmarks</small>
          </div>

          <div className="settings-actions">
            <button
              className="reset-button"
              onClick={resetToDefaults}
            >
              Reset to Defaults
            </button>
            <button
              className="save-button"
              onClick={saveSettings}
            >
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Import / Export</h3>
        <p className="settings-description">Export all data to a JSON file or import from a previous export.</p>
        <div className="settings-form">
          <div className="settings-actions" style={{ gap: '12px', display: 'flex', alignItems: 'center' }}>
            <button className="save-button" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export All Data'}
            </button>
            <label className="reset-button" style={{ margin: 0 }}>
              {importing ? 'Importing…' : 'Import from File'}
              <input type="file" accept="application/json,.json" style={{ display: 'none' }}
                     onChange={(e) => handleImport(e.target.files?.[0])} />
            </label>
          </div>
          {importSummary && (
            <div style={{ marginTop: 8, fontSize: 14 }}>
              <div>Bookmarks: +{importSummary.bookmarks_inserted} (skipped {importSummary.bookmarks_skipped})</div>
              <div>Notes: +{importSummary.notes_inserted} (skipped {importSummary.notes_skipped})</div>
              <div>YouTube: +{importSummary.youtube_inserted} (skipped {importSummary.youtube_skipped})</div>
            </div>
          )}
          <small>Duplicates are automatically skipped based on URL (bookmarks), title+description (notes), and video ID (YouTube).</small>
        </div>
      </div>
    </div>
  )
}

export default Settings
