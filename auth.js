const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let config;
try {
  config = require('./config.json');
} catch {
  config = require('./config.example.json');
}
const db = require('./database');

const CONFIG_PATH = path.join(__dirname, 'config.json');

class AuthManager {
  constructor() {
    this.secret = config.auth?.tokenSecret || 'default-random-secret-key-3377';
    this.deviceSecret = config.auth?.deviceSecret || 'wemos-secret-key-3377';
  }

  // Verifikasi username & password login admin via SQLite (fallback ke config.json jika perlu)
  verifyLogin(username, password) {
    try {
      const user = db.getUser(username);
      if (user) {
        return user.password === password;
      }
    } catch (err) {
      console.warn('[AUTH] Gagal membaca user dari DB, fallback ke config:', err.message);
    }

    const currentConfig = this.getLatestConfig();
    return (
      username === currentConfig.auth.username &&
      password === currentConfig.auth.password
    );
  }

  // Buat Token Sesi (Masa berlaku 30 hari)
  createToken(username) {
    const payload = {
      u: username,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 hari
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  // Validasi token yang dikirim dari browser PWA
  verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    try {
      const [encodedPayload, signature] = parts;
      const expectedSig = crypto.createHmac('sha256', this.secret).update(encodedPayload).digest('base64url');

      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSig);

      // Hindari timing attack dan cegah RangeError jika panjang buffer berbeda
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
      if (Date.now() > payload.exp) {
        return null; // Token kedaluwarsa
      }
      return payload;
    } catch {
      return null;
    }
  }

  // Verifikasi kunci rahasia hardware Wemos
  verifyDeviceKey(key) {
    const currentConfig = this.getLatestConfig();
    return key === currentConfig.auth.deviceSecret;
  }

  // Buat Token Sesi Hardware (Berlaku 7 hari)
  createDeviceSessionToken(deviceId) {
    const payload = {
      d: deviceId,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(`device:${encoded}`).digest('base64url');
    return `sess_${encoded}.${signature}`;
  }

  // Validasi token sesi hardware
  verifyDeviceSessionToken(token, deviceId) {
    if (!token || typeof token !== 'string') return false;
    const cleanToken = token.startsWith('sess_') ? token.substring(5) : token;
    const parts = cleanToken.split('.');
    if (parts.length !== 2) return false;

    const [encoded, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', this.secret).update(`device:${encoded}`).digest('base64url');

    if (signature.length !== expectedSig.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return false;
    }

    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (Date.now() > payload.exp) return false;
      if (deviceId && payload.d !== deviceId) return false;
      return true;
    } catch {
      return false;
    }
  }

  // Ubah password admin di SQLite dan sinkronkan ke config.json
  changePassword(newPassword) {
    // 1. Simpan di database SQLite
    db.updatePassword('admin', newPassword);
    db.addLog(null, 'auth_password_changed', 'Password administrator diperbarui');

    // 2. Sinkronkan juga ke config.json
    try {
      const cfg = this.getLatestConfig();
      cfg.auth.password = newPassword;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (err) {
      console.warn('[AUTH] Gagal sinkronisasi password ke config.json:', err.message);
    }

    return true;
  }

  getLatestConfig() {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(raw);
    } catch {
      return config;
    }
  }
}

module.exports = new AuthManager();
