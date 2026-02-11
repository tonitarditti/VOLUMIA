import React from 'react'
import { useJobStore } from '@/stores/JobStateType.1'
import { Activity, FileText } from 'lucide-react'
import '../styles/app.css'

export const StatusBar: React.FC = () => {
  const { jobState, logs } = useJobStore()

  const statusLabels = {
    idle: '⚙️ Ready',
    processing: '⏳ Processing',
    done: '✓ Done',
    error: '✗ Error',
  }

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-indicator">
          <Activity size={14} />
          {statusLabels[jobState]}
        </span>
      </div>

      <div className="status-center">
        {logs.length > 0 && (
          <button className="status-link" title="View logs">
            <FileText size={14} /> View Logs ({logs.length})
          </button>
        )}
      </div>

      <div className="status-right">
        <span className="engine-mode">Local Engine</span>
      </div>
    </div>
  )
}
