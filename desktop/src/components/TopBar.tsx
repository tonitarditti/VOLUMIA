import React from 'react'
import { useSettingsStore } from '../stores/settings.store'
import { SettingsIcon, SunIcon, MoonIcon } from 'lucide-react'
import '../styles/app.css'

export const TopBar: React.FC = () => {
  const { theme, toggleTheme } = useSettingsStore()

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <h1 className="brand-title">VOLUMIA</h1>
        <p className="brand-tagline">Your Creative 3D Assistant</p>
      </div>

      <div className="top-bar-center">
        <div className="units-control">
          <label>Units</label>
          <select className="units-select">
            <option>cm</option>
            <option>m</option>
          </select>
        </div>
      </div>

      <div className="top-bar-right">
        <button
          className="icon-button"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <MoonIcon size={20} /> : <SunIcon size={20} />}
        </button>
        <button className="icon-button" title="Settings">
          <SettingsIcon size={20} />
        </button>
      </div>
    </div>
  )
}
