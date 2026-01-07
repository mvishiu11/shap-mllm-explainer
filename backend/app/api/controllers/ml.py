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
from app.services.progress import get_job
from app.services.inference import (
    preprocess_audio,
    run_lfm2_prediction,
)
from app.services.model_loader import load_model

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/diagnostics")
async def api_diagnostics():
    model = loaded_model_state.get("model")
    model_device = None
    if model is not None:
        model_device = str(getattr(model, "device", None))

    cuda_available = torch.cuda.is_available()
    cuda_device_count = torch.cuda.device_count() if cuda_available else 0
    cuda_name = None
    if cuda_available and cuda_device_count > 0:
        try:
            cuda_name = torch.cuda.get_device_name(0)
        except Exception:
            cuda_name = None

    return {
        "cuda_available": cuda_available,
        "cuda_device_count": cuda_device_count,
        "cuda_device_name_0": cuda_name,
        "torch_version": torch.__version__,
        "loaded": model is not None,
        "loaded_model_id": loaded_model_state.get("model_id"),
        "loaded_device": loaded_model_state.get("device"),
        "model_device_attr": model_device,
    }


@router.get("/progress/{job_id}")
async def api_progress(job_id: str):
    state = get_job(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return state.to_dict()


def get_model_state() -> dict[str, Any]:
    """Dependency to check for a loaded model."""
    if not loaded_model_state.get("model"):
        raise HTTPException(status_code=400, detail="No model loaded. Call POST /models/load first.")
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

        # Backward compatible: request.mode/model_id are accepted but ignored.
        # We always load the supported LiquidAudio model through mllm-shap.
        actual_model_id = request.model_id
        logger.info(
            "Loading LiquidAudio model via mllm-shap (requested mode='%s', model_id='%s')",
            request.mode,
            actual_model_id,
        )

        start_time = time.perf_counter()
        model, processor = load_model(
            mode=request.mode,
            model_id=actual_model_id,
            device=request.device,
            precision=request.precision,
            trust_remote_code=request.trust_remote_code,
        )
        load_time = time.perf_counter() - start_time

        actual_device = str(getattr(model, "device", request.device))
        effective_precision = "default"

        loaded_model_state.update(
            {
                "mode": "lfm2",
                "model": model,
                "processor": processor,
                "model_id": (
                    f"{getattr(getattr(model, 'config', None), 'repo_id', actual_model_id)}"
                    f"@{getattr(getattr(model, 'config', None), 'revision', 'unknown')}"
                ),
                "device": actual_device,
                "precision": effective_precision,
            }
        )

        logger.info("Model loaded in %.2fs. Device=%s", load_time, actual_device)
        return LoadModelResponse(
            message=f"LiquidAudio model loaded in {load_time:.2f}s.",
            mode="lfm2",
            loaded_model_id=loaded_model_state["model_id"],
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

    if audio_file:
        try:
            audio_bytes = await audio_file.read()
            target_sr = 24000
            audio_data_tensor, sample_rate = preprocess_audio(audio_bytes, target_sr=target_sr)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to process audio file: {str(e)}")
        finally:
            if audio_file:
                await audio_file.close()

    try:
        start_time = time.perf_counter()
        generated_text = run_lfm2_prediction(
            text=text_input,
            audio_tensor=audio_data_tensor,
            sample_rate=sample_rate,
            model=state["model"],
            processor=state["processor"],
        )

        preprocess_time = time.perf_counter() - preprocess_start_time
        logger.info(f"Preprocessing completed in {preprocess_time:.4f} seconds.")
        inference_time = time.perf_counter() - start_time
        logger.info(f"Inference completed in {inference_time:.4f} seconds.")

        return PredictionResponse(generated_text=generated_text, inference_time_seconds=inference_time)
    except Exception as e:
        logger.exception(f"Prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/explain/text", response_model=ExplainTextResponse)
async def api_explain_text(request: ExplainTextRequest, state: dict[str, Any] = Depends(get_model_state)):
    """Runs text explanation using mllm-shap (LiquidAudio only)."""

    start_time = time.perf_counter()
    try:
        tokens, shap_values_list = explain_text(
            text_input=request.text_input,
            model_state=state,
            max_evals=request.max_evals,
            job_id=request.job_id,
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
        raise HTTPException(status_code=500, detail=f"Text explanation failed: {str(e)}")
