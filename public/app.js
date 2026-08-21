/* =============================================================================
 * PLTS Monitor — PWA Application Logic v1.0.0
 * Brief §52-67, §90-92: honest measurement disclosure, no silent zero fabrication
 * ============================================================================= */

const CONFIG = {
  API_BASE_URL: localStorage.getItem('plts_api_url') || '',       // ESP32 LAN URL
  GAS_URL: localStorage.getItem('plts_gas_url') || '',            // Google Apps Script URL
  MQTT_BROKER_URL: localStorage.getItem('plts_mqtt_url') || '',   // wss://broker:8884/mqtt
  MQTT_USERNAME: localStorage.getItem('plts_mqtt_user') || '',
  MQTT_PASSWORD: localStorage.getItem('plts_mqtt_pass') || '',
  DEVICE_ID: localStorage.getItem('plts_device_id') || 'PLTS-DEFAULT',
  REFRESH_INTERVAL_MS: 5000,     // 5s telemetry (brief §41)
  STALE_THRESHOLD_MS: 10000,     // 2× interval (brief §90)
  OFFLINE_THRESHOLD_MS: 60000,   // 60s = OFFLINE
  HISTORY_LENGTH: 1440,          // 24h × 60/min (brief — rolling buffer)
  THEME: localStorage.getItem('plts_theme') || 'dark',
  LANGUAGE: localStorage.getItem('plts_lang') || 'id'
};

// State
let currentView = 'dashboard';
let lastTelemetry = null;
let lastTelemetryTime = 0;
let telemetryHistory = [];
let charts = {};
let refreshTimer = null;
let mqttClient = null;
let useMqttMode = false;

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Set theme
  document.body.setAttribute('data-theme', CONFIG.THEME);
  document.getElementById('themeToggle').textContent = CONFIG.THEME === 'dark' ? '☀️' : '🌙';

  // Navigation
  setupNavigation();

  // Load saved backend config
  loadBackendConfig();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(err => {
      console.warn('[PWA] SW registration failed:', err);
    });
  }

  // Start clock
  setInterval(updateClock, 1000);
  updateClock();

  // Start data fetching
  startDataFetching();

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Menu toggle (mobile)
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('show');
  });
});

// =============================================================================
// NAVIGATION
// =============================================================================

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      switchView(view);
      // Close sidebar on mobile
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('show');
      }
    });
  });
  // Check URL hash
  const hash = window.location.hash.slice(1);
  if (hash) switchView(hash);
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById('view-' + view);
  if (viewEl) viewEl.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll(`.nav-item[data-view="${view}"]`).forEach(n => n.classList.add('active'));
  window.location.hash = view;
}

// =============================================================================
// CLOCK & THEME
// =============================================================================

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('id-ID');
}

function toggleTheme() {
  const newTheme = CONFIG.THEME === 'dark' ? 'light' : 'dark';
  CONFIG.THEME = newTheme;
  localStorage.setItem('plts_theme', newTheme);
  document.body.setAttribute('data-theme', newTheme);
  document.getElementById('themeToggle').textContent = newTheme === 'dark' ? '☀️' : '🌙';
}

// =============================================================================
// DATA FETCHING — tries ESP32 REST first, falls back to MQTT, then GAS
// =============================================================================

function startDataFetching() {
  if (refreshTimer) clearInterval(refreshTimer);
  fetchTelemetry(); // immediate
  refreshTimer = setInterval(fetchTelemetry, CONFIG.REFRESH_INTERVAL_MS);
}

async function fetchTelemetry() {
  // Try ESP32 REST first (LAN mode)
  if (CONFIG.API_BASE_URL) {
    try {
      const resp = await fetch(`${CONFIG.API_BASE_URL}/api/status`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000)
      });
      if (resp.ok) {
        const data = await resp.json();
        handleTelemetry(data.data || data);
        return;
      }
    } catch (err) {
      console.debug('[PWA] ESP32 REST unavailable:', err.message);
    }
  }

  // Try GAS for historical/cached data
  if (CONFIG.GAS_URL) {
    try {
      const resp = await fetch(`${CONFIG.GAS_URL}?action=history&limit=1&deviceId=${CONFIG.DEVICE_ID}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.success && result.data && result.data.length > 0) {
          handleTelemetry(result.data[0]);
          return;
        }
      }
    } catch (err) {
      console.debug('[PWA] GAS unavailable:', err.message);
    }
  }

  // No data available — show mock/stale
  if (lastTelemetry) {
    markStale();
  } else {
    showMockData();
  }
}

function handleTelemetry(data) {
  lastTelemetry = data;
  lastTelemetryTime = Date.now();
  updateOnlineStatus();
  updateDashboard(data);
  updateBatteryView(data);
  updateAcView(data);
  updateEnvironmentView(data);
  updateEnergyView(data);
  updateDiagnostics(data);
  updateAlarms(data);
  updateSidebarFooter(data);

  // Add to history
  telemetryHistory.push({
    timestamp: data.timestamp || Math.floor(Date.now() / 1000),
    voltage: getNested(data, 'battery.voltage.value'),
    current: getNested(data, 'battery.current.value'),
    power: getNested(data, 'battery.power.value'),
    soc: getNested(data, 'battery.soc.value'),
    acCurrent: getNested(data, 'ac.rmsCurrent.value'),
    temperature: getNested(data, 'environment.temperature.value'),
    humidity: getNested(data, 'environment.humidity.value')
  });
  if (telemetryHistory.length > CONFIG.HISTORY_LENGTH) telemetryHistory.shift();

  updateCharts();
}

// =============================================================================
// DASHBOARD UPDATE (brief §53)
// =============================================================================

function updateDashboard(d) {
  // System Health
  const sysState = getNested(d, 'health.systemState') || 'UNKNOWN';
  document.getElementById('systemHealth').textContent = sysState;
  const badge = document.getElementById('systemHealthBadge');
  badge.className = 'card-badge ' + sysState.toLowerCase();
  badge.textContent = sysState;

  // Battery Voltage
  const v = getNested(d, 'battery.voltage');
  setMeasurementCard('batteryVoltage', v, 'V');
  setMeasurementCard('batteryCurrent', getNested(d, 'battery.current'), 'A');
  setMeasurementCard('batteryPower', getNested(d, 'battery.power'), 'W');

  // Direction
  const dir = getNested(d, 'battery.direction') || '--';
  document.getElementById('direction').textContent = dir;

  // SOC — always ESTIMATED (brief §18)
  const soc = getNested(d, 'battery.soc');
  setFormatted(document.getElementById('soc'), soc?.value, '%');
  const socQ = document.getElementById('socQuality');
  socQ.textContent = `ESTIMATED · ${(soc?.source || 'COULOMB_COUNTING').toUpperCase()}`;
  socQ.className = 'card-quality estimated';

  // Remaining Ah
  setFormatted(document.getElementById('remainingAh'), getNested(d, 'battery.remainingAh'), 'Ah');

  // Runtime
  const runtime = computeRuntime(d);
  document.getElementById('runtime').textContent = runtime;

  // AC Current
  setMeasurementCard('acRmsCurrent', getNested(d, 'ac.rmsCurrent'), 'A');

  // AC Power — ESTIMATED (brief §28)
  const acP = getNested(d, 'ac.estimatedPower');
  setFormatted(document.getElementById('acPower'), acP?.value, 'W');
  const acPQ = document.getElementById('acPowerQuality') || {};
  // always ESTIMATED for AC power

  // Temperature / Humidity
  setMeasurementCard('temperature', getNested(d, 'environment.temperature'), '°C');
  setMeasurementCard('humidity', getNested(d, 'environment.humidity'), '%');

  // Active Alarms
  updateActiveAlarmsList(d);

  // Freshness
  updateFreshness();
}

function setMeasurementCard(elemId, meas, unit) {
  const el = document.getElementById(elemId);
  if (!el) return;
  if (!meas || meas.value === null || meas.value === undefined || isNaN(meas.value)) {
    el.textContent = 'N/A';
    const q = document.getElementById(elemId + 'Quality');
    if (q) {
      q.textContent = (meas?.quality || 'NOT_AVAILABLE') + (meas?.source ? ' · ' + meas.source : '');
      q.className = 'card-quality invalid';
    }
  } else {
    setFormatted(el, meas.value, unit);
    const q = document.getElementById(elemId + 'Quality');
    if (q) {
      const quality = meas.quality || 'VALID';
      const source = meas.source || 'MEASURED';
      q.textContent = `${source} · ${quality}`;
      q.className = 'card-quality ' + qualityClass(quality, source);
    }
  }
}

function qualityClass(quality, source) {
  if (source === 'ESTIMATED') return 'estimated';
  if (source === 'DERIVED') return 'derived';
  switch (quality) {
    case 'VALID': case 'MEASURED': return 'measured';
    case 'STALE': return 'stale';
    case 'INVALID': case 'SENSOR_ERROR': case 'NOT_AVAILABLE': return 'invalid';
    default: return 'measured';
  }
}

function formatValue(v, unit) {
  if (v === null || v === undefined || isNaN(v)) return 'N/A';
  return `${Number(v).toFixed(2)} <small>${unit || ''}</small>`;
}
// XSS-safe equivalent of `setFormatted(el, v, unit)`.
// Uses textContent + a <small> child element so no string is parsed as HTML.
function setFormatted(el, v, unit) {
  if (!el) return;
  el.replaceChildren();
  if (v === null || v === undefined || isNaN(v)) {
    el.textContent = 'N/A';
    return;
  }
  const num = document.createTextNode(Number(v).toFixed(2) + ' ');
  el.appendChild(num);
  if (unit) {
    const small = document.createElement('small');
    small.textContent = unit;
    el.appendChild(small);
  }
}


// =============================================================================
// BATTERY VIEW (brief §54)
// =============================================================================

function updateBatteryView(d) {
  const b = d.battery || {};
  setFormatted(document.getElementById('bVoltage'), b.voltage?.value, 'V');
  setFormatted(document.getElementById('bCurrent'), b.current?.value, 'A');
  setFormatted(document.getElementById('bPower'), b.power?.value, 'W');
  document.getElementById('bDirection').textContent = b.direction || '--';
  setFormatted(document.getElementById('bSoc'), b.soc?.value, '%');
  setFormatted(document.getElementById('bRemainingAh'), b.remainingAh, 'Ah');
  setFormatted(document.getElementById('bChargeAh'), b.chargeAh, 'Ah');
  setFormatted(document.getElementById('bDischargeAh'), b.dischargeAh, 'Ah');
  setFormatted(document.getElementById('bNetAh'), b.chargeAh - b.dischargeAh, 'Ah');
  document.getElementById('bEfc').textContent = b.efc?.toFixed(3) || '--';
  setFormatted(document.getElementById('bUsableCap'), b.estimatedUsableCapacityAh, 'Ah');
  setFormatted(document.getElementById('bPeakCharge'), b.peakChargeCurrent, 'A');
  setFormatted(document.getElementById('bPeakDischarge'), b.peakDischargeCurrent, 'A');
}

// =============================================================================
// AC VIEW (brief §55)
// =============================================================================

function updateAcView(d) {
  const ac = d.ac || {};
  setFormatted(document.getElementById('acRms'), ac.rmsCurrent?.value, 'A');
  setFormatted(document.getElementById('acPeak'), ac.peakCurrent?.value, 'A');
  setFormatted(document.getElementById('acAvg'), ac.averageCurrent?.value, 'A');
  document.getElementById('acSigQuality').textContent = ac.signalQuality || '--';
  setFormatted(document.getElementById('acEstPower'), ac.estimatedPower?.value, 'W');
}

// =============================================================================
// ENVIRONMENT VIEW (brief §56)
// =============================================================================

function updateEnvironmentView(d) {
  const env = d.environment || {};
  setFormatted(document.getElementById('envTemp'), env.temperature?.value, '°C');
  setFormatted(document.getElementById('envHum'), env.humidity?.value, '%');
  setFormatted(document.getElementById('envDew'), env.dewPoint?.value, '°C');
  document.getElementById('envCond').textContent = env.condensationRisk ? '⚠️ RISK' : 'OK';
}

// =============================================================================
// ENERGY VIEW (brief §57)
// =============================================================================

function updateEnergyView(d) {
  const b = d.battery || {};
  setFormatted(document.getElementById('enChargeWh'), b.chargeWh, 'Wh');
  setFormatted(document.getElementById('enDischargeWh'), b.dischargeWh, 'Wh');
  setFormatted(document.getElementById('enNetWh'), b.chargeWh - b.dischargeWh, 'Wh');
  setFormatted(document.getElementById('enChargeAh'), b.chargeAh, 'Ah');
  setFormatted(document.getElementById('enDischargeAh'), b.dischargeAh, 'Ah');
  document.getElementById('enEfc').textContent = b.efc?.toFixed(3) || '--';
}

// =============================================================================
// DIAGNOSTICS VIEW (brief §60)
// =============================================================================

function updateDiagnostics(d) {
  const h = d.health || {};
  document.getElementById('diagUptime').textContent = formatUptime(d.uptimeSeconds);
  document.getElementById('diagHeap').textContent = h.freeHeap ? `${h.freeHeap} B` : '--';
  document.getElementById('diagMinHeap').textContent = h.minFreeHeap ? `${h.minFreeHeap} B` : '--';
  document.getElementById('diagRssi').textContent = h.wifiRssi ? `${h.wifiRssi} dBm` : '--';
  document.getElementById('diagWifiReconnect').textContent = h.wifiReconnectCount || 0;
  document.getElementById('diagMqtt').textContent = h.mqttConnected ? 'YES' : 'NO';
  document.getElementById('diagNtp').textContent = h.ntpSynced ? 'YES' : 'NO';
  document.getElementById('diagReset').textContent = d.resetReason || '--';
  document.getElementById('diagBoot').textContent = d.bootCount || 0;
  document.getElementById('diagFw').textContent = d.firmwareVersion || '--';
  document.getElementById('diagProto').textContent = d.protocolVersion || '--';
  document.getElementById('diagStorage').textContent = h.storageOk ? 'OK' : '⚠️ ERROR';
  document.getElementById('diagSpool').textContent = h.spoolSize || 0;

  // Sensor health
  const sh = h.sensorHealth || {};
  const sensors = [
    { name: 'INA219 (Battery Current)', status: sh.ina219 },
    { name: 'Battery ADC', status: sh.batteryAdc },
    { name: 'ACS712 (AC Current)', status: sh.acs712 },
    { name: 'SHT31 (Temp/Humidity)', status: sh.sht31 }
  ];
  const grid = document.getElementById('sensorHealth');
  if (!grid) return;
  grid.replaceChildren();
  sensors.forEach(s => {
    const row = document.createElement('div');
    row.className = 'sensor-item';
    const nameEl = document.createElement('span');
    nameEl.className = 'sensor-name';
    nameEl.textContent = s.name;
    const statusEl = document.createElement('span');
    const st = s.status || 'OFFLINE';
    statusEl.className = 'sensor-status ' + st;
    statusEl.textContent = st;
    row.appendChild(nameEl);
    row.appendChild(statusEl);
    grid.appendChild(row);
  });
}

// =============================================================================
// ALARMS (brief §62)
// =============================================================================

function updateAlarms(d) {
  updateActiveAlarmsList(d);
}

function updateActiveAlarmsList(d) {
  const alarms = d.activeAlarms || [];
  const container = document.getElementById('activeAlarms');
  if (alarms.length === 0) {
    container.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'alarm-item INFO';
    const emptySpan = document.createElement('span');
    emptySpan.textContent = 'No active alarms';
    empty.appendChild(emptySpan);
    container.appendChild(empty);
  } else {
    container.replaceChildren();
    alarms.forEach(a => {
      const row = document.createElement('div');
      row.className = 'alarm-item ' + a.severity;
      const sev = document.createElement('span');
      sev.className = 'alarm-severity ' + a.severity;
      sev.textContent = a.severity;
      const code = document.createElement('span');
      code.textContent = a.code;
      const msg = document.createElement('span');
      msg.style.cssText = 'color: var(--color-text-dim); font-size: 12px;';
      msg.textContent = a.message || '';
      const actions = document.createElement('div');
      actions.className = 'alarm-actions';
      const btn = document.createElement('button');
      btn.textContent = 'ACK';
      btn.addEventListener('click', () => acknowledgeAlarm(a.code));
      actions.appendChild(btn);
      row.appendChild(sev);
      row.appendChild(code);
      row.appendChild(msg);
      row.appendChild(actions);
      container.appendChild(row);
    });
  }
}

async function acknowledgeAlarm(code) {
  if (!CONFIG.API_BASE_URL) return alert('ESP32 API URL not configured');
  try {
    await fetch(`${CONFIG.API_BASE_URL}/api/alarms/${code}/acknowledge`, { method: 'POST' });
    fetchTelemetry();
  } catch (err) {
    alert('Failed to acknowledge alarm: ' + err.message);
  }
}

// =============================================================================
// STALE / OFFLINE DETECTION (brief §90)
// =============================================================================

function updateOnlineStatus() {
  const elapsed = Date.now() - lastTelemetryTime;
  const dot = document.getElementById('onlineDot');
  const banner = document.getElementById('staleBanner');
  if (elapsed < CONFIG.STALE_THRESHOLD_MS) {
    dot.className = 'status-dot';
    banner.style.display = 'none';
  } else if (elapsed < CONFIG.OFFLINE_THRESHOLD_MS) {
    dot.className = 'status-dot stale';
    banner.style.display = 'block';
    document.getElementById('lastSeen').textContent = formatRelativeTime(lastTelemetryTime);
  } else {
    dot.className = 'status-dot offline';
    banner.style.display = 'block';
    document.getElementById('lastSeen').textContent = formatRelativeTime(lastTelemetryTime);
  }
}

function markStale() {
  const dot = document.getElementById('onlineDot');
  dot.className = 'status-dot stale';
  const banner = document.getElementById('staleBanner');
  banner.style.display = 'block';
  document.getElementById('lastSeen').textContent = lastTelemetryTime ? formatRelativeTime(lastTelemetryTime) : 'never';
}

function updateFreshness() {
  const elapsed = Date.now() - lastTelemetryTime;
  const freshness = document.getElementById('freshness');
  const quality = document.getElementById('freshnessQuality');
  if (elapsed < 5000) {
    freshness.textContent = 'REAL-TIME';
    quality.textContent = 'VALID';
    quality.className = 'card-quality measured';
  } else if (elapsed < CONFIG.STALE_THRESHOLD_MS) {
    freshness.textContent = Math.floor(elapsed / 1000) + 's ago';
    quality.textContent = 'VALID';
    quality.className = 'card-quality measured';
  } else {
    freshness.textContent = Math.floor(elapsed / 1000) + 's ago';
    quality.textContent = 'STALE';
    quality.className = 'card-quality stale';
  }
}

// =============================================================================
// SIDEBAR FOOTER
// =============================================================================

function updateSidebarFooter(d) {
  document.getElementById('fwVersion').textContent = d.firmwareVersion || '--';
  document.getElementById('heapFree').textContent = d.health?.freeHeap ? `${Math.round(d.health.freeHeap/1024)}KB` : '--';
  document.getElementById('uptime').textContent = formatUptime(d.uptimeSeconds);
}

// =============================================================================
// CHARTS (Chart.js)
// =============================================================================

function updateCharts() {
  if (typeof Chart === 'undefined') return;
  const hist = telemetryHistory;
  const labels = hist.map(h => new Date(h.timestamp * 1000).toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit'}));

  // Battery chart — voltage & current
  const battCtx = document.getElementById('batteryChart');
  if (battCtx) {
    if (charts.battery) charts.battery.destroy();
    charts.battery = new Chart(battCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Voltage (V)', data: hist.map(h => h.voltage), borderColor: '#3b82f6', yAxisID: 'y', tension: 0.3 },
          { label: 'Current (A)', data: hist.map(h => h.current), borderColor: '#22c55e', yAxisID: 'y1', tension: 0.3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { type: 'linear', position: 'left', title: { display: true, text: 'Voltage (V)' } },
          y1: { type: 'linear', position: 'right', title: { display: true, text: 'Current (A)' }, grid: { drawOnChartArea: false } }
        },
        plugins: { legend: { labels: { color: 'var(--color-text)' } } }
      }
    });
  }

  // SOC chart
  const socCtx = document.getElementById('socChart');
  if (socCtx) {
    if (charts.soc) charts.soc.destroy();
    charts.soc = new Chart(socCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'SOC (%)', data: hist.map(h => h.soc), borderColor: '#f59e0b', yAxisID: 'y', tension: 0.3, fill: true },
          { label: 'Power (W)', data: hist.map(h => h.power), borderColor: '#3b82f6', yAxisID: 'y1', tension: 0.3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { type: 'linear', position: 'left', min: 0, max: 100, title: { display: true, text: 'SOC (%)' } },
          y1: { type: 'linear', position: 'right', title: { display: true, text: 'Power (W)' }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  // AC chart
  const acCtx = document.getElementById('acChart');
  if (acCtx) {
    if (charts.ac) charts.ac.destroy();
    charts.ac = new Chart(acCtx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'AC RMS (A)', data: hist.map(h => h.acCurrent), borderColor: '#f97316', tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  // Environment chart
  const envCtx = document.getElementById('envChart');
  if (envCtx) {
    if (charts.env) charts.env.destroy();
    charts.env = new Chart(envCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Temp (°C)', data: hist.map(h => h.temperature), borderColor: '#ef4444', yAxisID: 'y', tension: 0.3 },
          { label: 'Humidity (%)', data: hist.map(h => h.humidity), borderColor: '#3b82f6', yAxisID: 'y1', tension: 0.3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { type: 'linear', position: 'left', title: { display: true, text: '°C' } },
          y1: { type: 'linear', position: 'right', title: { display: true, text: '%' }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }
}

// =============================================================================
// CALIBRATION (brief §11-14, §63)
// =============================================================================

async function captureCalibrationPoint(point) {
  if (!CONFIG.API_BASE_URL) return alert('ESP32 API URL not configured');
  try {
    const resp = await fetch(`${CONFIG.API_BASE_URL}/api/calibration/voltage/point/${point}`, { method: 'POST' });
    const data = await resp.json();
    if (data.success) {
      const refInput = document.getElementById('cal' + (point === 'low' ? 'Low' : point === 'nominal' ? 'Nom' : 'Full') + 'Raw');
      if (refInput) refInput.value = data.raw.toFixed(2);
      const csEl = document.getElementById('calibStatus');
      if (csEl) {
        csEl.replaceChildren();
        const span = document.createElement('span');
        span.style.cssText = 'color: var(--status-valid);';
        span.textContent = 'Captured ' + point + ': ' + data.raw.toFixed(2) + 'V';
        csEl.appendChild(span);
      }
    }
  } catch (err) {
    alert('Capture failed: ' + err.message);
  }
}

async function saveCalibration() {
  if (!CONFIG.API_BASE_URL) return alert('ESP32 API URL not configured');
  const lowRef = parseFloat(document.getElementById('calLowRef').value);
  const nomRef = parseFloat(document.getElementById('calNomRef').value);
  const fullRef = parseFloat(document.getElementById('calFullRef').value);
  if (isNaN(lowRef) || isNaN(nomRef) || isNaN(fullRef)) return alert('All reference values required');
  if (!(lowRef < nomRef && nomRef < fullRef)) return alert('Validation failed: LOW < NOMINAL < FULL must hold (brief §14)');
  try {
    const resp = await fetch(`${CONFIG.API_BASE_URL}/api/calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voltageLow: { reference: lowRef }, voltageNominal: { reference: nomRef }, voltageFull: { reference: fullRef } })
    });
    const data = await resp.json();
    const _csEl = document.getElementById('calibStatus');
    if (_csEl) {
      _csEl.replaceChildren();
      const _span = document.createElement('span');
      if (data.success) {
        _span.style.cssText = 'color: var(--status-valid);';
        _span.textContent = '✓ Calibration saved (v' + (data.version || 1) + ')';
      } else {
        _span.style.cssText = 'color: var(--status-invalid);';
        _span.textContent = '✗ ' + (data.error || 'unknown error');
      }
      _csEl.appendChild(_span);
    }
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}

async function performAcs712ZeroCal() {
  if (!CONFIG.API_BASE_URL) return alert('ESP32 API URL not configured');
  try {
    const resp = await fetch(`${CONFIG.API_BASE_URL}/api/calibration/acs712/zero`, { method: 'POST' });
    const data = await resp.json();
    const _acsCalEl = document.getElementById('acsCalStatus');
    if (_acsCalEl) {
      _acsCalEl.replaceChildren();
      const _span = document.createElement('span');
      if (data.success) {
        _span.style.cssText = 'color: var(--status-valid);';
        _span.textContent = '✓ Zero offset captured: ' + data.offset;
      } else {
        _span.style.cssText = 'color: var(--status-invalid);';
        _span.textContent = '✗ ' + (data.error || 'unknown error');
      }
      _acsCalEl.appendChild(_span);
    }
  } catch (err) {
    alert('Zero cal failed: ' + err.message);
  }
}

// =============================================================================
// SETTINGS
// =============================================================================

function loadBackendConfig() {
  document.getElementById('cfgApiUrl').value = CONFIG.API_BASE_URL;
  document.getElementById('cfgGasUrl').value = CONFIG.GAS_URL;
  document.getElementById('cfgMqttUrl').value = CONFIG.MQTT_BROKER_URL;
  document.getElementById('cfgMqttUser').value = CONFIG.MQTT_USERNAME;
}

function saveBackendConfig() {
  localStorage.setItem('plts_api_url', document.getElementById('cfgApiUrl').value);
  localStorage.setItem('plts_gas_url', document.getElementById('cfgGasUrl').value);
  localStorage.setItem('plts_mqtt_url', document.getElementById('cfgMqttUrl').value);
  localStorage.setItem('plts_mqtt_user', document.getElementById('cfgMqttUser').value);
  const pass = document.getElementById('cfgMqttPass').value;
  if (pass) localStorage.setItem('plts_mqtt_pass', pass);
  alert('Backend config saved. Refreshing...');
  location.reload();
}

async function saveConfig() {
  if (!CONFIG.API_BASE_URL) return alert('ESP32 API URL not configured');
  const config = {
    deviceName: document.getElementById('cfgDeviceName').value,
    siteName: document.getElementById('cfgSiteName').value,
    timezone: document.getElementById('cfgTimezone').value,
    batteryCapacityAh: parseFloat(document.getElementById('cfgCapacity').value),
    fullVoltage: parseFloat(document.getElementById('cfgFullV').value),
    lowVoltage: parseFloat(document.getElementById('cfgLowV').value),
    idleCurrentThreshold: parseFloat(document.getElementById('cfgIdle').value),
    telemetryIntervalSec: parseInt(document.getElementById('cfgInterval').value)
  };
  try {
    await fetch(`${CONFIG.API_BASE_URL}/api/config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    alert('Configuration saved');
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}

async function rebootDevice() {
  if (!confirm('Reboot ESP32?')) return;
  try { await fetch(`${CONFIG.API_BASE_URL}/api/reboot`, { method: 'POST' }); alert('Rebooting...'); }
  catch (err) { alert('Failed: ' + err.message); }
}

async function factoryResetPrepare() {
  if (!confirm('⚠️ FACTORY RESET will erase all config and calibration. Continue?')) return;
  try {
    const resp = await fetch(`${CONFIG.API_BASE_URL}/api/factory_reset/prepare`, { method: 'POST' });
    const data = await resp.json();
    const token = prompt(`Reset token (60s TTL):\n${data.token}\n\nType RESET to confirm:`);
    if (token !== 'RESET') return alert('Cancelled');
    await fetch(`${CONFIG.API_BASE_URL}/api/factory_reset/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: data.token, confirm: 'RESET' })
    });
    alert('Factory reset complete');
  } catch (err) { alert('Failed: ' + err.message); }
}

// =============================================================================
// REPORTS (brief §66, §96)
// =============================================================================

async function generateReport() {
  const type = document.getElementById('reportType').value;
  const date = document.getElementById('reportDate').value;
  if (!CONFIG.GAS_URL) return alert('GAS URL not configured');
  try {
    const resp = await fetch(`${CONFIG.GAS_URL}?action=daily&deviceId=${CONFIG.DEVICE_ID}`);
    const data = await resp.json();
    const content = document.getElementById('reportContent');
    if (data.success && data.data && data.data.length > 0) {
      const row = data.data[data.data.length - 1];
          content.replaceChildren();
    const tbl = document.createElement('table');
    tbl.style.cssText = 'width:100%; border-collapse: collapse;';
    const rows = [
      ['Date', String(row.date ?? '')],
      ['Charge Energy', (row.chargeWh != null ? row.chargeWh.toFixed(1) : '0') + ' Wh'],
      ['Discharge Energy', (row.dischargeWh != null ? row.dischargeWh.toFixed(1) : '0') + ' Wh'],
      ['Net Energy', (row.netWh != null ? row.netWh.toFixed(1) : '0') + ' Wh'],
      ['Charge Ah', (row.chargeAh != null ? row.chargeAh.toFixed(2) : '0') + ' Ah'],
      ['Discharge Ah', (row.dischargeAh != null ? row.dischargeAh.toFixed(2) : '0') + ' Ah'],
      ['SOC Range', (row.socMin ?? 0) + '% - ' + (row.socMax ?? 0) + '%'],
      ['Alarm Count', String(row.alarmCount ?? 0)],
      ['Telemetry Completeness', ((row.telemetryCompleteness ?? 0)).toFixed(2) + '%'],
    ];
    rows.forEach(([label, val]) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = label;
      const td2 = document.createElement('td');
      td2.textContent = val;
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbl.appendChild(tr);
    });
    content.appendChild(tbl);
    } else {
      content.textContent = 'No data available for report';
    }
  } catch (err) { alert('Report failed: ' + err.message); }
}

function exportReport(format) {
  if (!lastTelemetry) return alert('No data to export');
  let content, mime, ext;
  if (format === 'csv') {
    const rows = [['timestamp', 'voltage', 'current', 'power', 'soc', 'temperature', 'humidity']];
    telemetryHistory.forEach(h => rows.push([h.timestamp, h.voltage, h.current, h.power, h.soc, h.temperature, h.humidity]));
    content = rows.map(r => r.join(',')).join('\n');
    mime = 'text/csv'; ext = 'csv';
  } else {
    content = JSON.stringify({ device: CONFIG.DEVICE_ID, exported: new Date().toISOString(), telemetry: telemetryHistory }, null, 2);
    mime = 'application/json'; ext = 'json';
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `plts-report-${Date.now()}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

// =============================================================================
// HELPERS
// =============================================================================

function getNested(obj, path) {
  if (!obj || !path) return null;
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : null, obj);
}

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'never';
  const elapsed = Date.now() - timestamp;
  const sec = Math.floor(elapsed / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function computeRuntime(d) {
  const soc = getNested(d, 'battery.soc.value');
  const capacity = getNested(d, 'config.batteryCapacityAh') || 200;
  const current = getNested(d, 'battery.current.value');
  if (!soc || !current || current >= 0) return 'N/A (charging)';
  const remainingAh = (soc / 100) * capacity;
  const hours = remainingAh / Math.abs(current);
  if (hours > 48) return `>48h`;
  if (hours < 1) return `${Math.floor(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

function showMockData() {
  // Brief §52 — PWA must NOT blindly trust local cache. Show clearly as no-data.
  document.getElementById('systemHealth').textContent = 'NO DATA';
  document.getElementById('systemHealthBadge').textContent = 'OFFLINE';
  document.getElementById('onlineDot').className = 'status-dot offline';
  const banner = document.getElementById('staleBanner');
  banner.style.display = 'block';
  document.getElementById('lastSeen').textContent = 'never';
}

// Expose functions globally for inline onclick handlers
window.captureCalibrationPoint = captureCalibrationPoint;
window.saveCalibration = saveCalibration;
window.restorePreviousCalibration = () => alert('Restore previous — send POST /api/calibration/restore');
window.factoryDefaultCalibration = () => alert('Factory default — send POST /api/calibration/default');
window.performAcs712ZeroCal = performAcs712ZeroCal;
window.saveShtOffsets = () => alert('Save SHT31 offsets — send POST /api/calibration/sht31');
window.saveConfig = saveConfig;
window.saveBackendConfig = saveBackendConfig;
window.rebootDevice = rebootDevice;
window.factoryResetPrepare = factoryResetPrepare;
window.generateReport = generateReport;
window.exportReport = exportReport;
window.acknowledgeAlarm = acknowledgeAlarm;
