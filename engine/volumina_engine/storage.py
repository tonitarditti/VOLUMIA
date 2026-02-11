"""
Job storage management.
Handles job folder structure and persistence.
"""

import os
import json
import uuid
from pathlib import Path
from typing import Dict, Any, Optional


class StorageManager:
    """
    Manages job storage in %APPDATA%\Volumia\jobs\
    or cross-platform equivalent.
    """
    
    @staticmethod
    def get_jobs_root() -> Path:
        """
        Get the root jobs directory.
        Windows: %APPDATA%\Volumia\jobs
        macOS/Linux: ~/.volumia/jobs
        """
        if os.name == 'nt':  # Windows
            appdata = os.getenv('APPDATA')
            root = Path(appdata) / "Volumia" / "jobs"
        else:  # macOS/Linux
            root = Path.home() / ".volumia" / "jobs"
        
        root.mkdir(parents=True, exist_ok=True)
        return root
    
    @staticmethod
    def create_job_folder(job_id: Optional[str] = None) -> tuple[str, Path]:
        """
        Create a new job folder.
        
        Args:
            job_id: Optional job ID. If None, generates a UUID.
            
        Returns:
            tuple: (job_id, job_folder_path)
        """
        if job_id is None:
            job_id = str(uuid.uuid4())
        
        job_folder = StorageManager.get_jobs_root() / job_id
        job_folder.mkdir(parents=True, exist_ok=True)
        
        # Create subdirectories
        (job_folder / "output").mkdir(exist_ok=True)
        (job_folder / "logs").mkdir(exist_ok=True)
        
        return job_id, job_folder
    
    @staticmethod
    def get_job_folder(job_id: str) -> Path:
        """Get the folder for a specific job."""
        return StorageManager.get_jobs_root() / job_id
    
    @staticmethod
    def save_job_metadata(job_id: str, metadata: Dict[str, Any]) -> None:
        """Save job metadata to job.json."""
        job_folder = StorageManager.get_job_folder(job_id)
        metadata_file = job_folder / "job.json"
        
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2, default=str)
    
    @staticmethod
    def load_job_metadata(job_id: str) -> Optional[Dict[str, Any]]:
        """Load job metadata from job.json."""
        job_folder = StorageManager.get_job_folder(job_id)
        metadata_file = job_folder / "job.json"
        
        if not metadata_file.exists():
            return None
        
        with open(metadata_file, 'r') as f:
            return json.load(f)
    
    @staticmethod
    def append_log(job_id: str, message: str) -> None:
        """Append a message to the job's log file."""
        job_folder = StorageManager.get_job_folder(job_id)
        log_file = job_folder / "logs" / "process.log"
        
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(message + '\n')


storage_manager = StorageManager()
