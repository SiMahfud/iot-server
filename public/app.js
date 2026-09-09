// ==========================================
// AgyGateway Hub - Universal IoT Controller App v3.5
// Pair Frontend for AgyGatewayClient (ESP8266 & ESP32)
// Supports Polymorphic Components, Zero-Code Dynamic Pins,
// Remote I2C Scanner, Live OTA, and USB Web Serial Flasher
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
let currentCompFilter = 'all';

// Active component for modal actions
let activeTimerComponentId = null;

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
const statActiveDevices = document.getElementById('statActiveDevices') || document.getElementById('statActiveRelays');
const statActiveActuators = document.getElementById('statActiveActuators');
const statActiveSensors = document.getElementById('statActiveSensors');
const wifiRssi = document.getElementById('wifiRssi');
const pingDisplay = document.getElementById('pingDisplay');

// Device Bar Elements
const deviceSelect = document.getElementById('deviceSelect');
const deviceChipBadge = document.getElementById('deviceChipBadge');
const deviceIdBadge = document.getElementById('deviceIdBadge');
const deviceName = document.getElementById('deviceName');
const uptimeDisplay = document.getElementById('uptimeDisplay');
const btnRenameDevice = document.getElementById('btnRenameDevice');
const btnOpenAddDevice = document.getElementById('btnOpenAddDevice');
const btnDeleteDevice = document.getElementById('btnDeleteDevice');

// Controls & Master Switch Section
const masterSwitchSection = document.getElementById('masterSwitchSection');
const btnAllOn = document.getElementById('btnAllOn');
const btnAllOff = document.getElementById('btnAllOff');
const componentsGrid = document.getElementById('componentsGrid');
const relaysGrid = document.getElementById('relaysGrid');

// Schedules & Timer Elements
const subTabJadwalBtn = document.getElementById('subTabJadwalBtn');
const subTabTimerBtn = document.getElementById('subTabTimerBtn');
const subViewJadwal = document.getElementById('subViewJadwal');
const subViewTimer = document.getElementById('subViewTimer');
const scheduleForm = document.getElementById('scheduleForm');
const schedDevice = document.getElementById('schedDevice');
const schedComponent = document.getElementById('schedComponent');
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

// Activity Log Elements
const activityTimeline = document.getElementById('activityTimeline');
const btnRefreshLogs = document.getElementById('btnRefreshLogs');

// Settings Elements
const btnSyncJson = document.getElementById('btnSyncJson');
const btnChangePassword = document.getElementById('btnChangePassword');
const relayNamingList = document.getElementById('relayNamingList');
const installAppContainer = document.getElementById('installAppContainer');
const btnInstallApp = document.getElementById('btnInstallApp');

// Universal Custom Modal & Dialog
const customModalBackdrop = document.getElementById('customModalBackdrop');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const btnModalClose = document.getElementById('btnModalClose');
const btnModalCancel = document.getElementById('btnModalCancel');
const btnModalConfirm = document.getElementById('btnModalConfirm');
const toastNotification = document.getElementById('toastNotification');
const toastMessage = document.getElementById('toastMessage');

// Modal: Add Device Wizard
const modalAddDevice = document.getElementById('modalAddDevice');
const btnCloseAddDevice = document.getElementById('btnCloseAddDevice');
const formRegisterDevice = document.getElementById('formRegisterDevice');
const btnCopySketch = document.getElementById('btnCopySketch');

// Modal: Telemetry Graph
const modalTelemetryGraph = document.getElementById('modalTelemetryGraph');
const btnCloseGraphModal = document.getElementById('btnCloseGraphModal');

// Modal: Timer Countdown
const modalTimerCountdown = document.getElementById('modalTimerCountdown');
const btnCloseTimerModal = document.getElementById('btnCloseTimerModal');
const btnCancelTimerSubmit = document.getElementById('btnCancelTimerSubmit');
const btnStartTimerSubmit = document.getElementById('btnStartTimerSubmit');

// Modal: Dynamic Pin & I2C Manager
const modalPinManager = document.getElementById('modalPinManager');
const btnOpenPinManager = document.getElementById('btnOpenPinManager');
const btnClosePinManager = document.getElementById('btnClosePinManager');
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

// Tools: Remote OTA
const subTabOtaBtn = document.getElementById('subTabOtaBtn');
const subViewOta = document.getElementById('subViewOta');
const otaTargetDevice = document.getElementById('otaTargetDevice');
const otaFirmwareSelect = document.getElementById('otaFirmwareSelect');
const otaCustomUrl = document.getElementById('otaCustomUrl');
const btnStartOta = document.getElementById('btnStartOta');
const otaLiveProgressContainer = document.getElementById('otaLiveProgressContainer');
const otaProgressLabel = document.getElementById('otaProgressLabel');
const otaProgressPercent = document.getElementById('otaProgressPercent');
const otaProgressBar = document.getElementById('otaProgressBar');
const otaByteDetails = document.getElementById('otaByteDetails');

// State: Scheduler Form
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
let selectedDays = [];
let modalConfirmCallback = null;

// -------------------------------------------------------------
// Helper Functions: Formatting & UI Utils
// -------------------------------------------------------------
function formatUptime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00:00';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = n => String(n).padStart(2, '0');
  if (d > 0) return `${d}h ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatCountdown(seconds) {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg, duration = 3000) {
  if (!toastNotification || !toastMessage) return;
  toastMessage.textContent = msg;
  toastNotification.classList.remove('hidden');
  toastNotification.classList.add('show');
  clearTimeout(toastNotification._timer);
  toastNotification._timer = setTimeout(() => {
    toastNotification.classList.remove('show');
    setTimeout(() => toastNotification.classList.add('hidden'), 300);
  }, duration);
}

// -------------------------------------------------------------
// Universal Custom Modal System
// -------------------------------------------------------------
function openCustomModal({ title, bodyHtml, confirmText = 'Simpan', cancelText = 'Batal', isDanger = false, onConfirm }) {
  if (!customModalBackdrop) return;
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

  const firstInput = modalBody.querySelector('input');
  if (firstInput) setTimeout(() => firstInput.focus(), 100);
}

function closeCustomModal() {
  if (customModalBackdrop) {
    customModalBackdrop.classList.add('hidden');
    modalConfirmCallback = null;
  }
}

if (btnModalClose) btnModalClose.addEventListener('click', closeCustomModal);
if (btnModalCancel) btnModalCancel.addEventListener('click', closeCustomModal);
if (btnModalConfirm) {
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
}

function showCustomConfirm(title, messageHtml, onConfirmed) {
  openCustomModal({
    title: title,
    bodyHtml: messageHtml,
    confirmText: 'Ya, Lanjutkan',
    cancelText: 'Batal',
    isDanger: true,
    onConfirm: async () => {
      if (typeof onConfirmed === 'function') await onConfirmed();
    }
  });
}

// -------------------------------------------------------------
// Navigation Tabs & Routing
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
    const isActive = view.id === tabId;
    view.classList.toggle('hidden', !isActive);
    view.classList.toggle('active', isActive);
  });

  if (tabId === 'tabAktivitas') {
    loadActivityLogs();
  } else if (tabId === 'tabJadwal') {
    renderScheduleList();
    renderTimerSection();
  } else if (tabId === 'tabPengaturan') {
    renderRelayNamingList();
  } else if (tabId === 'tabTools') {
    if (typeof checkWebSerialSupport === 'function') checkWebSerialSupport();
  }
}

// -------------------------------------------------------------
// REST API Helper
// -------------------------------------------------------------
async function apiRequest(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    logout();
    throw new Error('Sesi autentikasi kedaluwarsa');
  }
  return res.json();
}

// -------------------------------------------------------------
// Authentication Flow
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
  }
}

function showLoginUI() {
  loginScreen.classList.remove('hidden');
  dashboardApp.classList.add('hidden');
}

function showDashboardUI() {
  loginScreen.classList.add('hidden');
  dashboardApp.classList.remove('hidden');
}

function logout() {
  authToken = null;
  localStorage.removeItem(TOKEN_KEY);
  if (socket) {
    socket.close();
    socket = null;
  }
  showLoginUI();
  showToast('Anda telah keluar');
}

if (btnLogout) btnLogout.addEventListener('click', logout);

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorMsg.classList.add('hidden');

    const u = loginUser.value.trim();
    const p = loginPass.value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();

      if (data.success && data.token) {
        authToken = data.token;
        localStorage.setItem(TOKEN_KEY, authToken);
        showToast('Login berhasil!');
        showDashboardUI();
        connectWebSocket();
        loadSchedules();
      } else {
        loginErrorMsg.textContent = data.message || 'Login gagal';
        loginErrorMsg.classList.remove('hidden');
      }
    } catch (err) {
      loginErrorMsg.textContent = 'Gagal menghubungi server';
      loginErrorMsg.classList.remove('hidden');
    }
  });
}

if (btnTogglePass) {
  btnTogglePass.addEventListener('click', () => {
    loginPass.type = loginPass.type === 'password' ? 'text' : 'password';
  });
}

// -------------------------------------------------------------
// Real-Time WebSocket Connection (WSS / WS Adaptive)
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
    loadServerFirmwaresForOta();
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
        renderScheduleList();
        updateQuickStats();
      } else if (msg.type === 'DEVICE_UPDATE' || msg.type === 'DEVICE_CREATED') {
        appDevices[msg.device.deviceId] = msg.device;
        updateDeviceDropdown();
        if (msg.device.deviceId === activeDeviceId) {
          renderDashboard();
        }
        renderScheduleList();
        updateQuickStats();
      } else if (msg.type === 'DEVICE_DELETED') {
        delete appDevices[msg.deviceId];
        const remaining = Object.keys(appDevices);
        if (activeDeviceId === msg.deviceId) {
          activeDeviceId = remaining.length > 0 ? remaining[0] : null;
        }
        updateDeviceDropdown();
        renderDashboard();
        renderScheduleList();
        updateQuickStats();
        showToast(`Perangkat ${msg.deviceId} dihapus`);
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
        if (pingDisplay) pingDisplay.textContent = `${Math.min(latency, 999)} ms`;
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
    serverStatusBadge.innerHTML = '<span class="status-dot"></span><span class="status-text">Offline</span>';
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
setInterval(measurePing, 15000);

// -------------------------------------------------------------
// Quick Stats Banner Updater
// -------------------------------------------------------------
function updateQuickStats() {
  const devicesList = Object.values(appDevices);
  const totalDevs = devicesList.length;
  const onlineDevs = devicesList.filter(d => d.isOnline).length;
  if (statActiveDevices) {
    statActiveDevices.textContent = `${onlineDevs}/${totalDevs} Online`;
  }

  const dev = appDevices[activeDeviceId];
  let activeActuators = 0;
  let activeSensors = 0;

  if (dev) {
    const comps = Array.isArray(dev.components) ? dev.components : [];
    comps.forEach(c => {
      if (c.type === 'switch' && (c.value === 'true' || c.value === true || c.value === '1')) {
        activeActuators++;
      } else if (c.type === 'dimmer' && parseInt(c.value) > 0) {
        activeActuators++;
      } else if (c.type === 'sensor' || c.driver === 'analog' || c.driver === 'bmp280' || c.driver === 'bh1750' || c.driver?.startsWith('dht') || c.driver === 'ds18b20' || c.driver === 'sht30' || c.driver === 'aht10') {
        activeSensors++;
      }
    });

    if (activeActuators === 0 && Array.isArray(dev.relays)) {
      activeActuators = dev.relays.filter(r => r.state).length;
    }
  }

  if (statActiveActuators) statActiveActuators.textContent = `${activeActuators} Aktif`;
  if (statActiveSensors) statActiveSensors.textContent = `${activeSensors} Sensor`;

  if (dev) {
    if (deviceChipBadge) deviceChipBadge.textContent = dev.chip || (dev.type?.includes('32') ? 'ESP32' : 'ESP8266');
    if (deviceIdBadge) deviceIdBadge.textContent = dev.deviceId;
    if (deviceName) deviceName.textContent = dev.name || dev.deviceId;
  }

  if (dev && dev.isOnline) {
    hardwareStatusBadge.className = 'status-pill online';
    hardwareStatusText.textContent = 'Hardware';
    if (wifiRssi) wifiRssi.textContent = dev.rssi ? `${dev.rssi} dBm` : '-- dBm';
    if (uptimeDisplay) uptimeDisplay.textContent = formatUptime(dev.uptime);
  } else {
    hardwareStatusBadge.className = 'status-pill offline';
    hardwareStatusText.textContent = 'Hardware';
    if (wifiRssi) wifiRssi.textContent = '-- dBm';
    if (!dev && uptimeDisplay) uptimeDisplay.textContent = '00:00:00';
  }
}

// -------------------------------------------------------------
// Device Dropdown & Selection
// -------------------------------------------------------------
function updateDeviceDropdown() {
  const ids = Object.keys(appDevices);

  if (ids.length === 0) {
    if (deviceSelect) deviceSelect.innerHTML = '<option value="">Belum ada perangkat</option>';
    activeDeviceId = null;
    updateQuickStats();
    return;
  }

  if (!activeDeviceId || !appDevices[activeDeviceId]) {
    activeDeviceId = ids[0];
  }

  if (deviceSelect) {
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
  }

  // Also update schedule target devices & OTA target devices
  populateScheduleDevices();
  populateOtaDevices();
  updateQuickStats();
}

if (deviceSelect) {
  deviceSelect.addEventListener('change', (e) => {
    activeDeviceId = e.target.value;
    renderDashboard();
    renderScheduleList();
    renderTimerSection();
    updateQuickStats();
    populateScheduleComponents();
  });
}

// -------------------------------------------------------------
// Device Lifecycle: Add & Delete Devices
// -------------------------------------------------------------
function openAddDeviceModal() {
  if (modalAddDevice) {
    modalAddDevice.classList.remove('hidden');
    const wizHostDisplay = document.getElementById('wizHostDisplay');
    if (wizHostDisplay) {
      wizHostDisplay.textContent = window.location.hostname;
    }
  }
}

function closeAddDeviceModal() {
  if (modalAddDevice) modalAddDevice.classList.add('hidden');
}

if (btnOpenAddDevice) btnOpenAddDevice.addEventListener('click', openAddDeviceModal);
if (btnCloseAddDevice) btnCloseAddDevice.addEventListener('click', closeAddDeviceModal);

// Wizard Tab Switcher in Add Device Modal
const wizardTabBtns = document.querySelectorAll('.wizard-tab-btn');
wizardTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    wizardTabBtns.forEach(b => b.classList.toggle('active', b === btn));
    const target = btn.dataset.wizardTab;
    const wizPemula = document.getElementById('wizPemula');
    const wizMahir = document.getElementById('wizMahir');
    if (wizPemula) wizPemula.classList.toggle('hidden', target !== 'wizPemula');
    if (wizMahir) wizMahir.classList.toggle('hidden', target !== 'wizMahir');
  });
});

if (btnCopySketch) {
  btnCopySketch.addEventListener('click', () => {
    const code = document.getElementById('sketchSnippetCode');
    if (code) {
      navigator.clipboard.writeText(code.innerText).then(() => {
        showToast('Sketch C++ berhasil disalin ke clipboard!');
      });
    }
  });
}

if (formRegisterDevice) {
  formRegisterDevice.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idInput = document.getElementById('newDeviceId');
    const nameInput = document.getElementById('newDeviceName');
    const id = idInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const name = nameInput.value.trim() || `Perangkat (${id})`;

    try {
      const res = await apiRequest('/api/devices', {
        method: 'POST',
        body: JSON.stringify({ deviceId: id, name })
      });
      if (res && res.success) {
        showToast(`Node ${id} berhasil didaftarkan!`);
        appDevices[id] = res.data;
        activeDeviceId = id;
        idInput.value = '';
        nameInput.value = '';
        closeAddDeviceModal();
        updateDeviceDropdown();
        renderDashboard();
      } else {
        showToast(res ? res.message : 'Gagal mendaftarkan node', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

if (btnDeleteDevice) {
  btnDeleteDevice.addEventListener('click', () => {
    if (!activeDeviceId) return;
    const dev = appDevices[activeDeviceId];
    const devName = dev ? (dev.name || dev.deviceId) : activeDeviceId;

    showCustomConfirm(
      'Hapus Perangkat IoT?',
      `<p>Apakah Anda yakin ingin menghapus <strong>${escapeHtml(devName)}</strong> (ID: <code>${activeDeviceId}</code>)?</p><p style="font-size:0.8rem; color:var(--danger-glow); margin-top:8px;">Semua data komponen, riwayat telemetri, dan jadwal perangkat ini akan dihapus dari database.</p>`,
      async () => {
        try {
          const res = await apiRequest(`/api/devices/${activeDeviceId}`, { method: 'DELETE' });
          if (res && res.success) {
            showToast(`Perangkat ${activeDeviceId} berhasil dihapus`);
            delete appDevices[activeDeviceId];
            const remaining = Object.keys(appDevices);
            activeDeviceId = remaining.length > 0 ? remaining[0] : null;
            updateDeviceDropdown();
            renderDashboard();
          } else {
            showToast(res ? res.message : 'Gagal menghapus perangkat', 'error');
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    );
  });
}

if (btnRenameDevice) {
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
        if (!val) return false;
        try {
          const res = await apiRequest(`/api/devices/${activeDeviceId}/rename`, {
            method: 'POST',
            body: JSON.stringify({ name: val })
          });
          if (res && res.success) {
            appDevices[activeDeviceId].name = val;
            updateDeviceDropdown();
            renderDashboard();
            showToast('Nama perangkat berhasil diperbarui');
          }
        } catch (e) {
          showToast('Gagal mengubah nama perangkat');
        }
      }
    });
  });
}

// -------------------------------------------------------------
// TAB 1: KONTROL UNIVERSAL (Polymorphic Grid)
// -------------------------------------------------------------
// Component Filter Pills
const compFilterPills = document.querySelectorAll('.comp-filter-pill');
compFilterPills.forEach(pill => {
  pill.addEventListener('click', () => {
    compFilterPills.forEach(p => p.classList.toggle('active', p === pill));
    currentCompFilter = pill.dataset.compFilter || 'all';
    renderDashboard();
  });
});

function renderDashboard() {
  const dev = appDevices[activeDeviceId];

  if (!dev) {
    if (deviceName) deviceName.textContent = 'Tidak Ada Perangkat';
    if (deviceIdBadge) deviceIdBadge.textContent = '--';
    if (deviceChipBadge) deviceChipBadge.textContent = 'ESP';
    if (componentsGrid) {
      componentsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 36px 20px; text-align: center; color: var(--text-subtle); background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 16px;">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">📡</div>
          <h4 style="color: var(--text-main); margin-bottom: 6px;">Belum Ada Perangkat IoT Terdaftar</h4>
          <p style="font-size: 0.82rem; margin-bottom: 16px;">Tambahkan node baru sekarang menggunakan Web Flasher USB atau Captive Portal WiFi.</p>
          <button type="button" class="btn-primary-action" onclick="openAddDeviceModal()" style="display: inline-flex;">
            + Tambah IoT Baru Sekarang
          </button>
        </div>
      `;
    }
    if (masterSwitchSection) masterSwitchSection.classList.add('hidden');
    updateQuickStats();
    return;
  }

  if (deviceName) deviceName.textContent = dev.name || dev.deviceId;
  if (deviceIdBadge) deviceIdBadge.textContent = dev.deviceId;
  if (deviceChipBadge) deviceChipBadge.textContent = dev.chip || (dev.type?.includes('32') ? 'ESP32' : 'ESP8266');
  if (uptimeDisplay) uptimeDisplay.textContent = formatUptime(dev.uptime);

  renderUnifiedComponents(dev);
  updateQuickStats();
}

function renderUnifiedComponents(dev) {
  if (!componentsGrid) return;
  componentsGrid.innerHTML = '';

  let comps = Array.isArray(dev.components) ? [...dev.components] : [];

  // Sinkronkan relay lama jika ada dan belum tercatat di components
  if (Array.isArray(dev.relays) && dev.relays.length > 0) {
    dev.relays.forEach(r => {
      const exists = comps.some(c => c.id === `relay_${r.channel}`);
      if (!exists) {
        comps.push({
          id: `relay_${r.channel}`,
          name: r.name || `Saklar ${r.channel}`,
          type: 'switch',
          driver: 'switch',
          value: r.state ? 'true' : 'false',
          pin: r.channel === 1 ? 5 : (r.channel === 2 ? 4 : (r.channel === 3 ? 14 : 12)),
          access: 'rw'
        });
      }
    });
  }

  // Master switch section visibility
  const hasSwitches = comps.some(c => c.type === 'switch');
  if (masterSwitchSection) {
    masterSwitchSection.classList.toggle('hidden', !hasSwitches);
  }

  // Filter components
  if (currentCompFilter === 'actuator') {
    comps = comps.filter(c => c.type === 'switch' || c.type === 'dimmer');
  } else if (currentCompFilter === 'sensor') {
    comps = comps.filter(c => c.type === 'sensor' || c.driver === 'analog' || c.driver === 'bmp280' || c.driver === 'bh1750' || c.driver?.startsWith('dht') || c.driver === 'ds18b20' || c.driver === 'sht30' || c.driver === 'aht10');
  } else if (currentCompFilter === 'indicator') {
    comps = comps.filter(c => c.type === 'indicator' || c.driver === 'digital_in');
  }

  if (comps.length === 0) {
    componentsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 32px 20px; text-align: center; color: var(--text-subtle); background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 16px;">
        <div style="font-size: 2rem; margin-bottom: 8px;">🔌</div>
        <h4 style="color: var(--text-main); margin-bottom: 6px;">Belum Ada Modul Terpasang</h4>
        <p style="font-size: 0.82rem; margin-bottom: 16px;">Tancapkan sensor atau relay ke GPIO mikrokontroler, lalu atur pin secara instan dari browser tanpa flash ulang.</p>
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn-manage-pins" onclick="openPinManager('tabAddPin')">
            ➕ Tambah Pin / Modul
          </button>
          <button type="button" class="btn-manage-pins" onclick="openPinManager('tabScanI2c')">
            🔍 Auto-Scan Jalur I2C
          </button>
        </div>
      </div>
    `;
    return;
  }

  // Sort components
  comps.sort((a, b) => {
    const order = { 'switch': 1, 'dimmer': 2, 'sensor': 3, 'indicator': 4, 'virtual': 5 };
    const orderA = order[a.type] || 9;
    const orderB = order[b.type] || 9;
    return orderA - orderB;
  });

  comps.forEach(c => {
    const card = createComponentCard(c, dev);
    componentsGrid.appendChild(card);
  });
}

function createComponentCard(c, dev) {
  const card = document.createElement('div');
  card.className = 'component-widget-card';
  card.id = `comp-widget-${c.id}`;

  const driver = c.driver || c.type || '';
  let icon = '🔌';
  if (driver === 'switch') icon = '💡';
  else if (driver === 'dimmer' || c.type === 'dimmer') icon = '🔆';
  else if (driver === 'digital_in' || driver === 'indicator') icon = '🚶';
  else if (driver.startsWith('dht') || driver === 'ds18b20' || driver === 'sht30' || driver === 'aht10') icon = '🌡️';
  else if (driver === 'bmp280') icon = '🌤️';
  else if (driver === 'bh1750') icon = '☀️';
  else if (driver === 'analog') icon = '📊';

  let pinTag = (c.pin >= 0) ? `Pin ${c.pin}` : 'I2C/Virtual';
  if (c.pin === 17) pinTag = 'A0 (ADC)';
  else if (c.pin === 14) pinTag = 'D5 (GPIO14)';
  else if (c.pin === 12) pinTag = 'D6 (GPIO12)';
  else if (c.pin === 13) pinTag = 'D7 (GPIO13)';
  else if (c.pin === 4) pinTag = 'D2 (SDA)';
  else if (c.pin === 5) pinTag = 'D1 (SCL)';

  if (c.type === 'switch') {
    const isOn = c.value === 'true' || c.value === true || c.value === '1';
    if (isOn) card.classList.add('active');
    card.innerHTML = `
      <div class="comp-header">
        <div class="comp-meta">
          <span class="comp-icon">${icon}</span>
          <div class="comp-title-wrap">
            <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
            <span class="comp-pin-tag">${pinTag}</span>
          </div>
        </div>
        <div class="card-actions-group">
          <button type="button" class="btn-card-timer" title="Atur Timer Hitung Mundur">
            ⏱ Timer
          </button>
          <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
          <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus Modul">🗑️</button>
        </div>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; margin: 12px 0;">
        <span style="font-size: 0.9rem; font-weight: 700; color: ${isOn ? 'var(--primary-glow)' : 'var(--text-muted)'};">
          ${isOn ? 'MENYALA' : 'MATI'}
        </span>
        <label class="switch-control">
          <input type="checkbox" ${isOn ? 'checked' : ''} data-comp-id="${c.id}">
          <span class="slider"></span>
        </label>
      </div>
      <div class="comp-footer">
        <span>Kontrol Digital Output</span>
        <span style="font-family: monospace;">${isOn ? 'ACTIVE' : 'STANDBY'}</span>
      </div>
    `;

    const chk = card.querySelector('input[type="checkbox"]');
    chk.addEventListener('change', (e) => {
      triggerComponent(c.id, e.target.checked);
    });

    const btnTimer = card.querySelector('.btn-card-timer');
    btnTimer.addEventListener('click', () => {
      openTimerModal(c.id, c.name);
    });

    const btnRename = card.querySelector('.btn-rename-comp');
    btnRename.addEventListener('click', () => {
      promptRenameComponent(c.id, c.name);
    });

    const btnDel = card.querySelector('.btn-del-comp');
    btnDel.addEventListener('click', () => {
      confirmDeleteComponent(c.id, c.name);
    });

  } else if (c.type === 'dimmer' || driver === 'dimmer') {
    const dimVal = Math.min(Math.max(parseInt(c.value) || 0, 0), 100);
    card.innerHTML = `
      <div class="comp-header">
        <div class="comp-meta">
          <span class="comp-icon">${icon}</span>
          <div class="comp-title-wrap">
            <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
            <span class="comp-pin-tag">${pinTag}</span>
          </div>
        </div>
        <div class="card-actions-group">
          <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
          <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus Modul">🗑️</button>
        </div>
      </div>
      <div style="margin: 10px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 0.78rem; color: var(--text-muted);">Nilai PWM Slider:</span>
          <span id="dim-text-${c.id}" style="font-size: 1rem; font-weight: 800; color: var(--accent-blue);">${dimVal}%</span>
        </div>
        <input type="range" class="dimmer-range-slider" min="0" max="100" value="${dimVal}" style="width: 100%; cursor: pointer; accent-color: var(--accent-blue);">
        <div class="dimmer-presets">
          <button type="button" class="btn-dimmer-preset" data-preset="0">0%</button>
          <button type="button" class="btn-dimmer-preset" data-preset="25">25%</button>
          <button type="button" class="btn-dimmer-preset" data-preset="50">50%</button>
          <button type="button" class="btn-dimmer-preset" data-preset="100">100%</button>
        </div>
      </div>
      <div class="comp-footer">
        <span>Dimmer / PWM (0-100%)</span>
        <span style="font-family: monospace;">Scale 8/10-bit</span>
      </div>
    `;

    const slider = card.querySelector('.dimmer-range-slider');
    const label = card.querySelector(`#dim-text-${c.id}`);
    slider.addEventListener('input', (e) => {
      label.textContent = `${e.target.value}%`;
    });
    slider.addEventListener('change', (e) => {
      triggerComponent(c.id, parseInt(e.target.value));
    });

    const presetBtns = card.querySelectorAll('.btn-dimmer-preset');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.preset);
        slider.value = val;
        label.textContent = `${val}%`;
        triggerComponent(c.id, val);
      });
    });

    const btnRename = card.querySelector('.btn-rename-comp');
    btnRename.addEventListener('click', () => {
      promptRenameComponent(c.id, c.name);
    });

    const btnDel = card.querySelector('.btn-del-comp');
    btnDel.addEventListener('click', () => {
      confirmDeleteComponent(c.id, c.name);
    });

  } else if (c.type === 'indicator' || driver === 'digital_in') {
    const isActive = c.value === '1' || c.value === 'true';
    card.innerHTML = `
      <div class="comp-header">
        <div class="comp-meta">
          <span class="comp-icon">${icon}</span>
          <div class="comp-title-wrap">
            <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
            <span class="comp-pin-tag">${pinTag}</span>
          </div>
        </div>
        <div class="card-actions-group">
          <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
          <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus Modul">🗑️</button>
        </div>
      </div>
      <div style="margin: 12px 0;">
        <span class="indicator-pill ${isActive ? 'active' : 'inactive'}">
          ${isActive ? '🔴 Terdeteksi / Aktif' : '🟢 Standby / Aman'}
        </span>
      </div>
      <div class="comp-footer">
        <span>Digital Input (Debounce 50ms)</span>
        <span style="font-family: monospace;">${isActive ? 'TRIGGERED' : 'IDLE'}</span>
      </div>
    `;

    const btnRename = card.querySelector('.btn-rename-comp');
    btnRename.addEventListener('click', () => {
      promptRenameComponent(c.id, c.name);
    });

    const btnDel = card.querySelector('.btn-del-comp');
    btnDel.addEventListener('click', () => {
      confirmDeleteComponent(c.id, c.name);
    });

  } else {
    // Sensor metric card
    card.innerHTML = `
      <div class="comp-header">
        <div class="comp-meta">
          <span class="comp-icon">${icon}</span>
          <div class="comp-title-wrap">
            <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
            <span class="comp-pin-tag">${pinTag}</span>
          </div>
        </div>
        <div class="card-actions-group">
          <button type="button" class="btn-card-graph" title="Lihat Grafik Riwayat">
            📈 Grafik
          </button>
          <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
          <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus Modul">🗑️</button>
        </div>
      </div>
      <div class="comp-val-display" style="margin: 10px 0;">
        <span class="comp-val-number">${escapeHtml(c.value || '0')}</span>
        <span class="comp-val-unit">${escapeHtml(c.unit || '')}</span>
      </div>
      <div class="comp-footer">
        <span>Driver: ${escapeHtml(driver || 'sensor')}</span>
        <span style="font-size: 0.68rem; color: var(--text-subtle);">Real-Time Delta</span>
      </div>
    `;

    const btnGraph = card.querySelector('.btn-card-graph');
    btnGraph.addEventListener('click', () => {
      openTelemetryGraphModal(c.id, c.name, c.unit);
    });

    const btnRename = card.querySelector('.btn-rename-comp');
    btnRename.addEventListener('click', () => {
      promptRenameComponent(c.id, c.name);
    });

    const btnDel = card.querySelector('.btn-del-comp');
    btnDel.addEventListener('click', () => {
      confirmDeleteComponent(c.id, c.name);
    });
  }

  return card;
}

// -------------------------------------------------------------
// Component Actions & Control Triggers
// -------------------------------------------------------------
function triggerComponent(componentId, value, duration = 0) {
  if (!activeDeviceId) return;

  if (socket && socket.readyState === WebSocket.OPEN) {
    const msg = {
      action: 'set_component',
      target: activeDeviceId,
      componentId: componentId,
      value: value
    };
    if (duration > 0) msg.duration = duration;
    socket.send(JSON.stringify(msg));

    // Optimistic UI update
    const dev = appDevices[activeDeviceId];
    if (dev && Array.isArray(dev.components)) {
      const c = dev.components.find(x => x.id === componentId);
      if (c) c.value = String(value);
    }
    if (/^relay_\d+$/i.test(componentId) && dev && Array.isArray(dev.relays)) {
      const ch = parseInt(componentId.replace(/\D/g, ''));
      const r = dev.relays.find(x => x.channel === ch);
      if (r) r.state = (value === true || value === 'true' || value === '1');
    }
    updateQuickStats();
  } else {
    showToast('Koneksi WebSocket terputus', 'error');
  }
}

function triggerAllSwitches(state) {
  if (!activeDeviceId) return;
  const dev = appDevices[activeDeviceId];
  if (!dev) return;

  const comps = Array.isArray(dev.components) ? dev.components : [];
  const switches = comps.filter(c => c.type === 'switch');
  if (switches.length > 0) {
    switches.forEach(s => {
      triggerComponent(s.id, state);
    });
  } else if (Array.isArray(dev.relays) && dev.relays.length > 0) {
    dev.relays.forEach(r => {
      triggerComponent(`relay_${r.channel}`, state);
    });
  }
  showToast(`Semua saklar di-${state ? 'nyalakan' : 'matikan'}`);
}

if (btnAllOn) btnAllOn.addEventListener('click', () => triggerAllSwitches(true));
if (btnAllOff) btnAllOff.addEventListener('click', () => triggerAllSwitches(false));

// Prompt Rename Component
function promptRenameComponent(componentId, currentName) {
  openCustomModal({
    title: 'Ubah Nama Modul',
    bodyHtml: `
      <div class="form-group">
        <label class="form-label">Nama Komponen Baru</label>
        <input type="text" id="inputNewCompName" class="form-input" value="${escapeHtml(currentName || componentId)}" maxlength="30" required>
      </div>
    `,
    confirmText: 'Simpan',
    onConfirm: async (body) => {
      const newName = body.querySelector('#inputNewCompName').value.trim();
      if (!newName) return false;

      try {
        const res = await apiRequest(`/api/devices/${activeDeviceId}/components/${componentId}/rename`, {
          method: 'POST',
          body: JSON.stringify({ name: newName })
        });
        if (res && res.success) {
          showToast('Nama komponen berhasil diperbarui');
          const dev = appDevices[activeDeviceId];
          if (dev && Array.isArray(dev.components)) {
            const c = dev.components.find(x => x.id === componentId);
            if (c) c.name = newName;
          }
          renderDashboard();
          populateScheduleComponents();
        }
      } catch (err) {
        showToast('Gagal mengubah nama modul', 'error');
      }
    }
  });
}

// Confirm Delete Component
function confirmDeleteComponent(componentId, componentName) {
  showCustomConfirm(
    'Hapus Modul / Pin?',
    `<p>Apakah Anda yakin ingin melepas modul <strong>${escapeHtml(componentName || componentId)}</strong> dari perangkat ini?</p><p style="font-size:0.8rem; color:var(--text-subtle); margin-top:6px;">Instruksi <code>remove_pin</code> akan dikirimkan ke hardware secara otomatis.</p>`,
    async () => {
      try {
        const res = await apiRequest(`/api/devices/${activeDeviceId}/components/${componentId}`, {
          method: 'DELETE'
        });
        if (res && res.success) {
          showToast(`Modul ${componentId} berhasil dilepas`);
          const dev = appDevices[activeDeviceId];
          if (dev && Array.isArray(dev.components)) {
            dev.components = dev.components.filter(x => x.id !== componentId);
          }
          renderDashboard();
          populateScheduleComponents();
        } else {
          showToast(res ? res.message : 'Gagal melepas modul', 'error');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

// -------------------------------------------------------------
// Timer Countdown Modal Logic
// -------------------------------------------------------------
function openTimerModal(componentId, componentName) {
  activeTimerComponentId = componentId;
  const title = document.getElementById('timerModalCompTitle');
  if (title) title.textContent = `Timer: ${componentName || componentId}`;
  if (modalTimerCountdown) modalTimerCountdown.classList.remove('hidden');
}

function closeTimerModal() {
  if (modalTimerCountdown) modalTimerCountdown.classList.add('hidden');
  activeTimerComponentId = null;
}

if (btnCloseTimerModal) btnCloseTimerModal.addEventListener('click', closeTimerModal);
if (btnCancelTimerSubmit) btnCancelTimerSubmit.addEventListener('click', closeTimerModal);

const timerPresetBtns = document.querySelectorAll('.btn-dimmer-preset[data-timer-sec]');
timerPresetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const sec = parseInt(btn.dataset.timerSec);
    if (activeTimerComponentId && sec > 0) {
      triggerComponent(activeTimerComponentId, true, sec);
      showToast(`⏱️ Timer ${formatCountdown(sec)} diaktifkan pada hardware`);
      closeTimerModal();
    }
  });
});

if (btnStartTimerSubmit) {
  btnStartTimerSubmit.addEventListener('click', () => {
    const customMinutesInput = document.getElementById('customTimerMinutes');
    const mins = customMinutesInput ? parseInt(customMinutesInput.value) : 0;
    if (activeTimerComponentId && mins > 0) {
      const sec = mins * 60;
      triggerComponent(activeTimerComponentId, true, sec);
      showToast(`⏱️ Timer ${mins} menit diaktifkan pada hardware`);
      closeTimerModal();
    } else {
      showToast('Masukkan durasi menit yang valid', 'warning');
    }
  });
}

// -------------------------------------------------------------
// Telemetry History Graph Viewer Modal
// -------------------------------------------------------------
async function openTelemetryGraphModal(compId, compName, compUnit) {
  if (!modalTelemetryGraph || !activeDeviceId) return;
  modalTelemetryGraph.classList.remove('hidden');

  const title = document.getElementById('telemetryGraphTitle');
  const sub = document.getElementById('telemetryGraphSub');
  const loading = document.getElementById('graphLoadingMsg');
  const canvas = document.getElementById('telemetryCanvas');

  if (title) title.textContent = `Riwayat: ${compName || compId}`;
  if (sub) sub.textContent = `Perangkat: ${activeDeviceId} • Satuan: ${compUnit || '-'}`;
  if (loading) {
    loading.textContent = 'Memuat data riwayat...';
    loading.classList.remove('hidden');
  }

  try {
    const res = await apiRequest(`/api/devices/${activeDeviceId}/components/${compId}/history?limit=50`);
    if (loading) loading.classList.add('hidden');

    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      drawTelemetryChart(canvas, res.data, compUnit);
    } else {
      if (loading) {
        loading.textContent = 'Belum ada data telemetri tercatat untuk sensor ini.';
        loading.classList.remove('hidden');
      }
    }
  } catch (err) {
    if (loading) {
      loading.textContent = 'Gagal memuat grafik: ' + err.message;
      loading.classList.remove('hidden');
    }
  }
}

if (btnCloseGraphModal) {
  btnCloseGraphModal.addEventListener('click', () => {
    if (modalTelemetryGraph) modalTelemetryGraph.classList.add('hidden');
  });
}

function drawTelemetryChart(canvas, data, unit) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const graphW = w - padding.left - padding.right;
  const graphH = h - padding.top - padding.bottom;

  const values = data.map(d => parseFloat(d.value)).filter(v => !isNaN(v));
  if (values.length === 0) return;

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const valRange = (maxVal - minVal) === 0 ? 1 : (maxVal - minVal);

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (graphH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    const valLabel = (maxVal - (valRange / 4) * i).toFixed(1);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(valLabel, padding.left - 6, y + 3);
  }

  // Step calculations
  const stepX = graphW / (data.length - 1 || 1);
  const points = data.map((d, i) => {
    const x = padding.left + i * stepX;
    const v = parseFloat(d.value);
    const y = padding.top + graphH - ((v - minVal) / valRange) * graphH;
    return { x, y, val: v };
  });

  // Area gradient
  const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphH);
  grad.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
  grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, padding.top + graphH);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padding.top + graphH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line chart
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Points
  points.forEach((p, idx) => {
    if (data.length <= 25 || idx % 2 === 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.strokeStyle = '#080b11';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
}

// -------------------------------------------------------------
// TAB 2: JADWAL OTOMATIS & COUNTDOWN TIMER
// -------------------------------------------------------------
if (subTabJadwalBtn && subTabTimerBtn) {
  subTabJadwalBtn.addEventListener('click', () => {
    subTabJadwalBtn.classList.add('active');
    subTabTimerBtn.classList.remove('active');
    if (subViewJadwal) subViewJadwal.classList.remove('hidden');
    if (subViewTimer) subViewTimer.classList.add('hidden');
  });

  subTabTimerBtn.addEventListener('click', () => {
    subTabTimerBtn.classList.add('active');
    subTabJadwalBtn.classList.remove('active');
    if (subViewTimer) subViewTimer.classList.remove('hidden');
    if (subViewJadwal) subViewJadwal.classList.add('hidden');
    renderTimerSection();
  });
}

function renderTimerSection() {
  if (!timerGrid) return;
  const dev = appDevices[activeDeviceId];
  if (!dev) {
    timerGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-subtle);">Tidak ada perangkat aktif</p>';
    return;
  }

  const comps = Array.isArray(dev.components) ? dev.components : [];
  const switches = comps.filter(c => c.type === 'switch');

  if (switches.length === 0) {
    timerGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-subtle); padding: 20px 0;">Tidak ada saklar pada perangkat ini untuk timer hitung mundur.</p>';
    return;
  }

  timerGrid.innerHTML = '';
  switches.forEach(s => {
    const card = document.createElement('div');
    card.className = 'timer-card';
    card.innerHTML = `
      <div class="timer-card-header">
        <span class="timer-relay-name">${escapeHtml(s.name || s.id)}</span>
        <span class="timer-state-badge ${(s.value === 'true' || s.value === true) ? 'on' : 'off'}">
          ${(s.value === 'true' || s.value === true) ? 'MENYALA' : 'MATI'}
        </span>
      </div>
      <div class="timer-actions-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 10px 0;">
        <button type="button" class="btn-timer-quick" data-comp="${s.id}" data-sec="60">1m</button>
        <button type="button" class="btn-timer-quick" data-comp="${s.id}" data-sec="300">5m</button>
        <button type="button" class="btn-timer-quick" data-comp="${s.id}" data-sec="600">10m</button>
        <button type="button" class="btn-timer-quick" data-comp="${s.id}" data-sec="900">15m</button>
        <button type="button" class="btn-timer-quick" data-comp="${s.id}" data-sec="1800">30m</button>
        <button type="button" class="btn-timer-quick" data-comp="${s.id}" data-sec="3600">1h</button>
      </div>
    `;

    card.querySelectorAll('.btn-timer-quick').forEach(b => {
      b.addEventListener('click', () => {
        const sec = parseInt(b.dataset.sec);
        triggerComponent(s.id, true, sec);
        showToast(`⏱️ Timer ${formatCountdown(sec)} diaktifkan untuk ${s.name || s.id}`);
      });
    });

    timerGrid.appendChild(card);
  });
}

function populateScheduleDevices() {
  if (!schedDevice) return;
  schedDevice.innerHTML = '';
  const devs = Object.values(appDevices);
  if (devs.length === 0) {
    schedDevice.innerHTML = '<option value="">Tidak ada perangkat</option>';
    return;
  }
  devs.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = `${d.name || d.deviceId} (${d.isOnline ? 'Online' : 'Offline'})`;
    if (d.deviceId === activeDeviceId) opt.selected = true;
    schedDevice.appendChild(opt);
  });
  populateScheduleComponents();
}

function populateScheduleComponents() {
  if (!schedComponent || !schedDevice) return;
  schedComponent.innerHTML = '';
  const devId = schedDevice.value || activeDeviceId;
  const dev = appDevices[devId];
  if (!dev) {
    schedComponent.innerHTML = '<option value="">Pilih perangkat terlebih dahulu</option>';
    return;
  }

  const comps = Array.isArray(dev.components) ? dev.components : [];
  const controllable = comps.filter(c => c.access === 'rw' || c.type === 'switch' || c.type === 'dimmer');

  if (controllable.length > 0) {
    controllable.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name || c.id} (${c.type.toUpperCase()})`;
      schedComponent.appendChild(opt);
    });
  } else if (Array.isArray(dev.relays) && dev.relays.length > 0) {
    dev.relays.forEach(r => {
      const opt = document.createElement('option');
      opt.value = `relay_${r.channel}`;
      opt.textContent = `${r.name || `Saklar #${r.channel}`}`;
      schedComponent.appendChild(opt);
    });
  } else {
    schedComponent.innerHTML = '<option value="">Tidak ada komponen aktuator</option>';
  }
}

if (schedDevice) {
  schedDevice.addEventListener('change', populateScheduleComponents);
}

// Day Chips Selector
if (daysChips) {
  daysChips.querySelectorAll('.day-chip').forEach(c => {
    c.addEventListener('click', () => {
      const day = parseInt(c.dataset.day);
      if (selectedDays.includes(day)) {
        selectedDays = selectedDays.filter(d => d !== day);
        c.classList.remove('selected');
      } else {
        selectedDays.push(day);
        c.classList.add('selected');
      }
    });
  });
}

// Schedule Form Submit
if (scheduleForm) {
  scheduleForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const targetDev = schedDevice ? schedDevice.value : activeDeviceId;
    if (!targetDev) {
      showToast('Pilih perangkat terlebih dahulu', 'warning');
      return;
    }

    const timeVal = schedTime.value;
    if (!timeVal) {
      showToast('Masukkan jam eksekusi jadwal', 'warning');
      return;
    }

    const targetComp = schedComponent ? schedComponent.value : (schedChannel ? `relay_${schedChannel.value}` : null);
    const durationVal = (schedDuration && schedDuration.value) ? parseInt(schedDuration.value) : 0;

    const payload = {
      deviceId: targetDev,
      componentId: targetComp,
      channel: (targetComp && /^relay_\d+$/i.test(targetComp)) ? parseInt(targetComp.replace(/\D/g, '')) : 0,
      action: schedAction.value,
      time: timeVal,
      days: [...selectedDays].sort(),
      duration: durationVal,
      label: schedLabel.value.trim() || (targetComp ? `Jadwal ${targetComp}` : 'Jadwal Otomatis')
    };

    try {
      const res = await apiRequest('/api/schedules', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res && res.success) {
        showToast('Jadwal berhasil disimpan!');
        scheduleForm.reset();
        selectedDays = [];
        if (daysChips) daysChips.querySelectorAll('.day-chip').forEach(c => c.classList.remove('selected'));
        loadSchedules();
      } else {
        showToast(res ? res.message : 'Gagal menyimpan jadwal', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function loadSchedules() {
  try {
    const res = await apiRequest('/api/schedules');
    if (res && res.success) {
      appSchedules = res.data || [];
      renderScheduleList();
      updateQuickStats();
    }
  } catch (err) {}
}

function renderScheduleList() {
  if (!scheduleList) return;

  const list = activeDeviceId ? appSchedules.filter(s => s.deviceId === activeDeviceId) : appSchedules;
  if (schedCountBadge) schedCountBadge.textContent = list.length;

  if (list.length === 0) {
    scheduleList.innerHTML = '<p class="empty-schedule-msg">Belum ada jadwal aktif untuk perangkat ini.</p>';
    return;
  }

  scheduleList.innerHTML = '';
  list.forEach(s => {
    const item = document.createElement('div');
    item.className = 'schedule-item';

    const daysText = (Array.isArray(s.days) && s.days.length > 0)
      ? s.days.map(d => DAY_NAMES[d]).join(', ')
      : 'Setiap Hari';

    const targetName = s.label || s.componentId || `Relay #${s.channel}`;

    item.innerHTML = `
      <div class="sched-info">
        <div class="sched-header-row">
          <span class="sched-name">${escapeHtml(targetName)}</span>
          <span class="sched-time-badge">${s.time}</span>
        </div>
        <div class="sched-meta">
          <span>${daysText}</span> &bull; 
          <span>Aksi: <strong>${s.action.toUpperCase()}</strong></span>
          ${s.duration > 0 ? ` &bull; <span>Auto-off: ${s.duration}m</span>` : ''}
        </div>
      </div>
      <div class="sched-actions">
        <label class="toggle-mini">
          <input type="checkbox" ${s.enabled ? 'checked' : ''} data-sched-id="${s.id}">
          <span class="toggle-mini-slider"></span>
        </label>
        <button type="button" class="btn-delete-schedule" data-sched-id="${s.id}" title="Hapus">
          🗑️
        </button>
      </div>
    `;

    item.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
      try {
        await apiRequest(`/api/schedules/${s.id}`, {
          method: 'PUT',
          body: JSON.stringify({ enabled: e.target.checked })
        });
        loadSchedules();
      } catch (err) {}
    });

    item.querySelector('.btn-delete-schedule').addEventListener('click', () => {
      showCustomConfirm('Hapus Jadwal?', `<p>Hapus jadwal <strong>"${escapeHtml(targetName)}"</strong>?</p>`, async () => {
        try {
          await apiRequest(`/api/schedules/${s.id}`, { method: 'DELETE' });
          loadSchedules();
          showToast('Jadwal dihapus');
        } catch (err) {}
      });
    });

    scheduleList.appendChild(item);
  });
}

// -------------------------------------------------------------
// TAB 3: RIWAYAT AKTIVITAS
// -------------------------------------------------------------
const logFilterPills = document.querySelectorAll('.log-filter-bar .filter-pill');
logFilterPills.forEach(pill => {
  pill.addEventListener('click', () => {
    logFilterPills.forEach(p => p.classList.toggle('active', p === pill));
    activeLogFilter = pill.dataset.filter || 'all';
    renderActivityLogs();
  });
});

async function loadActivityLogs() {
  if (!activityTimeline) return;
  activityTimeline.innerHTML = '<div class="empty-timeline-msg">Memuat data aktivitas...</div>';
  try {
    const url = activeDeviceId ? `/api/logs?deviceId=${activeDeviceId}&limit=60` : '/api/logs?limit=60';
    const res = await apiRequest(url);
    if (res && res.success) {
      activityLogs = res.data || [];
      renderActivityLogs();
    }
  } catch (err) {
    activityTimeline.innerHTML = '<div class="empty-timeline-msg">Gagal memuat log</div>';
  }
}

function renderActivityLogs() {
  if (!activityTimeline) return;

  let list = activityLogs;
  if (activeLogFilter === 'control') {
    list = activityLogs.filter(l => l.event.includes('control'));
  } else if (activeLogFilter === 'schedule') {
    list = activityLogs.filter(l => l.event.includes('schedule'));
  } else if (activeLogFilter === 'device') {
    list = activityLogs.filter(l => l.event.includes('device') || l.event.includes('i2c') || l.event.includes('ota'));
  }

  if (list.length === 0) {
    activityTimeline.innerHTML = '<div class="empty-timeline-msg">Tidak ada catatan aktivitas.</div>';
    return;
  }

  activityTimeline.innerHTML = '';
  list.forEach(l => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    const timeFormatted = new Date(l.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let detailsText = typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details || '');
    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="timeline-event">${escapeHtml(l.event)}</span>
          <span class="timeline-time">${timeFormatted}</span>
        </div>
        <div class="timeline-desc">${escapeHtml(detailsText)}</div>
      </div>
    `;
    activityTimeline.appendChild(item);
  });
}

if (btnRefreshLogs) btnRefreshLogs.addEventListener('click', loadActivityLogs);

// -------------------------------------------------------------
// TAB 4: PENGATURAN & KEAMANAN
// -------------------------------------------------------------
if (btnSyncJson) {
  btnSyncJson.addEventListener('click', async () => {
    try {
      const res = await apiRequest('/api/sync-json', { method: 'POST' });
      showToast(res && res.success ? 'Sinkronisasi SQLite-JSON berhasil' : 'Gagal sinkronisasi');
    } catch (e) {
      showToast('Gagal sinkronisasi', 'error');
    }
  });
}

function renderRelayNamingList() {
  if (!relayNamingList) return;
  const dev = appDevices[activeDeviceId];
  if (!dev || !Array.isArray(dev.relays) || dev.relays.length === 0) {
    relayNamingList.innerHTML = '<p style="color: var(--text-subtle); font-size: 0.8rem;">Tidak ada saklar relay pada perangkat ini.</p>';
    return;
  }

  relayNamingList.innerHTML = '';
  dev.relays.forEach(r => {
    const row = document.createElement('div');
    row.className = 'settings-item-row';
    row.innerHTML = `
      <div>
        <div class="settings-item-title">Saklar #${r.channel}</div>
        <div class="settings-item-sub">Nama saat ini: <strong>${escapeHtml(r.name)}</strong></div>
      </div>
      <button type="button" class="btn-action-secondary btn-rename-relay" data-ch="${r.channel}">Ubah Nama</button>
    `;
    row.querySelector('.btn-rename-relay').addEventListener('click', () => {
      promptRenameComponent(`relay_${r.channel}`, r.name);
    });
    relayNamingList.appendChild(row);
  });
}

if (btnChangePassword) {
  btnChangePassword.addEventListener('click', () => {
    openCustomModal({
      title: 'Ubah Password Administrator',
      bodyHtml: `
        <div class="form-group">
          <label class="form-label">Password Saat Ini</label>
          <input type="password" id="curPass" class="form-input" required>
        </div>
        <div class="form-group">
          <label class="form-label">Password Baru (min 6 karakter)</label>
          <input type="password" id="newPass" class="form-input" required>
        </div>
      `,
      confirmText: 'Ubah Password',
      onConfirm: async (body) => {
        const curP = body.querySelector('#curPass').value;
        const newP = body.querySelector('#newPass').value;
        try {
          const res = await apiRequest('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword: curP, newPassword: newP })
          });
          if (res && res.success) {
            showToast('Password berhasil diubah!');
            return true;
          } else {
            showToast(res ? res.message : 'Gagal ubah password', 'error');
            return false;
          }
        } catch (err) {
          showToast(err.message, 'error');
          return false;
        }
      }
    });
  });
}

// -------------------------------------------------------------
// DYNAMIC PIN & SENSOR MANAGER MODAL (Zero-Code Plug & Play)
// -------------------------------------------------------------
function openPinManager(initialTab = 'tabListPins') {
  if (!activeDeviceId) {
    showToast('Pilih perangkat IoT terlebih dahulu', 'warning');
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

function closePinManager() {
  if (modalPinManager) modalPinManager.classList.add('hidden');
}

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
  if (tabId === 'tabListPins') renderActivePinsList();
}

if (btnOpenPinManager) btnOpenPinManager.addEventListener('click', () => openPinManager('tabListPins'));
if (btnClosePinManager) btnClosePinManager.addEventListener('click', closePinManager);

pinTabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchPinTab(btn.dataset.pinTab));
});

function renderActivePinsList() {
  if (!activePinsList) return;
  const dev = appDevices[activeDeviceId];
  const comps = (dev && Array.isArray(dev.components)) ? dev.components : [];
  if (countActiveComponents) countActiveComponents.textContent = comps.length;

  if (comps.length === 0) {
    activePinsList.innerHTML = `
      <div class="empty-pins-msg">
        <span>Belum ada modul atau sensor yang terpasang pada perangkat ini.</span>
      </div>
    `;
    return;
  }

  activePinsList.innerHTML = '';
  comps.forEach(c => {
    const item = document.createElement('div');
    item.className = 'pin-item-row';
    const pinLabel = c.pin >= 0 ? `Pin ${c.pin}` : 'I2C/Virtual';

    item.innerHTML = `
      <div class="pin-info">
        <span class="pin-badge">${pinLabel}</span>
        <div class="pin-details">
          <span class="pin-name">${escapeHtml(c.name || c.id)}</span>
          <span class="pin-driver">Driver: ${escapeHtml(c.driver || c.type)} &bull; Nilai: ${escapeHtml(c.value || '0')} ${escapeHtml(c.unit || '')}</span>
        </div>
      </div>
      <div class="pin-actions">
        <button type="button" class="btn-icon-action btn-del-pin" title="Lepas Modul">🗑️</button>
      </div>
    `;

    item.querySelector('.btn-del-pin').addEventListener('click', () => {
      confirmDeleteComponent(c.id, c.name);
    });

    activePinsList.appendChild(item);
  });
}

// Form Add Pin Submit
if (formAddPin) {
  formAddPin.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeDeviceId) {
      showToast('Pilih perangkat terlebih dahulu', 'warning');
      return;
    }

    const pin = parseInt(pinSelect.value);
    const driver = pinDriverType.value;
    const name = pinCompName.value.trim();
    const unit = pinCompUnit.value.trim();
    const interval = parseInt(pinReadInterval.value) || 5;
    const activeLow = pinActiveLow.value === 'true';

    let type = 'sensor';
    let access = 'r';
    if (driver === 'switch') {
      type = 'switch';
      access = 'rw';
    } else if (driver === 'dimmer') {
      type = 'dimmer';
      access = 'rw';
    } else if (driver === 'digital_in') {
      type = 'indicator';
      access = 'r';
    }

    const id = `${driver}_${pin >= 0 ? pin : Date.now()}`;

    const compData = {
      id,
      name,
      type,
      driver,
      pin,
      unit,
      access,
      activeLow,
      interval: interval * 1000
    };

    try {
      const res = await apiRequest(`/api/devices/${activeDeviceId}/components`, {
        method: 'POST',
        body: JSON.stringify(compData)
      });
      if (res && res.success) {
        showToast(`Modul "${name}" berhasil dipasang!`);
        formAddPin.reset();
        switchPinTab('tabListPins');
        renderDashboard();
      } else {
        showToast(res ? res.message : 'Gagal memasang modul', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// I2C Remote Scanner
if (btnTriggerI2cScan) {
  btnTriggerI2cScan.addEventListener('click', async () => {
    if (!activeDeviceId) {
      showToast('Pilih perangkat terlebih dahulu', 'warning');
      return;
    }
    btnTriggerI2cScan.disabled = true;
    if (i2cScanStatus) i2cScanStatus.textContent = 'Hardware sedang memindai bus I2C...';

    try {
      const res = await apiRequest(`/api/devices/${activeDeviceId}/scan-i2c`, { method: 'POST' });
      if (res && res.success) {
        showToast('Instruksi scan dikirim ke hardware...');
      } else {
        showToast(res ? res.message : 'Gagal mengirim instruksi scan', 'error');
        btnTriggerI2cScan.disabled = false;
      }
    } catch (err) {
      showToast(err.message, 'error');
      btnTriggerI2cScan.disabled = false;
    }
  });
}

function renderI2cScanResults(devices = []) {
  if (btnTriggerI2cScan) btnTriggerI2cScan.disabled = false;
  if (i2cScanStatus) i2cScanStatus.textContent = `Ditemukan ${devices.length} modul I2C`;
  if (!i2cResultsContainer) return;

  if (devices.length === 0) {
    i2cResultsContainer.innerHTML = `
      <div class="empty-state-card">
        <span>Tidak ada perangkat I2C yang terdeteksi. Pastikan kabel SDA & SCL terpasang kencang.</span>
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
        <span class="i2c-addr-badge">${escapeHtml(d.hex || d.address)}</span>
        <div class="i2c-dev-info">
          <span class="i2c-dev-name">${escapeHtml(d.name)}</span>
          <span class="i2c-dev-category">${escapeHtml(d.category || 'Sensor I2C')}</span>
        </div>
      </div>
      <button type="button" class="btn-add-i2c-quick">
        + Pasang Modul Ini
      </button>
    `;

    card.querySelector('.btn-add-i2c-quick').addEventListener('click', () => {
      quickAddI2cSensor(d);
    });

    i2cResultsContainer.appendChild(card);
  });
}

async function quickAddI2cSensor(d) {
  if (!activeDeviceId) return;

  let driver = 'bmp280';
  let unit = '°C';
  const name = d.name || 'Sensor I2C';

  if (name.includes('BMP') || name.includes('BME')) {
    driver = 'bmp280';
    unit = '°C';
  } else if (name.includes('BH1750')) {
    driver = 'bh1750';
    unit = 'Lux';
  } else if (name.includes('SHT')) {
    driver = 'sht30';
    unit = '°C';
  } else if (name.includes('AHT')) {
    driver = 'aht10';
    unit = '°C';
  }

  const compData = {
    id: `${driver}_${d.address || 'i2c'}`,
    name: name,
    type: 'sensor',
    driver: driver,
    unit: unit,
    access: 'r',
    pin: -1,
    interval: 5000
  };

  try {
    const res = await apiRequest(`/api/devices/${activeDeviceId}/components`, {
      method: 'POST',
      body: JSON.stringify(compData)
    });
    if (res && res.success) {
      showToast(`Sensor ${name} berhasil dipasang!`);
      closePinManager();
      renderDashboard();
    }
  } catch (err) {
    showToast('Gagal memasang sensor I2C', 'error');
  }
}

// -------------------------------------------------------------
// TAB 5: TOOLS - SUB-TABS & REMOTE OTA MODULE
// -------------------------------------------------------------
function switchToolsSubTab(tab) {
  const serialBtn = document.getElementById('subTabSerialBtn');
  const flasherBtn = document.getElementById('subTabFlasherBtn');
  const otaBtn = document.getElementById('subTabOtaBtn');

  const serialView = document.getElementById('subViewSerial');
  const flasherView = document.getElementById('subViewFlasher');
  const otaView = document.getElementById('subViewOta');

  [serialBtn, flasherBtn, otaBtn].forEach(b => b && b.classList.remove('active'));
  [serialView, flasherView, otaView].forEach(v => v && v.classList.add('hidden'));

  if (tab === 'serial') {
    if (serialBtn) serialBtn.classList.add('active');
    if (serialView) serialView.classList.remove('hidden');
  } else if (tab === 'flasher') {
    if (flasherBtn) flasherBtn.classList.add('active');
    if (flasherView) flasherView.classList.remove('hidden');
  } else if (tab === 'ota') {
    if (otaBtn) otaBtn.classList.add('active');
    if (otaView) otaView.classList.remove('hidden');
    loadServerFirmwaresForOta();
    populateOtaDevices();
  }
}
document.getElementById('subTabSerialBtn')?.addEventListener('click', () => switchToolsSubTab('serial'));
document.getElementById('subTabFlasherBtn')?.addEventListener('click', () => switchToolsSubTab('flasher'));
if (typeof subTabOtaBtn !== 'undefined' && subTabOtaBtn) subTabOtaBtn.addEventListener('click', () => switchToolsSubTab('ota'));

function populateOtaDevices() {
  if (!otaTargetDevice) return;
  otaTargetDevice.innerHTML = '';
  const devs = Object.values(appDevices);
  if (devs.length === 0) {
    otaTargetDevice.innerHTML = '<option value="">Tidak ada perangkat terdaftar</option>';
    return;
  }
  devs.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = `${d.name || d.deviceId} (${d.isOnline ? 'Online' : 'Offline'})`;
    if (d.deviceId === activeDeviceId) opt.selected = true;
    otaTargetDevice.appendChild(opt);
  });
}

async function loadServerFirmwaresForOta() {
  if (!otaFirmwareSelect) return;
  try {
    const res = await apiRequest('/api/firmwares');
    if (res && res.success && Array.isArray(res.data)) {
      otaFirmwareSelect.innerHTML = '<option value="">-- Pilih File Firmware di Server --</option>';
      res.data.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.filename;
        opt.textContent = `${f.filename} (${f.sizeFormatted})`;
        otaFirmwareSelect.appendChild(opt);
      });
    }
  } catch (e) {}
}

if (btnStartOta) {
  btnStartOta.addEventListener('click', async () => {
    const targetDev = otaTargetDevice ? otaTargetDevice.value : activeDeviceId;
    if (!targetDev) {
      showToast('Pilih perangkat target terlebih dahulu', 'warning');
      return;
    }
    const filename = otaFirmwareSelect ? otaFirmwareSelect.value : '';
    const customUrl = otaCustomUrl ? otaCustomUrl.value.trim() : '';
    if (!filename && !customUrl) {
      showToast('Pilih file firmware atau isi URL firmware', 'warning');
      return;
    }

    try {
      if (otaLiveProgressContainer) otaLiveProgressContainer.classList.remove('hidden');
      if (otaProgressPercent) otaProgressPercent.textContent = '0%';
      if (otaProgressBar) otaProgressBar.style.width = '0%';
      if (otaProgressLabel) otaProgressLabel.textContent = `Mengirim perintah update ke ${targetDev}...`;

      const res = await apiRequest(`/api/devices/${targetDev}/ota`, {
        method: 'POST',
        body: JSON.stringify({ filename, url: customUrl })
      });
      if (res && res.success) {
        showToast(`Instruksi OTA dikirim ke ${targetDev}`);
      } else {
        showToast(res ? res.message : 'Gagal mengirim instruksi OTA', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function handleOtaProgressUpdate(msg) {
  const percent = msg.percent || 0;
  if (otaLiveProgressContainer) otaLiveProgressContainer.classList.remove('hidden');
  if (otaProgressPercent) otaProgressPercent.textContent = `${percent}%`;
  if (otaProgressBar) otaProgressBar.style.width = `${percent}%`;
  if (otaProgressLabel) otaProgressLabel.textContent = `Node ${msg.deviceId} sedang mengunduh: ${percent}%`;

  if (otaByteDetails && msg.current && msg.total) {
    const curKb = (msg.current / 1024).toFixed(1);
    const totKb = (msg.total / 1024).toFixed(1);
    otaByteDetails.textContent = `${curKb} / ${totKb} KB`;
  }

  if (percent >= 100) {
    showToast(`🎉 Unduh firmware selesai (100%)! ${msg.deviceId} sedang me-reboot...`);
    if (otaProgressLabel) otaProgressLabel.textContent = `OTA Selesai! ${msg.deviceId} sedang reboot...`;
  }
}

// Check auth session on startup
checkAuthSession();

// -------------------------------------------------------------
// TAB 5: TOOLS — Web Serial Monitor & Web Flasher
// Menggunakan Web Serial API (Chrome/Edge 89+)
// -------------------------------------------------------------

// --- Cek Dukungan Web Serial API ---
const isWebSerialSupported = ('serial' in navigator);
const webSerialUnsupported = document.getElementById('webSerialUnsupported');

// --- Serial Monitor DOM Elements ---
const serialStatusIndicator = document.getElementById('serialStatusIndicator');
const serialStatusLabel = document.getElementById('serialStatusLabel');
const serialPortName = document.getElementById('serialPortName');
const serialBaudRate = document.getElementById('serialBaudRate');
const btnSerialConnect = document.getElementById('btnSerialConnect');
const serialTerminal = document.getElementById('serialTerminal');
const serialInput = document.getElementById('serialInput');
const btnSerialSend = document.getElementById('btnSerialSend');
const serialAutoScroll = document.getElementById('serialAutoScroll');
const serialShowTimestamp = document.getElementById('serialShowTimestamp');
const btnSerialClear = document.getElementById('btnSerialClear');
const btnSerialDownload = document.getElementById('btnSerialDownload');

// --- Serial Monitor Sub-tab DOM Elements ---
const subTabSerialBtn = document.getElementById('subTabSerialBtn');
const subTabFlasherBtn = document.getElementById('subTabFlasherBtn');
const subViewSerial = document.getElementById('subViewSerial');
const subViewFlasher = document.getElementById('subViewFlasher');

// --- Web Flasher DOM Elements ---
const flasherStatus = document.getElementById('flasherStatus');
const flasherStatusLabel = document.getElementById('flasherStatusLabel');
const btnFlasherConnect = document.getElementById('btnFlasherConnect');
const chipInfoCard = document.getElementById('chipInfoCard');
const chipType = document.getElementById('chipType');
const chipMac = document.getElementById('chipMac');
const chipFlashSize = document.getElementById('chipFlashSize');
const chipCrystal = document.getElementById('chipCrystal');
const fwSrcUploadBtn = document.getElementById('fwSrcUploadBtn');
const fwSrcServerBtn = document.getElementById('fwSrcServerBtn');
const fwSrcUpload = document.getElementById('fwSrcUpload');
const fwSrcServer = document.getElementById('fwSrcServer');
const fileDropZone = document.getElementById('fileDropZone');
const firmwareFileInput = document.getElementById('firmwareFileInput');
const selectedFileInfo = document.getElementById('selectedFileInfo');
const selectedFileName = document.getElementById('selectedFileName');
const selectedFileSize = document.getElementById('selectedFileSize');
const btnClearFile = document.getElementById('btnClearFile');
const serverFirmwareList = document.getElementById('serverFirmwareList');
const flashOffset = document.getElementById('flashOffset');
const btnEraseFlash = document.getElementById('btnEraseFlash');
const btnFlashFirmware = document.getElementById('btnFlashFirmware');
const flashProgressContainer = document.getElementById('flashProgressContainer');
const flashProgressLabel = document.getElementById('flashProgressLabel');
const flashProgressPercent = document.getElementById('flashProgressPercent');
const flashProgressBar = document.getElementById('flashProgressBar');
const flasherConsole = document.getElementById('flasherConsole');
const btnClearFlasherConsole = document.getElementById('btnClearFlasherConsole');

// --- Serial Monitor State ---
let serialPort = null;
let serialReader = null;
let serialWriter = null;
let serialReadable = null;
let serialIsConnected = false;
let serialLineBuffer = '';
let serialLogContent = '';
const SERIAL_MAX_LINES = 5000;
let serialLineCount = 0;

// --- Web Flasher State ---
let flasherPort = null;
let flasherTransport = null;
let espLoader = null;
let flasherIsConnected = false;
let selectedFirmwareFile = null;
let selectedServerFirmware = null;
let esptoolModule = null;

// --- Tools Sub-tab Switcher ---
if (subTabSerialBtn && subTabFlasherBtn) {
  subTabSerialBtn.addEventListener('click', () => switchToolsSubTab('serial'));
  subTabFlasherBtn.addEventListener('click', () => switchToolsSubTab('flasher'));
}

// =============================================================
// SERIAL MONITOR MODULE
// =============================================================

function updateSerialUI(connected) {
  serialIsConnected = connected;
  if (connected) {
    serialStatusIndicator.classList.add('connected');
    serialStatusLabel.textContent = 'Terhubung';
    btnSerialConnect.classList.add('connected');
    btnSerialConnect.querySelector('span').textContent = 'Putuskan';
    serialInput.disabled = false;
    btnSerialSend.disabled = false;
  } else {
    serialStatusIndicator.classList.remove('connected');
    serialStatusLabel.textContent = 'Terputus';
    serialPortName.textContent = '';
    btnSerialConnect.classList.remove('connected');
    btnSerialConnect.querySelector('span').textContent = 'Hubungkan';
    serialInput.disabled = true;
    btnSerialSend.disabled = true;
  }
}

async function connectSerial() {
  if (!isWebSerialSupported) {
    showToast('❌ Browser ini tidak mendukung Web Serial API');
    return;
  }

  try {
    serialPort = await navigator.serial.requestPort();
    const baudRate = parseInt(serialBaudRate.value) || 115200;

    await serialPort.open({ baudRate });

    const info = serialPort.getInfo();
    const portLabel = info.usbVendorId
      ? `USB (VID:${info.usbVendorId.toString(16).toUpperCase()} PID:${info.usbProductId.toString(16).toUpperCase()})`
      : 'Serial Port';
    serialPortName.textContent = portLabel;

    updateSerialUI(true);
    appendToTerminal(`--- Port terbuka (${baudRate} baud) ---`, true);
    showToast(`🔌 Serial terhubung @ ${baudRate} baud`);

    // Mulai membaca
    readSerialLoop();
  } catch (err) {
    if (err.name !== 'NotFoundError') {
      console.error('[Serial] Connect error:', err);
      appendToTerminal(`❌ Error: ${err.message}`, true);
      showToast(`❌ Gagal menghubungkan serial: ${err.message}`);
    }
  }
}

async function disconnectSerial() {
  try {
    if (serialReader) {
      await serialReader.cancel();
      serialReader = null;
    }
    if (serialPort) {
      await serialPort.close();
      serialPort = null;
    }
  } catch (err) {
    console.warn('[Serial] Disconnect:', err.message);
  }
  updateSerialUI(false);
  appendToTerminal('--- Port ditutup ---', true);
  showToast('🔌 Serial terputus');
}

async function readSerialLoop() {
  const decoder = new TextDecoderStream();
  serialReadable = serialPort.readable.pipeTo(decoder.writable);
  serialReader = decoder.readable.getReader();

  try {
    while (true) {
      const { value, done } = await serialReader.read();
      if (done) break;
      if (value) {
        serialLineBuffer += value;

        // Proses per baris
        const lines = serialLineBuffer.split('\n');
        serialLineBuffer = lines.pop(); // Sisa yang belum selesai

        for (const line of lines) {
          const cleanLine = line.replace(/\r$/, '');
          if (cleanLine.length > 0) {
            appendToTerminal(cleanLine);
          }
        }
      }
    }
  } catch (err) {
    if (err.name !== 'TypeError' && !err.message.includes('cancelled')) {
      console.error('[Serial] Read error:', err);
      appendToTerminal(`❌ Read error: ${err.message}`, true);
    }
  } finally {
    serialReader = null;
    if (serialIsConnected) {
      updateSerialUI(false);
      appendToTerminal('--- Koneksi terputus ---', true);
    }
  }
}

async function sendSerialData(text) {
  if (!serialPort || !serialPort.writable) return;

  try {
    const encoder = new TextEncoder();
    const writer = serialPort.writable.getWriter();
    await writer.write(encoder.encode(text + '\n'));
    writer.releaseLock();
    appendToTerminal(`> ${text}`, true);
  } catch (err) {
    console.error('[Serial] Send error:', err);
    showToast(`❌ Gagal mengirim: ${err.message}`);
  }
}

function appendToTerminal(text, isSystem = false) {
  // Enforce max lines
  if (serialLineCount >= SERIAL_MAX_LINES) {
    const firstChild = serialTerminal.querySelector('.serial-line');
    if (firstChild) firstChild.remove();
    serialLineCount--;
  }

  // Hapus welcome message jika masih ada
  const welcome = serialTerminal.querySelector('.serial-welcome-msg');
  if (welcome) welcome.remove();

  const lineEl = document.createElement('span');
  lineEl.className = 'serial-line';

  let displayText = '';

  if (serialShowTimestamp.checked) {
    const now = new Date();
    const ts = now.toLocaleTimeString('id-ID', { hour12: false }) + '.' + now.getMilliseconds().toString().padStart(3, '0');
    displayText += `<span class="serial-timestamp">[${ts}]</span>`;
  }

  if (isSystem) {
    displayText += `<span style="color: var(--accent-blue)">${escapeHtml(text)}</span>`;
  } else {
    displayText += escapeHtml(text);
  }

  lineEl.innerHTML = displayText;
  serialTerminal.appendChild(lineEl);
  serialLineCount++;

  // Log untuk download
  serialLogContent += text + '\n';

  // Auto-scroll
  if (serialAutoScroll.checked) {
    serialTerminal.scrollTop = serialTerminal.scrollHeight;
  }
}

function clearTerminal() {
  serialTerminal.innerHTML = '';
  serialLineCount = 0;
  serialLogContent = '';
  showToast('🗑️ Terminal dibersihkan');
}

function downloadSerialLog() {
  if (!serialLogContent) {
    showToast('ℹ️ Tidak ada log untuk diunduh');
    return;
  }
  const blob = new Blob([serialLogContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `serial_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Log serial diunduh');
}

// --- Serial Monitor Event Listeners ---
if (btnSerialConnect) {
  btnSerialConnect.addEventListener('click', () => {
    if (serialIsConnected) {
      disconnectSerial();
    } else {
      connectSerial();
    }
  });
}

if (btnSerialSend) {
  btnSerialSend.addEventListener('click', () => {
    const text = serialInput.value.trim();
    if (text) {
      sendSerialData(text);
      serialInput.value = '';
      serialInput.focus();
    }
  });
}

if (serialInput) {
  serialInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnSerialSend.click();
    }
  });
}

if (btnSerialClear) btnSerialClear.addEventListener('click', clearTerminal);
if (btnSerialDownload) btnSerialDownload.addEventListener('click', downloadSerialLog);

// =============================================================
// WEB FLASHER MODULE (esptool-js via CDN)
// =============================================================

function flasherLog(text, level = 'info') {
  const line = document.createElement('span');
  line.className = `console-line ${level}`;
  line.textContent = `> ${text}`;
  flasherConsole.appendChild(line);
  flasherConsole.scrollTop = flasherConsole.scrollHeight;
}

function updateFlasherUI(connected) {
  flasherIsConnected = connected;
  if (connected) {
    flasherStatus.classList.add('connected');
    flasherStatusLabel.textContent = 'Terhubung';
    btnFlasherConnect.classList.add('connected');
    btnFlasherConnect.querySelector('span').textContent = 'Putuskan';
    btnEraseFlash.disabled = false;
  } else {
    flasherStatus.classList.remove('connected');
    flasherStatusLabel.textContent = 'Tidak terhubung';
    btnFlasherConnect.classList.remove('connected');
    btnFlasherConnect.querySelector('span').textContent = 'Hubungkan Port';
    btnEraseFlash.disabled = true;
    btnFlashFirmware.disabled = true;
    chipInfoCard.classList.add('hidden');
  }
}

function updateFlashButtonState() {
  const hasFirmware = selectedFirmwareFile || selectedServerFirmware;
  btnFlashFirmware.disabled = !(flasherIsConnected && hasFirmware);
}

async function loadEsptoolModule() {
  if (esptoolModule) return esptoolModule;

  flasherLog('Mengunduh esptool-js dari CDN...', 'info');
  try {
    esptoolModule = await import('https://unpkg.com/esptool-js@0.4.5/bundle.js');
    flasherLog('esptool-js berhasil dimuat ✓', 'success');
    return esptoolModule;
  } catch (err) {
    flasherLog(`Gagal memuat esptool-js: ${err.message}`, 'error');
    showToast('❌ Gagal memuat esptool-js. Pastikan ada koneksi internet.');
    throw err;
  }
}

async function connectFlasher() {
  if (!isWebSerialSupported) {
    showToast('❌ Browser tidak mendukung Web Serial API');
    return;
  }

  try {
    const mod = await loadEsptoolModule();
    const { ESPLoader, Transport } = mod;

    flasherPort = await navigator.serial.requestPort();
    flasherTransport = new Transport(flasherPort, true);

    flasherLog('Menghubungkan ke perangkat ESP...', 'info');

    const loaderTerminal = {
      clean() {},
      writeLine(data) { flasherLog(data, 'info'); },
      write(data) { /* silent */ }
    };

    espLoader = new ESPLoader({
      transport: flasherTransport,
      baudrate: 115200,
      terminal: loaderTerminal,
      romBaudrate: 115200,
    });

    const chipName = await espLoader.main();
    flasherLog(`Chip terdeteksi: ${chipName}`, 'success');

    // Tampilkan info chip
    chipType.textContent = chipName || '—';

    try {
      const macAddr = await espLoader.readMac();
      chipMac.textContent = macAddr ? macAddr.toString() : '—';
    } catch { chipMac.textContent = '—'; }

    try {
      const flashSizeBytes = await espLoader.getFlashSize();
      const flashSizeMB = flashSizeBytes ? (flashSizeBytes / (1024 * 1024)).toFixed(0) + ' MB' : '—';
      chipFlashSize.textContent = flashSizeMB;
    } catch { chipFlashSize.textContent = '—'; }

    chipCrystal.textContent = espLoader.chipFamily || '—';

    chipInfoCard.classList.remove('hidden');
    updateFlasherUI(true);
    updateFlashButtonState();
    showToast(`🔬 ${chipName} terdeteksi!`);

  } catch (err) {
    if (err.name !== 'NotFoundError') {
      console.error('[Flasher] Connect error:', err);
      flasherLog(`Error: ${err.message}`, 'error');
      showToast(`❌ Gagal menghubungkan: ${err.message}`);
    }
    updateFlasherUI(false);
  }
}

async function disconnectFlasher() {
  try {
    if (flasherTransport) {
      await flasherTransport.disconnect();
      flasherTransport = null;
    }
    if (flasherPort) {
      try { await flasherPort.close(); } catch {}
      flasherPort = null;
    }
  } catch (err) {
    console.warn('[Flasher] Disconnect:', err.message);
  }
  espLoader = null;
  updateFlasherUI(false);
  flasherLog('Perangkat diputuskan', 'info');
  showToast('🔌 Flasher terputus');
}

async function eraseFlash() {
  if (!espLoader) {
    showToast('⚠️ Hubungkan perangkat terlebih dahulu');
    return;
  }

  openCustomModal({
    title: '⚠️ Konfirmasi Erase Flash',
    bodyHtml: `
      <p style="color: var(--text-muted); font-size: 0.88rem; line-height: 1.6;">
        Menghapus seluruh flash memory akan <strong style="color: var(--danger-glow);">menghapus semua data, firmware, dan konfigurasi</strong> pada perangkat.
        <br><br>Proses ini tidak bisa dibatalkan. Lanjutkan?
      </p>
    `,
    confirmText: 'Ya, Hapus Flash',
    isDanger: true,
    onConfirm: async () => {
      flasherLog('Memulai erase flash...', 'warning');
      flashProgressContainer.classList.remove('hidden');
      flashProgressLabel.textContent = 'Menghapus flash...';
      flashProgressPercent.textContent = '...';
      flashProgressBar.style.width = '50%';

      try {
        await espLoader.eraseFlash();
        flasherLog('Flash berhasil dihapus! ✓', 'success');
        flashProgressLabel.textContent = 'Selesai!';
        flashProgressPercent.textContent = '100%';
        flashProgressBar.style.width = '100%';
        showToast('✅ Flash memory berhasil dihapus');
      } catch (err) {
        flasherLog(`Erase gagal: ${err.message}`, 'error');
        showToast(`❌ Erase gagal: ${err.message}`);
      }

      setTimeout(() => flashProgressContainer.classList.add('hidden'), 3000);
    }
  });
}

async function flashFirmware() {
  if (!espLoader) {
    showToast('⚠️ Hubungkan perangkat terlebih dahulu');
    return;
  }

  let firmwareData = null;

  if (selectedFirmwareFile) {
    // Dari file upload
    firmwareData = await selectedFirmwareFile.arrayBuffer();
    flasherLog(`Firmware dari file: ${selectedFirmwareFile.name} (${(selectedFirmwareFile.size / 1024).toFixed(1)} KB)`, 'info');
  } else if (selectedServerFirmware) {
    // Dari server — download dulu
    flasherLog(`Mengunduh firmware dari server: ${selectedServerFirmware.name}...`, 'info');
    try {
      const res = await fetch(selectedServerFirmware.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      firmwareData = await res.arrayBuffer();
      flasherLog(`Firmware diunduh: ${(firmwareData.byteLength / 1024).toFixed(1)} KB ✓`, 'success');
    } catch (err) {
      flasherLog(`Gagal mengunduh firmware: ${err.message}`, 'error');
      showToast(`❌ Gagal mengunduh firmware`);
      return;
    }
  } else {
    showToast('⚠️ Pilih firmware terlebih dahulu');
    return;
  }

  const offset = parseInt(flashOffset.value) || 0;
  flasherLog(`Memulai flashing ke offset ${flashOffset.value}...`, 'info');

  flashProgressContainer.classList.remove('hidden');
  flashProgressLabel.textContent = 'Menulis firmware...';
  flashProgressPercent.textContent = '0%';
  flashProgressBar.style.width = '0%';

  // Disable buttons during flash
  btnFlashFirmware.disabled = true;
  btnEraseFlash.disabled = true;

  try {
    const binaryString = Array.from(new Uint8Array(firmwareData))
      .map(b => String.fromCharCode(b))
      .join('');

    await espLoader.writeFlash({
      fileArray: [{ data: binaryString, address: offset }],
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        const percent = Math.round((written / total) * 100);
        flashProgressPercent.textContent = `${percent}%`;
        flashProgressBar.style.width = `${percent}%`;
        flashProgressLabel.textContent = `Menulis... (${(written / 1024).toFixed(0)} / ${(total / 1024).toFixed(0)} KB)`;
      }
    });

    flasherLog('Firmware berhasil ditulis! ✓', 'success');
    flashProgressLabel.textContent = 'Selesai! Mereset perangkat...';
    flashProgressPercent.textContent = '100%';
    flashProgressBar.style.width = '100%';
    showToast('✅ Firmware berhasil di-flash!');

    // Hard reset
    try {
      await espLoader.hardReset();
      flasherLog('Perangkat di-reset. Firmware baru aktif.', 'success');
    } catch {}

  } catch (err) {
    flasherLog(`Flash gagal: ${err.message}`, 'error');
    showToast(`❌ Flash gagal: ${err.message}`);
  }

  btnEraseFlash.disabled = false;
  updateFlashButtonState();

  setTimeout(() => flashProgressContainer.classList.add('hidden'), 5000);
}

// --- Firmware Source Switcher ---
if (fwSrcUploadBtn && fwSrcServerBtn) {
  fwSrcUploadBtn.addEventListener('click', () => {
    fwSrcUploadBtn.classList.add('active');
    fwSrcServerBtn.classList.remove('active');
    fwSrcUpload.classList.remove('hidden');
    fwSrcServer.classList.add('hidden');
  });

  fwSrcServerBtn.addEventListener('click', () => {
    fwSrcServerBtn.classList.add('active');
    fwSrcUploadBtn.classList.remove('active');
    fwSrcServer.classList.remove('hidden');
    fwSrcUpload.classList.add('hidden');
    loadServerFirmwareList();
  });
}

// --- File Upload Handling ---
if (fileDropZone) {
  fileDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDropZone.classList.add('drag-over');
  });

  fileDropZone.addEventListener('dragleave', () => {
    fileDropZone.classList.remove('drag-over');
  });

  fileDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.bin')) {
      handleFirmwareFileSelected(file);
    } else {
      showToast('⚠️ Hanya file .bin yang diterima');
    }
  });
}

if (firmwareFileInput) {
  firmwareFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFirmwareFileSelected(file);
  });
}

function handleFirmwareFileSelected(file) {
  selectedFirmwareFile = file;
  selectedServerFirmware = null;
  selectedFileName.textContent = file.name;
  selectedFileSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;
  fileDropZone.classList.add('hidden');
  selectedFileInfo.classList.remove('hidden');
  updateFlashButtonState();
  flasherLog(`File dipilih: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, 'info');
}

if (btnClearFile) {
  btnClearFile.addEventListener('click', () => {
    selectedFirmwareFile = null;
    firmwareFileInput.value = '';
    selectedFileInfo.classList.add('hidden');
    fileDropZone.classList.remove('hidden');
    updateFlashButtonState();
  });
}

// --- Server Firmware List ---
async function loadServerFirmwareList() {
  serverFirmwareList.innerHTML = '<div class="empty-state-card"><span>Memuat...</span></div>';

  try {
    const res = await fetch('/api/firmwares', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (!data.success || !data.data || data.data.length === 0) {
      serverFirmwareList.innerHTML = `
        <div class="empty-state-card">
          <span>Tidak ada file .bin di folder <code>firmwares/</code> server.</span>
        </div>`;
      return;
    }

    serverFirmwareList.innerHTML = '';
    data.data.forEach(fw => {
      const item = document.createElement('div');
      item.className = 'fw-server-item';
      item.innerHTML = `
        <span class="fw-icon">📦</span>
        <div class="fw-details">
          <span class="fw-name">${escapeHtml(fw.name)}</span>
          <span class="fw-meta">${(fw.size / 1024).toFixed(1)} KB &bull; ${new Date(fw.modified).toLocaleString('id-ID')}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        // Deselect semua
        serverFirmwareList.querySelectorAll('.fw-server-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedServerFirmware = fw;
        selectedFirmwareFile = null;
        updateFlashButtonState();
        flasherLog(`Firmware server dipilih: ${fw.name}`, 'info');
      });
      serverFirmwareList.appendChild(item);
    });
  } catch (err) {
    serverFirmwareList.innerHTML = `
      <div class="empty-state-card">
        <span>Gagal memuat daftar firmware</span>
      </div>`;
  }
}

// --- Flasher Button Events ---
if (btnFlasherConnect) {
  btnFlasherConnect.addEventListener('click', () => {
    if (flasherIsConnected) {
      disconnectFlasher();
    } else {
      connectFlasher();
    }
  });
}

if (btnEraseFlash) btnEraseFlash.addEventListener('click', eraseFlash);
if (btnFlashFirmware) btnFlashFirmware.addEventListener('click', flashFirmware);
if (btnClearFlasherConsole) {
  btnClearFlasherConsole.addEventListener('click', () => {
    flasherConsole.innerHTML = '<span class="console-line info">> Console dibersihkan</span>';
  });
}

// --- Show unsupported banner when Tools tab is opened ---
function checkWebSerialSupport() {
  if (!isWebSerialSupported && webSerialUnsupported) {
    webSerialUnsupported.classList.remove('hidden');
  }
}

// Inisialisasi awal saat load
checkAuthSession();
