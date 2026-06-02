# VOLUMIA Desktop Backend Supervisor

Backend en `apps/desktop/backend` para ejecutar workflows de ComfyUI directamente (sin rembg/bg_remove).

## Que hace

- Sincroniza workflows versionados del repo a `<userData>/volumia/workflows`.
- Permite importar workflows JSON exportados de ComfyUI y marcar uno como activo.
- Ejecuta el workflow activo contra ComfyUI (`/upload/image` + `/prompt`).
- Reporta estado de conectividad (`/system_stats` / `/queue`) sin crashear UI.
- Valida checkpoints del workflow contra `GET /object_info` antes de encolar.

## Como levantar ComfyUI

Configurado en `apps/desktop/backend/config/comfy.default.json` (y override en `%APPDATA%\\volumia\\config\\comfy.user.json`):

- `comfy.host`: `127.0.0.1`
- `comfy.port`: `8188`
- `comfy.baseUrl`: `http://127.0.0.1:8188`
- `comfy.comfyDir`: `C:\AI\ComfyUI_VOL`
- `comfy.condaHook`: `C:\ProgramData\miniconda3\Scripts\activate.bat`
- `comfy.condaEnvName`: `volumia`
- `comfy.pythonExeOverride`: opcional (si existe, se usa directo y evita activar conda)
- `comfy.args`: `["main.py","--listen","127.0.0.1","--port","8188"]`

Comando manual equivalente:

```bat
conda activate volumia
cd /d C:\AI\ComfyUI_VOL
python main.py --listen 127.0.0.1 --port 8188
```

No usa `conda run` ni `shell:true`. Usa `spawn(..., { shell: false })` y fallback controlado a `cmd.exe /c call activate.bat ...`.

## Workflows

- Default en repo: `apps/desktop/backend/workflows/hunyuan_image_to_3d.json`.
- Importacion desde UI (Dashboard): boton `Import workflow JSON`.
- Workflow activo persistido en: `<userData>/volumia/workflow-state.json`.

Si el workflow tiene nodo `LoadImage`, el backend sube imagen a ComfyUI y actualiza el nombre en el JSON antes de `/prompt`.

## Rutas de datos

Raiz: `<userData>/volumia`

- `models/`
- `workflows/`
- `outputs/`
- `logs/`

## Desarrollo

Desde `apps/desktop`:

```bash
npm run backend:status
npm run dev
```

## Variables opcionales OpenMP

Para Windows + Conda, algunos pipelines 3D pueden cargar más de una copia de `libiomp5md.dll`.
El backend MVP inyecta estas variables solo en procesos Python de generación 3D:

```bat
set VOLUMIA_KMP_DUPLICATE_LIB_OK=TRUE
set VOLUMIA_OMP_NUM_THREADS=1
set VOLUMIA_MKL_NUM_THREADS=1
set VOLUMIA_NUMEXPR_NUM_THREADS=1
```

También pueden guardarse en `apps/desktop/backend/config/local.settings.json`.

En Dashboard:

- `Refresh status` para comprobar ComfyUI.
- `Start` / `Stop` para controlar el supervisor.
- `Run workflow (test)` para encolar el workflow activo.

## Migracion backend unificado

- Checklist operativa de Fase 1: `docs/VOLUMIA_UNIFIED_BACKEND_PHASE1_CHECKLIST.md`

## Workflows en repo

- Fuente principal soportada: `apps/desktop/electron/generation/comfyui-workflows/`
- Fallback/compat: `apps/desktop/backend/workflows/`
- El backend sincroniza al iniciar hacia `%APPDATA%\\volumia\\workflows`.
