import React from 'react'
import { useJobStore } from '@/stores/JobStateType.1'
import '../styles/app.css'

export const MainStage: React.FC = () => {
  const { jobState, stageMessage, progress } = useJobStore()

  if (jobState === 'idle') {
    return (
      <div className="main-stage empty-state">
        <div className="empty-content">
          <h2>Ready to Generate</h2>
          <p>Select an image and configure options to get started.</p>
        </div>
      </div>
    )
  }

  if (jobState === 'processing') {
    return (
      <div className="main-stage processing-state">
        <div className="processing-content">
          <h2>Processing</h2>
          <p className="stage-message">{stageMessage}</p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }}></div>
          </div>
          <p className="progress-text">{Math.round(progress * 100)}%</p>
        </div>
      </div>
    )
  }

  if (jobState === 'done') {
    return (
      <div className="main-stage result-state">
        <div className="result-content">
          <h2>✓ Success</h2>
          <p>Your model has been generated successfully.</p>
          <p className="stage-message">{stageMessage}</p>
        </div>
      </div>
    )
  }

  if (jobState === 'error') {
    return (
      <div className="main-stage error-state">
        <div className="error-content">
          <h2>✗ Error</h2>
          <p className="error-message">{stageMessage}</p>
        </div>
      </div>
    )
  }

  return <div className="main-stage empty-state"></div>
}
