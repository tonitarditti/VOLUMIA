# VOLUMIA Desktop Backend Supervisor

Este backend vive en `apps/desktop/backend` y orquesta servicios IA locales para la app Electron.

## Que hace

- Crea carpetas de datos de usuario para `models`, `workflows`, `outputs`, `logs`.
- Sincroniza workflows versionados desde el repo a la carpeta de usuario.
- Valida modelos declarados en `config/model-registry.json` por existencia, bytes y hash (si aplica).
- Intenta levantar ComfyUI localmente y expone estado/ejecucion para IPC.
- Permite ejecutar un workflow de prueba (`default.json`) via API HTTP de ComfyUI.

## Donde va ComfyUI

El supervisor usa `apps/desktop/backend/config/default.json`:

- `comfy.rootDir`: ruta de ComfyUI (actual: `C:\AI\ComfyUI_VOL`)
- `comfy.pythonExe`: Python a usar (actual: `F:\MINICONDA\envs\volumia\python.exe`)
- `comfy.args`: `["main.py","--listen","127.0.0.1","--port","8188"]`

No usa `conda activate`, `conda run` ni `shell:true`. Lanza proceso con `spawn(..., shell:false)`.

## Donde se guardan workflows/modelos

Raiz de datos: `<userData>/volumia`

- Modelos: `<userData>/volumia/models`
- Workflows sincronizados: `<userData>/volumia/workflows`
- Outputs: `<userData>/volumia/outputs`
- Logs: `<userData>/volumia/logs`

`<userData>` usa `app.getPath("userData")` dentro de Electron. Fuera de Electron usa `%APPDATA%` o `os.homedir()`.

## Desarrollo

Desde `apps/desktop`:

```bash
npm run dev
npm run backend:status
```

`electron:build` compila:

- `electron/**/*.ts`
- `backend/src/**/*.ts` (a `backend/dist`)

Si faltan modelos o ComfyUI, el backend no crashea en dev y deja logs con rutas exactas esperadas.
