import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api import api_router
from app.db import create_db_and_tables

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Run at startup.
    """
    logger.info("Application startup...")
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
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
