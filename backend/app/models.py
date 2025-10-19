# backend/app/models.py
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal

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
    precision: str # Reports requested/used precision

class PredictionResponse(BaseModel):
    """Response containing the model's prediction."""
    generated_text: str
    inference_time_seconds: float

class ExplainTextResponse(BaseModel):
    """Response containing SHAP values for text."""
    tokens: List[str]
    shap_values: List[float]
    explanation_time_seconds: float

# --- Global State ---
loaded_model_state: Dict[str, Any] = {
    "mode": None,
    "model": None,
    "processor": None,
    "model_id": None,
    "device": None,
    "precision": None, # Store requested/used precision
}
