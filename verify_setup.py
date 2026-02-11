#!/usr/bin/env python3
"""
VOLUMIA Setup Verification Script
Checks that all files and dependencies are in place.
"""

import os
import sys
from pathlib import Path

def check_file(path, label):
    """Check if file exists."""
    exists = Path(path).exists()
    status = "✓" if exists else "✗"
    print(f"  {status} {label}")
    return exists

def check_directory(path, label):
    """Check if directory exists."""
    exists = Path(path).is_dir()
    status = "✓" if exists else "✗"
    print(f"  {status} {label}")
    return exists

def main():
    print("VOLUMIA Setup Verification\n")
    
    root = Path(__file__).parent
    all_good = True
    
    # Check root files
    print("📁 Root files:")
    all_good &= check_file(root / ".gitignore", ".gitignore")
    all_good &= check_file(root / "README.md", "README.md")
    all_good &= check_file(root / "DEPLOYMENT.md", "DEPLOYMENT.md")
    
    # Check directories
    print("\n📁 Directories:")
    all_good &= check_directory(root / "engine", "engine/")
    all_good &= check_directory(root / "desktop", "desktop/")
    all_good &= check_directory(root / "docs", "docs/")
    
    # Check engine
    print("\n🐍 Engine (Python):")
    all_good &= check_file(root / "engine" / "requirements.txt", "requirements.txt")
    all_good &= check_file(root / "engine" / "run_engine.py", "run_engine.py")
    all_good &= check_directory(root / "engine" / "volumina_engine", "volumina_engine/")
    all_good &= check_file(root / "engine" / "volumina_engine" / "__init__.py", "__init__.py")
    all_good &= check_file(root / "engine" / "volumina_engine" / "main.py", "main.py (FastAPI app)")
    all_good &= check_file(root / "engine" / "volumina_engine" / "device.py", "device.py (GPU detection)")
    all_good &= check_file(root / "engine" / "volumina_engine" / "storage.py", "storage.py (Job storage)")
    all_good &= check_directory(root / "engine" / "volumina_engine" / "jobs", "jobs/")
    all_good &= check_file(root / "engine" / "volumina_engine" / "jobs" / "schema.py", "schema.py (Models)")
    all_good &= check_file(root / "engine" / "volumina_engine" / "jobs" / "queue.py", "queue.py (Job queue)")
    all_good &= check_file(root / "engine" / "volumina_engine" / "jobs" / "runner.py", "runner.py (Pipeline)")
    
    # Check desktop
    print("\n⚛️  Desktop (React + Electron):")
    all_good &= check_file(root / "desktop" / "package.json", "package.json")
    all_good &= check_file(root / "desktop" / "tsconfig.json", "tsconfig.json")
    all_good &= check_file(root / "desktop" / "vite.config.ts", "vite.config.ts")
    all_good &= check_directory(root / "desktop" / "src", "src/")
    all_good &= check_file(root / "desktop" / "src" / "App.tsx", "App.tsx (Root)")
    all_good &= check_file(root / "desktop" / "src" / "main.tsx", "main.tsx (Entry)")
    all_good &= check_directory(root / "desktop" / "src" / "components", "components/")
    all_good &= check_file(root / "desktop" / "src" / "components" / "TopBar.tsx", "TopBar.tsx")
    all_good &= check_file(root / "desktop" / "src" / "components" / "LeftSidebar.tsx", "LeftSidebar.tsx")
    all_good &= check_file(root / "desktop" / "src" / "components" / "MainStage.tsx", "MainStage.tsx")
    all_good &= check_file(root / "desktop" / "src" / "components" / "StatusBar.tsx", "StatusBar.tsx")
    all_good &= check_directory(root / "desktop" / "src" / "stores", "stores/")
    all_good &= check_file(root / "desktop" / "src" / "stores" / "settings.store.ts", "settings.store.ts")
    all_good &= check_file(root / "desktop" / "src" / "stores" / "job.store.ts", "job.store.ts")
    all_good &= check_directory(root / "desktop" / "src" / "services", "services/")
    all_good &= check_file(root / "desktop" / "src" / "services" / "engineClient.ts", "engineClient.ts")
    all_good &= check_directory(root / "desktop" / "src" / "styles", "styles/")
    all_good &= check_file(root / "desktop" / "src" / "styles" / "tokens.css", "tokens.css (Design tokens)")
    all_good &= check_file(root / "desktop" / "src" / "styles" / "app.css", "app.css (Component styles)")
    all_good &= check_directory(root / "desktop" / "electron", "electron/")
    all_good &= check_file(root / "desktop" / "electron" / "main.ts", "main.ts (Electron main)")
    all_good &= check_file(root / "desktop" / "electron" / "preload.ts", "preload.ts (Preload)")
    all_good &= check_directory(root / "desktop" / "public", "public/")
    all_good &= check_file(root / "desktop" / "public" / "index.html", "index.html")
    
    # Check docs
    print("\n📚 Documentation:")
    all_good &= check_file(root / "docs" / "quickstart.md", "quickstart.md")
    all_good &= check_file(root / "docs" / "architecture.md", "architecture.md")
    
    # Summary
    print("\n" + "=" * 50)
    if all_good:
        print("✓ All files in place! Ready to run.")
        print("\n📖 Next steps:")
        print("  1. cd engine && python -m venv venv && venv\\\\Scripts\\\\activate")
        print("  2. pip install -r requirements.txt")
        print("  3. python run_engine.py")
        print("  4. (New terminal) cd desktop && npm install && npm run dev")
        return 0
    else:
        print("✗ Some files are missing. Check above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
