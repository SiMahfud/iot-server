// =============================================================
// Universal Scheduler & Timer Countdown UI Module
// AgyGateway Universal IoT Server v4.0
// ==========================================

import { state, escapeHtml, showToast } from '../state.js';
import { sendWs } from '../wsClient.js';

let selectedDays = [];

export function initSchedulerUi() {
  const form = document.getElementById('scheduleForm');
  const deviceSelect = document.getElementById('schedDevice');
  const compSelect = document.getElementById('schedComponent');
  const actionSelect = document.getElementById('schedAction');
  const targetValGroup = document.getElementById('schedTargetValueGroup');
  const targetValLabel = document.getElementById('schedTargetValueLabel');
  const daysChips = document.getElementById('daysChips');

  if (!form) return;

  state.on('devicesChange', () => populateSchedulerDeviceDropdown());
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
        if (daysChips) daysChips.querySelectorAll('.day-chip').forEach(c => c.classList.remove('active'));
        if (targetValGroup) targetValGroup.classList.add('hidden');
        loadSchedules();
      } else {
        showToast(res.message || 'Gagal menyimpan jadwal', false);
      }
    })
    .catch(err => showToast(err.message, false));
  });

  populateSchedulerDeviceDropdown();
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
        <label class="switch-control">
          <input type="checkbox" ${s.enabled ? 'checked' : ''} data-sched-id="${s.id}">
          <span class="slider"></span>
        </label>
        <button type="button" class="btn-card-action danger btn-del-sched" title="Hapus Jadwal">🗑️</button>
      </div>
    `;

    const chk = item.querySelector('input[type="checkbox"]');
    chk.addEventListener('change', () => toggleScheduleEnabled(s.id, chk.checked));

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
