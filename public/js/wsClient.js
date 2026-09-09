// ==========================================
// WebSocket Client & Live Event Dispatcher
// AgyGateway Universal IoT Server v4.0
// ==========================================

import { state, showToast, updateQuickStats } from './state.js';

let pingInterval = null;
let pingStartTime = 0;
let reconnectTimer = null;

export function sendWs(msg) {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

export function initWebSocket() {
  if (!state.authToken) return;

  if (state.socket) {
    try { state.socket.close(); } catch (e) {}
    state.socket = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  console.log(`[WS] Menghubungkan ke ${wsUrl}...`);
  const ws = new WebSocket(wsUrl);
  state.socket = ws;

  const serverStatusBadge = document.getElementById('serverStatusBadge');

  ws.onopen = () => {
    console.log('[WS] Terhubung! Mengirim token autentikasi...');
    if (serverStatusBadge) {
      serverStatusBadge.textContent = 'Terhubung';
      serverStatusBadge.className = 'status-badge online';
    }

    ws.send(JSON.stringify({
      action: 'auth',
      token: state.authToken
    }));

    clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        pingStartTime = performance.now();
        ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 5000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    } catch (err) {
      console.error('[WS PARSE ERROR]', err.message);
    }
  };

  ws.onclose = (event) => {
    console.warn(`[WS] Sambungan terputus (Code: ${event.code}). Mencoba sambung ulang...`);
    clearInterval(pingInterval);
    if (serverStatusBadge) {
      serverStatusBadge.textContent = 'Terputus';
      serverStatusBadge.className = 'status-badge offline';
    }

    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (state.authToken) {
        initWebSocket();
      }
    }, 3000);
  };

  ws.onerror = (err) => {
    console.error('[WS ERROR]', err);
  };
}

function handleWsMessage(msg) {
  const pingDisplay = document.getElementById('pingDisplay');

  // Ping/Pong
  if (msg.type === 'PONG') {
    const latency = Math.round(performance.now() - pingStartTime);
    if (pingDisplay) pingDisplay.textContent = `${latency} ms`;
    return;
  }

  // Notifikasi
  if (msg.type === 'NOTIFICATION') {
    showToast(msg.message, msg.level !== 'error');
    return;
  }

  // Auth Error
  if (msg.type === 'AUTH_ERROR') {
    state.setToken(null);
    showToast(msg.message || 'Sesi habis, silakan login kembali', false);
    return;
  }

  // Initial State
  if (msg.type === 'INIT_STATE') {
    console.log('[WS INIT_STATE] Menerima data inisial dari server');
    if (msg.devices) state.setDevices(msg.devices);
    if (msg.schedules) state.setSchedules(msg.schedules);
    if (msg.automations) state.setAutomations(msg.automations);
    if (msg.componentTypes) state.componentTypes = msg.componentTypes;
    updateQuickStats();
    return;
  }

  // Update Status Perangkat
  if (msg.type === 'STATUS_UPDATE') {
    if (msg.deviceId && state.devices[msg.deviceId]) {
      Object.assign(state.devices[msg.deviceId], msg);
      state.emit('deviceStatusUpdate', msg);
    } else if (msg.deviceId) {
      state.devices[msg.deviceId] = msg;
      state.setDevices({ ...state.devices });
    }
    updateQuickStats();
    return;
  }

  // Update Telemetri Sensor & State Komponen Real-time
  if (msg.type === 'TELEMETRY' || msg.type === 'TELEMETRY_DATA') {
    const deviceId = msg.deviceId;
    const dev = state.devices[deviceId];
    if (dev) {
      dev.isOnline = true;
      if (msg.uptime) dev.uptime = msg.uptime;
      if (msg.rssi) dev.rssi = msg.rssi;

      const data = msg.data || {};
      if (Array.isArray(dev.components)) {
        for (const [compId, val] of Object.entries(data)) {
          const c = dev.components.find(x => x.id === compId || x.componentId === compId);
          if (c) {
            c.value = typeof val === 'object' ? JSON.stringify(val) : String(val);
          }
        }
      }
      state.emit('telemetryUpdate', { deviceId, data, payload: msg });
      updateQuickStats();
    }
    return;
  }

  // Update Komponen
  if (msg.type === 'COMPONENTS_UPDATE') {
    const dev = state.devices[msg.deviceId];
    if (dev) {
      dev.components = msg.components || [];
      state.emit('componentsChange', { deviceId: msg.deviceId, components: dev.components });
      updateQuickStats();
    }
    return;
  }

  // Update Jadwal
  if (msg.type === 'SCHEDULES_UPDATE') {
    state.setSchedules(msg.schedules || []);
    return;
  }

  // Update Automations
  if (msg.type === 'AUTOMATIONS_UPDATE') {
    state.setAutomations(msg.automations || []);
    return;
  }

  // Event Otomasi Terpicu
  if (msg.type === 'AUTOMATION_TRIGGERED') {
    state.emit('automationTriggered', msg);
    return;
  }

  // I2C Scan
  if (msg.type === 'I2C_SCAN_RESULT') {
    state.emit('i2cScanResult', msg);
    return;
  }

  // OTA Progress
  if (msg.type === 'OTA_PROGRESS') {
    state.emit('otaProgress', msg);
    return;
  }

  // Forwarding custom events
  state.emit(msg.type, msg);
}
