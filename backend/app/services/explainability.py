import logging
import math
import random
import string
from typing import Any

from mllm_shap.connectors import ModelConfig
from mllm_shap.connectors.enums import ModalityFlag, Role, SystemRolesSetup
from mllm_shap.connectors.filters import ExcludePunctuationTokensFilter
from mllm_shap.shap import Explainer, McShapExplainer, PreciseShapExplainer, ComplementaryNeymanShapExplainer
from mllm_shap.shap.enums import Mode
from mllm_shap.shap.normalizers import PowerShiftNormalizer, MinMaxNormalizer

from app.services.mllm_shap_progress import (
    ProgressComplementaryNeymanShapExplainer,
    ProgressMcShapExplainer,
    ProgressPreciseShapExplainer,
)
from app.services.progress import fail_job, finish_job, init_job, is_cancelled, update_job
from app.services.job_logging import clear_job_logs, set_current_job_id

logger = logging.getLogger(__name__)


def explain_text(
    text_input: str,
    model_state: dict[str, Any],
    max_evals: int,
    method: str = "neyman-stratified",
    random_seed: int = 42,
    job_id: str | None = None,
) -> tuple[list[str], list[float]]:
    """Explain a text-only input.

    This remains for backward compatibility with the existing /explain/text API.
    """
    tokens, text_values, _audio_values = explain_multimodal(
        text_input=text_input,
        audio_wav_bytes=None,
        model_state=model_state,
        max_evals=max_evals,
        method=method,
        random_seed=random_seed,
        job_id=job_id,
    )
    return tokens, text_values


def explain_multimodal(
    *,
    text_input: str | None,
    audio_wav_bytes: bytes | None,
    model_state: dict[str, Any],
    max_evals: int,
    method: str = "neyman-stratified",
    random_seed: int = 42,
    job_id: str | None = None,
) -> tuple[list[str], list[float], list[float] | None]:
    """Explain LiquidAudio (multimodal) or HF text-only inputs with `mllm-shap`.

    Returns (text_tokens, text_shap_values, audio_shap_values).
    """
    logger.info(
        "Starting mllm-shap explanation (mode=%s, method=%s, max_evals=%s, seed=%s)",
        model_state.get("mode"),
        method,
        max_evals,
        random_seed,
    )

    if job_id:
        init_job(job_id, total=None, message="Starting")
        clear_job_logs(job_id)

    try:
        model = model_state["model"]
    except KeyError as e:
        raise ValueError("Model state is incomplete (missing 'model').") from e

    has_audio = audio_wav_bytes is not None
    has_text = bool((text_input or "").strip())

    # Best-effort reproducibility for sampling-based methods.
    try:
        random.seed(int(random_seed))
    except Exception:
        pass
    try:
        import numpy as np

        np.random.seed(int(random_seed))
    except Exception:
        pass
    try:
        import torch

        torch.manual_seed(int(random_seed))
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(int(random_seed))
    except Exception:
        pass

    def progress_cb(*, current: int, total: int | None, message: str) -> None:
        if not job_id:
            return
        if is_cancelled(job_id):
            raise RuntimeError("Cancelled")
        effective_total = total
        if not effective_total:
            effective_total = max_evals
        denom = max(1, int(effective_total))
        percent = min(1.0, max(0.0, float(current) / float(denom)))
        update_job(job_id, current=current, total=int(effective_total), percent=percent, message=message)

    chat = model.get_new_chat(
        system_roles_setup=SystemRolesSetup.SYSTEM_ASSISTANT,
        token_filter=ExcludePunctuationTokensFilter(),
    )

    chat.new_turn(Role.SYSTEM)
    if has_audio and not has_text:
        chat.add_text("Transcribe the audio briefly.")
    else:
        chat.add_text("You are a helpful assistant that answers questions briefly.")
    chat.end_turn()

    chat.new_turn(Role.USER)
    if has_audio:
        chat.add_audio(audio_wav_bytes, "wav")
    if has_text:
        chat.add_text(text_input or "")
    chat.end_turn()

    n_features = _count_explainable_features(chat)

    tokenizer = getattr(getattr(model, "processor", None), "text", None) or getattr(model, "processor", None)
    n_tokens_est = _estimate_explainable_token_count(text_input or "", tokenizer)

    shap_explainer: Any
    method_key = (method or "").strip().lower()

    if method_key in ("neyman", "neyman-stratified", "stratified", "stratified-allocation"):
        requested = max(1, int(max_evals))
        min_required = max(2, 2 * int(n_features))
        effective = max(requested, min_required)
        if effective % 2 == 1:
            effective += 1
        if effective > requested:
            logger.warning(
                "Bumping Neyman samples from %s to %s (requires >= 2*features=%s; features=%s).",
                requested,
                effective,
                min_required,
                n_features,
            )
            if job_id:
                update_job(job_id, message=f"Bumped Neyman evals to {effective} (min {min_required})")
        if job_id:
            update_job(job_id, current=0, total=effective, percent=0.0, message="Running Neyman explainer")
            shap_explainer = ProgressComplementaryNeymanShapExplainer(
                normalizer=MinMaxNormalizer(),
                num_samples=effective,
                progress_cb=progress_cb,
                should_cancel=lambda: is_cancelled(job_id),
            )
        else:
            shap_explainer = ComplementaryNeymanShapExplainer(
                normalizer=MinMaxNormalizer(),
                num_samples=effective,
            )
    elif method_key in ("exact", "precise"):
        if has_audio:
            raise ValueError("Exact SV is not supported with audio inputs.")
        if n_tokens_est > 10:
            raise ValueError(
                f"Exact SV is only supported for very short inputs (<=10 tokens). Estimated={n_tokens_est}."
            )
        expected_total = _max_unique_masks_from_token_count(n_tokens_est)
        if job_id:
            update_job(job_id, current=0, total=expected_total, percent=0.0, message="Running exact SV explainer")
            shap_explainer = ProgressPreciseShapExplainer(
                mode=Mode.CONTEXTUAL,
                normalizer=PowerShiftNormalizer(power=2.0),
                progress_cb=progress_cb,
                should_cancel=lambda: is_cancelled(job_id),
            )
        else:
            shap_explainer = PreciseShapExplainer(
                mode=Mode.CONTEXTUAL,
                normalizer=PowerShiftNormalizer(power=2.0),
            )
    else:
        # Default to Monte Carlo. IMPORTANT: avoid the known hang when requested samples approach 2^n.
        # We cap to 0.8 * (2^n - 2) based on an estimated token count.
        max_unique_masks = _max_unique_masks_from_token_count(n_tokens_est)
        hard_cap = max(1, int(math.floor(0.8 * float(max_unique_masks))))
        requested = max(1, int(max_evals))
        effective = min(requested, hard_cap)
        if effective < requested:
            logger.warning(
                (
                    "Capping MC samples from %s to %s to avoid near-exhaustion hang "
                    "(n_tokens_est=%s, max_unique_masks=%s)."
                ),
                requested,
                effective,
                n_tokens_est,
                max_unique_masks,
            )
            if job_id:
                update_job(job_id, message=f"Capped MC samples to {effective} (avoid 2^n hang)")

        if job_id:
            update_job(job_id, current=0, total=effective, percent=0.0, message="Running MC explainer")
            shap_explainer = ProgressMcShapExplainer(
                num_samples=effective,
                mode=Mode.CONTEXTUAL,
                normalizer=PowerShiftNormalizer(power=2.0),
                progress_cb=progress_cb,
                should_cancel=lambda: is_cancelled(job_id),
            )
        else:
            shap_explainer = McShapExplainer(
                num_samples=effective,
                mode=Mode.CONTEXTUAL,
                normalizer=PowerShiftNormalizer(power=2.0),
            )
    explainer = Explainer(model=model, shap_explainer=shap_explainer)

    generation_kwargs = {
        "max_new_tokens": 64,
        "model_config": ModelConfig(text_temperature=0.2),
    }

    try:
        set_current_job_id(job_id)
        result = explainer(
            chat=chat,
            generation_kwargs=generation_kwargs,
            progress_bar=False,
            verbose=False,
            n_generator_jobs=1,
        )
    except Exception as e:
        if job_id:
            fail_job(job_id, error=str(e), message="Failed")
        raise
    finally:
        set_current_job_id(None)

    tokens, values = _extract_user_text_tokens(result.full_chat, allow_empty=True)
    audio_values = _extract_user_audio_values(result.full_chat, allow_empty=True)
    if job_id:
        finish_job(job_id, message="Done")
    logger.info(
        "Explanation complete. TextTokens=%d AudioValues=%s",
        len(tokens),
        0 if audio_values is None else len(audio_values),
    )
    return tokens, values, audio_values


def _extract_user_text_tokens(full_chat: Any, *, allow_empty: bool = False) -> tuple[list[str], list[float]]:
    conversation = full_chat.get_conversation()

    tokens_out: list[str] = []
    values_out: list[float] = []

    for turn in conversation:
        for entry in turn:
            if entry.content_type != ModalityFlag.TEXT.value:
                continue
            if entry.shap_values is None:
                continue

            for token, role, value in zip(entry.content, entry.roles, entry.shap_values, strict=False):
                if role != Role.USER.value:
                    continue
                if value is None:
                    continue
                if isinstance(value, float) and math.isnan(value):
                    continue
                if not isinstance(token, str):
                    continue

                t = token.strip()
                if not t:
                    continue
                # Drop obvious wrapper tokens
                if t.startswith("<|") and t.endswith("|>"):
                    continue

                tokens_out.append(token)
                values_out.append(float(value))

    if not tokens_out and not allow_empty:
        raise RuntimeError("No user text tokens were extracted from the explanation result.")
    return tokens_out, values_out


def _extract_user_audio_values(full_chat: Any, *, allow_empty: bool = False) -> list[float] | None:
    conversation = full_chat.get_conversation()

    values_out: list[float] = []

    for turn in conversation:
        for entry in turn:
            if entry.content_type != ModalityFlag.AUDIO.value:
                continue
            if entry.shap_values is None:
                continue

            roles = getattr(entry, "roles", None)
            shap_values = entry.shap_values

            try:
                if roles is not None:
                    iterator = zip(shap_values, roles, strict=False)
                else:
                    iterator = ((v, Role.USER.value) for v in shap_values)
            except Exception:
                iterator = ((v, Role.USER.value) for v in shap_values)

            for value, role in iterator:
                if role != Role.USER.value:
                    continue
                if value is None:
                    continue
                if isinstance(value, float) and math.isnan(value):
                    continue
                try:
                    values_out.append(float(value))
                except Exception:
                    continue

    if not values_out:
        if allow_empty:
            return None
        raise RuntimeError("No user audio SHAP values were extracted from the explanation result.")
    return values_out


def _count_explainable_features(chat: Any) -> int:
    """Return the number of explainable features (tokens) for the SHAP mask generator.

    For multimodal chats this includes both text and audio explainable tokens.
    """
    mask = getattr(chat, "shap_values_mask", None)
    if mask is None:
        return 0

    try:
        # torch.BoolTensor
        item = getattr(mask, "sum", None)
        if callable(item):
            summed = mask.sum()
            return int(getattr(summed, "item", lambda: summed)())
    except Exception:
        pass

    try:
        return int(sum(1 for v in mask if bool(v)))
    except Exception:
        return 0


def _estimate_explainable_token_count(text: str, tokenizer: Any) -> int:
    """Best-effort estimate of explainable token count for MC capping.

    We intentionally bias slightly low (conservative) to avoid requesting too many unique masks.
    """
    if not text:
        return 0
    if tokenizer is None:
        # Conservative fallback: word count tends to be <= BPE token count.
        return max(1, len(text.split()))

    try:
        encoded = tokenizer(text, add_special_tokens=False)
        ids = encoded.get("input_ids")
        if ids is None:
            return max(1, len(text.split()))
        tokens = tokenizer.convert_ids_to_tokens(ids)

        def is_punct(tok: str) -> bool:
            t = tok.strip()
            if not t:
                return True
            # common BPE whitespace marker
            t = t.replace("Ġ", "").replace("▁", "").strip()
            if not t:
                return True
            return all(ch in string.punctuation for ch in t)

        filtered = [t for t in tokens if not is_punct(str(t))]
        # Conservative: cap at word count if that is smaller.
        return max(1, min(len(filtered), len(text.split())))
    except Exception:
        return max(1, len(text.split()))


def _max_unique_masks_from_token_count(n_tokens: int) -> int:
    # Masks typically exclude all-zeros and all-ones.
    if n_tokens <= 0:
        return 1
    if n_tokens >= 30:
        # Very large search space; we won't hit 2^n in practice.
        return 1_000_000_000
    return max(1, (1 << n_tokens) - 2)
