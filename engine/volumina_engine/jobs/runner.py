"""
Job execution runner.
Contains placeholder pipeline steps that create dummy outputs.
"""

import time
import io
from pathlib import Path
from .schema import JobState, JobMetadata
from .queue import job_queue
from ..storage import storage_manager


class JobRunner:
    """Executes jobs through the pipeline."""
    
    @staticmethod
    def run_job(job_id: str, job: JobMetadata) -> None:
        """
        Run a single job through the full pipeline.
        Placeholder implementation that creates dummy outputs.
        
        Args:
            job_id: Job ID
            job: Job metadata
        """
        try:
            # Step 1: Preprocessing
            JobRunner._step_preprocessing(job_id, job)
            job_queue.update_job(job_id, JobState.PREPROCESSING, progress=0.1, 
                                message="Preprocessing image...")
            time.sleep(1)  # Simulate processing time
            
            # Step 2: Reconstructing
            JobRunner._step_reconstructing(job_id, job)
            job_queue.update_job(job_id, JobState.RECONSTRUCTING, progress=0.4,
                                message="Reconstructing 3D model...")
            time.sleep(2)  # Simulate processing time
            
            # Step 3: Postprocessing
            JobRunner._step_postprocessing(job_id, job)
            job_queue.update_job(job_id, JobState.POSTPROCESSING, progress=0.7,
                                message="Refining geometry...")
            time.sleep(1)  # Simulate processing time
            
            # Step 4: Exporting
            JobRunner._step_exporting(job_id, job)
            job_queue.update_job(job_id, JobState.EXPORTING, progress=0.9,
                                message="Exporting to OBJ/GLB...")
            time.sleep(1)  # Simulate processing time
            
            # Done
            job_queue.update_job(job_id, JobState.DONE, progress=1.0,
                                message="Model generated successfully!")
            storage_manager.append_log(job_id, "Job completed successfully.")
            
        except Exception as e:
            storage_manager.append_log(job_id, f"Error: {str(e)}")
            job_queue.update_job(job_id, JobState.FAILED, error=str(e))
    
    @staticmethod
    def _step_preprocessing(job_id: str, job: JobMetadata) -> None:
        """
        Preprocessing step: validate images, normalize dimensions.
        Placeholder: just log it.
        """
        storage_manager.append_log(job_id, "Starting preprocessing...")
        storage_manager.append_log(job_id, f"Preset: {job.preset}, Detail: {job.detail}, Units: {job.units}")
        storage_manager.append_log(job_id, "Image validation complete.")
    
    @staticmethod
    def _step_reconstructing(job_id: str, job: JobMetadata) -> None:
        """
        Reconstruction step: main AI processing.
        Placeholder: log progress.
        """
        storage_manager.append_log(job_id, "Starting 3D reconstruction...")
        storage_manager.append_log(job_id, "Model vertices computed.")
        storage_manager.append_log(job_id, "Mesh topology generated.")
    
    @staticmethod
    def _step_postprocessing(job_id: str, job: JobMetadata) -> None:
        """
        Postprocessing step: smoothing, detailing, cleanup.
        Placeholder: log progress.
        """
        storage_manager.append_log(job_id, "Smoothing geometry...")
        storage_manager.append_log(job_id, "Applying detail enhancements...")
    
    @staticmethod
    def _step_exporting(job_id: str, job: JobMetadata) -> None:
        """
        Export step: create OBJ, MTL, GLB files.
        Creates DUMMY files so the UI can work.
        """
        job_folder = storage_manager.get_job_folder(job_id)
        output_dir = job_folder / "output"
        
        storage_manager.append_log(job_id, "Exporting assets...")
        
        # Create dummy OBJ file
        if job.output_obj:
            obj_content = """# VOLUMIA Generated Model
# Placeholder OBJ file
# TODO: Replace with actual reconstruction output

mtllib model.mtl

v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 1.0 1.0 0.0
v 0.0 1.0 0.0

vn 0.0 0.0 1.0

usemtl material1
f 1/1/1 2/1/1 3/1/1
f 1/1/1 3/1/1 4/1/1
"""
            obj_file = output_dir / "model.obj"
            obj_file.write_text(obj_content)
            
            # Create dummy MTL file
            mtl_content = """# VOLUMIA Material Library
newmtl material1
Ka 0.9 0.85 0.8
Kd 0.9 0.85 0.8
Ks 0.1 0.1 0.1
Ns 32.0
"""
            mtl_file = output_dir / "model.mtl"
            mtl_file.write_text(mtl_content)
            
            storage_manager.append_log(job_id, f"OBJ exported: {obj_file.name}")
            
            # Update job outputs
            updated_job = job_queue.get_job(job_id)
            if updated_job:
                updated_job.outputs["obj"] = str(obj_file)
                updated_job.outputs["mtl"] = str(mtl_file)
        
        # Create dummy GLB file
        if job.output_glb:
            glb_file = output_dir / "model.glb"
            # Write minimal GLB structure (magic number + placeholder)
            glb_file.write_bytes(b"glTF" + b"\x00" * 10)
            storage_manager.append_log(job_id, f"GLB exported: {glb_file.name}")
            
            updated_job = job_queue.get_job(job_id)
            if updated_job:
                updated_job.outputs["glb"] = str(glb_file)
        
        # Include textures info if requested
        if job.textures:
            storage_manager.append_log(job_id, "Texture maps generated (baked)")


# Global runner instance
job_runner = JobRunner()
