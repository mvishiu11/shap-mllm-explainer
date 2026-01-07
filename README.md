# SHAP Multi-Modal LLM Explainer

To run this application, you need to have Docker and Docker Compose installed on your machine.

## Setup and Run

1. Clone the repository to your local machine:

   ```bash
   git clone
   cd shap-mllm-explainer
   ```

2. Build and start the application using Docker Compose:

   ```bash
   docker compose up --build
   ```

## CUDA / GPU (Docker Compose)

Prereqs on the host:

- NVIDIA driver installed and working (e.g. `nvidia-smi` works on the host)
- NVIDIA Container Toolkit installed/configured for Docker

Run the stack with GPU enabled for the backend:

```bash
docker compose -f docker-compose.yaml -f docker-compose.gpu.yaml up --build
```

Quick verification (after the stack is up):

```bash
docker compose exec backend uv run python -c "import torch; print('cuda_available=', torch.cuda.is_available()); print('torch_cuda=', torch.version.cuda)"
```

If CUDA is still unavailable, verify Docker can see the GPU:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

If you see `could not select device driver "" with capabilities: [[gpu]]`, Docker is missing the NVIDIA container runtime/toolkit.

Ubuntu 24.04 fix (then re-run the command above):

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg

curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
   | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
   | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
   | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

3. Open your web browser and navigate to `http://localhost` to access the application.

## Application Structure

- **Backend**: The backend is built with FastAPI and is located in the `backend` directory. It handles API requests and data processing.
- **Frontend**: The frontend is built with React and is located in the `web` directory. It provides the user interface for interacting with the application.
- **Database**: The application uses a PostgreSQL database to store session data and other relevant information.
- **SHAP Integration**: The application integrates SHAP for explainability of multi-modal LLM outputs.
- **Docker Compose**: The `docker-compose.yml` file orchestrates the multi-container setup, including the backend, frontend, and database services.

Happy explaining!