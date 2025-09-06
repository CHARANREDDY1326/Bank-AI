from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "customer"  # Default to customer

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_info: dict

class User(BaseModel):
    id: str
    customer_id: str
    name: str
    email: str
    role: str  # 'agent' or 'customer'
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class UpdateUser(BaseModel):
    name: Optional[str] = None
    
class DeleteAccount(BaseModel):
    password: str  # Confirm password before deletion
