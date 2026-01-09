import logging
from typing import Any, Literal

import torch
from mllm_shap.connectors import LiquidAudio, TransformersCausalText
from mllm_shap.connectors.liquid.config import CONFIG as LIQUID_AUDIO_CONFIG
from mllm_shap.connectors.transformers_text.config import CONFIG as TRANSFORMERS_TEXT_CONFIG

logger = logging.getLogger(__name__)

PRECISION_MAP = {
    "float32": torch.float32,
    "float16": torch.float16,
    "bfloat16": torch.bfloat16,
}


def load_model(
    mode: Literal["lfm2", "hf_text", "text_shap"],
    model_id: str,
    device: str,
    precision: str,
    trust_remote_code: bool,
) -> tuple[Any, Any]:
    """
    Loads a model and processor based on the mode.
    Precision arguments are ignored for LFM2 mode.
    """
    if mode == "text_shap":
        # Back-compat alias
        mode = "hf_text"

    torch_device = torch.device(device)
    if torch_device.type == "cuda" and not torch.cuda.is_available():
        logger.warning("CUDA requested but not available; falling back to CPU.")
        torch_device = torch.device("cpu")

    if mode == "lfm2":
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

    if mode == "hf_text":
        logger.info(
            "Loading Transformers text-only model from mllm-shap: %s@%s",
            TRANSFORMERS_TEXT_CONFIG.repo_id,
            TRANSFORMERS_TEXT_CONFIG.revision,
        )
        try:
            hf = TransformersCausalText(device=torch_device)
        except Exception as e:
            logger.exception("Failed to load Transformers text-only model: %s", e)
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            raise ValueError(f"Could not load Transformers text-only model. Error: {e}")

        return hf, hf.processor

    raise ValueError(f"Unsupported mode: {mode}")
