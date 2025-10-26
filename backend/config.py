import os
from datetime import timedelta

# Server
SERVER_TITLE = "BankAI WebRTC Server"
SERVER_VERSION = "1.0.0"
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 9795

# Security
SECRET_KEY = "bankai_secret_key_change_in_production_2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# CORS - Allow all for EC2
CORS_ORIGINS = ["*"]

# Default agents
DEFAULT_AGENTS = {
    "agent1": {
        "username": "agent1",
        "email": "agent1@bankai.com",
        "password": "agent123",
        "role": "agent",
        "full_name": "John Agent"
    },
    "agent2": {
        "username": "agent2",
        "email": "agent2@bankai.com",
        "password": "agent456",
        "role": "agent",
        "full_name": "Jane Agent"
    }
}