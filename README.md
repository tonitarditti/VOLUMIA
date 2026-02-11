# VOLUMIA — Your Creative 3D Assistant

A production-grade architecture and interior design tool that generates editable 3D base models from images, optimized for SketchUp. Local-first with optional self-hosted server support.

## Overview

**VOLUMIA** is a hybrid web + desktop application with:
- **Desktop App** (Electron + React): Guided and pro-level user experience
- **Engine** (FastAPI): Local-first processing with background job queue
- **Design**: Bone/beige premium aesthetic with modern clean UI

## Quick Start

### Before You Begin
- **Node.js** 16+ (for desktop)
- **Python** 3.9+ (for engine)

### Running the Engine

```bash
cd engine
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
python run_engine.py
```

The engine will start at `http://127.0.0.1:7860`

### Running the Desktop App

```bash
cd desktop
npm install
npm run dev
```

The Electron app will launch with the dev server.

## Architecture

```
VOLUMIA/
├── desktop/           # Electron + React + TypeScript UI
│   ├── src/
│   ├── public/
│   └── package.json
├── engine/            # Python FastAPI backend
│   ├── volumina_engine/
│   ├── run_engine.py
│   └── requirements.txt
├── docs/              # Usage documentation
└── README.md
```

## Workflow

1. **Open Desktop App** → Select an image from your device
2. **Configure** → Choose preset, detail level, output formats
3. **Generate** → Engine processes in background, shows real-time updates
4. **Export** → Download OBJ/GLB, compatible with SketchUp
5. **Edit** → Import into SketchUp with all geometry and textures preserved

## Engine API

- `GET /health` — System info (CUDA/CPU status)
- `POST /jobs` — Create a new job with image and parameters
- `GET /jobs/{id}` — Fetch job status and metadata
- `POST /jobs/{id}/cancel` — Cancel an in-progress job
- `GET /jobs/{id}/download` — Download job outputs as ZIP

## Job States

- `created` — Job initialized
- `preprocessing` — Preparing input
- `reconstructing` — Main processing
- `postprocessing` — Refining geometry
- `exporting` — Creating OBJ/GLB
- `done` — Success
- `warning` — Completed with issues
- `failed` — Processing error

## Design System

Uses CSS variables for a cohesive, on-brand aesthetic:
- **Background**: `#f0ede7` (bone)
- **Panel**: `#ffffff` (white)
- **Accent**: `#9c7c5a` (beige/taupe)
- **Text**: `#2e2e2e` (dark)
- **Text Secondary**: `#6b6b6b` (medium gray)

## Development

See [docs/quickstart.md](docs/quickstart.md) for detailed developer setup.

## License

TBD
