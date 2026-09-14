const deviceNameEl = document.getElementById("device-name");
const deviceModeEl = document.getElementById("device-mode");
const connectionStatusEl = document.getElementById("connection-status");
const connectionStatusTextEl = document.getElementById("connection-status-text");
const freshnessStatusEl = document.getElementById("freshness-status");
const freshnessStatusTextEl = document.getElementById("freshness-status-text");
const liveClockTimeEl = document.getElementById("live-clock-time");
const liveClockDateEl = document.getElementById("live-clock-date");
const lastUpdatedEl = document.getElementById("last-updated");
const nutrientTotalEl = document.getElementById("nutrient-total");
const phTotalEl = document.getElementById("ph-total");
const alertBannerEl = document.getElementById("alert-banner");
const toastContainerEl = document.getElementById("toast-container");
const modeIndicatorEl = document.getElementById("mode-indicator");
const modeToggleBtn = document.getElementById("mode-toggle-btn");
const doseNutrientBtn = document.getElementById("dose-nutrient-btn");
const dosePhBtn = document.getElementById("dose-ph-btn");
const rangeButtons = Array.from(document.querySelectorAll(".range-btn"));
const viewButtons = Array.from(document.querySelectorAll(".view-btn"));
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
const tipsListEl = document.getElementById("tips-list");
const tipsCardEl = document.getElementById("tips-card");
const tipsCloseBtn = document.getElementById("tips-close-btn");
const tipsShowBtn = document.getElementById("tips-show-btn");
const chatMessagesEl = document.getElementById("chat-messages");
const chatFormEl = document.getElementById("chat-form");
const chatInputEl = document.getElementById("chat-input");
const historyChartViewEl = document.getElementById("history-chart-view");
const historyTableViewEl = document.getElementById("history-table-view");
const historyTableBodyEl = document.getElementById("history-table-body");
const tablePrevBtn = document.getElementById("table-prev-btn");
const tableNextBtn = document.getElementById("table-next-btn");
const tablePageLabelEl = document.getElementById("table-page-label");
const confirmOverlayEl = document.getElementById("confirm-overlay");
const confirmModalTitleEl = document.getElementById("confirm-modal-title");
const confirmModalMessageEl = document.getElementById("confirm-modal-message");
const confirmModalOkBtn = document.getElementById("confirm-modal-ok");
const confirmModalCancelBtn = document.getElementById("confirm-modal-cancel");

// highCorrection/lowCorrection describe what actually happens on this hardware when a
// reading is above/below range: the nutrient pump can only raise TDS and the pH-down
// pump can only lower pH (see backend/main.py AUTO_DOSE comments) -- there is no pump
// for the opposite direction on either metric, and no pump at all for temperature.
const stats = {
  ph: {
    label: "pH",
    valueEl: document.getElementById("ph-value"),
    rangeEl: document.getElementById("ph-range"),
    statusEl: document.getElementById("ph-status"),
    cardEl: document.getElementById("card-ph"),
    minField: "ph_min",
    maxField: "ph_max",
    readingField: "ph",
    decimals: 2,
    zeroOffline: true,
    highCorrection: {
      automatic: true,
      pumpLabel: "pH-down pump",
      consequence: "High pH locks out iron, manganese, and phosphorus, so roots can't absorb nutrients even if they're in the reservoir.",
    },
    lowCorrection: {
      automatic: false,
      consequence: "Low pH stresses roots and can push some micronutrients to toxic concentrations.",
      manualAction: "add a pH-up buffer solution to the reservoir by hand -- there's no pump that raises pH",
    },
  },
  tds: {
    label: "TDS",
    valueEl: document.getElementById("tds-value"),
    rangeEl: document.getElementById("tds-range"),
    statusEl: document.getElementById("tds-status"),
    cardEl: document.getElementById("card-tds"),
    minField: "tds_min",
    maxField: "tds_max",
    readingField: "tds",
    decimals: 0,
    zeroOffline: true,
    highCorrection: {
      automatic: false,
      consequence: "Excess TDS raises salinity around the roots, which can cause nutrient burn and slow water uptake.",
      manualAction: "dilute the reservoir with fresh water -- there's no pump that lowers TDS",
    },
    lowCorrection: {
      automatic: true,
      pumpLabel: "nutrient pump",
      consequence: "Low TDS means the plants are running short on nutrients, which shows up as pale leaves and slow growth.",
    },
  },
  temp: {
    label: "Temp",
    valueEl: document.getElementById("temp-value"),
    rangeEl: document.getElementById("temp-range"),
    statusEl: document.getElementById("temp-status"),
    cardEl: document.getElementById("card-temp"),
    minField: "temp_min",
    maxField: "temp_max",
    readingField: "temp_c",
    decimals: 1,
    zeroOffline: false,
    highCorrection: {
      automatic: false,
      consequence: "Warm water holds less dissolved oxygen, raising the risk of root rot and algae growth.",
      manualAction: "improve ventilation or shade the reservoir from direct sun -- there's no pump or cooling hardware for this",
    },
    lowCorrection: {
      automatic: false,
      consequence: "Cold water slows nutrient uptake and can shock the roots.",
      manualAction: "add reservoir insulation or a water heater -- there's no pump or heating hardware for this",
    },
  },
};

// Crop reference data condensed from ZipGrow's "Best Crops for Hydroponics Guide" (2020).
// ppm ranges use the ppm-500/TDS standard, the same standard most North American TDS
// meters (and this device's TDS reading) use, so they compare directly with no conversion.
const CROP_GUIDE = [
  {
    name: "Arugula", aliases: ["arugula", "rocket"], beginner: true, coolRegion: true,
    ph: [5.5, 6.5], ppm: [400, 700], tempF: [50, 75], idealTempF: 65,
    harvestWeeks: "about 6-8 weeks from seed",
    blurb: "A peppery, fast-growing salad green. Rarely bothered by pests -- easy for beginners.",
  },
  {
    name: "Bok Choy", aliases: ["bok choy", "pak choi"], beginner: true, coolRegion: true, warmRegion: true,
    ph: [5.5, 6.5], ppm: [750, 1250], tempF: [55, 75], idealTempF: 65,
    harvestWeeks: "about 7-9 weeks from seed",
    blurb: "A crunchy Asian cabbage where both the stalk and leaf are eaten. Tolerates a wider range of conditions than most greens.",
  },
  {
    name: "Kale", aliases: ["kale"], beginner: true, coolRegion: true,
    ph: [5.5, 6.5], ppm: [800, 1250], tempF: [45, 85], idealTempF: 65,
    harvestWeeks: "about 6-8 weeks from seed",
    blurb: "A hardy, nutrient-dense green that tolerates a wide temperature range. Harvest a few leaves at a time rather than the whole plant.",
  },
  {
    name: "Lettuce", aliases: ["lettuce"], beginner: true, coolRegion: true,
    ph: [5.5, 6.5], ppm: [500, 800], tempF: [45, 75], idealTempF: 65,
    harvestWeeks: "about 5-6 weeks from transplant (9-11 weeks from seed)",
    blurb: "The classic salad crop -- fast, low-maintenance, and always in demand. Harvest the whole head at once.",
  },
  {
    name: "Mustard Greens", aliases: ["mustard greens", "mustard"], beginner: true, coolRegion: true,
    ph: [5.5, 6.5], ppm: [600, 1200], tempF: [50, 75], idealTempF: 65,
    harvestWeeks: "about 6-8 weeks from seed",
    blurb: "A spicy, radish-flavored green related to kale and cabbage. Harvest a portion at a time so the plant keeps producing.",
  },
  {
    name: "Swiss Chard", aliases: ["swiss chard", "chard"], beginner: true,
    ph: [5.5, 6.5], ppm: [800, 1150], tempF: [55, 75], idealTempF: 65,
    harvestWeeks: "about 6-8 weeks from seed",
    blurb: "A mild, buttery green with colorful stems. Cold-hardy and easy to regrow -- only take about a third of the plant per harvest.",
  },
  {
    name: "Basil", aliases: ["basil"], warmRegion: true,
    ph: [5.5, 6.5], ppm: [800, 1100], tempF: [65, 90], idealTempF: 75,
    harvestWeeks: "about 7-9 weeks from seed",
    blurb: "A warmth-loving herb with big, fragrant harvests. Prune the growing tip to encourage bushier growth.",
  },
  {
    name: "Chives", aliases: ["chives"], beginner: true, lowWater: true,
    ph: [5.5, 6.5], ppm: [800, 1100], tempF: [55, 80], idealTempF: 70,
    harvestWeeks: "about 10-12 weeks (grows faster from root divisions than seed)",
    blurb: "A tough, low-maintenance herb that shrugs off temperature swings and short dry spells -- great for beginners.",
  },
  {
    name: "Cilantro", aliases: ["cilantro", "coriander"], coolRegion: true, lowWater: true,
    ph: [5.5, 6.5], ppm: [600, 1000], tempF: [50, 80], idealTempF: 65,
    harvestWeeks: "about 7-9 weeks from seed",
    blurb: "Tricky in heat -- it bolts (shoots up a bitter flower stalk) easily when it gets too warm, so keep it cool.",
  },
  {
    name: "Fennel", aliases: ["fennel"], beginner: true, coolRegion: true, lowWater: true,
    ph: [5.5, 6.5], ppm: [500, 900], tempF: [55, 75], idealTempF: 65,
    harvestWeeks: "about 7-10 weeks from seed",
    blurb: "A mildly sweet, anise-flavored herb that prefers lighter nutrient strength than most. Handles heat, cold, and drought well, but not frost.",
  },
  {
    name: "Mint", aliases: ["mint", "spearmint", "peppermint"], beginner: true, coolRegion: true,
    ph: [5.5, 6.5], ppm: [800, 1300], tempF: [55, 75], idealTempF: 70,
    harvestWeeks: "about 8-10 weeks (faster from cuttings than seed)",
    blurb: "A vigorous, easy-to-grow herb best started from a cutting rather than seed.",
  },
  {
    name: "Oregano", aliases: ["oregano"], warmRegion: true, lowWater: true,
    ph: [5.5, 6.5], ppm: [750, 1000], tempF: [55, 80], idealTempF: 70,
    harvestWeeks: "about 7-9 weeks from seed",
    blurb: "A bushy, strong-flavored herb. Its fuzzy leaves can struggle in high humidity, so good airflow helps.",
  },
  {
    name: "Parsley", aliases: ["parsley"],
    ph: [5.5, 6.5], ppm: [700, 1200], tempF: [55, 80], idealTempF: 70,
    harvestWeeks: "about 10-11 weeks from seed",
    blurb: "A tolerant, easy-going herb that handles a wide range of conditions and cold snaps well.",
  },
  {
    name: "Rosemary", aliases: ["rosemary"],
    ph: [5.5, 6.5], ppm: [600, 900], tempF: [60, 80], idealTempF: 75,
    harvestWeeks: "about 10-12 weeks (best started from a cutting, not seed)",
    blurb: "Prefers to dry out a bit between waterings and is best grown from a cutting -- seeds are slow and unreliable.",
  },
  {
    name: "Strawberries", aliases: ["strawberry", "strawberries"],
    ph: [5.5, 6.5], ppm: [400, 700], tempF: [65, 75], idealTempF: 70,
    harvestWeeks: "about 7-10 weeks from rootstock to first harvest",
    blurb: "The easiest fruiting crop to grow this way -- best started from rootstock (runners) rather than seed, and prone to pests like spider mites.",
  },
];

function fahrenheitToCelsius(f) {
  return Math.round(((f - 32) * 5) / 9 * 10) / 10;
}

function rangesOverlap(a, b) {
  return a[0] <= b[1] && b[0] <= a[1];
}

function findCropInText(text) {
  return CROP_GUIDE.find((crop) => crop.aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(text)));
}

function describeCrop(crop) {
  const tempC = crop.tempF.map(fahrenheitToCelsius);
  const idealC = fahrenheitToCelsius(crop.idealTempF);
  return `${crop.name}: ${crop.blurb} It likes pH ${crop.ph[0]}–${crop.ph[1]}, nutrient strength (TDS) around ${crop.ppm[0]}–${crop.ppm[1]} ppm, and water temp ${tempC[0]}–${tempC[1]}°C (ideally near ${idealC}°C). First harvest is ${crop.harvestWeeks}.`;
}

function compareCropToDeviceRanges(crop) {
  const phFits = rangesOverlap(crop.ph, [deviceRanges.ph_min, deviceRanges.ph_max]);
  const tdsFits = rangesOverlap(crop.ppm, [deviceRanges.tds_min, deviceRanges.tds_max]);
  if (phFits && tdsFits) {
    return {
      text: `Yes — ${crop.name} should do well with your current target range (pH ${deviceRanges.ph_min}–${deviceRanges.ph_max}, TDS ${deviceRanges.tds_min}–${deviceRanges.tds_max} ppm).`,
      severity: "ok",
    };
  }
  const mismatches = [];
  if (!phFits) mismatches.push(`pH (it wants ${crop.ph[0]}–${crop.ph[1]}, you're set to ${deviceRanges.ph_min}–${deviceRanges.ph_max})`);
  if (!tdsFits) mismatches.push(`nutrient strength (it wants ${crop.ppm[0]}–${crop.ppm[1]} ppm, you're set to ${deviceRanges.tds_min}–${deviceRanges.tds_max} ppm)`);
  return { text: `${crop.name} might struggle with your current settings — mismatch on ${mismatches.join(" and ")}.`, severity: "warn" };
}

function suggestCropsForCurrentRange() {
  if (!deviceRanges) return { text: "I don't have your target ranges yet, so I can't suggest crops.", severity: "neutral" };
  const phRange = [deviceRanges.ph_min, deviceRanges.ph_max];
  const tdsRange = [deviceRanges.tds_min, deviceRanges.tds_max];
  const fits = CROP_GUIDE.filter((crop) => rangesOverlap(crop.ph, phRange) && rangesOverlap(crop.ppm, tdsRange));
  if (fits.length === 0) {
    return {
      text: `None of the crops in my guide quite match your current target range (pH ${phRange[0]}–${phRange[1]}, TDS ${tdsRange[0]}–${tdsRange[1]} ppm) — you may be dialed in for something more specialized.`,
      severity: "neutral",
    };
  }
  return {
    text: `Based on your current target range (pH ${phRange[0]}–${phRange[1]}, TDS ${tdsRange[0]}–${tdsRange[1]} ppm), good fits from my guide are: ${fits.map((c) => c.name).join(", ")}.`,
    severity: "neutral",
  };
}

let deviceRanges = null;
let lastReadingAtMs = null;
let currentMode = "—";
let activeRange = "1h";
let activeView = "chart";
let previousAlertKeys = new Set();
let lastMetricStates = {};
let isConnected = false;
let lastHistoryRows = [];
let tablePage = 1;
const TABLE_PAGE_SIZE = 25;

async function fetchJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function postJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const responseBody = await res.json().catch(() => ({}));
    throw new Error(responseBody.detail || `${res.status} ${res.statusText}`);
  }
  return res.json().catch(() => ({}));
}

function setConnectionStatus(state, detail) {
  isConnected = state !== "error";
  connectionStatusTextEl.textContent = detail || state;
  connectionStatusEl.className = `status status-${state}`;
  renderTips();
}

function formatRelativeAge(msSinceUpdate) {
  const seconds = Math.max(0, Math.floor(msSinceUpdate / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function updateLiveClock() {
  const now = new Date();
  liveClockTimeEl.textContent = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  liveClockDateEl.textContent = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function tickClock() {
  updateLiveClock();
  updateFreshnessStatus();
}

function updateFreshnessStatus() {
  if (!lastReadingAtMs) {
    freshnessStatusTextEl.textContent = "last updated —";
    freshnessStatusEl.classList.remove("stale");
    return;
  }
  const ageMs = Date.now() - lastReadingAtMs;
  freshnessStatusTextEl.textContent = `last updated ${formatRelativeAge(ageMs)}`;
  const stale = ageMs > STALE_READING_MS;
  freshnessStatusEl.classList.toggle("stale", stale);
  if (isConnected && stale) {
    setConnectionStatus("warn", "connected (stale)");
  } else if (isConnected && !stale) {
    setConnectionStatus("ok", "connected");
  }
}

function formatMetricValue(metric, value) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(metric.decimals);
}

function updateMetricUI(metricKey, state) {
  const metric = stats[metricKey];
  metric.valueEl.textContent = state.valueText;
  metric.rangeEl.textContent = `target ${state.min}–${state.max}`;
  metric.statusEl.textContent = state.label;
  metric.statusEl.className = `metric-status ${state.state}`;

  metric.cardEl.classList.remove("status-ok", "status-warn", "status-error", "status-offline");
  metric.cardEl.classList.add(`status-${state.state}`);
}

function evaluateMetricState(metric, value, min, max, readingAgeMs) {
  const offlineByStale = readingAgeMs != null && readingAgeMs > STALE_READING_MS;
  const offlineByMissing = value == null || Number.isNaN(value);
  const offlineByZero = metric.zeroOffline && Number(value) === 0;
  if (offlineByMissing) {
    return {
      state: "offline",
      label: "NO DATA",
      valueText: "—",
      min,
      max,
      alert: { key: `${metric.label}-no-data`, severity: "warn", message: `${metric.label}: no data` },
    };
  }
  if (offlineByZero) {
    return {
      state: "offline",
      label: "SENSOR OFFLINE",
      valueText: "—",
      min,
      max,
      alert: { key: `${metric.label}-offline-zero`, severity: "error", message: `${metric.label}: sensor offline` },
    };
  }
  if (offlineByStale) {
    return {
      state: "offline",
      label: "STALE",
      valueText: formatMetricValue(metric, value),
      min,
      max,
      alert: { key: `${metric.label}-stale`, severity: "warn", message: `${metric.label}: stale reading` },
    };
  }

  const numeric = Number(value);
  if (numeric < min) {
    return {
      state: "error",
      label: "LOW",
      valueText: formatMetricValue(metric, numeric),
      min,
      max,
      alert: { key: `${metric.label}-low`, severity: "error", message: `${metric.label}: low (${numeric})` },
    };
  }
  if (numeric > max) {
    return {
      state: "error",
      label: "HIGH",
      valueText: formatMetricValue(metric, numeric),
      min,
      max,
      alert: { key: `${metric.label}-high`, severity: "error", message: `${metric.label}: high (${numeric})` },
    };
  }

  const buffer = (max - min) * NEAR_EDGE_FRACTION;
  const nearLow = numeric - min <= buffer;
  const nearHigh = max - numeric <= buffer;
  if (nearLow) {
    return {
      state: "warn",
      label: "NEAR LOW",
      valueText: formatMetricValue(metric, numeric),
      min,
      max,
      alert: null,
    };
  }
  if (nearHigh) {
    return {
      state: "warn",
      label: "NEAR HIGH",
      valueText: formatMetricValue(metric, numeric),
      min,
      max,
      alert: null,
    };
  }
  return {
    state: "ok",
    label: "OK",
    valueText: formatMetricValue(metric, numeric),
    min,
    max,
    alert: null,
  };
}

function showToast(message, severity = "warn") {
  const toast = document.createElement("div");
  toast.className = `toast ${severity}`;
  toast.textContent = message;
  toastContainerEl.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 6000);
}

let confirmResolve = null;

function closeConfirm(result) {
  confirmOverlayEl.classList.add("hidden");
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}

function showConfirm(message, { title = "Confirm action", confirmLabel = "Confirm", danger = false } = {}) {
  confirmModalTitleEl.textContent = title;
  confirmModalMessageEl.textContent = message;
  confirmModalOkBtn.textContent = confirmLabel;
  confirmModalOkBtn.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
  confirmOverlayEl.classList.remove("hidden");
  confirmModalOkBtn.focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

confirmModalOkBtn.addEventListener("click", () => closeConfirm(true));
confirmModalCancelBtn.addEventListener("click", () => closeConfirm(false));
confirmOverlayEl.addEventListener("click", (event) => {
  if (event.target === confirmOverlayEl) closeConfirm(false);
});
document.addEventListener("keydown", (event) => {
  if (confirmOverlayEl.classList.contains("hidden")) return;
  if (event.key === "Escape") closeConfirm(false);
});

function renderAlerts(alerts) {
  if (alerts.length === 0) {
    alertBannerEl.classList.add("hidden");
    alertBannerEl.classList.remove("critical");
    previousAlertKeys = new Set();
    return;
  }

  const hasCritical = alerts.some((a) => a.severity === "error");
  alertBannerEl.classList.remove("hidden");
  alertBannerEl.classList.toggle("critical", hasCritical);
  const first = alerts[0].message;
  const extraCount = alerts.length - 1;
  alertBannerEl.textContent = extraCount > 0 ? `${first} (+${extraCount} more alert${extraCount > 1 ? "s" : ""})` : first;

  const currentKeys = new Set(alerts.map((a) => a.key));
  alerts.forEach((alert) => {
    if (!previousAlertKeys.has(alert.key)) {
      showToast(alert.message, alert.severity);
    }
  });
  previousAlertKeys = currentKeys;
}

function updateModeUI(mode) {
  currentMode = (mode || "—").toUpperCase();
  deviceModeEl.textContent = currentMode;
  modeIndicatorEl.textContent = `Mode ${currentMode}`;
  modeIndicatorEl.classList.remove("auto", "manual");
  if (currentMode === "AUTO") {
    modeIndicatorEl.classList.add("auto");
    modeToggleBtn.textContent = "Switch to MANUAL";
  } else if (currentMode === "MANUAL") {
    modeIndicatorEl.classList.add("manual");
    modeToggleBtn.textContent = "Switch to AUTO";
  } else {
    modeToggleBtn.textContent = "Switch mode";
  }
}

function getHistoryLimit() {
  return HISTORY_LIMITS[activeRange] || HISTORY_LIMIT;
}

function getRangeClass(key) {
  const btn = rangeButtons.find((item) => item.dataset.range === key);
  if (!btn) return;
  rangeButtons.forEach((item) => item.classList.remove("active"));
  btn.classList.add("active");
}

function setActiveView(view) {
  activeView = view;
  viewButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  historyChartViewEl.classList.toggle("hidden", view !== "chart");
  historyTableViewEl.classList.toggle("hidden", view !== "table");
  if (view === "chart") {
    Object.values(charts).forEach((chart) => chart.resize());
  }
}

function setActiveTab(tabName) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
    btn.tabIndex = isActive ? 0 : -1;
  });
  tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.tab !== tabName;
  });
  if (tabName === "history" && activeView === "chart") {
    Object.values(charts).forEach((chart) => chart.resize());
  }
}

async function loadDevice() {
  const device = await fetchJSON(`/api/devices/${DEVICE_ID}`);
  deviceRanges = device;
  deviceNameEl.textContent = device.name;
  updateModeUI(device.mode);
}

async function loadLatest() {
  try {
    const reading = await fetchJSON(`/api/readings/latest?device_id=${DEVICE_ID}`);
    const readingAt = new Date(reading.recorded_at);
    lastReadingAtMs = Number.isNaN(readingAt.getTime()) ? null : readingAt.getTime();
    const readingAgeMs = lastReadingAtMs == null ? null : Date.now() - lastReadingAtMs;

    const alerts = [];
    Object.entries(stats).forEach(([key, metric]) => {
      const min = deviceRanges[metric.minField];
      const max = deviceRanges[metric.maxField];
      const value = reading[metric.readingField];
      const state = evaluateMetricState(metric, value, min, max, readingAgeMs);
      updateMetricUI(key, state);
      lastMetricStates[key] = state;
      if (state.alert) alerts.push(state.alert);
    });

    renderAlerts(alerts);
    lastUpdatedEl.textContent = lastReadingAtMs ? readingAt.toLocaleString() : "—";
    updateFreshnessStatus();
    setConnectionStatus("ok", "connected");
    renderTips();
  } catch (err) {
    if (err.message.includes("no readings")) {
      setConnectionStatus("warn", "no readings yet");
      lastReadingAtMs = null;
      updateFreshnessStatus();
      Object.entries(stats).forEach(([key, metric]) => {
        const state = {
          state: "offline",
          label: "NO DATA",
          valueText: "—",
          min: deviceRanges[metric.minField],
          max: deviceRanges[metric.maxField],
        };
        updateMetricUI(key, state);
        lastMetricStates[key] = state;
      });
      renderAlerts([{ key: "global-no-readings", severity: "warn", message: "No readings available yet" }]);
      renderTips();
    } else {
      throw err;
    }
  }
}

async function loadTotals() {
  const totals = await fetchJSON(`/api/readings/totals?device_id=${DEVICE_ID}`);
  nutrientTotalEl.textContent = `${totals.nutrient_ml_total} mL`;
  phTotalEl.textContent = `${totals.ph_ml_total} mL`;
}

const charts = {};

function makeChart(metricKey, canvasId, label, color) {
  const ctx = document.getElementById(canvasId);
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Target min",
          data: [],
          borderWidth: 0,
          pointRadius: 0,
        },
        {
          label: "Target max",
          data: [],
          borderWidth: 0,
          pointRadius: 0,
          fill: "-1",
          backgroundColor: "rgba(47, 158, 68, 0.14)",
        },
        {
          label,
          data: [],
          borderColor: color,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
          grid: { display: true, color: "#edf2f7" },
        },
        y: {
          grid: { display: true, color: "#edf2f7" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const item = items[0];
              return item?.chart.fullLabels?.[item.dataIndex] || item?.label || "";
            },
            label: (context) => {
              if (context.datasetIndex !== 2) return null;
              const metric = stats[metricKey];
              return `${metric.label}: ${formatMetricValue(metric, context.parsed.y)}`;
            },
            afterLabel: () => {
              const metric = stats[metricKey];
              const min = deviceRanges?.[metric.minField];
              const max = deviceRanges?.[metric.maxField];
              return min != null && max != null ? `Target: ${min}-${max}` : "";
            },
          },
        },
      },
    },
  });
}

function formatChartTimestamp(date, includeDate) {
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!includeDate) return time;
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

async function loadHistory() {
  const rows = await fetchJSON(`/api/readings/history?device_id=${DEVICE_ID}&limit=${getHistoryLimit()}`);
  const chronological = [...rows].reverse();
  const spansMultipleDays =
    chronological.length > 0 &&
    new Date(chronological[0].recorded_at).toDateString() !==
      new Date(chronological[chronological.length - 1].recorded_at).toDateString();
  const labels = chronological.map((r) => formatChartTimestamp(new Date(r.recorded_at), spansMultipleDays));
  const fullLabels = chronological.map((r) => new Date(r.recorded_at).toLocaleString());

  Object.entries(stats).forEach(([key, metric]) => {
    const chart = charts[key];
    if (!chart) return;
    const values = chronological.map((r) => r[metric.readingField]);
    const minLine = chronological.map(() => deviceRanges[metric.minField]);
    const maxLine = chronological.map(() => deviceRanges[metric.maxField]);

    chart.data.labels = labels;
    chart.fullLabels = fullLabels;
    chart.data.datasets[0].data = minLine;
    chart.data.datasets[1].data = maxLine;
    chart.data.datasets[2].data = values;
    chart.update();
  });

  lastHistoryRows = rows;
  renderHistoryTable();
}

function metricCellHTML(metricKey, value) {
  const metric = stats[metricKey];
  const min = deviceRanges?.[metric.minField];
  const max = deviceRanges?.[metric.maxField];
  if (min == null || max == null) {
    return `<span class="table-value">${formatMetricValue(metric, value)}</span>`;
  }
  const state = evaluateMetricState(metric, value, min, max, null);
  return `<span class="table-value">${state.valueText}</span><span class="table-pill metric-status ${state.state}">${state.label}</span>`;
}

function renderHistoryTable() {
  const totalRows = lastHistoryRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / TABLE_PAGE_SIZE));
  tablePage = Math.min(Math.max(1, tablePage), totalPages);

  if (totalRows === 0) {
    historyTableBodyEl.innerHTML = `<tr><td colspan="4" class="table-empty">No data yet.</td></tr>`;
  } else {
    const start = (tablePage - 1) * TABLE_PAGE_SIZE;
    const pageRows = lastHistoryRows.slice(start, start + TABLE_PAGE_SIZE);
    historyTableBodyEl.innerHTML = pageRows
      .map((row) => {
        const time = new Date(row.recorded_at).toLocaleString();
        return `<tr>
          <td>${time}</td>
          <td>${metricCellHTML("ph", row.ph)}</td>
          <td>${metricCellHTML("tds", row.tds)}</td>
          <td>${metricCellHTML("temp", row.temp_c)}</td>
        </tr>`;
      })
      .join("");
  }

  tablePageLabelEl.textContent = `Page ${tablePage} of ${totalPages}`;
  tablePrevBtn.disabled = tablePage <= 1;
  tableNextBtn.disabled = tablePage >= totalPages;
}

async function refresh() {
  try {
    await Promise.all([loadLatest(), loadTotals(), loadHistory()]);
  } catch (err) {
    setConnectionStatus("error", `offline: ${err.message}`);
  }
}

async function sendManualCommand(type) {
  const endpoints = CONTROL_ENDPOINTS || {};
  if (type === "mode") {
    const targetMode = currentMode === "MANUAL" ? "AUTO" : "MANUAL";
    const confirmed = await showConfirm(`Switch device to ${targetMode} mode?`, {
      title: "Switch mode",
      confirmLabel: `Switch to ${targetMode}`,
    });
    if (!confirmed) return;
    if (!endpoints.setMode) {
      showToast("Manual mode endpoint is not configured.", "error");
      return;
    }
    await postJSON(endpoints.setMode, { device_id: DEVICE_ID, mode: targetMode });
    updateModeUI(targetMode);
    showToast(`Mode switched to ${targetMode}.`, "warn");
    return;
  }

  const isNutrient = type === "nutrient";
  const endpoint = isNutrient ? endpoints.doseNutrient : endpoints.dosePhDown;
  const actionLabel = isNutrient ? "dose nutrient" : "dose pH-down";
  const confirmed = await showConfirm(`This will ${actionLabel} now.`, {
    title: "Confirm manual action",
    confirmLabel: "Send command",
    danger: !isNutrient,
  });
  if (!confirmed) return;
  if (!endpoint) {
    showToast(`Manual control endpoint for ${actionLabel} is not configured.`, "error");
    return;
  }

  await postJSON(endpoint, { device_id: DEVICE_ID });
  showToast(`Manual command sent: ${actionLabel}.`, "warn");
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildTips() {
  if (!isConnected) {
    return [{ severity: "error", text: "Can't reach the backend right now. Check your network connection or the backend service status." }];
  }
  if (!lastReadingAtMs) {
    return [{ severity: "neutral", text: "Waiting for the device's first reading. Tips will appear once data comes in." }];
  }

  const tips = [];
  Object.entries(stats).forEach(([key, metric]) => {
    const state = lastMetricStates[key];
    if (!state) return;
    const min = deviceRanges?.[metric.minField];
    const max = deviceRanges?.[metric.maxField];
    const range = min != null && max != null ? `${min}–${max}` : "the target range";
    const direction = state.label.includes("HIGH") ? "high" : "low";
    const correction = direction === "high" ? metric.highCorrection : metric.lowCorrection;

    if (state.state === "ok") {
      tips.push({ severity: "ok", text: `${metric.label} is steady at ${state.valueText}, right in the ${range} target. No action needed.` });
    } else if (state.state === "warn") {
      if (correction.automatic) {
        const autoNote =
          currentMode === "AUTO"
            ? `The ${correction.pumpLabel} will kick in automatically if it crosses the line.`
            : "Device is in MANUAL mode, so auto-dosing won't kick in until you switch back to AUTO.";
        tips.push({
          severity: "warn",
          text: `${metric.label} is trending ${state.label.toLowerCase()} (${state.valueText}), nearing the edge of ${range}. ${correction.consequence} ${autoNote}`,
        });
      } else {
        tips.push({
          severity: "warn",
          text: `${metric.label} is trending ${state.label.toLowerCase()} (${state.valueText}), nearing the edge of ${range}. ${correction.consequence} Keep watching — if it crosses, you'll need to ${correction.manualAction}.`,
        });
      }
    } else if (state.state === "error") {
      if (correction.automatic) {
        const autoNote =
          currentMode === "AUTO"
            ? `The ${correction.pumpLabel} will auto-correct this on the next reading.`
            : "Device is in MANUAL mode, so this won't auto-correct — dose from Manual Controls now, or switch back to AUTO.";
        tips.push({
          severity: "error",
          text: `${metric.label} is ${state.label} at ${state.valueText}, outside ${range}. ${correction.consequence} ${autoNote}`,
        });
      } else {
        tips.push({
          severity: "error",
          text: `${metric.label} is ${state.label} at ${state.valueText}, outside ${range}. ${correction.consequence} ${capitalize(correction.manualAction)}.`,
        });
      }
    } else if (state.state === "offline") {
      tips.push({ severity: "neutral", text: `${metric.label}: ${state.label.toLowerCase()}. Check the sensor connection.` });
    }
  });

  if (currentMode === "MANUAL") {
    tips.push({ severity: "warn", text: "Device is in MANUAL mode, so out-of-range readings won't be auto-corrected. Switch back to AUTO when you're done." });
  }

  if (freshnessStatusEl.classList.contains("stale")) {
    tips.push({ severity: "warn", text: "The latest reading is older than expected. Confirm the device is powered on and posting." });
  }

  tips.push({ severity: "neutral", text: "Reminder: dosing totals track pump activity, not tank volume — check your reservoir level physically now and then." });

  return tips;
}

function renderTips() {
  if (!tipsListEl) return;
  const tips = buildTips();
  tipsListEl.innerHTML = tips.map((tip) => `<li class="tip-item ${tip.severity}">${tip.text}</li>`).join("");
}

function addChatMessage(text, sender, severity = "neutral") {
  const div = document.createElement("div");
  div.className = sender === "bot" ? `chat-msg ${sender} ${severity}` : `chat-msg ${sender}`;
  div.textContent = text;
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function formatMetricAnswer(key) {
  const metric = stats[key];
  const state = lastMetricStates[key];
  if (!state) return { text: `I don't have a ${metric.label} reading yet.`, severity: "neutral" };
  const min = deviceRanges?.[metric.minField];
  const max = deviceRanges?.[metric.maxField];
  const range = min != null && max != null ? `${min}–${max}` : "unknown";
  if (state.state === "offline") {
    return { text: `${metric.label}: no current reading (${state.label.toLowerCase()}). Target range is ${range}.`, severity: "neutral" };
  }
  return { text: `${metric.label} is currently ${state.valueText} (${state.label}). Target range is ${range}.`, severity: state.state };
}

function answerQuestion(raw) {
  const q = raw.toLowerCase();

  if (!isConnected) {
    return { text: "I can't reach the backend right now, so I don't have live data to check.", severity: "error" };
  }
  if (/\b(hi|hello|hey)\b/.test(q)) {
    return { text: "Hi! Ask me about your pH, TDS, temperature, mode, dosing totals, or whether everything's okay.", severity: "neutral" };
  }
  if (/\bhelp\b|what can you/.test(q)) {
    return {
      text: 'I can answer things like "what\'s my pH?", "is TDS okay?", "what mode am I in?", "how much nutrient has been dosed?", "is everything fine?", "what does basil need?", "is kale good for my setup?", or "what crops fit my current range?". I\'m a simple rule-based assistant, not a live AI — I only know what\'s on this dashboard and my crop guide.',
      severity: "neutral",
    };
  }

  const mentionedCrop = findCropInText(q);
  if (mentionedCrop && deviceRanges && /fit|compatible|suitable|match|good for my|work (for|with) my/.test(q)) {
    return compareCropToDeviceRanges(mentionedCrop);
  }
  if (mentionedCrop) {
    return { text: describeCrop(mentionedCrop), severity: "neutral" };
  }
  if (/what (can|should) i grow|suggest.*crop|crops?.*\bfit\b|\bfit my\b/.test(q)) {
    return suggestCropsForCurrentRange();
  }
  if (/beginner|easy (crop|plant)/.test(q)) {
    const names = CROP_GUIDE.filter((c) => c.beginner).map((c) => c.name).join(", ");
    return { text: `Good beginner-friendly crops from my guide: ${names}.`, severity: "neutral" };
  }
  if (/cool region|cool weather crop/.test(q)) {
    const names = CROP_GUIDE.filter((c) => c.coolRegion).map((c) => c.name).join(", ");
    return { text: `Crops that prefer cooler conditions: ${names}.`, severity: "neutral" };
  }
  if (/warm region|warm weather crop/.test(q)) {
    const names = CROP_GUIDE.filter((c) => c.warmRegion).map((c) => c.name).join(", ");
    return { text: `Crops that prefer warmer conditions: ${names}.`, severity: "neutral" };
  }
  if (/low water/.test(q)) {
    const names = CROP_GUIDE.filter((c) => c.lowWater).map((c) => c.name).join(", ");
    return { text: `Low-water, low-maintenance crops: ${names}.`, severity: "neutral" };
  }

  if (/\bph\b/.test(q) && !q.includes("ph-down") && !q.includes("ph down")) {
    return formatMetricAnswer("ph");
  }
  if (/\btds\b|nutrient level|concentration/.test(q)) {
    return formatMetricAnswer("tds");
  }
  if (/\btemp(erature)?\b/.test(q)) {
    return formatMetricAnswer("temp");
  }
  if (/\bmode\b|\bauto\b|\bmanual\b/.test(q)) {
    return {
      text: `The device is currently in ${currentMode} mode. ${currentMode === "MANUAL" ? "Automatic corrections are paused until you switch back to AUTO." : "It will auto-correct out-of-range readings."}`,
      severity: currentMode === "MANUAL" ? "warn" : "ok",
    };
  }
  if (/connect|online|offline|backend/.test(q)) {
    return {
      text: isConnected ? "The dashboard is connected to the backend." : "The dashboard can't currently reach the backend.",
      severity: isConnected ? "ok" : "error",
    };
  }
  if (/total|dosed|how much/.test(q)) {
    return { text: `Lifetime totals: ${nutrientTotalEl.textContent} nutrient, ${phTotalEl.textContent} pH-down.`, severity: "neutral" };
  }
  if (/okay|alright|fine|problem|wrong|issue|alert/.test(q)) {
    const tips = buildTips();
    const issues = tips.filter((t) => t.severity === "warn" || t.severity === "error");
    if (issues.length === 0) return { text: "Everything looks good right now — all readings are within target range.", severity: "ok" };
    const severity = issues.some((t) => t.severity === "error") ? "error" : "warn";
    return { text: `Heads up: ${issues.map((t) => t.text).join(" ")}`, severity };
  }
  return {
    text: 'I\'m a simple rule-based assistant — I can answer questions about your pH, TDS, temperature, mode, connection, dosing totals, and crops like basil, kale, or lettuce. Try "what\'s my pH?", "what does mint need?", or "what crops fit my range?"',
    severity: "neutral",
  };
}

function wireUI() {
  modeToggleBtn.addEventListener("click", async () => {
    try {
      await sendManualCommand("mode");
    } catch (err) {
      showToast(`Failed to switch mode: ${err.message}`, "error");
    }
  });

  doseNutrientBtn.addEventListener("click", async () => {
    try {
      await sendManualCommand("nutrient");
    } catch (err) {
      showToast(`Failed to dose nutrient: ${err.message}`, "error");
    }
  });

  dosePhBtn.addEventListener("click", async () => {
    try {
      await sendManualCommand("ph-down");
    } catch (err) {
      showToast(`Failed to dose pH-down: ${err.message}`, "error");
    }
  });

  rangeButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const selected = btn.dataset.range;
      if (!selected || selected === activeRange) return;
      activeRange = selected;
      tablePage = 1;
      getRangeClass(selected);
      try {
        await loadHistory();
      } catch (err) {
        showToast(`Failed to load ${selected} history: ${err.message}`, "error");
      }
    });
  });

  viewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const selected = btn.dataset.view;
      if (!selected || selected === activeView) return;
      setActiveView(selected);
    });
  });

  tabButtons.forEach((btn, index) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
    btn.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const nextIndex = event.key === "ArrowRight"
        ? (index + 1) % tabButtons.length
        : (index - 1 + tabButtons.length) % tabButtons.length;
      const nextBtn = tabButtons[nextIndex];
      nextBtn.focus();
      setActiveTab(nextBtn.dataset.tab);
    });
  });

  tablePrevBtn.addEventListener("click", () => {
    if (tablePage <= 1) return;
    tablePage -= 1;
    renderHistoryTable();
  });

  tableNextBtn.addEventListener("click", () => {
    tablePage += 1;
    renderHistoryTable();
  });

  tipsCloseBtn.addEventListener("click", () => {
    tipsCardEl.hidden = true;
    tipsShowBtn.hidden = false;
  });

  tipsShowBtn.addEventListener("click", () => {
    tipsCardEl.hidden = false;
    tipsShowBtn.hidden = true;
  });

  chatFormEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInputEl.value.trim();
    if (!text) return;
    addChatMessage(text, "user");
    chatInputEl.value = "";
    const reply = answerQuestion(text);
    window.setTimeout(() => addChatMessage(reply.text, "bot", reply.severity), 300);
  });
}

async function init() {
  charts.ph = makeChart("ph", "chart-ph", "pH", "#1f8a3d");
  charts.tds = makeChart("tds", "chart-tds", "TDS", "#3b5bdb");
  charts.temp = makeChart("temp", "chart-temp", "Temp °C", "#e8590c");
  wireUI();
  getRangeClass(activeRange);
  updateLiveClock();
  updateFreshnessStatus();

  try {
    await loadDevice();
  } catch (err) {
    setConnectionStatus("error", `can't reach backend: ${err.message}`);
    return;
  }

  await refresh();
  window.setInterval(tickClock, 1000);
  setInterval(refresh, REFRESH_INTERVAL_MS);
}

init();
