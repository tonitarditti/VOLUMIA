# VOLUMIA Desktop Backend Supervisor

Backend en `apps/desktop/backend` para ejecutar workflows de ComfyUI directamente (sin rembg/bg_remove).

## Que hace

- Sincroniza workflows versionados del repo a `<userData>/volumia/workflows`.
- Permite importar workflows JSON exportados de ComfyUI y marcar uno como activo.
- Ejecuta el workflow activo contra ComfyUI (`/upload/image` + `/prompt`).
- Reporta estado de conectividad (`/system_stats` / `/queue`) sin crashear UI.
- Valida checkpoints del workflow contra `GET /object_info` antes de encolar.

## Como levantar ComfyUI

Configurado en `apps/desktop/backend/config/default.json`:

- `comfy.baseUrl`: `http://127.0.0.1:8188`
- `comfy.rootDir`: `C:\AI\ComfyUI_VOL`
- `comfy.pythonExe`: `F:\MINICONDA\envs\volumia\python.exe`
- `comfy.args`: `["main.py","--listen","127.0.0.1","--port","8188"]`

Comando manual equivalente:

```bat
conda activate volumia
cd /d C:\AI\ComfyUI_VOL
python main.py --listen 127.0.0.1 --port 8188
```

No usa `conda run` ni `shell:true`.

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

En Dashboard:

- `Refresh status` para comprobar ComfyUI.
- `Run workflow (test)` para encolar el workflow activo.
