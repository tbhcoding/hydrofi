# HydroFi Device API Contract

For the firmware side. **Not built yet** — this is the agreement so both
halves can be written in parallel. The endpoint lands in step 2.

---

## The one endpoint

```
POST /api/sensor-data
```

Everything the device needs happens here. Telemetry goes up, commands come
back down in the same response.

### Headers

```
Content-Type: application/json
X-Device-Token: <the api_token from the devices table>
```

### Request body

```json
{
  "device_id": "hydrofi-01",
  "ph": 6.12,
  "tds": 940,
  "temp_c": 23.4,
  "nutrient_ml": 0,
  "ph_ml": 0
}
```

| Field | Type | Notes |
|---|---|---|
| `device_id` | string | Must match `X-Device-Token`'s device |
| `ph` | number | 0–14 |
| `tds` | number | ppm |
| `temp_c` | number | degrees Celsius |
| `nutrient_ml` | number | **Incremental** — see below |
| `ph_ml` | number | **Incremental** — see below |

### The one thing that's easy to get wrong

`nutrient_ml` and `ph_ml` are **not** running totals. They are *how much
that pump dispensed since the previous POST*.

- Normal post, no dosing → send `0`
- Dosed 5 mL of pH down, then posted → send `5`
- Next post (no dosing) → back to `0`

Do **not** send a lifetime counter. The backend sums these to get totals,
so a counter would be double-counted on every post. Keep a local
accumulator, send it, then reset it to zero.

### No timestamp

Don't send one. The server stamps arrival time. ESP32 clocks drift without
NTP and a wrong timestamp corrupts the charts silently. Just post promptly.

### Response

```json
{
  "ok": true,
  "commands": []
}
```

`commands` is **always an empty array for now**, but write the loop that
drains it anyway — that's how remote pump control will work in step 5, and
doing it now means no firmware rewrite later.

Future shape, for reference:

```json
{
  "ok": true,
  "commands": [
    { "id": 42, "action": "dose_nutrient", "payload": { "ml": 10 } }
  ]
}
```

Act on each command, then include the ID in `acked` on the next post.

### Errors

| Status | Meaning | What the device should do |
|---|---|---|
| `200` | Stored | Continue |
| `401` | Bad or missing token | Stop and log — retrying won't help |
| `422` | Malformed body | Stop and log — a bug, not a network blip |
| `5xx` | Server or DB down | Retry with backoff |

Buffer readings locally on network failure if you can. Backend accepts
posts out of order.

---

## Posting interval

**30 seconds.** Not 5.

Supabase's free tier gives 500 MB. At 30s that's ~2,900 rows/day, which is
comfortable for a long pilot. At 5s it's ~17,000/day and fills up fast for
data nobody looks at. Nutrient solution doesn't change meaningfully in five
seconds anyway.

Dosing events are the exception — post immediately after a dose completes
rather than waiting for the next interval, so the dashboard reflects it right
away.

---

## Why HTTP polling and not MQTT

The ESP32 sits behind the farm's router. The backend is on a public host and
**cannot reach into that network** to push anything. So commands can't be
pushed — the device has to ask.

Since it's already posting every 30 seconds, the response body is a free
ride for commands. One endpoint, both directions, no broker to run and pay
for. Worst-case command latency is one interval, which is fine for dosing
pumps.

If instant manual pump control becomes a real requirement later, that's when
MQTT earns its complexity.

---

## Security

The device token goes in the firmware. The **Supabase keys do not** — those
live on the backend only.

If firmware ever leaks (a public repo, a shared build), a device token can
be rotated in one SQL update. A leaked Supabase service key is the entire
database.
