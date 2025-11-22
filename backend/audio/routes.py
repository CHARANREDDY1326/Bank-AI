"""
Audio routes for file upload and download operations.

This module provides API endpoints for:
- Uploading audio files
- Downloading audio files
- Listing audio files (with role-based access control)

Supports both agent and customer roles with appropriate access restrictions.
"""

import os
import logging
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from auth.dependencies import verify_token
from database.fake_db import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audio", tags=["audio"])

@router.post("/upload")
async def upload_audio(
    file: UploadFile = File(...),
    session_id: str = "default",
    token_data = Depends(verify_token)
):
    username = token_data.get("sub")
    role = token_data.get("role")
    
    # Read and save file
    audio_data = await file.read()
    audio_id = f"{session_id}_{username}_{int(datetime.utcnow().timestamp())}"
    
    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/{audio_id}.{file.filename.split('.')[-1] if '.' in file.filename else 'webm'}"
    
    with open(file_path, "wb") as f:
        f.write(audio_data)
    
    # Store metadata
    db.audio_storage[audio_id] = {
        "audio_id": audio_id,
        "filename": file.filename,
        "file_path": file_path,
        "uploaded_by": username,
        "role": role,
        "size_bytes": len(audio_data),
        "uploaded_at": datetime.utcnow()
    }
    
    logger.info(f"✅ Audio saved: {file_path} ({len(audio_data)} bytes)")
    
    return {
        "audio_id": audio_id,
        "size_bytes": len(audio_data),
        "download_url": f"/audio/download/{audio_id}"
    }

@router.get("/download/{audio_id}")
async def download_audio(audio_id: str):
    if audio_id not in db.audio_storage:
        raise HTTPException(status_code=404, detail="Audio not found")
    
    audio_info = db.audio_storage[audio_id]
    file_path = audio_info["file_path"]
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(path=file_path, filename=f"audio_{audio_id}.webm")

@router.get("/list")
async def list_audio_files(token_data = Depends(verify_token)):
    username = token_data.get("sub")
    role = token_data.get("role")
    
    # Agents see all, customers see only their own
    if role == "agent":
        files = list(db.audio_storage.values())
    else:
        files = [a for a in db.audio_storage.values() if a["uploaded_by"] == username]
    
    return {"audio_files": files, "total": len(files)}