# TripoSR Windows Runtime Notes

This project uses a Windows-compatible runtime path that avoids building `torchmcubes` wheels.

## Dependency change

- Removed: `torchmcubes`
- Added: `PyMCubes`

## Why

On Windows, `torchmcubes` frequently fails to build from source (`Failed building wheel for torchmcubes`).

## Runtime compatibility

The local runners install a compatibility shim:

- If `torchmcubes` is available, it is used as usual.
- If not available, the shim maps `torchmcubes.marching_cubes(...)` to `PyMCubes`:
  - `import mcubes`
  - `verts, faces = mcubes.marching_cubes(volume, level)`
  - Converts outputs back to torch tensors so downstream mesh export remains unchanged.

## Install

```powershell
pip install PyMCubes
```

If missing at runtime, the app raises a clear error:

`PyMCubes is required when torchmcubes is unavailable. Install with: pip install PyMCubes`
