from fastapi import APIRouter

from app.api.controllers import ml, sessions

api_router = APIRouter()

# Include the ML router
api_router.include_router(ml.router, prefix="/ml", tags=["ML Operations"])

# Include the Sessions router
api_router.include_router(sessions.router, prefix="/sessions", tags=["Sessions"])
