import { create } from 'zustand'

type Theme = 'light' | 'dark'
type Preset = 'furniture' | 'interior' | 'architecture'
type DetailLevel = 'low' | 'medium' | 'high'

interface SettingsStore {
  units: 'cm' | 'm'
  theme: Theme
  preset: Preset
  detail: DetailLevel
  outputObj: boolean
  outputGlb: boolean
  textures: boolean
  engineMode: 'local' | 'server'

  // Actions
  setUnits: (units: 'cm' | 'm') => void
  toggleTheme: () => void
  setPreset: (preset: Preset) => void
  setDetail: (detail: DetailLevel) => void
  toggleOutputObj: () => void
  toggleOutputGlb: () => void
  toggleTextures: () => void
  setEngineMode: (mode: 'local' | 'server') => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  units: 'cm',
  theme: 'light',
  preset: 'interior',
  detail: 'medium',
  outputObj: true,
  outputGlb: false,
  textures: true,
  engineMode: 'local',

  setUnits: (units) => set({ units }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  setPreset: (preset) => set({ preset }),
  setDetail: (detail) => set({ detail }),
  toggleOutputObj: () => set((state) => ({ outputObj: !state.outputObj })),
  toggleOutputGlb: () => set((state) => ({ outputGlb: !state.outputGlb })),
  toggleTextures: () => set((state) => ({ textures: !state.textures })),
  setEngineMode: (mode) => set({ engineMode: mode }),
}))
