# Architecture & Design Decisions

## Overview

VOLUMIA is built as a monorepo with clear separation between:

- **Engine** (backend): Python FastAPI server for image processing
- **Desktop** (frontend): Electron + React for user interface
- **Design System**: Unified bone/beige aesthetic with CSS design tokens

## Engine Architecture

### Job Lifecycle

```
User submits image
        ↓
    CREATED
        ↓
PREPROCESSING (validate, normalize)
        ↓
RECONSTRUCTING (AI model inference)
        ↓
POSTPROCESSING (smooth, optimize)
        ↓
EXPORTING (OBJ/GLB/textures)
        ↓
    DONE / FAILED
```

### Storage

Jobs are stored locally:
- **Windows**: `%APPDATA%\Volumia\jobs\{job_id}\`
- **macOS/Linux**: `~/.volumia/jobs/{job_id}/`

Each job folder contains:
```
job_id/
├── input/           # Original uploaded images
├── output/          # Generated OBJ, MTL, GLB files
├── logs/            # process.log
└── job.json         # Metadata
```

### Job Queue

Single-threaded in-memory queue with background threading:
- Main thread receives HTTP requests
- Job execution runs in `ThreadPoolExecutor` (configured to 1 thread)
- Job state persisted to `job.json` after each update
- Clients poll status via `GET /jobs/{id}`

### Device Detection

Automatic fallback:
1. Try to import PyTorch and CUDA
2. If available, use GPU with device info
3. If not, fall back to CPU
4. Health endpoint reports capabilities

## Desktop Architecture

### State Management

**Zustand stores:**
- `settings.store.ts` - User preferences (units, theme, preset, etc.)
- `job.store.ts` - Job lifecycle and polling logic

Stores are:
- Reactive (computed automatically)
- Simple to test
- Minimal boilerplate
- No actions/reducers needed

### Components

Functional React components with:
- TypeScript for type safety
- Composition over inheritance
- Design tokens via CSS variables

**Component Tree:**
```
App
├── TopBar
│   ├── Brand
│   ├── Units selector
│   └── Theme toggle
├── AppContainer
│   ├── LeftSidebar
│   │   ├── Image dropzone
│   │   ├── Preset selector
│   │   ├── Options (collapsible)
│   │   ├── Generate button
│   │   └── Export controls
│   └── MainStage
│       ├── EmptyState
│       ├── ProcessingState (with progress)
│       ├── ResultState
│       └── ErrorState
└── StatusBar
    ├── Status indicator
    ├── Log viewer link
    └── Engine mode
```

### API Communication

`engineClient.ts` wraps Axios for type-safe API calls:
- Multipart form data for image uploads
- Automatic retry (TODO)
- Error handling
- Type hints from OpenAPI schema (future)

### Electron Integration

Minimal Node integration:
- IPC for file dialogs (safe)
- No `nodeIntegration: true`
- Preload script validates all communication
- Main process spawns system file manager

## Design System

### 🎨 Color Palette

```css
--color-bg: #f0ede7;              /* Bone background */
--color-panel: #ffffff;           /* White content */
--color-accent: #9c7c5a;          /* Taupe/beige accent */
--color-text: #2e2e2e;            /* Dark text */
--color-text-secondary: #6b6b6b;  /* Medium gray */
```

**Dark mode** inverts luminance while maintaining saturation.

### 📐 Spacing Grid

8px base unit:
- xs: 4px
- sm: 8px (base)
- md: 16px
- lg: 24px
- xl: 32px

### 📝 Typography

- Font: System font stack (SF Pro, Segoe, Roboto)
- Weights: 400 (normal), 500 (medium), 600 (bold)
- Scales: sm (12px) → 2xl (32px)
- Line heights: 1.2 (tight), 1.5 (normal), 1.75 (relaxed)

### 🎭 Components

- Radius: 4px (sm) → 12px (xl)
- Shadows: Soft (sm) → Bold (lg)
- Transitions: 100ms (fast) → 300ms (slow)
- Focus states: Border + soft glow

## API Design

RESTful, resource-oriented:

```
POST   /jobs               Create job
GET    /jobs               List jobs
GET    /jobs/{id}          Get status
POST   /jobs/{id}/cancel   Cancel
GET    /jobs/{id}/download Zip outputs
GET    /health             System info
```

### Request/Response Format

Multipart form for uploads:
```
POST /jobs
  preset: string
  units: string
  detail: string
  output_obj: boolean
  output_glb: boolean
  textures: boolean
  images: File[] (multipart)
```

JSON response with timestamps and full status:
```json
{
  "id": "uuid",
  "state": "processing",
  "created_at": "2024-01-01T00:00:00",
  "updated_at": "2024-01-01T00:00:05",
  "progress": 0.45,
  "message": "Reconstructing 3D model...",
  "logs": ["...", "..."],
  "outputs": {
    "obj": "/path/model.obj",
    "mtl": "/path/model.mtl"
  }
}
```

## Deployment Strategy

### Development
- `npm run dev` in desktop/ (React + Electron)
- `python run_engine.py` in engine/
- Hot reload on both

### Production Engine
- Docker container with FastAPI + Uvicorn
- Persistent job storage (volume mount)
- Health checks enabled
- Optional HTTPS proxy

### Production Desktop
- `npm run dist` creates installers
- Windows: MSI + NSIS
- macOS: DMG with code signing
- Updates via `electron-updater` (TODO)

## Future Considerations

### Scalability
- Job queue → Redis + Celery for distributed jobs
- Storage → S3 or cloud blob storage
- API → Horizontal scaling behind load balancer

### Features
- Batch processing (multiple images at once)
- Real-time WebSocket updates (replace polling)
- User accounts + cloud saves
- Plugin system for custom pipelines
- Integration with SketchUp API

### Performance
- GPU inference with batch processing
- Model caching + quantization
- Progressive result streaming
- Client-side asset compression

## Testing

### Backend
```bash
pip install pytest pytest-asyncio
pytest engine/
```

Unit tests for:
- Device detection
- Job queue operations
- API endpoints

### Frontend
```bash
npm install vitest react-testing-library
npm run test
```

Unit tests for:
- Component rendering
- Store updates
- API mocking

## Security

- ✅ Context isolation (Electron)
- ✅ No arbitrary code execution
- ✅ Input validation (Pydantic)
- ⚠️ TODO: Rate limiting on API
- ⚠️ TODO: File upload size limits
- ⚠️ TODO: Secure temp file handling
