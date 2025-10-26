from pydantic import BaseModel, EmailStr

class UserLogin(BaseModel):
    username: str
    password: str

class CustomerSignup(BaseModel):
    email: EmailStr
    name: str

class EmailVerification(BaseModel):
    email: EmailStr
    code: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_info: dict