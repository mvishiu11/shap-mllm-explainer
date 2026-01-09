import logging
import time
from typing import Any

import torch
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.models import (
    ExplainTextRequest,
    ExplainTextResponse,
    LoadModelRequest,
    LoadModelResponse,
    PredictionResponse,
    loaded_model_state,
)
from app.services.explainability import explain_multimodal, explain_text
from app.services.progress import get_job
from app.services.progress import cancel_job
from app.services.job_logging import get_job_logs
from app.services.telemetry import get_telemetry_snapshot
from app.services.inference import (
    preprocess_audio_to_wav_bytes,
    run_hf_text_prediction,
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


@router.post("/cancel/{job_id}")
async def api_cancel(job_id: str):
    """Requests cooperative cancellation for a running attribution job."""
    state = get_job(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    if state.status in ("done", "error", "cancelled"):
        return {"ok": True, "status": state.status}
    cancel_job(job_id, message="Cancellation requested")
    return {"ok": True, "status": "cancelled"}


@router.get("/logs/{job_id}")
async def api_logs(job_id: str, last: int = 200):
    """Returns the last N log lines captured during a job's execution."""
    lines = get_job_logs(job_id, last=last)
    if lines is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return {"job_id": job_id, "lines": lines}


@router.get("/telemetry")
async def api_telemetry():
    """Returns real host/container telemetry (CPU/RAM/process + GPU if available)."""
    return get_telemetry_snapshot().to_dict()


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

        requested_mode = request.mode
        actual_model_id = request.model_id
        logger.info(
            "Loading model via mllm-shap (requested mode='%s', model_id='%s')",
            requested_mode,
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

        config_obj = getattr(model, "config", None)
        loaded_model_state.update(
            {
                "mode": requested_mode,
                "model": model,
                "processor": processor,
                "model_id": (
                    f"{getattr(config_obj, 'repo_id', actual_model_id)}@{getattr(config_obj, 'revision', 'unknown')}"
                ),
                "device": actual_device,
                "precision": effective_precision,
            }
        )

        logger.info("Model loaded in %.2fs. Device=%s", load_time, actual_device)

        loaded_mode = loaded_model_state.get("mode") or request.mode
        model_label = "LiquidAudio" if loaded_mode == "lfm2" else "HF text-only"
        return LoadModelResponse(
            message=f"{model_label} model loaded in {load_time:.2f}s.",
            mode=loaded_mode,
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
    mode = str(state.get("mode") or "").strip() or "lfm2"

    audio_wav_bytes: bytes | None = None

    if audio_file and mode != "lfm2":
        raise HTTPException(status_code=400, detail="Audio input is only supported for LiquidAudio (mode='lfm2').")

    if audio_file:
        try:
            audio_bytes = await audio_file.read()
            target_sr = 24000
            audio_wav_bytes = preprocess_audio_to_wav_bytes(audio_bytes, target_sr=target_sr)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to process audio file: {str(e)}")
        finally:
            await audio_file.close()

    try:
        start_time = time.perf_counter()
        if mode == "lfm2":
            generated_text = run_lfm2_prediction(
                text=text_input,
                audio_wav_bytes=audio_wav_bytes,
                model=state["model"],
                processor=state["processor"],
            )
        else:
            generated_text = run_hf_text_prediction(
                text=text_input or "",
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
        tokens, shap_values_list = await run_in_threadpool(
            explain_text,
            text_input=request.text_input,
            model_state=state,
            max_evals=request.max_evals,
            method=request.method,
            random_seed=request.random_seed,
            job_id=request.job_id,
        )
        explanation_time = time.perf_counter() - start_time
        logger.info(f"Explanation completed in {explanation_time:.4f} seconds.")

        return ExplainTextResponse(
            tokens=tokens,
            shap_values=[float(v) for v in shap_values_list],
            audio_shap_values=None,
            explanation_time_seconds=explanation_time,
        )
    except Exception as e:
        logger.exception(f"Text explanation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Text explanation failed: {str(e)}")


@router.post("/explain", response_model=ExplainTextResponse)
async def api_explain(
    state: dict[str, Any] = Depends(get_model_state),
    text_input: str | None = Form(None),
    method: str = Form("neyman-stratified"),
    max_evals: int = Form(32),
    random_seed: int = Form(42),
    text_granularity: str = Form("token"),
    job_id: str | None = Form(None),
    audio_file: UploadFile | None = File(None),
):
    """Runs explanation supporting text-only, text+audio, and audio-only (LiquidAudio).

    For HF text-only mode, only text_input is supported.
    """

    mode = str(state.get("mode") or "").strip() or "lfm2"

    audio_wav_bytes: bytes | None = None
    if audio_file is not None:
        if mode != "lfm2":
            raise HTTPException(status_code=400, detail="Audio input is only supported for LiquidAudio (mode='lfm2').")
        try:
            audio_bytes = await audio_file.read()
            target_sr = 24000
            audio_wav_bytes = preprocess_audio_to_wav_bytes(audio_bytes, target_sr=target_sr)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to process audio file: {str(e)}")
        finally:
            await audio_file.close()

    if mode != "lfm2" and (text_input is None or not text_input.strip()):
        raise HTTPException(status_code=400, detail="Text input is required for HF text-only mode.")
    if (text_input is None or not text_input.strip()) and audio_wav_bytes is None:
        raise HTTPException(status_code=400, detail="Provide text_input and/or audio_file.")

    start_time = time.perf_counter()
    try:
        tokens, text_values, audio_values = await run_in_threadpool(
            explain_multimodal,
            text_input=text_input,
            audio_wav_bytes=audio_wav_bytes,
            model_state=state,
            max_evals=max_evals,
            method=method,
            random_seed=random_seed,
            job_id=job_id,
        )
        explanation_time = time.perf_counter() - start_time
        return ExplainTextResponse(
            tokens=tokens,
            shap_values=[float(v) for v in text_values],
            audio_shap_values=None if audio_values is None else [float(v) for v in audio_values],
            explanation_time_seconds=explanation_time,
        )
    except Exception as e:
        logger.exception("Explain failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Explain failed: {str(e)}")
