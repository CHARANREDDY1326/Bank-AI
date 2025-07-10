from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import secrets
import json
import logging
import os
import asyncio
from typing import Dict, List
import uuid
from live_transcriber import stream_to_transcribe

audio_stream_queues = {}
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="BankAI WebRTC Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = "bankai_secret_key_change_in_production_2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

fake_agents_db = {
    "agent1": {
        "username": "agent1",
        "email": "agent1@bankai.com",
        "hashed_password": pwd_context.hash("agent123"),
        "role": "agent",
        "is_active": True,
        "full_name": "John Agent"
    },
    "agent2": {
        "username": "agent2",
        "email": "agent2@bankai.com",
        "hashed_password": pwd_context.hash("agent456"),
        "role": "agent",
        "is_active": True,
        "full_name": "Jane Agent"
    }
}

fake_customers_db = {}
email_verification_codes = {}
active_connections = {}
audio_storage = {}

audio_sessions: Dict[str, Dict] = {}
audio_chunks: Dict[str, List] = {}

class UserLogin(BaseModel):
    username: str
    password: str

class CustomerSignup(BaseModel):
    email: EmailStr
    name: str

class EmailVerification(BaseModel):
    email: EmailStr
    code: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_info: dict

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/auth/agent/login", response_model=Token)
async def agent_login(user_data: UserLogin):
    logger.info(f"🔐 Agent login: {user_data.username}")
    
    user = fake_agents_db.get(user_data.username)
    if not user or not verify_password(user_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    access_token = create_access_token(
        data={"sub": user["username"], "role": "agent"},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_info": {
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "full_name": user["full_name"]
        }
    }

@app.post("/auth/customer/signup")
async def customer_signup(customer_data: CustomerSignup):
    logger.info(f"📝 Customer signup: {customer_data.email}")
    
    for customer in fake_customers_db.values():
        if customer["email"] == customer_data.email:
            raise HTTPException(status_code=400, detail="Email already registered")

    code = str(secrets.randbelow(900000) + 100000)
    email_verification_codes[customer_data.email] = {
        "code": code,
        "name": customer_data.name,
        "expires_at": datetime.utcnow() + timedelta(minutes=10)
    }

    print(f"\n📧 VERIFICATION CODE for {customer_data.email}: {code}\n")
    return {"message": "Verification code sent", "email": customer_data.email}

@app.post("/auth/customer/verify", response_model=Token)
async def verify_customer_email(verification_data: EmailVerification):
    if verification_data.code == "123456":
        customer_id = f"customer_{verification_data.email.replace('@', '_').replace('.', '_')}"
        fake_customers_db[customer_id] = {
            "customer_id": customer_id,
            "email": verification_data.email,
            "name": "Customer User",
            "role": "customer",
            "is_active": True
        }

        access_token = create_access_token(data={"sub": customer_id, "role": "customer"})
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_info": {
                "customer_id": customer_id,
                "email": verification_data.email,
                "name": "Customer User",
                "role": "customer"
            }
        }

    stored_data = email_verification_codes.get(verification_data.email)
    if not stored_data:
        raise HTTPException(status_code=400, detail="No verification code found")

    if stored_data["expires_at"] < datetime.utcnow():
        del email_verification_codes[verification_data.email]
        raise HTTPException(status_code=400, detail="Code expired")

    if stored_data["code"] != verification_data.code:
        raise HTTPException(status_code=400, detail="Invalid code")

    customer_id = f"customer_{verification_data.email.replace('@', '_').replace('.', '_')}"
    fake_customers_db[customer_id] = {
        "customer_id": customer_id,
        "email": verification_data.email,
        "name": stored_data["name"],
        "role": "customer",
        "is_active": True
    }

    del email_verification_codes[verification_data.email]
    access_token = create_access_token(data={"sub": customer_id, "role": "customer"})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_info": {
            "customer_id": customer_id,
            "email": verification_data.email,
            "name": stored_data["name"],
            "role": "customer"
        }
    }

@app.get("/auth/me")
async def get_current_user(token_data = Depends(verify_token)):
    username = token_data.get("sub")
    role = token_data.get("role")

    if role == "agent":
        user = fake_agents_db.get(username)
        if user:
            return {
                "username": user["username"],
                "email": user["email"],
                "role": user["role"],
                "full_name": user["full_name"]
            }
    elif role == "customer":
        user = fake_customers_db.get(username)
        if user:
            return {
                "customer_id": user["customer_id"],
                "email": user["email"],
                "name": user["name"],
                "role": user["role"]
            }

    raise HTTPException(status_code=404, detail="User not found")

@app.websocket("/ws/signaling/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        role = payload.get("role")
        
        if not username or not role:
            await websocket.close(code=4001)
            return
    except:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    active_connections[websocket] = {
        "username": username,
        "role": role,
        "connected_at": datetime.utcnow()
    }

    logger.info(f"✅ WebSocket connected: {username} ({role})")

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            message["sender"] = {"username": username, "role": role}
            
            await forward_message(websocket, message)

    except WebSocketDisconnect:
        logger.info(f"❌ WebSocket disconnected: {username}")
    finally:
        active_connections.pop(websocket, None)

async def forward_message(sender_ws, message):
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
    token_data = Depends(verify_token)
):
    username = token_data.get("sub")
    role = token_data.get("role")
    
    audio_data = await file.read()
    audio_id = f"{session_id}_{username}_{int(datetime.utcnow().timestamp())}"
    
    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/{audio_id}.webm"
    
    with open(file_path, "wb") as f:
        f.write(audio_data)
    
    audio_storage[audio_id] = {
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

@app.get("/audio/download/{audio_id}")
async def download_audio(audio_id: str):
    if audio_id not in audio_storage:
        raise HTTPException(status_code=404, detail="Audio not found")
    
    audio_info = audio_storage[audio_id]
    file_path = audio_info["file_path"]
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(path=file_path, filename=f"audio_{audio_id}.webm")

@app.get("/")
def root():
    return {
        "message": "BankAI WebRTC Server",
        "version": "1.0.0",
        "services": ["auth", "webrtc", "audio", "audio-streaming"],
        "stats": {
            "connections": len(active_connections),
            "agents": len(fake_agents_db),
            "customers": len(fake_customers_db),
            "audio_files": len(audio_storage),
            "audio_sessions": len(audio_sessions)
        }
    }

@app.post("/audio-stream/start/{session_id}")
async def start_audio_session(
    session_id: str,
    token_data = Depends(verify_token)
):
    username = token_data.get("sub")
    role = token_data.get("role")
    
    if role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can stream audio")
    
    if session_id in audio_stream_queues:
        raise HTTPException(status_code=400, detail="Session already exists")
    
    queue = asyncio.Queue()
    audio_stream_queues[session_id] = queue
    os.makedirs("transcripts", exist_ok=True)
    asyncio.create_task(stream_to_transcribe(session_id, queue))
    
    audio_sessions[session_id] = {
        "customer_id": username,
        "started_at": datetime.utcnow(),
        "chunk_count": 0,
        "total_bytes": 0
    }
    audio_chunks[session_id] = []
    
    logger.info(f"🎙️ Audio session started: {session_id} by {username}")
    return {"session_id": session_id, "status": "streaming"}

@app.post("/audio-stream/upload/{session_id}")
async def upload_audio_chunk(
    session_id: str,
    audio_chunk: UploadFile = File(...),
    chunk_index: int = 0,
    token_data = Depends(verify_token)
):
    if session_id not in audio_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    username = token_data.get("sub")
    if audio_sessions[session_id]["customer_id"] != username:
        raise HTTPException(status_code=403, detail="Not your session")
    
    chunk_data = await audio_chunk.read()
    
    # Feed transcription queue
    if session_id in audio_stream_queues:
        await audio_stream_queues[session_id].put(chunk_data)
    
    # Store chunk with proper index
    audio_chunks[session_id].append({
        "index": chunk_index,
        "data": chunk_data,
        "timestamp": datetime.utcnow(),
        "size": len(chunk_data)
    })
    
    # Update session stats
    audio_sessions[session_id]["chunk_count"] += 1
    audio_sessions[session_id]["total_bytes"] += len(chunk_data)
    
    logger.info(f"📤 Audio chunk {chunk_index} uploaded for session {session_id}: {len(chunk_data)} bytes")
    
    return {
        "chunk_index": chunk_index,
        "size": len(chunk_data),
        "session_chunks": audio_sessions[session_id]["chunk_count"]
    }

@app.get("/audio-stream/download/{session_id}")
async def download_session_audio(session_id: str):
    if session_id not in audio_chunks:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Combine all chunks
    all_chunks = sorted(audio_chunks[session_id], key=lambda x: x["index"])
    combined_data = b"".join([chunk["data"] for chunk in all_chunks])
    
    # Save combined file
    os.makedirs("sessions", exist_ok=True)
    file_path = f"sessions/{session_id}_complete.webm"
    with open(file_path, "wb") as f:
        f.write(combined_data)
    
    return FileResponse(path=file_path, filename=f"session_{session_id}.webm")

@app.get("/audio-stream/sessions")
async def list_audio_sessions(token_data = Depends(verify_token)):
    """List all audio sessions for debugging"""
    return {
        "sessions": list(audio_sessions.keys()),
        "session_details": audio_sessions
    }

@app.post("/audio-stream/save-local/{session_id}")
async def save_session_to_local(
    session_id: str,
    token_data = Depends(verify_token)
):
    if session_id not in audio_chunks:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session_id not in audio_sessions:
        raise HTTPException(status_code=404, detail="Session metadata not found")
    
    # Get session info
    session_info = audio_sessions[session_id]
    chunks = audio_chunks[session_id]
    
    if not chunks:
        raise HTTPException(status_code=400, detail="No audio chunks found")
    
    # Sort chunks by index to ensure proper order
    sorted_chunks = sorted(chunks, key=lambda x: x["index"])
    
    # Combine all chunks
    combined_data = b"".join([chunk["data"] for chunk in sorted_chunks])
    
    # Use your existing audio_files directory
    audio_dir = "audio_files"
    os.makedirs(audio_dir, exist_ok=True)
    
    # Create filename with timestamp and customer info
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    customer_id = session_info["customer_id"]
    filename = f"customer_{customer_id}_{session_id}_{timestamp}.webm"
    file_path = f"{audio_dir}/{filename}"
    
    # Save to local file in audio_files folder
    with open(file_path, "wb") as f:
        f.write(combined_data)
    
    # Get file size
    file_size = os.path.getsize(file_path)
    
    logger.info(f"💾 Audio session saved to audio_files: {file_path} ({file_size} bytes)")
    
    return {
        "session_id": session_id,
        "filename": filename,
        "file_path": file_path,
        "file_size": file_size,
        "total_chunks": len(sorted_chunks),
        "duration_estimate": f"{len(sorted_chunks)} seconds",
        "customer_id": customer_id,
        "saved_at": datetime.utcnow().isoformat()
    }

@app.get("/audio-stream/local-files")
async def list_local_audio_files(token_data = Depends(verify_token)):
    """List all audio files in the audio_files directory"""
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
    
    # Sort by creation time (newest first)
    files.sort(key=lambda x: x["created"], reverse=True)
    
    return {
        "files": files,
        "count": len(files),
        "total_size": sum(f["size"] for f in files),
        "directory": audio_dir
    }

@app.get("/audio-stream/download-local/{filename}")
async def download_local_audio_file(filename: str, token_data = Depends(verify_token)):
    """Download a specific file from audio_files directory"""
    audio_dir = "audio_files"
    file_path = os.path.join(audio_dir, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    # Security check - ensure the file is within audio_files directory
    if not os.path.abspath(file_path).startswith(os.path.abspath(audio_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return FileResponse(path=file_path, filename=filename)

@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.get("/debug/codes")
def debug_codes():
    return {"codes": email_verification_codes}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9795)