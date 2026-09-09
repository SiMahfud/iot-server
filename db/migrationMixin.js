// ==========================================
// Database Mixin: Auto Migration from JSON
// ==========================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_JSON = path.join(__dirname, '..', 'state.json');
const SCHEDULES_JSON = path.join(__dirname, '..', 'schedules.json');
const CONFIG_JSON = path.join(__dirname, '..', 'config.json');

module.exports = {
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
      this.importSchedulesFromJson();
    }

    // 3. Inisialisasi Kredensial User dari config.json jika tabel users masih kosong
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0 && fs.existsSync(CONFIG_JSON)) {
      try {
        const raw = fs.readFileSync(CONFIG_JSON, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.auth && parsed.auth.username && parsed.auth.password) {
          let passwordToStore = parsed.auth.password;
          if (!passwordToStore.startsWith('scrypt$')) {
            const salt = crypto.randomBytes(16).toString('hex');
            const derivedKey = crypto.scryptSync(passwordToStore, salt, 64);
            passwordToStore = `scrypt$${salt}$${derivedKey.toString('hex')}`;
          }
          this.db.prepare(`
            INSERT INTO users (username, password, role, updatedAt)
            VALUES (?, ?, 'admin', ?)
          `).run(parsed.auth.username, passwordToStore, new Date().toISOString());
          console.log(`[SQLITE] User '${parsed.auth.username}' diinisialisasi dari config.json ke SQLite dengan hash scrypt`);
        }
      } catch (err) {
        console.error('[SQLITE] Gagal inisialisasi user dari config.json:', err.message);
      }
    }
  }
};
