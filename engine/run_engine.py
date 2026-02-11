"""
Engine entry point.
Starts the FastAPI server with Uvicorn.
"""

import uvicorn
import sys


def main():
    """Start the VOLUMIA engine server."""
    host = "127.0.0.1"
    port = 7860
    
    print(f"Starting VOLUMIA Engine on {host}:{port}...")
    print(f"API docs available at http://{host}:{port}/docs")
    
    uvicorn.run(
        "volumina_engine.main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nShutting down VOLUMIA Engine...")
        sys.exit(0)
