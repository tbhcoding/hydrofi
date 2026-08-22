# HydroFi

Hydroponics monitoring and automated dosing. An ESP32 reads pH, TDS, and
water temperature from a nutrient reservoir, doses pumps to keep them in
range, and reports to this backend. A web dashboard reads from the backend.

**Status:** step 3 of 7 — read endpoints for the dashboard are live.

---
## Who does what

**Firmware side (gab)** — you do **not** need anything in the Setup section below.
No Supabase account, no Python, no server. Read
[`docs/DEVICE_API.md`](docs/DEVICE_API.md) instead — that's the full contract
for what the ESP32 sends and receives. You need two things from the backend
developer: the **device token**, and (once deployed) the **backend URL**.
Both are sent privately, never committed here.
 
**Backend / software side** — everything below.

---

## Architecture

```
sensors ──> ESP32 ──HTTP──> FastAPI backend ──> Supabase (Postgres)
                              │                        │
                              └──── dashboard ─────────┘
```

The dashboard never talks to the ESP32 directly. The backend is the only
thing that touches the database. Nothing has both a Supabase key and a
public entry point except the backend.

## Layout

```
hydrofi/
├─ backend/
│  ├─ main.py            FastAPI app
│  ├─ requirements.txt
│  └─ .env.example       copy to .env and fill in
├─ db/
│  └─ schema.sql         run once in Supabase
└─ docs/
   └─ DEVICE_API.md      firmware contract — read this first, Gab
```

---

## Setup

### 1. Database

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Generate a device token:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
3. Open `db/schema.sql`, paste the token into the `insert` at the bottom.
4. Supabase → **SQL Editor** → paste the whole file → **Run**.
5. Check **Table Editor**: `devices`, `readings`, `commands` should exist,
   with one row in `devices`.

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Fill in `.env` from Supabase → **Project Settings → API**:

- `SUPABASE_URL` — the project URL
- `SUPABASE_SERVICE_KEY` — the **service_role** key, not `anon`

Then:

```bash
uvicorn main:app --reload
```

### 3. Verify

Open <http://127.0.0.1:8000/health>. You want:

```json
{ "status": "ok", "database": "connected", "devices_found": 1 }
```

If it says `unreachable`, the `detail` field has the reason — usually a typo
in the URL or the `anon` key pasted in place of `service_role`.

Interactive API docs live at <http://127.0.0.1:8000/docs>. That page becomes
the firmware testing tool in step 2 — requests can be fired at the backend
from the browser with no hardware attached.

---

## Notes

**`.env` is gitignored. Keep it that way.** If a Supabase service key ever
reaches a commit, rotate it in the Supabase dashboard immediately — deleting
the commit is not enough, since git history keeps it.

**Free tier auto-pauses** after 7 days with no database activity. Once the
device is posting continuously this is moot; during development, if `/health`
suddenly fails after a quiet week, resume the project from the Supabase
dashboard.

**Row Level Security is on with no policies.** That's deliberate: the public
`anon` key can read nothing. Only `service_role` gets through. If a query
mysteriously returns zero rows later, check which key is in use before
assuming the data is missing.

---

## Build order

- [x] 1. Schema + skeleton
- [x] 2. `POST /api/sensor-data` — device auth, validation, insert
- [x] 3. Read endpoints — latest, history, dose totals
- [ ] 4. Wire the real dashboard, drop the simulated data
- [ ] 5. Command queue — pump control from the dashboard
- [ ] 6. AI insights + chatbot
- [ ] 7. Deploy
