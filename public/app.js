// =============================================================
// AgyGateway Hub - Universal IoT Controller App v4.0
// Modular Orchestrator & Application Entry Point
// =============================================================

import { state, escapeHtml, showToast, formatUptime, updateQuickStats } from './js/state.js';
import { initWebSocket, sendWs } from './js/wsClient.js';
import { renderComponentsGrid, updateLiveTelemetryDom, triggerComponent } from './js/modules/widgets.js';
import { initAutomationsUi, renderAutomationsList } from './js/modules/automationsUi.js';
import { initSchedulerUi, renderScheduleList } from './js/modules/schedulerUi.js';
import { initTelemetryChart } from './js/modules/telemetryChart.js';
import { initPinManagerUi } from './js/modules/pinManagerUi.js';
import { initWebSerialTools } from './js/modules/webSerialTools.js';

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboardApp = document.getElementById('dashboardApp');
const loginForm = document.getElementById('loginForm');
const btnLogout = document.getElementById('btnLogout');
const deviceSelect = document.getElementById('deviceSelect');
const deviceName = document.getElementById('deviceName');
const deviceChipBadge = document.getElementById('deviceChipBadge');
const deviceIdBadge = document.getElementById('deviceIdBadge');
const uptimeDisplay = document.getElementById('uptimeDisplay');
const btnRenameDevice = document.getElementById('btnRenameDevice');
const btnDeleteDevice = document.getElementById('btnDeleteDevice');
const btnAllOn = document.getElementById('btnAllOn');
const btnAllOff = document.getElementById('btnAllOff');

// --- Inisialisasi Aplikasi ---
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initTabNavigation();
  initDeviceBar();
  initMasterControls();
  initFilterPills();
  initTimerCountdownModal();
  initActivityLogs();
  initSettingsTab();
  initPairingWizard();

  // Inisialisasi Modul Fitur
  initSchedulerUi();
  initAutomationsUi();
  initTelemetryChart();
  initPinManagerUi();
  initWebSerialTools();

  // PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[PWA] Service Worker gagal didaftarkan:', err.message);
    });
  }
});

// -------------------------------------------------------------
// 1. Autentikasi & Sesi
// -------------------------------------------------------------
function initAuth() {
  if (state.authToken) {
    validateSession();
  } else {
    showLoginScreen(true);
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value;
      const errorMsg = document.getElementById('loginErrorMsg');

      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      .then(r => r.json())
      .then(res => {
        if (res.success && res.token) {
          state.setToken(res.token);
          showLoginScreen(false);
          initWebSocket();
          loadInitialData();
          showToast(`Selamat datang, ${username}!`);
        } else {
          if (errorMsg) {
            errorMsg.textContent = res.message || 'Username atau password salah';
            errorMsg.classList.remove('hidden');
          }
        }
      })
      .catch(err => {
        if (errorMsg) {
          errorMsg.textContent = 'Gagal menghubungi server';
          errorMsg.classList.remove('hidden');
        }
      });
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (confirm('Keluar dari sesi administrator?')) {
        state.setToken(null);
        showLoginScreen(true);
        if (state.socket) state.socket.close();
      }
    });
  }
}

function showLoginScreen(show) {
  if (loginScreen && dashboardApp) {
    if (show) {
      loginScreen.classList.remove('hidden');
      dashboardApp.classList.add('hidden');
    } else {
      loginScreen.classList.add('hidden');
      dashboardApp.classList.remove('hidden');
    }
  }
}

function validateSession() {
  fetch('/api/auth/check', {
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(res => {
    if (res.success || res.authenticated) {
      showLoginScreen(false);
      initWebSocket();
      loadInitialData();
    } else {
      state.setToken(null);
      showLoginScreen(true);
    }
  })
  .catch((err) => {
    console.warn('[AUTH] Sesi tidak valid atau server tidak merespons:', err.message);
    state.setToken(null);
    showLoginScreen(true);
  });
}

function loadInitialData() {
  fetch('/api/devices', { headers: { 'Authorization': `Bearer ${state.authToken}` } })
    .then(r => r.json())
    .then(res => {
      if (res.success) state.setDevices(res.data || {});
    })
    .catch(() => {});
}

// -------------------------------------------------------------
// 2. Tab Navigation
// -------------------------------------------------------------
function initTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.dataset.tab;
      switchTab(targetTabId);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.toggle('hidden', view.id !== tabId);
    view.classList.toggle('active', view.id === tabId);
  });

  if (tabId === 'tabAktivitas') {
    loadActivityLogs();
  }
}

// -------------------------------------------------------------
// 3. Device Bar & Selection
// -------------------------------------------------------------
function initDeviceBar() {
  state.on('devicesChange', () => renderDeviceSelect());
  state.on('deviceSelect', () => updateActiveDeviceHeader());

  if (deviceSelect) {
    deviceSelect.addEventListener('change', () => {
      state.setActiveDevice(deviceSelect.value);
      renderComponentsGrid();
    });
  }

  if (btnRenameDevice) {
    btnRenameDevice.addEventListener('click', () => {
      const dev = state.getActiveDevice();
      if (!dev) return;
      const newName = prompt('Ubah nama perangkat:', dev.name || dev.deviceId);
      if (newName && newName.trim() && newName.trim() !== dev.name) {
        fetch(`/api/devices/${encodeURIComponent(dev.deviceId)}/rename`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.authToken}`
          },
          body: JSON.stringify({ name: newName.trim() })
        })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            dev.name = newName.trim();
            updateActiveDeviceHeader();
            renderDeviceSelect();
            showToast('Nama perangkat diperbarui');
          }
        });
      }
    });
  }

  if (btnDeleteDevice) {
    btnDeleteDevice.addEventListener('click', () => {
      const dev = state.getActiveDevice();
      if (!dev) {
        showToast('Tidak ada perangkat yang dipilih untuk dihapus', false);
        return;
      }
      if (!confirm(`Hapus perangkat "${dev.name || dev.deviceId}" dari sistem?`)) return;

      fetch(`/api/devices/${encodeURIComponent(dev.deviceId)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.authToken}` }
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          delete state.devices[dev.deviceId];
          state.setDevices({ ...state.devices });
          showToast('Perangkat berhasil dihapus');
        }
      });
    });
  }

  // Telemetry real-time micro updates
  state.on('telemetryUpdate', ({ deviceId, data, payload }) => {
    if (deviceId !== state.activeDeviceId) return;

    // Update semua widget via widgets.js factory (sensor, saklar, dimmer, servo, rgb, mpu)
    updateLiveTelemetryDom(data);

    // Update uptime display
    if (payload && payload.uptime && uptimeDisplay) {
      uptimeDisplay.textContent = formatUptime(payload.uptime);
    }

    // Pastikan state in-memory komponen selalu fresh
    const dev = state.getActiveDevice();
    if (dev && Array.isArray(dev.components)) {
      for (const [compId, val] of Object.entries(data)) {
        const comp = dev.components.find(c => c.id === compId || c.componentId === compId);
        if (comp) {
          comp.value = typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
      }
    }
  });

  state.on('componentsChange', ({ deviceId }) => {
    if (deviceId === state.activeDeviceId) {
      updateActiveDeviceHeader(); // update visibility tombol "Nyalakan Semua"
      renderComponentsGrid();
    }
  });
}

function renderDeviceSelect() {
  if (!deviceSelect) return;
  const devices = Object.values(state.devices);

  if (devices.length === 0) {
    deviceSelect.innerHTML = '<option value="">Tidak ada perangkat</option>';
    updateActiveDeviceHeader();
    renderComponentsGrid();
    return;
  }

  let html = '';
  devices.forEach(d => {
    html += `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.name || d.deviceId)} (${d.isOnline ? 'Online' : 'Offline'})</option>`;
  });

  deviceSelect.innerHTML = html;
  if (state.activeDeviceId && state.devices[state.activeDeviceId]) {
    deviceSelect.value = state.activeDeviceId;
  } else if (devices.length > 0) {
    state.activeDeviceId = devices[0].deviceId;
    deviceSelect.value = state.activeDeviceId;
  }
  updateActiveDeviceHeader();
  renderComponentsGrid();
}

function updateActiveDeviceHeader() {
  const dev = state.getActiveDevice();
  const deviceBarRight = document.getElementById('deviceBarRight');
  const componentFilterBar = document.getElementById('componentFilterBar');
  const masterSwitchSection = document.getElementById('masterSwitchSection');
  const deviceCardCompact = document.getElementById('deviceCardCompact');
  const hardwareStatusBadge = document.getElementById('hardwareStatusBadge');
  const hardwareStatusText = document.getElementById('hardwareStatusText') || hardwareStatusBadge?.querySelector('.status-text');

  if (!dev) {
    if (deviceName) deviceName.textContent = 'Tidak ada perangkat';
    if (deviceChipBadge) deviceChipBadge.textContent = '-';
    if (deviceIdBadge) deviceIdBadge.textContent = '-';
    if (uptimeDisplay) uptimeDisplay.textContent = '00:00:00';
    if (deviceBarRight) deviceBarRight.classList.add('hidden');
    if (componentFilterBar) componentFilterBar.classList.add('hidden');
    if (masterSwitchSection) masterSwitchSection.classList.add('hidden');
    if (deviceCardCompact) deviceCardCompact.classList.add('hidden');
    if (hardwareStatusBadge) {
      hardwareStatusBadge.className = 'status-pill offline';
      if (hardwareStatusText) hardwareStatusText.textContent = 'Hardware';
    }
    return;
  }

  if (deviceBarRight) deviceBarRight.classList.remove('hidden');
  if (componentFilterBar) componentFilterBar.classList.remove('hidden');
  if (deviceCardCompact) deviceCardCompact.classList.remove('hidden');
  if (deviceName) deviceName.textContent = dev.name || dev.deviceId;
  if (deviceChipBadge) deviceChipBadge.textContent = (dev.chip || dev.type || 'ESP').toUpperCase();
  if (deviceIdBadge) deviceIdBadge.textContent = dev.deviceId;
  if (uptimeDisplay) uptimeDisplay.textContent = formatUptime(dev.uptime || 0);

  const hasSwitches = Array.isArray(dev.components) && dev.components.some(c => c.type === 'switch' || c.driver === 'switch');
  if (masterSwitchSection) {
    if (hasSwitches) {
      masterSwitchSection.classList.remove('hidden');
    } else {
      masterSwitchSection.classList.add('hidden');
    }
  }

  if (hardwareStatusBadge) {
    if (dev.isOnline) {
      hardwareStatusBadge.className = 'status-pill online';
      if (hardwareStatusText) hardwareStatusText.textContent = 'HW Online';
    } else {
      hardwareStatusBadge.className = 'status-pill offline';
      if (hardwareStatusText) hardwareStatusText.textContent = 'HW Offline';
    }
  }
}

// -------------------------------------------------------------
// 4. Master Switch Controls (All ON / All OFF)
// -------------------------------------------------------------
function initMasterControls() {
  const CONTROLLABLE_TYPES = new Set(['switch', 'dimmer', 'servo', 'buzzer', 'rgb_led']);

  function applyAllState(newState) {
    if (!state.activeDeviceId) return;
    const dev = state.getActiveDevice();
    if (!dev || !Array.isArray(dev.components)) return;

    // Update state lokal semua komponen yang bisa dikontrol
    dev.components.forEach(c => {
      if (CONTROLLABLE_TYPES.has(c.type) || CONTROLLABLE_TYPES.has(c.driver)) {
        if (c.type === 'dimmer') {
          c.value = newState ? '100' : '0';
        } else if (c.type === 'servo') {
          c.value = newState ? '90' : '0';
        } else {
          c.value = String(newState); // 'true' / 'false'
        }
      }
    });
    renderComponentsGrid();
  }

  if (btnAllOn) {
    btnAllOn.addEventListener('click', () => {
      if (!state.activeDeviceId) return;
      sendWs({ action: 'set_all', target: state.activeDeviceId, state: true });
      applyAllState(true);
      showToast('Semua saklar dinyalakan');
    });
  }

  if (btnAllOff) {
    btnAllOff.addEventListener('click', () => {
      if (!state.activeDeviceId) return;
      sendWs({ action: 'set_all', target: state.activeDeviceId, state: false });
      applyAllState(false);
      showToast('Semua saklar dimatikan');
    });
  }
}

// -------------------------------------------------------------
// 5. Component Filter Pills
// -------------------------------------------------------------
function initFilterPills() {
  document.querySelectorAll('.comp-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.comp-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderComponentsGrid(pill.dataset.compFilter);
    });
  });
}

// -------------------------------------------------------------
// 6. Timer Countdown Modal Handlers
// -------------------------------------------------------------
function initTimerCountdownModal() {
  const modal = document.getElementById('modalTimerCountdown');
  const btnClose = document.getElementById('btnCloseTimerModal');
  const btnCancel = document.getElementById('btnCancelTimerSubmit');
  const btnConfirm = document.getElementById('btnStartTimerSubmit');

  if (btnClose) btnClose.addEventListener('click', () => modal.classList.add('hidden'));
  if (btnCancel) btnCancel.addEventListener('click', () => modal.classList.add('hidden'));

  modal?.querySelectorAll('.btn-dimmer-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = parseInt(btn.dataset.timerSec);
      if (state.activeTimerComponentId) {
        triggerComponent(state.activeTimerComponentId, true, sec);
        showToast(`Timer dinyalakan selama ${sec / 60} menit`);
        modal.classList.add('hidden');
      }
    });
  });

  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      const min = parseInt(document.getElementById('customTimerMinutes').value);
      if (min > 0 && state.activeTimerComponentId) {
        triggerComponent(state.activeTimerComponentId, true, min * 60);
        showToast(`Timer dinyalakan selama ${min} menit`);
        modal.classList.add('hidden');
      }
    });
  }
}

// -------------------------------------------------------------
// 7. Activity Logs
// -------------------------------------------------------------
function initActivityLogs() {
  const btnRefresh = document.getElementById('btnRefreshLogs');
  if (btnRefresh) btnRefresh.addEventListener('click', loadActivityLogs);

  document.querySelectorAll('.log-filter-bar .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.log-filter-bar .filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.activeLogFilter = pill.dataset.filter;
      renderLogsList();
    });
  });
}

function loadActivityLogs() {
  fetch('/api/logs?limit=60', {
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      state.activityLogs = res.data || [];
      renderLogsList();
    }
  });
}

function parseLogDetails(details) {
  if (typeof details === 'object' && details !== null) return details;
  if (typeof details === 'string') {
    try {
      return JSON.parse(details);
    } catch (e) {
      return details;
    }
  }
  return details;
}

function formatLogEvent(event) {
  const map = {
    control_set_all: { title: 'Kontrol Massal (Semua Saklar)', iconClass: 'control', icon: '⚡' },
    control_set_component: { title: 'Kontrol Saklar / Komponen', iconClass: 'control', icon: '🔌' },
    control_set_relay: { title: 'Kontrol Relay', iconClass: 'control', icon: '🔘' },
    control_cancel_timer: { title: 'Timer Dibatalkan', iconClass: 'control', icon: '⏱️' },
    rest_control_component: { title: 'Kontrol API (REST)', iconClass: 'control', icon: '🌐' },
    rest_cancel_timer: { title: 'Batal Timer (REST)', iconClass: 'control', icon: '⏱️' },
    schedule_executed: { title: 'Jadwal Otomasi Berjalan', iconClass: 'schedule', icon: '⏰' },
    schedule_added: { title: 'Jadwal Baru Dibuat', iconClass: 'schedule', icon: '➕' },
    schedule_updated: { title: 'Jadwal Diperbarui', iconClass: 'schedule', icon: '✏️' },
    schedule_deleted: { title: 'Jadwal Dihapus', iconClass: 'schedule', icon: '🗑️' },
    schedule_failed: { title: 'Jadwal Gagal Dieksekusi', iconClass: 'schedule', icon: '⚠️' },
    automation_triggered: { title: 'Aturan Otomasi Terpicu', iconClass: 'schedule', icon: '🤖' },
    automation_created: { title: 'Aturan Otomasi Dibuat', iconClass: 'schedule', icon: '➕' },
    automation_deleted: { title: 'Aturan Otomasi Dihapus', iconClass: 'schedule', icon: '🗑️' },
    device_registered: { title: 'Perangkat Terhubung', iconClass: 'device', icon: '🟢' },
    device_offline: { title: 'Perangkat Terputus', iconClass: 'device', icon: '🔴' },
    device_timeout: { title: 'Watchdog Timeout', iconClass: 'device', icon: '⏳' },
    device_added: { title: 'Perangkat Ditambahkan', iconClass: 'device', icon: '➕' },
    delete_device: { title: 'Perangkat Dihapus', iconClass: 'device', icon: '🗑️' },
    rename_device: { title: 'Ubah Nama Perangkat', iconClass: 'device', icon: '✏️' },
    rename_relay: { title: 'Ubah Nama Relay', iconClass: 'device', icon: '✏️' },
    rename_component: { title: 'Ubah Nama Komponen', iconClass: 'device', icon: '✏️' },
    add_component: { title: 'Tambah Komponen Hardware', iconClass: 'device', icon: '➕' },
    delete_component: { title: 'Hapus Komponen Hardware', iconClass: 'device', icon: '🗑️' },
    ota_triggered: { title: 'Instruksi OTA Dikirim', iconClass: 'device', icon: '🚀' },
    ota_progress: { title: 'Progress OTA Update', iconClass: 'device', icon: '📥' },
    ota_update_triggered: { title: 'OTA Update Dimulai', iconClass: 'device', icon: '🚀' },
    i2c_scan_complete: { title: 'Pemindaian I2C Selesai', iconClass: 'device', icon: '🔍' },
    i2c_scan_requested: { title: 'Permintaan Scan I2C', iconClass: 'device', icon: '🔍' },
    auth_password_changed: { title: 'Password Admin Diubah', iconClass: 'auth', icon: '🔑' }
  };

  if (map[event]) return map[event];
  const isControl = event.startsWith('control') || event.startsWith('rest');
  const isSched = event.startsWith('schedule') || event.startsWith('automation');
  const isAuth = event.startsWith('auth');
  return {
    title: event.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    iconClass: isControl ? 'control' : (isSched ? 'schedule' : (isAuth ? 'auth' : 'device')),
    icon: isControl ? '⚡' : (isSched ? '⏰' : (isAuth ? '🔑' : '📡'))
  };
}

function formatLogDetails(event, rawDetails) {
  const d = parseLogDetails(rawDetails);
  if (typeof d === 'string') {
    const isExplicitOn = /\b(on|dinyalakan|aktif)\b/i.test(d) && !/\b(nonaktif|off|dimatikan)\b/i.test(d);
    const isExplicitOff = /\b(off|dimatikan|nonaktif)\b/i.test(d);
    return {
      text: d,
      badge: isExplicitOn ? { type: 'on', text: 'ON' } : (isExplicitOff ? { type: 'off', text: 'OFF' } : null)
    };
  }
  if (!d || typeof d !== 'object') {
    return { text: String(rawDetails || '-'), badge: null };
  }

  // Pesan eksplisit terstruktur dari backend baru
  if (d.message) {
    const isExplicitOn = d.state === true || d.state === 'true' || d.action === 'all_on' || /\b(on|dinyalakan)\b/i.test(d.message);
    const isExplicitOff = d.state === false || d.state === 'false' || d.action === 'all_off' || /\b(off|dimatikan)\b/i.test(d.message);
    return {
      text: d.message,
      badge: isExplicitOn ? { type: 'on', text: 'ON' } : (isExplicitOff ? { type: 'off', text: 'OFF' } : null)
    };
  }

  // 1. Format untuk control_set_all
  if (event === 'control_set_all') {
    const isStateOn = d.state === true || d.state === 'true' || d.action === 'all_on' || d.state === 1;
    const countInfo = d.count ? ` (${d.count} saklar)` : '';
    return {
      text: `Semua saklar${countInfo} ${isStateOn ? 'dinyalakan' : 'dimatikan'}`,
      badge: { type: isStateOn ? 'on' : 'off', text: isStateOn ? 'ON' : 'OFF' }
    };
  }

  // 2. Format untuk control_set_component & rest_control_component
  if (event === 'control_set_component' || event === 'rest_control_component') {
    // Cari nama ramah dari active device jika ada
    let compName = d.name;
    if (!compName && d.componentId) {
      const curDev = state.getActiveDevice();
      const c = curDev?.components?.find(x => x.id === d.componentId || x.componentId === d.componentId);
      compName = c ? c.name : d.componentId;
    }
    compName = compName || 'Komponen';

    const val = d.value !== undefined ? d.value : d.state;
    const isValOn = val === true || val === 'true' || val === 1 || val === '1';
    const isValOff = val === false || val === 'false' || val === 0 || val === '0';
    const timerStr = d.duration ? ` (Timer: ${d.duration} detik)` : '';
    const stateLabel = isValOn ? 'Aktif' : (isValOff ? 'Nonaktif' : String(val));
    const compIdTag = (d.componentId && d.componentId !== compName) ? ` (${d.componentId})` : '';

    return {
      text: `${compName}${compIdTag} diubah ke ${stateLabel}${timerStr}`,
      badge: isValOn ? { type: 'on', text: 'ON' } : (isValOff ? { type: 'off', text: 'OFF' } : null)
    };
  }

  // 3. Format untuk control_set_relay
  if (event === 'control_set_relay') {
    const ch = d.channel || 1;
    const isStateOn = d.state === true || d.state === 'true';
    const timerStr = d.duration ? ` (Timer: ${d.duration} detik)` : '';
    return {
      text: `Relay #${ch} diubah ke ${isStateOn ? 'Aktif' : 'Nonaktif'}${timerStr}`,
      badge: { type: isStateOn ? 'on' : 'off', text: isStateOn ? 'ON' : 'OFF' }
    };
  }

  // 4. Format cancel_timer
  if (event === 'control_cancel_timer' || event === 'rest_cancel_timer') {
    return {
      text: `Timer countdown untuk ${d.componentId || 'Relay #' + d.channel} dibatalkan`,
      badge: null
    };
  }

  // 5. Format OTA update
  if (event === 'ota_progress') {
    const kbCurr = Math.round((d.current || 0) / 1024);
    const kbTotal = Math.round((d.total || 0) / 1024);
    return {
      text: `Mengunduh firmware: ${d.percent || 0}% (${kbCurr} KB / ${kbTotal} KB)`,
      badge: null
    };
  }

  // 6. Format Automasi
  if (event === 'automation_triggered') {
    return {
      text: `Aturan "${d.ruleName || d.ruleId}" terpicu (Nilai sensor: ${d.triggerValue})`,
      badge: null
    };
  }

  // Fallback: Bersihkan nilai null / undefined
  const clean = Object.entries(d).filter(([_, v]) => v !== null && v !== undefined && v !== '');
  if (clean.length === 0) return { text: '-', badge: null };
  return {
    text: clean.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', '),
    badge: null
  };
}

function filterLogByCategory(event, cat) {
  if (!cat || cat === 'all') return true;
  const ev = (event || '').toLowerCase();
  if (cat === 'control') return ev.startsWith('control_') || ev.startsWith('rest_');
  if (cat === 'schedule') return ev.startsWith('schedule_') || ev.startsWith('automation_');
  if (cat === 'device') {
    return ev.includes('device') || ev.includes('component') || ev.includes('relay') ||
           ev.includes('ota') || ev.includes('i2c') || ev.includes('auth');
  }
  return ev.includes(cat);
}

function renderLogsList() {
  const container = document.getElementById('activityTimeline');
  if (!container) return;

  let logs = state.activityLogs || [];
  if (state.activeLogFilter && state.activeLogFilter !== 'all') {
    logs = logs.filter(l => filterLogByCategory(l.event, state.activeLogFilter));
  }

  if (logs.length === 0) {
    container.innerHTML = '<div class="empty-timeline-msg">Belum ada riwayat aktivitas</div>';
    return;
  }

  container.innerHTML = '';
  logs.forEach(l => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    const time = new Date(l.timestamp).toLocaleTimeString('id-ID');
    const { title, iconClass, icon } = formatLogEvent(l.event);
    const { text, badge } = formatLogDetails(l.event, l.details);
    const badgeHtml = badge ? `<span class="timeline-badge ${badge.type}">${badge.text}</span>` : '';

    item.innerHTML = `
      <div class="timeline-icon-box ${iconClass}">${icon}</div>
      <div class="timeline-content">
        <div class="timeline-header-row">
          <span class="timeline-event-name">${escapeHtml(title)}</span>
          <span class="timeline-time">${time}</span>
        </div>
        <div class="timeline-desc">
          <span>${escapeHtml(text)}</span>${badgeHtml}
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}

// -------------------------------------------------------------
// 8. Settings Tab Handlers
// -------------------------------------------------------------
function initSettingsTab() {
  const btnSyncJson = document.getElementById('btnSyncJson');
  if (btnSyncJson) {
    btnSyncJson.addEventListener('click', () => {
      fetch('/api/schedules/sync-json', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.authToken}` }
      })
      .then(r => r.json())
      .then(res => showToast(res.message, res.success));
    });
  }

  const btnChangePass = document.getElementById('btnChangePassword');
  if (btnChangePass) {
    btnChangePass.addEventListener('click', () => {
      const cur = prompt('Masukkan password saat ini:');
      if (!cur) return;
      const p1 = prompt('Masukkan password baru:');
      if (!p1) return;
      if (p1.length < 6) {
        showToast('Password baru minimal 6 karakter!', false);
        return;
      }
      const p2 = prompt('Konfirmasi password baru:');
      if (p1 !== p2) {
        showToast('Password tidak cocok', false);
        return;
      }

      fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.authToken}`
        },
        body: JSON.stringify({ currentPassword: cur, newPassword: p1 })
      })
      .then(r => r.json())
      .then(res => showToast(res.message, res.success))
      .catch(err => showToast(err.message, false));
    });
  }
}

// -------------------------------------------------------------
// 9. Pairing Wizard Modal Handlers
// -------------------------------------------------------------
function initPairingWizard() {
  const modal = document.getElementById('modalAddDevice');
  const btnOpen = document.getElementById('btnOpenAddDevice');
  const btnClose = document.getElementById('btnCloseAddDevice');

  if (btnOpen && modal) btnOpen.addEventListener('click', () => modal.classList.remove('hidden'));
  if (btnClose && modal) btnClose.addEventListener('click', () => modal.classList.add('hidden'));

  // Wizard tab switching
  document.querySelectorAll('.wizard-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.wizard-step-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.wizard-step-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.step);
      if (target) target.classList.add('active');
    });
  });
}
