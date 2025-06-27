# signaling.py
from fastapi import WebSocket, WebSocketDisconnect
from typing import List
import json
import asyncio

active_connections: List[WebSocket] = []

async def signaling_ws(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    print(f"🔗 Client connected. Total: {len(active_connections)}")
    
    try:
        while True:
            data = await websocket.receive_text()
            print(f"📨 Received: {data}")
            
            try:
                # Parse the message to get the type for better logging
                message = json.loads(data)
                msg_type = message.get('type', 'unknown')
                print(f"📋 Message type: {msg_type}")
                
                # Count how many peers we're sending to
                sent_count = 0
                
                # Relay the data to all other peers
                for conn in active_connections:
                    if conn != websocket:
                        try:
                            await conn.send_text(data)
                            sent_count += 1
                        except Exception as e:
                            print(f"❌ Error sending to peer: {e}")
                            # Remove dead connection
                            if conn in active_connections:
                                active_connections.remove(conn)
                
                print(f"📤 Relayed {msg_type} to {sent_count} peers")
                
            except json.JSONDecodeError:
                print(f"⚠️ Invalid JSON received: {data}")
                
    except WebSocketDisconnect:
        print("🔌 Client disconnected normally")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)
        print(f"🔗 Client removed. Total: {len(active_connections)}")

# Add a health check function
async def get_active_connections():
    return len(active_connections)