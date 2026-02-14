# VOLUMIA IA -> DAE + SKP 2025

## Requisitos

- Windows 10/11
- GPU NVIDIA con drivers CUDA instalados
- Python en entorno local (conda recomendado)
- SketchUp 2025 instalado

## Instalar dependencias Python

```powershell
python -m pip install --upgrade pip
python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
python -m pip install pillow numpy trimesh
python -m pip install git+https://github.com/VAST-AI-Research/TripoSR.git
```

## Configuracion GPU

- Verificar CUDA en Python:

```powershell
python -c "import torch; print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

- Si `False`, revisar:
  - Driver NVIDIA actualizado
  - PyTorch CUDA wheel correcta para tu version
  - Que el entorno Python usado por Electron sea el mismo

## Deteccion de SketchUp 2025

Ruta detectada por defecto:

```text
C:\Program Files\SketchUp\SketchUp 2025\SketchUp.exe
```

Si no existe, pasar manualmente:

```text
--sketchup_exe "D:\Apps\SketchUp\SketchUp 2025\SketchUp.exe"
```

## Script

Archivo:

```text
apps/desktop/python/image_to_3d_gen_dae_skp.py
```

Argumentos:

- `--inputs` lista de 1..4 imagenes
- `--project_name` nombre exacto para componente y archivo `.skp`
- `--work_dir` carpeta intermedia (`model.dae`, `textures/`, `import_and_save.rb`)
- `--output_dir` carpeta final del `.skp`
- `--quality` `fast` | `high`
- `--sketchup_exe` opcional

## Ejemplo CLI

```powershell
python apps/desktop/python/image_to_3d_gen_dae_skp.py `
  --inputs "C:\tmp\obj\1.jpg" "C:\tmp\obj\2.jpg" `
  --project_name "Mesa Aurora" `
  --work_dir "C:\tmp\volumia\work" `
  --output_dir "C:\tmp\volumia\out" `
  --quality high `
  --sketchup_exe "C:\Program Files\SketchUp\SketchUp 2025\SketchUp.exe"
```

Salida esperada JSONL:

- progreso:

```json
{"type":"progress","stage":"infer","pct":46,"message":"Running geometry generation on cuda"}
```

- resultado:

```json
{"type":"done","skpPath":"C:\\tmp\\volumia\\out\\Mesa Aurora.skp"}
```
