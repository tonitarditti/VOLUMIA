# VOLUMIA Desktop

VOLUMIA is a local-first desktop application for architecture-focused project exploration.

## Stack

- Electron
- Vite
- React
- TypeScript
- TailwindCSS
- Three.js (`@react-three/fiber`, `@react-three/drei`)

## Monorepo Structure

```text
volumia/
  apps/
    desktop/          # Electron + React desktop app
    service/          # Legacy backend service (out of desktop runtime scope)
  packages/
    shared/
```

## Prerequisites

- Node.js 20+
- npm 10+

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

This starts:

- Vite renderer on `http://127.0.0.1:5173`
- Electron desktop shell

No backend is required for runtime.

## Build

```bash
npm run build
```

Build output:

- Renderer: `apps/desktop/dist`
- Electron main/preload: `apps/desktop/electron-dist`

## Quality Checks

```bash
npm run lint
npm run typecheck
npm run test
```

## Feature Overview

- Local-first projects persisted in localStorage with schema versioning.
- Project dashboard with create, rename, duplicate, delete.
- Import/export project archive as JSON via secure Electron IPC.
- Project workspace with:
  - editable name
  - Three.js massing viewport
  - notes editor
  - structured assistant mock chat
- Settings page:
  - dark/light theme selector
  - import/export access
  - AI API key placeholder for future integration

## Security Posture

Electron renderer runs with:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

Only explicit preload methods are exposed to the renderer.
