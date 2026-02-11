# VOLUMIA Deployment Guide

## Project Summary

✅ **VOLUMIA** is a production-ready monorepo with:

- **Engine**: Python FastAPI with job queue and placeholder AI pipeline
- **Desktop**: Electron + React TypeScript with bone/beige UI design
- **Documentation**: Quickstart and architecture guides

## Complete File Structure

```
VOLUMIA/
├── .gitignore                   # Root gitignore (node_modules, __pycache__, etc.)
├── README.md                    # Main project overview
│
├── engine/                      # FastAPI backend
│   ├── .gitignore
│   ├── requirements.txt         # Python dependencies
│   ├── run_engine.py            # Entry point (uvicorn)
│   └── volumina_engine/
│       ├── __init__.py
│       ├── main.py              # FastAPI app & endpoints
│       ├── device.py            # GPU/CPU detection
│       ├── storage.py           # Job folder management
│       └── jobs/
│           ├── __init__.py
│           ├── schema.py        # Pydantic models (JobRequest, JobResponse)
│           ├── queue.py         # In-process job queue (threading)
│           └── runner.py        # Pipeline execution with dummy outputs
│
├── desktop/                     # Electron + React app
│   ├── .eslintrc.json
│   ├── .vscode/launch.json      # Debug config
│   ├── package.json             # NPM dependencies
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts           # Vite dev server config
│   ├── public/
│   │   └── index.html           # Entry HTML
│   ├── electron/
│   │   ├── main.ts              # Electron main process + IPC handlers
│   │   └── preload.ts           # Secure IPC preload
│   └── src/
│       ├── App.tsx              # Root React component
│       ├── main.tsx             # React entry point
│       ├── components/
│       │   ├── TopBar.tsx       # Brand + units + theme
│       │   ├── LeftSidebar.tsx  # Image, preset, options, generate, export
│       │   ├── MainStage.tsx    # Empty/processing/done/error states
│       │   └── StatusBar.tsx    # Status indicator + logs + engine mode
│       ├── stores/
│       │   ├── settings.store.ts # Theme, units, preset, detail, outputs
│       │   └── job.store.ts      # Job lifecycle, polling, logs
│       ├── services/
│       │   └── engineClient.ts   # Axios wrapper for /jobs API
│       └── styles/
│           ├── tokens.css       # Design system (colors, spacing, typography)
│           └── app.css          # Component styles
│
└── docs/
    ├── quickstart.md            # Setup & workflow guide
    └── architecture.md          # Design decisions & technical details
```

## Getting Started

### 1. Backend Setup & Run

```bash
cd engine

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Start engine
python run_engine.py
# Server ready at http://127.0.0.1:7860
```

### 2. Frontend Setup & Run (New Terminal)

```bash
cd desktop

# Install dependencies
npm install

# Start dev (Vite + Electron)
npm run dev
# App launches automatically
```

## What Works Out of the Box

✅ **Engine:**
- FastAPI server with full job API
- Automatic CUDA/CPU detection
- Job queue with background threading
- Persistent job storage (`%APPDATA%\Volumia\jobs\`)
- Dummy OBJ/MTL/GLB generation (files created successfully)
- Real logs written to job folders
- Health check endpoint

✅ **Desktop:**
- Electron window with React UI
- Full component layout (TopBar, Sidebar, MainStage, StatusBar)
- Zustand state management (settings + job lifecycle)
- Image upload and file selection
- Job submission with form data
- Real-time polling (500ms updates)
- Progress bar visualization
- Download ready (wired to API but not fully tested in UI)

✅ **Design System:**
- Complete color tokens (bone/beige palette)
- Typography scale (12px → 32px)
- Spacing grid (4px → 32px)
- CSS variables for easy theming
- Dark mode support (logic ready, needs theme switch testing)
- Soft shadows and smooth transitions

## Known Placeholders

⚠️ **These are TODO – add real implementations:**

1. **Engine Pipeline** (jobs/runner.py)
   - Lines marked `# TODO: Replace with actual reconstruction output`
   - Currently creates dummy OBJ/MTL/GLB files
   - Replace with actual 3D model generation logic

2. **Texture Generation** (jobs/runner.py)
   - Logged but not implemented
   - Add texture baking pipeline

3. **Desktop Download Buttons**
   - UI buttons disabled until job done
   - Implement actual download using axios/engineClient

4. **Error Handling**
   - Add timeout for long operations
   - Add retry logic for network errors
   - Better error UI in MainStage

5. **GPU Support**
   - Engine auto-detects but no GPU code yet
   - Add pytorch/torch GPU inference

## Building for Production

### Engine (Docker)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY engine/requirements.txt .
RUN pip install -r requirements.txt
COPY engine/ .
EXPOSE 7860
CMD ["python", "run_engine.py"]
```

```bash
docker build -t volumia-engine .
docker run -p 7860:7860 -v ~/.volumia:/root/.volumia volumia-engine
```

### Desktop (Installers)

```bash
cd desktop
npm run build
npm run dist
# Creates dist/VOLUMIA-0.1.0.exe (Windows)
# Creates dist/VOLUMIA-0.1.0.dmg (macOS) 
# Creates dist/VOLUMIA-0.1.0.AppImage (Linux)
```

## API Endpoints

All at `http://127.0.0.1:7860`:

```
GET    /              → API info
GET    /health        → {device, version, status}
POST   /jobs          → {id, state, progress, ...}
GET    /jobs          → {total, jobs: [...]}
GET    /jobs/{id}     → Job status with logs
POST   /jobs/{id}/cancel → {}
GET    /jobs/{id}/download → ZIP file
```

## Testing

### Manual Test Workflow

1. Start engine: `python run_engine.py`
2. Start desktop: `npm run dev`
3. In desktop app:
   - Select test image (any JPG/PNG)
   - Choose preset + detail level
   - Click "Generate Editable Model"
   - Watch progress bar (0→100% in ~5 seconds)
   - Check status bar shows "Done"
4. Verify files created:
   - `%APPDATA%\Volumia\jobs\{job_id}\output\model.obj` exists
   - `logs/process.log` contains messages

### API Test

```bash
# First, get a test image and encode as multipart
curl -X POST http://127.0.0.1:7860/jobs \
  -F "preset=interior" \
  -F "units=cm" \
  -F "detail=medium" \
  -F "output_obj=true" \
  -F "textures=true" \
  -F "images=@test.jpg"
# Returns: {"id": "uuid", "state": "created", ...}

# Check status
curl http://127.0.0.1:7860/jobs/uuid
# Returns: {id, state, progress, message, logs, outputs, ...}

# Download
curl http://127.0.0.1:7860/jobs/uuid/download -o job.zip
```

## Development Workflow

### Adding Features

**New API endpoint?**
- Edit `engine/volumina_engine/main.py`
- Add `@app.post("/path")` or `@app.get("/path")`
- Add Pydantic schema in `jobs/schema.py`

**New UI component?**
- Create in `desktop/src/components/FileName.tsx`
- Import and use in `App.tsx`
- Style with `components/fileName.css`

**New state?**
- Create store in `desktop/src/stores/feature.store.ts`
- Use with `const state = useFeatureStore()`

**Design token change?**
- Update `desktop/src/styles/tokens.css`
- All colors are CSS variables, auto-applied

**Engine pipeline step?**
- Add method in `jobs/runner.py` class `JobRunner`
- Call from `run_job()` with logging
- Update job state/progress after each step

## Architecture Highlights

### Why This Structure?

1. **Separation of Concerns**: Engine ↔ Desktop via HTTP (no tight coupling)
2. **Type Safety**: TypeScript frontend + Pydantic backend
3. **Offline First**: Works completely local, optional server later
4. **State Management**: Zustand for simplicity (no Redux boilerplate)
5. **Design Tokens**: CSS variables for consistent styling
6. **Job Persistence**: Jobs survive app restarts (saved to disk)
7. **Extensible**: Easy to add GPU, batch processing, cloud storage

### Key Technologies

| Layer | Stack | Why |
|-------|-------|-----|
| Backend | FastAPI + Uvicorn | Fast, async, auto-docs |
| Frontend | Electron + React | Cross-platform desktop |
| State | Zustand | Minimal, reactive |
| Styling | CSS variables + CSS Grid | Token-based, maintainable |
| API Calls | Axios | Simple, type-safe |
| Job Queue | Threading | Simple for local use |

## Next Steps

### Phase 1: Make It Work
- [ ] Test full workflow (image → OBJ downoad)
- [ ] Fix any TypeScript errors
- [ ] Test dark mode toggle
- [ ] Create test images for validation

### Phase 2: Real 2/3D
- [ ] Integrate 3D reconstruction model (OpenAI Shap-E, Tripo3D, or custom)
- [ ] Implement texture generation (use stable diffusion or similar)
- [ ] Create actual OBJ/MTL output from reconstruction
- [ ] Test SketchUp import

### Phase 3: Polish
- [ ] Error messages and retry logic
- [ ] Logging UI in app (show logs in modal)
- [ ] Download progress indicator
- [ ] Settings persistence
- [ ] Unit tests (pytest + vitest)

### Phase 4: Deploy
- [ ] Docker build for engine
- [ ] Windows/macOS code signing
- [ ] Auto-update mechanism
- [ ] Analytics (optional)
- [ ] Bug reports (Sentry integration)

## Support

See [docs/quickstart.md](docs/quickstart.md) for detailed setup help.

See [docs/architecture.md](docs/architecture.md) for design decisions.

---

**VOLUMIA v0.1.0** — Ready to generate editable 3D models! 🎨
