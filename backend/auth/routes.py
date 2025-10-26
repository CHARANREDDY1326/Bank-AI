import secrets
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from auth.models import UserLogin, CustomerSignup, EmailVerification, Token
from auth.utils import verify_password, create_access_token
from auth.dependencies import get_current_user
from database.fake_db import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/agent/login", response_model=Token)
async def agent_login(user_data: UserLogin):
    user = db.agents_db.get(user_data.username)
    if not user or not verify_password(user_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    access_token = create_access_token(
        data={"sub": user["username"], "role": "agent"},
        expires_delta=timedelta(minutes=60)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_info": {
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "full_name": user["full_name"]
        }
    }

@router.post("/customer/signup")
async def customer_signup(customer_data: CustomerSignup):
    # Check existing
    for customer in db.customers_db.values():
        if customer["email"] == customer_data.email:
            raise HTTPException(status_code=400, detail="Email already registered")

    # Generate code
    code = str(secrets.randbelow(900000) + 100000)
    db.verification_codes[customer_data.email] = {
        "code": code,
        "name": customer_data.name,
        "expires_at": datetime.utcnow() + timedelta(minutes=10)
    }

    # Print to console
    print(f"\n📧 VERIFICATION CODE for {customer_data.email}: {code}\n")

    return {
        "message": "Verification code sent",
        "email": customer_data.email
    }

@router.post("/customer/verify", response_model=Token)
async def verify_customer_email(verification_data: EmailVerification):
    # Universal code for testing
    if verification_data.code == "123456":
        customer_id = f"customer_{verification_data.email.replace('@', '_').replace('.', '_')}"
        db.customers_db[customer_id] = {
            "customer_id": customer_id,
            "email": verification_data.email,
            "name": "Customer User",
            "role": "customer",
            "is_active": True
        }

        access_token = create_access_token(
            data={"sub": customer_id, "role": "customer"}
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_info": {
                "customer_id": customer_id,
                "email": verification_data.email,
                "name": "Customer User",
                "role": "customer"
            }
        }

    # Normal verification
    stored = db.verification_codes.get(verification_data.email)
    if not stored:
        raise HTTPException(status_code=400, detail="No verification code found")
    
    if stored["expires_at"] < datetime.utcnow():
        del db.verification_codes[verification_data.email]
        raise HTTPException(status_code=400, detail="Code expired")
    
    if stored["code"] != verification_data.code:
        raise HTTPException(status_code=400, detail="Invalid code")

    # Create customer
    customer_id = f"customer_{verification_data.email.replace('@', '_').replace('.', '_')}"
    db.customers_db[customer_id] = {
        "customer_id": customer_id,
        "email": verification_data.email,
        "name": stored["name"],
        "role": "customer",
        "is_active": True
    }

    del db.verification_codes[verification_data.email]

    access_token = create_access_token(
        data={"sub": customer_id, "role": "customer"}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_info": {
            "customer_id": customer_id,
            "email": verification_data.email,
            "name": stored["name"],
            "role": "customer"
        }
    }

@router.get("/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    return current_user