# VOLUMIA Local Generator - Windows Install

## 1) Create virtual environment

```powershell
cd <path-to-volumia-repo>
python -m venv .venv
.\.venv\Scripts\activate
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
pip install git+https://github.com/VAST-AI-Research/TripoSR.git
```

## 4) Test the local runner directly

```powershell
python tools/local_generator/run_triposr.py --image tools/local_generator/sample.jpg --preset balanced --out_glb .\tmp\triposr-test\result.glb --device cuda
```

If this succeeds, VOLUMIA can call the same script from Electron and stream progress.

## Optional: force Python path used by Electron

```powershell
setx VOLUMIA_PYTHON_PATH "C:\\path\\to\\python.exe"
```

Restart terminal/app after setting environment variables.
