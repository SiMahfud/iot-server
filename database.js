// ==========================================
// Database Module - SQLite (better-sqlite3)
// IoT Smart Switch Controller
// ==========================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'iot.db');
const STATE_JSON = path.join(__dirname, 'state.json');
const SCHEDULES_JSON = path.join(__dirname, 'schedules.json');
const CONFIG_JSON = path.join(__dirname, 'config.json');

class DatabaseManager {
  constructor() {
    this.db = new Database(DB_PATH);
    this.initPragmas();
    this.initTables();
    this.applyMigrations();
    this.autoMigrateFromJson();
  }

  initPragmas() {
    // Mode WAL (Write-Ahead Logging) untuk performa tinggi & tahan crash/mati listrik
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        deviceId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT '4-relay',
        isOnline INTEGER DEFAULT 0,
        uptime INTEGER DEFAULT 0,
        rssi INTEGER DEFAULT 0,
        lastSeen TEXT
      );

      CREATE TABLE IF NOT EXISTS relays (
        deviceId TEXT NOT NULL,
        channel INTEGER NOT NULL,
        name TEXT NOT NULL,
        state INTEGER DEFAULT 0,
        PRIMARY KEY (deviceId, channel),
        FOREIGN KEY (deviceId) REFERENCES devices(deviceId) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        deviceId TEXT NOT NULL,
        channel INTEGER NOT NULL,
        action TEXT NOT NULL DEFAULT 'on',
        time TEXT NOT NULL,
        days TEXT NOT NULL DEFAULT '[]',
        duration INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        label TEXT,
        createdAt TEXT,
        FOREIGN KEY (deviceId) REFERENCES devices(deviceId) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        deviceId TEXT,
        event TEXT NOT NULL,
        details TEXT
      );

      CREATE TABLE IF NOT EXISTS device_components (
        deviceId TEXT NOT NULL,
        componentId TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT DEFAULT '',
        value TEXT DEFAULT '',
        access TEXT DEFAULT 'rw',
        pin INTEGER DEFAULT -1,
        config TEXT DEFAULT '{}',
        updatedAt TEXT,
        PRIMARY KEY (deviceId, componentId),
        FOREIGN KEY (deviceId) REFERENCES devices(deviceId) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS telemetry_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deviceId TEXT NOT NULL,
        componentId TEXT NOT NULL,
        value REAL NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (deviceId) REFERENCES devices(deviceId) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_telemetry ON telemetry_history(deviceId, componentId, timestamp);
    `);
  }

  applyMigrations() {
    try {
      const scheduleCols = this.db.prepare("PRAGMA table_info(schedules)").all().map(c => c.name);
      if (!scheduleCols.includes('componentId')) {
        this.db.exec("ALTER TABLE schedules ADD COLUMN componentId TEXT;");
        console.log('[MIGRATION] Kolom componentId berhasil ditambahkan ke tabel schedules');
      }

      const deviceCols = this.db.prepare("PRAGMA table_info(devices)").all().map(c => c.name);
      if (!deviceCols.includes('chip')) {
        this.db.exec("ALTER TABLE devices ADD COLUMN chip TEXT DEFAULT '';");
      }
      if (!deviceCols.includes('firmware')) {
        this.db.exec("ALTER TABLE devices ADD COLUMN firmware TEXT DEFAULT '';");
      }
      if (!deviceCols.includes('ip')) {
        this.db.exec("ALTER TABLE devices ADD COLUMN ip TEXT DEFAULT '';");
      }
    } catch (e) {
      console.warn('[MIGRATION] Peringatan saat migrasi kolom:', e.message);
    }
  }

  autoMigrateFromJson() {
    // 1. Migrasi Devices & Relays dari state.json jika tabel devices masih kosong
    const devCount = this.db.prepare('SELECT COUNT(*) as count FROM devices').get().count;
    if (devCount === 0) {
      if (fs.existsSync(STATE_JSON)) {
        try {
          const raw = fs.readFileSync(STATE_JSON, 'utf8');
          const parsed = JSON.parse(raw);
          const devices = parsed.devices || {};

          const insertDev = this.db.prepare(`
            INSERT INTO devices (deviceId, name, type, isOnline, uptime, rssi, lastSeen)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          const insertRelay = this.db.prepare(`
            INSERT INTO relays (deviceId, channel, name, state)
            VALUES (?, ?, ?, ?)
          `);

          const migrateTransaction = this.db.transaction(() => {
            for (const [id, dev] of Object.entries(devices)) {
              insertDev.run(
                dev.deviceId || id,
                dev.name || `Perangkat (${id})`,
                dev.type || '4-relay',
                0, // Saat server baru mulai, set offline sampai connect
                dev.uptime || 0,
                dev.rssi || 0,
                dev.lastSeen || null
              );

              if (Array.isArray(dev.relays)) {
                for (const r of dev.relays) {
                  insertRelay.run(
                    dev.deviceId || id,
                    r.channel,
                    r.name || `Saklar ${r.channel}`,
                    r.state ? 1 : 0
                  );
                }
              }
            }
          });

          migrateTransaction();
          console.log(`[SQLITE] Sukses migrasi ${Object.keys(devices).length} perangkat dari state.json ke SQLite`);
        } catch (err) {
          console.error('[SQLITE] Gagal migrasi state.json:', err.message);
        }
      } else {
        // Inisialisasi default jika file state.json belum ada sama sekali
        this.upsertDevice({
          deviceId: 'wemos-relay-01',
          name: 'Wemos D1 Mini - Ruang Utama',
          type: '4-relay',
          isOnline: 0,
          uptime: 0,
          rssi: 0,
          lastSeen: null
        });
        for (let i = 1; i <= 4; i++) {
          this.upsertRelay('wemos-relay-01', i, `Saklar ${i}`, 0);
        }
      }
    }

    // 2. Migrasi Schedules dari schedules.json jika tabel schedules masih kosong
    const schedCount = this.db.prepare('SELECT COUNT(*) as count FROM schedules').get().count;
    if (schedCount === 0 && fs.existsSync(SCHEDULES_JSON)) {
      try {
        const raw = fs.readFileSync(SCHEDULES_JSON, 'utf8');
        const parsed = JSON.parse(raw);
        const schedules = Array.isArray(parsed.schedules) ? parsed.schedules : [];

        const insertSched = this.db.prepare(`
          INSERT INTO schedules (id, deviceId, channel, action, time, days, duration, enabled, label, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const migrateSchedTransaction = this.db.transaction(() => {
          for (const s of schedules) {
            insertSched.run(
              s.id,
              s.deviceId,
              s.channel,
              s.action || 'on',
              s.time,
              JSON.stringify(s.days || []),
              s.duration || 0,
              s.enabled !== false ? 1 : 0,
              s.label || `Jadwal Relay #${s.channel}`,
              s.createdAt || new Date().toISOString()
            );
          }
        });

        migrateSchedTransaction();
        console.log(`[SQLITE] Sukses migrasi ${schedules.length} jadwal dari schedules.json ke SQLite`);
      } catch (err) {
        console.error('[SQLITE] Gagal migrasi schedules.json:', err.message);
      }
    }

    // 3. Inisialisasi Kredensial User dari config.json jika tabel users masih kosong
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0 && fs.existsSync(CONFIG_JSON)) {
      try {
        const raw = fs.readFileSync(CONFIG_JSON, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.auth && parsed.auth.username && parsed.auth.password) {
          this.db.prepare(`
            INSERT INTO users (username, password, role, updatedAt)
            VALUES (?, ?, 'admin', ?)
          `).run(parsed.auth.username, parsed.auth.password, new Date().toISOString());
          console.log(`[SQLITE] User '${parsed.auth.username}' diinisialisasi dari config.json ke SQLite`);
        }
      } catch (err) {
        console.error('[SQLITE] Gagal inisialisasi user dari config.json:', err.message);
      }
    }
  }

  // ==========================================
  // Device & Relay Operations
  // ==========================================

  getAllDevices() {
    const devicesRows = this.db.prepare('SELECT * FROM devices').all();
    const relaysRows = this.db.prepare('SELECT * FROM relays ORDER BY channel ASC').all();
    const compRows = this.db.prepare('SELECT * FROM device_components ORDER BY componentId ASC').all();

    const relaysByDevice = {};
    for (const r of relaysRows) {
      if (!relaysByDevice[r.deviceId]) {
        relaysByDevice[r.deviceId] = [];
      }
      relaysByDevice[r.deviceId].push({
        channel: r.channel,
        name: r.name,
        state: Boolean(r.state)
      });
    }

    const componentsByDevice = {};
    for (const c of compRows) {
      if (!componentsByDevice[c.deviceId]) {
        componentsByDevice[c.deviceId] = [];
      }
      componentsByDevice[c.deviceId].push({
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
      });
    }

    const devices = {};
    for (const d of devicesRows) {
      devices[d.deviceId] = {
        deviceId: d.deviceId,
        name: d.name,
        type: d.type,
        chip: d.chip || '',
        firmware: d.firmware || '',
        ip: d.ip || '',
        isOnline: Boolean(d.isOnline),
        uptime: d.uptime,
        rssi: d.rssi,
        lastSeen: d.lastSeen,
        relays: relaysByDevice[d.deviceId] || [],
        components: componentsByDevice[d.deviceId] || []
      };
    }
    return devices;
  }

  getDevice(deviceId) {
    const dev = this.db.prepare('SELECT * FROM devices WHERE deviceId = ?').get(deviceId);
    if (!dev) return null;

    const relays = this.db.prepare('SELECT channel, name, state FROM relays WHERE deviceId = ? ORDER BY channel ASC').all(deviceId);
    const components = this.db.prepare('SELECT * FROM device_components WHERE deviceId = ? ORDER BY componentId ASC').all(deviceId);

    return {
      deviceId: dev.deviceId,
      name: dev.name,
      type: dev.type,
      chip: dev.chip || '',
      firmware: dev.firmware || '',
      ip: dev.ip || '',
      isOnline: Boolean(dev.isOnline),
      uptime: dev.uptime,
      rssi: dev.rssi,
      lastSeen: dev.lastSeen,
      relays: relays.map(r => ({ channel: r.channel, name: r.name, state: Boolean(r.state) })),
      components: components.map(c => ({
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
      }))
    };
  }

  upsertDevice(dev) {
    const stmt = this.db.prepare(`
      INSERT INTO devices (deviceId, name, type, isOnline, uptime, rssi, lastSeen, chip, firmware, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(deviceId) DO UPDATE SET
        name = COALESCE(excluded.name, name),
        type = COALESCE(excluded.type, type),
        isOnline = excluded.isOnline,
        uptime = excluded.uptime,
        rssi = excluded.rssi,
        lastSeen = excluded.lastSeen,
        chip = COALESCE(excluded.chip, chip),
        firmware = COALESCE(excluded.firmware, firmware),
        ip = COALESCE(excluded.ip, ip)
    `);
    stmt.run(
      dev.deviceId,
      dev.name,
      dev.type || 'modular-iot',
      dev.isOnline ? 1 : 0,
      dev.uptime || 0,
      dev.rssi || 0,
      dev.lastSeen || null,
      dev.chip || '',
      dev.firmware || '',
      dev.ip || ''
    );
  }

  preRegisterDevice(deviceId, name, type = 'modular-iot') {
    const existing = this.getDevice(deviceId);
    if (existing) return existing;
    const now = new Date().toISOString();
    this.upsertDevice({
      deviceId,
      name: name || `Perangkat (${deviceId})`,
      type: type || 'modular-iot',
      isOnline: 0,
      uptime: 0,
      rssi: 0,
      lastSeen: now,
      chip: '',
      firmware: '',
      ip: ''
    });
    return this.getDevice(deviceId);
  }

  upsertRelay(deviceId, channel, name, state) {
    const stmt = this.db.prepare(`
      INSERT INTO relays (deviceId, channel, name, state)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(deviceId, channel) DO UPDATE SET
        name = COALESCE(?, name),
        state = ?
    `);
    stmt.run(deviceId, channel, name, state ? 1 : 0, name, state ? 1 : 0);
  }

  updateRelayState(deviceId, channel, state) {
    this.db.prepare(`
      UPDATE relays SET state = ? WHERE deviceId = ? AND channel = ?
    `).run(state ? 1 : 0, deviceId, channel);
  }

  setDeviceOnline(deviceId, isOnline, lastSeen = new Date().toISOString()) {
    this.db.prepare(`
      UPDATE devices SET isOnline = ?, lastSeen = ? WHERE deviceId = ?
    `).run(isOnline ? 1 : 0, lastSeen, deviceId);
  }

  setAllDevicesOffline() {
    this.db.prepare('UPDATE devices SET isOnline = 0').run();
  }

  renameDevice(deviceId, newName) {
    const info = this.db.prepare('UPDATE devices SET name = ? WHERE deviceId = ?').run(newName, deviceId);
    const success = info.changes > 0;
    if (success) this.syncStateToJson();
    return success;
  }

  renameRelay(deviceId, channel, newName) {
    const info = this.db.prepare('UPDATE relays SET name = ? WHERE deviceId = ? AND channel = ?').run(newName, deviceId, channel);
    const success = info.changes > 0;
    if (success) this.syncStateToJson();
    return success;
  }

  deleteDevice(deviceId) {
    const info = this.db.prepare('DELETE FROM devices WHERE deviceId = ?').run(deviceId);
    const success = info.changes > 0;
    if (success) this.syncStateToJson();
    return success;
  }

  // ==========================================
  // Modular Component Operations
  // ==========================================

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
  }

  updateComponentValue(deviceId, componentId, value, updatedAt = new Date().toISOString()) {
    this.db.prepare(`
      UPDATE device_components SET value = ?, updatedAt = ?
      WHERE deviceId = ? AND componentId = ?
    `).run(String(value), updatedAt, deviceId, componentId);
  }

  renameComponent(deviceId, componentId, newName) {
    const info = this.db.prepare(`
      UPDATE device_components SET name = ? WHERE deviceId = ? AND componentId = ?
    `).run(newName, deviceId, componentId);
    return info.changes > 0;
  }

  deleteComponent(deviceId, componentId) {
    const info = this.db.prepare(`
      DELETE FROM device_components WHERE deviceId = ? AND componentId = ?
    `).run(deviceId, componentId);
    return info.changes > 0;
  }

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
  }

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
  }

  // ==========================================
  // Telemetry History Operations
  // ==========================================

  addTelemetry(deviceId, componentId, value, timestamp = new Date().toISOString()) {
    try {
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
  }

  getTelemetryHistory(deviceId, componentId, limit = 100) {
    return this.db.prepare(`
      SELECT value, timestamp FROM telemetry_history
      WHERE deviceId = ? AND componentId = ?
      ORDER BY id DESC LIMIT ?
    `).all(deviceId, componentId, limit).reverse();
  }

  // ==========================================
  // Schedule Operations
  // ==========================================

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
      createdAt: r.createdAt
    }));
  }

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
      createdAt: r.createdAt
    };
  }

  addSchedule(s) {
    const componentId = s.componentId || (s.channel ? `relay_${s.channel}` : null);
    const stmt = this.db.prepare(`
      INSERT INTO schedules (id, deviceId, componentId, channel, action, time, days, duration, enabled, label, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      s.createdAt || new Date().toISOString()
    );
    const created = this.getScheduleById(s.id);
    this.syncSchedulesToJson();
    return created;
  }

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
        label = ?
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
      id
    );

    const updated = this.getScheduleById(id);
    this.syncSchedulesToJson();
    return updated;
  }

  deleteSchedule(id) {
    const info = this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    const success = info.changes > 0;
    if (success) {
      this.syncSchedulesToJson();
    }
    return success;
  }

  // ==========================================
  // Redundancy Resolver: JSON & SQLite Sync
  // ==========================================

  syncSchedulesToJson() {
    try {
      this.lastInternalSyncTime = Date.now();
      const schedules = this.getAllSchedules();
      fs.writeFileSync(SCHEDULES_JSON, JSON.stringify({ schedules }, null, 2), 'utf8');
      console.log(`[SYNC-JSON] ${schedules.length} jadwal disinkronkan ke schedules.json`);
    } catch (err) {
      console.error('[SYNC-JSON] Gagal sinkronisasi schedules.json:', err.message);
    }
  }

  isRecentInternalSync() {
    return (Date.now() - (this.lastInternalSyncTime || 0)) < 2500;
  }

  syncStateToJson() {
    try {
      const devices = this.getAllDevices();
      fs.writeFileSync(STATE_JSON, JSON.stringify({ devices }, null, 2), 'utf8');
    } catch (err) {
      console.error('[SYNC-JSON] Gagal sinkronisasi state.json:', err.message);
    }
  }

  importSchedulesFromJson() {
    try {
      if (!fs.existsSync(SCHEDULES_JSON)) return { success: false, message: 'File schedules.json tidak ditemukan' };
      const raw = fs.readFileSync(SCHEDULES_JSON, 'utf8');
      const parsed = JSON.parse(raw);
      const schedules = Array.isArray(parsed.schedules) ? parsed.schedules : [];

      const insertOrUpdate = this.db.prepare(`
        INSERT INTO schedules (id, deviceId, channel, action, time, days, duration, enabled, label, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          deviceId = excluded.deviceId,
          channel = excluded.channel,
          action = excluded.action,
          time = excluded.time,
          days = excluded.days,
          duration = excluded.duration,
          enabled = excluded.enabled,
          label = excluded.label
      `);

      const jsonIds = schedules.map(s => s.id).filter(Boolean);

      const importTx = this.db.transaction(() => {
        if (jsonIds.length > 0) {
          const placeholders = jsonIds.map(() => '?').join(',');
          this.db.prepare(`DELETE FROM schedules WHERE id NOT IN (${placeholders})`).run(...jsonIds);
        } else {
          this.db.prepare('DELETE FROM schedules').run();
        }

        for (const s of schedules) {
          const schedId = s.id || ('sch_' + require('crypto').randomBytes(6).toString('hex'));
          insertOrUpdate.run(
            schedId,
            s.deviceId || 'wemos-relay-01',
            parseInt(s.channel) || 1,
            s.action || 'on',
            s.time,
            JSON.stringify(s.days || []),
            parseInt(s.duration) || 0,
            s.enabled !== false ? 1 : 0,
            s.label || `Jadwal Relay #${s.channel}`,
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

  // ==========================================
  // User Authentication Operations
  // ==========================================

  getUser(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

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
  }

  // ==========================================
  // Activity Logging Operations
  // ==========================================

  addLog(deviceId, event, details = '') {
    try {
      this.db.prepare(`
        INSERT INTO activity_logs (timestamp, deviceId, event, details)
        VALUES (?, ?, ?, ?)
      `).run(new Date().toISOString(), deviceId || null, event, typeof details === 'object' ? JSON.stringify(details) : String(details));
    } catch (err) {
      console.error('[SQLITE] Gagal menulis activity log:', err.message);
    }
  }

  getRecentLogs(limit = 100) {
    return this.db.prepare(`
      SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?
    `).all(limit);
  }
}

module.exports = new DatabaseManager();
