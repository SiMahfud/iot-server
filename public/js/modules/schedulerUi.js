// =============================================================
// Universal Scheduler & Timer Countdown UI Module
// AgyGateway Universal IoT Server v4.0
// ==========================================

import { state, escapeHtml, showToast } from '../state.js';
import { sendWs } from '../wsClient.js';

let selectedDays = [];
let editSelectedDays = [];

export function initSchedulerUi() {
  const form = document.getElementById('scheduleForm');
  const deviceSelect = document.getElementById('schedDevice');
  const compSelect = document.getElementById('schedComponent');
  const actionSelect = document.getElementById('schedAction');
  const targetValGroup = document.getElementById('schedTargetValueGroup');
  const targetValLabel = document.getElementById('schedTargetValueLabel');
  const daysChips = document.getElementById('daysChips');

  if (!form) return;

  state.on('devicesChange', () => {
    populateSchedulerDeviceDropdown();
    const modal = document.getElementById('modalEditSchedule');
    if (modal && !modal.classList.contains('hidden')) {
      const editDev = document.getElementById('editSchedDevice');
      if (editDev) populateEditDeviceDropdown(editDev.value);
    }
  });
  state.on('schedulesChange', () => {
    renderScheduleList();
    renderTimerGrid();
  });

  if (deviceSelect) {
    deviceSelect.addEventListener('change', () => {
      populateSchedulerComponentDropdown(deviceSelect.value);
    });
  }

  // Toggle dynamic value / angle input based on action
  if (actionSelect && targetValGroup) {
    actionSelect.addEventListener('change', () => {
      const act = actionSelect.value;
      if (act === 'value') {
        targetValGroup.classList.remove('hidden');
        if (targetValLabel) targetValLabel.textContent = 'Nilai PWM Target (0-100%)';
      } else if (act === 'angle') {
        targetValGroup.classList.remove('hidden');
        if (targetValLabel) targetValLabel.textContent = 'Sudut Servo Target (0-180°)';
      } else {
        targetValGroup.classList.add('hidden');
      }
    });
  }

  // Day chip toggle
  if (daysChips) {
    daysChips.querySelectorAll('.day-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const day = parseInt(chip.dataset.day);
        chip.classList.toggle('active');
        chip.classList.toggle('selected');
        if (chip.classList.contains('active')) {
          if (!selectedDays.includes(day)) selectedDays.push(day);
        } else {
          selectedDays = selectedDays.filter(d => d !== day);
        }
      });
    });
  }

  // Sub-tab switcher: Jadwal vs Timer
  const subTabJadwalBtn = document.getElementById('subTabJadwalBtn');
  const subTabTimerBtn = document.getElementById('subTabTimerBtn');
  const subViewJadwal = document.getElementById('subViewJadwal');
  const subViewTimer = document.getElementById('subViewTimer');

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
      renderTimerGrid();
    });
  }

  // Form Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const deviceId = deviceSelect.value;
    const componentId = compSelect.value;
    const action = actionSelect.value;
    const time = document.getElementById('schedTime').value;
    const duration = parseInt(document.getElementById('schedDuration').value) || 0;
    const targetValue = document.getElementById('schedTargetValue') ? document.getElementById('schedTargetValue').value : '';
    const label = document.getElementById('schedLabel').value.trim();

    if (!deviceId || !componentId || !time) {
      showToast('Harap lengkapi target perangkat, komponen, dan jam eksekusi', false);
      return;
    }

    const payload = {
      deviceId,
      componentId,
      action,
      time,
      days: selectedDays,
      duration,
      targetValue,
      label
    };

    fetch('/api/schedules', {
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
        showToast('Jadwal baru berhasil disimpan!');
        form.reset();
        selectedDays = [];
        if (daysChips) daysChips.querySelectorAll('.day-chip').forEach(c => c.classList.remove('active', 'selected'));
        if (targetValGroup) targetValGroup.classList.add('hidden');
        loadSchedules();
      } else {
        showToast(res.message || 'Gagal menyimpan jadwal', false);
      }
    })
    .catch(err => showToast(err.message, false));
  });

  populateSchedulerDeviceDropdown();
  initEditScheduleModal();
  loadSchedules();
}

export function loadSchedules() {
  fetch('/api/schedules', {
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      state.setSchedules(res.data || []);
    }
  })
  .catch(err => console.error('[SCHEDULES LOAD ERROR]', err));
}

function populateSchedulerDeviceDropdown() {
  const deviceSelect = document.getElementById('schedDevice');
  if (!deviceSelect) return;

  const devices = Object.values(state.devices);
  let html = '<option value="">Pilih Perangkat...</option>';

  devices.forEach(d => {
    html += `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.name || d.deviceId)}</option>`;
  });

  deviceSelect.innerHTML = html;

  if (state.activeDeviceId) {
    deviceSelect.value = state.activeDeviceId;
    populateSchedulerComponentDropdown(state.activeDeviceId);
  }
}

function populateSchedulerComponentDropdown(deviceId) {
  const compSelect = document.getElementById('schedComponent');
  if (!compSelect) return;

  if (!deviceId || !state.devices[deviceId]) {
    compSelect.innerHTML = '<option value="">Pilih Komponen...</option>';
    return;
  }

  const dev = state.devices[deviceId];
  const comps = Array.isArray(dev.components) ? dev.components : [];

  // Filter hanya aktuator yang bisa dikontrol (switch, dimmer, servo, buzzer, rgb)
  const controllable = comps.filter(c => 
    ['switch', 'dimmer', 'servo', 'rgb_led', 'buzzer'].includes(c.type) ||
    ['switch', 'dimmer', 'servo', 'rgb_led', 'buzzer'].includes(c.driver)
  );

  let html = '<option value="">Pilih Komponen Target...</option>';
  controllable.forEach(c => {
    html += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)} [${c.type || c.driver}]</option>`;
  });

  compSelect.innerHTML = html;
}

export function renderScheduleList() {
  const listEl = document.getElementById('scheduleList');
  const badgeEl = document.getElementById('schedCountBadge');
  if (!listEl) return;

  const schedules = state.schedules;
  if (badgeEl) badgeEl.textContent = schedules.length;

  if (!schedules || schedules.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state-card" style="padding: 24px; text-align: center;">
        <span style="font-size: 1.8rem; display: block; margin-bottom: 6px;">⏰</span>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Belum ada jadwal otomatis terdaftar.</p>
      </div>
    `;
    return;
  }

  const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  listEl.innerHTML = '';
  schedules.forEach(s => {
    const item = document.createElement('div');
    item.className = 'schedule-item';
    item.id = `sched-item-${s.id}`;

    let daysText = 'Setiap Hari';
    if (Array.isArray(s.days) && s.days.length > 0 && s.days.length < 7) {
      daysText = s.days.map(d => DAY_NAMES[d] || d).join(', ');
    }

    let actionLabel = s.action.toUpperCase();
    if (s.action === 'angle') actionLabel = `Sudut ${s.targetValue}°`;
    else if (s.action === 'value') actionLabel = `Nilai ${s.targetValue}%`;

    const durationInfo = s.duration > 0 ? ` (Durasi: ${s.duration}m)` : '';

    item.innerHTML = `
      <div class="sched-item-info">
        <div class="sched-item-header">
          <span class="sched-item-time">${escapeHtml(s.time)}</span>
          <span class="sched-item-action-badge ${s.action}">${actionLabel}</span>
          <span class="sched-item-name">${escapeHtml(s.label || s.componentId)}</span>
        </div>
        <div class="sched-item-meta">
          <span>Target: ${escapeHtml(s.componentId || `Relay #${s.channel}`)} &bull; ${daysText}${durationInfo}</span>
        </div>
      </div>
      <div class="sched-item-actions">
        <label class="switch-control" title="${s.enabled ? 'Nonaktifkan Jadwal' : 'Aktifkan Jadwal'}">
          <input type="checkbox" ${s.enabled ? 'checked' : ''} data-sched-id="${s.id}">
          <span class="slider"></span>
        </label>
        <button type="button" class="btn-card-action btn-edit-sched" title="Edit Jadwal" data-sched-id="${s.id}">
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" style="pointer-events: none;">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button type="button" class="btn-card-action danger btn-del-sched" title="Hapus Jadwal" data-sched-id="${s.id}">
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" style="pointer-events: none;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    const chk = item.querySelector('input[type="checkbox"]');
    chk.addEventListener('change', () => toggleScheduleEnabled(s.id, chk.checked));

    item.querySelector('.btn-edit-sched').addEventListener('click', () => openEditScheduleModal(s));
    item.querySelector('.btn-del-sched').addEventListener('click', () => deleteSchedule(s.id, s.label));

    listEl.appendChild(item);
  });
}

function toggleScheduleEnabled(id, enabled) {
  fetch(`/api/schedules/${encodeURIComponent(id)}`, {
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
      showToast(`Jadwal ${enabled ? 'diaktifkan' : 'dinonaktifkan'}`);
      loadSchedules();
    }
  })
  .catch(e => showToast(e.message, false));
}

function deleteSchedule(id, label) {
  if (!confirm(`Hapus jadwal "${label || id}"?`)) return;

  fetch(`/api/schedules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      showToast('Jadwal berhasil dihapus');
      loadSchedules();
    }
  })
  .catch(e => showToast(e.message, false));
}

export function renderTimerGrid() {
  const grid = document.getElementById('timerGrid');
  if (!grid) return;

  const dev = state.getActiveDevice();
  if (!dev || !Array.isArray(dev.components)) {
    grid.innerHTML = '<p class="empty-schedule-msg">Pilih perangkat aktif terlebih dahulu</p>';
    return;
  }

  const switchComps = dev.components.filter(c => c.type === 'switch' || c.driver === 'switch');
  if (switchComps.length === 0) {
    grid.innerHTML = '<p class="empty-schedule-msg">Tidak ada komponen saklar/relay pada node ini</p>';
    return;
  }

  grid.innerHTML = '';
  switchComps.forEach(c => {
    const card = document.createElement('div');
    card.className = 'timer-card';
    card.innerHTML = `
      <div class="timer-card-header">
        <span style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHtml(c.name || c.id)}</span>
        <span style="font-size: 0.75rem; color: var(--text-subtle);">${escapeHtml(c.id)}</span>
      </div>
      <div style="display: flex; gap: 6px; margin: 10px 0;">
        <button type="button" class="btn-dimmer-preset" data-sec="60">1m</button>
        <button type="button" class="btn-dimmer-preset" data-sec="300">5m</button>
        <button type="button" class="btn-dimmer-preset" data-sec="600">10m</button>
        <button type="button" class="btn-dimmer-preset" data-sec="1800">30m</button>
      </div>
      <button type="button" class="btn-cancel-timer danger" style="width: 100%; padding: 6px; border-radius: var(--radius-sm); border: 1px solid rgba(244,63,94,0.3); background: rgba(244,63,94,0.1); color: var(--danger-glow); font-size: 0.75rem; font-weight: 700; cursor: pointer;">
        Batalkan Timer Aktif
      </button>
    `;

    card.querySelectorAll('.btn-dimmer-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const sec = parseInt(btn.dataset.sec);
        sendWs({
          action: 'set_component',
          target: dev.deviceId,
          componentId: c.id,
          value: true,
          duration: sec
        });
        showToast(`Timer ${c.name} diset selama ${sec / 60} menit`);
      });
    });

    card.querySelector('.btn-cancel-timer').addEventListener('click', () => {
      sendWs({
        action: 'cancel_timer',
        target: dev.deviceId,
        componentId: c.id
      });
      showToast(`Timer ${c.name} dibatalkan`);
    });

    grid.appendChild(card);
  });
}

// ==========================================
// Edit Schedule Modal Handlers
// ==========================================

export function initEditScheduleModal() {
  const modal = document.getElementById('modalEditSchedule');
  const formEdit = document.getElementById('formEditSchedule');
  const btnClose = document.getElementById('btnCloseEditSchedule');
  const btnCancel = document.getElementById('btnCancelEditSchedule');
  const editDeviceSelect = document.getElementById('editSchedDevice');
  const editActionSelect = document.getElementById('editSchedAction');
  const editDaysChips = document.getElementById('editDaysChips');
  const editEnabled = document.getElementById('editSchedEnabled');
  const editEnabledText = document.getElementById('editSchedEnabledText');

  if (!modal || !formEdit) return;

  if (btnClose) btnClose.addEventListener('click', closeEditScheduleModal);
  if (btnCancel) btnCancel.addEventListener('click', closeEditScheduleModal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeEditScheduleModal();
  });

  // Close on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeEditScheduleModal();
    }
  });

  // Device dropdown change in modal
  if (editDeviceSelect) {
    editDeviceSelect.addEventListener('change', () => {
      populateEditComponentDropdown(editDeviceSelect.value);
    });
  }

  // Action change in modal
  if (editActionSelect) {
    editActionSelect.addEventListener('change', () => {
      updateEditActionFields(editActionSelect.value);
    });
  }

  // Day chip toggle in modal
  if (editDaysChips) {
    editDaysChips.querySelectorAll('.day-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const day = parseInt(chip.dataset.day);
        chip.classList.toggle('active');
        chip.classList.toggle('selected');
        if (chip.classList.contains('active')) {
          if (!editSelectedDays.includes(day)) editSelectedDays.push(day);
        } else {
          editSelectedDays = editSelectedDays.filter(d => d !== day);
        }
      });
    });
  }

  // Enabled toggle text
  if (editEnabled && editEnabledText) {
    editEnabled.addEventListener('change', () => {
      const active = editEnabled.checked;
      editEnabledText.textContent = active ? 'Aktif' : 'Nonaktif';
      editEnabledText.style.color = active ? 'var(--primary-glow)' : 'var(--text-subtle)';
    });
  }

  // Form submit handler
  formEdit.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('editSchedId').value;
    const deviceId = editDeviceSelect.value;
    const compSelect = document.getElementById('editSchedComponent');
    const componentId = compSelect ? compSelect.value : '';
    const action = editActionSelect.value;
    const time = document.getElementById('editSchedTime').value;
    const duration = parseInt(document.getElementById('editSchedDuration').value) || 0;
    const targetValueInput = document.getElementById('editSchedTargetValue');
    const targetValue = targetValueInput ? targetValueInput.value : '';
    const label = document.getElementById('editSchedLabel').value.trim();
    const enabled = editEnabled ? editEnabled.checked : true;

    if (!id || !deviceId || !componentId || !time) {
      showToast('Harap lengkapi target perangkat, komponen, dan jam eksekusi', false);
      return;
    }

    const payload = {
      deviceId,
      componentId,
      action,
      time,
      days: editSelectedDays,
      duration,
      targetValue,
      label,
      enabled
    };

    fetch(`/api/schedules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.authToken}`
      },
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        showToast('Jadwal berhasil diperbarui!');
        closeEditScheduleModal();
        loadSchedules();
      } else {
        showToast(res.message || 'Gagal memperbarui jadwal', false);
      }
    })
    .catch(err => showToast(err.message, false));
  });
}

export function openEditScheduleModal(schedule) {
  const modal = document.getElementById('modalEditSchedule');
  if (!modal || !schedule) return;

  const idInput = document.getElementById('editSchedId');
  const actionSelect = document.getElementById('editSchedAction');
  const timeInput = document.getElementById('editSchedTime');
  const durationInput = document.getElementById('editSchedDuration');
  const labelInput = document.getElementById('editSchedLabel');
  const enabledInput = document.getElementById('editSchedEnabled');
  const enabledText = document.getElementById('editSchedEnabledText');
  const subtitle = document.getElementById('editSchedSubtitle');

  if (idInput) idInput.value = schedule.id;
  if (subtitle) {
    subtitle.textContent = `${schedule.label || schedule.componentId || 'Jadwal'} (ID: ${schedule.id})`;
  }

  populateEditDeviceDropdown(schedule.deviceId);
  populateEditComponentDropdown(schedule.deviceId, schedule.componentId || (schedule.channel ? `relay_${schedule.channel}` : ''));

  if (actionSelect) {
    actionSelect.value = schedule.action || 'on';
  }
  updateEditActionFields(schedule.action || 'on', schedule.targetValue);

  if (timeInput) timeInput.value = schedule.time || '';
  if (durationInput) durationInput.value = schedule.duration ? schedule.duration : '';
  if (labelInput) labelInput.value = schedule.label || '';

  const isEnabled = schedule.enabled !== false;
  if (enabledInput) {
    enabledInput.checked = isEnabled;
  }
  if (enabledText) {
    enabledText.textContent = isEnabled ? 'Aktif' : 'Nonaktif';
    enabledText.style.color = isEnabled ? 'var(--primary-glow)' : 'var(--text-subtle)';
  }

  // Days chips
  editSelectedDays = Array.isArray(schedule.days) ? [...schedule.days] : [];
  const daysChips = document.getElementById('editDaysChips');
  if (daysChips) {
    daysChips.querySelectorAll('.day-chip').forEach(chip => {
      const day = parseInt(chip.dataset.day);
      if (editSelectedDays.includes(day)) {
        chip.classList.add('active', 'selected');
      } else {
        chip.classList.remove('active', 'selected');
      }
    });
  }

  modal.classList.remove('hidden');
}

export function closeEditScheduleModal() {
  const modal = document.getElementById('modalEditSchedule');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function populateEditDeviceDropdown(selectedDeviceId) {
  const deviceSelect = document.getElementById('editSchedDevice');
  if (!deviceSelect) return;

  const devices = Object.values(state.devices);
  let html = '<option value="">Pilih Perangkat...</option>';

  devices.forEach(d => {
    const isSel = d.deviceId === selectedDeviceId ? 'selected' : '';
    html += `<option value="${escapeHtml(d.deviceId)}" ${isSel}>${escapeHtml(d.name || d.deviceId)}</option>`;
  });

  deviceSelect.innerHTML = html;
  if (selectedDeviceId) {
    deviceSelect.value = selectedDeviceId;
  }
}

function populateEditComponentDropdown(deviceId, selectedCompId = '') {
  const compSelect = document.getElementById('editSchedComponent');
  if (!compSelect) return;

  if (!deviceId || !state.devices[deviceId]) {
    compSelect.innerHTML = '<option value="">Pilih Komponen...</option>';
    return;
  }

  const dev = state.devices[deviceId];
  const comps = Array.isArray(dev.components) ? dev.components : [];

  const controllable = comps.filter(c => 
    ['switch', 'dimmer', 'servo', 'rgb_led', 'buzzer'].includes(c.type) ||
    ['switch', 'dimmer', 'servo', 'rgb_led', 'buzzer'].includes(c.driver)
  );

  let html = '<option value="">Pilih Komponen Target...</option>';
  controllable.forEach(c => {
    const isSel = c.id === selectedCompId ? 'selected' : '';
    html += `<option value="${escapeHtml(c.id)}" ${isSel}>${escapeHtml(c.name || c.id)} [${c.type || c.driver}]</option>`;
  });

  // Fallback jika komponen yang tersimpan berupa custom / relay lama
  if (selectedCompId && !controllable.some(c => c.id === selectedCompId)) {
    html += `<option value="${escapeHtml(selectedCompId)}" selected>${escapeHtml(selectedCompId)} (Tersimpan)</option>`;
  }

  compSelect.innerHTML = html;
  if (selectedCompId) {
    compSelect.value = selectedCompId;
  }
}

function updateEditActionFields(action, targetValue = '') {
  const targetValGroup = document.getElementById('editSchedTargetValueGroup');
  const targetValLabel = document.getElementById('editSchedTargetValueLabel');
  const targetValInput = document.getElementById('editSchedTargetValue');
  if (!targetValGroup) return;

  if (action === 'value') {
    targetValGroup.classList.remove('hidden');
    if (targetValLabel) targetValLabel.textContent = 'Nilai PWM Target (0-100%)';
    if (targetValInput) targetValInput.value = targetValue !== undefined ? targetValue : '';
  } else if (action === 'angle') {
    targetValGroup.classList.remove('hidden');
    if (targetValLabel) targetValLabel.textContent = 'Sudut Servo Target (0-180°)';
    if (targetValInput) targetValInput.value = targetValue !== undefined ? targetValue : '';
  } else {
    targetValGroup.classList.add('hidden');
  }
}
