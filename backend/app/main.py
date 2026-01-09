import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api import api_router
from app.db import create_db_and_tables
from app.services.job_logging import InMemoryJobLogHandler

_log_level_name = os.getenv("LOG_LEVEL", "INFO").upper()
_log_level = getattr(logging, _log_level_name, logging.INFO)

logging.basicConfig(
    level=_log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Capture per-job logs so we can surface mllm_shap internals over the API.
_job_log_handler = InMemoryJobLogHandler(max_lines=1000)
_job_log_handler.setLevel(_log_level)
_job_log_handler.setFormatter(
    logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
)
logging.getLogger().addHandler(_job_log_handler)

# Ensure package logs are not silently dropped.
logging.getLogger("mllm_shap").setLevel(_log_level)
logging.getLogger("mllm_shap").propagate = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Run at startup.
    """
    logger.info("Application startup...")
    logger.info("LOG_LEVEL=%s", _log_level_name)
    logger.info("Initializing database...")
    await create_db_and_tables()
    logger.info("Database initialized.")
    yield
    # Run at shutdown
    logger.info("Application shutdown...")


app = FastAPI(
    title="MLLM Shapley Value Explainer API",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://127.0.0.1",
        "http://localhost:80",
        "http://127.0.0.1:80",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["General"])
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


# Include the main API router
app.include_router(api_router, prefix="/api")
