// Point this at wherever the backend is actually running.
// Deployed on Railway as of step 4 -- swap to http://127.0.0.1:8000
// for local backend development instead.
const API_BASE = "https://hydrofi-backend-production.up.railway.app";

// v1 is single-device (see db/schema.sql). Revisit if a second unit
// ever needs picking between.
const DEVICE_ID = "hydrofi-01";

const REFRESH_INTERVAL_MS = 30_000; // matches the device's posting interval
const HISTORY_LIMIT = 100;
const STALE_READING_MS = REFRESH_INTERVAL_MS * 2;
const NEAR_EDGE_FRACTION = 0.15;
const HISTORY_LIMITS = {
  "1h": 120,
  "6h": 720,
  "24h": 1000,
  "7d": 1000,
};

// Manual dashboard controls, added in the backend as of this update.
const CONTROL_ENDPOINTS = {
  setMode: "/api/devices/mode",
  doseNutrient: "/api/dose/nutrient",
  dosePhDown: "/api/dose/ph-down",
};
