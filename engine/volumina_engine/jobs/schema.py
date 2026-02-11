"""
Job queue schema and data models.
"""

from enum import Enum
from typing import Dict, Any, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class JobState(str, Enum):
    """Job lifecycle states."""
    CREATED = "created"
    PREPROCESSING = "preprocessing"
    RECONSTRUCTING = "reconstructing"
    POSTPROCESSING = "postprocessing"
    EXPORTING = "exporting"
    DONE = "done"
    WARNING = "warning"
    FAILED = "failed"


class JobRequest(BaseModel):
    """Request body for creating a new job."""
    preset: str = Field(default="interior", description="Preset: furniture, interior, architecture, etc.")
    units: str = Field(default="cm", description="Units: cm or m")
    detail: str = Field(default="medium", description="Detail level: low, medium, high")
    output_obj: bool = Field(default=True, description="Export as OBJ")
    output_glb: bool = Field(default=False, description="Export as GLB")
    textures: bool = Field(default=True, description="Include textures")
    images: List[str] = Field(default=[], description="Image data (base64 or paths)")


class JobResponse(BaseModel):
    """Response with job metadata and status."""
    id: str
    state: JobState
    created_at: datetime
    updated_at: datetime
    preset: str
    units: str
    detail: str
    output_obj: bool
    output_glb: bool
    textures: bool
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    message: str = ""
    logs: List[str] = []
    outputs: Dict[str, str] = {}  # { "obj": "path", "glb": "path", etc. }
    error: Optional[str] = None


class JobMetadata(BaseModel):
    """Internal job metadata stored in job.json."""
    id: str
    state: JobState
    created_at: datetime
    updated_at: datetime
    preset: str
    units: str
    detail: str
    output_obj: bool
    output_glb: bool
    textures: bool
    progress: float = 0.0
    message: str = ""
    error: Optional[str] = None
    input_images: List[str] = []
    outputs: Dict[str, str] = {}
