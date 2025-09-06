import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import HTTPException
from supabase import create_client, Client
from dotenv import load_dotenv
from passlib.context import CryptContext
from jose import jwt
from auth.models import User  # Import from your auth/models.py

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class SupabaseService:
    """Simple user service - direct database operations"""
    
    def __init__(self):
        url = os.getenv("SUPABASE_URL")
        service_key = os.getenv("SUPABASE_SERVICE_KEY")
        
        if not all([url, service_key]):
            raise ValueError("Missing Supabase environment variables")
            
        self.client = create_client(url, service_key)
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        self.secret_key = os.getenv("SECRET_KEY", "bankai_secret_key_change_in_production_2024")
        self.algorithm = "HS256"
    
    def hash_password(self, password: str) -> str:
        return self.pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return self.pwd_context.verify(plain_password, hashed_password)
    
    def create_access_token(self, data: dict) -> str:
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(minutes=60)
        to_encode.update({"exp": expire})
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
    
    async def create_user(self, name: str, email: str, password: str, role: str) -> User:
        try:
            # Check if email already exists
            existing = self.client.table("users").select("*").eq("email", email).execute()
            if existing.data:
                raise HTTPException(status_code=400, detail="Email already registered")
            
            # Create user
            hashed_password = self.hash_password(password)
            
            response = self.client.table("users").insert({
                "name": name,
                "email": email,
                "password_hash": hashed_password,
                "role": role
            }).execute()
            
            if response.data:
                user_data = response.data[0]
                return User(**user_data)
            else:
                raise HTTPException(status_code=500, detail="Failed to create user")
                
        except Exception as e:
            logger.error(f"Create user error: {e}")
            if "already registered" in str(e):
                raise e
            raise HTTPException(status_code=500, detail="Failed to create user")
    
    async def authenticate_user(self, email: str, password: str) -> Optional[User]:
        try:
            response = self.client.table("users").select("*").eq("email", email).execute()
            
            if not response.data:
                return None
            
            user_data = response.data[0]
            
            if self.verify_password(password, user_data["password_hash"]):
                return User(**user_data)
            
            return None
            
        except Exception as e:
            logger.error(f"Authenticate user error: {e}")
            return None
    
    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        try:
            response = self.client.table("users").select("*").eq("id", user_id).execute()
            
            if response.data:
                return User(**response.data[0])
            return None
            
        except Exception as e:
            logger.error(f"Get user by ID error: {e}")
            return None
    
    async def verify_token(self, token: str) -> Optional[User]:
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            user_id = payload.get("sub")
            
            if user_id:
                return await self.get_user_by_id(user_id)
            
            return None
            
        except Exception as e:
            logger.error(f"Token verification error: {e}")
            return None

# Global service instance
supabase_service = SupabaseService()
