from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth.utils import verify_jwt_token
from database.fake_db import db

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return verify_jwt_token(credentials.credentials)

async def get_current_user(token_data: dict = Depends(verify_token)):
    username = token_data.get("sub")
    role = token_data.get("role")
    
    if role == "agent":
        user = db.agents_db.get(username)
        if user:
            return {
                "username": user["username"],
                "email": user["email"],
                "role": user["role"],
                "full_name": user["full_name"]
            }
    elif role == "customer":
        user = db.customers_db.get(username)
        if user:
            return {
                "customer_id": user["customer_id"],
                "email": user["email"],
                "name": user["name"],
                "role": user["role"]
            }
    
    raise HTTPException(status_code=404, detail="User not found")