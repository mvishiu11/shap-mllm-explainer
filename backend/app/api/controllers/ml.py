import logging
import time
from typing import Any

import torch
from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile

from app.models import (
    ExplainTextRequest,
    ExplainTextResponse,
    LoadModelRequest,
    LoadModelResponse,
    PredictionResponse,
    loaded_model_state,
)
from app.services.explainability import explain_text
from app.services.inference import (
    preprocess_audio,
    run_lfm2_prediction,
    run_text_shap_prediction,
)
from app.services.model_loader import load_model

logger = logging.getLogger(__name__)
router = APIRouter()


def get_model_state() -> dict[str, Any]:
    """Dependency to check for a loaded model."""
    if not loaded_model_state.get("model"):
        raise HTTPException(
            status_code=400, detail="No model loaded. Call POST /models/load first."
        )
    return loaded_model_state


@router.post("/models/load", response_model=LoadModelResponse)
async def api_load_model(request: LoadModelRequest):
    """Loads a model into memory."""
    global loaded_model_state
    try:
        if loaded_model_state.get("model"):
            logger.info("Clearing previously loaded model...")
            del loaded_model_state["model"], loaded_model_state["processor"]
            loaded_model_state.clear()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        # Use the single model_id field, as per your models.py
        actual_model_id = request.model_id
        logger.info(f"Loading model for mode '{request.mode}': {actual_model_id}")

        start_time = time.perf_counter()
        model, processor = load_model(
            mode=request.mode,
            model_id=actual_model_id,
            device=request.device,
            precision=request.precision,
            trust_remote_code=request.trust_remote_code,
        )
        load_time = time.perf_counter() - start_time

        actual_device = "cpu"
        effective_precision = request.precision
        try:
            model_param = next(model.parameters())
            actual_device = str(model_param.device)
            if request.mode == "lfm2":
                effective_precision = str(model_param.dtype).replace("torch.", "")
        except StopIteration:
            logger.warning("Model has no parameters, cannot determine device/dtype.")
            actual_device = request.device

        loaded_model_state.update(
            {
                "mode": request.mode,
                "model": model,
                "processor": processor,
                "model_id": actual_model_id,
                "device": actual_device,
                "precision": effective_precision,
            }
        )

        logger.info(f"Model loaded in {load_time:.2f}s. Effective precision: {effective_precision}")
        return LoadModelResponse(
            message=f"Model '{actual_model_id}' loaded in {load_time:.2f}s.",
            mode=request.mode,
            loaded_model_id=actual_model_id,
            device=loaded_model_state["device"],
            precision=effective_precision,
        )
    except Exception as e:
        logger.exception(f"Failed to load model: {e}")
        loaded_model_state.clear()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


@router.post("/predict", response_model=PredictionResponse)
async def api_predict(
    text_input: str | None = Body(None),
    audio_file: UploadFile | None = File(None),
    state: dict[str, Any] = Depends(get_model_state),
):
    """Runs prediction with the loaded model."""
    preprocess_start_time = time.perf_counter()
    audio_data_tensor: torch.Tensor | None = None
    sample_rate: int | None = None

    if state["mode"] == "lfm2" and audio_file:
        try:
            audio_bytes = await audio_file.read()
            target_sr = 24000
            audio_data_tensor, sample_rate = preprocess_audio(audio_bytes, target_sr=target_sr)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to process audio file: {str(e)}")
        finally:
            if audio_file:
                await audio_file.close()
    elif state["mode"] == "text_shap" and audio_file:
        if audio_file:
            await audio_file.close()

    try:
        start_time = time.perf_counter()
        if state["mode"] == "lfm2":
            generated_text = run_lfm2_prediction(
                text=text_input,
                audio_tensor=audio_data_tensor,
                sample_rate=sample_rate,
                model=state["model"],
                processor=state["processor"],
            )
        else:  # text_shap mode
            if text_input is None:
                raise HTTPException(status_code=400, detail="Text input is required for this mode.")
            generated_text = run_text_shap_prediction(
                text=text_input,
                model=state["model"],
                tokenizer=state["processor"],
                model_device=state["device"],
            )

        preprocess_time = time.perf_counter() - preprocess_start_time
        logger.info(f"Preprocessing completed in {preprocess_time:.4f} seconds.")
        inference_time = time.perf_counter() - start_time
        logger.info(f"Inference completed in {inference_time:.4f} seconds.")

        return PredictionResponse(
            generated_text=generated_text, inference_time_seconds=inference_time
        )
    except Exception as e:
        logger.exception(f"Prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/explain/text", response_model=ExplainTextResponse)
async def api_explain_text(
    request: ExplainTextRequest, state: dict[str, Any] = Depends(get_model_state)
):
    """Runs text-based SHAP explanation."""
    if state["mode"] != "text_shap":
        raise HTTPException(
            status_code=400, detail="SHAP is only available in 'text_shap' mode."
        )

    start_time = time.perf_counter()
    try:
        tokens, shap_values_list = explain_text(
            text_input=request.text_input,
            model_state=state,
            max_evals=request.max_evals,
        )
        explanation_time = time.perf_counter() - start_time
        logger.info(f"Explanation completed in {explanation_time:.4f} seconds.")

        return ExplainTextResponse(
            tokens=tokens,
            shap_values=[float(v) for v in shap_values_list],
            explanation_time_seconds=explanation_time,
        )
    except Exception as e:
        logger.exception(f"Text explanation failed: {e}")
        raise HTTPException(
            status_code=500, detail=f"Text explanation failed: {str(e)}"
        )
