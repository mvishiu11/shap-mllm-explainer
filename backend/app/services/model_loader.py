# backend/app/services/model_loader.py
import logging
from typing import Any, Literal

import torch
from mllm_shap.connectors import LiquidAudio
from mllm_shap.connectors.liquid.config import CONFIG as LIQUID_AUDIO_CONFIG

logger = logging.getLogger(__name__)

# Kept for backward-compatible request payloads (ignored for LiquidAudio)
PRECISION_MAP = {
    "float32": torch.float32,
    "float16": torch.float16,
    "bfloat16": torch.bfloat16,
}


def load_model(
    mode: Literal["lfm2", "text_shap"],
    model_id: str,
    device: str,
    precision: str,  # Keep param but ignore for lfm2
    trust_remote_code: bool,
) -> tuple[Any, Any]:  # Return only model, processor
    """
    Loads a model and processor based on the mode.
    Precision arguments are ignored for LFM2 mode.
    """
    # We only support LiquidAudio through `mllm-shap`.
    if mode != "lfm2":
        logger.warning("Requested mode '%s' is deprecated; loading LiquidAudio anyway.", mode)

    torch_device = torch.device(device)
    if torch_device.type == "cuda" and not torch.cuda.is_available():
        logger.warning("CUDA requested but not available; falling back to CPU.")
        torch_device = torch.device("cpu")

    logger.info(
        "Loading LiquidAudio model from mllm-shap: %s@%s",
        LIQUID_AUDIO_CONFIG.repo_id,
        LIQUID_AUDIO_CONFIG.revision,
    )
    try:
        liquid = LiquidAudio(device=torch_device)
    except Exception as e:
        logger.exception("Failed to load LiquidAudio model: %s", e)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        raise ValueError(f"Could not load LiquidAudio model. Error: {e}")

    # Keep return shape consistent with old API: (model, processor)
    return liquid, liquid.processor
