from __future__ import annotations

import os

import uvicorn


if __name__ == "__main__":
    host = "127.0.0.1"
    port = int(os.getenv("VOLUMIA_SERVICE_PORT", "7860"))
    uvicorn.run("app.main:app", host=host, port=port, reload=False, log_level="info")
