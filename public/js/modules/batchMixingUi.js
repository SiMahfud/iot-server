// =============================================================
// Batch Mixing UI — Auto-Dosing Hidroponik Frontend Module
// AgyGateway Universal IoT Server v4.0
// =============================================================

import { state, escapeHtml, showToast } from '../state.js';
import { sendWs } from '../wsClient.js';

// ─── State Lokal ───
let _recipes = [];
let _calibrations = {};
let _mixingStatus = { running: false };
let _pollingTimer = null;

// ─── Init & Event Binding ───
export function initBatchMixingUi() {
  const btnOpen = document.getElementById('btnOpenMixingModal');
  const modal = document.getElementById('modalBatchMixing');
  const btnClose = document.getElementById('btnCloseMixingModal');

  if (btnOpen) btnOpen.addEventListener('click', () => openMixingModal());
  if (btnClose) btnClose.addEventListener('click', () => closeMixingModal());
  if (modal) modal.addEventListener('click', (e) => {
    if (e.target === modal) closeMixingModal();
  });

  // Sub-nav tabs dalam modal
  document.querySelectorAll('.mixing-subnav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mixing-subnav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.mixing-panel').forEach(p => p.classList.add('hidden'));
      const target = document.getElementById(btn.dataset.mixPanel);
      if (target) target.classList.remove('hidden');
    });
  });

  // Form tambah resep
  const formAdd = document.getElementById('formAddRecipe');
  if (formAdd) formAdd.addEventListener('submit', handleAddRecipe);

  // Start & Stop
  const btnStart = document.getElementById('btnStartMixing');
  const btnStop = document.getElementById('btnEmergencyStop');
  if (btnStart) btnStart.addEventListener('click', handleStartMixing);
  if (btnStop) btnStop.addEventListener('click', handleStopMixing);

  // Listen WS events
  state.on('MIXING_STATUS', (msg) => {
    _mixingStatus = msg;
    renderMonitor();
  });
  state.on('MIXING_PROGRESS', (msg) => {
    _mixingStatus = msg;
    renderMonitor();
  });
  state.on('MIXING_FINISHED', (msg) => {
    _mixingStatus = { running: false };
    renderMonitor();
    showToast(msg.message, msg.status === 'completed');
  });
}

// ─── Modal ───
function openMixingModal() {
  const modal = document.getElementById('modalBatchMixing');
  if (modal) modal.classList.remove('hidden');
  loadRecipes();
  loadStatus();
}

function closeMixingModal() {
  const modal = document.getElementById('modalBatchMixing');
  if (modal) modal.classList.add('hidden');
}

// ─── API Helpers ───
async function apiFetch(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;
  const res = await fetch(url, { ...opts, headers });
  return res.json();
}

async function loadRecipes() {
  try {
    const res = await apiFetch('/api/mixing/recipes');
    if (res.success) {
      _recipes = res.data || [];
      renderRecipeSelect();
      renderRecipeList();
    }
  } catch (e) { console.warn('[MIXING-UI] Gagal memuat resep:', e.message); }
}

async function loadStatus() {
  try {
    const res = await apiFetch('/api/mixing/status');
    if (res.success) {
      _mixingStatus = res.data || { running: false };
      renderMonitor();
    }
  } catch (e) { console.warn('[MIXING-UI] Gagal memuat status:', e.message); }
}

// ─── Render Monitor Banner ───
function renderMonitor() {
  const banner = document.getElementById('mixingMonitorBanner');
  const btnStart = document.getElementById('btnStartMixing');
  const btnStop = document.getElementById('btnEmergencyStop');
  if (!banner) return;

  if (!_mixingStatus || !_mixingStatus.running) {
    banner.className = 'mixing-monitor-banner';
    banner.innerHTML = `
      <div class="mixing-monitor-header">
        <span class="mixing-step-title">⏹ Siap Digunakan</span>
      </div>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">Pilih resep atau buat langkah baru lalu tekan <strong>Mulai Pencampuran</strong>.</p>
    `;
    if (btnStart) btnStart.disabled = false;
    if (btnStop) btnStop.style.display = 'none';
    return;
  }

  const s = _mixingStatus;
  const step = s.currentStepInfo;
  const pct = step ? Math.min(100, Math.round((step.elapsed / step.durationSec) * 100)) : 0;
  const phaseLabel = s.phase === 'delay' ? '⏸ Jeda Aduk / Sirkulasi' : `▶ ${step ? step.label : '...'}`;
  const timeLeft = step ? Math.max(0, (s.phase === 'delay' ? step.delaySec : step.durationSec) - step.elapsed) : 0;
  const tlMin = Math.floor(timeLeft / 60);
  const tlSec = timeLeft % 60;

  banner.className = 'mixing-monitor-banner running';
  banner.innerHTML = `
    <div class="mixing-monitor-header">
      <span class="mixing-step-title">🧪 ${escapeHtml(s.recipeName || 'Pencampuran')}</span>
      <span class="mixing-timer-big">${String(tlMin).padStart(2,'0')}:${String(tlSec).padStart(2,'0')}</span>
    </div>
    <div class="mixing-progress-container">
      <div class="mixing-progress-bar animated" style="width: ${pct}%;"></div>
    </div>
    <div class="mixing-meta-row">
      <span>${phaseLabel}</span>
      <span>Langkah ${(s.currentStep || 0) + 1} / ${s.totalSteps || '?'}</span>
    </div>
  `;

  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.style.display = '';

  // Render stepper
  renderStepperList(s);
}

function renderStepperList(s) {
  const container = document.getElementById('mixingStepsList');
  if (!container || !s || !s.running) {
    if (container) container.innerHTML = '';
    return;
  }

  // Kalau sedang running, bisa bangun stepper dari recipe steps di _mixingStatus
  // Tapi kita butuh semua steps. Kita gunakan _selectedRecipeSteps atau dari status
  // Untuk saat ini, buat berdasarkan data dari monitor
  // Kita perlu cara mendapat seluruh steps - untuk itu kita simpan saat start
  const steps = _lastJobSteps || [];
  if (steps.length === 0) return;

  container.innerHTML = steps.map((step, i) => {
    const isActive = i === s.currentStep;
    const isCompleted = (s.completedSteps || []).includes(i);
    const cls = isActive ? 'active' : (isCompleted ? 'completed' : '');
    const statusTag = isActive
      ? `<span class="step-status-tag running">${s.phase === 'delay' ? 'JEDA' : 'BERJALAN'}</span>`
      : (isCompleted ? `<span class="step-status-tag done">✓</span>` : `<span class="step-status-tag standby">MENUNGGU</span>`);

    return `
      <div class="mixing-step-card ${cls}">
        <div class="step-card-left">
          <div class="step-number-badge">${i + 1}</div>
          <div class="step-card-info">
            <h5>${escapeHtml(step.label)}</h5>
            <p>${escapeHtml(step.componentId)} • Jeda: ${step.delaySec}s</p>
          </div>
        </div>
        <div class="step-card-right">
          <span class="step-duration-tag">${step.durationSec}s</span>
          ${statusTag}
        </div>
      </div>
    `;
  }).join('');
}

// ─── Render Recipe Select Dropdown ───
function renderRecipeSelect() {
  const sel = document.getElementById('mixRecipeSelect');
  if (!sel) return;

  sel.innerHTML = '<option value="">-- Pilih Resep Tersimpan --</option>';
  _recipes.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.name} (${r.targetPpm || '?'} PPM, ${r.targetVolume || '?'}L)`;
    sel.appendChild(opt);
  });

  sel.addEventListener('change', () => {
    const recipe = _recipes.find(r => r.id === sel.value);
    if (recipe) {
      fillStepsFromRecipe(recipe);
    }
  });
}

function fillStepsFromRecipe(recipe) {
  const container = document.getElementById('mixStepsBuilder');
  if (!container) return;

  container.innerHTML = '';
  (recipe.steps || []).forEach((step, i) => {
    addStepRow(container, step, i);
  });

  const ppmInput = document.getElementById('mixTargetPpm');
  const volInput = document.getElementById('mixTargetVolume');
  if (ppmInput) ppmInput.value = recipe.targetPpm || '';
  if (volInput) volInput.value = recipe.targetVolume || '';
}

// ─── Step Builder Rows ───
let _stepCounter = 0;

function addStepRow(container, data = {}, index) {
  _stepCounter++;
  const row = document.createElement('div');
  row.className = 'mixing-step-card';
  row.dataset.stepIdx = _stepCounter;

  // Get switch components from active device
  const dev = state.getActiveDevice();
  const switchComps = (dev && Array.isArray(dev.components))
    ? dev.components.filter(c => c.type === 'switch' || c.driver === 'switch')
    : [];

  const compOptions = switchComps.map(c =>
    `<option value="${escapeHtml(c.id)}" ${c.id === data.componentId ? 'selected' : ''}>${escapeHtml(c.name || c.id)}</option>`
  ).join('');

  row.innerHTML = `
    <div class="step-card-left" style="flex: 1; gap: 8px;">
      <div class="step-number-badge">${(index !== undefined ? index : _stepCounter - 1) + 1}</div>
      <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
        <input type="text" class="form-input step-label-input" value="${escapeHtml(data.label || '')}" placeholder="Label (misal: Air Baku)" style="font-size: 0.82rem; padding: 5px 8px;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <select class="form-input step-comp-select" style="flex: 1; font-size: 0.8rem; padding: 4px 6px; min-width: 120px;">
            <option value="">-- Pompa --</option>
            ${compOptions}
          </select>
          <div style="display: flex; align-items: center; gap: 4px;">
            <input type="number" class="form-input step-duration-input" value="${data.durationSec || 60}" min="1" max="86400" placeholder="Detik" style="width: 70px; font-size: 0.8rem; padding: 4px 6px;">
            <span class="mixing-unit-badge">detik</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <input type="number" class="form-input step-delay-input" value="${data.delaySec !== undefined ? data.delaySec : 10}" min="0" max="3600" placeholder="Jeda" style="width: 60px; font-size: 0.8rem; padding: 4px 6px;">
            <span class="mixing-unit-badge">jeda</span>
          </div>
        </div>
      </div>
    </div>
    <button type="button" class="btn-card-action danger btn-remove-step" title="Hapus Langkah" style="align-self: flex-start; margin-top: 2px;">✕</button>
  `;

  row.querySelector('.btn-remove-step').addEventListener('click', () => {
    row.remove();
    renumberSteps();
  });

  container.appendChild(row);
}

function renumberSteps() {
  const container = document.getElementById('mixStepsBuilder');
  if (!container) return;
  container.querySelectorAll('.mixing-step-card').forEach((card, i) => {
    const badge = card.querySelector('.step-number-badge');
    if (badge) badge.textContent = i + 1;
  });
}

function collectStepsFromBuilder() {
  const container = document.getElementById('mixStepsBuilder');
  if (!container) return [];

  const rows = container.querySelectorAll('.mixing-step-card');
  const steps = [];
  rows.forEach(row => {
    const label = row.querySelector('.step-label-input')?.value || '';
    const componentId = row.querySelector('.step-comp-select')?.value || '';
    const durationSec = parseInt(row.querySelector('.step-duration-input')?.value) || 60;
    const delaySec = parseInt(row.querySelector('.step-delay-input')?.value) || 0;
    if (componentId) {
      steps.push({ label: label || componentId, componentId, durationSec, delaySec });
    }
  });
  return steps;
}

// ─── Variabel untuk menyimpan steps job terakhir (untuk stepper visual) ───
let _lastJobSteps = [];

// ─── Handlers ───
async function handleStartMixing() {
  const steps = collectStepsFromBuilder();
  if (steps.length === 0) {
    showToast('Tambahkan minimal 1 langkah pompa terlebih dahulu', false);
    return;
  }

  const dev = state.getActiveDevice();
  if (!dev) {
    showToast('Pilih perangkat aktif terlebih dahulu', false);
    return;
  }

  _lastJobSteps = steps;

  try {
    const res = await apiFetch('/api/mixing/start', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: dev.deviceId,
        steps
      })
    });
    if (res.success) {
      showToast(res.message || 'Pencampuran dimulai!');
      loadStatus();
    } else {
      showToast(res.message || 'Gagal memulai pencampuran', false);
    }
  } catch (e) {
    showToast('Error: ' + e.message, false);
  }
}

async function handleStopMixing() {
  if (!confirm('⚠️ EMERGENCY STOP — Yakin ingin menghentikan semua pompa sekarang?')) return;
  try {
    const res = await apiFetch('/api/mixing/stop', { method: 'POST' });
    if (res.success) {
      showToast(res.message || 'Pencampuran dihentikan');
      _mixingStatus = { running: false };
      renderMonitor();
    } else {
      showToast(res.message || 'Gagal menghentikan', false);
    }
  } catch (e) {
    showToast('Error: ' + e.message, false);
  }
}

async function handleAddRecipe(e) {
  e.preventDefault();
  const name = document.getElementById('recipeNameInput')?.value?.trim();
  const desc = document.getElementById('recipeDescInput')?.value?.trim() || '';
  const ppm = document.getElementById('mixTargetPpm')?.value || 1000;
  const vol = document.getElementById('mixTargetVolume')?.value || 10;
  const steps = collectStepsFromBuilder();

  if (!name) { showToast('Nama resep wajib diisi', false); return; }
  if (steps.length === 0) { showToast('Tambahkan minimal 1 langkah', false); return; }

  const dev = state.getActiveDevice();

  try {
    const res = await apiFetch('/api/mixing/recipes', {
      method: 'POST',
      body: JSON.stringify({
        name, description: desc,
        deviceId: dev ? dev.deviceId : '',
        targetPpm: ppm, targetVolume: vol,
        steps
      })
    });
    if (res.success) {
      showToast(`Resep "${name}" berhasil disimpan`);
      loadRecipes();
      const nameInput = document.getElementById('recipeNameInput');
      if (nameInput) nameInput.value = '';
    } else {
      showToast(res.message || 'Gagal menyimpan resep', false);
    }
  } catch (e) {
    showToast('Error: ' + e.message, false);
  }
}

// ─── Render Saved Recipes List ───
function renderRecipeList() {
  const container = document.getElementById('savedRecipesList');
  if (!container) return;

  if (_recipes.length === 0) {
    container.innerHTML = '<p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 14px 0;">Belum ada resep tersimpan. Buat resep dari tab Jalankan.</p>';
    return;
  }

  container.innerHTML = _recipes.map(r => `
    <div class="mixing-step-card" style="cursor: default;">
      <div class="step-card-left" style="flex: 1;">
        <div class="step-card-info">
          <h5>🧪 ${escapeHtml(r.name)}</h5>
          <p>${r.steps ? r.steps.length : 0} langkah • ${r.targetPpm || '?'} PPM • ${r.targetVolume || '?'} Liter</p>
        </div>
      </div>
      <div class="step-card-right">
        <button type="button" class="btn-dimmer-preset btn-load-recipe" data-recipe-id="${r.id}" title="Muat ke Builder">Muat</button>
        <button type="button" class="btn-card-action danger btn-delete-recipe" data-recipe-id="${r.id}" title="Hapus Resep">🗑️</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.btn-load-recipe').forEach(btn => {
    btn.addEventListener('click', () => {
      const recipe = _recipes.find(r => r.id === btn.dataset.recipeId);
      if (recipe) {
        fillStepsFromRecipe(recipe);
        // Switch ke tab Jalankan
        document.querySelectorAll('.mixing-subnav-btn').forEach(b => b.classList.remove('active'));
        const runTab = document.querySelector('.mixing-subnav-btn[data-mix-panel="mixPanelRun"]');
        if (runTab) runTab.classList.add('active');
        document.querySelectorAll('.mixing-panel').forEach(p => p.classList.add('hidden'));
        const runPanel = document.getElementById('mixPanelRun');
        if (runPanel) runPanel.classList.remove('hidden');
        showToast(`Resep "${recipe.name}" dimuat ke builder`);
      }
    });
  });

  container.querySelectorAll('.btn-delete-recipe').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Hapus resep ini?')) return;
      try {
        const res = await apiFetch(`/api/mixing/recipes/${btn.dataset.recipeId}`, { method: 'DELETE' });
        if (res.success) {
          showToast('Resep dihapus');
          loadRecipes();
        }
      } catch (e) { showToast(e.message, false); }
    });
  });
}

// ─── Exported: Tambah Step Row (dipanggil dari onclick di HTML) ───
export function addMixingStep() {
  const container = document.getElementById('mixStepsBuilder');
  if (!container) return;
  addStepRow(container, {}, container.querySelectorAll('.mixing-step-card').length);
}

// ─── Exported: Render ulang saat device berubah ───
export function refreshMixingDeviceInfo() {
  // Noop — dipanggil saat device berubah agar steps builder punya options terbaru
}
