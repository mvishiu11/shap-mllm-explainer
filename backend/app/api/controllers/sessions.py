import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Session, SessionCreate, SessionRead, SessionReadList

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=SessionRead)
async def create_session(
    *, session: SessionCreate, db: AsyncSession = Depends(get_session)
):
    """
    Create a new explanation session and save it to the database.
    """
    try:
        # Create a Session table model from the SessionCreate API model
        db_session = Session.model_validate(session)
        db.add(db_session)
        await db.commit()
        await db.refresh(db_session)
        logger.info(f"Created session {db_session.id} with name '{db_session.name}'")
        return db_session
    except Exception as e:
        logger.exception(f"Failed to create session: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to create session in database."
        )


@router.get("/", response_model=List[SessionReadList])
async def list_sessions(db: AsyncSession = Depends(get_session)):
    """
    List all saved sessions (ID, name, and creation time only).
    """
    result = await db.execute(select(Session).order_by(Session.created_at.desc()))
    sessions = result.scalars().all()
    return sessions


@router.get("/{session_id}", response_model=SessionRead)
async def get_session_details(
    session_id: int, db: AsyncSession = Depends(get_session)
):
    """
    Get the full details for a single session.
    """
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{session_id}", status_code=204) # No content response
async def delete_session(
    session_id: int, db: AsyncSession = Depends(get_session)
):
    """
    Delete a specific session by its ID.
    """
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        await db.delete(session)
        await db.commit()
        logger.info(f"Deleted session {session_id}")
        return  # Return None for 204 status
    except Exception as e:
        logger.exception(f"Failed to delete session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete session.")
