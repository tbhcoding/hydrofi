"""
HydroFi backend.

Step 5 adds auto-dosing: when a device is in 'auto' mode and a reading
comes in out of range, queue a correction command, then hand back any
pending commands in the same sensor-data response the device already
polls every 30s. Contract lives in docs/DEVICE_API.md.
"""

import os
import threading
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# One client for the whole app. Uses the service_role key, which
# bypasses RLS -- that is why this key must never leave the server.
db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# FastAPI runs sync def endpoints in a threadpool, and concurrent
# requests through this one shared client intermittently hit
# `httpx.ReadError: [Errno 35]`. Traffic here is tiny (one device
# every 30s, occasional dashboard polls), so serializing every
# Supabase call costs nothing and removes the race outright.
_db_call_lock = threading.Lock()


def db_execute(query):
    with _db_call_lock:
        return query.execute()

app = FastAPI(title="HydroFi API", version="0.1.0")

# Wide open for now: the dashboard has no auth yet and every read
# endpoint is already public, so there's nothing a stricter origin
# list would protect. Revisit once the dashboard (or its host) is
# known and/or auth lands.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def require_device(device_id: str) -> None:
    result = db_execute(db.table("devices").select("id").eq("id", device_id).limit(1))
    if not result.data:
        raise HTTPException(status_code=404, detail=f"unknown device_id: {device_id}")


# Both pumps only push in one direction (nutrient raises TDS, pH-down
# lowers pH) -- there's no pump to correct the other direction, so
# those cases are left alone rather than inventing a fix that doesn't
# exist in the hardware.
AUTO_DOSE_ML = 5
AUTO_DOSE_COOLDOWN = timedelta(minutes=15)


def queue_auto_dose_if_due(device_id: str, action: str) -> None:
    """Queue a correction command unless one of the same type already ran recently."""
    cooldown_cutoff = (datetime.now(timezone.utc) - AUTO_DOSE_COOLDOWN).isoformat()
    recent = db_execute(
        db.table("commands")
        .select("id")
        .eq("device_id", device_id)
        .eq("action", action)
        .gte("created_at", cooldown_cutoff)
        .limit(1)
    )
    if recent.data:
        return
    db_execute(
        db.table("commands").insert(
            {"device_id": device_id, "action": action, "payload": {"ml": AUTO_DOSE_ML}}
        )
    )


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
        result = db_execute(db.table("devices").select("id").limit(1))
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

    result = db_execute(
        db.table("devices")
        .select("id, mode, ph_max, tds_min")
        .eq("api_token", x_device_token)
        .limit(1)
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="unknown device token")

    device = result.data[0]
    device_id = device["id"]
    if device_id != reading.device_id:
        raise HTTPException(status_code=401, detail="device_id does not match token")

    db_execute(
        db.table("readings").insert(
            {
                "device_id": device_id,
                "ph": reading.ph,
                "tds": reading.tds,
                "temp_c": reading.temp_c,
                "nutrient_ml": reading.nutrient_ml,
                "ph_ml": reading.ph_ml,
            }
        )
    )

    if device["mode"] == "auto":
        if reading.ph > device["ph_max"]:
            queue_auto_dose_if_due(device_id, "dose_ph_down")
        if reading.tds < device["tds_min"]:
            queue_auto_dose_if_due(device_id, "dose_nutrient")

    pending = db_execute(
        db.table("commands")
        .select("id, action, payload")
        .eq("device_id", device_id)
        .is_("delivered_at", "null")
    )
    if pending.data:
        db_execute(
            db.table("commands")
            .update({"delivered_at": datetime.now(timezone.utc).isoformat()})
            .eq("device_id", device_id)
            .is_("delivered_at", "null")
        )

    return {"ok": True, "commands": pending.data}


@app.get("/api/devices/{device_id}")
def get_device(device_id: str):
    """Device config the dashboard needs to render target ranges -- no api_token in the response."""
    result = db_execute(
        db.table("devices")
        .select("id, name, mode, ph_min, ph_max, tds_min, tds_max, temp_min, temp_max")
        .eq("id", device_id)
        .limit(1)
    )
    if not result.data:
        raise HTTPException(status_code=404, detail=f"unknown device_id: {device_id}")
    return result.data[0]


@app.get("/api/readings/latest")
def get_latest_reading(device_id: str):
    """Most recent reading for a device -- what the dashboard's live tiles show."""
    require_device(device_id)
    result = db_execute(
        db.table("readings")
        .select("*")
        .eq("device_id", device_id)
        .order("recorded_at", desc=True)
        .limit(1)
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="no readings for this device yet")
    return result.data[0]


@app.get("/api/readings/history")
def get_reading_history(device_id: str, limit: int = 100):
    """Recent readings, newest first -- feeds the dashboard's charts."""
    require_device(device_id)
    result = db_execute(
        db.table("readings")
        .select("*")
        .eq("device_id", device_id)
        .order("recorded_at", desc=True)
        .limit(min(limit, 1000))
    )
    return result.data


@app.get("/api/readings/totals")
def get_dose_totals(device_id: str):
    """Lifetime pump volume for a device, summed from the incremental per-post amounts."""
    require_device(device_id)
    result = db_execute(
        db.table("readings").select("nutrient_ml, ph_ml").eq("device_id", device_id)
    )
    return {
        "nutrient_ml_total": sum(row["nutrient_ml"] for row in result.data),
        "ph_ml_total": sum(row["ph_ml"] for row in result.data),
    }
