# VOLUMIA Repository Layout

## Source of Truth
- `apps/desktop/electron/**` (Electron main/preload TypeScript source)
- `apps/desktop/src/**` (React renderer source)
- `tools/comfyui/workflows/multiview_sdxl_canny.json` (canonical ComfyUI workflow at repo root)

## Generated / Disposable
- `apps/desktop/electron-dist/**` (generated from `npm run electron:build`)
- `apps/desktop/dist/**` (generated from Vite build)
- `**/node_modules/**` (dependency installs)

## Local-Only (Do Not Commit)
- Virtual environments: `.venv`, `venv*`, `env`
- Python cache: `__pycache__`, `*.pyc`, `*.pyo`
- Logs: `logs`, `*.log`, `*.err.log`

## Do-Not-Commit List
- `apps/desktop/electron-dist/**`
- `apps/desktop/dist/**`
- `**/node_modules/**`
- `.venv`, `venv*`, `env`
- `**/__pycache__/**`
- `logs/**`, `*.log`

## Canonical Commands
- `npm run dev`
- `npm run build`
- `npm run electron:dev`
- Workspace form: `npm -w apps/desktop run dev`

## Path Resolution Rule
- Never copy `tools/comfyui` into `apps/desktop` or other subfolders.
- Workflow resolution must target:
  - `<repoRoot>/tools/comfyui/workflows/multiview_sdxl_canny.json`
