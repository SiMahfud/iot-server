// ==========================================
// Global Reactive State & Event Bus
// AgyGateway Universal IoT Server v4.0
// ==========================================

export const TOKEN_KEY = 'smart_switch_jwt_token';

class AppState {
  constructor() {
    this.authToken = localStorage.getItem(TOKEN_KEY) || null;
    this.devices = {};
    this.activeDeviceId = null;
    this.schedules = [];
    this.automations = [];
    this.componentTypes = {};
    this.activityLogs = [];
    this.currentCompFilter = 'all';
    this.activeLogFilter = 'all';
    this.socket = null;
    this.activeTimerComponentId = null;
    this.listeners = new Map();
  }

  setToken(token) {
    this.authToken = token;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    this.emit('authChange', token);
  }

  getActiveDevice() {
    if (!this.activeDeviceId) return null;
    return this.devices[this.activeDeviceId] || null;
  }

  setActiveDevice(id) {
    this.activeDeviceId = id;
    this.emit('deviceSelect', id);
  }

  setDevices(devices) {
    this.devices = devices || {};
    // Jika belum ada activeDeviceId atau device aktif tidak ditemukan, pilih device pertama
    const keys = Object.keys(this.devices);
    if ((!this.activeDeviceId || !this.devices[this.activeDeviceId]) && keys.length > 0) {
      this.activeDeviceId = keys[0];
    }
    this.emit('devicesChange', this.devices);
  }

  setSchedules(schedules) {
    this.schedules = Array.isArray(schedules) ? schedules : [];
    this.emit('schedulesChange', this.schedules);
  }

  setAutomations(automations) {
    this.automations = Array.isArray(automations) ? automations : [];
    this.emit('automationsChange', this.automations);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try { cb(data); } catch (err) { console.error(`[EVENT ERROR] ${event}:`, err); }
      });
    }
  }
}

export const state = new AppState();

// --- Utility Helpers ---
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showToast(message, isSuccess = true) {
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');
  if (!toastNotification || !toastMessage) return;

  toastMessage.textContent = message;
  toastNotification.classList.remove('hidden');
  toastNotification.classList.toggle('toast-error', !isSuccess);

  clearTimeout(toastNotification._timeout);
  toastNotification._timeout = setTimeout(() => {
    toastNotification.classList.add('hidden');
  }, 3500);
}

export function formatUptime(seconds) {
  const s = parseInt(seconds) || 0;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');

  if (d > 0) return `${d}h ${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function updateQuickStats() {
  const devices = Object.values(state.devices);
  const onlineDevices = devices.filter(d => d.isOnline);

  let activeActuators = 0;
  let totalSensors = 0;

  devices.forEach(dev => {
    if (Array.isArray(dev.components)) {
      dev.components.forEach(c => {
        const isSwitch = c.type === 'switch' || c.driver === 'switch';
        const isDimmer = c.type === 'dimmer' || c.driver === 'dimmer';
        if (isSwitch && (c.value === 'true' || c.value === true || c.value === '1')) {
          activeActuators++;
        } else if (isDimmer && parseInt(c.value) > 0) {
          activeActuators++;
        }
        if (c.type === 'sensor' || c.type === 'composite' || (c.driver && c.driver !== 'switch' && c.driver !== 'dimmer')) {
          totalSensors++;
        }
      });
    }
  });

  const statActiveDevices = document.getElementById('statActiveDevices');
  if (statActiveDevices) statActiveDevices.textContent = `${onlineDevices.length} Online`;

  const statActiveActuators = document.getElementById('statActiveActuators');
  if (statActiveActuators) statActiveActuators.textContent = `${activeActuators} Aktif`;

  const statActiveSensors = document.getElementById('statActiveSensors');
  if (statActiveSensors) statActiveSensors.textContent = `${totalSensors} Sensor`;

  const activeDev = state.getActiveDevice();
  const wifiRssi = document.getElementById('wifiRssi');
  if (wifiRssi) {
    if (activeDev && activeDev.isOnline && activeDev.rssi) {
      wifiRssi.textContent = `${activeDev.rssi} dBm`;
    } else {
      wifiRssi.textContent = '-- dBm';
    }
  }
}
