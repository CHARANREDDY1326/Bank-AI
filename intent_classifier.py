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
def classify_intent_and_giveQuery(transcript: str):
    prompt = f"""
You are a banking support assistant specialized in classifying customer queries.
Given a user's message, identify the correct intent from the list below. Only return the intent name exactly as listed.

Intents:{", ".join(INTENTS)}

Message: "{transcript}"

Then you're next task is to rewrite the message into a clear and helpful query that a support agent 
can handle.
- Keep it professional, realistic and clean.
- Do not hallucinate or change the meaning

Respond in this format:
Intent: <exactly one from the list>
Cleaned_Query: <rewritten question>

Respond with ONLY one of the intents from the list.
If somewhat related to banking, respond with "bank related".
If nothing matches, respond with "irrelevant".

"""
    try:
        llm = ChatGroq(api_key=groq_api_key,model = "llama3-70b-8192")
        response = llm.invoke([HumanMessage(content = prompt)])
        text = response.content.strip()

        intent = "other"
        cleaned_query = transcript

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
    