// =============================================================
// Web Serial Monitor, Web Flasher & Remote OTA Tools Module
// AgyGateway Universal IoT Server v4.0
// =============================================================

import { state, escapeHtml, showToast } from '../state.js';

let serialPort = null;
let serialReader = null;
let serialIsConnected = false;
let serialLineBuffer = '';
let serialLogContent = '';
const SERIAL_MAX_LINES = 3000;
let serialLineCount = 0;

let flasherPort = null;
let flasherTransport = null;
let espLoader = null;
let flasherIsConnected = false;
let selectedFirmwareFile = null;
let selectedServerFirmware = null;
let esptoolModule = null;

export function initWebSerialTools() {
  const isWebSerialSupported = 'serial' in navigator;
  const unsupportedBanner = document.getElementById('webSerialUnsupported');
  if (!isWebSerialSupported && unsupportedBanner) {
    unsupportedBanner.classList.remove('hidden');
  }

  // Sub-tab switcher
  const subTabSerialBtn = document.getElementById('subTabSerialBtn');
  const subTabFlasherBtn = document.getElementById('subTabFlasherBtn');
  const subTabOtaBtn = document.getElementById('subTabOtaBtn');
  const subViewSerial = document.getElementById('subViewSerial');
  const subViewFlasher = document.getElementById('subViewFlasher');
  const subViewOta = document.getElementById('subViewOta');

  function switchToolsSubTab(tab) {
    [subTabSerialBtn, subTabFlasherBtn, subTabOtaBtn].forEach(b => b && b.classList.remove('active'));
    [subViewSerial, subViewFlasher, subViewOta].forEach(v => v && v.classList.add('hidden'));

    if (tab === 'serial') {
      if (subTabSerialBtn) subTabSerialBtn.classList.add('active');
      if (subViewSerial) subViewSerial.classList.remove('hidden');
    } else if (tab === 'flasher') {
      if (subTabFlasherBtn) subTabFlasherBtn.classList.add('active');
      if (subViewFlasher) subViewFlasher.classList.remove('hidden');
    } else if (tab === 'ota') {
      if (subTabOtaBtn) subTabOtaBtn.classList.add('active');
      if (subViewOta) subViewOta.classList.remove('hidden');
      loadServerFirmwaresForOta();
      populateOtaDevices();
    }
  }

  if (subTabSerialBtn) subTabSerialBtn.addEventListener('click', () => switchToolsSubTab('serial'));
  if (subTabFlasherBtn) subTabFlasherBtn.addEventListener('click', () => switchToolsSubTab('flasher'));
  if (subTabOtaBtn) subTabOtaBtn.addEventListener('click', () => switchToolsSubTab('ota'));

  // Serial Monitor Events
  const btnSerialConnect = document.getElementById('btnSerialConnect');
  const btnSerialSend = document.getElementById('btnSerialSend');
  const serialInput = document.getElementById('serialInput');
  const btnSerialClear = document.getElementById('btnSerialClear');
  const btnSerialDownload = document.getElementById('btnSerialDownload');

  if (btnSerialConnect) {
    btnSerialConnect.addEventListener('click', () => {
      if (serialIsConnected) disconnectSerial();
      else connectSerial();
    });
  }

  if (btnSerialSend && serialInput) {
    btnSerialSend.addEventListener('click', () => {
      const txt = serialInput.value.trim();
      if (txt) {
        sendSerialData(txt);
        serialInput.value = '';
      }
    });
    serialInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnSerialSend.click();
    });
  }

  if (btnSerialClear) btnSerialClear.addEventListener('click', clearTerminal);
  if (btnSerialDownload) btnSerialDownload.addEventListener('click', downloadSerialLog);

  // Web Flasher Events
  const btnFlasherConnect = document.getElementById('btnFlasherConnect');
  const btnEraseFlash = document.getElementById('btnEraseFlash');
  const btnFlashFirmware = document.getElementById('btnFlashFirmware');
  const btnClearFlasherConsole = document.getElementById('btnClearFlasherConsole');
  const fileDropZone = document.getElementById('fileDropZone');
  const firmwareFileInput = document.getElementById('firmwareFileInput');
  const btnClearFile = document.getElementById('btnClearFile');
  const fwSrcUploadBtn = document.getElementById('fwSrcUploadBtn');
  const fwSrcServerBtn = document.getElementById('fwSrcServerBtn');
  const fwSrcUpload = document.getElementById('fwSrcUpload');
  const fwSrcServer = document.getElementById('fwSrcServer');

  if (btnFlasherConnect) {
    btnFlasherConnect.addEventListener('click', () => {
      if (flasherIsConnected) disconnectFlasher();
      else connectFlasher();
    });
  }

  if (btnEraseFlash) btnEraseFlash.addEventListener('click', eraseFlash);
  if (btnFlashFirmware) btnFlashFirmware.addEventListener('click', flashFirmware);

  if (btnClearFlasherConsole) {
    btnClearFlasherConsole.addEventListener('click', () => {
      const flasherConsole = document.getElementById('flasherConsole');
      if (flasherConsole) flasherConsole.innerHTML = '<span class="console-line info">> Console dibersihkan</span>';
    });
  }

  if (fwSrcUploadBtn && fwSrcServerBtn) {
    fwSrcUploadBtn.addEventListener('click', () => {
      fwSrcUploadBtn.classList.add('active');
      fwSrcServerBtn.classList.remove('active');
      if (fwSrcUpload) fwSrcUpload.classList.remove('hidden');
      if (fwSrcServer) fwSrcServer.classList.add('hidden');
    });

    fwSrcServerBtn.addEventListener('click', () => {
      fwSrcServerBtn.classList.add('active');
      fwSrcUploadBtn.classList.remove('active');
      if (fwSrcServer) fwSrcServer.classList.remove('hidden');
      if (fwSrcUpload) fwSrcUpload.classList.add('hidden');
      loadServerFirmwareList();
    });
  }

  if (fileDropZone && firmwareFileInput) {
    fileDropZone.addEventListener('dragover', (e) => { e.preventDefault(); fileDropZone.classList.add('drag-over'); });
    fileDropZone.addEventListener('dragleave', () => fileDropZone.classList.remove('drag-over'));
    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith('.bin')) handleFirmwareFileSelected(f);
    });
    firmwareFileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) handleFirmwareFileSelected(f);
    });
  }

  if (btnClearFile) {
    btnClearFile.addEventListener('click', () => {
      selectedFirmwareFile = null;
      if (firmwareFileInput) firmwareFileInput.value = '';
      const selectedFileInfo = document.getElementById('selectedFileInfo');
      if (selectedFileInfo) selectedFileInfo.classList.add('hidden');
      if (fileDropZone) fileDropZone.classList.remove('hidden');
      updateFlashButtonState();
    });
  }

  // Remote OTA Events
  const btnStartOta = document.getElementById('btnStartOta');
  if (btnStartOta) {
    btnStartOta.addEventListener('click', startOtaUpdate);
  }

  state.on('otaProgress', (msg) => {
    const bar = document.getElementById('otaProgressBar');
    const percentEl = document.getElementById('otaProgressPercent');
    const detailsEl = document.getElementById('otaByteDetails');
    const container = document.getElementById('otaLiveProgressContainer');

    if (container) container.classList.remove('hidden');
    if (bar) bar.style.width = `${msg.percent}%`;
    if (percentEl) percentEl.textContent = `${msg.percent}%`;
    if (detailsEl) detailsEl.textContent = `${(msg.current / 1024).toFixed(0)} / ${(msg.total / 1024).toFixed(0)} KB`;
  });
}

// -------------------------------------------------------------
// Serial Monitor Functions
// -------------------------------------------------------------
async function connectSerial() {
  if (!('serial' in navigator)) {
    showToast('Browser ini tidak mendukung Web Serial API', false);
    return;
  }

  try {
    serialPort = await navigator.serial.requestPort();
    const baudEl = document.getElementById('serialBaudRate');
    const baudRate = parseInt(baudEl ? baudEl.value : 115200) || 115200;

    await serialPort.open({ baudRate });
    updateSerialUI(true);
    appendToTerminal(`--- Port Serial Terbuka (${baudRate} baud) ---`, true);
    showToast(`Serial terhubung @ ${baudRate} baud`);

    readSerialLoop();
  } catch (err) {
    if (err.name !== 'NotFoundError') {
      appendToTerminal(`Error: ${err.message}`, true);
      showToast(`Gagal menghubungkan serial: ${err.message}`, false);
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
  } catch (err) {}
  updateSerialUI(false);
  appendToTerminal('--- Port serial ditutup ---', true);
}

function updateSerialUI(connected) {
  serialIsConnected = connected;
  const statusLabel = document.getElementById('serialStatusLabel');
  const indicator = document.getElementById('serialStatusIndicator');
  const btn = document.getElementById('btnSerialConnect');
  const input = document.getElementById('serialInput');
  const btnSend = document.getElementById('btnSerialSend');

  if (connected) {
    if (statusLabel) statusLabel.textContent = 'Terhubung';
    if (indicator) indicator.classList.add('connected');
    if (btn) {
      btn.classList.add('connected');
      btn.querySelector('span').textContent = 'Putuskan';
    }
    if (input) input.disabled = false;
    if (btnSend) btnSend.disabled = false;
  } else {
    if (statusLabel) statusLabel.textContent = 'Terputus';
    if (indicator) indicator.classList.remove('connected');
    if (btn) {
      btn.classList.remove('connected');
      btn.querySelector('span').textContent = 'Hubungkan';
    }
    if (input) input.disabled = true;
    if (btnSend) btnSend.disabled = true;
  }
}

async function readSerialLoop() {
  const decoder = new TextDecoderStream();
  const readableStreamClosed = serialPort.readable.pipeTo(decoder.writable);
  serialReader = decoder.readable.getReader();

  try {
    while (true) {
      const { value, done } = await serialReader.read();
      if (done) break;
      if (value) {
        serialLineBuffer += value;
        const lines = serialLineBuffer.split('\n');
        serialLineBuffer = lines.pop();
        lines.forEach(l => appendToTerminal(l.replace(/\r$/, '')));
      }
    }
  } catch (err) {
  } finally {
    serialReader = null;
    if (serialIsConnected) updateSerialUI(false);
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
    showToast(`Gagal mengirim: ${err.message}`, false);
  }
}

function appendToTerminal(text, isSystem = false) {
  const terminal = document.getElementById('serialTerminal');
  if (!terminal) return;

  const lineEl = document.createElement('span');
  lineEl.className = 'serial-line';
  lineEl.innerHTML = isSystem ? `<span style="color: var(--accent-blue)">${escapeHtml(text)}</span>` : escapeHtml(text);

  terminal.appendChild(lineEl);
  serialLogContent += text + '\n';
  terminal.scrollTop = terminal.scrollHeight;
}

function clearTerminal() {
  const terminal = document.getElementById('serialTerminal');
  if (terminal) terminal.innerHTML = '';
  serialLogContent = '';
  showToast('Terminal dibersihkan');
}

function downloadSerialLog() {
  if (!serialLogContent) return;
  const blob = new Blob([serialLogContent], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `serial_log_${Date.now()}.txt`;
  a.click();
}

// -------------------------------------------------------------
// Web Flasher Functions
// -------------------------------------------------------------
function flasherLog(text, level = 'info') {
  const consoleEl = document.getElementById('flasherConsole');
  if (!consoleEl) return;
  const line = document.createElement('span');
  line.className = `console-line ${level}`;
  line.textContent = `> ${text}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function handleFirmwareFileSelected(file) {
  selectedFirmwareFile = file;
  selectedServerFirmware = null;
  const nameEl = document.getElementById('selectedFileName');
  const sizeEl = document.getElementById('selectedFileSize');
  const infoEl = document.getElementById('selectedFileInfo');
  const dropZone = document.getElementById('fileDropZone');

  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) sizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
  if (dropZone) dropZone.classList.add('hidden');
  if (infoEl) infoEl.classList.remove('hidden');
  updateFlashButtonState();
  flasherLog(`File dipilih: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, 'info');
}

function updateFlashButtonState() {
  const btn = document.getElementById('btnFlashFirmware');
  const hasFw = selectedFirmwareFile || selectedServerFirmware;
  if (btn) btn.disabled = !(flasherIsConnected && hasFw);
}

async function loadEsptoolModule() {
  if (esptoolModule) return esptoolModule;
  flasherLog('Mengunduh esptool-js dari CDN...', 'info');
  try {
    esptoolModule = await import('https://unpkg.com/esptool-js@0.4.5/bundle.js');
    flasherLog('esptool-js siap digunakan ✓', 'success');
    return esptoolModule;
  } catch (err) {
    flasherLog(`Gagal memuat esptool: ${err.message}`, 'error');
    throw err;
  }
}

async function connectFlasher() {
  try {
    const mod = await loadEsptoolModule();
    const { ESPLoader, Transport } = mod;

    flasherPort = await navigator.serial.requestPort();
    flasherTransport = new Transport(flasherPort, true);

    flasherLog('Menghubungkan ke mikrokontroler...', 'info');
    espLoader = new ESPLoader({
      transport: flasherTransport,
      baudrate: 115200,
      terminal: {
        clean() {},
        writeLine(d) { flasherLog(d, 'info'); },
        write(d) {}
      }
    });

    const chipName = await espLoader.main();
    flasherLog(`Chip terdeteksi: ${chipName}`, 'success');

    const chipTypeEl = document.getElementById('chipType');
    if (chipTypeEl) chipTypeEl.textContent = chipName;

    const chipCard = document.getElementById('chipInfoCard');
    if (chipCard) chipCard.classList.remove('hidden');

    flasherIsConnected = true;
    updateFlasherUI(true);
    updateFlashButtonState();
    showToast(`Hardware ${chipName} terdeteksi!`);
  } catch (err) {
    if (err.name !== 'NotFoundError') {
      flasherLog(`Error: ${err.message}`, 'error');
      showToast(`Gagal menghubungkan port: ${err.message}`, false);
    }
  }
}

function updateFlasherUI(connected) {
  const label = document.getElementById('flasherStatusLabel');
  const btnConnect = document.getElementById('btnFlasherConnect');
  const btnErase = document.getElementById('btnEraseFlash');

  if (connected) {
    if (label) label.textContent = 'Terhubung';
    if (btnConnect) {
      btnConnect.classList.add('connected');
      btnConnect.querySelector('span').textContent = 'Putuskan Port';
    }
    if (btnErase) btnErase.disabled = false;
  } else {
    if (label) label.textContent = 'Tidak terhubung';
    if (btnConnect) {
      btnConnect.classList.remove('connected');
      btnConnect.querySelector('span').textContent = 'Hubungkan Port COM';
    }
    if (btnErase) btnErase.disabled = true;
  }
}

async function disconnectFlasher() {
  try {
    if (flasherTransport) await flasherTransport.disconnect();
    if (flasherPort) await flasherPort.close();
  } catch (e) {}
  flasherPort = null;
  flasherTransport = null;
  espLoader = null;
  flasherIsConnected = false;
  updateFlasherUI(false);
  updateFlashButtonState();
  flasherLog('Port diputuskan', 'info');
}

async function eraseFlash() {
  if (!espLoader) return;
  if (!confirm('Hapus seluruh memori flash chip? Semua data firmware akan terhapus.')) return;

  flasherLog('Memulai erase flash...', 'warning');
  try {
    await espLoader.eraseFlash();
    flasherLog('Flash memory berhasil dihapus! ✓', 'success');
    showToast('Flash memory berhasil dihapus');
  } catch (err) {
    flasherLog(`Erase gagal: ${err.message}`, 'error');
  }
}

async function flashFirmware() {
  if (!espLoader) return;

  let firmwareData = null;
  if (selectedFirmwareFile) {
    firmwareData = await selectedFirmwareFile.arrayBuffer();
  } else if (selectedServerFirmware) {
    flasherLog(`Mengunduh firmware ${selectedServerFirmware.name}...`, 'info');
    const res = await fetch(selectedServerFirmware.url);
    firmwareData = await res.arrayBuffer();
  }

  if (!firmwareData) {
    showToast('Pilih file firmware terlebih dahulu', false);
    return;
  }

  const offsetSelect = document.getElementById('flashOffset');
  const offset = parseInt(offsetSelect ? offsetSelect.value : 0) || 0;

  const progressContainer = document.getElementById('flashProgressContainer');
  const progressLabel = document.getElementById('flashProgressLabel');
  const progressPercent = document.getElementById('flashProgressPercent');
  const progressBar = document.getElementById('flashProgressBar');

  if (progressContainer) progressContainer.classList.remove('hidden');

  try {
    const binaryString = Array.from(new Uint8Array(firmwareData))
      .map(b => String.fromCharCode(b))
      .join('');

    await espLoader.writeFlash({
      fileArray: [{ data: binaryString, address: offset }],
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        const percent = Math.round((written / total) * 100);
        if (progressPercent) progressPercent.textContent = `${percent}%`;
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressLabel) progressLabel.textContent = `Menulis... (${(written / 1024).toFixed(0)} / ${(total / 1024).toFixed(0)} KB)`;
      }
    });

    flasherLog('Firmware berhasil ditulis! ✓', 'success');
    showToast('Firmware berhasil di-flash!');
    try { await espLoader.hardReset(); } catch (e) {}
  } catch (err) {
    flasherLog(`Flash gagal: ${err.message}`, 'error');
    showToast(`Flash gagal: ${err.message}`, false);
  } finally {
    setTimeout(() => {
      if (progressContainer) progressContainer.classList.add('hidden');
    }, 4000);
  }
}

async function loadServerFirmwareList() {
  const container = document.getElementById('serverFirmwareList');
  if (!container) return;

  try {
    const res = await fetch('/api/firmwares', {
      headers: { 'Authorization': `Bearer ${state.authToken}` }
    });
    const data = await res.json();

    if (!data.success || !data.data || data.data.length === 0) {
      container.innerHTML = '<div class="empty-state-card"><span>Tidak ada file .bin di folder firmwares/ server.</span></div>';
      return;
    }

    container.innerHTML = '';
    data.data.forEach(fw => {
      const item = document.createElement('div');
      item.className = 'fw-server-item';
      item.innerHTML = `
        <span class="fw-icon">📦</span>
        <div class="fw-details">
          <span class="fw-name">${escapeHtml(fw.name)}</span>
          <span class="fw-meta">${(fw.size / 1024).toFixed(1)} KB</span>
        </div>
      `;
      item.addEventListener('click', () => {
        container.querySelectorAll('.fw-server-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedServerFirmware = fw;
        selectedFirmwareFile = null;
        updateFlashButtonState();
        flasherLog(`Firmware server dipilih: ${fw.name}`, 'info');
      });
      container.appendChild(item);
    });
  } catch (e) {}
}

// -------------------------------------------------------------
// Remote OTA Updates
// -------------------------------------------------------------
function populateOtaDevices() {
  const select = document.getElementById('otaTargetDevice');
  if (!select) return;

  select.innerHTML = '';
  const devices = Object.values(state.devices);
  devices.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = `${d.name || d.deviceId} (${d.isOnline ? 'Online' : 'Offline'})`;
    select.appendChild(opt);
  });
}

function loadServerFirmwaresForOta() {
  const select = document.getElementById('otaServerFirmware');
  if (!select) return;

  fetch('/api/firmwares', {
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => r.json())
  .then(res => {
    if (res.success && Array.isArray(res.data)) {
      select.innerHTML = '<option value="">-- Pilih Firmware dari Server --</option>';
      res.data.forEach(f => {
        select.innerHTML += `<option value="${escapeHtml(f.url)}">${escapeHtml(f.name)} (${(f.size / 1024).toFixed(1)} KB)</option>`;
      });
    }
  });
}

function startOtaUpdate() {
  const targetDevice = document.getElementById('otaTargetDevice')?.value;
  const customUrl = document.getElementById('otaCustomUrl')?.value.trim();
  const serverFw = document.getElementById('otaServerFirmware')?.value;

  const binUrl = customUrl || serverFw;
  if (!targetDevice || !binUrl) {
    showToast('Pilih perangkat target dan URL firmware', false);
    return;
  }

  fetch('/api/ota/trigger', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.authToken}`
    },
    body: JSON.stringify({ deviceId: targetDevice, binUrl })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      showToast('Instruksi OTA update dikirim ke hardware!');
    } else {
      showToast(res.message || 'Gagal mengirim OTA', false);
    }
  })
  .catch(e => showToast(e.message, false));
}
