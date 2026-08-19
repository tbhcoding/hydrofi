"""
HydroFi backend.

Step 1 does exactly one thing: prove the server starts and can reach
Supabase. Sensor endpoints arrive in step 2.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# One client for the whole app. Uses the service_role key, which
# bypasses RLS -- that is why this key must never leave the server.
db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

app = FastAPI(title="HydroFi API", version="0.1.0")


@app.get("/health")
def health():
    """Is the server up, and can it actually talk to the database?"""
    try:
        result = db.table("devices").select("id").limit(1).execute()
        return {
            "status": "ok",
            "database": "connected",
            "devices_found": len(result.data),
        }
    except Exception as exc:
        return {
            "status": "degraded",
            "database": "unreachable",
            "detail": str(exc),
        }
