from __future__ import annotations

import gc


def cleanup_memory() -> None:
    gc.collect()
    try:
        import torch  # noqa: WPS433

        if torch.cuda.is_available():
            torch.cuda.synchronize()
            torch.cuda.empty_cache()
            if hasattr(torch.cuda, "ipc_collect"):
                torch.cuda.ipc_collect()
    except Exception:
        # Best-effort cleanup: no backend crash on cleanup failures.
        return

