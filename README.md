# VOLUMIA Desktop MVP Local

VOLUMIA es una app local para generar y visualizar modelos 3D desde imagenes. El MVP usa Electron, React, Three.js y un backend local Node/Express. ComfyUI queda aislado como legacy y no participa en el flujo principal.

## Stack

- Electron + Vite + React + TypeScript
- Three.js para visualizar GLB
- Backend local Express en `apps/desktop/backend/server.js`
- Runners Python opcionales para TripoSR, Hunyuan3D y Meshroom
- Blender CLI opcional para optimizar/exportar `latest.glb`

## Instalacion

```bash
pnpm install
```

## Desarrollo

```bash
pnpm dev
```

Esto inicia Vite y Electron. Electron arranca automaticamente el backend MVP en `http://127.0.0.1:9360`.

Tambien se puede correr solo el backend:

```bash
pnpm -C apps/desktop run backend
```

## Variables locales

Todas son opcionales para probar demo. Para generacion real, configura las necesarias:

```bash
VOLUMIA_ROOT=E:\VOLUMIA\apps\desktop\projects
VOLUMIA_PYTHON=C:\ruta\a\python.exe
VOLUMIA_BLENDER=C:\Program Files\Blender Foundation\Blender 4.3\blender.exe
VOLUMIA_TRIPOSR_DIR=E:\AI\TripoSR
VOLUMIA_HUNYUAN_DIR=E:\AI\Hunyuan3D-2.1
VOLUMIA_MESHROOM_DIR=E:\AI\Meshroom
```

`No configurada` significa que la variable falta o apunta a una ruta inexistente. La app no se rompe por eso; solo los modos reales que dependen de esa herramienta fallan con un mensaje claro.

## Flujo demo

Sirve para validar todo sin IA instalada:

1. Abrir VOLUMIA.
2. Crear proyecto.
3. Subir una imagen.
4. Elegir `Demo`.
5. Generar.
6. Confirmar que se crea `projects/[id]/latest.glb` y se carga en el viewer.

El modo demo copia `apps/desktop/assets/templates/box.glb`.

## Flujo TripoSR real

1. Configurar `VOLUMIA_PYTHON` y `VOLUMIA_TRIPOSR_DIR`.
2. Opcional: configurar `VOLUMIA_BLENDER`.
3. Crear proyecto y subir una imagen.
4. Elegir `Quick`.
5. Generar.

Si TripoSR produce GLB y Blender no esta configurado, VOLUMIA copia ese GLB como `latest.glb` y completa el job con warning. Si TripoSR produce OBJ/PLY sin Blender, el job falla porque no puede exportar GLB.

## API local

- `GET /api/health`
- `GET /api/tools/status`
- `POST /api/projects`
- `POST /api/projects/:id/input`
- `POST /api/projects/:id/generate`
- `GET /api/projects/:id/status`
- `GET /api/projects/:id/model`

Cada proyecto usa:

```text
apps/desktop/projects/[id]/
  input/
  output/
  latest.glb
  job.json
```

## Checks

```bash
pnpm -C apps/desktop run typecheck
pnpm -C apps/desktop run build
pnpm -C apps/desktop run test
```
