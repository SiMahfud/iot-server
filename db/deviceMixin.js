// ==========================================
// Database Mixin: Device & Relay Operations
// ==========================================

module.exports = {
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
        dynamicPins: Boolean(d.dynamicPins),
        uptime: d.uptime,
        rssi: d.rssi,
        lastSeen: d.lastSeen,
        relays: relaysByDevice[d.deviceId] || [],
        components: componentsByDevice[d.deviceId] || []
      };
    }
    return devices;
  },

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
      dynamicPins: Boolean(dev.dynamicPins),
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
  },

  upsertDevice(dev) {
    const stmt = this.db.prepare(`
      INSERT INTO devices (deviceId, name, type, isOnline, uptime, rssi, lastSeen, chip, firmware, ip, dynamicPins)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(deviceId) DO UPDATE SET
        name = COALESCE(excluded.name, name),
        type = COALESCE(excluded.type, type),
        isOnline = excluded.isOnline,
        uptime = excluded.uptime,
        rssi = excluded.rssi,
        lastSeen = excluded.lastSeen,
        chip = COALESCE(excluded.chip, chip),
        firmware = COALESCE(excluded.firmware, firmware),
        ip = COALESCE(excluded.ip, ip),
        dynamicPins = COALESCE(excluded.dynamicPins, dynamicPins)
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
      dev.ip || '',
      dev.dynamicPins ? 1 : 0
    );
  },

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
  },

  ensureDeviceExists(deviceId) {
    if (!deviceId) return null;
    return this.preRegisterDevice(deviceId);
  },

  upsertRelay(deviceId, channel, name, state) {
    const stmt = this.db.prepare(`
      INSERT INTO relays (deviceId, channel, name, state)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(deviceId, channel) DO UPDATE SET
        name = COALESCE(?, name),
        state = ?
    `);
    stmt.run(deviceId, channel, name, state ? 1 : 0, name, state ? 1 : 0);
  },

  updateRelayState(deviceId, channel, state) {
    this.db.prepare(`
      UPDATE relays SET state = ? WHERE deviceId = ? AND channel = ?
    `).run(state ? 1 : 0, deviceId, channel);
  },

  setDeviceOnline(deviceId, isOnline, lastSeen = new Date().toISOString()) {
    this.db.prepare(`
      UPDATE devices SET isOnline = ?, lastSeen = ? WHERE deviceId = ?
    `).run(isOnline ? 1 : 0, lastSeen, deviceId);
  },

  setAllDevicesOffline() {
    this.db.prepare('UPDATE devices SET isOnline = 0').run();
  },

  renameDevice(deviceId, newName) {
    const info = this.db.prepare('UPDATE devices SET name = ? WHERE deviceId = ?').run(newName, deviceId);
    const success = info.changes > 0;
    if (success) this.syncStateToJson();
    return success;
  },

  renameRelay(deviceId, channel, newName) {
    const info = this.db.prepare('UPDATE relays SET name = ? WHERE deviceId = ? AND channel = ?').run(newName, deviceId, channel);
    const success = info.changes > 0;
    if (success) this.syncStateToJson();
    return success;
  },

  deleteDevice(deviceId) {
    const info = this.db.prepare('DELETE FROM devices WHERE deviceId = ?').run(deviceId);
    const success = info.changes > 0;
    if (success) this.syncStateToJson();
    return success;
  }
};
