"""
In-process job queue using threading.
"""

import threading
import time
from typing import Dict, Optional, Callable
from .schema import JobState, JobMetadata
from ..storage import storage_manager


class JobQueue:
    """
    In-process job queue that manages job execution in background threads.
    """
    
    def __init__(self):
        """Initialize the job queue."""
        self._jobs: Dict[str, JobMetadata] = {}
        self._threads: Dict[str, threading.Thread] = {}
        self._lock = threading.RLock()
        self._job_runner: Optional[Callable] = None
    
    def set_runner(self, runner: Callable) -> None:
        """
        Set the job runner function.
        
        Args:
            runner: A callable that accepts (job_id, job_metadata)
        """
        self._job_runner = runner
    
    def enqueue(self, job_metadata: JobMetadata) -> str:
        """
        Enqueue a job for processing.
        
        Args:
            job_metadata: Job metadata
            
        Returns:
            job_id
        """
        with self._lock:
            job_id = job_metadata.id
            self._jobs[job_id] = job_metadata
            
            # Save metadata to disk
            storage_manager.save_job_metadata(job_id, job_metadata.dict(default=str))
            
            # Start processing thread
            if self._job_runner:
                thread = threading.Thread(
                    target=self._process_job,
                    args=(job_id,),
                    daemon=True
                )
                thread.start()
                self._threads[job_id] = thread
            
            return job_id
    
    def _process_job(self, job_id: str) -> None:
        """
        Process a job in a background thread.
        
        Args:
            job_id: Job ID to process
        """
        try:
            with self._lock:
                job = self._jobs.get(job_id)
                if not job:
                    return
            
            if self._job_runner:
                self._job_runner(job_id, job)
        except Exception as e:
            print(f"Error processing job {job_id}: {e}")
            with self._lock:
                if job_id in self._jobs:
                    self._jobs[job_id].state = JobState.FAILED
                    self._jobs[job_id].error = str(e)
                    storage_manager.save_job_metadata(job_id, self._jobs[job_id].dict(default=str))
    
    def get_job(self, job_id: str) -> Optional[JobMetadata]:
        """Get a job by ID."""
        with self._lock:
            return self._jobs.get(job_id)
    
    def update_job(self, job_id: str, state: JobState, progress: float = None, 
                   message: str = None, error: str = None) -> None:
        """
        Update a job's state.
        
        Args:
            job_id: Job ID
            state: New state
            progress: Progress 0-1
            message: Status message
            error: Error message if failed
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            
            job.state = state
            if progress is not None:
                job.progress = progress
            if message is not None:
                job.message = message
            if error is not None:
                job.error = error
            
            from datetime import datetime
            job.updated_at = datetime.now()
            
            # Persist to disk
            storage_manager.save_job_metadata(job_id, job.dict(default=str))
    
    def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a job.
        
        Args:
            job_id: Job ID to cancel
            
        Returns:
            True if cancelled, False if not found or already done
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            
            if job.state in [JobState.DONE, JobState.FAILED]:
                return False
            
            job.state = JobState.FAILED
            job.error = "Cancelled by user"
            storage_manager.save_job_metadata(job_id, job.dict(default=str))
            return True
    
    def list_jobs(self) -> list[JobMetadata]:
        """Get all jobs."""
        with self._lock:
            return list(self._jobs.values())


# Global job queue instance
job_queue = JobQueue()
