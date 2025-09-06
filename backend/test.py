import os
from dotenv import load_dotenv
import httpx

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def test_supabase_service_key():
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"
    }
    url = f"{SUPABASE_URL}/rest/v1/users?select=*"
    response = httpx.get(url, headers=headers)
    print("Status code:", response.status_code)
    print("Response:", response.text)

if __name__ == "__main__":
    test_supabase_service_key()