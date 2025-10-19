# backend/app/services/model_loader.py
import logging
from typing import Any, Literal

import torch
from liquid_audio import LFM2AudioModel, LFM2AudioProcessor
from transformers import AutoModelForCausalLM, AutoTokenizer

logger = logging.getLogger(__name__)

# Keep map for text_shap mode
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
    logger.info(f"Attempting to load model in mode '{mode}': {model_id}")

    if mode == "lfm2":
        if not trust_remote_code:
            logger.warning("LFM2 mode requires trust_remote_code=True. Enabling it.")
            trust_remote_code = True
        try:
            logger.info("Loading LFM2 processor...")
            processor = LFM2AudioProcessor.from_pretrained(model_id)
            logger.info("Loading LFM2 model (using default precision)...")
            # **FIX: Remove all precision kwargs, load with library defaults**
            model = LFM2AudioModel.from_pretrained(model_id)
            logger.info(f"LFM2 model loaded with its default dtype: {next(model.parameters()).dtype}")

        except Exception as e:
            logger.exception(f"Failed to load LFM2 model or processor for {model_id}: {e}")
            raise ValueError(f"Could not load LFM2 model/processor. Error: {e}")

    elif mode == "text_shap":
        torch_dtype = PRECISION_MAP.get(precision)
        load_kwargs = {"low_cpu_mem_usage": True, "torch_dtype": torch_dtype}
        if precision == "int8":
            logger.info("Attempting int8 quantization for text_shap model.")
            load_kwargs["load_in_8bit"] = True
            load_kwargs.pop("torch_dtype", None)

        try:
            processor = AutoTokenizer.from_pretrained(model_id)
            model = AutoModelForCausalLM.from_pretrained(model_id, **load_kwargs)
        except Exception as e:
            logger.exception(f"Failed to load text_shap model/tokenizer for {model_id}: {e}")
            raise ValueError(f"Could not load text_shap model/tokenizer. Error: {e}")
    else:
        raise ValueError(f"Invalid mode specified: {mode}")

    # Move model to device (unless using int8 which handles it)
    if precision != "int8" or mode == "lfm2":  # Always move LFM2 after loading
        try:
            model.to(device)
            logger.info(f"Model moved to requested device: {device}")
        except Exception as e:
            logger.exception(f"Failed to move model to device {device}: {e}")
            del model, processor
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            raise RuntimeError(f"Failed to move model to device {device}: {e}")
    else:
        logger.info("Device placement for int8 text_shap model handled by bitsandbytes.")

    model.eval()
    # Return only model and processor
    return model, processor
