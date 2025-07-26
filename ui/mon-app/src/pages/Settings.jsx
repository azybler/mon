import { useState, useEffect } from 'react'

function Settings() {
  const [aiConfig, setAiConfig] = useState({
    apiKey: '',
    model: 'deepseek/deepseek-chat-v3-0324:free',
    tagPrompt: 'Based on the title and URL provided, suggest 3-5 relevant tags for this bookmark. Return only the tags separated by commas, nothing else. Focus on categories like: technology, work, reference, tutorial, news, entertainment, development, design, etc.'
  })
  const [saved, setSaved] = useState(false)

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

  return (
    <div className="section-content">
      <h2>Settings</h2>
      
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
    </div>
  )
}

export default Settings
