import json
from datetime import datetime ,UTC
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from auth.utils import verify_jwt_token
from database.fake_db import db

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/ws/signaling/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    try:
        # Verify token
        payload = verify_jwt_token(token)
        username = payload.get("sub")
        role = payload.get("role")
        
        if not username or not role:
            await websocket.close(code=4001)
            return
    except:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    # Store connection
    db.active_connections[websocket] = {
        "username": username,
        "role": role,
        "connected_at": datetime.now(UTC)
    }

    logger.info(f"✅ WebSocket connected: {username} ({role})")

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            message["sender"] = {"username": username, "role": role}
            
            # Forward to peers
            await forward_message(websocket, message)

    except WebSocketDisconnect:
        logger.info(f"❌ WebSocket disconnected: {username}")
    finally:
        db.active_connections.pop(websocket, None)

async def forward_message(sender_ws, message):
    sender_info = db.active_connections.get(sender_ws)
    if not sender_info:
        return

    sender_role = sender_info["role"]
    
    for ws, user_info in db.active_connections.items():
        if ws != sender_ws:
            try:
                # Route agent->customer, customer->agent
                should_forward = (
                    (sender_role == "agent" and user_info["role"] == "customer") or
                    (sender_role == "customer" and user_info["role"] == "agent") or
                    message.get("type") in ["peer-ready", "peer-disconnected"]
                )
                
                if should_forward:
                    await ws.send_text(json.dumps(message))
            except:
                pass
