import logging
import os

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

logger = logging.getLogger(__name__)

# This is the connection string for local development,
# connecting to the 'db' service started with 'docker compose up db'.
LOCAL_POSTGRES_URL = "postgresql+asyncpg://user:password@localhost:5432/shap_explainer_db"

# The Docker container will get its URL from the docker-compose environment,
# which points to the 'db' hostname.
DATABASE_URL = os.getenv("DATABASE_URL", LOCAL_POSTGRES_URL)

if DATABASE_URL == LOCAL_POSTGRES_URL:
    logger.warning(f"DATABASE_URL not set, defaulting to local Docker PG: {LOCAL_POSTGRES_URL}")
else:
    logger.info(f"Connecting to database at host: {DATABASE_URL.split('@')[-1]}")


# Create the async engine
# echo=True is good for dev, remove for prod
engine = create_async_engine(DATABASE_URL, echo=True, future=True)


async def create_db_and_tables():
    """
    Initializes the database and creates all tables defined by SQLModel.
    """
    logger.info("Initializing database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    logger.info("Database tables initialized.")


async def get_session() -> AsyncSession:
    """
    FastAPI dependency to get a new database session for each request.
    """
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
