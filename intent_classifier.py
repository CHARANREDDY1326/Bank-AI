from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
import os

groq_api_key = os.getenv("GROQ_API_KEY")

INTENTS = [
    "account_opening", "account_closure", "balance_inquiry", "card_lost_stolen", "card_block_unblock",
    "fund_transfer", "loan_application", "loan_status", "internet_banking_help", "mobile_banking_help",
    "transaction_issue", "kyc_update", "atm_nearby", "fd_rd_info", "complaint_filing",
    "international_banking", "investment_query", "charges_fees", "fraud_reporting", "bank related", "irrelevant"
]

def classify_intent_and_extract_query(full_transcript: str):
    prompt = f"""
You are a banking AI assistant. Your job is to:
1. Extract only the banking-related sentences from the following customer conversation.
2. Rewrite them into a single clean, professional query.
3. Identify the correct intent from the list.

Intents:
{", ".join(INTENTS)}

--- Transcript ---
{full_transcript}
------------------

Respond ONLY in this format:

Intent: <one from the list above>
Cleaned_Query: <single rewritten query>

If no sentence is clearly related to banking, respond with:
Intent: irrelevant
Cleaned_Query: None
"""

    try:
        llm = ChatGroq(api_key=groq_api_key, model="llama3-70b-8192")
        response = llm.invoke([HumanMessage(content=prompt)])
        text = response.content.strip()

        intent = "other"
        cleaned_query = ""

        for line in text.splitlines():
            if "intent" in line.lower():
                intent = line.split(":", 1)[1].strip().lower()
            elif "cleaned_query:" in line.lower():
                cleaned_query = line.split(":", 1)[1].strip()

        if intent not in INTENTS and intent not in ["bank related", "irrelevant"]:
            intent = "other"
        return intent, cleaned_query
    except Exception as e:
        return "error", str(e)
