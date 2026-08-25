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