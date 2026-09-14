"""
HydroFi backend.

Step 5 adds auto-dosing: when a device is in 'auto' mode and a reading
comes in out of range, queue a correction command, then hand back any
pending commands in the same sensor-data response the device already
polls every 30s. Contract lives in docs/DEVICE_API.md.
"""

import json
import os
import threading
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field, field_validator
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# One client for the whole app. Uses the service_role key, which
# bypasses RLS -- that is why this key must never leave the server.
db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# The AI Assistant chat endpoint is optional: if this isn't set, the
# frontend falls back to its own local rule-based answers instead of
# calling /api/assistant/chat.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
GEMINI_MODEL = "gemini-2.5-flash"

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
            {
                "device_id": device_id,
                "action": action,
                "payload": {"ml": AUTO_DOSE_ML, "source": "auto"},
            }
        )
    )


class SensorData(BaseModel):
    device_id: str
    ph: float = Field(ge=0, le=14)
    tds: float = Field(ge=0)
    temp_c: float
    nutrient_ml: float = Field(default=0, ge=0)
    ph_ml: float = Field(default=0, ge=0)


class DoseRequest(BaseModel):
    device_id: str


class SetModeRequest(BaseModel):
    device_id: str
    mode: str

    @field_validator("mode")
    @classmethod
    def normalize_mode(cls, v: str) -> str:
        normalized = v.strip().lower()
        if normalized not in ("auto", "manual"):
            raise ValueError("mode must be 'auto' or 'manual'")
        return normalized


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


@app.post("/api/devices/mode")
def set_device_mode(body: SetModeRequest):
    """Dashboard-triggered mode switch (AUTO/MANUAL toggle)."""
    require_device(body.device_id)
    db_execute(db.table("devices").update({"mode": body.mode}).eq("id", body.device_id))
    return {"ok": True, "mode": body.mode}


def queue_manual_dose(device_id: str, action: str) -> None:
    """Queue a dose from an explicit dashboard button press -- no cooldown check.

    This also counts toward the auto-dosing cooldown for the same
    action/device (queue_auto_dose_if_due doesn't distinguish source),
    which is the right behavior: a manual dose should suppress an
    automatic one from firing right on top of it.
    """
    require_device(device_id)
    db_execute(
        db.table("commands").insert(
            {
                "device_id": device_id,
                "action": action,
                "payload": {"ml": AUTO_DOSE_ML, "source": "manual"},
            }
        )
    )


@app.post("/api/dose/nutrient")
def manual_dose_nutrient(body: DoseRequest):
    """Dashboard 'Dose Nutrient' button."""
    queue_manual_dose(body.device_id, "dose_nutrient")
    return {"ok": True}


@app.post("/api/dose/ph-down")
def manual_dose_ph_down(body: DoseRequest):
    """Dashboard 'Dose pH-down' button."""
    queue_manual_dose(body.device_id, "dose_ph_down")
    return {"ok": True}


class AssistantChatRequest(BaseModel):
    device_id: str
    question: str


class AssistantChatResponse(BaseModel):
    text: str
    severity: str


# Condensed from ZipGrow's "Best Crops for Hydroponics Guide" (2020). ppm figures use
# the ppm-500/TDS standard, the same standard this device's TDS reading uses.
CROP_GUIDE_TEXT = """\
Arugula: pH 5.5-6.5, TDS 400-700ppm, 10-24C (ideal 18C). Peppery salad green, fast-growing, easy for beginners.
Bok Choy: pH 5.5-6.5, TDS 750-1250ppm, 13-24C (ideal 18C). Crunchy Asian cabbage, tolerant of a wide range.
Kale: pH 5.5-6.5, TDS 800-1250ppm, 7-29C (ideal 18C). Hardy, wide temperature tolerance, harvest a few leaves at a time.
Lettuce: pH 5.5-6.5, TDS 500-800ppm, 7-24C (ideal 18C). Fast, low-maintenance, harvest the whole head at once.
Mustard Greens: pH 5.5-6.5, TDS 600-1200ppm, 10-24C (ideal 18C). Spicy, related to kale/cabbage, harvest a portion at a time.
Swiss Chard: pH 5.5-6.5, TDS 800-1150ppm, 13-24C (ideal 18C), cold hardy. Mild, buttery, only take a third of the plant per harvest.
Basil: pH 5.5-6.5, TDS 800-1100ppm, 18-32C (ideal 24C). Warmth-loving, fragrant, prune the tip to encourage bushier growth.
Chives: pH 5.5-6.5, TDS 800-1100ppm, 13-27C (ideal 21C). Tough, low-maintenance, survives dry spells, good for beginners.
Cilantro: pH 5.5-6.5, TDS 600-1000ppm, 10-27C (ideal 18C). Bolts (goes bitter) easily in heat, keep it cool.
Fennel: pH 5.5-6.5, TDS 500-900ppm, 13-24C (ideal 18C). Mild anise flavor, lighter nutrient needs, not frost tolerant.
Mint: pH 5.5-6.5, TDS 800-1300ppm, 13-24C (ideal 21C). Vigorous, best started from a cutting.
Oregano: pH 5.5-6.5, TDS 750-1000ppm, 13-27C (ideal 21C). Strong flavor, fuzzy leaves dislike high humidity.
Parsley: pH 5.5-6.5, TDS 700-1200ppm, 13-27C (ideal 21C), cold hardy. Tolerant, easy-going.
Rosemary: pH 5.5-6.5, TDS 600-900ppm, 16-27C (ideal 24C), cold hardy. Prefers to dry out between waterings, best from a cutting.
Strawberries: pH 5.5-6.5, TDS 400-700ppm, 18-24C (ideal 21C). Easiest fruiting crop, best from rootstock, watch for spider mites.
"""

ASSISTANT_SYSTEM_PROMPT = """\
You are the AI Assistant embedded in the HydroFi hydroponics dashboard. A grower is asking \
you a question about their reservoir's pH, TDS (nutrient strength), temperature, dosing \
pumps, or what to grow.

Ground every answer strictly in the CURRENT STATUS JSON and CROP GUIDE given below -- never \
invent sensor readings, ranges, or crop facts that aren't in that data. If something needed \
to answer isn't in the data, say so plainly instead of guessing.

Hardware fact you must respect: the nutrient pump can only raise TDS, and the pH-down pump \
can only lower pH. Neither pump can push the opposite direction, and there is no pump at all \
for temperature -- those need a manual fix (dilute with water, add a pH-up buffer, adjust \
ventilation/heating) mentioned in your answer when relevant.

Write for a home grower, not an engineer: short sentences (2-4 sentences total), plain \
everyday words, no unexplained jargon (spell out acronyms like EC/TDS/pH the first time if \
you use them). Skip filler like "Great question!".

Respond with ONLY a JSON object of this exact shape, no other text:
{"text": "<your answer>", "severity": "<one of: ok, warn, error, neutral>"}
- "ok": current status is fine / reassuring
- "warn": something needs attention soon but isn't urgent
- "error": something is out of range or needs action now
- "neutral": purely informational (greetings, crop lookups, general questions)
"""


@app.post("/api/assistant/chat", response_model=AssistantChatResponse)
def assistant_chat(body: AssistantChatRequest):
    """AI-powered chat for the dashboard's Assistant tab, grounded in live device data."""
    if not gemini_client:
        raise HTTPException(status_code=503, detail="AI assistant is not configured (missing GEMINI_API_KEY)")

    device_result = db_execute(
        db.table("devices")
        .select("id, name, mode, ph_min, ph_max, tds_min, tds_max, temp_min, temp_max")
        .eq("id", body.device_id)
        .limit(1)
    )
    if not device_result.data:
        raise HTTPException(status_code=404, detail=f"unknown device_id: {body.device_id}")
    device = device_result.data[0]

    reading_result = db_execute(
        db.table("readings")
        .select("*")
        .eq("device_id", body.device_id)
        .order("recorded_at", desc=True)
        .limit(1)
    )
    latest_reading = reading_result.data[0] if reading_result.data else None

    totals_result = db_execute(
        db.table("readings").select("nutrient_ml, ph_ml").eq("device_id", body.device_id)
    )
    lifetime_totals = {
        "nutrient_ml": sum(row["nutrient_ml"] for row in totals_result.data),
        "ph_down_ml": sum(row["ph_ml"] for row in totals_result.data),
    }

    status = {
        "device_name": device["name"],
        "mode": device["mode"],
        "target_ranges": {
            "ph": [device["ph_min"], device["ph_max"]],
            "tds_ppm": [device["tds_min"], device["tds_max"]],
            "temp_c": [device["temp_min"], device["temp_max"]],
        },
        "latest_reading": latest_reading,
        "lifetime_dosing_totals": lifetime_totals,
    }

    prompt = (
        f"{ASSISTANT_SYSTEM_PROMPT}\n\n"
        f"CROP GUIDE:\n{CROP_GUIDE_TEXT}\n"
        f"CURRENT STATUS (JSON):\n{json.dumps(status, default=str)}\n\n"
        f"GROWER QUESTION: {body.question}"
    )

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )
        parsed = json.loads(response.text)
        return AssistantChatResponse(
            text=parsed["text"],
            severity=parsed.get("severity", "neutral"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI assistant request failed: {exc}")
