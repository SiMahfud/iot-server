// ==========================================
// Database Mixin: Modular Component & Telemetry Operations
// ==========================================

module.exports = {
  upsertComponent(deviceId, comp) {
    const compId = comp.id || comp.componentId;
    const stmt = this.db.prepare(`
      INSERT INTO device_components (deviceId, componentId, type, name, unit, value, access, pin, config, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(deviceId, componentId) DO UPDATE SET
        name = COALESCE(excluded.name, name),
        type = excluded.type,
        unit = excluded.unit,
        value = excluded.value,
        access = excluded.access,
        pin = excluded.pin,
        config = excluded.config,
        updatedAt = excluded.updatedAt
    `);
    stmt.run(
      deviceId,
      compId,
      comp.type || 'sensor',
      comp.name || compId,
      comp.unit || '',
      String(comp.value !== undefined ? comp.value : ''),
      comp.access || 'rw',
      comp.pin !== undefined ? comp.pin : -1,
      typeof comp.config === 'object' ? JSON.stringify(comp.config) : (comp.config || '{}'),
      comp.updatedAt || new Date().toISOString()
    );
  },

  updateComponentValue(deviceId, componentId, value, updatedAt = new Date().toISOString()) {
    const valStr = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value);
    this.db.prepare(`
      UPDATE device_components SET value = ?, updatedAt = ?
      WHERE deviceId = ? AND componentId = ?
    `).run(valStr, updatedAt, deviceId, componentId);
  },

  renameComponent(deviceId, componentId, newName) {
    const info = this.db.prepare(`
      UPDATE device_components SET name = ? WHERE deviceId = ? AND componentId = ?
    `).run(newName, deviceId, componentId);
    return info.changes > 0;
  },

  deleteComponent(deviceId, componentId) {
    const info = this.db.prepare(`
      DELETE FROM device_components WHERE deviceId = ? AND componentId = ?
    `).run(deviceId, componentId);
    return info.changes > 0;
  },

  getComponent(deviceId, componentId) {
    const c = this.db.prepare(`
      SELECT * FROM device_components WHERE deviceId = ? AND componentId = ?
    `).get(deviceId, componentId);
    if (!c) return null;
    return {
      id: c.componentId,
      componentId: c.componentId,
      type: c.type,
      name: c.name,
      unit: c.unit,
      value: c.value,
      access: c.access,
      pin: c.pin,
      config: c.config ? JSON.parse(c.config) : {},
      updatedAt: c.updatedAt
    };
  },

  getComponents(deviceId) {
    const rows = this.db.prepare('SELECT * FROM device_components WHERE deviceId = ? ORDER BY componentId ASC').all(deviceId);
    return rows.map(c => ({
      id: c.componentId,
      componentId: c.componentId,
      type: c.type,
      name: c.name,
      unit: c.unit,
      value: c.value,
      access: c.access,
      pin: c.pin,
      config: c.config ? JSON.parse(c.config) : {},
      updatedAt: c.updatedAt
    }));
  },

  // --- Telemetry History ---

  addTelemetry(deviceId, componentId, value, timestamp = new Date().toISOString()) {
    try {
      if (typeof value === 'object' && value !== null) {
        for (const [subKey, subVal] of Object.entries(value)) {
          const num = parseFloat(subVal);
          if (!isNaN(num)) {
            this.db.prepare(`
              INSERT INTO telemetry_history (deviceId, componentId, value, timestamp)
              VALUES (?, ?, ?, ?)
            `).run(deviceId, `${componentId}_${subKey}`, num, timestamp);
          }
        }
        return;
      }
      const numVal = parseFloat(value);
      if (!isNaN(numVal)) {
        this.db.prepare(`
          INSERT INTO telemetry_history (deviceId, componentId, value, timestamp)
          VALUES (?, ?, ?, ?)
        `).run(deviceId, componentId, numVal, timestamp);
      }
    } catch (err) {
      console.error('[SQLITE] Gagal simpan telemetry:', err.message);
    }
  },

  getTelemetryHistory(deviceId, componentId, limit = 100) {
    return this.db.prepare(`
      SELECT value, timestamp FROM telemetry_history
      WHERE deviceId = ? AND componentId = ?
      ORDER BY id DESC LIMIT ?
    `).all(deviceId, componentId, limit).reverse();
  },

  // Bersihkan data telemetri historis yang lebih lama dari rentang retensi (default 7 hari)
  pruneOldTelemetry(retentionDays = 7) {
    try {
      const days = parseInt(retentionDays) || 7;
      const stmt = this.db.prepare("DELETE FROM telemetry_history WHERE timestamp < datetime('now', '-' || ? || ' days')");
      const info = stmt.run(days);
      if (info.changes > 0) {
        console.log(`[SQLITE] Pembersihan telemetri: ${info.changes} baris riwayat > ${days} hari dihapus`);
      }
      return info.changes;
    } catch (err) {
      console.error('[SQLITE] Gagal membersihkan riwayat telemetri lama:', err.message);
      return 0;
    }
  }
};
