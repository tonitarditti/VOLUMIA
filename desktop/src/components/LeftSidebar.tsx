import React, { useState } from 'react'
import { useSettingsStore } from '../stores/settings.store'
import { useJobStore } from '@/stores/JobStateType.1'
import { ChevronDown, ChevronUp } from 'lucide-react'
import '../styles/app.css'

export const LeftSidebar: React.FC = () => {
  const { preset, detail, setPreset, setDetail, toggleOutputObj, toggleOutputGlb, toggleTextures } =
    useSettingsStore()
  const { submitJob, jobState } = useJobStore()

  const [expandedOptions, setExpandedOptions] = useState(false)
  const [selectedImages, setSelectedImages] = useState<File[]>([])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedImages(Array.from(e.target.files))
    }
  }

  const handleGenerate = async () => {
    if (selectedImages.length === 0) {
      alert('Please select at least one image')
      return
    }
    await submitJob(selectedImages)
  }

  return (
    <div className="left-sidebar">
      {/* Image Section */}
      <div className="sidebar-section">
        <h3>Image</h3>
        <div className="dropzone">
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageUpload}
            className="file-input"
          />
          <div className="dropzone-content">
            <p>Drag images here or click to select</p>
          </div>
        </div>
        {selectedImages.length > 0 && (
          <div className="image-tray">
            {selectedImages.map((img, i) => (
              <div key={i} className="image-thumb">
                {img.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preset Section */}
      <div className="sidebar-section">
        <h3>Preset</h3>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className="select">
          <option value="furniture">Furniture</option>
          <option value="interior">Interior</option>
          <option value="architecture">Architecture</option>
        </select>
      </div>

      {/* Options Section */}
      <div className="sidebar-section">
        <button
          className="section-toggle"
          onClick={() => setExpandedOptions(!expandedOptions)}
        >
          Options
          {expandedOptions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {expandedOptions && (
          <div className="options-content">
            <div className="option-group">
              <label>Detail Level</label>
              <select value={detail} onChange={(e) => setDetail(e.target.value)} className="select">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="option-group">
              <label className="checkbox-label">
                <input type="checkbox" defaultChecked onChange={() => toggleOutputObj()} />
                Export OBJ
              </label>
            </div>

            <div className="option-group">
              <label className="checkbox-label">
                <input type="checkbox" onChange={() => toggleOutputGlb()} />
                Export GLB
              </label>
            </div>

            <div className="option-group">
              <label className="checkbox-label">
                <input type="checkbox" defaultChecked onChange={() => toggleTextures()} />
                Include Textures
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Generate Button */}
      <div className="sidebar-section">
        <button className="btn-primary" onClick={handleGenerate} disabled={jobState === 'processing'}>
          {jobState === 'processing' ? 'Generating...' : 'Generate Editable Model'}
        </button>
      </div>

      {/* Export Section */}
      <div className="sidebar-section">
        <h3>Export</h3>
        <div className="export-buttons">
          <button className="btn-secondary" disabled={jobState !== 'done'}>
            Download OBJ
          </button>
          <button className="btn-secondary" disabled={jobState !== 'done'}>
            Download GLB
          </button>
          <button className="btn-secondary" disabled={jobState !== 'done'}>
            Open Folder
          </button>
        </div>
      </div>
    </div>
  )
}
