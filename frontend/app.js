const deviceNameEl = document.getElementById("device-name");
const deviceModeEl = document.getElementById("device-mode");
const connectionStatusEl = document.getElementById("connection-status");
const freshnessStatusEl = document.getElementById("freshness-status");
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
const historyChartViewEl = document.getElementById("history-chart-view");
const historyTableViewEl = document.getElementById("history-table-view");
const historyTableBodyEl = document.getElementById("history-table-body");
const tablePrevBtn = document.getElementById("table-prev-btn");
const tableNextBtn = document.getElementById("table-next-btn");
const tablePageLabelEl = document.getElementById("table-page-label");

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
  },
};

let deviceRanges = null;
let lastReadingAtMs = null;
let currentMode = "—";
let activeRange = "1h";
let activeView = "chart";
let previousAlertKeys = new Set();
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
  connectionStatusEl.textContent = detail || state;
  connectionStatusEl.className = `status status-${state}`;
}

function formatRelativeAge(msSinceUpdate) {
  const seconds = Math.max(0, Math.floor(msSinceUpdate / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function updateFreshnessStatus() {
  if (!lastReadingAtMs) {
    freshnessStatusEl.textContent = "last updated —";
    freshnessStatusEl.classList.remove("stale");
    return;
  }
  const ageMs = Date.now() - lastReadingAtMs;
  freshnessStatusEl.textContent = `last updated ${formatRelativeAge(ageMs)}`;
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
  document.getElementById("tab-panel-live").hidden = tabName !== "live";
  document.getElementById("tab-panel-history").hidden = tabName !== "history";
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
      if (state.alert) alerts.push(state.alert);
    });

    renderAlerts(alerts);
    lastUpdatedEl.textContent = lastReadingAtMs ? readingAt.toLocaleString() : "—";
    updateFreshnessStatus();
    setConnectionStatus("ok", "connected");
  } catch (err) {
    if (err.message.includes("no readings")) {
      setConnectionStatus("warn", "no readings yet");
      lastReadingAtMs = null;
      updateFreshnessStatus();
      Object.entries(stats).forEach(([key, metric]) => {
        updateMetricUI(key, {
          state: "offline",
          label: "NO DATA",
          valueText: "—",
          min: deviceRanges[metric.minField],
          max: deviceRanges[metric.maxField],
        });
      });
      renderAlerts([{ key: "global-no-readings", severity: "warn", message: "No readings available yet" }]);
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
          ticks: { maxRotation: 0, autoSkip: true },
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
            title: (items) => items[0]?.label || "",
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

async function loadHistory() {
  const rows = await fetchJSON(`/api/readings/history?device_id=${DEVICE_ID}&limit=${getHistoryLimit()}`);
  const chronological = [...rows].reverse();
  const labels = chronological.map((r) => new Date(r.recorded_at).toLocaleString());

  Object.entries(stats).forEach(([key, metric]) => {
    const chart = charts[key];
    if (!chart) return;
    const values = chronological.map((r) => r[metric.readingField]);
    const minLine = chronological.map(() => deviceRanges[metric.minField]);
    const maxLine = chronological.map(() => deviceRanges[metric.maxField]);

    chart.data.labels = labels;
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
    if (!window.confirm(`Switch device to ${targetMode} mode?`)) return;
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
  if (!window.confirm(`Confirm manual action: ${actionLabel}?`)) return;
  if (!endpoint) {
    showToast(`Manual control endpoint for ${actionLabel} is not configured.`, "error");
    return;
  }

  await postJSON(endpoint, { device_id: DEVICE_ID });
  showToast(`Manual command sent: ${actionLabel}.`, "warn");
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
}

async function init() {
  charts.ph = makeChart("ph", "chart-ph", "pH", "#1f8a3d");
  charts.tds = makeChart("tds", "chart-tds", "TDS", "#3b5bdb");
  charts.temp = makeChart("temp", "chart-temp", "Temp °C", "#e8590c");
  wireUI();
  getRangeClass(activeRange);
  updateFreshnessStatus();

  try {
    await loadDevice();
  } catch (err) {
    setConnectionStatus("error", `can't reach backend: ${err.message}`);
    return;
  }

  await refresh();
  window.setInterval(updateFreshnessStatus, 1000);
  setInterval(refresh, REFRESH_INTERVAL_MS);
}

init();
