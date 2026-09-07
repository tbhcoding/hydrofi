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

---
# UPDATE NO. 4

---

## What changed:

**Files changed:**
- `index.html`
- `style.css`
- `app.js`

### 1. Brand-matched color palette
- Replaced the old teal/cyan palette with colors sampled directly from the HydroFi logo: dark forest green (`#0b5b1f`) and leaf green (`#1f8a3d`) for primary/brand, droplet blue (`#5170ff`/`#3b5bdb`) for accents and secondary chips.
- Updated every hardcoded shadow/border tied to the old palette (intro/brand logo glow, badges, buttons, chart line colors) so nothing was left mismatched.

### 2. Two-tab layout: Live Monitoring / Historical Analytics
- Split the single-page dashboard into tabs: **Live Monitoring** (stat cards, manual controls, totals) and **Historical Analytics** (time range selector, charts, and a new data table).
- Built as an accessible ARIA tabs pattern: `role="tab"`/`tabpanel`, `aria-selected`, roving `tabindex`, and arrow-key navigation between tabs.

### 3. Table view for history
- Added a Chart/Table view toggle inside Historical Analytics. Table mode shows a sortable-by-time data table with color-coded status pills (OK/LOW/HIGH/etc., reusing the same logic as the live stat cards) and client-side pagination (25 rows per page, Prev/Next).

### 4. Bug fix during verification
- The view-toggle's `.hidden` class was losing the CSS cascade to `.charts`/`.table-card`'s own `display` rules (equal specificity, later rule wins), so chart and table views briefly rendered simultaneously. Fixed with a higher-specificity override (`.charts.hidden, .table-card.hidden { display: none; }`).

## Validation
- Verified with headless-browser runs (desktop and 390px mobile width), including a pass with mocked API responses to confirm the table/charts populate, color-code, and paginate correctly. No console errors in any state.

---
# UPDATE NO. 5

---

## What changed:

**Files changed:**
- `index.html`
- `style.css`
- `app.js`

Reworked the visual language to be simpler and less "data-wall," using a plant-shop-app reference (soft rounded cards, pill buttons, icon-illustrated content) as a guide.

### 1. Inline SVG icon set
- Added a hidden `<symbol>` sprite (leaf, activity, bar-chart, droplet, sliders, thermometer, flask, repeat, wifi, clock, grid, chevrons) referenced via `<use>` throughout the UI.
- Icons are vector and sized in `em` units, so they scale cleanly with their surrounding text at any screen size instead of relying on a fixed-size icon font or raster images.

### 2. Pill-shaped tab navigation
- "Live Monitoring" / "Historical Analytics" now sit in a rounded floating pill nav with icons; the active tab gets a solid green fill.
- On narrow screens the text labels collapse to icon-only circles (visual labels hidden, `aria-label` kept for screen readers).

### 3. Icon-badge stat cards
- pH/TDS/Temp cards each get a small colored rounded-square icon badge (green droplet, blue sliders, amber thermometer) instead of a bare text header.

### 4. Pill buttons everywhere
- Manual Controls, the chart/table view toggle, the time range selector, and the table pager all switched from rectangular buttons to fully-rounded pill buttons with icons.

### 5. Softer corners and shadows
- Card border-radius increased (14px → 20px), shadows lightened and enlarged for a gentler, less boxy feel, matching the reference's soft aesthetic.

### 6. Compatibility fix
- `#connection-status` and `#freshness-status` used to have their whole `textContent` overwritten by JS on every update, which would have wiped out the new icons. Split each into an icon element plus a dedicated inner text span (`#connection-status-text`, `#freshness-status-text`) and updated `app.js` to target only the inner span.

## Validation
- Verified with headless-browser runs (desktop, chart/table toggle, table pagination, and 390px mobile width) using mocked API data — icons and pill nav render correctly at every breakpoint, no console errors.