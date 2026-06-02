# Copilot helper: VOLUMIA (monorepo)

Quick commands
- Install dependencies: pnpm install
- Dev (desktop app + backend): pnpm dev
- Run desktop backend only: pnpm -C apps/desktop run backend
- Build (desktop app): pnpm build
- Package (electron): pnpm -C apps/desktop run package
- Lint: pnpm -C apps/desktop run lint
- Type-check: pnpm -C apps/desktop run typecheck
- Run tests (all): pnpm -C apps/desktop run test
- Run a single test file or pattern:
  - pnpm -C apps/desktop run test -- path/to/file.test.ts
  - or: pnpm -C apps/desktop exec vitest run path/to/file.test.ts

High-level architecture
- Monorepo (pnpm workspaces: apps/*, packages/*). Root scripts delegate to apps/desktop.
- Desktop app: Electron + Vite + React + TypeScript (apps/desktop).
  - Frontend: src/ (React + three.js viewer)
  - Local backend: apps/desktop/backend (Express server, Node.js)
  - Backend coordinates optional external tools (Python runners, Blender, Meshroom).
- Projects data: apps/desktop/projects/[id] with input/, output/, latest.glb, job.json
- Packaging: electron-builder includes backend/server.js and backend tools (see apps/desktop/package.json "files").

Key repository conventions
- Environment overrides: set env vars or use the backend settings API (saved at backend/config/local.settings.json).
  - VOLUMIA_ROOT, VOLUMIA_PYTHON, VOLUMIA_BLENDER, VOLUMIA_TRIPOSR_DIR, VOLUMIA_HUNYUAN_DIR, VOLUMIA_MESHROOM_DIR
- Projects: project IDs are sanitized (only [A-Za-z0-9_-]); see backend/config/paths.js safeProjectId/projectPaths.
- Job lifecycle: backend writes job.json per project root; status values include idle, queued, etc. latest.glb presence indicates a completed model.
- Uploads: filenames are sanitized and prefixed with timestamp by multer in backend/server.js.
- Tools detection: GET /api/tools/status and POST /api/tools/detect return configured/available tool info (backend/config/paths.js).
- Local settings: POST /api/settings to persist local settings used by configuredPath logic.

Useful files to inspect
- apps/desktop/package.json (scripts for dev/build/test/lint)
- apps/desktop/backend/server.js (API endpoints and job flow)
- apps/desktop/backend/config/paths.js (paths, tool detection, project layout)
- README.md (project-level overview and demo flow)

API endpoints (local backend)
- GET /api/health
- GET /api/tools/status
- POST /api/tools/detect
- GET/POST /api/settings
- POST /api/projects -> create project
- POST /api/projects/:id/input -> upload images (multipart/form-data, field "images")
- POST /api/projects/:id/generate -> start generation (mode: demo|quick|...)
- GET /api/projects/:id/status -> project + job
- GET /api/projects/:id/model -> returns latest.glb

Notes for Copilot sessions
- Root-level scripts mostly forward to apps/desktop; inspect apps/desktop/package.json for exact script behavior.
- Many external integrations are optional; Copilot should prefer describing local MVP behaviour (demo flow) unless env vars indicate configured tools.
- For changes touching project layout or backend, check backend/config/paths.js and backend/jobs/generate3d.js for side-effects.

References
- README.md, apps/desktop/package.json, apps/desktop/backend/server.js, apps/desktop/backend/config/paths.js

