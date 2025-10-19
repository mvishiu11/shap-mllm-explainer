import shap
import torch
import numpy as np
import logging
from typing import Any, List, Tuple, Dict
import re

logger = logging.getLogger(__name__)

# Cache for SHAP explainers
explainer_cache: Dict[str, Any] = {}

# Regex to find special tokens used by Llama-based tokenizers if needed
SPECIAL_TOKEN_PATTERN = re.compile(r"<\|.*?\|>")


def explain_text(
    text_input: str, # Raw text input from user
    model: Any,
    processor: Any,
    device: str, # Device requested (may differ from model.device if quantized)
    max_evals: int
) -> Tuple[List[str], List[float]]:
    """
    Calculates SHAP values for LFM2 text input using the Partition explainer.
    Explains the model's output probability distribution for the next token.
    """
    logger.info(f"Starting SHAP explanation for LFM2 text: '{text_input[:50]}...' (max_evals={max_evals})")

    model_device = model.device # Actual device model is on
    logger.info(f"Explain running on device: {model_device}")

    tokenizer = getattr(processor, 'tokenizer', None)
    if tokenizer is None:
        raise TypeError("Could not find tokenizer in the processor. Needed for SHAP masker.")

    if not hasattr(model, 'config') or not hasattr(model.config, 'model_type'):
         raise TypeError("Model does not have expected 'config.model_type' attribute.")

    vocab_size = getattr(tokenizer, 'vocab_size', model.config.vocab_size)

    # --- 1. Create Prediction Function (predicts next token probabilities) ---
    def model_predict_next_token_prob(texts: List[str]):
        # Input 'texts' might contain SHAP's special mask token or parts of the original input.
        # We need to format them into the LFM2 prompt structure.
        # SHAP's Text masker might pass single tokens or combined strings.
        # Let's assume it passes reasonably formed strings.
        formatted_prompts = [f"<|user|>\n{text}<|assistant|>\n" for text in texts]

        try:
            # Important: Ensure padding side is correct if tokenizer defaults change
            # Llama usually requires left padding for batch inference, but check tokenizer default
            current_padding_side = tokenizer.padding_side
            tokenizer.padding_side = "left" # Explicitly set for batch generation consistency
            if tokenizer.pad_token is None:
                 tokenizer.pad_token = tokenizer.eos_token # Common practice if pad_token unset

            inputs = tokenizer(
                 formatted_prompts,
                 return_tensors="pt",
                 padding=True,
                 truncation=True,
                 max_length=512 # Avoid excessively long inputs during explanation
            ).to(model_device)
            tokenizer.padding_side = current_padding_side # Restore original setting

            with torch.no_grad():
                outputs = model(**inputs)
                last_token_logits = outputs.logits[:, -1, :]
                probs = torch.softmax(last_token_logits, dim=-1)
            return probs.cpu().numpy()
        except Exception as e:
            logger.exception(f"Error in SHAP prediction function: {e}")
            # Return zeros in case of error during SHAP background calls
            batch_size = len(texts)
            effective_vocab_size = vocab_size if vocab_size is not None else 32000 # Llama vocab size guess
            return np.zeros((batch_size, effective_vocab_size))

    # --- 2. Create SHAP Explainer ---
    # Using Partition explainer with Text masker
    explainer_key = f"{model.config.model_type}_{model_device}_partition_text"
    if explainer_key not in explainer_cache:
        logger.info("Creating new SHAP Partition explainer for text...")
        # The masker handles tokenization and masking using the provided tokenizer
        masker = shap.maskers.Text(tokenizer=tokenizer)

        # Output names help interpret the SHAP values per output class (token)
        output_names = None
        if vocab_size:
            try:
                # Limit to avoid excessive memory usage, SHAP might handle sparse outputs better
                num_names = min(vocab_size, 10000)
                output_names = tokenizer.convert_ids_to_tokens(range(num_names))
                logger.info(f"Generating {len(output_names)} output names for SHAP.")
            except Exception as e:
                 logger.warning(f"Could not generate output_names from tokenizer: {e}")

        explainer = shap.Explainer(
            model_predict_next_token_prob,
            masker,
            output_names=output_names,
            # algorithm="partition" # Explicitly set if needed, usually default for text
        )
        explainer_cache[explainer_key] = explainer
        logger.info("SHAP explainer created and cached.")
    else:
        logger.info("Using cached SHAP explainer.")
        explainer = explainer_cache[explainer_key]

    # --- 3. Calculate SHAP values ---
    try:
        logger.info(f"Calculating SHAP values for input: '{text_input}'")
        # Pass the raw user text input. Masker will format it.
        # max_evals controls the number of model calls for approximation.
        shap_values = explainer([text_input], max_evals=max_evals)
        logger.info("SHAP values calculated.")

        # --- 4. Process SHAP Values ---
        # Output shape is typically [num_outputs, batch_size, num_features] or [batch_size, num_features, num_outputs]
        # We want one value per input token, summing contributions across all output tokens.
        shap_values_array = shap_values.values
        if not isinstance(shap_values_array, np.ndarray):
            raise TypeError(f"SHAP values are not a numpy array: {type(shap_values_array)}")

        logger.debug(f"Raw SHAP values shape: {shap_values_array.shape}")

        # Assuming shape [batch_size, num_tokens, num_output_classes] = [1, N, V]
        if shap_values_array.ndim == 3 and shap_values_array.shape[0] == 1:
            # Sum absolute values over the output vocabulary dimension
            token_attributions = np.abs(shap_values_array[0]).sum(axis=1).tolist()
        elif shap_values_array.ndim == 2 and shap_values_array.shape[0] == 1:
            # Case where output might be single dimension or already aggregated? Unlikely here.
             token_attributions = np.abs(shap_values_array[0]).tolist()
             logger.warning("SHAP values array has only 2 dimensions. Using absolute values.")
        else:
            raise ValueError(f"Unexpected SHAP values shape: {shap_values_array.shape}")

        # --- 5. Get Tokens ---
        # shap_values.data should contain the token strings used by the explainer
        if hasattr(shap_values, 'data') and isinstance(shap_values.data, np.ndarray) and shap_values.data.shape[0] == 1:
            raw_tokens = shap_values.data[0].tolist()
            # Ensure all elements are strings
            tokens = [str(t) for t in raw_tokens]
            logger.info(f"Retrieved {len(tokens)} tokens from shap_values.data.")
        else:
            logger.warning("Could not retrieve tokens from SHAP object. Re-tokenizing.")
            # Fallback: encode/decode might differ slightly from masker's internal tokens
            encoded = tokenizer(text_input, add_special_tokens=False) # Don't add BOS/EOS here
            tokens = tokenizer.convert_ids_to_tokens(encoded['input_ids'])

        # --- 6. Final Alignment and Cleanup ---
        num_tokens = len(tokens)
        num_attrs = len(token_attributions)

        # Remove potential empty strings or special tokens added by masker/tokenizer
        # that don't correspond to user input. This requires careful inspection.
        # Llama tokenizer might add a leading space ' '.
        # Let's filter based on typical special tokens for now.
        valid_indices = [i for i, token in enumerate(tokens) if token and not SPECIAL_TOKEN_PATTERN.match(token) and token not in tokenizer.all_special_tokens]

        if len(valid_indices) != num_tokens:
            logger.info(f"Filtering {num_tokens - len(valid_indices)} special/empty tokens.")
            tokens = [tokens[i] for i in valid_indices]
            # Ensure attributions match filtered tokens, requires careful index mapping
            if len(valid_indices) <= num_attrs: # Only filter attributions if we have enough
                token_attributions = [token_attributions[i] for i in valid_indices]
            else:
                logger.error("Attribution count less than valid token count after filtering. Alignment failed.")
                # Fallback: return original tokens/attributions with warning
                tokens = [str(t) for t in raw_tokens] # Revert tokens
                # Pad/truncate attributions
                if num_attrs > num_tokens:
                    token_attributions = token_attributions[:num_tokens]
                elif num_attrs < num_tokens:
                    token_attributions.extend([0.0] * (num_tokens - num_attrs))

        # Final length check after potential filtering
        num_tokens = len(tokens)
        num_attrs = len(token_attributions)
        if num_tokens != num_attrs:
            logger.error(f"Final token ({num_tokens}) and attribution ({num_attrs}) count mismatch!")
            # Force alignment by truncating/padding
            if num_attrs > num_tokens: 
                token_attributions = token_attributions[:num_tokens]
            else:
                token_attributions.extend([0.0] * (num_tokens - num_attrs))

        logger.info(f"Explanation complete. Final Tokens: {len(tokens)}, Attributions: {len(token_attributions)}")
        return tokens, token_attributions

    except ImportError as e:
        logger.error(f"Import error during SHAP calculation (likely missing dependency): {e}")
        raise ImportError(f"SHAP calculation failed due to missing dependency: {e}")
    except Exception as e:
        logger.exception(f"Error during SHAP text explanation: {e}")
        raise RuntimeError(f"Failed to explain text: {e}")
