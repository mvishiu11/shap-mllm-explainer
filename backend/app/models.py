# backend/app/models.py
from typing import Any, Literal, Optional
import logging

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, JSON, Column, Field as SQLModelField
from datetime import datetime

logger = logging.getLogger(__name__)


# --- Request Models ---
class LoadModelRequest(BaseModel):
    """Request body for loading a model."""

    model_id: str = Field(..., description="Hugging Face model ID for LFM2 mode")
    mode: Literal["lfm2", "text_shap"] = Field("lfm2", description="Mode: 'lfm2' for LiquidAI model, 'text_shap' for SHAP demo text model.")
    device: str = Field("cuda", description="Device ('cuda', 'cpu', 'mps')")
    precision: str = Field("float16", description="Precision ('float32', 'float16', 'bfloat16', 'int8') - Ignored for LFM2 mode.")
    trust_remote_code: bool = Field(True, description="Trust remote code execution (required for some models like LFM2)")


class ExplainTextRequest(BaseModel):
    """Request body for text explanation."""

    text_input: str = Field(..., description="The text input to explain (without special formatting)")
    max_evals: int = Field(256, description="Number of evaluations for SHAP approximation")


# --- Response Models ---
class LoadModelResponse(BaseModel):
    """Response after loading a model."""

    message: str
    mode: str
    loaded_model_id: str
    device: str
    precision: str  # Reports requested/used precision


class PredictionResponse(BaseModel):
    """Response containing the model's prediction."""

    generated_text: str
    inference_time_seconds: float


class ExplainTextResponse(BaseModel):
    """Response containing SHAP values for text."""

    tokens: list[str]
    shap_values: list[float]
    explanation_time_seconds: float


# --- Database Models for Sessions ---
class SessionBase(SQLModel):
    """
    Base model for a session. Contains all shared fields.
    """
    name: str = SQLModelField(index=True)
    text_input: Optional[str] = None

    # Store complex objects as JSON in the database
    model_settings: dict = SQLModelField(default={}, sa_column=Column(JSON))
    method_settings: dict = SQLModelField(default={}, sa_column=Column(JSON))
    attributions: dict = SQLModelField(default={}, sa_column=Column(JSON))


class Session(SessionBase, table=True):
    """
    The database table model.
    """
    id: Optional[int] = SQLModelField(default=None, primary_key=True)
    created_at: datetime = SQLModelField(default_factory=datetime.utcnow, nullable=False)


class SessionCreate(SessionBase):
    """
    The Pydantic model used when CREATING a session via the API.
    """
    pass


class SessionRead(SessionBase):
    """
    The Pydantic model used when READING a session from the API.
    Includes fields from the table model.
    """
    id: int
    created_at: datetime


class SessionReadList(SQLModel):
    """
    A lightweight model for listing sessions (e.g., in the sidebar).
    """
    id: int
    name: str
    created_at: datetime


# --- Global State ---
loaded_model_state: dict[str, Any] = {
    "mode": None,
    "model": None,
    "processor": None,
    "model_id": None,
    "device": None,
    "precision": None,  # Store requested/used precision
}
