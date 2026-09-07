# UPDATE NO. 1

## Overview

Updated only the frontend presentation layer. No backend logic was modified.

**Files changed:**
- `index.html`
- `style.css`
- `app.js`
- `config.js`

---

## What's Improved

### 1. Status-Driven Metric Cards
- Card accent/border now reflects actual state: **OK** (green), **near edge** (amber), **out of range** (red), **offline/no data** (neutral).
- Added explicit per-metric status labels: `OK`, `NEAR LOW`, `NEAR HIGH`, `LOW`, `HIGH`, `SENSOR OFFLINE`, `NO DATA`, `STALE`.

### 2. Zero / Missing / Stale Sensor Handling
- TDS `0`, null/missing values, and stale readings are now treated as offline/no-data states (instead of showing misleading live values).
- Added freshness indicator near connection status: "last updated Xs/m ago," with stale highlighting.

### 3. Chart Readability Upgrades
- Increased chart card/canvas height.
- Added gridlines and tooltip details (value + timestamp + target range).
- Added shaded target range band behind each line.
- Added time range selector buttons: `1h` / `6h` / `24h` / `7d` (mapped to history limits supported by the current API).

### 4. Manual Controls UI
Added a **Manual Controls** section with:
- Mode toggle button (`AUTO`/`MANUAL`)
- "Dose Nutrient" button
- "Dose pH-down" button
- Confirmation prompts for each action

Current mode is clearly displayed near the reservoir/device name and within the controls panel.

### 5. Alerts / Notifications
- Added a top alert banner for active issues (out-of-range/offline/stale/no-data).
- Added toast notifications for new alerts and control action outcomes.

### 6. General Polish
- Reordered hierarchy so live status/alerts appear above totals.
- Improved spacing and responsive behavior for smaller screens/tablets/phones.
- Improved accessibility by pairing color with text labels (not color-only signaling).

---

## Important Note on Manual Controls

Existing backend data paths were preserved, and safe frontend hooks were added for manual commands.

Because current backend routes for control actions are not present, control endpoints are configurable and currently set to `null` in `config.js` under `CONTROL_ENDPOINTS`. Once backend routes exist, plug them in there and the buttons will start issuing requests.

---

## Validation

- Ran syntax validation: `node --check` on `app.js` — **passes**.

---
# UPDATE NO. 2

---

## What changed:

### 1. Added logo to the top bar in frontend/index.html
### 2. Applied a water-inspired brand palette in frontend/style.css using:
- deep aqua/navy for the primary feel
- bright cyan/blue accents to echo the logo
- green and amber for status/UI balance
### 3. Kept the overall design cohesive with softer shadows, rounded cards, and cleaner contrast so it complements the logo instead of competing with it.

---
# UPDATE NO. 3

---

## What changed:

**Files changed:**
- `index.html`
- `style.css`

### 1. Added an intro splash screen
- New full-screen overlay (`#intro-screen`) shows `logos/Intro.svg` centered on load, sitting above the dashboard in `index.html`.
- Displays for 3 seconds, then fades out over 0.5s and is removed from layout (`display: none`) once the transition ends.
- Shown once per browser session (`sessionStorage`): reappears on a fresh tab/session but not on refresh or in-tab navigation. Falls back gracefully (just shows the intro) if `sessionStorage` is unavailable.

### 2. Sized and styled to match the dashboard
- Logo capped at `min(32vw, 220px)` so it reads as a splash mark, not a full-page graphic.
- Background reuses the same gradient as the dashboard body so the fade-out feels seamless rather than a jump cut.

## Validation
- Verified via headless-browser screenshots at 0s, 2s, and 4.2s: intro visible and correctly sized at load, still visible mid-delay, fully gone (dashboard visible) after the fade completes.