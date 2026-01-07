import logging
import math
from typing import Any

from mllm_shap.connectors import ModelConfig
from mllm_shap.connectors.enums import ModalityFlag, Role, SystemRolesSetup
from mllm_shap.connectors.filters import ExcludePunctuationTokensFilter
from mllm_shap.shap import Explainer, McShapExplainer
from mllm_shap.shap.enums import Mode
from mllm_shap.shap.normalizers import PowerShiftNormalizer

from app.services.mllm_shap_progress import ProgressMcShapExplainer
from app.services.progress import fail_job, finish_job, init_job, update_job

logger = logging.getLogger(__name__)


def explain_text(
    text_input: str,
    model_state: dict[str, Any],
    max_evals: int,
    job_id: str | None = None,
) -> tuple[list[str], list[float]]:
    """Explain LiquidAudio text generation with `mllm-shap`.

    Returns token-level SHAP values for user text tokens only.
    """
    logger.info("Starting mllm-shap explanation (max_evals=%s)", max_evals)

    if job_id:
        init_job(job_id, total=max_evals, message="Starting")

    try:
        model = model_state["model"]
    except KeyError as e:
        raise ValueError("Model state is incomplete (missing 'model').") from e

    def progress_cb(*, current: int, total: int | None, message: str) -> None:
        if not job_id:
            return
        effective_total = total
        if not effective_total:
            effective_total = max_evals
        denom = max(1, int(effective_total))
        percent = min(1.0, max(0.0, float(current) / float(denom)))
        update_job(job_id, current=current, total=int(effective_total), percent=percent, message=message)

    shap_explainer: Any
    if job_id:
        shap_explainer = ProgressMcShapExplainer(
            num_samples=max_evals,
            mode=Mode.CONTEXTUAL,
            normalizer=PowerShiftNormalizer(power=2.0),
            progress_cb=progress_cb,
        )
    else:
        shap_explainer = McShapExplainer(
            num_samples=max_evals,
            mode=Mode.CONTEXTUAL,
            normalizer=PowerShiftNormalizer(power=2.0),
        )
    explainer = Explainer(model=model, shap_explainer=shap_explainer)

    chat = model.get_new_chat(
        system_roles_setup=SystemRolesSetup.SYSTEM_ASSISTANT,
        token_filter=ExcludePunctuationTokensFilter(),
    )
    chat.new_turn(Role.SYSTEM)
    chat.add_text("You are a helpful assistant that answers questions briefly.")
    chat.end_turn()
    chat.new_turn(Role.USER)
    chat.add_text(text_input)
    chat.end_turn()

    generation_kwargs = {
        "max_new_tokens": 64,
        "model_config": ModelConfig(text_temperature=0.2),
    }

    try:
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

    tokens, values = _extract_user_text_tokens(result.full_chat)
    if job_id:
        finish_job(job_id, message="Done")
    logger.info("Explanation complete. Tokens=%d", len(tokens))
    return tokens, values


def _extract_user_text_tokens(full_chat: Any) -> tuple[list[str], list[float]]:
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

    if not tokens_out:
        raise RuntimeError("No user text tokens were extracted from the explanation result.")
    return tokens_out, values_out
