"""
Device detection and capability management.
Detects CUDA availability, memory, and CPU info.
"""

import platform
import psutil
from typing import Dict, Any


class DeviceManager:
    """Manages device detection (CUDA/CPU) and system info."""
    
    @staticmethod
    def get_device_info() -> Dict[str, Any]:
        """
        Get current device info including CUDA availability.
        
        Returns:
            dict: Device capabilities and system info
        """
        info = {
            "cuda_available": False,
            "device": "cpu",
            "device_name": "CPU",
            "compute_capacity": None,
            "memory_mb": None,
            "gpu_memory_mb": None,
            "platform": platform.system(),
            "processor": platform.processor(),
        }
        
        # Check for CUDA availability
        try:
            import torch  # type: ignore
            if torch.cuda.is_available():
                info["cuda_available"] = True
                info["device"] = "cuda"
                info["device_name"] = torch.cuda.get_device_name(0)
                info["gpu_memory_mb"] = torch.cuda.get_device_properties(0).total_memory // (1024 * 1024)
                info["compute_capacity"] = f"{torch.cuda.get_device_capability(0)[0]}.{torch.cuda.get_device_capability(0)[1]}"
        except Exception:
            # PyTorch not installed or CUDA unavailable - fall back to CPU
            pass
        
        # System memory
        mem = psutil.virtual_memory()
        info["memory_mb"] = mem.total // (1024 * 1024)
        info["available_memory_mb"] = mem.available // (1024 * 1024)
        
        return info


device_manager = DeviceManager()
