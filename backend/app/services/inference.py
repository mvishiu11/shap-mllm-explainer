# backend/app/services/inference.py
import io
import logging
from typing import Any

import librosa
import numpy as np
import soundfile as sf
import torch
from mllm_shap.connectors import ModelConfig
from mllm_shap.connectors.enums import Role

logger = logging.getLogger(__name__)


def preprocess_audio(audio_bytes: bytes, target_sr: int) -> tuple[torch.Tensor, int]:
    """Load and preprocess audio bytes to a torch.Tensor (mono, target_sr, float32)."""
    try:
        # Read directly as float32
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype="float32")

        # Ensure mono channel
        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=1)

        # Resample if necessary
        if sample_rate != target_sr:
            logger.info(f"Resampling audio from {sample_rate} Hz to {target_sr} Hz.")
            audio_data = librosa.resample(y=audio_data, orig_sr=sample_rate, target_sr=target_sr)
            sample_rate = target_sr

        # Return float32 tensor
        return torch.from_numpy(audio_data).unsqueeze(0), sample_rate
    except Exception as e:
        logger.exception(f"Error processing audio: {e}")
        raise ValueError(f"Could not process audio file: {e}")


def run_lfm2_prediction(
    text: str | None,
    audio_tensor: torch.Tensor | None,  # Expect float32 tensor
    sample_rate: int | None,
    model: Any,  # mllm_shap LiquidAudio connector
    processor: Any,  # kept for backward compatibility (unused)
) -> str:
    """Runs prediction using mllm-shap LiquidAudio connector."""
    logger.info("Preparing inputs for LiquidAudio prediction.")

    if audio_tensor is not None and sample_rate is None:
        raise ValueError("sample_rate must be provided when audio_tensor is provided.")

    chat = model.get_new_chat()

    is_asr_mode = audio_tensor is not None and (text is None or text.strip() == "")

    if is_asr_mode:
        chat.new_turn(Role.SYSTEM)
        chat.add_text("Perform ASR.")
        chat.end_turn()

        chat.new_turn(Role.USER)
        chat.add_audio(audio_tensor.cpu(), sample_rate)
        chat.end_turn()
    else:
        chat.new_turn(Role.USER)
        if audio_tensor is not None:
            chat.add_audio(audio_tensor.cpu(), sample_rate)
        if text:
            chat.add_text(text)
        chat.end_turn()

    try:
        response = model.generate(
            chat=chat,
            max_new_tokens=256,
            model_config=ModelConfig(text_temperature=0.2),
            keep_history=False,
        )

        token_ids = response.generated_text_tokens
        if token_ids is None or token_ids.numel() == 0:
            logger.warning("No text tokens were generated.")
            return ""

        tokenizer = model.processor.text
        full_generated_text = tokenizer.decode(token_ids.tolist(), skip_special_tokens=True).strip()
        logger.info("LiquidAudio generated text: '%s'", full_generated_text)
        return full_generated_text
    except Exception as e:
        logger.exception("Error during LiquidAudio generation: %s", e)
        raise RuntimeError(f"LiquidAudio prediction failed: {e}")
