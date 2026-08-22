"""
HydroFi backend.

Step 3 adds the dashboard-facing read endpoints: latest reading,
history, and dose totals. These are open (no token) -- the dashboard
itself gets auth in step 4.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# One client for the whole app. Uses the service_role key, which
# bypasses RLS -- that is why this key must never leave the server.
db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

app = FastAPI(title="HydroFi API", version="0.1.0")


def require_device(device_id: str) -> None:
    result = db.table("devices").select("id").eq("id", device_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail=f"unknown device_id: {device_id}")


class SensorData(BaseModel):
    device_id: str
    ph: float = Field(ge=0, le=14)
    tds: float = Field(ge=0)
    temp_c: float
    nutrient_ml: float = Field(default=0, ge=0)
    ph_ml: float = Field(default=0, ge=0)


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


@app.post("/api/sensor-data")
def post_sensor_data(reading: SensorData, x_device_token: str | None = Header(default=None)):
    """Store one telemetry post from a device and hand back its queued commands."""
    if not x_device_token:
        raise HTTPException(status_code=401, detail="missing X-Device-Token header")

    result = (
        db.table("devices")
        .select("id")
        .eq("api_token", x_device_token)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="unknown device token")

    device_id = result.data[0]["id"]
    if device_id != reading.device_id:
        raise HTTPException(status_code=401, detail="device_id does not match token")

    db.table("readings").insert(
        {
            "device_id": device_id,
            "ph": reading.ph,
            "tds": reading.tds,
            "temp_c": reading.temp_c,
            "nutrient_ml": reading.nutrient_ml,
            "ph_ml": reading.ph_ml,
        }
    ).execute()

    # Step 5 will populate this from the commands table.
    return {"ok": True, "commands": []}


@app.get("/api/readings/latest")
def get_latest_reading(device_id: str):
    """Most recent reading for a device -- what the dashboard's live tiles show."""
    require_device(device_id)
    result = (
        db.table("readings")
        .select("*")
        .eq("device_id", device_id)
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="no readings for this device yet")
    return result.data[0]


@app.get("/api/readings/history")
def get_reading_history(device_id: str, limit: int = 100):
    """Recent readings, newest first -- feeds the dashboard's charts."""
    require_device(device_id)
    result = (
        db.table("readings")
        .select("*")
        .eq("device_id", device_id)
        .order("recorded_at", desc=True)
        .limit(min(limit, 1000))
        .execute()
    )
    return result.data


@app.get("/api/readings/totals")
def get_dose_totals(device_id: str):
    """Lifetime pump volume for a device, summed from the incremental per-post amounts."""
    require_device(device_id)
    result = (
        db.table("readings").select("nutrient_ml, ph_ml").eq("device_id", device_id).execute()
    )
    return {
        "nutrient_ml_total": sum(row["nutrient_ml"] for row in result.data),
        "ph_ml_total": sum(row["ph_ml"] for row in result.data),
    }
