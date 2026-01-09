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


def preprocess_audio_to_wav_bytes(audio_bytes: bytes, target_sr: int) -> bytes:
    """Normalize arbitrary audio bytes into 24kHz mono WAV bytes.

    mllm-shap's Chat.add_audio expects bytes + an audio format string.
    We standardize to WAV so the connector always decodes reliably.
    """
    try:
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype="float32")

        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=1)

        if sample_rate != target_sr:
            logger.info("Resampling audio from %s Hz to %s Hz.", sample_rate, target_sr)
            audio_data = librosa.resample(y=audio_data, orig_sr=sample_rate, target_sr=target_sr)
            sample_rate = target_sr

        buf = io.BytesIO()
        # PCM_16 is widely supported by decoders.
        sf.write(buf, audio_data, sample_rate, format="WAV", subtype="PCM_16")
        return buf.getvalue()
    except Exception as e:
        logger.exception("Error processing audio to WAV bytes: %s", e)
        raise ValueError(f"Could not process audio file: {e}")


def run_lfm2_prediction(
    text: str | None,
    audio_wav_bytes: bytes | None,
    model: Any,  # mllm_shap LiquidAudio connector
    processor: Any,  # kept for backward compatibility (unused)
) -> str:
    """Runs prediction using mllm-shap LiquidAudio connector."""
    logger.info("Preparing inputs for LiquidAudio prediction.")

    chat = model.get_new_chat()

    is_asr_mode = audio_wav_bytes is not None and (text is None or text.strip() == "")

    if is_asr_mode:
        chat.new_turn(Role.SYSTEM)
        chat.add_text("Perform ASR.")
        chat.end_turn()

        chat.new_turn(Role.USER)
        chat.add_audio(audio_wav_bytes, "wav")
        chat.end_turn()
    else:
        chat.new_turn(Role.USER)
        if audio_wav_bytes is not None:
            chat.add_audio(audio_wav_bytes, "wav")
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


def run_hf_text_prediction(
    text: str,
    model: Any,  # mllm_shap TransformersCausalText connector
    processor: Any,  # kept for backward compatibility (unused)
) -> str:
    """Runs text-only prediction using mllm-shap TransformersCausalText connector."""
    if not text or not text.strip():
        return ""

    chat = model.get_new_chat()
    chat.new_turn(Role.USER)
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

        tokenizer = model.processor
        full_generated_text = tokenizer.decode(token_ids.tolist(), skip_special_tokens=True).strip()
        logger.info("HF text generated: '%s'", full_generated_text)
        return full_generated_text
    except Exception as e:
        logger.exception("Error during HF text generation: %s", e)
        raise RuntimeError(f"HF text prediction failed: {e}")
