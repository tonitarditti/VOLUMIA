# VOLUMIA Quickstart Guide

Complete setup instructions for developers.

## Prerequisites

- **Backend**: Python 3.9+
- **Desktop**: Node.js 16+, npm

## Running VOLUMIA Locally

### 1. Start the Engine (FastAPI Backend)

```bash
cd engine

# Create and activate virtual environment
python -m venv venv

# On Windows:
venv\Scripts\activate

# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
python run_engine.py
```

The engine will be available at `http://127.0.0.1:7860`

**Verify it's running:**
```bash
curl http://127.0.0.1:7860/health
```

### 2. Start the Desktop App

In a new terminal:

```bash
cd desktop

# Install dependencies (one-time)
npm install

# Start dev environment (runs Vite + Electron)
npm run dev
```

The Electron app will launch automatically, connecting to the local engine.

## Expected Workflow

1. **Launch Desktop App** → App opens connected to engine
2. **Check Status** → Status bar shows "Local Engine" in lower right
3. **Select Image** → Click dropzone or drag/drop an image
4. **Configure Options** → Choose preset, detail level, output formats
5. **Generate** → Click "Generate Editable Model" button
6. **Monitor Progress** → Watch real-time progress in main stage
7. **Download** → Once done, download OBJ/GLB or open output folder

## Building for Production

### Engine

No special build needed. Package as Docker:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY engine/requirements.txt .
RUN pip install -r requirements.txt
COPY engine/ .
ENTRYPOINT ["python", "run_engine.py"]
```

### Desktop

```bash
cd desktop
npm run dist
# Creates installer in dist/
```

## API Reference

See engine deployment docs for full API endpoint reference.

### Create Job (POST /jobs)

**Request:**
```bash
curl -X POST http://127.0.0.1:7860/jobs \
  -F "preset=interior" \
  -F "units=cm" \
  -F "detail=medium" \
  -F "output_obj=true" \
  -F "output_glb=false" \
  -F "textures=true" \
  -F "images=@path/to/image.jpg"
```

**Response:**
```json
{
  "id": "job-uuid",
  "state": "created",
  "progress": 0.0,
  "message": "Job created"
}
```

### Check Job Status (GET /jobs/{id})

```bash
curl http://127.0.0.1:7860/jobs/job-uuid
```

### Download Results (GET /jobs/{id}/download)

```bash
curl http://127.0.0.1:7860/jobs/job-uuid/download -o job.zip
```

## Troubleshooting

### Engine won't start

- Ensure port 7860 is free: `lsof -i :7860` (macOS/Linux)
- Check Python version: `python --version` (must be 3.9+)
- Try `pip install --upgrade pip setuptools`

### Desktop app won't connect

- Verify engine is running: `curl http://127.0.0.1:7860/health`
- Check firewall settings
- Engine logs show in terminal
- Desktop DevTools: Ctrl+I (Windows) or Cmd+I (macOS)

### CUDA errors

- If you have GPU: install `torch` with CUDA support
- Falls back to CPU automatically if CUDA unavailable
- Check `health` endpoint for device info

## Development

### Engine Structure

```
engine/
├── volumina_engine/
│   ├── main.py          # FastAPI app
│   ├── device.py        # GPU/CPU detection
│   ├── storage.py       # Job storage
│   └── jobs/
│       ├── schema.py    # Data models
│       ├── queue.py     # Job queue
│       └── runner.py    # Pipeline execution
├── run_engine.py        # Entry point
└── requirements.txt
```

### Desktop Structure

```
desktop/
├── src/
│   ├── components/      # React UI components
│   ├── stores/          # Zustand state
│   ├── services/        # API clients
│   ├── styles/          # CSS & tokens
│   ├── App.tsx
│   └── main.tsx
├── electron/            # Electron main process
├── public/
├── package.json
└── tsconfig.json
```

### Adding Features

- **New API endpoint?** Add to `engine/volumina_engine/main.py`
- **New UI component?** Create in `desktop/src/components/`
- **New state?** Create store in `desktop/src/stores/`
- **New design token?** Update `desktop/src/styles/tokens.css`

## Next Steps

- [ ] Integrate real 3D reconstruction model (replace placeholders)
- [ ] Add texture generation pipeline
- [ ] Implement SketchUp exporter
- [ ] Add progress logging UI
- [ ] Setup Docker deployment
- [ ] Create Windows/macOS installers
