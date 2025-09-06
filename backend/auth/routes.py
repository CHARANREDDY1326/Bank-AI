import logging
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth.models import UserSignup, UserLogin, Token, User
from supabase_service import supabase_service  # Your Supabase service functions

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["authentication"])
security = HTTPBearer()


# Dependency to get current user
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    user = await supabase_service.verify_token(credentials.credentials)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# -------------------
# Signup Endpoints
# -------------------

@router.post("/customer/signup", response_model=Token)
async def customer_signup(user_data: UserSignup):
    logger.info(f"Customer signup: {user_data.email}")
    
    user = await supabase_service.create_user(
        user_data.name,
        user_data.email,
        user_data.password,
        role="customer"
    )
    access_token = supabase_service.create_access_token({"sub": user.id, "role": user.role})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user_info={
            "id": user.id,
            "customer_id": user.customer_id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
    )


@router.post("/agent/signup", response_model=Token)
async def agent_signup(user_data: UserSignup):
    logger.info(f"Agent signup: {user_data.email}")
    
    user = await supabase_service.create_user(
        user_data.name,
        user_data.email,
        user_data.password,
        role="agent"
    )
    access_token = supabase_service.create_access_token({"sub": user.id, "role": user.role})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user_info={
            "id": user.id,
            "customer_id": user.customer_id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
    )


# -------------------
# Login Endpoint
# -------------------

@router.post("/login", response_model=Token)
async def login(login_data: UserLogin):
    user = await supabase_service.authenticate_user(login_data.email, login_data.password)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    access_token = supabase_service.create_access_token({"sub": user.id, "role": user.role})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user_info={
            "id": user.id,
            "customer_id": user.customer_id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
    )


# -------------------
# Current User Endpoint
# -------------------

@router.get("/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user
