// ==========================================
// Database Mixin: Automation (IF-THEN Rules) Operations
// ==========================================

const crypto = require('crypto');

module.exports = {
  getAllAutomations(triggerDeviceId = null) {
    let rows;
    if (triggerDeviceId) {
      rows = this.db.prepare('SELECT * FROM automations WHERE triggerDeviceId = ? ORDER BY createdAt DESC').all(triggerDeviceId);
    } else {
      rows = this.db.prepare('SELECT * FROM automations ORDER BY createdAt DESC').all();
    }
    return rows.map(r => ({
      ...r,
      enabled: Boolean(r.enabled),
      duration: parseInt(r.duration) || 0,
      cooldown: parseInt(r.cooldown) || 10,
      threshold: r.threshold !== null && r.threshold !== undefined ? parseFloat(r.threshold) : null
    }));
  },

  getAutomationById(id) {
    const r = this.db.prepare('SELECT * FROM automations WHERE id = ?').get(id);
    if (!r) return null;
    return {
      ...r,
      enabled: Boolean(r.enabled),
      duration: parseInt(r.duration) || 0,
      cooldown: parseInt(r.cooldown) || 10,
      threshold: r.threshold !== null && r.threshold !== undefined ? parseFloat(r.threshold) : null
    };
  },

  addAutomation(data) {
    const id = data.id || ('auto_' + crypto.randomBytes(6).toString('hex'));
    const stmt = this.db.prepare(`
      INSERT INTO automations (
        id, name, enabled, triggerDeviceId, triggerComponentId, operator,
        threshold, actionDeviceId, actionComponentId, actionType, actionValue,
        duration, cooldown, lastTriggered, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.name || `Aturan Otomasi ${data.triggerComponentId || ''}`,
      data.enabled !== false ? 1 : 0,
      data.triggerDeviceId,
      data.triggerComponentId,
      data.operator || '>',
      data.threshold !== undefined && data.threshold !== '' && data.threshold !== null ? parseFloat(data.threshold) : null,
      data.actionDeviceId || data.triggerDeviceId,
      data.actionComponentId,
      data.actionType || 'on',
      data.actionValue !== undefined ? String(data.actionValue) : '',
      parseInt(data.duration) || 0,
      parseInt(data.cooldown) || 10,
      data.lastTriggered || null,
      data.createdAt || new Date().toISOString()
    );
    return this.getAutomationById(id);
  },

  updateAutomation(id, fields) {
    const current = this.getAutomationById(id);
    if (!current) return null;
    const merged = { ...current, ...fields };

    this.db.prepare(`
      UPDATE automations SET
        name = ?,
        enabled = ?,
        triggerDeviceId = ?,
        triggerComponentId = ?,
        operator = ?,
        threshold = ?,
        actionDeviceId = ?,
        actionComponentId = ?,
        actionType = ?,
        actionValue = ?,
        duration = ?,
        cooldown = ?,
        lastTriggered = ?
      WHERE id = ?
    `).run(
      merged.name,
      merged.enabled ? 1 : 0,
      merged.triggerDeviceId,
      merged.triggerComponentId,
      merged.operator,
      merged.threshold !== null && merged.threshold !== '' && merged.threshold !== undefined ? parseFloat(merged.threshold) : null,
      merged.actionDeviceId,
      merged.actionComponentId,
      merged.actionType,
      String(merged.actionValue || ''),
      parseInt(merged.duration) || 0,
      parseInt(merged.cooldown) || 10,
      merged.lastTriggered || null,
      id
    );
    return this.getAutomationById(id);
  },

  deleteAutomation(id) {
    const info = this.db.prepare('DELETE FROM automations WHERE id = ?').run(id);
    return info.changes > 0;
  },

  updateAutomationTriggered(id, timestamp = new Date().toISOString()) {
    this.db.prepare('UPDATE automations SET lastTriggered = ? WHERE id = ?').run(timestamp, id);
  }
};
