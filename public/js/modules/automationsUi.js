// =============================================================
// Smart Automation (IF-THEN Rules) UI Module
// AgyGateway Universal IoT Server v4.0
// =============================================================

import { state, escapeHtml, showToast } from '../state.js';

export function initAutomationsUi() {
  const form = document.getElementById('automationForm');
  const triggerDevSelect = document.getElementById('autoTriggerDevice');
  const triggerCompSelect = document.getElementById('autoTriggerComp');
  const actionDevSelect = document.getElementById('autoActionDevice');
  const actionCompSelect = document.getElementById('autoActionComp');
  const opSelect = document.getElementById('autoOperator');
  const actionTypeSelect = document.getElementById('autoActionType');
  const thresholdGroup = document.getElementById('autoThresholdGroup');
  const actionValGroup = document.getElementById('autoActionValGroup');

  if (!form) return;

  // Sinkronisasi pilihan device & komponen saat device berubah
  state.on('devicesChange', () => populateDeviceDropdowns());
  state.on('automationsChange', () => renderAutomationsList());

  if (triggerDevSelect) {
    triggerDevSelect.addEventListener('change', () => {
      populateComponentDropdown(triggerDevSelect.value, triggerCompSelect, 'sensor');
    });
  }

  if (actionDevSelect) {
    actionDevSelect.addEventListener('change', () => {
      populateComponentDropdown(actionDevSelect.value, actionCompSelect, 'actuator');
    });
  }

  // Toggle field threshold berdasarkan operator
  if (opSelect && thresholdGroup) {
    opSelect.addEventListener('change', () => {
      const op = opSelect.value;
      if (op === 'motion') {
        thresholdGroup.classList.add('hidden');
      } else {
        thresholdGroup.classList.remove('hidden');
      }
    });
  }

  // Toggle field action value berdasarkan action type
  if (actionTypeSelect && actionValGroup) {
    actionTypeSelect.addEventListener('change', () => {
      const at = actionTypeSelect.value;
      const label = document.getElementById('autoActionValLabel');
      if (at === 'angle') {
        actionValGroup.classList.remove('hidden');
        if (label) label.textContent = 'Sudut Target (0-180°)';
      } else if (at === 'value') {
        actionValGroup.classList.remove('hidden');
        if (label) label.textContent = 'Nilai PWM Target (0-100%)';
      } else {
        actionValGroup.classList.add('hidden');
      }
    });
  }

  // Form Submit Handler
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('autoName').value.trim();
    const triggerDeviceId = triggerDevSelect.value;
    const triggerComponentId = triggerCompSelect.value;
    const operator = opSelect.value;
    const threshold = document.getElementById('autoThreshold').value;
    const actionDeviceId = actionDevSelect.value;
    const actionComponentId = actionCompSelect.value;
    const actionType = actionTypeSelect.value;
    const actionValue = document.getElementById('autoActionValue').value;
    const duration = parseInt(document.getElementById('autoDuration').value) || 0;
    const cooldown = parseInt(document.getElementById('autoCooldown').value) || 10;

    if (!triggerDeviceId || !triggerComponentId || !actionDeviceId || !actionComponentId) {
      showToast('Harap lengkapi semua pilihan perangkat dan komponen', false);
      return;
    }

    const payload = {
      name,
      triggerDeviceId,
      triggerComponentId,
      operator,
      threshold: threshold !== '' ? parseFloat(threshold) : null,
      actionDeviceId,
      actionComponentId,
      actionType,
      actionValue,
      duration,
      cooldown
    };

    fetch('/api/automations', {
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
        showToast(`Aturan "${name}" berhasil disimpan!`);
        form.reset();
        loadAutomations();
      } else {
        showToast(res.message || 'Gagal menyimpan aturan otomasi', false);
      }
    })
    .catch(err => showToast(err.message, false));
  });

  populateDeviceDropdowns();
  loadAutomations();
}

export function loadAutomations() {
  fetch('/api/automations', {
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      state.setAutomations(res.data || []);
    }
  })
  .catch(err => console.error('[AUTOMATIONS LOAD ERROR]', err));
}

function populateDeviceDropdowns() {
  const triggerDevSelect = document.getElementById('autoTriggerDevice');
  const actionDevSelect = document.getElementById('autoActionDevice');
  const triggerCompSelect = document.getElementById('autoTriggerComp');
  const actionCompSelect = document.getElementById('autoActionComp');

  if (!triggerDevSelect || !actionDevSelect) return;

  const devices = Object.values(state.devices);
  let html = '<option value="">Pilih Node IoT...</option>';

  devices.forEach(d => {
    html += `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.name || d.deviceId)} (${d.deviceId})</option>`;
  });

  triggerDevSelect.innerHTML = html;
  actionDevSelect.innerHTML = html;

  if (state.activeDeviceId) {
    triggerDevSelect.value = state.activeDeviceId;
    actionDevSelect.value = state.activeDeviceId;
    populateComponentDropdown(state.activeDeviceId, triggerCompSelect, 'sensor');
    populateComponentDropdown(state.activeDeviceId, actionCompSelect, 'actuator');
  }
}

function populateComponentDropdown(deviceId, selectEl, role) {
  if (!selectEl) return;
  if (!deviceId || !state.devices[deviceId]) {
    selectEl.innerHTML = '<option value="">Pilih Komponen...</option>';
    return;
  }

  const dev = state.devices[deviceId];
  const comps = Array.isArray(dev.components) ? dev.components : [];

  let html = '<option value="">Pilih Komponen...</option>';

  comps.forEach(c => {
    html += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)} [${c.type || c.driver}]</option>`;
  });

  selectEl.innerHTML = html;
}

export function renderAutomationsList() {
  const listEl = document.getElementById('automationList');
  const badgeEl = document.getElementById('autoCountBadge');
  if (!listEl) return;

  const rules = state.automations;
  if (badgeEl) badgeEl.textContent = rules.length;

  if (!rules || rules.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state-card" style="padding: 24px; text-align: center;">
        <span style="font-size: 1.8rem; display: block; margin-bottom: 6px;">⚡</span>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Belum ada aturan otomasi aktif. Buat aturan pertama Anda di atas!</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = '';
  rules.forEach(r => {
    const card = document.createElement('div');
    card.className = `automation-card ${r.enabled ? '' : 'disabled'}`;
    card.id = `auto-card-${r.id}`;

    let opText = r.operator;
    if (r.operator === '>') opText = 'Lebih Dari ( > )';
    else if (r.operator === '<') opText = 'Kurang Dari ( < )';
    else if (r.operator === '==') opText = 'Sama Dengan ( == )';
    else if (r.operator === 'motion') opText = 'Gerak Terdeteksi (HIGH)';
    else if (r.operator === 'tilt') opText = 'Kemiringan / Guncangan';

    let actionDesc = r.actionType.toUpperCase();
    if (r.actionType === 'angle') actionDesc = `Set Sudut ${r.actionValue}°`;
    else if (r.actionType === 'value') actionDesc = `Set Nilai ${r.actionValue}%`;

    const lastRun = r.lastTriggered ? new Date(r.lastTriggered).toLocaleTimeString('id-ID') : 'Belum pernah';

    card.innerHTML = `
      <div class="auto-card-header">
        <div class="auto-name-wrap">
          <div class="auto-badge-icon">⚡</div>
          <span class="auto-card-title">${escapeHtml(r.name)}</span>
        </div>
        <label class="switch-control">
          <input type="checkbox" ${r.enabled ? 'checked' : ''} data-rule-id="${r.id}">
          <span class="slider"></span>
        </label>
      </div>

      <!-- IF-THEN Flow -->
      <div class="auto-flow-container">
        <span class="auto-flow-pill trigger">
          <span>IF</span>
          <strong>${escapeHtml(r.triggerComponentId)}</strong>
          <span>${opText} ${r.threshold !== null ? r.threshold : ''}</span>
        </span>
        <span class="auto-flow-arrow">➜</span>
        <span class="auto-flow-pill action">
          <span>THEN</span>
          <strong>${escapeHtml(r.actionComponentId)}</strong>
          <span>${actionDesc}</span>
        </span>
      </div>

      <div class="auto-card-footer">
        <span>Cooldown: ${r.cooldown}s &bull; Terakhir: ${lastRun}</span>
        <div class="auto-actions-row">
          <button type="button" class="btn-auto-action test" title="Uji Coba Pemicuan">⚡ Test</button>
          <button type="button" class="btn-auto-action delete danger" title="Hapus Aturan">🗑️</button>
        </div>
      </div>
    `;

    // Toggle Enable/Disable
    const chk = card.querySelector('input[type="checkbox"]');
    chk.addEventListener('change', () => toggleAutomationEnabled(r.id, chk.checked));

    // Test Trigger
    card.querySelector('.btn-auto-action.test').addEventListener('click', () => testAutomation(r.id));

    // Delete
    card.querySelector('.btn-auto-action.delete').addEventListener('click', () => deleteAutomation(r.id, r.name));

    listEl.appendChild(card);
  });
}

function toggleAutomationEnabled(id, enabled) {
  fetch(`/api/automations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.authToken}`
    },
    body: JSON.stringify({ enabled })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      showToast(`Aturan ${enabled ? 'diaktifkan' : 'dinonaktifkan'}`);
      loadAutomations();
    }
  })
  .catch(e => showToast(e.message, false));
}

function testAutomation(id) {
  fetch(`/api/automations/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      showToast(res.message);
    } else {
      showToast(res.message || 'Gagal menguji aturan', false);
    }
  })
  .catch(e => showToast(e.message, false));
}

function deleteAutomation(id, name) {
  if (!confirm(`Hapus aturan otomasi "${name}"?`)) return;

  fetch(`/api/automations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      showToast('Aturan otomasi berhasil dihapus');
      loadAutomations();
    }
  })
  .catch(e => showToast(e.message, false));
}
