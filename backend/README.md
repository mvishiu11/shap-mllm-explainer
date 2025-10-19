# Shap MLLM Explainer backend

**To Run This Backend:**

1.  **Navigate to the `backend` directory** in your terminal.
2.  **Install dependencies:** `uv sync --dev"` (Installs the package in editable mode plus dev dependencies)
3.  **Run the server:** `uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`

The backend API should now be running and accessible at `http://localhost:8000`. You can test endpoints using tools like `curl`, Postman, or the automatic docs at `http://localhost:8000/docs`.

curl -X POST http://localhost:8000/models/load \
-H "Content-Type: application/json" \
-d '{
    "mode": "text_shap",
    "model_id": "microsoft/phi-2",
    "device": "cuda",
    "precision": "bfloat16",
    "trust_remote_code": true
   }'