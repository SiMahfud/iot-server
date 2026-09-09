// =============================================================
// Component Widgets Factory Pattern (Polymorphic Cards)
// AgyGateway Universal IoT Server v4.0
// =============================================================

import { state, escapeHtml, showToast } from '../state.js';
import { sendWs } from '../wsClient.js';
import { openTelemetryGraphModal } from './telemetryChart.js';

// -------------------------------------------------------------
// Universal Control Dispatcher
// -------------------------------------------------------------
export function triggerComponent(componentId, value, duration = 0) {
  if (!state.activeDeviceId) return;

  const msg = {
    action: 'set_component',
    target: state.activeDeviceId,
    componentId: componentId,
    value: value
  };

  if (duration > 0) {
    msg.duration = duration;
  }

  const sent = sendWs(msg);
  if (!sent) {
    showToast('WebSocket terputus, tidak dapat mengirim perintah', false);
    return;
  }

  // Optimistic local state update — UI langsung berubah tanpa tunggu telemetri
  const dev = state.getActiveDevice();
  if (dev && Array.isArray(dev.components)) {
    const comp = dev.components.find(c => c.id === componentId);
    if (comp) {
      comp.value = typeof value === 'boolean' ? String(value) : String(value);
      // Jika ada timer, tandai sedang countdown
      if (duration > 0) {
        comp._timerUntil = Date.now() + duration * 1000;
      }
      // Micro-update: update toggle di DOM tanpa full re-render
      _updateSwitchDom(componentId, comp.value);
    }
  }
}

// Update DOM saklar secara langsung tanpa re-render seluruh grid
function _updateSwitchDom(componentId, newValue) {
  const card = document.getElementById(`comp-widget-${componentId}`);
  if (!card) return;

  const isOn = newValue === 'true' || newValue === true || newValue === '1';
  const chk = card.querySelector('input[type="checkbox"]');
  const statusText = card.querySelector('[data-status-text]') || card.querySelector('span[style*="font-weight: 700"]');

  if (chk) chk.checked = isOn;
  if (statusText) {
    statusText.textContent = isOn ? 'MENYALA (ON)' : 'MATI (OFF)';
    statusText.style.color = isOn ? 'var(--primary-glow)' : 'var(--text-muted)';
  }
  if (isOn) {
    card.classList.add('active');
  } else {
    card.classList.remove('active');
  }
}


export function calibrateComponent(componentId) {
  if (!state.activeDeviceId) return;

  const msg = {
    action: 'calibrate_component',
    target: state.activeDeviceId,
    componentId: componentId
  };

  sendWs(msg);
  showToast(`Perintah kalibrasi nol (Tare) dikirim ke hardware`);
}

// -------------------------------------------------------------
// Widget Renderers (Factory Methods)
// -------------------------------------------------------------

function getPinTag(c) {
  if (c.pin < 0) return 'I2C / Virtual';
  if (c.pin === 17) return 'A0 (ADC)';
  if (c.pin === 14) return 'D5 (GPIO14)';
  if (c.pin === 12) return 'D6 (GPIO12)';
  if (c.pin === 13) return 'D7 (GPIO13)';
  if (c.pin === 4) return 'D2 (SDA)';
  if (c.pin === 5) return 'D1 (SCL)';
  return `GPIO ${c.pin}`;
}

// 1. SWITCH / RELAY
function renderSwitchCard(c, dev) {
  const card = document.createElement('div');
  card.className = 'component-widget-card';
  card.id = `comp-widget-${c.id}`;

  const isOn = c.value === 'true' || c.value === true || c.value === '1';
  if (isOn) card.classList.add('active');

  card.innerHTML = `
    <div class="comp-header">
      <div class="comp-meta">
        <span class="comp-icon">💡</span>
        <div class="comp-title-wrap">
          <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
          <span class="comp-pin-tag">${getPinTag(c)}</span>
        </div>
      </div>
      <div class="card-actions-group">
        <button type="button" class="btn-card-timer" title="Timer Countdown">⏱ Timer</button>
        <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
        <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus">🗑️</button>
      </div>
    </div>
    <div style="display: flex; align-items: center; justify-content: space-between; margin: 12px 0;">
      <span data-status-text style="font-size: 0.9rem; font-weight: 700; color: ${isOn ? 'var(--primary-glow)' : 'var(--text-muted)'};">
        ${isOn ? 'MENYALA (ON)' : 'MATI (OFF)'}
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
  chk.addEventListener('change', (e) => triggerComponent(c.id, e.target.checked));

  const btnTimer = card.querySelector('.btn-card-timer');
  btnTimer.addEventListener('click', () => openTimerModal(c.id, c.name));

  card.querySelector('.btn-rename-comp').addEventListener('click', () => promptRenameComponent(c.id, c.name));
  card.querySelector('.btn-del-comp').addEventListener('click', () => confirmDeleteComponent(c.id, c.name));

  return card;
}

// 2. DIMMER / PWM SLIDER
function renderDimmerCard(c, dev) {
  const card = document.createElement('div');
  card.className = 'component-widget-card';
  card.id = `comp-widget-${c.id}`;

  const dimVal = Math.min(Math.max(parseInt(c.value) || 0, 0), 100);

  card.innerHTML = `
    <div class="comp-header">
      <div class="comp-meta">
        <span class="comp-icon">🔆</span>
        <div class="comp-title-wrap">
          <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
          <span class="comp-pin-tag">${getPinTag(c)}</span>
        </div>
      </div>
      <div class="card-actions-group">
        <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
        <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus">🗑️</button>
      </div>
    </div>
    <div style="margin: 8px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="font-size: 0.76rem; color: var(--text-muted);">Nilai Output PWM:</span>
        <span id="dim-text-${c.id}" style="font-size: 1rem; font-weight: 800; color: var(--accent-blue);">${dimVal}%</span>
      </div>
      <input type="range" class="dimmer-range-slider" min="0" max="100" value="${dimVal}">
      <div class="dimmer-presets">
        <button type="button" class="btn-dimmer-preset" data-preset="0">0%</button>
        <button type="button" class="btn-dimmer-preset" data-preset="25">25%</button>
        <button type="button" class="btn-dimmer-preset" data-preset="50">50%</button>
        <button type="button" class="btn-dimmer-preset" data-preset="100">100%</button>
      </div>
    </div>
    <div class="comp-footer">
      <span>Dimmer / PWM Analog Out</span>
      <span style="font-family: monospace;">0–100%</span>
    </div>
  `;

  const slider = card.querySelector('.dimmer-range-slider');
  const label = card.querySelector(`#dim-text-${c.id}`);

  slider.addEventListener('input', (e) => { label.textContent = `${e.target.value}%`; });
  slider.addEventListener('change', (e) => { triggerComponent(c.id, parseInt(e.target.value)); });

  card.querySelectorAll('.btn-dimmer-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.preset);
      slider.value = val;
      label.textContent = `${val}%`;
      triggerComponent(c.id, val);
    });
  });

  card.querySelector('.btn-rename-comp').addEventListener('click', () => promptRenameComponent(c.id, c.name));
  card.querySelector('.btn-del-comp').addEventListener('click', () => confirmDeleteComponent(c.id, c.name));

  return card;
}

// 3. MOTOR SERVO (0-180°)
function renderServoCard(c, dev) {
  const card = document.createElement('div');
  card.className = 'component-widget-card';
  card.id = `comp-widget-${c.id}`;

  const angle = Math.min(Math.max(parseInt(c.value) || 0, 0), 180);

  card.innerHTML = `
    <div class="comp-header">
      <div class="comp-meta">
        <span class="comp-icon">🦾</span>
        <div class="comp-title-wrap">
          <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
          <span class="comp-pin-tag">${getPinTag(c)}</span>
        </div>
      </div>
      <div class="card-actions-group">
        <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
        <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus">🗑️</button>
      </div>
    </div>
    <div style="margin: 8px 0;">
      <div class="servo-angle-display">
        <span style="font-size: 0.76rem; color: var(--text-muted);">Posisi Sudut:</span>
        <span id="servo-val-${c.id}" class="servo-angle-text">${angle}°</span>
      </div>
      <input type="range" class="servo-range-slider" min="0" max="180" value="${angle}">
      <div class="servo-presets">
        <button type="button" class="btn-servo-preset" data-angle="0">0°</button>
        <button type="button" class="btn-servo-preset" data-angle="45">45°</button>
        <button type="button" class="btn-servo-preset" data-angle="90">90°</button>
        <button type="button" class="btn-servo-preset" data-angle="180">180°</button>
      </div>
    </div>
    <div class="comp-footer">
      <span>Servo Sudut PWM (0-180°)</span>
      <span style="font-family: monospace;">POS: ${angle}°</span>
    </div>
  `;

  const slider = card.querySelector('.servo-range-slider');
  const label = card.querySelector(`#servo-val-${c.id}`);

  slider.addEventListener('input', (e) => { label.textContent = `${e.target.value}°`; });
  slider.addEventListener('change', (e) => { triggerComponent(c.id, parseInt(e.target.value)); });

  card.querySelectorAll('.btn-servo-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = parseInt(btn.dataset.angle);
      slider.value = a;
      label.textContent = `${a}°`;
      triggerComponent(c.id, a);
    });
  });

  card.querySelector('.btn-rename-comp').addEventListener('click', () => promptRenameComponent(c.id, c.name));
  card.querySelector('.btn-del-comp').addEventListener('click', () => confirmDeleteComponent(c.id, c.name));

  return card;
}

// 4. MPU6050 3D ORIENTATION VISUALIZER
function renderMpuCard(c, dev) {
  const card = document.createElement('div');
  card.className = 'component-widget-card';
  card.id = `comp-widget-${c.id}`;

  let parsed = { pitch: 0, roll: 0, yaw: 0, temp: 0 };
  try {
    if (typeof c.value === 'object') parsed = { ...parsed, ...c.value };
    else if (c.value && c.value.startsWith('{')) parsed = { ...parsed, ...JSON.parse(c.value) };
    else if (parseFloat(c.value)) parsed.pitch = parseFloat(c.value);
  } catch (e) {}

  const pitch = Math.round(parseFloat(parsed.pitch) || 0);
  const roll = Math.round(parseFloat(parsed.roll) || 0);
  const yaw = Math.round(parseFloat(parsed.yaw) || 0);
  const temp = (parseFloat(parsed.temp) || 0).toFixed(1);

  card.innerHTML = `
    <div class="comp-header">
      <div class="comp-meta">
        <span class="comp-icon">🧭</span>
        <div class="comp-title-wrap">
          <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
          <span class="comp-pin-tag">I2C Bus (0x68)</span>
        </div>
      </div>
      <div class="card-actions-group">
        <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
        <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus">🗑️</button>
      </div>
    </div>
    
    <!-- CSS 3D Cube Visualizer -->
    <div class="mpu-scene">
      <div class="mpu-cube" id="mpu-box-${c.id}" style="transform: rotateX(${pitch}deg) rotateY(${roll}deg);">
        <div class="mpu-face">MPU6050</div>
      </div>
    </div>

    <!-- Multi-Axis Metrics -->
    <div class="mpu-metrics-grid">
      <div class="mpu-metric-item">
        <span class="mpu-metric-label">PITCH</span>
        <span class="mpu-metric-val" id="mpu-pitch-${c.id}">${pitch}°</span>
      </div>
      <div class="mpu-metric-item">
        <span class="mpu-metric-label">ROLL</span>
        <span class="mpu-metric-val" id="mpu-roll-${c.id}">${roll}°</span>
      </div>
      <div class="mpu-metric-item">
        <span class="mpu-metric-label">YAW</span>
        <span class="mpu-metric-val" id="mpu-yaw-${c.id}">${yaw}°</span>
      </div>
      <div class="mpu-metric-item">
        <span class="mpu-metric-label">SUHU</span>
        <span class="mpu-metric-val" id="mpu-temp-${c.id}">${temp}°C</span>
      </div>
    </div>

    <button type="button" class="btn-mpu-tare" style="margin-top: 4px;">
      🎯 Kalibrasi Nol (Tare Offset)
    </button>

    <div class="comp-footer">
      <span>6-Axis Spasial Gyro & Accel</span>
      <span style="font-family: monospace;">REAL-TIME 3D</span>
    </div>
  `;

  card.querySelector('.btn-mpu-tare').addEventListener('click', () => calibrateComponent(c.id));
  card.querySelector('.btn-rename-comp').addEventListener('click', () => promptRenameComponent(c.id, c.name));
  card.querySelector('.btn-del-comp').addEventListener('click', () => confirmDeleteComponent(c.id, c.name));

  return card;
}

// 5. RGB LED / NEOPIXEL
function renderRgbCard(c, dev) {
  const card = document.createElement('div');
  card.className = 'component-widget-card';
  card.id = `comp-widget-${c.id}`;

  let color = '#38bdf8';
  let brightness = 100;
  if (c.value && c.value.startsWith('#')) color = c.value;

  card.innerHTML = `
    <div class="comp-header">
      <div class="comp-meta">
        <span class="comp-icon">🎨</span>
        <div class="comp-title-wrap">
          <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
          <span class="comp-pin-tag">${getPinTag(c)}</span>
        </div>
      </div>
      <div class="card-actions-group">
        <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
        <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus">🗑️</button>
      </div>
    </div>

    <div class="rgb-controls-wrap">
      <div class="rgb-picker-row">
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="color" class="rgb-color-input" value="${color}">
          <span id="rgb-hex-${c.id}" style="font-size: 0.85rem; font-family: monospace; font-weight: 700; color: var(--text-main);">${color}</span>
        </div>
        <div class="rgb-preset-chips">
          <div class="rgb-chip" style="background:#ff3b30;" data-hex="#ff3b30" title="Merah"></div>
          <div class="rgb-chip" style="background:#34c759;" data-hex="#34c759" title="Hijau"></div>
          <div class="rgb-chip" style="background:#007aff;" data-hex="#007aff" title="Biru"></div>
          <div class="rgb-chip" style="background:#ff9500;" data-hex="#ff9500" title="Kuning"></div>
          <div class="rgb-chip" style="background:#ffffff;" data-hex="#ffffff" title="Putih"></div>
        </div>
      </div>
    </div>

    <div class="comp-footer">
      <span>Warna Spektrum Hex / RGB</span>
      <span style="font-family: monospace;">24-BIT</span>
    </div>
  `;

  const colorInput = card.querySelector('.rgb-color-input');
  const hexLabel = card.querySelector(`#rgb-hex-${c.id}`);

  colorInput.addEventListener('change', (e) => {
    hexLabel.textContent = e.target.value;
    triggerComponent(c.id, e.target.value);
  });

  card.querySelectorAll('.rgb-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const hex = chip.dataset.hex;
      colorInput.value = hex;
      hexLabel.textContent = hex;
      triggerComponent(c.id, hex);
    });
  });

  card.querySelector('.btn-rename-comp').addEventListener('click', () => promptRenameComponent(c.id, c.name));
  card.querySelector('.btn-del-comp').addEventListener('click', () => confirmDeleteComponent(c.id, c.name));

  return card;
}

// 6. BUZZER / AUDIO ALARM
function renderBuzzerCard(c, dev) {
  const card = document.createElement('div');
  card.className = 'component-widget-card';
  card.id = `comp-widget-${c.id}`;

  card.innerHTML = `
    <div class="comp-header">
      <div class="comp-meta">
        <span class="comp-icon">🔔</span>
        <div class="comp-title-wrap">
          <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
          <span class="comp-pin-tag">${getPinTag(c)}</span>
        </div>
      </div>
      <div class="card-actions-group">
        <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
        <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus">🗑️</button>
      </div>
    </div>

    <div class="buzzer-actions-row">
      <button type="button" class="btn-buzzer-action btn-buzzer-beep">
        <span>🔔 Beep (0.5s)</span>
      </button>
      <button type="button" class="btn-buzzer-action btn-buzzer-alarm">
        <span>🚨 Alarm (3s)</span>
      </button>
    </div>

    <div class="comp-footer">
      <span>Indikator Audio / Piezo</span>
      <span style="font-family: monospace;">PWM PULSE</span>
    </div>
  `;

  card.querySelector('.btn-buzzer-beep').addEventListener('click', () => {
    triggerComponent(c.id, true, 1);
    showToast('Beep sinyal dikirim');
  });

  card.querySelector('.btn-buzzer-alarm').addEventListener('click', () => {
    triggerComponent(c.id, true, 3);
    showToast('Alarm darurat 3 detik dikirim');
  });

  card.querySelector('.btn-rename-comp').addEventListener('click', () => promptRenameComponent(c.id, c.name));
  card.querySelector('.btn-del-comp').addEventListener('click', () => confirmDeleteComponent(c.id, c.name));

  return card;
}

// 7. DIGITAL IN / PIR SENSOR
function renderIndicatorCard(c, dev) {
  const card = document.createElement('div');
  card.className = 'component-widget-card';
  card.id = `comp-widget-${c.id}`;

  const isActive = c.value === '1' || c.value === 'true' || c.value === true;

  card.innerHTML = `
    <div class="comp-header">
      <div class="comp-meta">
        <span class="comp-icon">🚶</span>
        <div class="comp-title-wrap">
          <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
          <span class="comp-pin-tag">${getPinTag(c)}</span>
        </div>
      </div>
      <div class="card-actions-group">
        <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
        <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus">🗑️</button>
      </div>
    </div>
    <div style="margin: 12px 0;">
      <span class="indicator-pill ${isActive ? 'active' : 'inactive'}">
        ${isActive ? '🔴 Terdeteksi / Aktif' : '🟢 Standby / Aman'}
      </span>
    </div>
    <div class="comp-footer">
      <span>Digital Input (Interrupt)</span>
      <span style="font-family: monospace;">${isActive ? 'TRIGGERED' : 'IDLE'}</span>
    </div>
  `;

  card.querySelector('.btn-rename-comp').addEventListener('click', () => promptRenameComponent(c.id, c.name));
  card.querySelector('.btn-del-comp').addEventListener('click', () => confirmDeleteComponent(c.id, c.name));

  return card;
}

// 8. SENSOR SKALAR LINGKUNGAN
function renderSensorCard(c, dev) {
  const card = document.createElement('div');
  card.className = 'component-widget-card';
  card.id = `comp-widget-${c.id}`;

  const driver = c.driver || c.type || '';
  let icon = '🌡️';
  if (driver === 'bmp280') icon = '🌤️';
  else if (driver === 'bh1750') icon = '☀️';
  else if (driver === 'analog') icon = '📊';

  card.innerHTML = `
    <div class="comp-header">
      <div class="comp-meta">
        <span class="comp-icon">${icon}</span>
        <div class="comp-title-wrap">
          <span class="comp-title">${escapeHtml(c.name || c.id)}</span>
          <span class="comp-pin-tag">${getPinTag(c)}</span>
        </div>
      </div>
      <div class="card-actions-group">
        <button type="button" class="btn-card-graph" title="Lihat Grafik">📈 Grafik</button>
        <button type="button" class="btn-card-action btn-rename-comp" title="Ubah Nama">✏️</button>
        <button type="button" class="btn-card-action danger btn-del-comp" title="Hapus">🗑️</button>
      </div>
    </div>
    <div class="comp-val-display">
      <span class="comp-val-number" id="sensor-val-${c.id}">${escapeHtml(c.value || '0')}</span>
      <span class="comp-val-unit">${escapeHtml(c.unit || '')}</span>
    </div>
    <div class="comp-footer">
      <span>Driver: ${escapeHtml(driver || 'sensor')}</span>
      <span style="font-size: 0.68rem; color: var(--text-subtle);">Live Telemetry</span>
    </div>
  `;

  card.querySelector('.btn-card-graph').addEventListener('click', () => {
    openTelemetryGraphModal(c.id, c.name, c.unit);
  });

  card.querySelector('.btn-rename-comp').addEventListener('click', () => promptRenameComponent(c.id, c.name));
  card.querySelector('.btn-del-comp').addEventListener('click', () => confirmDeleteComponent(c.id, c.name));

  return card;
}

// -------------------------------------------------------------
// Factory Dispatcher
// -------------------------------------------------------------
export function createComponentCard(c, dev) {
  const driver = (c.driver || c.type || '').toLowerCase();

  if (c.type === 'switch' || driver === 'switch') {
    return renderSwitchCard(c, dev);
  }
  if (c.type === 'dimmer' || driver === 'dimmer') {
    return renderDimmerCard(c, dev);
  }
  if (c.type === 'servo' || driver === 'servo') {
    return renderServoCard(c, dev);
  }
  if (c.type === 'mpu6050' || driver === 'mpu6050') {
    return renderMpuCard(c, dev);
  }
  if (c.type === 'rgb_led' || driver === 'rgb_led' || driver === 'neopixel') {
    return renderRgbCard(c, dev);
  }
  if (c.type === 'buzzer' || driver === 'buzzer') {
    return renderBuzzerCard(c, dev);
  }
  if (c.type === 'indicator' || driver === 'digital_in') {
    return renderIndicatorCard(c, dev);
  }

  // Default: Sensor Skalar
  return renderSensorCard(c, dev);
}

// -------------------------------------------------------------
// Component Grid Renderer & Filter
// -------------------------------------------------------------
export function renderComponentsGrid(filter = state.currentCompFilter) {
  state.currentCompFilter = filter;
  const grid = document.getElementById('componentsGrid');
  if (!grid) return;

  const dev = state.getActiveDevice();
  if (!dev) {
    grid.innerHTML = `
      <div class="empty-state-card" style="grid-column: 1 / -1; padding: 44px 20px; text-align: center;">
        <div style="font-size: 2.8rem; margin-bottom: 10px;">📡</div>
        <h4 style="color: var(--text-main); font-size: 1.05rem; margin-bottom: 8px;">Belum Ada Perangkat IoT</h4>
        <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 360px; margin: 0 auto 18px; line-height: 1.5;">
          Hubungkan hardware ESP8266/ESP32 Anda ke server, atau klik tombol di bawah untuk panduan pairing & flash firmware.
        </p>
        <button type="button" id="btnZeroAddDevice" class="btn-manage-pins" style="padding: 8px 18px; font-size: 0.84rem; display: inline-flex; margin: 0 auto;">
          <span>+ Tambah Perangkat IoT</span>
        </button>
      </div>
    `;
    const btnZeroAdd = document.getElementById('btnZeroAddDevice');
    if (btnZeroAdd) {
      btnZeroAdd.addEventListener('click', () => {
        document.getElementById('modalAddDevice')?.classList.remove('hidden');
      });
    }
    return;
  }

  if (!Array.isArray(dev.components) || dev.components.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-card" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">🔌</div>
        <h4 style="color: var(--text-main); margin-bottom: 6px;">Belum Ada Komponen Terdaftar</h4>
        <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 360px; margin: 0 auto 16px; line-height: 1.5;">
          Perangkat <strong>"${escapeHtml(dev.name || dev.deviceId)}"</strong> belum memiliki modul pin atau sensor terpasang.
        </p>
        <button type="button" id="btnZeroConfigPins" class="btn-manage-pins" style="padding: 8px 16px; font-size: 0.82rem; display: inline-flex; margin: 0 auto;">
          <span>⚙️ Atur Modul & Pin</span>
        </button>
      </div>
    `;
    const btnZeroConfig = document.getElementById('btnZeroConfigPins');
    if (btnZeroConfig) {
      btnZeroConfig.addEventListener('click', () => {
        document.getElementById('btnOpenPinManager')?.click();
      });
    }
    return;
  }

  let comps = [...dev.components];
  if (filter === 'actuator') {
    comps = comps.filter(c => ['switch', 'dimmer', 'servo', 'rgb_led', 'buzzer'].includes(c.type) || ['switch', 'dimmer', 'servo', 'rgb_led', 'buzzer'].includes(c.driver));
  } else if (filter === 'sensor') {
    comps = comps.filter(c => !['switch', 'dimmer', 'servo', 'rgb_led', 'buzzer', 'digital_in', 'indicator'].includes(c.type) && !['switch', 'dimmer', 'servo', 'rgb_led', 'buzzer', 'digital_in', 'indicator'].includes(c.driver));
  } else if (filter === 'indicator') {
    comps = comps.filter(c => c.type === 'indicator' || c.driver === 'digital_in');
  }

  grid.innerHTML = '';
  comps.forEach(c => {
    grid.appendChild(createComponentCard(c, dev));
  });
}

// Live Micro-Update Telemetri tanpa re-render kartu
export function updateLiveTelemetryDom(data) {
  for (const [compId, val] of Object.entries(data)) {
    // Sensor metric
    const sensorEl = document.getElementById(`sensor-val-${compId}`);
    if (sensorEl) sensorEl.textContent = String(val);

    // MPU6050 3D box & metrics
    const mpuBox = document.getElementById(`mpu-box-${compId}`);
    if (mpuBox && typeof val === 'object') {
      const p = Math.round(parseFloat(val.pitch) || 0);
      const r = Math.round(parseFloat(val.roll) || 0);
      const y = Math.round(parseFloat(val.yaw) || 0);
      const t = (parseFloat(val.temp) || 0).toFixed(1);

      mpuBox.style.transform = `rotateX(${p}deg) rotateY(${r}deg)`;

      const pitchEl = document.getElementById(`mpu-pitch-${compId}`);
      const rollEl = document.getElementById(`mpu-roll-${compId}`);
      const yawEl = document.getElementById(`mpu-yaw-${compId}`);
      const tempEl = document.getElementById(`mpu-temp-${compId}`);
      if (pitchEl) pitchEl.textContent = `${p}°`;
      if (rollEl) rollEl.textContent = `${r}°`;
      if (yawEl) yawEl.textContent = `${y}°`;
      if (tempEl) tempEl.textContent = `${t}°C`;
    }
  }
}

// -------------------------------------------------------------
// Component Renaming & Deletion Handlers
// -------------------------------------------------------------
function promptRenameComponent(componentId, currentName) {
  const newName = prompt(`Ubah nama komponen "${currentName}":`, currentName);
  if (newName && newName.trim() && newName.trim() !== currentName) {
    fetch(`/api/devices/${encodeURIComponent(state.activeDeviceId)}/components/${encodeURIComponent(componentId)}/rename`, {
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
        showToast(`Komponen diubah menjadi "${newName.trim()}"`);
        const dev = state.getActiveDevice();
        if (dev && Array.isArray(dev.components)) {
          const c = dev.components.find(x => x.id === componentId);
          if (c) c.name = newName.trim();
        }
        renderComponentsGrid();
      } else {
        showToast(res.message || 'Gagal mengubah nama komponen', false);
      }
    })
    .catch(e => showToast(e.message, false));
  }
}

function confirmDeleteComponent(componentId, name) {
  if (!confirm(`Hapus komponen "${name || componentId}" dari perangkat?`)) return;

  fetch(`/api/devices/${encodeURIComponent(state.activeDeviceId)}/components/${encodeURIComponent(componentId)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      showToast(`Komponen "${name || componentId}" berhasil dihapus`);
      const dev = state.getActiveDevice();
      if (dev && Array.isArray(dev.components)) {
        dev.components = dev.components.filter(x => x.id !== componentId);
      }
      renderComponentsGrid();
    } else {
      showToast(res.message || 'Gagal menghapus komponen', false);
    }
  })
  .catch(e => showToast(e.message, false));
}

function openTimerModal(componentId, componentName) {
  state.activeTimerComponentId = componentId;
  const title = document.getElementById('timerModalCompTitle');
  if (title) title.textContent = `Atur Timer: ${componentName || componentId}`;

  const modal = document.getElementById('modalTimerCountdown');
  if (modal) modal.classList.remove('hidden');
}
