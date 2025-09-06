from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import json
import logging
import os
import asyncio
from typing import Dict, List
import uuid
from datetime import datetime

# Import from your existing structure
from auth.routes import router as auth_router, get_current_user
from auth.models import User
from supabase_service import supabase_service
from live_transcriber import stream_to_transcribe

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="BankAI WebRTC Server", version="2.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include auth router
app.include_router(auth_router)

# Global variables
active_connections: Dict[WebSocket, Dict] = {}
audio_storage: Dict[str, Dict] = {}
audio_stream_queues: Dict[str, asyncio.Queue] = {}
audio_chunks: Dict[str, List] = {}

@app.websocket("/ws/signaling/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """WebSocket endpoint for signaling with Supabase authentication"""
    try:
        # Verify user using Supabase
        user = await supabase_service.verify_token(token)
        
        if not user:
            await websocket.close(code=4001)
            return
            
        user_id = user.id
        username = user.email
        role = user.role
        
    except Exception as e:
        logger.error(f"WebSocket auth error: {e}")
        await websocket.close(code=4001)
        return

    await websocket.accept()
    active_connections[websocket] = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "connected_at": datetime.utcnow()
    }

    logger.info(f"✅ WebSocket connected: {username} ({role})")

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            message["sender"] = {
                "user_id": user_id,
                "username": username, 
                "role": role
            }
            await forward_message(websocket, message)
    except WebSocketDisconnect:
        logger.info(f"❌ WebSocket disconnected: {username}")
    finally:
        active_connections.pop(websocket, None)

async def forward_message(sender_ws: WebSocket, message: Dict):
    """Forward WebSocket message to appropriate recipients"""
    sender_info = active_connections.get(sender_ws)
    if not sender_info:
        return

    sender_role = sender_info["role"]

    for ws, user_info in active_connections.items():
        if ws != sender_ws:
            try:
                should_forward = (
                    (sender_role == "agent" and user_info["role"] == "customer") or
                    (sender_role == "customer" and user_info["role"] == "agent") or
                    message.get("type") in ["peer-ready", "peer-disconnected"]
                )

                if should_forward:
                    await ws.send_text(json.dumps(message))
            except:
                pass

@app.post("/audio/upload")
async def upload_audio(
    file: UploadFile = File(...),
    session_id: str = "default",
    current_user: User = Depends(get_current_user)
):
    """Upload audio file"""
    audio_data = await file.read()
    audio_id = f"{session_id}_{current_user.customer_id}_{int(datetime.utcnow().timestamp())}"

    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/{audio_id}.webm"

    with open(file_path, "wb") as f:
        f.write(audio_data)

    audio_storage[audio_id] = {
        "audio_id": audio_id,
        "filename": file.filename,
        "file_path": file_path,
        "uploaded_by": current_user.customer_id,
        "user_email": current_user.email,
        "role": current_user.role,
        "size_bytes": len(audio_data),
        "uploaded_at": datetime.utcnow()
    }

    logger.info(f"✅ Audio saved: {file_path} ({len(audio_data)} bytes) by {current_user.email}")

    return {
        "audio_id": audio_id,
        "size_bytes": len(audio_data),
        "download_url": f"/audio/download/{audio_id}"
    }

@app.get("/audio/download/{audio_id}")
async def download_audio(audio_id: str, current_user: User = Depends(get_current_user)):
    """Download audio file"""
    if audio_id not in audio_storage:
        raise HTTPException(status_code=404, detail="Audio not found")

    audio_info = audio_storage[audio_id]
    
    # Check if user owns this audio or is an agent
    if current_user.role != "agent" and audio_info["uploaded_by"] != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    file_path = audio_info["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path=file_path, filename=f"audio_{audio_id}.webm")

@app.post("/audio-stream/start/{session_id}")
async def start_audio_session(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """Start audio streaming session"""
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can start audio sessions")
    
    if session_id in audio_stream_queues:
        raise HTTPException(status_code=400, detail="Session already exists")

    queue = asyncio.Queue()
    audio_stream_queues[session_id] = queue

    os.makedirs("transcripts", exist_ok=True)
    asyncio.create_task(stream_to_transcribe(session_id, queue))

    audio_chunks[session_id] = []

    logger.info(f"🎙️ Audio session started: {session_id} by {current_user.email}")

    return {
        "session_id": session_id,
        "customer_id": current_user.customer_id,
        "status": "streaming"
    }

@app.post("/audio-stream/upload/{session_id}")
async def upload_audio_chunk(
    session_id: str,
    audio_chunk: UploadFile = File(...),
    chunk_index: int = 0,
    current_user: User = Depends(get_current_user)
):
    """Upload audio chunk for streaming session"""
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can upload audio chunks")
    
    if session_id not in audio_stream_queues:
        raise HTTPException(status_code=404, detail="Session not found")

    chunk_data = await audio_chunk.read()

    # Feed transcription queue
    await audio_stream_queues[session_id].put(chunk_data)

    # Store chunk
    if session_id not in audio_chunks:
        audio_chunks[session_id] = []
        
    audio_chunks[session_id].append({
        "index": chunk_index,
        "data": chunk_data,
        "timestamp": datetime.utcnow(),
        "size": len(chunk_data),
        "customer_id": current_user.customer_id
    })

    logger.info(f"📤 Audio chunk {chunk_index} uploaded for session {session_id}: {len(chunk_data)} bytes")

    return {
        "chunk_index": chunk_index,
        "size": len(chunk_data),
        "session_chunks": len(audio_chunks[session_id])
    }

@app.post("/audio-stream/end/{session_id}")
async def end_audio_session(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """End audio streaming session"""
    if session_id not in audio_stream_queues:
        raise HTTPException(status_code=404, detail="Session not found")

    # Clean up queues
    del audio_stream_queues[session_id]

    logger.info(f"🎙️ Audio session ended: {session_id} by {current_user.email}")

    return {"session_id": session_id, "status": "completed"}

@app.get("/audio-sessions")
async def get_audio_sessions(current_user: User = Depends(get_current_user)):
    """Get audio sessions for current user"""
    if current_user.role == "agent":
        # Agents can see all sessions
        sessions = []
        for session_id, chunks in audio_chunks.items():
            if chunks:
                sessions.append({
                    "session_id": session_id,
                    "chunks_count": len(chunks),
                    "customer_id": chunks[0].get("customer_id", "unknown"),
                    "last_activity": chunks[-1]["timestamp"].isoformat()
                })
    else:
        # Customers can only see their own sessions
        sessions = []
        for session_id, chunks in audio_chunks.items():
            if chunks and chunks[0].get("customer_id") == current_user.customer_id:
                sessions.append({
                    "session_id": session_id,
                    "chunks_count": len(chunks),
                    "customer_id": current_user.customer_id,
                    "last_activity": chunks[-1]["timestamp"].isoformat()
                })
    
    return {"sessions": sessions}

@app.get("/audio-stream/download/{session_id}")
async def download_session_audio(session_id: str, current_user: User = Depends(get_current_user)):
    """Download complete session audio"""
    if session_id not in audio_chunks:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check access permissions
    chunks = audio_chunks[session_id]
    if chunks and current_user.role != "agent" and chunks[0].get("customer_id") != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Combine all chunks
    all_chunks = sorted(chunks, key=lambda x: x["index"])
    combined_data = b"".join([chunk["data"] for chunk in all_chunks])

    # Save combined file
    os.makedirs("sessions", exist_ok=True)
    file_path = f"sessions/{session_id}_complete.webm"

    with open(file_path, "wb") as f:
        f.write(combined_data)

    return FileResponse(path=file_path, filename=f"session_{session_id}.webm")

@app.post("/audio-stream/save-local/{session_id}")
async def save_session_to_local(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """Save session to local audio_files directory"""
    if session_id not in audio_chunks:
        raise HTTPException(status_code=404, detail="Session not found")

    chunks = audio_chunks[session_id]
    if not chunks:
        raise HTTPException(status_code=400, detail="No audio chunks found")

    # Check access permissions
    if current_user.role != "agent" and chunks[0].get("customer_id") != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Sort chunks by index
    sorted_chunks = sorted(chunks, key=lambda x: x["index"])
    combined_data = b"".join([chunk["data"] for chunk in sorted_chunks])

    # Save to audio_files directory
    audio_dir = "audio_files"
    os.makedirs(audio_dir, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"customer_{current_user.customer_id}_{session_id}_{timestamp}.webm"
    file_path = f"{audio_dir}/{filename}"

    with open(file_path, "wb") as f:
        f.write(combined_data)

    file_size = os.path.getsize(file_path)

    logger.info(f"💾 Audio session saved: {file_path} ({file_size} bytes)")

    return {
        "session_id": session_id,
        "filename": filename,
        "file_path": file_path,
        "file_size": file_size,
        "total_chunks": len(sorted_chunks),
        "customer_id": current_user.customer_id,
        "saved_at": datetime.utcnow().isoformat()
    }

@app.get("/audio-stream/local-files")
async def list_local_audio_files(current_user: User = Depends(get_current_user)):
    """List audio files in audio_files directory"""
    audio_dir = "audio_files"
    if not os.path.exists(audio_dir):
        return {"files": [], "count": 0}

    files = []
    for filename in os.listdir(audio_dir):
        if filename.endswith(('.webm', '.wav', '.mp3', '.mp4')):
            file_path = os.path.join(audio_dir, filename)
            file_stat = os.stat(file_path)
            files.append({
                "filename": filename,
                "size": file_stat.st_size,
                "created": datetime.fromtimestamp(file_stat.st_ctime).isoformat(),
                "modified": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
                "path": file_path
            })

    files.sort(key=lambda x: x["created"], reverse=True)

    return {
        "files": files,
        "count": len(files),
        "total_size": sum(f["size"] for f in files),
        "directory": audio_dir
    }

@app.get("/audio-stream/download-local/{filename}")
async def download_local_audio_file(filename: str, current_user: User = Depends(get_current_user)):
    """Download a specific file from audio_files directory"""
    audio_dir = "audio_files"
    file_path = os.path.join(audio_dir, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Security check
    if not os.path.abspath(file_path).startswith(os.path.abspath(audio_dir)):
        raise HTTPException(status_code=403, detail="Access denied")

    return FileResponse(path=file_path, filename=filename)

@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "message": "BankAI WebRTC Server with Supabase",
        "version": "2.0.0",
        "services": ["auth", "webrtc", "audio", "database"],
        "stats": {
            "connections": len(active_connections),
            "audio_files": len(audio_storage),
            "active_streams": len(audio_stream_queues)
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "database": "supabase",
        "auth": "supabase-direct"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9795)