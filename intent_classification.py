import os
import hashlib
import openai
import anthropic
import redis
import ssl
from fastapi import FastAPI, Request
from pydantic import BaseModel
from dotenv import load_dotenv

# Ensure 'ssl' is available and working
assert hasattr(ssl, 'create_default_context'), "SSL module is not available. Please install Python with SSL support."

# Load API key securely
load_dotenv(override=True)
# openai.api_key = os.getenv("OPENAI_API_KEY")
anthropic.api_key = os.getenv("anthropic_api_key")
# Set up FastAPI app
app = FastAPI()

# Connect to Redis for caching
r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

# Define request schema
class TranscriptInput(BaseModel):
    transcript: str

# Helper: Generate hash key for a query
def generate_cache_key(prompt: str) -> str:
    return hashlib.sha256(prompt.encode()).hexdigest()

INTENTS = [
    "account_opening", "account_closure", "balance_inquiry", "card_lost_stolen", "card_block_unblock",
    "fund_transfer", "loan_application", "loan_status", "internet_banking_help", "mobile_banking_help",
    "transaction_issue", "kyc_update", "atm_nearby", "fd_rd_info", "complaint_filing",
    "international_banking", "investment_query", "charges_fees", "fraud_reporting", "bank related" , "irrelevant"
]
# LLM prompt template
def build_prompt(transcript: str) -> str:
    intent_list = "\n".join(INTENTS)
    return f"""
You are a banking support assistant specialized in classifying customer queries.
Given a user's message, identify the correct intent from the list below. Only return the intent name exactly as listed.

Intents:
{intent_list}

Message: "{transcript}"

Respond with ONLY one of the intents from the list.
If somewhat related to banking, respond with "bank related".
If nothing matches, respond with "irrelevant".
"""

# POST endpoint to classify intent
@app.post("/classify")
async def classify_intent(input: TranscriptInput):
    prompt = build_prompt(input.transcript)

    try:
        client = anthropic.Anthropic(api_key=anthropic.api_key)
        message = client.messages.create(
            model="claude-3-5-haiku-latest",
            max_tokens=20,
            messages=[{"role": "user", "content": prompt}]
        )
        intent = message.content[0].text.strip().lower()
        if intent not in INTENTS:
            intent = "other"
        return {"intent": intent, "cached": False}
    except Exception as e:
        return {"error": str(e)}