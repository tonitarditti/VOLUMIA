# VOLUMIA Objects Studio (MVP)

VOLUMIA is a desktop-first MVP for interior designers and architects.
It ships a complete local stub flow:

1. New Capture (images + setup)
2. Processing
3. Review & Export (3D viewport + structure + materials + SketchUp package)

The app is built as a monorepo with Electron + React + TypeScript for desktop and FastAPI for the local service.

## Monorepo Structure

```text
volumia/
  apps/
    desktop/          # Electron + React + Vite renderer
    service/          # FastAPI local stub service
  packages/
    shared/           # Shared TS DTOs, presets, materials schema
  .env.example
  package.json
  pnpm-workspace.yaml
```

## Tech Stack

- Desktop: Electron, React, TypeScript, Vite
- Viewport: Three.js via `@react-three/fiber` + `@react-three/drei`
- State: Zustand
- Service: Python FastAPI
- Shared contracts: `packages/shared`

## Prerequisites

- Node.js 20+
- npm 10+ (or pnpm)
- Python 3.10+

## Setup

### 1) Install Node dependencies

```bash
npm install
```

### 2) Create Python virtual environment and install service dependencies

Windows (PowerShell):

```powershell
python -m venv apps/service/.venv
.\apps\service\.venv\Scripts\Activate.ps1
pip install -r apps/service/requirements.txt
```

macOS/Linux:

```bash
python3 -m venv apps/service/.venv
source apps/service/.venv/bin/activate
pip install -r apps/service/requirements.txt
```

Note: Ensure `apps/service/.venv` exists and dependencies are installed; Electron will use it automatically.

## Run (One Command)

```bash
npm run dev
```

This starts:

- FastAPI service on `http://127.0.0.1:7860`
- Vite renderer on `http://127.0.0.1:5173`
- Electron desktop app

Notes:

- `apps/service/run-service.cjs` auto-resolves Python from:
  1. `VOLUMIA_PYTHON_BIN`
  2. `apps/service/.venv`
  3. `python` in PATH
- Electron also prefers `apps/service/.venv` automatically when starting the local FastAPI service.
- Desktop dev host is fixed to `127.0.0.1` to avoid host mismatch issues.

## Build and Lint

```bash
npm run lint
npm run build
```

## MVP Flow

### Screen 1: New Capture

- Capture slot grid:
  - Front, Side, Back, Top
  - Detail 1-4
  - Material Close-up 1-4
- Setup panel:
  - Object Type
  - Reconstruction Mode
  - SketchUp optimized target (locked ON)
  - Lightweight version toggle
  - Complexity
  - Scale dimension + value (cm)
- Guided accuracy modal placeholder
- Studio presets can be saved locally

### Screen 2: Processing

- Progress bar
- Step list
- Elapsed timer

### Screen 3: Review & Export

- Left: strict `OBJ_*` component tree
- Center: 3D viewport (grid, neutral light, orbit controls)
- Right: `MAT_*` materials with controls (tiling/rotation/roughness/normal strength)
- High/Low preview quality toggle
- Stats for faces/materials/components
- Export modal with SketchUp packaging options

## FastAPI Endpoints

- `GET /health`
- `POST /analyze-images`
- `POST /generate-model`
- `POST /export-package`

Generated artifacts are exposed from:

- `/generated/<generation_id>/...`

## SketchUp Package Output

The export stub builds a real ZIP with this structure:

```text
Object_Name_SketchUp_Package.zip
  HIGH/model_high.dae
  HIGH/model_high.glb
  HIGH/textures/*
  LOW/model_low.dae
  LOW/model_low.glb
  LOW/textures/*
  preview_high.png
  preview_low.png
  materials.json
  README.txt
```

Conventions enforced:

- Components: `OBJ_*`
- Materials: `MAT_*`
- Texture naming: `MAT_Name_BaseColor.png`, `MAT_Name_Normal.png`, `MAT_Name_Roughness.png`
- Shared schema version: `volumia.materials.v1`

## Studio Presets

Studio presets are persisted in Electron user data:

- `<userData>/presets/*.json`

Each preset stores:

- `presetName`
- `basePreset`
- `structureLocked`
- material defaults
- export defaults

## Environment

Copy `.env.example` if needed and set:

- `VOLUMIA_SERVICE_PORT` (default `7860`)
- `VOLUMIA_SERVICE_MANAGED_EXTERNALLY` (set `1` if you run service manually)
- `VOLUMIA_PYTHON_BIN` (optional explicit Python binary)
