const deviceNameEl = document.getElementById("device-name");
const deviceModeEl = document.getElementById("device-mode");
const connectionStatusEl = document.getElementById("connection-status");
const lastUpdatedEl = document.getElementById("last-updated");
const nutrientTotalEl = document.getElementById("nutrient-total");
const phTotalEl = document.getElementById("ph-total");

const stats = {
  ph: { valueEl: document.getElementById("ph-value"), rangeEl: document.getElementById("ph-range"), cardEl: document.getElementById("card-ph") },
  tds: { valueEl: document.getElementById("tds-value"), rangeEl: document.getElementById("tds-range"), cardEl: document.getElementById("card-tds") },
  temp: { valueEl: document.getElementById("temp-value"), rangeEl: document.getElementById("temp-range"), cardEl: document.getElementById("card-temp") },
};

let deviceRanges = null;

async function fetchJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

function setConnectionStatus(state, detail) {
  connectionStatusEl.textContent = detail || state;
  connectionStatusEl.className = `status status-${state}`;
}

function applyRange(key, value, min, max) {
  const { valueEl, rangeEl, cardEl } = stats[key];
  valueEl.textContent = value ?? "—";
  rangeEl.textContent = `target ${min}–${max}`;
  if (value == null) {
    cardEl.classList.remove("in-range", "out-of-range");
    return;
  }
  const inRange = value >= min && value <= max;
  cardEl.classList.toggle("in-range", inRange);
  cardEl.classList.toggle("out-of-range", !inRange);
}

async function loadDevice() {
  const device = await fetchJSON(`/api/devices/${DEVICE_ID}`);
  deviceRanges = device;
  deviceNameEl.textContent = device.name;
  deviceModeEl.textContent = device.mode;
}

async function loadLatest() {
  try {
    const reading = await fetchJSON(`/api/readings/latest?device_id=${DEVICE_ID}`);
    applyRange("ph", reading.ph, deviceRanges.ph_min, deviceRanges.ph_max);
    applyRange("tds", reading.tds, deviceRanges.tds_min, deviceRanges.tds_max);
    applyRange("temp", reading.temp_c, deviceRanges.temp_min, deviceRanges.temp_max);
    lastUpdatedEl.textContent = new Date(reading.recorded_at).toLocaleString();
    setConnectionStatus("ok", "connected");
  } catch (err) {
    if (err.message.includes("no readings")) {
      setConnectionStatus("warn", "no readings yet");
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

function makeChart(canvasId, label, color) {
  const ctx = document.getElementById(canvasId);
  return new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [{ label, data: [], borderColor: color, tension: 0.25, pointRadius: 2 }] },
    options: {
      responsive: true,
      animation: false,
      scales: { x: { ticks: { maxRotation: 0, autoSkip: true } } },
      plugins: { legend: { display: false } },
    },
  });
}

async function loadHistory() {
  const rows = await fetchJSON(`/api/readings/history?device_id=${DEVICE_ID}&limit=${HISTORY_LIMIT}`);
  const chronological = [...rows].reverse();
  const labels = chronological.map((r) => new Date(r.recorded_at).toLocaleTimeString());

  charts.ph.data.labels = labels;
  charts.ph.data.datasets[0].data = chronological.map((r) => r.ph);
  charts.ph.update();

  charts.tds.data.labels = labels;
  charts.tds.data.datasets[0].data = chronological.map((r) => r.tds);
  charts.tds.update();

  charts.temp.data.labels = labels;
  charts.temp.data.datasets[0].data = chronological.map((r) => r.temp_c);
  charts.temp.update();
}

async function refresh() {
  try {
    await Promise.all([loadLatest(), loadTotals(), loadHistory()]);
  } catch (err) {
    setConnectionStatus("error", `offline: ${err.message}`);
  }
}

async function init() {
  charts.ph = makeChart("chart-ph", "pH", "#2f9e44");
  charts.tds = makeChart("chart-tds", "TDS", "#1971c2");
  charts.temp = makeChart("chart-temp", "Temp °C", "#e8590c");

  try {
    await loadDevice();
  } catch (err) {
    setConnectionStatus("error", `can't reach backend: ${err.message}`);
    return;
  }

  await refresh();
  setInterval(refresh, REFRESH_INTERVAL_MS);
}

init();
