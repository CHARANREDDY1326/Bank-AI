"""
WebSocket connection manager for WebRTC signaling
"""
import json
import logging
from datetime import datetime
from fastapi import WebSocket
from database.fake_db import db

logger = logging.getLogger(__name__)

class ConnectionManager:
    """Manages WebSocket connections for WebRTC signaling"""
    
    def __init__(self):
        self.db = db
    
    async def connect(self, websocket: WebSocket, user_info: dict):
        """Accept WebSocket connection and store user info"""
        await websocket.accept()
        
        connection_info = {
            "username": user_info["username"],
            "role": user_info["role"],
            "user_info": user_info.get("user_data"),
            "connected_at": datetime.utcnow(),
            "client_ip": websocket.client.host if websocket.client else "unknown"
        }
        
        self.db.add_connection(websocket, connection_info)
        
        logger.info(f"✅ WebSocket connected: {user_info['username']} ({user_info['role']})")
        logger.info(f"📊 Total connections: {len(self.db.get_all_connections())}")
    
    def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection"""
        connection_info = self.db.get_connection_info(websocket)
        if connection_info:
            username = connection_info["username"]
            role = connection_info["role"]
            logger.info(f"❌ WebSocket disconnected: {username} ({role})")
        
        self.db.remove_connection(websocket)
        logger.info(f"📊 Remaining connections: {len(self.db.get_all_connections())}")
    
    async def send_message(self, websocket: WebSocket, message: dict):
        """Send message to specific WebSocket"""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"❌ Error sending message: {e}")
    
    async def broadcast_to_role(self, sender_ws: WebSocket, message: dict, target_role: str):
        """Broadcast message to all connections with specific role"""
        connections = self.db.get_connections_by_role(target_role)
        forwarded_count = 0
        
        for ws, info in connections:
            if ws != sender_ws:  # Don't send back to sender
                try:
                    await self.send_message(ws, message)
                    forwarded_count += 1
                except Exception as e:
                    logger.error(f"❌ Error broadcasting to {info['username']}: {e}")
        
        logger.info(f"📤 Broadcasted to {forwarded_count} {target_role}s")
        return forwarded_count
    
    async def forward_message(self, sender_ws: WebSocket, message: dict):
        """Forward WebRTC signaling message with role-based routing"""
        sender_info = self.db.get_connection_info(sender_ws)
        if not sender_info:
            logger.warning("🚫 No sender info found")
            return
        
        sender_role = sender_info["role"]
        message_type = message.get("type")
        
        # Add sender info to message
        message["sender"] = {
            "username": sender_info["username"],
            "role": sender_role,
            "user_info": sender_info.get("user_info")
        }
        
        # Role-based message validation and routing
        if message_type == "offer" and sender_role == "agent":
            # Agent offers go to customers
            await self.broadcast_to_role(sender_ws, message, "customer")
            
        elif message_type == "answer" and sender_role == "customer":
            # Customer answers go to agents
            await self.broadcast_to_role(sender_ws, message, "agent")
            
        elif message_type == "ice-candidate":
            # ICE candidates go to opposite role
            target_role = "customer" if sender_role == "agent" else "agent"
            await self.broadcast_to_role(sender_ws, message, target_role)
            
        elif message_type in ["peer-ready", "peer-disconnected"]:
            # Status messages go to everyone
            await self.broadcast_to_all_except_sender(sender_ws, message)
            
        else:
            logger.warning(f"🚫 Unknown message type: {message_type} from {sender_role}")
    
    async def broadcast_to_all_except_sender(self, sender_ws: WebSocket, message: dict):
        """Broadcast message to all connections except sender"""
        all_connections = self.db.get_all_connections()
        forwarded_count = 0
        
        for ws, info in all_connections.items():
            if ws != sender_ws:
                try:
                    await self.send_message(ws, message)
                    forwarded_count += 1
                except Exception as e:
                    logger.error(f"❌ Error broadcasting to {info['username']}: {e}")
        
        logger.info(f"📤 Broadcasted to {forwarded_count} connections")
    
    async def notify_disconnection(self, sender_ws: WebSocket):
        """Notify other peers about disconnection"""
        sender_info = self.db.get_connection_info(sender_ws)
        if sender_info:
            disconnect_message = {
                "type": "peer-disconnected",
                "user": {
                    "username": sender_info["username"],
                    "role": sender_info["role"]
                }
            }
            await self.broadcast_to_all_except_sender(sender_ws, disconnect_message)

# Global connection manager instance
manager = ConnectionManager()