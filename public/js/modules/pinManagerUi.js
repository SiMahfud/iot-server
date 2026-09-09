// =============================================================
// Dynamic Pin Manager & Remote I2C Scanner Module
// AgyGateway Universal IoT Server v4.0
// =============================================================

import { state, escapeHtml, showToast } from '../state.js';
import { sendWs } from '../wsClient.js';
import { renderComponentsGrid } from './widgets.js';

export function initPinManagerUi() {
  const modal = document.getElementById('modalPinManager');
  const btnOpen = document.getElementById('btnOpenPinManager');
  const btnClose = document.getElementById('btnClosePinManager');
  const formAddPin = document.getElementById('formAddPinComponent');
  const btnTriggerI2c = document.getElementById('btnTriggerI2cScan');

  if (btnOpen && modal) {
    btnOpen.addEventListener('click', () => {
      renderActivePinsList();
      modal.classList.remove('hidden');
    });
  }

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // Tab switcher di dalam Pin Manager Modal
  document.querySelectorAll('.pin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.pin-tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');

      if (btn.dataset.tab === 'tabActivePins') {
        renderActivePinsList();
      }
    });
  });

  // Form Tambah Pin / Komponen
  if (formAddPin) {
    formAddPin.addEventListener('submit', (e) => {
      e.preventDefault();

      const devId = state.activeDeviceId;
      if (!devId) {
        showToast('Pilih perangkat IoT terlebih dahulu', false);
        return;
      }

      const pin = parseInt(document.getElementById('pinGpioNumber').value);
      const driver = document.getElementById('pinDriverType').value;
      const name = document.getElementById('pinCompName').value.trim();
      const unit = document.getElementById('pinCompUnit').value.trim();
      const readInterval = parseInt(document.getElementById('pinReadInterval').value) || 5;
      const activeLow = document.getElementById('pinActiveLow').value === 'true';

      let type = 'sensor';
      let access = 'r';
      let defaultValue = '0';

      if (driver === 'switch') {
        type = 'switch'; access = 'rw'; defaultValue = 'false';
      } else if (driver === 'dimmer') {
        type = 'dimmer'; access = 'rw'; defaultValue = '0';
      } else if (driver === 'servo') {
        type = 'servo'; access = 'rw'; defaultValue = '90';
      } else if (driver === 'rgb_led') {
        type = 'rgb_led'; access = 'rw'; defaultValue = '#38bdf8';
      } else if (driver === 'buzzer') {
        type = 'buzzer'; access = 'rw'; defaultValue = 'false';
      } else if (driver === 'digital_in') {
        type = 'indicator'; access = 'r'; defaultValue = '0';
      } else if (driver === 'mpu6050') {
        type = 'mpu6050'; access = 'r'; defaultValue = '{"pitch":0,"roll":0,"yaw":0,"temp":0}';
      }

      const id = `${driver}_${pin >= 0 ? pin : Date.now()}`;

      const payload = {
        id,
        componentId: id,
        name,
        type,
        driver,
        unit,
        pin,
        access,
        value: defaultValue,
        activeLow,
        config: { readInterval }
      };

      fetch(`/api/devices/${encodeURIComponent(devId)}/components`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.authToken}`
        },
        body: JSON.stringify(payload)
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          showToast(`Komponen "${name}" berhasil ditambahkan ke hardware!`);
          formAddPin.reset();
          if (modal) modal.classList.add('hidden');
          renderComponentsGrid();
        } else {
          showToast(res.message || 'Gagal menambahkan komponen', false);
        }
      })
      .catch(err => showToast(err.message, false));
    });
  }

  // Trigger I2C Scan
  if (btnTriggerI2c) {
    btnTriggerI2c.addEventListener('click', () => {
      const devId = state.activeDeviceId;
      if (!devId) {
        showToast('Pilih perangkat IoT terlebih dahulu', false);
        return;
      }

      const statusEl = document.getElementById('i2cScanStatus');
      if (statusEl) statusEl.textContent = 'Memindai bus I2C hardware...';

      sendWs({
        action: 'scan_i2c',
        target: devId
      });
    });
  }

  // Listen for I2C Scan Result from WebSocket
  state.on('i2cScanResult', (payload) => {
    const statusEl = document.getElementById('i2cScanStatus');
    const container = document.getElementById('i2cResultsContainer');
    if (!container) return;

    const devices = payload.devices || [];
    if (statusEl) statusEl.textContent = `Selesai. Ditemukan ${devices.length} modul I2C`;

    if (devices.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card">
          <span>Tidak ada perangkat I2C yang terdeteksi di pin SDA/SCL</span>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    devices.forEach(d => {
      const card = document.createElement('div');
      card.className = 'i2c-device-card';
      card.innerHTML = `
        <div class="i2c-card-info">
          <span class="i2c-card-addr">${escapeHtml(d.address || '0x??')}</span>
          <span class="i2c-card-name">${escapeHtml(d.name || 'Modul I2C')}</span>
        </div>
        <button type="button" class="btn-install-i2c" style="padding: 4px 10px; background: var(--accent-blue-soft); color: var(--accent-blue); border: 1px solid var(--accent-blue); border-radius: var(--radius-sm); font-size: 0.72rem; font-weight: 700; cursor: pointer;">
          + Pasang
        </button>
      `;

      card.querySelector('.btn-install-i2c').addEventListener('click', () => {
        let driver = 'bmp280';
        const lowerName = (d.name || '').toLowerCase();
        if (lowerName.includes('mpu')) driver = 'mpu6050';
        else if (lowerName.includes('bh1750') || lowerName.includes('light')) driver = 'bh1750';
        else if (lowerName.includes('sht')) driver = 'sht30';
        else if (lowerName.includes('aht')) driver = 'aht10';

        const compPayload = {
          id: `${driver}_${d.address || 'i2c'}`,
          name: d.name || `Sensor ${driver.toUpperCase()}`,
          type: driver === 'mpu6050' ? 'mpu6050' : 'sensor',
          driver: driver,
          pin: -1,
          access: 'r',
          unit: driver === 'bh1750' ? 'Lux' : (driver === 'bmp280' ? 'hPa' : '°C')
        };

        fetch(`/api/devices/${encodeURIComponent(state.activeDeviceId)}/components`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.authToken}`
          },
          body: JSON.stringify(compPayload)
        })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            showToast(`Sensor I2C ${compPayload.name} berhasil dipasang!`);
            if (modal) modal.classList.add('hidden');
            renderComponentsGrid();
          }
        });
      });

      container.appendChild(card);
    });
  });
}

function renderActivePinsList() {
  const container = document.getElementById('activePinsList');
  if (!container) return;

  const dev = state.getActiveDevice();
  if (!dev || !Array.isArray(dev.components) || dev.components.length === 0) {
    container.innerHTML = '<p class="empty-schedule-msg">Belum ada pin/komponen terdaftar</p>';
    return;
  }

  container.innerHTML = '';
  dev.components.forEach(c => {
    const item = document.createElement('div');
    item.className = 'pin-item-row';
    item.innerHTML = `
      <div class="pin-item-left">
        <span class="pin-num-badge">${c.pin >= 0 ? `GPIO ${c.pin}` : 'I2C'}</span>
        <div class="pin-info-text">
          <span class="pin-name">${escapeHtml(c.name || c.id)}</span>
          <span class="pin-driver">${escapeHtml(c.driver || c.type)} &bull; ${escapeHtml(c.value || '0')} ${escapeHtml(c.unit || '')}</span>
        </div>
      </div>
      <button type="button" class="btn-del-pin danger" title="Hapus">🗑️</button>
    `;

    item.querySelector('.btn-del-pin').addEventListener('click', () => {
      if (!confirm(`Hapus komponen "${c.name || c.id}"?`)) return;

      fetch(`/api/devices/${encodeURIComponent(state.activeDeviceId)}/components/${encodeURIComponent(c.id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.authToken}` }
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          showToast(`Komponen ${c.id} dihapus`);
          renderActivePinsList();
          renderComponentsGrid();
        }
      });
    });

    container.appendChild(item);
  });
}
