# HydroFi

Hydroponics monitoring and automated dosing. An ESP32 reads pH, TDS, and
water temperature from a nutrient reservoir, doses pumps to keep them in
range, and reports to this backend. A web dashboard reads from the backend.

**Status:** step 5 of 7 — auto-dosing plus manual dashboard controls (mode switch, dose now).

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
├─ frontend/
│  ├─ index.html         dashboard — plain HTML/CSS/JS, no build step
│  ├─ app.js
│  ├─ style.css
│  └─ config.js          API_BASE / DEVICE_ID — edit this to point at a
│                         different backend
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

And set the operator key that unlocks the dashboard's device controls:

- `ADMIN_API_KEY` — any long random string
  (`python3 -c "import secrets; print(secrets.token_urlsafe(32))"`).
  The dashboard asks for it once per tab before it switches modes or
  doses. Left unset, those endpoints refuse every request.

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

### 3. Dashboard

With the backend running from step 2, in a second terminal:

```bash
cd frontend
python3 -m http.server 8080
```

Open <http://127.0.0.1:8080/index.html>. It should show `connected` in the
top right and real data from Supabase. Don't open `index.html` directly
(`file://`) — browsers restrict fetches from that origin, so use the server
above instead.

### 4. Deployed backend

The backend also runs 24/7 on Railway, independent of anyone's laptop:

```
https://hydrofi-backend-production.up.railway.app
```

`frontend/config.js`'s `API_BASE` already points here, so the dashboard
works without a local backend running. This is what firmware (Gab) should
target too, rather than a local machine or tunnel.

To redeploy after a backend change:

```bash
cd backend
railway up
```

Env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_API_KEY`) live on Railway, not in
this repo — manage them with `railway variable set` / `railway variable list`.

---

## Notes

**`.env` is gitignored. Keep it that way.** If a Supabase service key ever
reaches a commit, rotate it in the Supabase dashboard immediately — deleting
the commit is not enough, since git history keeps it.

**Device controls require the operator key.** `POST /api/devices/mode`,
`/api/dose/nutrient` and `/api/dose/ph-down` move real pumps, so they need
an `X-Admin-Key` header matching `ADMIN_API_KEY`. Read endpoints stay public.

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
- [x] 4. Wire the real dashboard, drop the simulated data
- [x] 5. Command queue + auto-dosing + manual controls — backend queues a
      correction when a device (in `auto` mode) posts an out-of-range
      reading; dashboard can also switch AUTO/MANUAL and trigger a dose
      directly (`POST /api/devices/mode`, `/api/dose/nutrient`, `/api/dose/ph-down`)
- [ ] 6. AI insights + chatbot
- [ ] 7. Deploy
