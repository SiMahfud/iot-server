// ==========================================
// Database Mixin: User Auth & Activity Logging
// ==========================================

module.exports = {
  getUser(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },

  updatePassword(username, newPassword) {
    const info = this.db.prepare(`
      UPDATE users SET password = ?, updatedAt = ? WHERE username = ?
    `).run(newPassword, new Date().toISOString(), username);

    // Jika user belum ada di db tapi diupdate, insert
    if (info.changes === 0) {
      this.db.prepare(`
        INSERT INTO users (username, password, role, updatedAt)
        VALUES (?, ?, 'admin', ?)
      `).run(username, newPassword, new Date().toISOString());
    }
    return true;
  },

  addLog(deviceId, event, details = '') {
    try {
      this.db.prepare(`
        INSERT INTO activity_logs (timestamp, deviceId, event, details)
        VALUES (?, ?, ?, ?)
      `).run(
        new Date().toISOString(),
        deviceId || null,
        event,
        typeof details === 'object' ? JSON.stringify(details) : String(details)
      );
    } catch (err) {
      console.error('[SQLITE] Gagal menulis activity log:', err.message);
    }
  },

  getRecentLogs(limit = 100) {
    return this.db.prepare(`
      SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?
    `).all(limit);
  }
};
