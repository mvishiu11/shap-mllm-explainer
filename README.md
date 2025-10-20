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
   docker-compose up --build
   ```

3. Open your web browser and navigate to `http://localhost` to access the application.

## Application Structure

- **Backend**: The backend is built with FastAPI and is located in the `backend` directory. It handles API requests and data processing.
- **Frontend**: The frontend is built with React and is located in the `web` directory. It provides the user interface for interacting with the application.
- **Database**: The application uses a PostgreSQL database to store session data and other relevant information.
- **SHAP Integration**: The application integrates SHAP for explainability of multi-modal LLM outputs.
- **Docker Compose**: The `docker-compose.yml` file orchestrates the multi-container setup, including the backend, frontend, and database services.

Happy explaining!