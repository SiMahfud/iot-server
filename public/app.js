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

      fetch('/api/login', {
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
  fetch('/api/verify', {
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      showLoginScreen(false);
      initWebSocket();
      loadInitialData();
    } else {
      state.setToken(null);
      showLoginScreen(true);
    }
  })
  .catch(() => {
    showLoginScreen(false);
    initWebSocket();
    loadInitialData();
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
      if (!dev) return;
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
    if (deviceId === state.activeDeviceId) {
      updateLiveTelemetryDom(data);
      if (payload && payload.uptime && uptimeDisplay) {
        uptimeDisplay.textContent = formatUptime(payload.uptime);
      }
    }
  });

  state.on('componentsChange', ({ deviceId }) => {
    if (deviceId === state.activeDeviceId) {
      renderComponentsGrid();
    }
  });
}

function renderDeviceSelect() {
  if (!deviceSelect) return;
  const devices = Object.values(state.devices);

  if (devices.length === 0) {
    deviceSelect.innerHTML = '<option value="">Tidak ada perangkat</option>';
    return;
  }

  let html = '';
  devices.forEach(d => {
    html += `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.name || d.deviceId)} (${d.isOnline ? 'Online' : 'Offline'})</option>`;
  });

  deviceSelect.innerHTML = html;
  if (state.activeDeviceId) {
    deviceSelect.value = state.activeDeviceId;
  }
  updateActiveDeviceHeader();
  renderComponentsGrid();
}

function updateActiveDeviceHeader() {
  const dev = state.getActiveDevice();
  if (!dev) {
    if (deviceName) deviceName.textContent = 'Tidak ada perangkat';
    if (deviceChipBadge) deviceChipBadge.textContent = '-';
    if (deviceIdBadge) deviceIdBadge.textContent = '-';
    return;
  }

  if (deviceName) deviceName.textContent = dev.name || dev.deviceId;
  if (deviceChipBadge) deviceChipBadge.textContent = (dev.chip || dev.type || 'ESP').toUpperCase();
  if (deviceIdBadge) deviceIdBadge.textContent = dev.deviceId;
  if (uptimeDisplay) uptimeDisplay.textContent = formatUptime(dev.uptime || 0);

  const hardwareStatusBadge = document.getElementById('hardwareStatusBadge');
  const hardwareStatusText = document.getElementById('hardwareStatusText');
  if (hardwareStatusBadge && hardwareStatusText) {
    if (dev.isOnline) {
      hardwareStatusBadge.className = 'status-badge online';
      hardwareStatusText.textContent = 'Online';
    } else {
      hardwareStatusBadge.className = 'status-badge offline';
      hardwareStatusText.textContent = 'Offline';
    }
  }
}

// -------------------------------------------------------------
// 4. Master Switch Controls (All ON / All OFF)
// -------------------------------------------------------------
function initMasterControls() {
  if (btnAllOn) {
    btnAllOn.addEventListener('click', () => {
      if (!state.activeDeviceId) return;
      sendWs({ action: 'set_all', target: state.activeDeviceId, state: true });
      showToast('Semua saklar dinyalakan');
    });
  }

  if (btnAllOff) {
    btnAllOff.addEventListener('click', () => {
      if (!state.activeDeviceId) return;
      sendWs({ action: 'set_all', target: state.activeDeviceId, state: false });
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

function renderLogsList() {
  const container = document.getElementById('activityTimeline');
  if (!container) return;

  let logs = state.activityLogs || [];
  if (state.activeLogFilter !== 'all') {
    logs = logs.filter(l => l.event.toLowerCase().includes(state.activeLogFilter));
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
    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="timeline-event">${escapeHtml(l.event)}</span>
          <span class="timeline-time">${time}</span>
        </div>
        <div class="timeline-details">${escapeHtml(typeof l.details === 'object' ? JSON.stringify(l.details) : l.details)}</div>
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
      const p1 = prompt('Masukkan password baru:');
      if (!p1) return;
      const p2 = prompt('Konfirmasi password baru:');
      if (p1 !== p2) {
        showToast('Password tidak cocok', false);
        return;
      }

      fetch('/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.authToken}`
        },
        body: JSON.stringify({ newPassword: p1 })
      })
      .then(r => r.json())
      .then(res => showToast(res.message, res.success));
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
