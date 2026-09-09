// ==========================================
// Automation Engine — Smart Rule Engine (IF-THEN)
// Evaluator berbasis event-driven untuk telemetri IoT
// ==========================================

const db = require('./database');
const WebSocket = require('ws');

class AutomationEngine {
  constructor() {
    this.rules = [];
    this._deviceManager = null;
    this._broadcastFn = null;
    this.loadRules();
  }

  init(deviceManager, broadcastFn) {
    this._deviceManager = deviceManager;
    this._broadcastFn = broadcastFn;
    this.loadRules();
    console.log(`[AUTOMATION-ENGINE] Inisialisasi selesai. ${this.rules.length} aturan aktif dari SQLite.`);
  }

  loadRules() {
    try {
      this.rules = db.getAllAutomations();
      console.log(`[AUTOMATION-ENGINE] Memuat ${this.rules.length} aturan otomasi dari SQLite`);
    } catch (err) {
      console.error('[AUTOMATION-ENGINE] Gagal memuat aturan:', err.message);
      this.rules = [];
    }
  }

  reloadRules() {
    this.loadRules();
    if (this._broadcastFn) {
      this._broadcastFn({ type: 'AUTOMATIONS_UPDATE', automations: this.rules });
    }
  }

  getRules(deviceId = null) {
    if (!deviceId) return this.rules;
    return this.rules.filter(r => r.triggerDeviceId === deviceId || r.actionDeviceId === deviceId);
  }

  addRule(data) {
    const created = db.addAutomation(data);
    this.reloadRules();
    db.addLog(data.triggerDeviceId, 'automation_created', `Aturan "${created.name}" berhasil dibuat`);
    return created;
  }

  updateRule(id, data) {
    const updated = db.updateAutomation(id, data);
    this.reloadRules();
    return updated;
  }

  deleteRule(id) {
    const rule = db.getAutomationById(id);
    const success = db.deleteAutomation(id);
    if (success && rule) {
      db.addLog(rule.triggerDeviceId, 'automation_deleted', `Aturan "${rule.name}" dihapus`);
      this.reloadRules();
    }
    return success;
  }

  // Evaluasi aturan secara real-time saat ada telemetri/sinyal masuk
  evaluate(deviceId, componentId, value) {
    if (!this.rules || this.rules.length === 0) return;

    const matchingRules = this.rules.filter(r => 
      r.enabled &&
      r.triggerDeviceId === deviceId &&
      (r.triggerComponentId === componentId || r.triggerComponentId === '*' || componentId.startsWith(r.triggerComponentId))
    );

    if (matchingRules.length === 0) return;

    const now = Date.now();
    const numVal = parseFloat(value);
    const isNum = !isNaN(numVal);

    for (const rule of matchingRules) {
      // 1. Cek Cooldown anti-spam / debounce
      if (rule.lastTriggered) {
        const lastTime = new Date(rule.lastTriggered).getTime();
        const cooldownMs = (rule.cooldown || 10) * 1000;
        if (now - lastTime < cooldownMs) {
          continue; // Masih dalam masa cooldown
        }
      }

      // 2. Evaluasi Kondisi Operator
      let isConditionMet = false;
      const op = rule.operator;
      const targetThreshold = rule.threshold;

      if (op === '>') {
        isConditionMet = isNum && targetThreshold !== null && numVal > targetThreshold;
      } else if (op === '<') {
        isConditionMet = isNum && targetThreshold !== null && numVal < targetThreshold;
      } else if (op === '>=') {
        isConditionMet = isNum && targetThreshold !== null && numVal >= targetThreshold;
      } else if (op === '<=') {
        isConditionMet = isNum && targetThreshold !== null && numVal <= targetThreshold;
      } else if (op === '==') {
        if (isNum && targetThreshold !== null) {
          isConditionMet = Math.abs(numVal - targetThreshold) < 0.001;
        } else {
          isConditionMet = String(value).toLowerCase() === String(targetThreshold || '').toLowerCase();
        }
      } else if (op === '!=') {
        if (isNum && targetThreshold !== null) {
          isConditionMet = Math.abs(numVal - targetThreshold) >= 0.001;
        } else {
          isConditionMet = String(value).toLowerCase() !== String(targetThreshold || '').toLowerCase();
        }
      } else if (op === 'motion') {
        // PIR Sensor atau Digital IN Triggered (HIGH / true / 1)
        isConditionMet = value === '1' || value === 1 || value === true || value === 'true';
      } else if (op === 'tilt') {
        // Deteksi kemiringan gyro/accel melebihi threshold
        isConditionMet = isNum && Math.abs(numVal) > (targetThreshold || 30);
      }

      // 3. Eksekusi Aksi jika kondisi terpenuhi
      if (isConditionMet) {
        this.executeAction(rule, value);
      }
    }
  }

  executeAction(rule, triggerValue) {
    const timestamp = new Date().toISOString();
    rule.lastTriggered = timestamp;
    db.updateAutomationTriggered(rule.id, timestamp);

    console.log(`[AUTOMATION-TRIGGER] Aturan "${rule.name}" TERPICU oleh ${rule.triggerDeviceId}/${rule.triggerComponentId} = ${triggerValue}`);

    if (!this._deviceManager) return;

    const targetSocket = this._deviceManager.getSocket(rule.actionDeviceId);
    const targetDev = this._deviceManager.getAll()[rule.actionDeviceId];

    let actionValue = true;
    if (rule.actionType === 'on') {
      actionValue = true;
    } else if (rule.actionType === 'off') {
      actionValue = false;
    } else if (rule.actionType === 'toggle') {
      if (targetDev && Array.isArray(targetDev.components)) {
        const comp = targetDev.components.find(x => x.id === rule.actionComponentId);
        actionValue = comp ? !(comp.value === 'true' || comp.value === true || comp.value === '1') : true;
      } else {
        actionValue = true;
      }
    } else if (rule.actionType === 'value') {
      actionValue = parseFloat(rule.actionValue) || 0;
    } else if (rule.actionType === 'angle') {
      actionValue = parseInt(rule.actionValue) || 0;
    } else if (rule.actionType === 'pulse') {
      actionValue = true;
    }

    const payload = {
      action: 'set_component',
      target: rule.actionDeviceId,
      componentId: rule.actionComponentId,
      value: actionValue
    };

    if (rule.duration && rule.duration > 0) {
      payload.duration = rule.duration; // detik
    }

    if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
      targetSocket.send(JSON.stringify(payload));
      console.log(`[AUTOMATION-EXEC] Perintah dikirim ke hardware ${rule.actionDeviceId}:`, payload);
    } else {
      console.warn(`[AUTOMATION-WARN] Perangkat target ${rule.actionDeviceId} sedang offline`);
    }

    // Catat log pemicuan
    db.addLog(rule.actionDeviceId, 'automation_triggered', {
      ruleId: rule.id,
      ruleName: rule.name,
      triggerValue: triggerValue,
      executedPayload: payload
    });

    let updatedDev = null;
    if (this._deviceManager) {
      updatedDev = this._deviceManager.updateComponentState(rule.actionDeviceId, rule.actionComponentId, actionValue);
    }

    // Siarkan notifikasi real-time ke semua browser
    if (this._broadcastFn) {
      if (updatedDev) {
        this._broadcastFn({ type: 'DEVICE_UPDATE', device: updatedDev });
      }
      this._broadcastFn({
        type: 'AUTOMATION_TRIGGERED',
        ruleId: rule.id,
        ruleName: rule.name,
        triggerValue: triggerValue,
        actionComponentId: rule.actionComponentId,
        actionValue: actionValue,
        timestamp: timestamp
      });
      this._broadcastFn({
        type: 'NOTIFICATION',
        level: 'info',
        message: `⚡ Otomasi "${rule.name}" terpicu: ${rule.actionComponentId} diset!`
      });
    }
  }

  // Uji coba manual aksi otomasi dari browser
  testRule(id) {
    const rule = db.getAutomationById(id);
    if (!rule) return { success: false, message: 'Aturan tidak ditemukan' };
    this.executeAction(rule, 'TEST_TRIGGER');
    return { success: true, message: `Uji coba aturan "${rule.name}" berhasil dijalankan` };
  }
}

module.exports = new AutomationEngine();
