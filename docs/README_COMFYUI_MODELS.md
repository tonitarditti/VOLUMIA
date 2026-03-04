# ComfyUI Models for VOLUMIA Multiview

## Required Files

Place these files in your local ComfyUI installation:

- `models/checkpoints/sd_xl_base_1.0.safetensors`
- `models/controlnet/controlnet-canny-sdxl-1.0.safetensors`

VOLUMIA also accepts equivalent names detected in ComfyUI dropdowns:

- Checkpoint: any name containing `sd_xl_base_1.0`
- ControlNet: any name containing both `canny` and `sdxl`

## Installation Steps (Windows)

1. Download `sd_xl_base_1.0.safetensors` from Stability AI / Hugging Face.
2. Download `controlnet-canny-sdxl-1.0.safetensors` from an SDXL ControlNet source.
3. Copy files to your ComfyUI folders:
   - `ComfyUI\models\checkpoints\`
   - `ComfyUI\models\controlnet\`
4. Restart ComfyUI.
5. Open ComfyUI and verify both models are visible in:
   - `CheckpointLoaderSimple`
   - `ControlNetLoader`

## Endpoint Requirement

VOLUMIA expects ComfyUI running locally at:

- `http://127.0.0.1:8188`

## TripoSR Multiview Strategy

Current integration uses `best_of_views`:

1. Generate 6 deterministic views in `project-assets/<jobId>/views/`
2. Run TripoSR per view (3-6 candidates depending on available files)
3. Score candidates with geometric heuristics (faces, bbox ratio, watertight, size)
4. Keep the best GLB as final output

This avoids forcing mesh fusion while still consuming multiview inputs.
