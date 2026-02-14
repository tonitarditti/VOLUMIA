# VOLUMIA Local Generator - Windows Install

## 1) Use Miniconda environment (recommended)

```powershell
cd <path-to-volumia-repo>
conda activate volumia
python -m pip install --upgrade pip
```

## 2) Install PyTorch

Install the proper wheel for your GPU/CPU from official PyTorch instructions. Generic example:

```powershell
pip install torch torchvision torchaudio
```

## 3) Install TripoSR runtime deps

```powershell
pip install pillow numpy trimesh
pip install rembg
# If rembg backend requires it in your environment:
# pip install onnxruntime
pip install git+https://github.com/VAST-AI-Research/TripoSR.git
```

## 3b) Install Image->3D Depth MVP deps

```powershell
pip install -r apps/desktop/python/requirements-image-to-3d.txt
```

## 4) Test the local runner directly

```powershell
python tools/local_generator/run_triposr.py --image tools/local_generator/sample.jpg --preset balanced --out_glb .\tmp\triposr-test\result.glb --device cuda
```

If this succeeds, VOLUMIA can call the same script from Electron and stream progress.

## 5) Test the depth MVP runner

```powershell
python apps/desktop/python/image_to_3d_depth_glb.py --in tools/local_generator/sample.jpg --out .\\tmp\\depth-test\\result.glb --quality balanced
```

## Optional: force Python path used by Electron

```powershell
setx VOLUMIA_PYTHON_PATH "C:\\path\\to\\python.exe"
```

Restart terminal/app after setting environment variables.
