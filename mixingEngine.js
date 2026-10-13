// ==========================================
// Mixing Engine — Batch Dosing Orchestrator
// Sequential Pump Control untuk Pencampuran Nutrisi Hidroponik
// ==========================================

const crypto = require('crypto');
const { WebSocket } = require('ws');
const db = require('./database');

class MixingEngine {
  constructor() {
    this._deviceManager = null;
    this._broadcastFn = null;
    this._activeJob = null;    // Object: { id, deviceId, recipe, steps, currentStep, timerId, ... }
    this._recipes = [];        // Daftar resep tersimpan
    this._pumpCalibrations = {}; // { componentId: { flowRate: ml/s, label: '...' } }
    this._loadRecipes();
  }

  /**
   * Injeksi referensi deviceManager dan broadcast function dari server.js
   */
  init(deviceManager, broadcastFn) {
    this._deviceManager = deviceManager;
    this._broadcastFn = broadcastFn;
    console.log(`[MIXING-ENGINE] Inisialisasi selesai. ${this._recipes.length} resep tersimpan.`);
  }

  // ----- Persistensi Resep & Kalibrasi (JSON Lokal) -----

  _loadRecipes() {
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, 'mixing-recipes.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this._recipes = data.recipes || [];
        this._pumpCalibrations = data.calibrations || {};
      }
    } catch (err) {
      console.warn('[MIXING-ENGINE] Gagal memuat resep:', err.message);
      this._recipes = [];
      this._pumpCalibrations = {};
    }
  }

  _saveRecipes() {
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, 'mixing-recipes.json');
      fs.writeFileSync(filePath, JSON.stringify({
        recipes: this._recipes,
        calibrations: this._pumpCalibrations
      }, null, 2), 'utf8');
    } catch (err) {
      console.error('[MIXING-ENGINE] Gagal menyimpan resep:', err.message);
    }
  }

  // ----- Recipe CRUD -----

  getRecipes() {
    return this._recipes;
  }

  getRecipeById(id) {
    return this._recipes.find(r => r.id === id) || null;
  }

  addRecipe(data) {
    const recipe = {
      id: 'mix_' + crypto.randomBytes(6).toString('hex'),
      name: data.name || 'Resep Baru',
      description: data.description || '',
      deviceId: data.deviceId || '',
      targetPpm: parseInt(data.targetPpm) || 1000,
      targetVolume: parseFloat(data.targetVolume) || 10,
      steps: Array.isArray(data.steps) ? data.steps.map((s, i) => ({
        order: i + 1,
        componentId: s.componentId,
        label: s.label || `Langkah ${i + 1}`,
        durationSec: parseInt(s.durationSec) || 60,
        delaySec: parseInt(s.delaySec) || 10, // jeda setelah langkah ini (aduk/sirkulasi)
      })) : [],
      createdAt: new Date().toISOString()
    };
    this._recipes.push(recipe);
    this._saveRecipes();
    return recipe;
  }

  updateRecipe(id, data) {
    const idx = this._recipes.findIndex(r => r.id === id);
    if (idx === -1) return null;

    const current = this._recipes[idx];
    if (data.name !== undefined) current.name = data.name;
    if (data.description !== undefined) current.description = data.description;
    if (data.deviceId !== undefined) current.deviceId = data.deviceId;
    if (data.targetPpm !== undefined) current.targetPpm = parseInt(data.targetPpm) || current.targetPpm;
    if (data.targetVolume !== undefined) current.targetVolume = parseFloat(data.targetVolume) || current.targetVolume;
    if (Array.isArray(data.steps)) {
      current.steps = data.steps.map((s, i) => ({
        order: i + 1,
        componentId: s.componentId,
        label: s.label || `Langkah ${i + 1}`,
        durationSec: parseInt(s.durationSec) || 60,
        delaySec: parseInt(s.delaySec) || 10,
      }));
    }
    current.updatedAt = new Date().toISOString();
    this._recipes[idx] = current;
    this._saveRecipes();
    return current;
  }

  deleteRecipe(id) {
    const idx = this._recipes.findIndex(r => r.id === id);
    if (idx === -1) return false;
    this._recipes.splice(idx, 1);
    this._saveRecipes();
    return true;
  }

  // ----- Calibration -----

  getCalibrations() {
    return this._pumpCalibrations;
  }

  setCalibration(componentId, flowRateMlPerSec, label) {
    this._pumpCalibrations[componentId] = {
      flowRate: parseFloat(flowRateMlPerSec) || 1,
      label: label || componentId,
      updatedAt: new Date().toISOString()
    };
    this._saveRecipes();
    return this._pumpCalibrations[componentId];
  }

  // ----- Job Status -----

  getStatus() {
    if (!this._activeJob) {
      return { running: false };
    }
    const job = this._activeJob;
    const step = job.steps[job.currentStep];
    const elapsed = step ? Math.floor((Date.now() - (job.stepStartedAt || Date.now())) / 1000) : 0;
    return {
      running: true,
      jobId: job.id,
      recipeName: job.recipeName,
      deviceId: job.deviceId,
      totalSteps: job.steps.length,
      currentStep: job.currentStep,
      currentStepInfo: step ? {
        label: step.label,
        componentId: step.componentId,
        durationSec: step.durationSec,
        delaySec: step.delaySec,
        elapsed: elapsed,
      } : null,
      phase: job.phase, // 'pump' | 'delay' | 'done'
      completedSteps: job.completedSteps || [],
      startedAt: job.startedAt,
    };
  }

  // ----- Eksekusi Resep -----

  startJob(recipeIdOrSteps, deviceIdOverride) {
    if (this._activeJob) {
      return { success: false, message: 'Sudah ada proses pencampuran yang sedang berjalan' };
    }

    let recipe;
    let steps;
    let recipeName;
    let deviceId;

    if (typeof recipeIdOrSteps === 'string') {
      // Jalankan dari resep tersimpan
      recipe = this.getRecipeById(recipeIdOrSteps);
      if (!recipe) return { success: false, message: 'Resep tidak ditemukan' };
      steps = recipe.steps;
      recipeName = recipe.name;
      deviceId = deviceIdOverride || recipe.deviceId;
    } else if (Array.isArray(recipeIdOrSteps)) {
      // Jalankan dari langkah manual (one-shot / tanpa simpan)
      steps = recipeIdOrSteps.map((s, i) => ({
        order: i + 1,
        componentId: s.componentId,
        label: s.label || `Langkah ${i + 1}`,
        durationSec: parseInt(s.durationSec) || 60,
        delaySec: parseInt(s.delaySec) || 10,
      }));
      recipeName = 'Manual Mixing';
      deviceId = deviceIdOverride;
    } else {
      return { success: false, message: 'Data resep tidak valid' };
    }

    if (!steps || steps.length === 0) {
      return { success: false, message: 'Resep tidak memiliki langkah apapun' };
    }

    if (!deviceId) {
      return { success: false, message: 'Device ID tidak diisi' };
    }

    // Validasi device online
    if (this._deviceManager) {
      const targetSocket = this._deviceManager.getSocket(deviceId);
      if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
        return { success: false, message: `Perangkat ${deviceId} sedang offline` };
      }
    }

    const jobId = 'job_' + crypto.randomBytes(4).toString('hex');
    this._activeJob = {
      id: jobId,
      recipeName,
      deviceId,
      steps,
      currentStep: 0,
      phase: 'pump', // 'pump' | 'delay' | 'done'
      completedSteps: [],
      startedAt: new Date().toISOString(),
      stepStartedAt: null,
      timerId: null,
    };

    console.log(`[MIXING-ENGINE] 🧪 Job ${jobId} dimulai: "${recipeName}" (${steps.length} langkah) pada device ${deviceId}`);
    db.addLog(deviceId, 'mixing_started', `Pencampuran "${recipeName}" dimulai (${steps.length} langkah)`);

    this._broadcastStatus();
    this._executeCurrentStep();

    return { success: true, jobId, message: `Pencampuran "${recipeName}" dimulai` };
  }

  _executeCurrentStep() {
    const job = this._activeJob;
    if (!job) return;

    if (job.currentStep >= job.steps.length) {
      // Semua langkah selesai
      this._finishJob('completed');
      return;
    }

    const step = job.steps[job.currentStep];
    job.phase = 'pump';
    job.stepStartedAt = Date.now();

    console.log(`[MIXING-ENGINE] ▶ Step ${job.currentStep + 1}/${job.steps.length}: ${step.label} (${step.componentId}) selama ${step.durationSec}s`);

    // Kirim perintah ON ke hardware dengan timer duration
    this._sendPumpCommand(job.deviceId, step.componentId, true, step.durationSec);

    this._broadcastStatus();
    this._broadcastProgress(`▶ Langkah ${job.currentStep + 1}: ${step.label} (${step.durationSec}s)`);

    // Set timer: setelah durasi pompa selesai, masuk ke fase delay
    job.timerId = setTimeout(() => {
      this._onPumpDone();
    }, step.durationSec * 1000);
  }

  _onPumpDone() {
    const job = this._activeJob;
    if (!job) return;

    const step = job.steps[job.currentStep];
    job.completedSteps.push(job.currentStep);

    console.log(`[MIXING-ENGINE] ✓ Step ${job.currentStep + 1} selesai: ${step.label}`);

    // Apakah ada delay/jeda setelah step ini?
    const isLastStep = (job.currentStep >= job.steps.length - 1);

    if (!isLastStep && step.delaySec > 0) {
      // Masuk fase delay (jeda aduk/sirkulasi)
      job.phase = 'delay';
      job.stepStartedAt = Date.now();
      this._broadcastStatus();
      this._broadcastProgress(`⏸ Jeda aduk ${step.delaySec}s sebelum langkah berikutnya...`);

      job.timerId = setTimeout(() => {
        job.currentStep++;
        this._executeCurrentStep();
      }, step.delaySec * 1000);
    } else {
      // Langsung ke step berikutnya atau selesai
      job.currentStep++;
      this._executeCurrentStep();
    }
  }

  stopJob() {
    if (!this._activeJob) {
      return { success: false, message: 'Tidak ada proses pencampuran yang berjalan' };
    }

    const job = this._activeJob;
    console.log(`[MIXING-ENGINE] 🛑 Emergency STOP pada job ${job.id}`);

    // Matikan semua pompa dalam resep
    const uniqueComponents = [...new Set(job.steps.map(s => s.componentId))];
    uniqueComponents.forEach(compId => {
      this._sendPumpCommand(job.deviceId, compId, false, 0);
    });

    this._finishJob('stopped');
    return { success: true, message: 'Pencampuran dihentikan paksa (Emergency Stop)' };
  }

  _finishJob(status) {
    const job = this._activeJob;
    if (!job) return;

    if (job.timerId) {
      clearTimeout(job.timerId);
      job.timerId = null;
    }

    job.phase = 'done';
    const isCompleted = status === 'completed';
    const message = isCompleted
      ? `✅ Pencampuran "${job.recipeName}" selesai sukses (${job.steps.length} langkah)`
      : `🛑 Pencampuran "${job.recipeName}" dihentikan paksa`;

    console.log(`[MIXING-ENGINE] ${message}`);
    db.addLog(job.deviceId, isCompleted ? 'mixing_completed' : 'mixing_stopped', message);

    // Broadcast final status
    if (this._broadcastFn) {
      this._broadcastFn({
        type: 'MIXING_FINISHED',
        jobId: job.id,
        status, // 'completed' | 'stopped'
        recipeName: job.recipeName,
        deviceId: job.deviceId,
        message
      });
      this._broadcastFn({
        type: 'NOTIFICATION',
        level: isCompleted ? 'info' : 'warning',
        message
      });
    }

    this._activeJob = null;
  }

  // ----- Helper Methods -----

  _sendPumpCommand(deviceId, componentId, state, durationSec) {
    if (!this._deviceManager) return;
    const targetSocket = this._deviceManager.getSocket(deviceId);
    if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
      console.warn(`[MIXING-ENGINE] Device ${deviceId} offline saat mengirim perintah pompa`);
      return;
    }

    const payload = {
      action: 'set_component',
      target: deviceId,
      componentId: componentId,
      value: state,
    };
    if (state === true && durationSec > 0) {
      payload.duration = durationSec;
    }

    targetSocket.send(JSON.stringify(payload));

    // Update state lokal
    if (this._deviceManager.updateComponentState) {
      this._deviceManager.updateComponentState(deviceId, componentId, state);
    }
  }

  _broadcastStatus() {
    if (this._broadcastFn) {
      this._broadcastFn({
        type: 'MIXING_STATUS',
        ...this.getStatus()
      });
    }
  }

  _broadcastProgress(message) {
    if (this._broadcastFn) {
      this._broadcastFn({
        type: 'MIXING_PROGRESS',
        message,
        ...this.getStatus()
      });
    }
  }
}

module.exports = new MixingEngine();
