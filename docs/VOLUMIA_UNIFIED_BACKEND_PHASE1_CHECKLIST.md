# VOLUMIA Unified Backend - Fase 1 Checklist

Objetivo: dejar un backend Python unico y persistente como puerta de entrada, sin romper el flujo actual.

## Alcance de Fase 1

- [ ] `apps/desktop/backend/python/server.py` arranca FastAPI y responde salud.
- [ ] Electron usa backend unificado como gateway principal para operaciones Python.
- [ ] Existen rutas base de jobs y sistema para orquestacion inicial.
- [ ] Estado de jobs normalizado (status/stage/progress/message/error).
- [ ] Serializacion de jobs GPU-heavy habilitada por defecto.
- [ ] Feature flags activas para rollout seguro.

## Endpoints minimos

- [ ] `GET /health`
- [ ] `GET /system/resources`
- [ ] `POST /jobs/texture`
- [ ] `POST /jobs/reconstruct`
- [ ] `GET /jobs/{job_id}`
- [ ] `POST /jobs/cancel/{job_id}`

## Feature flags (config.py)

- [ ] `USE_UNIFIED_BACKEND`
- [ ] `USE_INTERNAL_HUNYUAN_PIPELINE`
- [ ] `USE_COMFY_ADAPTER`
- [ ] `ENABLE_MODEL_AUTO_UNLOAD`
- [ ] `ENABLE_GPU_JOB_SERIALIZATION`

## Criterios de salida de Fase 1

- [ ] Hay un solo entrypoint Python para la UI.
- [ ] La UI no necesita parsear stdout de scripts sueltos para progreso.
- [ ] Job de reconstruct llega a `done` por backend unificado.
- [ ] Job de texture llega a `done` por backend unificado.
- [ ] Cancelacion de job devuelve estado consistente (`cancelled` o `failed` normalizado).
- [ ] No quedan procesos zombies tras finalizar jobs.

## Comandos de validacion rapida (Windows)

```powershell
# 1) Levantar desktop con backend unificado
cmd /c "set VOLUMIA_PYTHON=F:\MINICONDA\envs\volumia\python.exe && set USE_UNIFIED_BACKEND=1 && set USE_INTERNAL_HUNYUAN_PIPELINE=0 && set USE_COMFY_ADAPTER=1 && set VOLUMIA_COMFY_DIR=E:\AI\ComfyUI_VOL && set VOLUMIA_COMFY_PYTHON_EXE=F:\MINICONDA\envs\volumia\python.exe && pnpm -C apps/desktop dev"
```

```powershell
# 2) Chequeos backend
Invoke-RestMethod http://127.0.0.1:9360/health
Invoke-RestMethod http://127.0.0.1:9360/system/resources
Invoke-RestMethod http://127.0.0.1:9360/system/comfy
```

```powershell
# 3) Ver procesos y puertos
Get-NetTCPConnection -LocalPort 9360,8188,5173 -ErrorAction SilentlyContinue | Select-Object LocalPort,State,OwningProcess
Get-Process | Where-Object { $_.ProcessName -match 'python|node|electron' } | Select-Object ProcessName,Id,Path
```

## Riesgos conocidos en Fase 1

- ComfyUI aun existe como dependencia externa, aunque encapsulada por adapter.
- La textura puede seguir usando legacy path si `USE_INTERNAL_HUNYUAN_PIPELINE=0`.
- El streaming de progreso puede ser por polling al inicio (SSE/WebSocket en fase posterior).

## Siguiente fase recomendada

Fase 2: migrar `hunyuan_texgen.py` a pipeline interno importable y activar `USE_INTERNAL_HUNYUAN_PIPELINE=1` en entorno controlado.
