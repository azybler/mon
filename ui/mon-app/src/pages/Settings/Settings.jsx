import { useState, useEffect } from 'react'
import { useTheme } from 'contexts/ThemeContext'

function Settings() {
  const { theme, toggleTheme } = useTheme()
  // Tag aliases UI state
  const [tagType, setTagType] = useState('bookmark')
  const [availableTags, setAvailableTags] = useState([])
  const [aliasCanonical, setAliasCanonical] = useState('')
  const [aliasCandidates, setAliasCandidates] = useState('')
  const [aliasGroups, setAliasGroups] = useState({})
  const [loadingAliases, setLoadingAliases] = useState(false)
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

  // Load tags and alias groups when type changes
  useEffect(() => {
    const fetchData = async () => {
      setLoadingAliases(true)
      try {
        const tagURL = tagType === 'bookmark'
          ? 'http://localhost:8081/api/bookmark/tag/list'
          : tagType === 'note'
            ? 'http://localhost:8081/api/note/tag/list'
            : 'http://localhost:8081/api/youtube/tag/list'
        const [tagsRes, aliasRes] = await Promise.all([
          fetch(tagURL),
          fetch(`http://localhost:8081/api/tag-aliases?type=${tagType}`)
        ])
        const tagsJson = await tagsRes.json().catch(() => null)
        const aliasJson = await aliasRes.json().catch(() => null)
        if (tagsRes.ok && Array.isArray(tagsJson?.data)) {
          const tags = tagsJson.data.map(s => (s || '').split(',')[0]).filter(Boolean).sort()
          setAvailableTags(tags)
        } else {
          setAvailableTags([])
        }
        if (aliasRes.ok && aliasJson?.data) {
          setAliasGroups(aliasJson.data)
        } else {
          setAliasGroups({})
        }
      } catch (e) {
        console.error(e)
        setAvailableTags([])
        setAliasGroups({})
      } finally {
        setLoadingAliases(false)
      }
    }
    fetchData()
  }, [tagType])

  const createAliasGroup = async () => {
    const canonical = aliasCanonical.trim()
    const aliases = aliasCandidates.split(',').map(s => s.trim()).filter(Boolean)
    if (!canonical || aliases.length === 0) return alert('Enter canonical and at least one alias')
    try {
      const res = await fetch('http://localhost:8081/api/tag-aliases/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: tagType, canonical, aliases })
      })
      if (!res.ok) throw new Error('Failed to save aliases')
      setAliasCanonical('')
      setAliasCandidates('')
      const aliasRes = await fetch(`http://localhost:8081/api/tag-aliases?type=${tagType}`)
      const aliasJson = await aliasRes.json().catch(() => null)
      if (aliasRes.ok && aliasJson?.data) setAliasGroups(aliasJson.data)
    } catch (e) {
      console.error(e)
      alert('Failed to save aliases')
    }
  }

  const removeAlias = async (canonical, alias) => {
    try {
      const url = `http://localhost:8081/api/tag-aliases/delete?type=${encodeURIComponent(tagType)}&alias=${encodeURIComponent(alias)}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setAliasGroups(prev => {
        const next = { ...prev }
        next[canonical] = (next[canonical] || []).filter(a => a !== alias)
        if ((next[canonical] || []).length === 0) delete next[canonical]
        return next
      })
    } catch (e) {
      console.error(e)
      alert('Failed to remove alias')
    }
  }

  const removeGroup = async (canonical) => {
    try {
      const url = `http://localhost:8081/api/tag-aliases/group?type=${encodeURIComponent(tagType)}&canonical=${encodeURIComponent(canonical)}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setAliasGroups(prev => {
        const next = { ...prev }
        delete next[canonical]
        return next
      })
    } catch (e) {
      console.error(e)
      alert('Failed to remove group')
    }
  }

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
            <h3>Tag Groups (Combine Aliases)</h3>
            <p className="settings-description">Group multiple tags to act as one. Example: combine ai, a.i., artificialintelligence under artificial-intelligence. Reversible at any time.</p>

            <div className="settings-form">
              <div className="form-group" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <label>Type</label>
                <select value={tagType} onChange={e => setTagType(e.target.value)} className="settings-input" style={{ maxWidth: 220 }}>
                  <option value="bookmark">Bookmarks</option>
                  <option value="note">Notes</option>
                  <option value="youtube">YouTube</option>
                </select>
                {loadingAliases && <small>Loading…</small>}
              </div>

              <div className="form-group">
                <label>Canonical Tag</label>
                <input list="available-tags" className="settings-input" value={aliasCanonical} onChange={e => setAliasCanonical(e.target.value)} placeholder="e.g. artificial-intelligence" />
                <datalist id="available-tags">
                  {availableTags.map(t => <option key={t} value={t} />)}
                </datalist>
                <small>Pick the main tag to keep.</small>
              </div>

              <div className="form-group">
                <label>Aliases to Combine</label>
                <input className="settings-input" value={aliasCandidates} onChange={e => setAliasCandidates(e.target.value)} placeholder="Comma-separated list, e.g. ai, a.i, artificialintelligence" />
                <small>All listed tags will behave as the canonical tag.</small>
              </div>

              <div className="settings-actions">
                <button className="save-button" onClick={createAliasGroup}>Save Group</button>
              </div>

              <div style={{ marginTop: 12 }}>
                <strong>Existing Groups</strong>
                {Object.keys(aliasGroups).length === 0 && <div style={{ fontSize: 14, opacity: 0.8 }}>No groups yet.</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {Object.entries(aliasGroups).map(([canon, aliases]) => (
                    <div key={canon} style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 6, padding: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><strong>{canon}</strong></div>
                        <button className="reset-button" onClick={() => removeGroup(canon)}>Ungroup</button>
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {aliases.map(a => (
                          <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--chip-bg, #f4f4f4)', padding: '2px 8px', borderRadius: 999 }}>
                            {a}
                            <button onClick={() => removeAlias(canon, a)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }} aria-label={`remove ${a}`}>✕</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
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
