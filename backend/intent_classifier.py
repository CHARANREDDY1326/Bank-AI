from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
import os
from dotenv import load_dotenv
# Make sure you have ANTHROPIC_API_KEY in your environment
load_dotenv(override=True)
anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")

INTENTS = [
    "account_opening", "account_closure", "balance_inquiry", "card_lost_stolen", "card_block_unblock",
    "fund_transfer", "loan_application", "loan_status", "internet_banking_help", "mobile_banking_help",
    "transaction_issue", "kyc_update", "atm_nearby", "fd_rd_info", "complaint_filing",
    "international_banking", "investment_query", "charges_fees", "fraud_reporting", "bank_related", "irrelevant"
]

def classify_intent_and_giveQuery(full_transcript: str):
    """
    Intent classification using Claude API
    """
    if not anthropic_api_key:
        print("❌ ANTHROPIC_API_KEY not found in environment variables")
        return "error", "Missing API key"
    
    prompt = f"""
You are a banking AI assistant. Your job is to:
1. Extract only the banking-related sentences from the following customer conversation.
2. Rewrite them into a single clean, professional query.
3. Identify the correct intent from the list.

Valid Intents:
{", ".join(INTENTS)}

--- Customer Transcript ---
{full_transcript}
---------------------------

Instructions:
- If the transcript contains banking-related content, extract and clean it into a professional query
- If there's no banking-related content, mark as "irrelevant"
- Choose the most appropriate intent from the list above
- Be precise with your classification

Respond EXACTLY in this format:

Intent: <intent_from_list>
Cleaned_Query: <your_cleaned_query_or_None>

Example responses:
Intent: balance_inquiry
Cleaned_Query: How can I check my account balance?

OR

Intent: irrelevant
Cleaned_Query: None
"""

    try:
        # Initialize Claude
        llm = ChatAnthropic(
            api_key=anthropic_api_key,
            model="claude-3-5-haiku-latest",  # You can also use claude-3-haiku-20240307 for faster/cheaper responses
            temperature=0.1,  # Low temperature for consistent classification
            max_tokens=200   # Short response needed
        )
        
        response = llm.invoke([HumanMessage(content=prompt)])
        text = response.content.strip()
        
        print(f"🤖 Claude Response:\n{text}")  # Debug output
        
        intent = "other"
        cleaned_query = ""

        # Parse Claude's response
        for line in text.splitlines():
            line = line.strip()
            if line.lower().startswith("intent:"):
                intent = line.split(":", 1)[1].strip().lower()
            elif line.lower().startswith("cleaned_query:"):
                cleaned_query = line.split(":", 1)[1].strip()
                if cleaned_query.lower() == "none":
                    cleaned_query = ""

        # Validate intent against our list
        if intent not in [i.lower() for i in INTENTS]:
            print(f"⚠️ Intent '{intent}' not in valid list, defaulting to 'other'")
            intent = "other"
            
        print(f"✅ Classified as: {intent} | Query: {cleaned_query}")
        return intent, cleaned_query
        
    except Exception as e:
        print(f"❌ Error in Claude intent classification: {e}")
        return "error", str(e)

# Alternative using direct Anthropic API (without LangChain)
def classify_intent_and_giveQuery_direct(full_transcript: str):
    """
    Direct Anthropic API implementation (alternative to LangChain)
    """
    import anthropic
    
    if not anthropic_api_key:
        print("❌ ANTHROPIC_API_KEY not found in environment variables")
        return "error", "Missing API key"
    
    try:
        client = anthropic.Anthropic(api_key=anthropic_api_key)
        
        prompt = f"""
You are a banking AI assistant. Analyze this customer conversation and:

1. Extract only banking-related content
2. Rewrite into a clean, professional query
3. Classify the intent

Valid Intents: {", ".join(INTENTS)}

Customer Transcript: {full_transcript}

Respond in exactly this format:
Intent: <intent>
Cleaned_Query: <query_or_None>
"""
        
        message = client.messages.create(
            model="claude-3-5-haiku-latest",
            max_tokens=200,
            temperature=0.1,
            messages=[{"role": "user", "content": prompt}]
        )
        
        text = message.content[0].text.strip()
        
        intent = "other"
        cleaned_query = ""
        
        for line in text.splitlines():
            line = line.strip()
            if line.lower().startswith("intent:"):
                intent = line.split(":", 1)[1].strip().lower()
            elif line.lower().startswith("cleaned_query:"):
                cleaned_query = line.split(":", 1)[1].strip()
                if cleaned_query.lower() == "none":
                    cleaned_query = ""
        
        if intent not in [i.lower() for i in INTENTS]:
            intent = "other"
            
        return intent, cleaned_query
        
    except Exception as e:
        print(f"❌ Error in direct Anthropic API call: {e}")
        return "error", str(e)

# Test function
def test_classification():
    """Test the intent classification"""
    test_cases = [
        "Hi, I want to check my account balance please",
        "How do I transfer money to another account?",
        "My card is lost, I need to block it immediately",
        "What's the weather like today?",
        "I need help with opening a new savings account"
    ]
    
    print("🧪 Testing Claude Intent Classification...")
    for i, test_transcript in enumerate(test_cases, 1):
        print(f"\n--- Test {i} ---")
        print(f"Input: {test_transcript}")
        intent, query = classify_intent_and_giveQuery(test_transcript)
        print(f"Intent: {intent}")
        print(f"Query: {query}")

if __name__ == "__main__":
    test_classification()