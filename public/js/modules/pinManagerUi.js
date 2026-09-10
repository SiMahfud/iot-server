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
  const formAddPin = document.getElementById('formAddPin');
  const btnTriggerI2c = document.getElementById('btnTriggerI2cScan');

  if (btnOpen && modal) {
    btnOpen.addEventListener('click', () => {
      const dev = state.getActiveDevice();
      const labelEl = document.getElementById('pinManagerDeviceLabel');
      if (labelEl && dev) {
        labelEl.textContent = `Perangkat: ${dev.name || dev.deviceId || dev.id}`;
      }
      renderActivePinsList();
      modal.classList.remove('hidden');
    });
  }

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // Inisialisasi Dynamic Form Visibility (Smart Fields)
  setupDynamicPinForm();

  // Tab switcher di dalam Pin Manager Modal
  document.querySelectorAll('.pin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.pin-tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      // HTML menggunakan data-pin-tab (bukan data-tab)
      const tabId = btn.dataset.pinTab;
      const target = document.getElementById(tabId);
      if (target) target.classList.add('active');

      if (tabId === 'tabListPins') {
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

      const pin = parseInt(document.getElementById('pinSelect').value);
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
          // Sync state lokal langsung dari response (tidak perlu tunggu WS broadcast)
          const targetDevId = res.data ? (res.data.deviceId || res.data.id) : null;
          if (targetDevId) {
            state.devices[targetDevId] = { ...(state.devices[targetDevId] || {}), ...res.data, deviceId: targetDevId, id: targetDevId };
          }
          showToast(`Komponen "${name}" berhasil ditambahkan!`);
          formAddPin.reset();
          if (modal) modal.classList.add('hidden');
          renderComponentsGrid();
          renderActivePinsList();
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

function setupDynamicPinForm() {
  const driverSelect = document.getElementById('pinDriverType');
  if (!driverSelect) return;

  const groupPinSelect = document.getElementById('groupPinSelect');
  const groupPinCompUnit = document.getElementById('groupPinCompUnit');
  const groupPinReadInterval = document.getElementById('groupPinReadInterval');
  const groupPinActiveLow = document.getElementById('groupPinActiveLow');
  const pinCompName = document.getElementById('pinCompName');
  const pinCompUnit = document.getElementById('pinCompUnit');
  const pinReadInterval = document.getElementById('pinReadInterval');
  const pinSelectHint = document.getElementById('pinSelectHint');

  function updateFields() {
    const driver = driverSelect.value;
    const isI2c = ['bmp280', 'bh1750', 'sht30', 'aht10', 'mpu6050'].includes(driver);
    const isActuator = ['switch', 'dimmer', 'servo', 'rgb_led', 'buzzer'].includes(driver);
    const isSensor = !isActuator;

    // Pin select hint
    if (groupPinSelect) {
      if (isI2c) {
        if (pinSelectHint) pinSelectHint.textContent = 'Sensor I2C menggunakan jalur SDA/SCL bersama secara otomatis.';
      } else {
        if (pinSelectHint) pinSelectHint.textContent = 'Pilih pin GPIO tempat kabel sensor/aktuator ditancapkan.';
      }
    }

    // Active Low / High logic: hanya untuk saklar/relay, buzzer, dan digital_in
    if (groupPinActiveLow) {
      if (['switch', 'buzzer', 'digital_in'].includes(driver)) {
        groupPinActiveLow.classList.remove('hidden');
      } else {
        groupPinActiveLow.classList.add('hidden');
      }
    }

    // Unit
    if (groupPinCompUnit) {
      if (isSensor) {
        groupPinCompUnit.classList.remove('hidden');
        if (driver === 'dht11' || driver === 'dht22' || driver === 'ds18b20' || driver === 'sht30' || driver === 'aht10') {
          if (!pinCompUnit.value) pinCompUnit.placeholder = '°C';
        } else if (driver === 'bh1750') {
          if (!pinCompUnit.value) pinCompUnit.placeholder = 'Lux';
        } else if (driver === 'bmp280') {
          if (!pinCompUnit.value) pinCompUnit.placeholder = 'hPa';
        } else if (driver === 'analog') {
          if (!pinCompUnit.value) pinCompUnit.placeholder = '%, ADC, V';
        }
      } else {
        groupPinCompUnit.classList.add('hidden');
        pinCompUnit.value = '';
      }
    }

    // Reading Interval: hanya untuk sensor
    if (groupPinReadInterval) {
      if (isSensor) {
        groupPinReadInterval.classList.remove('hidden');
        if (!pinReadInterval.value) pinReadInterval.value = '5';
      } else {
        groupPinReadInterval.classList.add('hidden');
      }
    }

    // Dynamic placeholders
    if (pinCompName) {
      if (driver === 'switch') pinCompName.placeholder = 'Misal: Lampu Teras, Pompa Air';
      else if (driver === 'dimmer') pinCompName.placeholder = 'Misal: Dimmer Lampu, Speed Kipas';
      else if (driver === 'servo') pinCompName.placeholder = 'Misal: Palang Pintu, Motor Servo';
      else if (driver === 'rgb_led') pinCompName.placeholder = 'Misal: Strip NeoPixel, LED RGB';
      else if (driver === 'buzzer') pinCompName.placeholder = 'Misal: Alarm Buzzer, Sirine';
      else if (driver === 'digital_in') pinCompName.placeholder = 'Misal: Sensor PIR Gerak, Saklar Pintu';
      else if (driver === 'analog') pinCompName.placeholder = 'Misal: Kelembapan Tanah, Sensor LDR';
      else if (driver === 'dht11' || driver === 'dht22') pinCompName.placeholder = 'Misal: Suhu & Kelembapan Ruang';
      else if (driver === 'ds18b20') pinCompName.placeholder = 'Misal: Sensor Suhu Waterproof';
      else if (driver === 'bmp280') pinCompName.placeholder = 'Misal: Tekanan & Suhu Udara';
      else if (driver === 'bh1750') pinCompName.placeholder = 'Misal: Intensitas Cahaya Ruang';
      else if (driver === 'mpu6050') pinCompName.placeholder = 'Misal: Sensor Kemiringan 3D';
      else pinCompName.placeholder = 'Nama Komponen';
    }
  }

  driverSelect.addEventListener('change', updateFields);
  updateFields();
}

function renderActivePinsList() {
  const container = document.getElementById('activePinsList');
  if (!container) return;

  const dev = state.getActiveDevice();
  const countEl = document.getElementById('countActiveComponents');
  const components = (dev && Array.isArray(dev.components)) ? dev.components : [];

  if (countEl) {
    countEl.textContent = components.length;
  }

  if (components.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card" style="text-align: center; padding: 28px 16px; color: var(--text-muted); font-size: 0.85rem;">
        <span style="display: block; font-size: 1.5rem; margin-bottom: 6px;">🔌</span>
        <span>Belum ada pin atau modul terpasang pada perangkat ini.</span>
        <p style="margin-top: 6px; font-size: 0.75rem; color: var(--text-subtle);">Buka tab <strong>+ Tambah Pin / Modul</strong> di atas untuk menambahkan saklar atau sensor.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  components.forEach(c => {
    const isI2c = c.pin < 0 || ['bmp280', 'bh1750', 'sht30', 'aht10', 'mpu6050'].includes(c.driver);
    const isAnalog = c.driver === 'analog' || c.pin === 17;

    let badgeClass = 'pin-badge';
    if (isI2c) badgeClass += ' pin-i2c';
    else if (isAnalog) badgeClass += ' pin-analog';

    const pinLabel = isI2c ? 'I2C Bus' : (isAnalog ? 'A0 (ADC)' : `GPIO ${c.pin}`);
    const displayValue = (c.value !== undefined && c.value !== null && c.value !== '') ? `${c.value}${c.unit ? ' ' + c.unit : ''}` : '-';

    const item = document.createElement('div');
    item.className = 'pin-item-card';
    item.innerHTML = `
      <div class="pin-item-left">
        <span class="${badgeClass}">${escapeHtml(pinLabel)}</span>
        <div class="pin-item-info">
          <span class="pin-item-name">${escapeHtml(c.name || c.id)}</span>
          <span class="pin-item-type">${escapeHtml(c.driver || c.type || 'Driver')} &bull; <code>${escapeHtml(c.id)}</code></span>
        </div>
      </div>
      <div class="pin-item-right">
        <span class="pin-live-val">${escapeHtml(displayValue)}</span>
        <button type="button" class="btn-delete-pin" title="Hapus Komponen">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    item.querySelector('.btn-delete-pin').addEventListener('click', () => {
      if (!confirm(`Hapus komponen "${c.name || c.id}"?`)) return;

      fetch(`/api/devices/${encodeURIComponent(state.activeDeviceId)}/components/${encodeURIComponent(c.id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.authToken}` }
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          showToast(`Komponen "${c.name || c.id}" berhasil dihapus`);
          if (dev && Array.isArray(dev.components)) {
            dev.components = dev.components.filter(item => item.id !== c.id);
          }
          renderActivePinsList();
          renderComponentsGrid();
        } else {
          showToast(res.message || 'Gagal menghapus komponen', false);
        }
      })
      .catch(err => showToast(err.message, false));
    });

    container.appendChild(item);
  });
}
