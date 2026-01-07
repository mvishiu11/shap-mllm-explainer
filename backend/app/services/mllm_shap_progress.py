import gc
from typing import Any

from mllm_shap.connectors.base.chat import AllTextTokensFilteredOutError, BaseMllmChat
from mllm_shap.connectors.base.model import BaseMllmModel
from mllm_shap.connectors.base.model_response import ModelResponse
from mllm_shap.shap import McShapExplainer
from mllm_shap.shap.base._cache_manager import CacheManager
from mllm_shap.shap.base._generate_responses import _process_mask  # noqa: SLF001
from mllm_shap.shap.base._masks_manager import MasksManager


class ProgressMcShapExplainer(McShapExplainer):
    def __init__(self, *args: Any, progress_cb: Any | None = None, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._progress_cb = progress_cb

    def _generate_step(  # type: ignore[override]
        self,
        mask_manager: MasksManager,
        device: Any,
        masks: list[Any],
        responses: list[ModelResponse],
        source_chat: BaseMllmChat,
        model: BaseMllmModel,
        cache_manager: CacheManager,
        n_generator_jobs: int = 1,
        progress_bar: bool = False,
        verbose: bool = False,
        **generate_kwargs: dict[str, Any],
    ) -> tuple[int, list[tuple[Any, int, BaseMllmChat | None, ModelResponse]] | None]:
        if n_generator_jobs != 1:
            raise ValueError("ProgressMcShapExplainer only supports n_generator_jobs=1")

        history: list[tuple[Any, int, BaseMllmChat | None, ModelResponse]] | None = [] if verbose else None

        gen = self._get_masks_generator(mask_manager=mask_manager, device=device, masks=masks)
        total = None
        try:
            total = len(gen)  # may be None
        except Exception:
            total = None

        chats_skipped = 0
        processed = 0

        for i, (mask, mask_hash) in enumerate(gen):
            processed = i + 1
            if self._progress_cb is not None:
                self._progress_cb(current=processed, total=total, message="Calculating SHAP values")

            try:
                masked_chat, model_response = _process_mask(
                    mask=mask,
                    mask_hash=mask_hash,
                    source_chat=source_chat,
                    model=model,
                    cache_manager=cache_manager,
                    verbose=verbose,
                    i=i,
                    **generate_kwargs,
                )
            except AllTextTokensFilteredOutError:
                chats_skipped += 1
                continue

            masks.append(mask)
            responses.append(model_response)

            if verbose:
                history.append((mask, mask_hash, masked_chat, model_response))  # type: ignore[union-attr]
            else:
                del masked_chat
                del model_response
                gc.collect()

        self.total_n_calls = gen.generated_masks
        if self._progress_cb is not None:
            # force completion
            if total is None:
                self._progress_cb(current=processed, total=processed, message="Calculating SHAP values")
            else:
                self._progress_cb(current=total, total=total, message="Calculating SHAP values")

        return chats_skipped, history
