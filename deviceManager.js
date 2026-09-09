const db = require('./database');

class DeviceManager {
  constructor() {
    this.devices = {};
    this.sockets = new Map(); // deviceId -> ws connection
    this.loadState();
  }

  loadState() {
    try {
      // Saat server baru menyala, set status awal semua device ke offline di database sampai mereka connect ulang
      db.setAllDevicesOffline();
      this.devices = db.getAllDevices();
      console.log(`[STATE-DB] Berhasil memuat ${Object.keys(this.devices).length} perangkat dari database SQLite`);
    } catch (err) {
      console.error('[STATE-DB] Gagal memuat state dari SQLite:', err.message);
      this.devices = {};
    }
  }

  // Registrasi modular perangkat IoT (AgyGatewayClient Protocol)
  handleRegister(deviceId, payload, ws) {
    if (ws) {
      this.sockets.set(deviceId, ws);
    }

    const info = payload.info || {};
    const now = new Date().toISOString();

    const isDynamic = !!(payload.dynamicPins || (info && info.dynamicPins));

    if (!this.devices[deviceId]) {
      console.log(`[MODULAR-DISCOVERY] Perangkat IoT baru terdaftar: ${deviceId} (${info.chip || 'Node'}, DynamicPins: ${isDynamic ? 'YES' : 'NO'})`);
      this.devices[deviceId] = {
        deviceId: deviceId,
        name: `Perangkat (${deviceId})`,
        type: info.chip || 'modular-iot',
        chip: info.chip || '',
        firmware: info.firmware || '',
        ip: info.ip || (ws && ws._socket ? ws._socket.remoteAddress : '') || '',
        isOnline: true,
        dynamicPins: isDynamic,
        uptime: info.uptime || 0,
        rssi: info.rssi || 0,
        lastSeen: now,
        relays: [],
        components: []
      };
      db.upsertDevice(this.devices[deviceId]);
      db.addLog(deviceId, 'device_registered', `Perangkat modular ${deviceId} terdaftar (DynamicPins: ${isDynamic ? 'Ya' : 'Tidak'})`);
    } else {
      this.devices[deviceId].isOnline = true;
      this.devices[deviceId].dynamicPins = isDynamic;
      this.devices[deviceId].uptime = info.uptime || this.devices[deviceId].uptime;
      this.devices[deviceId].rssi = info.rssi || this.devices[deviceId].rssi;
      this.devices[deviceId].chip = info.chip || this.devices[deviceId].chip || '';
      this.devices[deviceId].firmware = info.firmware || this.devices[deviceId].firmware || '';
      this.devices[deviceId].ip = info.ip || (ws && ws._socket ? ws._socket.remoteAddress : '') || this.devices[deviceId].ip || '';
      this.devices[deviceId].lastSeen = now;
      db.upsertDevice(this.devices[deviceId]);
    }

    // Daftarkan komponen yang dikirim dari manifest (jika hardware mengirim komponen awal)
    if (Array.isArray(payload.components) && payload.components.length > 0) {
      payload.components.forEach(comp => {
        db.upsertComponent(deviceId, comp);

        // Jika komponen bertipe switch dengan id relay_X, sinkronkan ke tabel relays lama
        if (comp.type === 'switch' && /^relay_\d+$/i.test(comp.id)) {
          const ch = parseInt(comp.id.replace(/\D/g, '')) || 1;
          const stateBool = comp.value === 'true' || comp.value === true || comp.value === '1';
          db.upsertRelay(deviceId, ch, comp.name || `Saklar ${ch}`, stateBool);
        }
      });
    }

    // Jika mode Dynamic Pins aktif, kirim konfigurasi pin tersimpan dari database ke hardware
    // HANYA JIKA hardware belum memiliki komponen (flash kosong) dan belum pernah disinkronkan di sesi socket ini
    if (ws && isDynamic && !ws._hasAppliedPinConfig) {
      const incomingComponents = Array.isArray(payload.components) ? payload.components : [];
      const savedComponents = db.getComponents(deviceId) || [];
      if (incomingComponents.length === 0 && savedComponents.length > 0) {
        ws._hasAppliedPinConfig = true;
        console.log(`[DYNAMIC PINS] Mengirimkan ${savedComponents.length} konfigurasi pin tersimpan ke ${deviceId} (Inisialisasi Flash)`);
        ws.send(JSON.stringify({
          action: 'apply_pin_config',
          components: savedComponents
        }));
      }
    }

    // Refresh state lengkap dari database
    this.devices[deviceId] = db.getDevice(deviceId);
    this.devices[deviceId].dynamicPins = isDynamic;
    return this.devices[deviceId];
  }

  // Telemetri data sensor & status berkala
  handleTelemetry(deviceId, payload) {
    const dev = this.devices[deviceId];
    if (!dev) return null;

    const now = new Date().toISOString();
    dev.isOnline = true;
    dev.uptime = payload.uptime || dev.uptime;
    dev.rssi = payload.rssi || dev.rssi;
    dev.lastSeen = now;
    db.upsertDevice(dev);

    const data = payload.data || {};
    for (const [compId, val] of Object.entries(data)) {
      // 1. Simpan nilai terkini di tabel device_components
      db.updateComponentValue(deviceId, compId, val, now);

      // 2. Jika nilai berupa angka numerik, catat ke tabel riwayat telemetri
      const numVal = parseFloat(val);
      if (!isNaN(numVal)) {
        db.addTelemetry(deviceId, compId, numVal, now);
      }

      // 3. Sinkronisasi ke array in-memory
      if (Array.isArray(dev.components)) {
        const c = dev.components.find(x => x.id === compId || x.componentId === compId);
        if (c) c.value = String(val);
      }

      // 4. Jika komponen saklar relay_X, sinkronkan ke relays table
      if (/^relay_\d+$/i.test(compId)) {
        const ch = parseInt(compId.replace(/\D/g, '')) || 1;
        const stateBool = val === 'true' || val === true || val === '1';
        db.updateRelayState(deviceId, ch, stateBool);
        if (Array.isArray(dev.relays)) {
          const r = dev.relays.find(x => x.channel === ch);
          if (r) r.state = stateBool;
        }
      }

      // 5. Evaluasi aturan otomatis cerdas (Smart IF-THEN Rule Engine)
      try {
        const autoEngine = require('./automationEngine');
        if (autoEngine && typeof autoEngine.evaluate === 'function') {
          if (typeof val === 'object' && val !== null) {
            for (const [subKey, subVal] of Object.entries(val)) {
              autoEngine.evaluate(deviceId, `${compId}_${subKey}`, subVal);
            }
          }
          autoEngine.evaluate(deviceId, compId, val);
        }
      } catch (autoErr) {
        // Silently skip if autoEngine is still initializing
      }
    }

    return dev;
  }

  // Update atau daftarkan perangkat baru secara dinamis (Legacy 4-Relay Support)
  handleStatusUpdate(deviceId, payload, ws) {
    if (ws) {
      this.sockets.set(deviceId, ws);
    }

    if (!this.devices[deviceId]) {
      // Auto-discovery: Perangkat IoT baru otomatis dibuatkan profilnya!
      console.log(`[AUTO-DISCOVERY] Perangkat IoT baru terdeteksi: ${deviceId}`);
      this.devices[deviceId] = {
        deviceId: deviceId,
        name: `Perangkat (${deviceId})`,
        type: payload.type || "4-relay",
        isOnline: true,
        uptime: payload.uptime || 0,
        rssi: payload.rssi || 0,
        lastSeen: new Date().toISOString(),
        relays: [],
        components: []
      };

      // Buat channel relay sesuai payload dari hardware
      const count = Array.isArray(payload.relays) ? payload.relays.length : 4;
      for (let i = 1; i <= count; i++) {
        this.devices[deviceId].relays.push({
          channel: i,
          name: `Saklar ${i}`,
          state: false
        });
      }

      // Simpan perangkat baru ke SQLite
      db.upsertDevice(this.devices[deviceId]);
      for (const r of this.devices[deviceId].relays) {
        db.upsertRelay(deviceId, r.channel, r.name, r.state);
      }
      db.addLog(deviceId, 'device_registered', `Perangkat baru ${deviceId} terdaftar`);
    }

    const dev = this.devices[deviceId];
    dev.isOnline = true;
    dev.uptime = payload.uptime || dev.uptime;
    dev.rssi = payload.rssi || dev.rssi;
    dev.lastSeen = new Date().toISOString();

    if (Array.isArray(payload.relays)) {
      payload.relays.forEach(incoming => {
        let existing = dev.relays.find(r => r.channel === incoming.channel);
        if (existing) {
          existing.state = incoming.state;
        } else {
          dev.relays.push({
            channel: incoming.channel,
            name: `Saklar ${incoming.channel}`,
            state: incoming.state
          });
        }
        // Simpan status relay ke SQLite
        db.upsertRelay(deviceId, incoming.channel, existing ? existing.name : `Saklar ${incoming.channel}`, incoming.state);

        // Sinkronkan ke device_components
        db.upsertComponent(deviceId, {
          id: `relay_${incoming.channel}`,
          name: existing ? existing.name : `Saklar ${incoming.channel}`,
          type: 'switch',
          value: incoming.state ? 'true' : 'false',
          access: 'rw'
        });
      });
      // Sortir channel berurutan
      dev.relays.sort((a, b) => a.channel - b.channel);
    }

    // Update telemetry & status online perangkat di SQLite
    db.upsertDevice(dev);

    // Refresh komponen in-memory dari database (sinkronisasi relay -> components)
    dev.components = db.getComponents(deviceId);

    return dev;
  }

  setDeviceOffline(deviceId) {
    this.sockets.delete(deviceId);
    if (this.devices[deviceId]) {
      const now = new Date().toISOString();
      this.devices[deviceId].isOnline = false;
      this.devices[deviceId].lastSeen = now;
      db.setDeviceOnline(deviceId, false, now);
      db.addLog(deviceId, 'device_offline', `Perangkat terputus dari server`);
      return this.devices[deviceId];
    }
    return null;
  }

  getSocket(deviceId) {
    return this.sockets.get(deviceId);
  }

  renameDevice(deviceId, newName) {
    if (this.devices[deviceId]) {
      const trimmed = newName.trim();
      this.devices[deviceId].name = trimmed;
      db.renameDevice(deviceId, trimmed);
      db.addLog(deviceId, 'rename_device', `Nama perangkat diubah menjadi "${trimmed}"`);
      return this.devices[deviceId];
    }
    return null;
  }

  renameRelay(deviceId, channel, newName) {
    const dev = this.devices[deviceId];
    if (dev) {
      const r = dev.relays.find(x => x.channel === parseInt(channel));
      if (r) {
        const trimmed = newName.trim();
        r.name = trimmed;
        db.renameRelay(deviceId, channel, trimmed);
        db.addLog(deviceId, 'rename_relay', `Nama Saklar #${channel} diubah menjadi "${trimmed}"`);
        return dev;
      }
    }
    return null;
  }

  renameComponent(deviceId, componentId, newName) {
    const dev = this.devices[deviceId];
    if (dev) {
      const trimmed = newName.trim();
      const success = db.renameComponent(deviceId, componentId, trimmed);
      if (success) {
        if (Array.isArray(dev.components)) {
          const c = dev.components.find(x => x.id === componentId || x.componentId === componentId);
          if (c) c.name = trimmed;
        }
        db.addLog(deviceId, 'rename_component', `Nama komponen ${componentId} diubah menjadi "${trimmed}"`);
        return dev;
      }
    }
    return null;
  }

  // Tambah / Konfigurasi Komponen Pin Baru
  addComponent(deviceId, compData) {
    const dev = this.devices[deviceId];
    if (!dev) return null;

    const compId = compData.id || compData.componentId || `comp_${Date.now()}`;
    const comp = {
      id: compId,
      componentId: compId,
      name: compData.name || compId,
      type: compData.type || 'sensor',
      unit: compData.unit || '',
      value: String(compData.value !== undefined ? compData.value : '0'),
      access: compData.access || 'rw',
      pin: compData.pin !== undefined ? parseInt(compData.pin) : -1,
      activeLow: compData.activeLow !== undefined ? compData.activeLow : true,
      pullup: compData.pullup !== undefined ? compData.pullup : true,
      driver: compData.driver || compData.type,
      config: compData.config || {}
    };

    // 1. Simpan ke SQLite
    db.upsertComponent(deviceId, comp);

    // 2. Jika switch relay_X, sinkronkan ke tabel relays
    if (comp.type === 'switch' && /^relay_\d+$/i.test(comp.id)) {
      const ch = parseInt(comp.id.replace(/\D/g, '')) || 1;
      const stateBool = comp.value === 'true' || comp.value === true || comp.value === '1';
      db.upsertRelay(deviceId, ch, comp.name, stateBool);
    }

    // 3. Push konfigurasi langsung ke hardware jika online
    const socket = this.getSocket(deviceId);
    if (socket && socket.readyState === 1) { // WebSocket.OPEN
      socket.send(JSON.stringify({
        action: 'configure_pin',
        ...comp
      }));
      console.log(`[DYNAMIC PINS] Konfigurasi pin dikirim ke hardware ${deviceId}: Pin ${comp.pin} (${comp.name})`);
    }

    // 4. Refresh in-memory
    dev.components = db.getComponents(deviceId);
    db.addLog(deviceId, 'add_component', `Komponen ${comp.id} (${comp.name}, Pin ${comp.pin}) ditambahkan`);
    return dev;
  }

  // Hapus Komponen Pin
  deleteComponent(deviceId, componentId) {
    const dev = this.devices[deviceId];
    if (!dev) return null;

    // 1. Hapus dari SQLite (termasuk companion sensor jika ada)
    db.deleteComponent(deviceId, componentId);
    db.deleteComponent(deviceId, `${componentId}_hum`);
    db.deleteComponent(deviceId, `${componentId}_press`);

    // 2. Jika relay_X, hapus dari tabel relays juga jika perlu
    if (/^relay_\d+$/i.test(componentId)) {
      const ch = parseInt(componentId.replace(/\D/g, ''));
      if (ch) {
        dev.relays = dev.relays.filter(r => r.channel !== ch);
      }
    }

    // 3. Beritahu hardware agar melepas pin tersebut
    const socket = this.getSocket(deviceId);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({
        action: 'remove_pin',
        componentId: componentId
      }));
      console.log(`[DYNAMIC PINS] Instruksi lepas pin ${componentId} dikirim ke hardware ${deviceId}`);
    }

    // 4. Refresh in-memory
    dev.components = db.getComponents(deviceId);
    db.addLog(deviceId, 'delete_component', `Komponen ${componentId} dihapus dari perangkat`);
    return dev;
  }

  // Simpan hasil scan bus I2C dari hardware
  handleI2cScanResult(deviceId, payload) {
    if (!this.i2cScans) this.i2cScans = {};
    this.i2cScans[deviceId] = {
      timestamp: new Date().toISOString(),
      devices: payload.devices || []
    };
    db.addLog(deviceId, 'i2c_scan_complete', `Ditemukan ${(payload.devices || []).length} modul I2C pada hardware`);
    return this.i2cScans[deviceId];
  }

  getI2cScanResult(deviceId) {
    if (!this.i2cScans) return null;
    return this.i2cScans[deviceId] || null;
  }

  addDevice(data) {
    const deviceId = data.deviceId;
    const name = data.name || `Perangkat (${deviceId})`;
    const type = data.type || 'modular-iot';
    const dev = db.preRegisterDevice(deviceId, name, type);
    this.devices[deviceId] = dev;
    db.addLog(deviceId, 'device_added', `Perangkat ${deviceId} ditambahkan secara manual`);
    return dev;
  }

  deleteDevice(deviceId) {
    const socket = this.getSocket(deviceId);
    if (socket) {
      try {
        socket.close(4004, 'Device Deleted');
      } catch (e) {}
      this.sockets.delete(deviceId);
    }

    if (this.devices[deviceId]) {
      delete this.devices[deviceId];
    }
    
    const success = db.deleteDevice(deviceId);
    db.addLog(deviceId, 'delete_device', `Perangkat ${deviceId} dihapus dari sistem`);
    return success;
  }

  triggerOTA(deviceId, binUrl) {
    const socket = this.getSocket(deviceId);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({
        action: 'ota_update',
        url: binUrl
      }));
      db.addLog(deviceId, 'ota_triggered', `Instruksi OTA Update dikirim: ${binUrl}`);
      console.log(`[OTA] Instruksi OTA dikirim ke ${deviceId}: ${binUrl}`);
      return { success: true, message: `Instruksi OTA update dikirim ke ${deviceId}` };
    }
    return { success: false, message: `Perangkat ${deviceId} sedang offline` };
  }

  // Watchdog: Cek jika ada perangkat yang mendadak mati (misal mati lampu / dicabut)
  checkStaleDevices(timeoutMs, onStaleCallback) {
    const now = Date.now();
    Object.values(this.devices).forEach(dev => {
      if (dev.isOnline && dev.lastSeen) {
        const diff = now - new Date(dev.lastSeen).getTime();
        if (diff > timeoutMs) {
          console.warn(`[WATCHDOG] Perangkat ${dev.deviceId} tidak merespons selama ${Math.round(diff/1000)}s -> Set Offline`);
          dev.isOnline = false;
          this.sockets.delete(dev.deviceId);
          db.setDeviceOnline(dev.deviceId, false, dev.lastSeen);
          db.addLog(dev.deviceId, 'device_timeout', `Watchdog timeout setelah ${Math.round(diff/1000)} detik`);
          if (onStaleCallback) {
            onStaleCallback(dev);
          }
        }
      }
    });
  }

  getAll() {
    return this.devices;
  }
}

module.exports = new DeviceManager();
