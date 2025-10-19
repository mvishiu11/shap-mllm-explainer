# backend/app/services/explainability.py
import logging
from typing import Any

import numpy as np
import shap
import torch

logger = logging.getLogger(__name__)

# Cache for SHAP explainers
explainer_cache: dict[str, Any] = {}


def explain_text(
    text_input: str,
    model_state: dict[str, Any],  # Accepts the state dict
    max_evals: int,
) -> tuple[list[str], list[float]]:
    """
    Calculates SHAP values for standard text model input using the Partition explainer.
    Explains the model's output probability distribution for the next token.
    """
    logger.info(f"Starting SHAP explanation for text: '{text_input[:50]}...' (max_evals={max_evals})")

    # Unpack state
    try:
        model = model_state["model"]
        tokenizer = model_state["processor"]
        model_device = next(model.parameters()).device
    except (KeyError, StopIteration) as e:
        logger.error(f"Invalid model_state dictionary: {e}")
        raise ValueError("Model state is incomplete or model has no parameters.")

    logger.info(f"Explain running on device: {model_device}")

    if not hasattr(model, "config") or not hasattr(model.config, "model_type"):
        raise TypeError("Model does not have expected 'config.model_type' attribute.")

    # This is the tokenizer's vocab size, e.g., 50257
    vocab_size = getattr(tokenizer, "vocab_size", model.config.vocab_size)
    if vocab_size is None:
        logger.error("Could not determine tokenizer vocab_size.")
        raise ValueError("vocab_size is None, cannot proceed with explanation.")

    # --- 1. Create Prediction Function (for standard text models) ---
    def model_predict_next_token_prob(texts: list[Any]):  # Can receive List[str] or List[List[str]]
        """
        Prediction function for standard HF text models.
        Closes over 'model', 'tokenizer', 'model_device', and 'vocab_size'.
        """

        # Handle list-of-tokens input from SHAP masker
        processed_texts: list[str] = []
        for item in texts:
            if isinstance(item, list):
                # Join list of tokens back into a single string
                processed_texts.append(tokenizer.convert_tokens_to_string(item))
            elif isinstance(item, str):
                processed_texts.append(item)
            else:
                processed_texts.append(str(item))

        # Apply chat template (or prefix) to SHAP inputs
        formatted_prompts: list[str] = []
        for text in processed_texts:
            if hasattr(tokenizer, "apply_chat_template"):
                messages = [{"role": "user", "content": text}]
                try:
                    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                    formatted_prompts.append(prompt)
                except Exception:
                    formatted_prompts.append(text)  # Fallback
            elif "phi-2" in model.config.name_or_path:
                formatted_prompts.append(f"Instruct: {text}\nOutput:")
            else:
                formatted_prompts.append(text)  # Default

        try:
            current_padding_side = tokenizer.padding_side
            tokenizer.padding_side = "left"
            if tokenizer.pad_token is None:
                if tokenizer.eos_token is not None:
                    tokenizer.pad_token = tokenizer.eos_token
                else:
                    tokenizer.pad_token = 0

            inputs = tokenizer(formatted_prompts, return_tensors="pt", padding=True, truncation=True, max_length=512).to(model_device)
            tokenizer.padding_side = current_padding_side

            with torch.no_grad():
                outputs = model(**inputs)
                if not hasattr(outputs, "logits"):
                    raise ValueError("Model output object has no 'logits' attribute.")

                # e.g., [batch, 51200]
                last_token_logits = outputs.logits[:, -1, :]

                # --- FIX: Truncate logits to match tokenizer vocab size ---
                # Check if the model's logit dim is larger than the tokenizer's vocab size
                if last_token_logits.shape[-1] > vocab_size:  # 51200 > 50257 (True)
                    logger.debug(f"Model logits dim ({last_token_logits.shape[-1]}) > tokenizer vocab_size ({vocab_size}). Truncating logits.")
                    # Truncate the logits *before* softmax
                    last_token_logits = last_token_logits[:, :vocab_size]  # Shape is now [batch, 50257]

                elif last_token_logits.shape[-1] < vocab_size:
                    # This should not happen, but safeguard
                    logger.warning(
                        f"Model logits dim ({last_token_logits.shape[-1]}) < tokenizer vocab_size ({vocab_size}). Padding logits with zeros."
                    )
                    pad_width = vocab_size - last_token_logits.shape[-1]
                    last_token_logits = torch.nn.functional.pad(last_token_logits, (0, pad_width), "constant", 0)
                # --- END FIX ---

                # Now softmax will produce shape [batch, 50257]
                probs = torch.softmax(last_token_logits, dim=-1)

            return probs.cpu().float().numpy()

        except Exception:
            logger.exception(f"Error in SHAP prediction function on input: {formatted_prompts[0] if formatted_prompts else '[]'}")
            batch_size = len(formatted_prompts)
            # This return shape MUST match the tokenizer's vocab_size
            return np.zeros((batch_size, vocab_size))

    # --- 2. Create SHAP Explainer ---
    explainer_key = f"{model.config.model_type}_{model_device}_partition_text_shap"

    if explainer_key not in explainer_cache:
        logger.info("Creating new SHAP Partition explainer for text_shap...")

        if tokenizer.pad_token is None:
            if tokenizer.eos_token is not None:
                tokenizer.pad_token = tokenizer.eos_token
            else:
                tokenizer.pad_token = 0

        masker = shap.maskers.Text(tokenizer=tokenizer)

        # output_names=None is critical to prevent the IndexError
        output_names = None
        logger.info("Setting output_names=None to support full vocabulary (prevents IndexError).")

        explainer = shap.Explainer(
            model_predict_next_token_prob,
            masker,
            output_names=output_names,  # Pass None
        )
        explainer_cache[explainer_key] = explainer
        logger.info("SHAP explainer created and cached.")
    else:
        logger.info("Using cached SHAP explainer.")
        explainer = explainer_cache[explainer_key]

    # --- 3. Calculate SHAP values ---
    try:
        logger.info(f"Calculating SHAP values for input: '{text_input}'")
        shap_values = explainer([text_input], max_evals=max_evals)
        logger.info("SHAP values calculated.")

        # --- 4. Process SHAP Values ---
        shap_values_array = shap_values.values
        if not isinstance(shap_values_array, np.ndarray):
            raise TypeError(f"SHAP values are not a numpy array: {type(shap_values_array)}")

        logger.debug(f"Raw SHAP values shape: {shap_values_array.shape}")

        token_attributions_np = None
        # Sum absolute attributions across the output vocabulary dimension (axis=-1)
        if shap_values_array.ndim == 3 and shap_values_array.shape[0] == 1:
            # Standard case: [batch_size, num_tokens, num_output_classes] = [1, N, V]
            token_attributions_np = np.abs(shap_values_array[0]).sum(axis=-1)
        elif shap_values_array.ndim == 2:
            # Check if it's [N, V]
            if hasattr(shap_values, "data") and shap_values.data is not None and len(shap_values.data[0]) == shap_values_array.shape[0]:
                # Fallback: [num_tokens, num_output_classes] = [N, V]
                logger.warning("SHAP values shape is [N_tokens, N_outputs]. Summing over outputs.")
                token_attributions_np = np.abs(shap_values_array).sum(axis=-1)
            # Check if it's [1, N]
            elif shap_values_array.shape[0] == 1:
                # Fallback: [batch_size, num_tokens] = [1, N]
                logger.warning("SHAP values shape is [1, N_tokens]. Using absolute values directly.")
                token_attributions_np = np.abs(shap_values_array[0])

        if token_attributions_np is None:
            # If shape is still unexpected, raise an error
            raise ValueError(f"Unexpected SHAP values shape: {shap_values_array.shape}")

        token_attributions = [float(v) for v in token_attributions_np]

        # --- 5. Get Tokens ---
        raw_tokens = None
        if hasattr(shap_values, "data") and isinstance(shap_values.data, np.ndarray) and shap_values.data.shape[0] == 1:
            raw_tokens = shap_values.data[0].tolist()
            tokens = [str(t) for t in raw_tokens]
            logger.info(f"Retrieved {len(tokens)} tokens from shap_values.data.")
        else:
            logger.warning("Could not retrieve tokens from SHAP object. Re-tokenizing.")
            encoded = tokenizer(text_input, add_special_tokens=False)
            tokens = tokenizer.convert_ids_to_tokens(encoded["input_ids"])
            raw_tokens = tokens  # Use this as the fallback

        # --- 6. Final Alignment and Cleanup ---
        # Filter out empty tokens that the masker might produce
        valid_indices = [i for i, token in enumerate(tokens) if token and str(token).strip() != ""]

        if len(valid_indices) < len(tokens):
            logger.info(f"Filtering {len(tokens) - len(valid_indices)} empty/whitespace tokens.")
            tokens_filtered = [tokens[i] for i in valid_indices]
            if len(valid_indices) <= len(token_attributions):
                token_attributions_filtered = [token_attributions[i] for i in valid_indices]
                tokens = tokens_filtered
                token_attributions = token_attributions_filtered
            else:
                logger.error("Token/attribution mismatch after filtering empty tokens. Aborting filtering.")
                tokens = [str(t) for t in raw_tokens]  # Revert
                token_attributions = [float(v) for v in token_attributions_np]  # Revert

        num_tokens = len(tokens)
        num_attrs = len(token_attributions)

        if num_tokens != num_attrs:
            logger.error(f"Final token ({num_tokens}) and attribution ({num_attrs}) count mismatch! Forcing alignment.")
            min_len = min(num_tokens, num_attrs)
            tokens = tokens[:min_len]
            token_attributions = token_attributions[:min_len]

        logger.info(f"Token attributions: {token_attributions[:10]}... (total {len(token_attributions)})")
        logger.info(f"Explanation complete. Final Tokens: {len(tokens)}, Attributions: {len(token_attributions)}")
        return tokens, token_attributions

    except ImportError as e:
        logger.error(f"Import error during SHAP calculation (likely missing dependency): {e}")
        raise ImportError(f"SHAP calculation failed due to missing dependency: {e}")
    except Exception as e:
        logger.exception(f"Error during SHAP text explanation: {e}")
        raise RuntimeError(f"Failed to explain text: {e}")
