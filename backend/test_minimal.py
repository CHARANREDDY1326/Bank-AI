# test_minimal.py - Minimal server to debug connection issues
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Minimal WebSocket Test Server")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple counter for active connections
active_connections = set()

@app.get("/")
def root():
    return {
        "message": "Minimal WebSocket Test Server",
        "active_connections": len(active_connections),
        "connection_ids": [str(id(conn)) for conn in active_connections]
    }

@app.websocket("/ws/signaling")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Add to active connections
    active_connections.add(websocket)
    connection_id = id(websocket)
    
    logger.info(f"✅ WebSocket CONNECTED. ID: {connection_id}. Total active: {len(active_connections)}")
    
    try:
        while True:
            # Wait for messages
            data = await websocket.receive_text()
            logger.info(f"📥 Received from {connection_id}: {data}")
            
            # Just echo back for testing
            await websocket.send_text(f"Echo: {data}")
            
    except WebSocketDisconnect:
        logger.info(f"❌ WebSocket DISCONNECTED. ID: {connection_id}")
    except Exception as e:
        logger.error(f"❌ WebSocket ERROR for {connection_id}: {e}")
    finally:
        # Remove from active connections
        active_connections.discard(websocket)
        logger.info(f"🧹 Cleaned up connection {connection_id}. Remaining: {len(active_connections)}")

if __name__ == "__main__":
    import uvicorn
    import random
    
    # Use a random port to avoid whatever is hitting 8000
    port = random.randint(9000, 9999)
    
    print(f"🚀 Starting MINIMAL test server on random port {port}...")
    print("📊 Expected: 0 connections on startup")
    print(f"🌐 Test URL: http://localhost:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")