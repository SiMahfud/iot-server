// ==========================================
// Database Mixin: Schedule & JSON Sync Operations
// ==========================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEDULES_JSON = path.join(__dirname, '..', 'schedules.json');
const STATE_JSON = path.join(__dirname, '..', 'state.json');

module.exports = {
  getAllSchedules(deviceId = null) {
    let rows;
    if (deviceId) {
      rows = this.db.prepare('SELECT * FROM schedules WHERE deviceId = ? ORDER BY time ASC').all(deviceId);
    } else {
      rows = this.db.prepare('SELECT * FROM schedules ORDER BY time ASC').all();
    }

    return rows.map(r => ({
      id: r.id,
      deviceId: r.deviceId,
      componentId: r.componentId || (r.channel ? `relay_${r.channel}` : null),
      channel: r.channel,
      action: r.action,
      time: r.time,
      days: JSON.parse(r.days || '[]'),
      duration: r.duration,
      enabled: Boolean(r.enabled),
      label: r.label,
      targetValue: r.targetValue || '',
      createdAt: r.createdAt
    }));
  },

  getScheduleById(id) {
    const r = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    if (!r) return null;
    return {
      id: r.id,
      deviceId: r.deviceId,
      componentId: r.componentId || (r.channel ? `relay_${r.channel}` : null),
      channel: r.channel,
      action: r.action,
      time: r.time,
      days: JSON.parse(r.days || '[]'),
      duration: r.duration,
      enabled: Boolean(r.enabled),
      label: r.label,
      targetValue: r.targetValue || '',
      createdAt: r.createdAt
    };
  },

  addSchedule(s) {
    if (s.deviceId) {
      this.ensureDeviceExists(s.deviceId);
    }
    const componentId = s.componentId || (s.channel ? `relay_${s.channel}` : null);
    const stmt = this.db.prepare(`
      INSERT INTO schedules (id, deviceId, componentId, channel, action, time, days, duration, enabled, label, targetValue, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      s.id,
      s.deviceId,
      componentId,
      s.channel || 0,
      s.action || 'on',
      s.time,
      JSON.stringify(s.days || []),
      s.duration || 0,
      s.enabled !== false ? 1 : 0,
      s.label || (s.componentId ? `Jadwal ${s.componentId}` : `Jadwal Relay #${s.channel}`),
      s.targetValue !== undefined ? String(s.targetValue) : '',
      s.createdAt || new Date().toISOString()
    );
    const created = this.getScheduleById(s.id);
    this.syncSchedulesToJson();
    return created;
  },

  updateSchedule(id, fields) {
    const current = this.getScheduleById(id);
    if (!current) return null;

    const merged = { ...current, ...fields };
    if (!merged.componentId && merged.channel) {
      merged.componentId = `relay_${merged.channel}`;
    }

    this.db.prepare(`
      UPDATE schedules SET
        deviceId = ?,
        componentId = ?,
        channel = ?,
        action = ?,
        time = ?,
        days = ?,
        duration = ?,
        enabled = ?,
        label = ?,
        targetValue = ?
      WHERE id = ?
    `).run(
      merged.deviceId,
      merged.componentId || null,
      merged.channel || 0,
      merged.action,
      merged.time,
      JSON.stringify(merged.days || []),
      merged.duration || 0,
      merged.enabled !== false ? 1 : 0,
      merged.label,
      merged.targetValue !== undefined ? String(merged.targetValue) : '',
      id
    );

    const updated = this.getScheduleById(id);
    this.syncSchedulesToJson();
    return updated;
  },

  deleteSchedule(id) {
    const info = this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    const success = info.changes > 0;
    if (success) {
      this.syncSchedulesToJson();
    }
    return success;
  },

  syncSchedulesToJson() {
    try {
      this.lastInternalSyncTime = Date.now();
      const schedules = this.getAllSchedules();
      fs.writeFileSync(SCHEDULES_JSON, JSON.stringify({ schedules }, null, 2), 'utf8');
      console.log(`[SYNC-JSON] ${schedules.length} jadwal disinkronkan ke schedules.json`);
    } catch (err) {
      console.error('[SYNC-JSON] Gagal sinkronisasi schedules.json:', err.message);
    }
  },

  isRecentInternalSync() {
    return (Date.now() - (this.lastInternalSyncTime || 0)) < 2500;
  },

  syncStateToJson() {
    try {
      const devices = this.getAllDevices();
      fs.writeFileSync(STATE_JSON, JSON.stringify({ devices }, null, 2), 'utf8');
    } catch (err) {
      console.error('[SYNC-JSON] Gagal sinkronisasi state.json:', err.message);
    }
  },

  importSchedulesFromJson(options = {}) {
    const { allowPurge = false } = options;
    try {
      if (!fs.existsSync(SCHEDULES_JSON)) return { success: false, message: 'File schedules.json tidak ditemukan' };
      const raw = fs.readFileSync(SCHEDULES_JSON, 'utf8');
      const parsed = JSON.parse(raw);
      const schedules = Array.isArray(parsed.schedules) ? parsed.schedules : [];

      if (schedules.length === 0 && !allowPurge) {
        return { success: true, count: 0, message: 'File schedules.json kosong, jadwal di database tetap dipertahankan' };
      }

      const insertOrUpdate = this.db.prepare(`
        INSERT INTO schedules (id, deviceId, componentId, channel, action, time, days, duration, enabled, label, targetValue, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          deviceId = excluded.deviceId,
          componentId = excluded.componentId,
          channel = excluded.channel,
          action = excluded.action,
          time = excluded.time,
          days = excluded.days,
          duration = excluded.duration,
          enabled = excluded.enabled,
          label = excluded.label,
          targetValue = excluded.targetValue
      `);

      const jsonIds = schedules.map(s => s.id).filter(Boolean);

      const importTx = this.db.transaction(() => {
        if (allowPurge) {
          if (jsonIds.length > 0) {
            const placeholders = jsonIds.map(() => '?').join(',');
            this.db.prepare(`DELETE FROM schedules WHERE id NOT IN (${placeholders})`).run(...jsonIds);
          } else {
            this.db.prepare('DELETE FROM schedules').run();
          }
        }

        for (const s of schedules) {
          const devId = s.deviceId || 'wemos-relay-01';
          this.ensureDeviceExists(devId);
          const schedId = s.id || ('sch_' + crypto.randomBytes(6).toString('hex'));
          const componentId = s.componentId || (s.channel ? `relay_${s.channel}` : null);
          insertOrUpdate.run(
            schedId,
            devId,
            componentId,
            parseInt(s.channel) || (componentId && /^relay_\d+$/i.test(componentId) ? parseInt(componentId.replace(/\D/g, '')) : 0),
            s.action || 'on',
            s.time,
            JSON.stringify(s.days || []),
            parseInt(s.duration) || 0,
            s.enabled !== false ? 1 : 0,
            s.label || (componentId ? `Jadwal ${componentId}` : `Jadwal Relay #${s.channel}`),
            s.targetValue !== undefined ? String(s.targetValue) : '',
            s.createdAt || new Date().toISOString()
          );
        }
      });

      importTx();
      console.log(`[SYNC-JSON] Berhasil impor & sinkronisasi ${schedules.length} jadwal dari schedules.json ke SQLite`);
      return { success: true, count: schedules.length };
    } catch (err) {
      console.error('[SYNC-JSON] Gagal impor dari schedules.json:', err.message);
      return { success: false, message: err.message };
    }
  }
};
