// ==========================================
// Scheduler Manager — Jadwal Harian/Mingguan
// Engine berbasis node-cron & SQLite untuk IoT Smart Switch
// ==========================================

const cron = require('node-cron');
const crypto = require('crypto');
const db = require('./database');

class SchedulerManager {
  constructor() {
    this.schedules = [];
    this.jobs = new Map(); // scheduleId -> cron job instance
    this._deviceManager = null;
    this._broadcastFn = null;
    this.loadSchedules();
  }

  /**
   * Injeksi referensi deviceManager dan broadcast function dari server.js
   * Dipanggil sekali saat server startup
   */
  init(deviceManager, broadcastToBrowsers) {
    this._deviceManager = deviceManager;
    this._broadcastFn = broadcastToBrowsers;
    this.startAllJobs();
    console.log(`[SCHEDULER-DB] Inisialisasi selesai. ${this.schedules.length} jadwal aktif dari SQLite.`);
  }

  // ----- Persistensi SQLite -----

  loadSchedules() {
    try {
      this.schedules = db.getAllSchedules();
      console.log(`[SCHEDULER-DB] Memuat ${this.schedules.length} jadwal dari database SQLite`);
    } catch (err) {
      console.error('[SCHEDULER-DB] Gagal memuat jadwal dari SQLite:', err.message);
      this.schedules = [];
    }
  }

  reloadFromDb() {
    this.loadSchedules();
    this.startAllJobs();
    if (this._broadcastFn) {
      this._broadcastFn({ type: 'SCHEDULES_UPDATE', schedules: this.schedules });
    }
    console.log(`[SCHEDULER] Jadwal di-reload dari DB. Total: ${this.schedules.length} aktif.`);
  }

  // ----- ID Generator -----

  generateId() {
    return 'sch_' + crypto.randomBytes(6).toString('hex');
  }

  // ----- Konversi jadwal ke cron expression -----
  // Format: "minute hour * * dayOfWeek"
  // days: [0=Minggu, 1=Senin, ..., 6=Sabtu] — kosong = setiap hari

  toCronExpression(time, days) {
    const [hour, minute] = time.split(':').map(Number);
    const daysPart = (Array.isArray(days) && days.length > 0) ? days.join(',') : '*';
    return `${minute} ${hour} * * ${daysPart}`;
  }

  // ----- CRUD Operations -----

  addSchedule(data) {
    const componentId = data.componentId || (data.channel ? `relay_${data.channel}` : null);
    const schedule = {
      id: this.generateId(),
      deviceId: data.deviceId,
      componentId: componentId,
      channel: data.channel !== undefined ? parseInt(data.channel) : (componentId && /^relay_\d+$/i.test(componentId) ? parseInt(componentId.replace(/\D/g, '')) : 0),
      action: data.action || 'on',          // 'on' | 'off' | 'toggle' | 'value' | 'angle'
      time: data.time,                       // 'HH:MM'
      days: Array.isArray(data.days) ? data.days : [], // [0-6], kosong = setiap hari
      duration: data.duration ? parseInt(data.duration) : 0, // durasi nyala dalam menit (opsional)
      targetValue: data.targetValue !== undefined ? String(data.targetValue) : '',
      enabled: data.enabled !== false,
      label: data.label || (componentId ? `Jadwal ${componentId}` : `Jadwal Relay #${data.channel || 1}`),
      createdAt: new Date().toISOString()
    };

    const created = db.addSchedule(schedule);
    this.schedules = db.getAllSchedules();

    if (created && created.enabled) {
      this.startJob(created);
    }

    db.addLog(schedule.deviceId, 'schedule_added', `Jadwal "${schedule.label}" dibuat (${schedule.time})`);
    console.log(`[SCHEDULER] Jadwal baru disimpan ke SQLite: ${schedule.label} (${schedule.id})${schedule.duration ? ` [Durasi: ${schedule.duration}m]` : ''}`);
    return created;
  }

  updateSchedule(id, data) {
    const current = db.getScheduleById(id);
    if (!current) return null;

    // Hentikan job cron lama
    this.stopJob(id);

    const updated = db.updateSchedule(id, data);
    if (!updated) return null;

    this.schedules = db.getAllSchedules();

    // Mulai job baru jika enabled
    if (updated.enabled) {
      this.startJob(updated);
    }

    db.addLog(updated.deviceId, 'schedule_updated', `Jadwal "${updated.label}" diperbarui`);
    console.log(`[SCHEDULER] Jadwal diperbarui di SQLite: ${updated.label} (${id})`);
    return updated;
  }

  deleteSchedule(id) {
    const current = db.getScheduleById(id);
    if (!current) return false;

    this.stopJob(id);
    const success = db.deleteSchedule(id);
    this.schedules = db.getAllSchedules();

    db.addLog(current.deviceId, 'schedule_deleted', `Jadwal "${current.label}" dihapus`);
    console.log(`[SCHEDULER] Jadwal dihapus dari SQLite: ${current.label} (${id})`);
    return success;
  }

  getSchedules(deviceId = null) {
    return db.getAllSchedules(deviceId);
  }

  getScheduleById(id) {
    return db.getScheduleById(id);
  }

  // ----- Cron Job Management -----

  startJob(schedule) {
    const cronExpr = this.toCronExpression(schedule.time, schedule.days);

    if (!cron.validate(cronExpr)) {
      console.error(`[SCHEDULER] Cron expression tidak valid: ${cronExpr} untuk jadwal ${schedule.id}`);
      return;
    }

    const job = cron.schedule(cronExpr, () => {
      this.executeSchedule(schedule);
    }, {
      timezone: 'Asia/Jakarta'
    });

    this.jobs.set(schedule.id, job);
    console.log(`[SCHEDULER] Job aktif: "${schedule.label}" → cron(${cronExpr})`);
  }

  stopJob(id) {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
  }

  startAllJobs() {
    // Hentikan semua job lama
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();

    // Mulai ulang semua jadwal yang enabled
    this.schedules.forEach(schedule => {
      if (schedule.enabled) {
        this.startJob(schedule);
      }
    });
  }

  // ----- Eksekusi Jadwal -----

  executeSchedule(schedule) {
    if (!this._deviceManager) {
      console.error('[SCHEDULER] DeviceManager belum diinjeksi!');
      return;
    }

    const { WebSocket } = require('ws');
    const targetSocket = this._deviceManager.getSocket(schedule.deviceId);

    if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
      console.warn(`[SCHEDULER] Perangkat ${schedule.deviceId} offline saat jadwal "${schedule.label}" dijalankan`);

      db.addLog(schedule.deviceId, 'schedule_failed', `Jadwal "${schedule.label}" gagal: Perangkat offline`);

      // Broadcast notifikasi ke browser bahwa eksekusi gagal
      if (this._broadcastFn) {
        this._broadcastFn({
          type: 'NOTIFICATION',
          level: 'warning',
          message: `⏰ Jadwal "${schedule.label}" gagal: Perangkat ${schedule.deviceId} offline`
        });
        this._broadcastFn({
          type: 'SCHEDULE_EXECUTED',
          scheduleId: schedule.id,
          success: false,
          reason: 'device_offline'
        });
      }
      return;
    }

    // Tentukan state berdasarkan action dan component
    const compId = schedule.componentId || (schedule.channel ? `relay_${schedule.channel}` : null);
    const dev = this._deviceManager.getAll()[schedule.deviceId];

    let state = true;
    if (schedule.action === 'on') {
      state = true;
    } else if (schedule.action === 'off') {
      state = false;
    } else if (schedule.action === 'value') {
      state = parseFloat(schedule.targetValue) || 0;
    } else if (schedule.action === 'angle') {
      state = parseInt(schedule.targetValue) || 0;
    } else if (schedule.action === 'toggle') {
      if (dev && Array.isArray(dev.components)) {
        const c = dev.components.find(x => x.id === compId || x.componentId === compId);
        if (c) {
          state = !(c.value === 'true' || c.value === true || c.value === '1');
        } else {
          state = true;
        }
      } else if (dev && dev.relays) {
        const relay = dev.relays.find(r => r.channel === schedule.channel);
        state = relay ? !relay.state : true;
      } else {
        state = true;
      }
    }

    // Kirim perintah ke Hardware sesuai tipe perangkat
    let payload;
    const isLegacyRelayDevice = dev && (dev.type === '4-relay' || (!dev.components || dev.components.length === 0));
    if (isLegacyRelayDevice && schedule.channel) {
      payload = {
        action: 'set_relay',
        target: schedule.deviceId,
        channel: schedule.channel,
        state: state
      };
      if (state === true && schedule.duration && schedule.duration > 0) {
        payload.duration = schedule.duration * 60;
      }
    } else if (compId) {
      payload = {
        action: 'set_component',
        target: schedule.deviceId,
        componentId: compId,
        value: state
      };
      if (state === true && schedule.duration && schedule.duration > 0) {
        payload.duration = schedule.duration * 60;
      }
    } else {
      payload = {
        action: 'set_relay',
        target: schedule.deviceId,
        channel: schedule.channel || 1,
        state: state
      };
      if (state === true && schedule.duration && schedule.duration > 0) {
        payload.duration = schedule.duration * 60;
      }
    }

    targetSocket.send(JSON.stringify(payload));

    const durationInfo = (state === true && schedule.duration > 0) ? ` selama ${schedule.duration} menit` : '';
    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    console.log(`[SCHEDULER] ⏰ Jadwal "${schedule.label}" dijalankan -> ${compId || `Relay #${schedule.channel}`} ${state ? 'ON' : 'OFF'}${durationInfo} [${now}]`);

    // Catat ke log aktivitas SQLite
    db.addLog(schedule.deviceId, 'schedule_executed', `Jadwal "${schedule.label}" dieksekusi: Saklar #${schedule.channel} -> ${state ? 'ON' : 'OFF'}${durationInfo}`);

    // Sinkronkan state perangkat secara instan
    let updatedDev = null;
    if (this._deviceManager) {
      if (compId) {
        updatedDev = this._deviceManager.updateComponentState(schedule.deviceId, compId, state);
      } else {
        updatedDev = this._deviceManager.updateComponentState(schedule.deviceId, `relay_${schedule.channel}`, state);
      }
    }

    // Broadcast notifikasi ke semua browser
    if (this._broadcastFn) {
      if (updatedDev) {
        this._broadcastFn({ type: 'DEVICE_UPDATE', device: updatedDev });
      }
      this._broadcastFn({
        type: 'NOTIFICATION',
        level: 'info',
        message: `⏰ Jadwal "${schedule.label}" dijalankan — Relay #${schedule.channel} ${state ? 'ON' : 'OFF'}${durationInfo}`
      });
      this._broadcastFn({
        type: 'SCHEDULE_EXECUTED',
        scheduleId: schedule.id,
        success: true,
        channel: schedule.channel,
        state: state,
        duration: schedule.duration || 0
      });
    }
  }
}

module.exports = new SchedulerManager();
