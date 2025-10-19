# backend/app/services/inference.py
import torch
import torchaudio
import numpy as np
import logging
from typing import Any, Optional, Tuple
import librosa
import io
import soundfile as sf
from liquid_audio import ChatState # Import LFM2 specifics

logger = logging.getLogger(__name__)

def preprocess_audio(audio_bytes: bytes, target_sr: int) -> Tuple[torch.Tensor, int]:
    """Load and preprocess audio bytes to a torch.Tensor (mono, target_sr, float32)."""
    try:
        # Read directly as float32
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype='float32')

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
    text: Optional[str],
    audio_tensor: Optional[torch.Tensor], # Expect float32 tensor
    sample_rate: Optional[int],
    model: Any, # LFM2AudioModel
    processor: Any # LFM2AudioProcessor
) -> str:
    """Runs prediction using LFM2, choosing the correct generation method based on inputs."""
    model_device = next(model.parameters()).device
    logger.info(f"Model is on device: {model_device}. Preparing inputs for LFM2 prediction.")

    chat = ChatState(processor)
    generated_token_ids = []
    
    try:
        # Determine mode based on inputs provided
        is_asr_mode = audio_tensor is not None and (text is None or text.strip() == "")
        
        if is_asr_mode:
            # --- ASR MODE ---
            logger.info("Using ASR mode with generate_sequential.")
            chat.new_turn("system")
            chat.add_text("Perform ASR.") # System prompt for ASR
            chat.end_turn()

            chat.new_turn("user")
            chat.add_audio(audio_tensor.cpu(), sample_rate) # Audio input on CPU
            chat.end_turn()

            chat.new_turn("assistant")
            
            # Use generate_sequential for ASR - note: example doesn't show audio temp/top_k here
            generation_iterator = model.generate_sequential(
                **chat, # Pass ChatState directly
                max_new_tokens=256 # Adjust as needed
            )
            logger.info("Starting LFM2 sequential generation (ASR)...")
        
        else:
            # --- CHAT MODE (Text-only or Multimodal) ---
            logger.info("Using Chat mode with generate_interleaved.")
            # Optional: Add a system prompt if desired for chat, like in the example
            # chat.new_turn("system")
            # chat.add_text("Respond with interleaved text and audio.")
            # chat.end_turn()
            
            chat.new_turn("user")
            # Add audio first if present, then text (matching example structure)
            if audio_tensor is not None:
                chat.add_audio(audio_tensor.cpu(), sample_rate)
            if text:
                chat.add_text(text)
            chat.end_turn()

            chat.new_turn("assistant")

            # Use generate_interleaved for chat
            generation_iterator = model.generate_interleaved(
                **chat, # Pass ChatState directly
                max_new_tokens=256,
                audio_temperature=0.8, # Use parameters from example
                audio_top_k=64         # Use parameters from example
            )
            logger.info("Starting LFM2 interleaved generation (Chat)...")

        # --- Collect generated text tokens ---
        for t in generation_iterator:
            # Check if t is a tensor and represents a text token (single element)
            if isinstance(t, torch.Tensor) and t.numel() == 1:
                generated_token_ids.append(t.item())
            elif isinstance(t, torch.Tensor) and t.numel() > 1:
                 # Ignore audio tokens for this endpoint
                 pass

        if not generated_token_ids:
            logger.warning("No text tokens were generated.")
            return ""

        # Decode using the text tokenizer part of the processor
        text_tokenizer = processor.text
        full_generated_text = text_tokenizer.decode(generated_token_ids, skip_special_tokens=True)
        
        # Basic cleanup
        full_generated_text = full_generated_text.strip()
        # Remove potential EOS if not skipped
        if hasattr(text_tokenizer, 'eos_token') and text_tokenizer.eos_token and full_generated_text.endswith(text_tokenizer.eos_token):
             full_generated_text = full_generated_text[:-len(text_tokenizer.eos_token)].rstrip()

        logger.info(f"LFM2 generated text: '{full_generated_text}'")
        return full_generated_text

    except Exception as e:
        logger.exception(f"Error during LFM2 generation: {e}")
        raise RuntimeError(f"LFM2 prediction failed: {e}")


def run_text_shap_prediction(
    text: str,
    model: Any, # Standard HF CausalLM
    tokenizer: Any, # Standard HF Tokenizer
    model_device: str
) -> str:
    # (This function remains unchanged)
    logger.info("Running prediction in text_shap mode.")
    # ... (rest of the function is the same) ...
    try:
        inputs = tokenizer(text, return_tensors="pt").to(model_device)
        eos_token_id = tokenizer.eos_token_id
        pad_token_id = getattr(tokenizer, 'pad_token_id', eos_token_id)

        with torch.no_grad():
            predicted_ids = model.generate(
                **inputs,
                max_new_tokens=50,
                eos_token_id=eos_token_id,
                pad_token_id=pad_token_id
            )

        input_token_len = inputs["input_ids"].shape[1]
        generated_ids = predicted_ids[:, input_token_len:]
        generated_text = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
        
        logger.info(f"Text model generated text: '{generated_text}'")
        return generated_text.strip()
    except Exception as e:
        logger.exception(f"Error during standard text prediction: {e}")
        raise RuntimeError(f"Text prediction failed: {e}")
