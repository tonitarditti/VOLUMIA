import React, { useEffect } from 'react'
import { useSettingsStore } from './stores/settings.store'
import { TopBar } from './components/TopBar'
import { LeftSidebar } from './components/LeftSidebar'
import { MainStage } from './components/MainStage'
import { StatusBar } from './components/StatusBar'
import './styles/app.css'

function App() {
  const { theme } = useSettingsStore()

  useEffect(() => {
    // Apply theme to document
    document.documentElement.style.colorScheme = theme
    if (theme === 'dark') {
      document.body.classList.add('dark')
    } else {
      document.body.classList.remove('dark')
    }
  }, [theme])

  return (
    <div className="app">
      <TopBar />
      <div className="app-container">
        <LeftSidebar />
        <MainStage />
      </div>
      <StatusBar />
    </div>
  )
}

export default App
