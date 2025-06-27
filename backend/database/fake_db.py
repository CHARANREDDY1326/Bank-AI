from datetime import datetime
from passlib.context import CryptContext
from config import DEFAULT_AGENTS

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class FakeDB:
    def __init__(self):
        self.agents_db = {}
        self.customers_db = {}
        self.verification_codes = {}
        self.active_connections = {}
        self.audio_storage = {}
        self._init_agents()
    
    def _init_agents(self):
        for username, data in DEFAULT_AGENTS.items():
            self.agents_db[username] = {
                "username": data["username"],
                "email": data["email"],
                "hashed_password": pwd_context.hash(data["password"]),
                "role": data["role"],
                "is_active": True,
                "full_name": data["full_name"]
            }

# Global instance
db = FakeDB()