# backend/app/main.py
import logging
import time
from typing import Any

import torch
from fastapi import Body, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import ExplainTextRequest, ExplainTextResponse, LoadModelRequest, LoadModelResponse, PredictionResponse, loaded_model_state
from .services.explainability import explain_text
from .services.inference import preprocess_audio, run_lfm2_prediction, run_text_shap_prediction
from .services.model_loader import load_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="MLLM Shapley Value Explainer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_model_state() -> dict[str, Any]:
    if not loaded_model_state.get("model"):
        raise HTTPException(status_code=400, detail="No model loaded. Call POST /models/load first.")
    return loaded_model_state


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/models/load", response_model=LoadModelResponse)
async def api_load_model(request: LoadModelRequest):
    global loaded_model_state
    try:
        if loaded_model_state.get("model"):
            logger.info("Clearing previously loaded model...")
            del loaded_model_state["model"], loaded_model_state["processor"]
            loaded_model_state.clear()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

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

        # Safely get device info and determine effective precision for LFM2
        actual_device = "cpu"
        effective_precision = request.precision  # Use requested for text_shap
        try:
            model_param = next(model.parameters())
            actual_device = str(model_param.device)
            if request.mode == "lfm2":  # For LFM2, report its actual loaded dtype
                effective_precision = str(model_param.dtype).replace("torch.", "")
        except StopIteration:
            logger.warning("Model has no parameters, cannot determine device/dtype automatically.")
            actual_device = request.device  # Fallback

        loaded_model_state.update(
            {
                "mode": request.mode,
                "model": model,
                "processor": processor,
                "model_id": actual_model_id,
                "device": actual_device,
                "precision": effective_precision,  # Store effective precision
            }
        )

        logger.info(f"Model loaded in {load_time:.2f}s. Effective precision: {effective_precision}")
        return LoadModelResponse(
            message=f"Model '{actual_model_id}' loaded in {load_time:.2f}s.",
            mode=request.mode,
            loaded_model_id=actual_model_id,
            device=loaded_model_state["device"],
            precision=effective_precision,  # Return effective precision
            flash_attention_enabled=False,  # Flash attention removed
        )
    except Exception as e:
        logger.exception(f"Failed to load model: {e}")
        loaded_model_state.clear()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


@app.post("/predict", response_model=PredictionResponse)
async def api_predict(
    text_input: str | None = Body(None), audio_file: UploadFile | None = File(None), state: dict[str, Any] = Depends(get_model_state)
):
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
                text=text_input, audio_tensor=audio_data_tensor, sample_rate=sample_rate, model=state["model"], processor=state["processor"]
            )
        else:  # text_shap mode
            if text_input is None:
                raise HTTPException(status_code=400, detail="Text input is required for this mode.")
            generated_text = run_text_shap_prediction(
                text=text_input, model=state["model"], tokenizer=state["processor"], model_device=state["device"]
            )

        preprocess_time = time.perf_counter() - preprocess_start_time
        logger.info(f"Preprocessing completed in {preprocess_time:.4f} seconds.")
        inference_time = time.perf_counter() - start_time
        logger.info(f"Inference completed in {inference_time:.4f} seconds.")

        return PredictionResponse(generated_text=generated_text, inference_time_seconds=inference_time)
    except Exception as e:
        logger.exception(f"Prediction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.post("/explain/text", response_model=ExplainTextResponse)
async def api_explain_text(request: ExplainTextRequest, state: dict[str, Any] = Depends(get_model_state)):
    if state["mode"] != "text_shap":
        raise HTTPException(status_code=400, detail="SHAP is only available in 'text_shap' mode.")

    start_time = time.perf_counter()
    try:
        tokens, shap_values_list = explain_text(text_input=request.text_input, model_state=state, max_evals=request.max_evals)
        explanation_time = time.perf_counter() - start_time
        logger.info(f"Tokens: {tokens} | SHAP Values: {shap_values_list}")
        logger.info(f"Explanation completed in {explanation_time:.4f} seconds.")

        return ExplainTextResponse(tokens=tokens,
                                   shap_values=[float(v) for v in shap_values_list],
                                   explanation_time_seconds=explanation_time)
    except Exception as e:
        logger.exception(f"Text explanation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Text explanation failed: {str(e)}")
