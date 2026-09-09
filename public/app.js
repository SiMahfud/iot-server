// ==========================================
// Smart Switch IoT Controller - Frontend App v3.0
// Mobile-First Tab Architecture, Live SQLite/JSON Sync & Custom Modal
// ==========================================

const TOKEN_KEY = 'smart_switch_jwt_token';
let authToken = localStorage.getItem(TOKEN_KEY);

let appDevices = {};
let activeDeviceId = null;
let socket = null;
let deferredPrompt = null;
let pingStartTime = 0;
let appSchedules = [];
let activityLogs = [];
let activeLogFilter = 'all';

// DOM Elements: Auth
const loginScreen = document.getElementById('loginScreen');
const dashboardApp = document.getElementById('dashboardApp');
const loginForm = document.getElementById('loginForm');
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const btnTogglePass = document.getElementById('btnTogglePass');
const loginErrorMsg = document.getElementById('loginErrorMsg');
const btnLogout = document.getElementById('btnLogout');

// DOM Elements: Header & Stats
const serverStatusBadge = document.getElementById('serverStatusBadge');
const hardwareStatusBadge = document.getElementById('hardwareStatusBadge');
const hardwareStatusText = document.getElementById('hardwareStatusText');
const statActiveRelays = document.getElementById('statActiveRelays');
const statActiveSchedules = document.getElementById('statActiveSchedules');
const wifiRssi = document.getElementById('wifiRssi');
const pingDisplay = document.getElementById('pingDisplay');
const deviceSelect = document.getElementById('deviceSelect');
const deviceIdBadge = document.getElementById('deviceIdBadge');
const deviceName = document.getElementById('deviceName');
const uptimeDisplay = document.getElementById('uptimeDisplay');
const btnRenameDevice = document.getElementById('btnRenameDevice');

// DOM Elements: Controls & Grid
const btnAllOn = document.getElementById('btnAllOn');
const btnAllOff = document.getElementById('btnAllOff');
const btnSceneWater10 = document.getElementById('btnSceneWater10');
const btnSceneWater15 = document.getElementById('btnSceneWater15');
const btnSceneAllOff = document.getElementById('btnSceneAllOff');
const relaysGrid = document.getElementById('relaysGrid');

// DOM Elements: Schedules & Timer
const subTabJadwalBtn = document.getElementById('subTabJadwalBtn');
const subTabTimerBtn = document.getElementById('subTabTimerBtn');
const subViewJadwal = document.getElementById('subViewJadwal');
const subViewTimer = document.getElementById('subViewTimer');
const scheduleForm = document.getElementById('scheduleForm');
const schedChannel = document.getElementById('schedChannel');
const schedAction = document.getElementById('schedAction');
const schedTime = document.getElementById('schedTime');
const schedDuration = document.getElementById('schedDuration');
const schedDurationGroup = document.getElementById('schedDurationGroup');
const schedLabel = document.getElementById('schedLabel');
const daysChips = document.getElementById('daysChips');
const scheduleList = document.getElementById('scheduleList');
const schedCountBadge = document.getElementById('schedCountBadge');
const timerGrid = document.getElementById('timerGrid');

// DOM Elements: Activity Log
const activityTimeline = document.getElementById('activityTimeline');
const btnRefreshLogs = document.getElementById('btnRefreshLogs');

// DOM Elements: Settings
const btnSyncJson = document.getElementById('btnSyncJson');
const btnChangePassword = document.getElementById('btnChangePassword');
const relayNamingList = document.getElementById('relayNamingList');
const installAppContainer = document.getElementById('installAppContainer');
const btnInstallApp = document.getElementById('btnInstallApp');

// DOM Elements: Modal & Toast
const customModalBackdrop = document.getElementById('customModalBackdrop');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const btnModalClose = document.getElementById('btnModalClose');
const btnModalCancel = document.getElementById('btnModalCancel');
const btnModalConfirm = document.getElementById('btnModalConfirm');
const toastNotification = document.getElementById('toastNotification');
const toastMessage = document.getElementById('toastMessage');

// State: Scheduler Form
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
let selectedDays = [];
let modalConfirmCallback = null;

// -------------------------------------------------------------
// Format Waktu & Helper
// -------------------------------------------------------------
function formatUptime(seconds) {
  if (!seconds) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [hrs, mins, secs].map(v => v.toString().padStart(2, '0')).join(':');
}

function formatCountdown(seconds) {
  if (!seconds || seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}j ${rm.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}d`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(msg, duration = 3000) {
  toastMessage.textContent = msg;
  toastNotification.classList.remove('hidden');
  setTimeout(() => {
    toastNotification.classList.add('hidden');
  }, duration);
}

// -------------------------------------------------------------
// Universal Custom Modal Dialog Engine
// (Menggantikan window.prompt & window.confirm)
// -------------------------------------------------------------
function openCustomModal({ title, bodyHtml, confirmText = 'Simpan', cancelText = 'Batal', isDanger = false, onConfirm }) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  btnModalConfirm.textContent = confirmText;
  btnModalCancel.textContent = cancelText;

  if (isDanger) {
    btnModalConfirm.classList.add('danger');
  } else {
    btnModalConfirm.classList.remove('danger');
  }

  modalConfirmCallback = onConfirm;
  customModalBackdrop.classList.remove('hidden');

  // Autofocus input pertama jika ada
  const firstInput = modalBody.querySelector('input');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 150);
  }
}

function closeCustomModal() {
  customModalBackdrop.classList.add('hidden');
  modalBody.innerHTML = '';
  modalConfirmCallback = null;
}

btnModalClose.addEventListener('click', closeCustomModal);
btnModalCancel.addEventListener('click', closeCustomModal);
customModalBackdrop.addEventListener('click', (e) => {
  if (e.target === customModalBackdrop) closeCustomModal();
});

btnModalConfirm.addEventListener('click', async () => {
  if (typeof modalConfirmCallback === 'function') {
    const shouldClose = await modalConfirmCallback(modalBody);
    if (shouldClose !== false) {
      closeCustomModal();
    }
  } else {
    closeCustomModal();
  }
});

// -------------------------------------------------------------
// Tab Navigation Controller
// -------------------------------------------------------------
const navTabBtns = document.querySelectorAll('.nav-tab-btn');
const tabViews = document.querySelectorAll('.tab-view');

navTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTabId = btn.dataset.tab;
    switchTab(targetTabId);
  });
});

function switchTab(tabId) {
  navTabBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });

  tabViews.forEach(view => {
    if (view.id === tabId) {
      view.classList.remove('hidden');
    } else {
      view.classList.add('hidden');
    }
  });

  if (tabId === 'tabAktivitas') {
    loadActivityLogs();
  } else if (tabId === 'tabPengaturan') {
    renderRelayNamingList();
  }
}

// Sub-tab switcher in Jadwal Tab
if (subTabJadwalBtn && subTabTimerBtn) {
  subTabJadwalBtn.addEventListener('click', () => {
    subTabJadwalBtn.classList.add('active');
    subTabTimerBtn.classList.remove('active');
    subViewJadwal.classList.remove('hidden');
    subViewTimer.classList.add('hidden');
  });

  subTabTimerBtn.addEventListener('click', () => {
    subTabTimerBtn.classList.add('active');
    subTabJadwalBtn.classList.remove('active');
    subViewTimer.classList.remove('hidden');
    subViewJadwal.classList.add('hidden');
  });
}

// -------------------------------------------------------------
// Sesi & Autentikasi
// -------------------------------------------------------------
async function checkAuthSession() {
  if (!authToken) {
    showLoginUI();
    return;
  }

  try {
    const res = await fetch('/api/auth/check', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.authenticated) {
      showDashboardUI();
      connectWebSocket();
      loadSchedules();
    } else {
      logout();
    }
  } catch (err) {
    showDashboardUI();
    connectWebSocket();
    loadSchedules();
  }
}

function showLoginUI() {
  loginScreen.classList.remove('hidden');
  dashboardApp.classList.add('hidden');
  if (socket) socket.close();
}

function showDashboardUI() {
  loginScreen.classList.add('hidden');
  dashboardApp.classList.remove('hidden');
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  authToken = null;
  if (socket) socket.close();
  showLoginUI();
}

// Submit Login Form
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErrorMsg.classList.add('hidden');

  const username = loginUser.value.trim();
  const password = loginPass.value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.success && data.token) {
      authToken = data.token;
      localStorage.setItem(TOKEN_KEY, authToken);
      showDashboardUI();
      connectWebSocket();
      loadSchedules();
      showToast(`Selamat datang, ${data.username}!`);
    } else {
      loginErrorMsg.textContent = data.message || 'Username atau password salah!';
      loginErrorMsg.classList.remove('hidden');
    }
  } catch (err) {
    loginErrorMsg.textContent = 'Gagal menghubungi server!';
    loginErrorMsg.classList.remove('hidden');
  }
});

btnTogglePass.addEventListener('click', () => {
  const isPass = loginPass.type === 'password';
  loginPass.type = isPass ? 'text' : 'password';
});

btnLogout.addEventListener('click', () => {
  openCustomModal({
    title: 'Konfirmasi Keluar',
    bodyHtml: '<p style="font-size: 0.9rem; color: var(--text-muted);">Apakah Anda yakin ingin keluar dari dashboard Smart Switch?</p>',
    confirmText: 'Keluar',
    isDanger: true,
    onConfirm: () => {
      logout();
      showToast('Anda telah keluar');
    }
  });
});

// -------------------------------------------------------------
// WebSocket Client
// -------------------------------------------------------------
function connectWebSocket() {
  if (!authToken) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(authToken)}`;

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    socket.send(JSON.stringify({ action: 'auth', token: authToken }));
    serverStatusBadge.className = 'status-pill online';
    serverStatusBadge.innerHTML = '<span class="status-dot"></span><span class="status-text">Server</span>';
    measurePing();
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'INIT_STATE') {
        appDevices = msg.devices || {};
        if (Array.isArray(msg.schedules)) {
          appSchedules = msg.schedules;
        }
        updateDeviceDropdown();
        renderDashboard();
        renderTimerSection();
        renderScheduleList();
        updateQuickStats();
      } else if (msg.type === 'DEVICE_UPDATE') {
        appDevices[msg.device.deviceId] = msg.device;
        updateDeviceDropdown();
        if (msg.device.deviceId === activeDeviceId) {
          renderDashboard();
          renderTimerSection();
        }
        renderScheduleList();
        updateQuickStats();
      } else if (msg.type === 'DEVICE_DELETED') {
        delete appDevices[msg.deviceId];
        updateDeviceDropdown();
        renderDashboard();
        renderTimerSection();
        renderScheduleList();
        updateQuickStats();
      } else if (msg.type === 'SCHEDULES_UPDATE') {
        appSchedules = msg.schedules || [];
        renderScheduleList();
        updateQuickStats();
      } else if (msg.type === 'I2C_SCAN_RESULT') {
        if (msg.deviceId === activeDeviceId) {
          renderI2cScanResults(msg.devices || []);
        }
      } else if (msg.type === 'OTA_PROGRESS') {
        handleOtaProgressUpdate(msg);
      } else if (msg.type === 'NOTIFICATION') {
        showToast(msg.message);
      } else if (msg.type === 'AUTH_ERROR') {
        showToast('Sesi autentikasi kedaluwarsa, silakan login ulang');
        logout();
      } else if (msg.type === 'PONG') {
        const latency = Date.now() - pingStartTime;
        pingDisplay.textContent = `${Math.min(latency, 999)} ms`;
      }
    } catch (err) {
      console.error('[WS PARSE ERROR]', err);
    }
  };

  socket.onclose = (event) => {
    if (event.code === 4001) {
      logout();
      return;
    }
    serverStatusBadge.className = 'status-pill offline';
    serverStatusBadge.innerHTML = '<span class="status-dot"></span><span class="status-text">Reconnecting...</span>';
    hardwareStatusBadge.className = 'status-pill offline';
    hardwareStatusText.textContent = 'Hardware';
    setTimeout(() => {
      if (authToken) connectWebSocket();
    }, 3000);
  };

  socket.onerror = (err) => {
    socket.close();
  };
}

function measurePing() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    pingStartTime = Date.now();
    socket.send(JSON.stringify({ action: 'ping' }));
  }
}
setInterval(measurePing, 10000);

// -------------------------------------------------------------
// Quick Stats Engine
// -------------------------------------------------------------
function updateQuickStats() {
  const dev = appDevices[activeDeviceId];
  let activeRelays = 0;
  let totalRelays = 4;

  if (dev && Array.isArray(dev.relays)) {
    totalRelays = dev.relays.length;
    activeRelays = dev.relays.filter(r => r.state).length;
  }

  statActiveRelays.textContent = `${activeRelays}/${totalRelays}`;

  // Jadwal aktif untuk device ini
  const activeScheds = appSchedules.filter(s => s.deviceId === activeDeviceId && s.enabled !== false).length;
  statActiveSchedules.textContent = activeScheds.toString();
  schedCountBadge.textContent = activeScheds.toString();

  // Hardware status badge & WiFi
  if (dev && dev.isOnline) {
    hardwareStatusBadge.className = 'status-pill online';
    hardwareStatusText.textContent = 'Hardware';
    wifiRssi.textContent = dev.rssi ? `${dev.rssi} dBm` : '-- dBm';
    uptimeDisplay.textContent = formatUptime(dev.uptime);
  } else {
    hardwareStatusBadge.className = 'status-pill offline';
    hardwareStatusText.textContent = 'Hardware';
    wifiRssi.textContent = '-- dBm';
    uptimeDisplay.textContent = '00:00:00';
  }
}

// -------------------------------------------------------------
// Update Device Dropdown & Relay Selectors
// -------------------------------------------------------------
function updateDeviceDropdown() {
  const ids = Object.keys(appDevices);
  
  if (ids.length === 0) {
    deviceSelect.innerHTML = '<option value="">Tidak ada perangkat</option>';
    activeDeviceId = null;
    renderScheduleList();
    updateQuickStats();
    return;
  }

  const prevActive = activeDeviceId;
  if (!activeDeviceId || !appDevices[activeDeviceId]) {
    activeDeviceId = ids[0];
  }

  deviceSelect.innerHTML = '';
  ids.forEach(id => {
    const dev = appDevices[id];
    const opt = document.createElement('option');
    opt.value = id;
    const statusIcon = dev.isOnline ? '🟢' : '⚪';
    opt.textContent = `${statusIcon} ${dev.name || id}`;
    if (id === activeDeviceId) opt.selected = true;
    deviceSelect.appendChild(opt);
  });

  updateScheduleRelayOptions();

  if (prevActive !== activeDeviceId) {
    renderScheduleList();
  }
  updateQuickStats();
}

deviceSelect.addEventListener('change', (e) => {
  activeDeviceId = e.target.value;
  updateScheduleRelayOptions();
  renderDashboard();
  renderTimerSection();
  renderScheduleList();
  updateQuickStats();
});

// Update pilihan relay di form jadwal mengikuti nama kustom
function updateScheduleRelayOptions(targetSelect = schedChannel) {
  if (!targetSelect) return;
  const dev = appDevices[activeDeviceId];
  targetSelect.innerHTML = '';

  const relayCount = (dev && Array.isArray(dev.relays)) ? dev.relays.length : 4;
  for (let i = 1; i <= relayCount; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    const r = dev && dev.relays ? dev.relays.find(x => x.channel === i) : null;
    const relayName = r ? r.name : `Saklar ${i}`;
    opt.textContent = `Relay #${i} - ${relayName}`;
    targetSelect.appendChild(opt);
  }
}

// -------------------------------------------------------------
// Render Dashboard Kontrol
// -------------------------------------------------------------
function renderDashboard() {
  const dev = appDevices[activeDeviceId];

  if (!dev) {
    deviceName.textContent = 'Tidak Ada Perangkat';
    deviceIdBadge.textContent = '--';
    relaysGrid.innerHTML = '<p style="text-align:center; color: var(--text-subtle); padding: 30px 0; grid-column: 1 / -1;">Belum ada perangkat IoT yang terhubung.</p>';
    updateQuickStats();
    return;
  }

  deviceName.textContent = dev.name || dev.deviceId;
  deviceIdBadge.textContent = dev.deviceId;
  uptimeDisplay.textContent = formatUptime(dev.uptime);

  relaysGrid.innerHTML = '';
  if (!dev.relays || dev.relays.length === 0) {
    relaysGrid.innerHTML = '<p style="text-align:center; color: var(--text-subtle); padding: 30px 0; grid-column: 1 / -1;">Menunggu sinkronisasi channel relay...</p>';
    updateQuickStats();
    return;
  }

  dev.relays.forEach(relay => {
    const card = document.createElement('div');
    card.className = `relay-card ${relay.state ? 'active' : ''}`;
    card.id = `relay-card-${relay.channel}`;

    let countdownBadgeHtml = '';
    if (relay.timer && relay.timer.active && relay.timer.remaining > 0) {
      countdownBadgeHtml = `
        <div class="countdown-badge">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>⏱ ${formatCountdown(relay.timer.remaining)}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="relay-meta">
        <div class="relay-header-line">
          <span class="channel-pill">RELAY #${relay.channel}</span>
          <span class="relay-status-label">${relay.state ? 'MENYALA' : 'MATI'}</span>
        </div>
        <div class="relay-name-wrapper" title="Klik untuk ubah nama">
          <span class="relay-name-text">${escapeHtml(relay.name)}</span>
          <button class="btn-rename" type="button" title="Ubah Nama">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
        </div>
        ${countdownBadgeHtml}
      </div>
      <label class="switch-control">
        <input type="checkbox" ${relay.state ? 'checked' : ''} data-channel="${relay.channel}">
        <span class="slider"></span>
      </label>
    `;

    const checkbox = card.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', (e) => {
      triggerRelay(relay.channel, e.target.checked);
    });

    const nameWrapper = card.querySelector('.relay-name-wrapper');
    nameWrapper.addEventListener('click', () => {
      promptRenameRelayModal(dev.deviceId, relay.channel, relay.name);
    });

    relaysGrid.appendChild(card);
  });

  renderComponentsSection(dev);
  updateQuickStats();
}

// -------------------------------------------------------------
// Perintah Kontrol Relay
// -------------------------------------------------------------
function triggerRelay(channel, state, duration = 0) {
  if (navigator.vibrate) navigator.vibrate(40);

  if (socket && socket.readyState === WebSocket.OPEN) {
    const payload = {
      action: 'set_relay',
      target: activeDeviceId,
      channel: channel,
      state: state
    };
    if (duration > 0) payload.duration = duration;
    socket.send(JSON.stringify(payload));
  } else {
    showToast('Gagal: Server terputus');
  }
}

function triggerAllRelays(state) {
  if (navigator.vibrate) navigator.vibrate([40, 30, 40]);

  if (socket && socket.readyState === WebSocket.OPEN) {
    const payload = {
      action: 'set_all',
      target: activeDeviceId,
      state: state
    };
    socket.send(JSON.stringify(payload));
  } else {
    showToast('Gagal: Server terputus');
  }
}

btnAllOn.addEventListener('click', () => triggerAllRelays(true));
btnAllOff.addEventListener('click', () => triggerAllRelays(false));

// Quick Scenes Handler
btnSceneWater10.addEventListener('click', () => {
  triggerRelay(1, true, 600);
  showToast('🚿 Siram 10 Menit dimulai pada Relay #1');
});

btnSceneWater15.addEventListener('click', () => {
  triggerRelay(1, true, 900);
  showToast('💧 Siram 15 Menit dimulai pada Relay #1');
});

btnSceneAllOff.addEventListener('click', () => {
  triggerAllRelays(false);
  showToast('🛑 Semua relay dimatikan (Standby)');
});

// -------------------------------------------------------------
// Modal Dialogs: Rename Perangkat & Relay
// -------------------------------------------------------------
btnRenameDevice.addEventListener('click', () => {
  if (!activeDeviceId || !appDevices[activeDeviceId]) return;
  const curName = appDevices[activeDeviceId].name || activeDeviceId;

  openCustomModal({
    title: 'Ubah Nama Perangkat',
    bodyHtml: `
      <div class="form-group">
        <label class="form-label">Nama Perangkat Baru</label>
        <input type="text" id="inputNewDeviceName" class="form-input" value="${escapeHtml(curName)}" maxlength="30" required>
      </div>
    `,
    confirmText: 'Simpan',
    onConfirm: async (body) => {
      const val = body.querySelector('#inputNewDeviceName').value.trim();
      if (!val || val === curName) return true;

      try {
        const res = await fetch(`/api/devices/${activeDeviceId}/rename`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ name: val })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Nama perangkat berhasil diperbarui');
        }
      } catch (e) {
        showToast('Gagal mengubah nama perangkat');
      }
    }
  });
});

function promptRenameRelayModal(deviceId, channel, currentName) {
  openCustomModal({
    title: `Ubah Nama Relay #${channel}`,
    bodyHtml: `
      <div class="form-group">
        <label class="form-label">Nama Saklar</label>
        <input type="text" id="inputNewRelayName" class="form-input" value="${escapeHtml(currentName)}" maxlength="30" required>
      </div>
    `,
    confirmText: 'Simpan',
    onConfirm: async (body) => {
      const val = body.querySelector('#inputNewRelayName').value.trim();
      if (!val || val === currentName) return true;

      try {
        const res = await fetch(`/api/devices/${deviceId}/relay/${channel}/rename`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ name: val })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Relay #${channel} diubah menjadi: "${val}"`);
          updateScheduleRelayOptions();
          renderRelayNamingList();
        }
      } catch (e) {
        showToast('Gagal mengubah nama relay');
      }
    }
  });
}

// -------------------------------------------------------------
// Modal Dialog: Ubah Password Admin
// -------------------------------------------------------------
btnChangePassword.addEventListener('click', () => {
  openCustomModal({
    title: 'Ubah Password Administrator',
    bodyHtml: `
      <div class="form-group">
        <label class="form-label">Password Saat Ini</label>
        <input type="password" id="inputCurPass" class="form-input" placeholder="Masukkan password lama" required>
      </div>
      <div class="form-group">
        <label class="form-label">Password Baru (min 6 karakter)</label>
        <input type="password" id="inputNewPass" class="form-input" placeholder="Password baru" required>
      </div>
      <div class="form-group">
        <label class="form-label">Konfirmasi Password Baru</label>
        <input type="password" id="inputConfirmPass" class="form-input" placeholder="Ketik ulang password baru" required>
      </div>
      <div id="passErrorNotice" class="error-msg hidden"></div>
    `,
    confirmText: 'Ubah Password',
    onConfirm: async (body) => {
      const curPass = body.querySelector('#inputCurPass').value;
      const newPass = body.querySelector('#inputNewPass').value;
      const confPass = body.querySelector('#inputConfirmPass').value;
      const errNotice = body.querySelector('#passErrorNotice');

      if (!curPass) {
        errNotice.textContent = 'Password saat ini wajib diisi';
        errNotice.classList.remove('hidden');
        return false;
      }
      if (!newPass || newPass.length < 6) {
        errNotice.textContent = 'Password baru minimal 6 karakter';
        errNotice.classList.remove('hidden');
        return false;
      }
      if (newPass !== confPass) {
        errNotice.textContent = 'Konfirmasi password baru tidak cocok';
        errNotice.classList.remove('hidden');
        return false;
      }

      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ currentPassword: curPass, newPassword: newPass })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Password berhasil diubah! Silakan login ulang.');
          logout();
          return true;
        } else {
          errNotice.textContent = data.message || 'Gagal mengubah password';
          errNotice.classList.remove('hidden');
          return false;
        }
      } catch (e) {
        errNotice.textContent = 'Terjadi kesalahan koneksi server';
        errNotice.classList.remove('hidden');
        return false;
      }
    }
  });
});

// -------------------------------------------------------------
// Timer Countdown Section
// -------------------------------------------------------------
const TIMER_PRESETS = [
  { label: '1 menit', value: 60 },
  { label: '5 menit', value: 300 },
  { label: '10 menit', value: 600 },
  { label: '15 menit', value: 900 },
  { label: '30 menit', value: 1800 },
  { label: '1 jam', value: 3600 },
];

function renderTimerSection() {
  const dev = appDevices[activeDeviceId];
  if (!dev || !dev.relays || dev.relays.length === 0) {
    timerGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-subtle);">Tidak ada perangkat aktif</p>';
    return;
  }

  timerGrid.innerHTML = '';

  dev.relays.forEach(relay => {
    const card = document.createElement('div');
    const hasTimer = relay.timer && relay.timer.active && relay.timer.remaining > 0;
    card.className = `timer-card ${hasTimer ? 'has-timer' : ''}`;
    const relayName = escapeHtml(relay.name || `Saklar ${relay.channel}`);

    if (hasTimer) {
      const remaining = relay.timer.remaining;
      const total = relay.timer.total || remaining;
      const progressPct = total > 0 ? Math.max(0, (remaining / total) * 100) : 0;

      card.innerHTML = `
        <div class="timer-card-header">
          <span class="timer-relay-name">${relayName}</span>
          <span class="timer-relay-channel">#${relay.channel}</span>
        </div>
        <div class="timer-countdown-display">
          <div class="countdown-time">${formatCountdown(remaining)}</div>
          <div class="countdown-label">sisa waktu mundur</div>
        </div>
        <div class="timer-progress-bar">
          <div class="timer-progress-fill" style="width: ${progressPct}%"></div>
        </div>
        <button class="btn-timer-cancel" type="button" data-channel="${relay.channel}">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <span>Batalkan Timer</span>
        </button>
      `;

      card.querySelector('.btn-timer-cancel').addEventListener('click', () => {
        cancelTimer(relay.channel);
      });
    } else {
      let optionsHtml = TIMER_PRESETS.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
      optionsHtml += '<option value="custom">Custom...</option>';

      card.innerHTML = `
        <div class="timer-card-header">
          <span class="timer-relay-name">${relayName}</span>
          <span class="timer-relay-channel">#${relay.channel}</span>
        </div>
        <p style="font-size: 0.76rem; color: var(--text-muted);">${relay.state ? '🟢 Menyala' : '⚪ Mati'}</p>
        <div class="timer-actions">
          <select data-channel="${relay.channel}">${optionsHtml}</select>
          <button class="btn-timer-start" type="button" data-channel="${relay.channel}">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Mulai</span>
          </button>
        </div>
      `;

      const startBtn = card.querySelector('.btn-timer-start');
      const selectEl = card.querySelector('select');
      startBtn.addEventListener('click', () => {
        if (selectEl.value === 'custom') {
          openCustomModal({
            title: `Durasi Custom (Relay #${relay.channel})`,
            bodyHtml: `
              <div class="form-group">
                <label class="form-label">Masukkan Durasi (dalam Menit)</label>
                <input type="number" id="inputCustomMin" class="form-input" min="1" max="1440" value="10" required>
              </div>
            `,
            confirmText: 'Mulai Timer',
            onConfirm: (body) => {
              const mins = parseInt(body.querySelector('#inputCustomMin').value);
              if (isNaN(mins) || mins <= 0) return false;
              startTimer(relay.channel, mins * 60);
              return true;
            }
          });
        } else {
          startTimer(relay.channel, parseInt(selectEl.value));
        }
      });
    }

    timerGrid.appendChild(card);
  });
}

function startTimer(channel, durationSeconds) {
  if (navigator.vibrate) navigator.vibrate(40);

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      action: 'set_relay',
      target: activeDeviceId,
      channel: channel,
      state: true,
      duration: durationSeconds
    }));
    showToast(`Timer ${formatCountdown(durationSeconds)} dimulai pada Relay #${channel}`);
  } else {
    showToast('Gagal: Server terputus');
  }
}

function cancelTimer(channel) {
  if (navigator.vibrate) navigator.vibrate([30, 20, 30]);

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      action: 'cancel_timer',
      target: activeDeviceId,
      channel: channel
    }));
    showToast(`Timer Relay #${channel} dibatalkan`);
  } else {
    showToast('Gagal: Server terputus');
  }
}

// -------------------------------------------------------------
// Scheduler Harian / Mingguan & Next Run Engine
// -------------------------------------------------------------
if (daysChips) {
  daysChips.querySelectorAll('.day-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const day = parseInt(chip.dataset.day);
      if (selectedDays.includes(day)) {
        selectedDays = selectedDays.filter(d => d !== day);
        chip.classList.remove('selected');
      } else {
        selectedDays.push(day);
        chip.classList.add('selected');
      }
    });
  });
}

async function loadSchedules() {
  try {
    const res = await fetch('/api/schedules', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) {
      appSchedules = data.data || [];
      renderScheduleList();
      updateQuickStats();
    }
  } catch (e) {
    console.warn('[SCHED]', e);
  }
}

if (schedAction && schedDurationGroup) {
  schedAction.addEventListener('change', () => {
    if (schedAction.value === 'off') {
      schedDurationGroup.style.display = 'none';
      if (schedDuration) schedDuration.value = '';
    } else {
      schedDurationGroup.style.display = '';
    }
  });
}

// Tambah Jadwal Baru
if (scheduleForm) {
  scheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!activeDeviceId) {
      showToast('Pilih perangkat terlebih dahulu');
      return;
    }

    const timeVal = schedTime.value;
    if (!timeVal) {
      showToast('Masukkan waktu jam jadwal');
      return;
    }

    const durationVal = (schedDuration && schedDuration.value) ? parseInt(schedDuration.value) : 0;

    const payload = {
      deviceId: activeDeviceId,
      channel: parseInt(schedChannel.value),
      action: schedAction.value,
      time: timeVal,
      days: [...selectedDays].sort(),
      duration: durationVal,
      label: schedLabel.value.trim() || `Jadwal Relay #${schedChannel.value}`
    };

    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Jadwal "${payload.label}" berhasil disimpan`);
        schedLabel.value = '';
        if (schedDuration) schedDuration.value = '';
        selectedDays = [];
        daysChips.querySelectorAll('.day-chip').forEach(c => c.classList.remove('selected'));
        loadSchedules();
      } else {
        showToast(data.message || 'Gagal menambah jadwal');
      }
    } catch (err) {
      showToast('Gagal menghubungi server');
    }
  });
}

// Hitung Estimasi Next Run
function calculateNextRunText(timeStr, daysArr) {
  const [targetH, targetM] = timeStr.split(':').map(Number);
  const now = new Date();
  
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    candidate.setHours(targetH, targetM, 0, 0);

    const dayOfWeek = candidate.getDay();
    const matchesDay = (!daysArr || daysArr.length === 0 || daysArr.includes(dayOfWeek));

    if (matchesDay && candidate > now) {
      const diffMs = candidate.getTime() - now.getTime();
      const diffMin = Math.round(diffMs / 60000);
      
      let relativeTxt = '';
      if (diffMin < 60) {
        relativeTxt = `${diffMin} menit lagi`;
      } else {
        const hrs = Math.floor(diffMin / 60);
        const remMin = diffMin % 60;
        relativeTxt = remMin > 0 ? `${hrs} jam ${remMin}m lagi` : `${hrs} jam lagi`;
      }

      const dayLabel = offset === 0 ? 'Hari ini' : (offset === 1 ? 'Besok' : DAY_NAMES[dayOfWeek]);
      return `⏰ ${dayLabel}, ${timeStr} (${relativeTxt})`;
    }
  }
  return '';
}

// Render Daftar Jadwal
function renderScheduleList() {
  if (!scheduleList) return;

  let deviceSchedules = activeDeviceId
    ? appSchedules.filter(s => s.deviceId === activeDeviceId)
    : appSchedules;

  if (deviceSchedules.length === 0 && appSchedules.length > 0) {
    const uniqueDeviceIds = [...new Set(appSchedules.map(s => s.deviceId))];
    if (uniqueDeviceIds.length === 1) {
      activeDeviceId = uniqueDeviceIds[0];
      deviceSchedules = appSchedules;
    }
  }

  if (deviceSchedules.length === 0) {
    scheduleList.innerHTML = '<p class="empty-schedule-msg">Belum ada jadwal untuk perangkat ini.</p>';
    schedCountBadge.textContent = '0';
    return;
  }

  schedCountBadge.textContent = deviceSchedules.filter(s => s.enabled).length.toString();
  scheduleList.innerHTML = '';
  deviceSchedules.sort((a, b) => a.time.localeCompare(b.time));

  const dev = appDevices[activeDeviceId];

  deviceSchedules.forEach(sched => {
    const item = document.createElement('div');
    item.className = `schedule-item ${sched.enabled ? '' : 'disabled'}`;

    const relayObj = dev && dev.relays ? dev.relays.find(r => r.channel === sched.channel) : null;
    const relayCustomName = relayObj ? relayObj.name : `Relay #${sched.channel}`;

    const actionText = sched.action === 'on' ? 'ON' : sched.action === 'off' ? 'OFF' : 'Toggle';
    const daysText = sched.days && sched.days.length > 0 ? '' : 'Setiap hari';

    let dayBadgesHtml = '';
    if (sched.days && sched.days.length > 0) {
      dayBadgesHtml = DAY_NAMES.map((name, idx) => {
        const isActive = sched.days.includes(idx);
        return `<span class="schedule-day-badge ${isActive ? 'active-day' : ''}">${name}</span>`;
      }).join('');
    }

    const durationBadgeHtml = (sched.duration && sched.duration > 0)
      ? `<span class="schedule-duration-badge">⏱️ ${sched.duration}m</span>`
      : '';

    const nextRunText = sched.enabled ? calculateNextRunText(sched.time, sched.days) : '';
    const nextRunHtml = nextRunText ? `<div class="schedule-next-run">${nextRunText}</div>` : '';

    item.innerHTML = `
      <div class="schedule-item-time">${sched.time}</div>
      <div class="schedule-item-info">
        <div class="schedule-item-label">${escapeHtml(sched.label)}</div>
        <div class="schedule-item-meta">Relay #${sched.channel} (${escapeHtml(relayCustomName)}) &bull; ${actionText} ${daysText} ${durationBadgeHtml}</div>
        ${nextRunHtml}
        ${dayBadgesHtml ? `<div class="schedule-item-days">${dayBadgesHtml}</div>` : ''}
      </div>
      <div class="schedule-item-actions">
        <button class="btn-edit-schedule" title="Edit Jadwal">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <label class="toggle-mini" title="Aktifkan/Nonaktifkan">
          <input type="checkbox" ${sched.enabled ? 'checked' : ''} data-sched-id="${sched.id}">
          <span class="toggle-mini-slider"></span>
        </label>
        <button class="btn-delete-schedule" data-sched-id="${sched.id}" title="Hapus jadwal">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-2 14H7L5 6"></path>
          </svg>
        </button>
      </div>
    `;

    // Toggle on/off
    item.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
      toggleSchedule(sched.id, e.target.checked);
    });

    // Edit schedule modal
    item.querySelector('.btn-edit-schedule').addEventListener('click', () => {
      openEditScheduleModal(sched);
    });

    // Delete schedule
    item.querySelector('.btn-delete-schedule').addEventListener('click', () => {
      openCustomModal({
        title: 'Hapus Jadwal',
        bodyHtml: `<p style="font-size: 0.9rem; color: var(--text-muted);">Apakah Anda yakin ingin menghapus jadwal <strong>"${escapeHtml(sched.label)}"</strong>?</p>`,
        confirmText: 'Hapus',
        isDanger: true,
        onConfirm: async () => {
          await deleteSchedule(sched.id);
        }
      });
    });

    scheduleList.appendChild(item);
  });
}

async function toggleSchedule(scheduleId, enabled) {
  try {
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ enabled })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Jadwal ${enabled ? 'diaktifkan' : 'dinonaktifkan'}`);
      loadSchedules();
    }
  } catch (e) {
    showToast('Gagal mengubah status jadwal');
  }
}

async function deleteSchedule(scheduleId) {
  try {
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Jadwal berhasil dihapus');
      loadSchedules();
    }
  } catch (e) {
    showToast('Gagal menghapus jadwal');
  }
}

// Modal Edit Jadwal
function openEditScheduleModal(sched) {
  let editSelectedDays = Array.isArray(sched.days) ? [...sched.days] : [];
  const dev = appDevices[sched.deviceId] || appDevices[activeDeviceId];

  let relayOptionsHtml = '';
  const relayCount = (dev && dev.relays) ? dev.relays.length : 4;
  for (let i = 1; i <= relayCount; i++) {
    const r = dev && dev.relays ? dev.relays.find(x => x.channel === i) : null;
    const name = r ? r.name : `Saklar ${i}`;
    relayOptionsHtml += `<option value="${i}" ${sched.channel === i ? 'selected' : ''}>Relay #${i} - ${escapeHtml(name)}</option>`;
  }

  let daysChipsHtml = DAY_NAMES.map((name, idx) => {
    const isSel = editSelectedDays.includes(idx);
    return `<button type="button" class="day-chip ${isSel ? 'selected' : ''}" data-day="${idx}">${name}</button>`;
  }).join('');

  openCustomModal({
    title: 'Edit Jadwal',
    bodyHtml: `
      <div class="form-group">
        <label class="form-label">Relay Target</label>
        <select id="editSchedChannel" class="form-input">${relayOptionsHtml}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Aksi</label>
        <select id="editSchedAction" class="form-input">
          <option value="on" ${sched.action === 'on' ? 'selected' : ''}>Nyalakan (ON)</option>
          <option value="off" ${sched.action === 'off' ? 'selected' : ''}>Matikan (OFF)</option>
          <option value="toggle" ${sched.action === 'toggle' ? 'selected' : ''}>Toggle</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Jam Eksekusi</label>
        <input type="time" id="editSchedTime" class="form-input" value="${sched.time}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Durasi (Menit, Auto-Off)</label>
        <input type="number" id="editSchedDuration" class="form-input" min="1" max="1440" value="${sched.duration || ''}" placeholder="Kosongkan jika tanpa durasi">
      </div>
      <div class="form-group">
        <label class="form-label">Hari Eksekusi</label>
        <div class="days-chips" id="editDaysChips">${daysChipsHtml}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Label</label>
        <input type="text" id="editSchedLabel" class="form-input" value="${escapeHtml(sched.label)}" maxlength="40">
      </div>
    `,
    confirmText: 'Simpan Perubahan',
    onConfirm: async (body) => {
      const timeVal = body.querySelector('#editSchedTime').value;
      if (!timeVal) {
        showToast('Jam wajib diisi');
        return false;
      }

      const channelVal = parseInt(body.querySelector('#editSchedChannel').value);
      const actionVal = body.querySelector('#editSchedAction').value;
      const durationVal = parseInt(body.querySelector('#editSchedDuration').value) || 0;
      const labelVal = body.querySelector('#editSchedLabel').value.trim() || `Jadwal Relay #${channelVal}`;

      const updatePayload = {
        deviceId: sched.deviceId,
        channel: channelVal,
        action: actionVal,
        time: timeVal,
        days: editSelectedDays.sort(),
        duration: durationVal,
        label: labelVal
      };

      try {
        const res = await fetch(`/api/schedules/${sched.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(updatePayload)
        });
        const data = await res.json();
        if (data.success) {
          showToast('Jadwal berhasil diperbarui');
          loadSchedules();
          return true;
        } else {
          showToast(data.message || 'Gagal update jadwal');
          return false;
        }
      } catch (e) {
        showToast('Kesalahan koneksi');
        return false;
      }
    }
  });

  // Listener chip di dalam modal
  setTimeout(() => {
    const chipsContainer = document.getElementById('editDaysChips');
    if (chipsContainer) {
      chipsContainer.querySelectorAll('.day-chip').forEach(c => {
        c.addEventListener('click', () => {
          const d = parseInt(c.dataset.day);
          if (editSelectedDays.includes(d)) {
            editSelectedDays = editSelectedDays.filter(x => x !== d);
            c.classList.remove('selected');
          } else {
            editSelectedDays.push(d);
            c.classList.add('selected');
          }
        });
      });
    }
  }, 100);
}

// -------------------------------------------------------------
// Activity Log Viewer (Tab 3)
// -------------------------------------------------------------
async function loadActivityLogs() {
  if (!authToken) return;
  activityTimeline.innerHTML = '<div class="empty-timeline-msg">Memuat data aktivitas...</div>';

  try {
    const res = await fetch('/api/logs?limit=80', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      activityLogs = data.data;
      renderActivityLogs();
    } else {
      activityTimeline.innerHTML = '<div class="empty-timeline-msg">Gagal memuat log</div>';
    }
  } catch (err) {
    activityTimeline.innerHTML = '<div class="empty-timeline-msg">Gagal menghubungi server</div>';
  }
}

function formatRelativeTime(isoString) {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 30) return 'Baru saja';
    if (diffSec < 60) return `${diffSec} detik lalu`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;

    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}

function renderActivityLogs() {
  if (!activityTimeline) return;

  let filtered = activityLogs;
  if (activeLogFilter === 'control') {
    filtered = activityLogs.filter(l => l.event.startsWith('control_'));
  } else if (activeLogFilter === 'schedule') {
    filtered = activityLogs.filter(l => l.event.startsWith('schedule_'));
  } else if (activeLogFilter === 'device') {
    filtered = activityLogs.filter(l => l.event.startsWith('device_') || l.event.startsWith('auth_') || l.event.startsWith('rename_'));
  }

  if (filtered.length === 0) {
    activityTimeline.innerHTML = '<div class="empty-timeline-msg">Belum ada aktivitas tercatat untuk filter ini.</div>';
    return;
  }

  activityTimeline.innerHTML = '';
  filtered.forEach(log => {
    const item = document.createElement('div');
    item.className = 'timeline-item';

    let iconClass = 'control';
    let iconChar = '⚡';
    let titleText = log.event;

    if (log.event.startsWith('control_')) {
      iconClass = 'control';
      iconChar = '⚡';
      titleText = 'Kontrol Saklar';
    } else if (log.event.startsWith('schedule_')) {
      iconClass = 'schedule';
      iconChar = '⏰';
      titleText = 'Jadwal Otomatis';
    } else if (log.event.startsWith('device_')) {
      iconClass = 'device';
      iconChar = '🌐';
      titleText = 'Sistem Hardware';
    } else if (log.event.startsWith('auth_')) {
      iconClass = 'auth';
      iconChar = '🔒';
      titleText = 'Keamanan Akun';
    }

    let detailText = log.details || '';
    try {
      if (detailText.startsWith('{') && detailText.endsWith('}')) {
        const obj = JSON.parse(detailText);
        if (obj.channel !== undefined) {
          detailText = `Saklar #${obj.channel} -> ${obj.state ? 'MENYALA' : 'MATI'}${obj.duration ? ` (${obj.duration}s)` : ''}`;
        }
      }
    } catch {}

    item.innerHTML = `
      <div class="timeline-icon-box ${iconClass}">${iconChar}</div>
      <div class="timeline-content">
        <div class="timeline-header-row">
          <span class="timeline-event-name">${titleText}</span>
          <span class="timeline-time">${formatRelativeTime(log.timestamp)}</span>
        </div>
        <div class="timeline-desc">${escapeHtml(detailText || log.event)}</div>
      </div>
    `;

    activityTimeline.appendChild(item);
  });
}

// Log Filter Pill Clicks
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeLogFilter = pill.dataset.filter;
    renderActivityLogs();
  });
});

if (btnRefreshLogs) {
  btnRefreshLogs.addEventListener('click', () => {
    loadActivityLogs();
    showToast('Log aktivitas disegarkan');
  });
}

// -------------------------------------------------------------
// Settings Tab: Kustomisasi Nama Saklar & Sinkronisasi
// -------------------------------------------------------------
function renderRelayNamingList() {
  if (!relayNamingList) return;
  const dev = appDevices[activeDeviceId];

  if (!dev || !dev.relays || dev.relays.length === 0) {
    relayNamingList.innerHTML = '<p style="color: var(--text-subtle); font-size: 0.8rem;">Tidak ada relay untuk dikustomisasi.</p>';
    return;
  }

  relayNamingList.innerHTML = '';
  dev.relays.forEach(r => {
    const row = document.createElement('div');
    row.className = 'relay-naming-item';
    row.innerHTML = `
      <div class="relay-naming-info">
        <span style="font-weight: 700; color: var(--primary-glow); font-size: 0.85rem;">#${r.channel}</span>
        <span style="font-size: 0.88rem; font-weight: 600;">${escapeHtml(r.name)}</span>
      </div>
      <button class="btn-action-secondary" type="button" data-channel="${r.channel}">
        <span>Ubah Nama</span>
      </button>
    `;

    row.querySelector('button').addEventListener('click', () => {
      promptRenameRelayModal(dev.deviceId, r.channel, r.name);
    });

    relayNamingList.appendChild(row);
  });
}

// Tombol Sinkronisasi JSON & SQLite
if (btnSyncJson) {
  btnSyncJson.addEventListener('click', async () => {
    try {
      btnSyncJson.disabled = true;
      btnSyncJson.innerHTML = '<span>Sinkronisasi...</span>';

      const res = await fetch('/api/schedules/sync-json', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message);
        loadSchedules();
      } else {
        showToast(data.message || 'Gagal sinkronisasi');
      }
    } catch (e) {
      showToast('Gagal sinkronisasi');
    } finally {
      btnSyncJson.disabled = false;
      btnSyncJson.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
        </svg>
        <span>Sinkronkan</span>
      `;
    }
  });
}

// -------------------------------------------------------------
// PWA Installation
// -------------------------------------------------------------
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installAppContainer) installAppContainer.classList.remove('hidden');
});

if (btnInstallApp) {
  btnInstallApp.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (installAppContainer) installAppContainer.classList.add('hidden');
    }
  });
}

window.addEventListener('appinstalled', () => {
  if (installAppContainer) installAppContainer.classList.add('hidden');
  showToast('Aplikasi berhasil dipasang di layar utama!');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.error('[SW]', err));
  });
}

// =============================================================
// DYNAMIC PIN MANAGER & SENSOR COMPONENTS (Zero-Code Node)
// =============================================================

// DOM Elements: Pin Manager Modal
const modalPinManager = document.getElementById('modalPinManager');
const btnOpenPinManager = document.getElementById('btnOpenPinManager');
const btnClosePinManager = document.getElementById('btnClosePinManager');
const btnQuickAddPin = document.getElementById('btnQuickAddPin');
const pinTabBtns = document.querySelectorAll('.pin-tab-btn');
const pinTabContents = document.querySelectorAll('.pin-tab-content');
const pinManagerDeviceLabel = document.getElementById('pinManagerDeviceLabel');
const countActiveComponents = document.getElementById('countActiveComponents');
const activePinsList = document.getElementById('activePinsList');
const formAddPin = document.getElementById('formAddPin');
const pinSelect = document.getElementById('pinSelect');
const pinDriverType = document.getElementById('pinDriverType');
const pinCompName = document.getElementById('pinCompName');
const pinCompUnit = document.getElementById('pinCompUnit');
const pinReadInterval = document.getElementById('pinReadInterval');
const pinActiveLow = document.getElementById('pinActiveLow');
const btnTriggerI2cScan = document.getElementById('btnTriggerI2cScan');
const i2cScanStatus = document.getElementById('i2cScanStatus');
const i2cResultsContainer = document.getElementById('i2cResultsContainer');
const componentsSection = document.getElementById('componentsSection');
const componentsGrid = document.getElementById('componentsGrid');

// Buka Modal Pin Manager
function openPinManager(initialTab = 'tabListPins') {
  if (!activeDeviceId) {
    showToast('Pilih perangkat IoT terlebih dahulu');
    return;
  }
  const dev = appDevices[activeDeviceId];
  if (pinManagerDeviceLabel) {
    pinManagerDeviceLabel.textContent = `Perangkat: ${dev ? (dev.name || activeDeviceId) : activeDeviceId} (${activeDeviceId})`;
  }
  switchPinTab(initialTab);
  renderActivePinsList();
  if (modalPinManager) modalPinManager.classList.remove('hidden');
}

// Tutup Modal Pin Manager
function closePinManager() {
  if (modalPinManager) modalPinManager.classList.add('hidden');
}

// Switch Tab di dalam Modal
function switchPinTab(tabId) {
  if (pinTabBtns) {
    pinTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.pinTab === tabId);
    });
  }
  if (pinTabContents) {
    pinTabContents.forEach(content => {
      content.classList.toggle('active', content.id === tabId);
    });
  }
  if (tabId === 'tabListPins') {
    renderActivePinsList();
  }
}

// Event Listeners Pin Modal Controls
if (btnOpenPinManager) {
  btnOpenPinManager.addEventListener('click', () => openPinManager('tabListPins'));
}
if (btnQuickAddPin) {
  btnQuickAddPin.addEventListener('click', () => openPinManager('tabAddPin'));
}
if (btnClosePinManager) {
  btnClosePinManager.addEventListener('click', closePinManager);
}
if (modalPinManager) {
  modalPinManager.addEventListener('click', (e) => {
    if (e.target === modalPinManager) closePinManager();
  });
}
if (pinTabBtns) {
  pinTabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchPinTab(btn.dataset.pinTab));
  });
}

// Auto-fill Unit & Nama default saat ganti tipe sensor
if (pinDriverType) {
  pinDriverType.addEventListener('change', () => {
    const val = pinDriverType.value;
    if (val === 'dht11' || val === 'dht22') {
      pinCompName.value = val === 'dht11' ? 'DHT11 Suhu' : 'DHT22 Suhu Ruangan';
      pinCompUnit.value = '°C';
      pinReadInterval.value = '5';
    } else if (val === 'ds18b20') {
      pinCompName.value = 'DS18B20 Suhu Air';
      pinCompUnit.value = '°C';
      pinReadInterval.value = '5';
    } else if (val === 'analog') {
      pinCompName.value = 'Sensor Analog A0';
      pinCompUnit.value = '';
      pinReadInterval.value = '3';
    } else if (val === 'digital_in') {
      pinCompName.value = 'PIR Sensor Gerak';
      pinCompUnit.value = '';
      pinReadInterval.value = '1';
    } else if (val === 'switch') {
      pinCompName.value = 'Saklar Fisik';
      pinCompUnit.value = '';
      pinReadInterval.value = '1';
    }
  });
}

// Render Daftar Komponen Aktif di Modal
function renderActivePinsList() {
  if (!activePinsList) return;
  const dev = appDevices[activeDeviceId];
  const comps = (dev && Array.isArray(dev.components)) ? dev.components : [];

  if (countActiveComponents) {
    countActiveComponents.textContent = comps.length;
  }

  if (comps.length === 0) {
    activePinsList.innerHTML = `
      <div style="text-align: center; padding: 28px 12px; color: var(--text-subtle); background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 10px;">
        <div style="font-size: 1.8rem; margin-bottom: 8px;">🔌</div>
        <p style="margin: 0; font-size: 0.84rem; font-weight: 600; color: var(--text-main);">Belum ada sensor atau saklar yang terpasang</p>
        <p style="margin: 4px 0 12px 0; font-size: 0.75rem;">Tambahkan sensor tanpa perlu coding file C++.</p>
        <button type="button" class="btn-primary-action" onclick="switchPinTab('tabAddPin')" style="display:inline-block; font-size: 0.78rem; padding: 6px 14px;">
          ➕ Tambah Pin Sekarang
        </button>
      </div>
    `;
    return;
  }

  activePinsList.innerHTML = '';
  comps.forEach(c => {
    const item = document.createElement('div');
    item.className = 'pin-item-card';

    let icon = '📊';
    const driver = c.driver || c.type || '';
    if (driver === 'switch') icon = '🔌';
    else if (driver === 'digital_in' || driver === 'indicator') icon = '🚨';
    else if (driver.startsWith('dht') || driver === 'ds18b20') icon = '🌡️';
    else if (driver === 'analog') icon = '📈';
    else if (driver === 'i2c') icon = '💡';

    let pinLabel = (c.pin >= 0) ? `Pin GPIO ${c.pin}` : 'Virtual';
    if (c.pin === 17) pinLabel = 'Pin A0 (ADC)';
    else if (c.pin === 14) pinLabel = 'Pin D5 (GPIO14)';
    else if (c.pin === 12) pinLabel = 'Pin D6 (GPIO12)';
    else if (c.pin === 13) pinLabel = 'Pin D7 (GPIO13)';
    else if (c.pin === 4) pinLabel = 'Pin D2 (GPIO4)';
    else if (c.pin === 5) pinLabel = 'Pin D1 (GPIO5)';
    else if (c.pin === 16) pinLabel = 'Pin D0 (GPIO16)';
    else if (c.pin === 0) pinLabel = 'Pin D3 (GPIO0)';
    else if (c.pin === 2) pinLabel = 'Pin D4 (GPIO2)';

    let displayVal = c.value || '0';
    if (c.type === 'switch') {
      displayVal = (c.value === 'true' || c.value === '1') ? 'ON' : 'OFF';
    } else if (driver === 'digital_in') {
      displayVal = (c.value === '1' || c.value === 'true') ? 'AKTIF' : 'NORMAL';
    } else if (c.unit) {
      displayVal += ' ' + c.unit;
    }

    item.innerHTML = `
      <div class="pin-item-left">
        <span class="pin-badge ${c.pin === 17 ? 'pin-analog' : ''}">${pinLabel}</span>
        <div class="pin-item-info">
          <span class="pin-item-name">${icon} ${escapeHtml(c.name || c.id)}</span>
          <span class="pin-item-type">Tipe: ${driver.toUpperCase()} | ID: ${escapeHtml(c.id)}</span>
        </div>
      </div>
      <div class="pin-item-right">
        <span class="pin-live-val">${escapeHtml(displayVal)}</span>
        <button type="button" class="btn-delete-pin" title="Hapus Pin" data-comp-id="${c.id}">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    const btnDel = item.querySelector('.btn-delete-pin');
    btnDel.addEventListener('click', () => {
      confirmDeleteComponent(c.id, c.name || c.id);
    });

    activePinsList.appendChild(item);
  });
}

// Konfirmasi & Eksekusi Hapus Komponen Pin
function confirmDeleteComponent(compId, compName) {
  openCustomModal({
    title: 'Hapus Pin / Sensor',
    bodyHtml: `<p style="font-size: 0.9rem; color: var(--text-muted);">Apakah Anda yakin ingin menghapus komponen <b>"${escapeHtml(compName)}"</b>?<br><br>Konfigurasi akan dihapus dari server dan pin pada mikrokontroler akan dilepaskan.</p>`,
    confirmText: 'Ya, Hapus',
    isDanger: true,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/devices/${activeDeviceId}/components/${encodeURIComponent(compId)}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Komponen "${compName}" berhasil dihapus`);
          if (data.data) {
            appDevices[activeDeviceId] = data.data;
          }
          renderActivePinsList();
          renderDashboard();
        } else {
          showToast(data.message || 'Gagal menghapus komponen');
        }
      } catch (err) {
        showToast('Error saat menghubungi server');
      }
    }
  });
}

// Submit Form Tambah Pin Baru
if (formAddPin) {
  formAddPin.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeDeviceId) return;

    const pinVal = pinSelect.value;
    const driverVal = pinDriverType.value;
    const nameVal = pinCompName.value.trim() || `Sensor Pin ${pinVal}`;
    let unitVal = pinCompUnit.value.trim();
    const intervalSec = parseInt(pinReadInterval.value) || 5;
    const activeLowVal = pinActiveLow.value === 'true';

    let compType = 'sensor';
    let i2cAddr = 0;
    if (driverVal === 'switch') {
      compType = 'switch';
    } else if (driverVal === 'dimmer') {
      compType = 'dimmer';
      if (!unitVal) unitVal = '%';
    } else if (driverVal === 'digital_in') {
      compType = 'indicator';
    } else if (driverVal === 'bmp280') {
      compType = 'sensor';
      i2cAddr = 0x76;
      if (!unitVal) unitVal = '°C';
    } else if (driverVal === 'bh1750') {
      compType = 'sensor';
      i2cAddr = 0x23;
      if (!unitVal) unitVal = 'Lux';
    } else if (driverVal === 'sht30') {
      compType = 'sensor';
      i2cAddr = 0x44;
      if (!unitVal) unitVal = '°C';
    } else if (driverVal === 'aht10') {
      compType = 'sensor';
      i2cAddr = 0x38;
      if (!unitVal) unitVal = '°C';
    }

    const compId = (i2cAddr > 0) ? `i2c_${driverVal}_0x${i2cAddr.toString(16)}` : `pin_${pinVal}_${driverVal}`;

    const payload = {
      id: compId,
      componentId: compId,
      name: nameVal,
      type: compType,
      driver: driverVal,
      pin: (i2cAddr > 0) ? -1 : parseInt(pinVal),
      i2cAddr: i2cAddr,
      unit: unitVal,
      activeLow: activeLowVal,
      pullup: true,
      readIntervalMs: intervalSec * 1000
    };

    const btnSubmit = document.getElementById('btnSavePinConfig');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Menyimpan...';
    }

    try {
      const res = await fetch(`/api/devices/${activeDeviceId}/components`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        showToast(`✅ Sensor "${nameVal}" berhasil dikonfigurasi!`);
        if (data.data) {
          appDevices[activeDeviceId] = data.data;
        }
        formAddPin.reset();
        switchPinTab('tabListPins');
        renderDashboard();
      } else {
        showToast(data.message || 'Gagal menyimpan konfigurasi');
      }
    } catch (err) {
      showToast('Gagal menghubungi server');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = '💾 Simpan & Terapkan ke Alat';
      }
    }
  });
}

// Trigger Pemindaian I2C ke Hardware
if (btnTriggerI2cScan) {
  btnTriggerI2cScan.addEventListener('click', async () => {
    if (!activeDeviceId) return;
    const dev = appDevices[activeDeviceId];
    if (!dev || !dev.isOnline) {
      showToast('Perangkat sedang offline, tidak dapat memindai I2C');
      return;
    }

    btnTriggerI2cScan.classList.add('scanning');
    btnTriggerI2cScan.disabled = true;
    if (i2cScanStatus) i2cScanStatus.textContent = 'Mengirim sinyal scan ke hardware...';
    if (i2cResultsContainer) {
      i2cResultsContainer.innerHTML = `
        <div style="text-align:center; padding: 24px 0; color: var(--text-muted);">
          <div class="pulse-ring" style="display:inline-block; font-size: 2rem; margin-bottom: 8px;">📡</div>
          <p style="font-size: 0.82rem;">Memindai jalur I2C bus (alamat 0x01 s/d 0x7F)...</p>
        </div>
      `;
    }

    try {
      const res = await fetch(`/api/devices/${activeDeviceId}/scan-i2c`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.message || 'Gagal memulai pemindaian I2C');
        btnTriggerI2cScan.classList.remove('scanning');
        btnTriggerI2cScan.disabled = false;
        if (i2cScanStatus) i2cScanStatus.textContent = 'Gagal memindai';
      } else {
        if (i2cScanStatus) i2cScanStatus.textContent = 'Menunggu balasan dari Wemos...';
      }
    } catch (err) {
      showToast('Gagal menghubungi server');
      btnTriggerI2cScan.classList.remove('scanning');
      btnTriggerI2cScan.disabled = false;
      if (i2cScanStatus) i2cScanStatus.textContent = 'Error koneksi';
    }
  });
}

// Render Hasil Pemindaian I2C
function renderI2cScanResults(devices = []) {
  if (btnTriggerI2cScan) {
    btnTriggerI2cScan.classList.remove('scanning');
    btnTriggerI2cScan.disabled = false;
  }
  if (i2cScanStatus) {
    i2cScanStatus.textContent = `Ditemukan ${devices.length} modul I2C`;
  }
  if (!i2cResultsContainer) return;

  if (devices.length === 0) {
    i2cResultsContainer.innerHTML = `
      <div style="text-align:center; padding: 24px 12px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 10px;">
        <span style="font-size: 1.6rem; display:block; margin-bottom: 6px;">🔌</span>
        <p style="margin: 0; font-size: 0.84rem; font-weight: 600; color: var(--text-main);">Tidak ada perangkat I2C yang terdeteksi</p>
        <p style="margin: 4px 0 0 0; font-size: 0.74rem; color: var(--text-subtle);">Pastikan pin SDA & SCL terhubung dengan benar dan modul mendapatkan daya (3.3V/5V).</p>
      </div>
    `;
    return;
  }

  i2cResultsContainer.innerHTML = '';
  devices.forEach(d => {
    const card = document.createElement('div');
    card.className = 'i2c-device-card';
    card.innerHTML = `
      <div class="i2c-device-left">
        <span class="i2c-addr-badge">${escapeHtml(d.address)}</span>
        <div class="i2c-dev-info">
          <span class="i2c-dev-name">${escapeHtml(d.name)}</span>
          <span class="i2c-dev-category">${escapeHtml(d.category)}</span>
        </div>
      </div>
      <button type="button" class="btn-add-i2c-quick" data-addr="${d.address}" data-name="${escapeHtml(d.name)}">
        + Tambah Sensor Ini
      </button>
    `;

    const btnAdd = card.querySelector('.btn-add-i2c-quick');
    btnAdd.addEventListener('click', () => {
      quickAddI2cSensor(d);
    });

    i2cResultsContainer.appendChild(card);
  });
}

// Tambah Cepat Sensor I2C ke Dashboard
async function quickAddI2cSensor(deviceInfo) {
  if (!activeDeviceId) return;

  const addr = deviceInfo.address || '0x00';
  const name = deviceInfo.name || 'Sensor I2C';
  const numAddr = typeof addr === 'number' ? addr : parseInt(addr, 16);
  const hexStr = !isNaN(numAddr) ? `0x${numAddr.toString(16)}` : addr;

  let driver = 'bmp280';
  let unit = '°C';

  if (name.includes('BMP') || name.includes('BME') || numAddr === 0x76 || numAddr === 0x77) {
    driver = 'bmp280';
    unit = '°C';
  } else if (name.includes('BH1750') || numAddr === 0x23 || numAddr === 0x5c) {
    driver = 'bh1750';
    unit = 'Lux';
  } else if (name.includes('SHT') || numAddr === 0x44 || numAddr === 0x45) {
    driver = 'sht30';
    unit = '°C';
  } else if (name.includes('AHT') || numAddr === 0x38) {
    driver = 'aht10';
    unit = '°C';
  } else if (name.includes('ADS') || numAddr === 0x48 || numAddr === 0x49) {
    driver = 'analog';
    unit = 'V';
  }

  const compId = `i2c_${driver}_${hexStr.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;

  const payload = {
    id: compId,
    componentId: compId,
    name: name,
    type: 'sensor',
    driver: driver,
    pin: -1,
    i2cAddr: numAddr,
    unit: unit,
    readIntervalMs: 5000,
    config: { address: addr, i2cAddr: numAddr }
  };

  try {
    const res = await fetch(`/api/devices/${activeDeviceId}/components`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Modul I2C "${name}" berhasil ditambahkan ke Dashboard!`);
      if (data.data) {
        appDevices[activeDeviceId] = data.data;
      }
      renderDashboard();
      switchPinTab('tabListPins');
    } else {
      showToast(data.message || 'Gagal menambahkan modul');
    }
  } catch (err) {
    showToast('Gagal menghubungi server');
  }
}

// Render Sensor Dinamis di Dashboard Utama Tab Kontrol
function renderComponentsSection(dev) {
  if (!componentsGrid) return;

  if (!dev) {
    componentsGrid.innerHTML = '';
    return;
  }

  // Filter komponen agar switch relay_1 s/d relay_4 tidak dobel dengan relaysGrid
  const comps = (dev.components || []).filter(c => !(c.type === 'switch' && /^relay_\d+$/i.test(c.id)));

  if (comps.length === 0) {
    componentsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 22px; text-align: center; color: var(--text-subtle); background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 12px;">
        <div style="font-size: 1.6rem; margin-bottom: 6px;">🔌</div>
        <p style="margin: 0; font-size: 0.82rem; font-weight: 600; color: var(--text-main);">Belum ada sensor atau modul dinamis pada perangkat ini</p>
        <p style="margin: 4px 0 12px 0; font-size: 0.74rem;">Pasang DHT, DS18B20, sensor analog, PIR atau modul I2C dan kelola langsung dari sini.</p>
        <button type="button" class="btn-manage-pins" onclick="openPinManager('tabAddPin')" style="display:inline-flex;">
          ➕ Atur Pin & Sensor Sekarang
        </button>
      </div>
    `;
    return;
  }

  componentsGrid.innerHTML = '';
  comps.forEach(c => {
    const card = document.createElement('div');
    card.className = 'component-widget-card';
    card.id = `comp-widget-${c.id}`;

    const driver = c.driver || c.type || '';
    let icon = '📊';
    if (driver === 'switch') icon = '🔌';
    else if (driver === 'dimmer' || c.type === 'dimmer') icon = '💡';
    else if (driver === 'digital_in' || driver === 'indicator') icon = '🚨';
    else if (driver.startsWith('dht') || driver === 'ds18b20') icon = '🌡️';
    else if (driver === 'bmp280') icon = '🌡️';
    else if (driver === 'bh1750') icon = '☀️';
    else if (driver === 'sht30' || driver === 'aht10') icon = '🌡️';
    else if (driver === 'analog') icon = '📈';
    else if (driver === 'i2c') icon = '💡';

    let pinTag = (c.pin >= 0) ? `Pin ${c.pin}` : 'I2C/Virtual';
    if (c.pin === 17) pinTag = 'Pin A0';
    else if (c.pin === 14) pinTag = 'Pin D5';
    else if (c.pin === 12) pinTag = 'Pin D6';
    else if (c.pin === 13) pinTag = 'Pin D7';

    let bodyHtml = '';
    if (c.type === 'switch') {
      const isOn = c.value === 'true' || c.value === '1';
      bodyHtml = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin: 8px 0;">
          <span style="font-size: 0.85rem; font-weight: 700; color: ${isOn ? 'var(--primary-glow)' : 'var(--text-muted)'};">
            ${isOn ? 'MENYALA' : 'MATI'}
          </span>
          <label class="switch-control">
            <input type="checkbox" ${isOn ? 'checked' : ''} data-comp-id="${c.id}">
            <span class="slider"></span>
          </label>
        </div>
      `;
    } else if (c.type === 'dimmer' || driver === 'dimmer') {
      const dimVal = Math.min(Math.max(parseInt(c.value) || 0, 0), 100);
      bodyHtml = `
        <div style="margin: 10px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 0.8rem; color: var(--text-muted);">Kecerahan / PWM:</span>
            <span id="dim-val-text-${c.id}" style="font-size: 0.9rem; font-weight: 700; color: var(--primary-glow);">${dimVal}%</span>
          </div>
          <input type="range" class="dimmer-range-slider" min="0" max="100" value="${dimVal}" data-comp-id="${c.id}" style="width: 100%; cursor: pointer; accent-color: var(--primary, #3b82f6);">
        </div>
      `;
    } else if (c.type === 'indicator' || driver === 'digital_in') {
      const isActive = c.value === '1' || c.value === 'true';
      bodyHtml = `
        <div style="margin: 8px 0;">
          <span class="indicator-pill ${isActive ? 'active' : 'inactive'}">
            ${isActive ? '🚨 Terdeteksi' : '✅ Aman / Normal'}
          </span>
        </div>
      `;
    } else {
      // Sensor angka / nilai
      bodyHtml = `
        <div class="comp-val-display">
          <span class="comp-val-number">${escapeHtml(c.value || '0')}</span>
          <span class="comp-val-unit">${escapeHtml(c.unit || '')}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="comp-header">
        <div class="comp-meta">
          <span class="comp-icon">${icon}</span>
          <div class="comp-title-wrap">
            <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
            <span class="comp-pin-tag">${pinTag}</span>
          </div>
        </div>
      </div>
      ${bodyHtml}
      <div class="comp-footer">
        <span>Tipe: ${driver.toUpperCase()}</span>
        <button type="button" class="btn-icon-xs" title="Kelola Komponen" onclick="openPinManager('tabListPins')">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>
    `;

    // Handler jika komponen bertipe switch
    const switchInput = card.querySelector('input[type="checkbox"]');
    if (switchInput) {
      switchInput.addEventListener('change', (e) => {
        controlModularSwitch(c.id, e.target.checked);
      });
    }

    // Handler jika komponen bertipe dimmer
    const dimmerInput = card.querySelector('input.dimmer-range-slider');
    if (dimmerInput) {
      dimmerInput.addEventListener('input', (e) => {
        const valText = card.querySelector(`#dim-val-text-${c.id}`);
        if (valText) valText.textContent = `${e.target.value}%`;
      });
      dimmerInput.addEventListener('change', (e) => {
        controlModularDimmer(c.id, parseInt(e.target.value) || 0);
      });
    }

    componentsGrid.appendChild(card);
  });
}

// Kontrol Komponen Switch Modular
function controlModularSwitch(componentId, state) {
  if (navigator.vibrate) navigator.vibrate(30);

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      action: 'set_component',
      target: activeDeviceId,
      componentId: componentId,
      value: state ? 'true' : 'false',
      duration: 0
    }));
  } else {
    // REST API fallback
    fetch(`/api/devices/${activeDeviceId}/components/${encodeURIComponent(componentId)}/control`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ value: state ? 'true' : 'false' })
    }).catch(() => showToast('Gagal mengirim perintah'));
  }
}

// Kontrol Komponen Dimmer / PWM Modular
let dimmerDebounceTimers = {};
function controlModularDimmer(componentId, value) {
  if (navigator.vibrate) navigator.vibrate(20);

  const numVal = Math.min(Math.max(parseInt(value) || 0, 0), 100);

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      action: 'set_component',
      target: activeDeviceId,
      componentId: componentId,
      value: numVal,
      duration: 0
    }));
  } else {
    clearTimeout(dimmerDebounceTimers[componentId]);
    dimmerDebounceTimers[componentId] = setTimeout(() => {
      fetch(`/api/devices/${activeDeviceId}/components/${encodeURIComponent(componentId)}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ value: numVal })
      }).catch(() => showToast('Gagal mengirim perintah dimmer'));
    }, 150);
  }
}

// Handler Laporan Progres OTA Update
function handleOtaProgressUpdate(msg) {
  const percent = msg.percent || 0;
  if (percent >= 100) {
    showToast(`✅ Unduh firmware selesai (100%)! ${msg.deviceId} sedang reboot...`);
  } else {
    showToast(`🔄 OTA Update ${msg.deviceId}: ${percent}% (${Math.round((msg.current || 0) / 1024)} KB / ${Math.round((msg.total || 0) / 1024)} KB)`);
  }
}

// Inisialisasi awal saat load
checkAuthSession();
