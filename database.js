// ==========================================
// Database Module - SQLite (better-sqlite3)
// Modular Base Class + Mixins Architecture
// ==========================================

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'iot.db');

// Import Mixins
const migrationMixin = require('./db/migrationMixin');
const deviceMixin = require('./db/deviceMixin');
const componentMixin = require('./db/componentMixin');
const scheduleMixin = require('./db/scheduleMixin');
const automationMixin = require('./db/automationMixin');
const userLogMixin = require('./db/userLogMixin');

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
        lastSeen TEXT,
        dynamicPins INTEGER DEFAULT 0
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
        targetValue TEXT DEFAULT '',
        createdAt TEXT,
        FOREIGN KEY (deviceId) REFERENCES devices(deviceId) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        triggerDeviceId TEXT NOT NULL,
        triggerComponentId TEXT NOT NULL,
        operator TEXT NOT NULL,
        threshold REAL,
        actionDeviceId TEXT NOT NULL,
        actionComponentId TEXT NOT NULL,
        actionType TEXT NOT NULL,
        actionValue TEXT DEFAULT '',
        duration INTEGER DEFAULT 0,
        cooldown INTEGER DEFAULT 10,
        lastTriggered TEXT,
        createdAt TEXT,
        FOREIGN KEY (triggerDeviceId) REFERENCES devices(deviceId) ON DELETE CASCADE,
        FOREIGN KEY (actionDeviceId) REFERENCES devices(deviceId) ON DELETE CASCADE
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
      if (!scheduleCols.includes('targetValue')) {
        this.db.exec("ALTER TABLE schedules ADD COLUMN targetValue TEXT DEFAULT '';");
        console.log('[MIGRATION] Kolom targetValue berhasil ditambahkan ke tabel schedules');
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
      if (!deviceCols.includes('dynamicPins')) {
        this.db.exec("ALTER TABLE devices ADD COLUMN dynamicPins INTEGER DEFAULT 0;");
        console.log('[MIGRATION] Kolom dynamicPins berhasil ditambahkan ke tabel devices');
      }
    } catch (e) {
      console.warn('[MIGRATION] Peringatan saat migrasi kolom:', e.message);
    }
  }

  checkpointWal() {
    try {
      const res = this.db.pragma('wal_checkpoint(TRUNCATE)');
      return res;
    } catch (e) {
      console.warn('[SQLITE] Peringatan WAL checkpoint:', e.message);
      return null;
    }
  }
}

// Attach Mixins to DatabaseManager Prototype
Object.assign(
  DatabaseManager.prototype,
  migrationMixin,
  deviceMixin,
  componentMixin,
  scheduleMixin,
  automationMixin,
  userLogMixin
);

module.exports = new DatabaseManager();
