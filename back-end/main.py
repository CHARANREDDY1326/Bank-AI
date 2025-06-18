# signaling_server.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import logging
from typing import Dict, Optional
import asyncio

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="WebRTC Signaling Server")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        # Store active connections with their metadata
        self.connections: Dict[WebSocket, dict] = {}
        
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections[websocket] = {
            "role": None,
            "is_initiator": None,
            "connected_at": None
        }
        logger.info(f"New WebSocket connection established. Total: {len(self.connections)}")
        
    def disconnect(self, websocket: WebSocket):
        if websocket in self.connections:
            role = self.connections[websocket].get("role", "unknown")
            del self.connections[websocket]
            logger.info(f"WebSocket disconnected. Role: {role}. Remaining: {len(self.connections)}")
            
    def set_peer_info(self, websocket: WebSocket, role: str, is_initiator: bool):
        if websocket in self.connections:
            self.connections[websocket].update({
                "role": role,
                "is_initiator": is_initiator
            })
            logger.info(f"Peer registered - Role: {role}, Initiator: {is_initiator}")
            
    def get_peer_by_role(self, target_role: str) -> Optional[WebSocket]:
        """Find a peer by their role"""
        for websocket, info in self.connections.items():
            if info.get("role") == target_role:
                return websocket
        return None
        
    def get_other_peer(self, current_websocket: WebSocket) -> Optional[WebSocket]:
        """Find the other peer (not the current one)"""
        for websocket in self.connections:
            if websocket != current_websocket:
                return websocket
        return None
        
    def get_connection_info(self) -> dict:
        """Get summary of current connections"""
        info = {
            "total_connections": len(self.connections),
            "roles": {}
        }
        for ws, data in self.connections.items():
            role = data.get("role", "unregistered")
            info["roles"][role] = info["roles"].get(role, 0) + 1
        return info

manager = ConnectionManager()

@app.get("/")
async def root():
    return {
        "message": "WebRTC Signaling Server",
        "connections": manager.get_connection_info()
    }

@app.get("/status")
async def status():
    return manager.get_connection_info()

@app.websocket("/ws/signaling")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                message_type = message.get("type")
                
                logger.info(f"Received message: {message_type}")
                
                # Handle different message types
                if message_type == "peer-ready":
                    await handle_peer_ready(websocket, message)
                    
                elif message_type == "offer":
                    await handle_offer(websocket, message)
                    
                elif message_type == "answer":
                    await handle_answer(websocket, message)
                    
                elif message_type == "ice-candidate":
                    await handle_ice_candidate(websocket, message)
                    
                else:
                    logger.warning(f"Unknown message type: {message_type}")
                    
            except json.JSONDecodeError:
                logger.error("Invalid JSON received")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON format"
                }))
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        
        # Notify the other peer about disconnection
        other_peer = manager.get_other_peer(websocket)
        if other_peer:
            try:
                await other_peer.send_text(json.dumps({
                    "type": "peer-disconnected"
                }))
            except:
                logger.error("Failed to notify peer about disconnection")

async def handle_peer_ready(websocket: WebSocket, message: dict):
    """Handle peer-ready message"""
    role = message.get("role")
    is_initiator = message.get("isInitiator", False)
    
    # Validate role
    if role not in ["agent", "customer"]:
        logger.error(f"Invalid role: {role}")
        return
        
    # Register the peer
    manager.set_peer_info(websocket, role, is_initiator)
    
    # Forward to other peer
    other_peer = manager.get_other_peer(websocket)
    if other_peer:
        logger.info(f"Forwarding peer-ready from {role} to other peer")
        await other_peer.send_text(json.dumps(message))
    else:
        logger.info(f"No other peer to forward peer-ready message to")

async def handle_offer(websocket: WebSocket, message: dict):
    """Handle offer message - should only come from agent"""
    sender_role = manager.connections.get(websocket, {}).get("role")
    
    # Validate that only agents send offers
    if sender_role != "agent":
        logger.error(f"INVALID: Offer received from {sender_role} instead of agent")
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Only agents can send offers"
        }))
        return
        
    # Find customer to send offer to
    customer_peer = manager.get_peer_by_role("customer")
    if customer_peer:
        logger.info("Forwarding offer from agent to customer")
        await customer_peer.send_text(json.dumps(message))
    else:
        logger.warning("No customer peer found to send offer to")
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "No customer peer available"
        }))

async def handle_answer(websocket: WebSocket, message: dict):
    """Handle answer message - should only come from customer"""
    sender_role = manager.connections.get(websocket, {}).get("role")
    
    # Validate that only customers send answers
    if sender_role != "customer":
        logger.error(f"INVALID: Answer received from {sender_role} instead of customer")
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Only customers can send answers"
        }))
        return
        
    # Find agent to send answer to
    agent_peer = manager.get_peer_by_role("agent")
    if agent_peer:
        logger.info("Forwarding answer from customer to agent")
        await agent_peer.send_text(json.dumps(message))
    else:
        logger.warning("No agent peer found to send answer to")
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "No agent peer available"
        }))

async def handle_ice_candidate(websocket: WebSocket, message: dict):
    """Handle ICE candidate - can come from either peer"""
    sender_role = manager.connections.get(websocket, {}).get("role", "unknown")
    
    # Forward to the other peer
    other_peer = manager.get_other_peer(websocket)
    if other_peer:
        other_role = manager.connections.get(other_peer, {}).get("role", "unknown")
        logger.info(f"Forwarding ICE candidate from {sender_role} to {other_role}")
        await other_peer.send_text(json.dumps(message))
    else:
        logger.warning(f"No other peer found to send ICE candidate to")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9795, log_level="info")