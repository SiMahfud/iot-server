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

  // Hash password menggunakan native scrypt dengan salt 16 bytes acak
  hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
  }

  // Verifikasi hash password atau plaintext legacy (timing-safe)
  verifyPasswordHash(password, storedPassword) {
    if (!storedPassword || typeof storedPassword !== 'string' || !password) return false;
    if (storedPassword.startsWith('scrypt$')) {
      const parts = storedPassword.split('$');
      if (parts.length !== 3) return false;
      const [, salt, expectedHashHex] = parts;
      const derivedKey = crypto.scryptSync(password, salt, 64);
      const expectedBuf = Buffer.from(expectedHashHex, 'hex');
      if (derivedKey.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(derivedKey, expectedBuf);
    }
    // Fallback legacy plaintext (sebelum migrasi hash)
    const userBuf = Buffer.from(String(password));
    const storedBuf = Buffer.from(String(storedPassword));
    if (userBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(userBuf, storedBuf);
  }

  // Verifikasi username & password login admin via SQLite (fallback ke config.json jika perlu)
  verifyLogin(username, password) {
    if (!username || !password) return false;
    try {
      const user = db.getUser(username);
      if (user) {
        const isValid = this.verifyPasswordHash(password, user.password);
        // Jika valid dan password masih berupa plaintext legacy, lakukan transparent upgrade ke hash scrypt
        if (isValid && !user.password.startsWith('scrypt$')) {
          const hashed = this.hashPassword(password);
          db.updatePassword(username, hashed);
          console.log(`[AUTH] Password user '${username}' berhasil dimigrasikan ke hash kriptografi scrypt`);
        }
        return isValid;
      }
    } catch (err) {
      console.warn('[AUTH] Gagal membaca user dari DB, fallback ke config:', err.message);
    }

    const currentConfig = this.getLatestConfig();
    if (currentConfig.auth && currentConfig.auth.username === username && currentConfig.auth.password) {
      const isValid = this.verifyPasswordHash(password, currentConfig.auth.password);
      return isValid;
    }
    return false;
  }

  // Buat Token Sesi (Masa berlaku 30 hari)
  createToken(username) {
    const payload = {
      u: username,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 hari
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const currentConfig = this.getLatestConfig();
    const tokenSecret = currentConfig.auth?.tokenSecret || this.secret;
    const signature = crypto.createHmac('sha256', tokenSecret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  // Validasi token yang dikirim dari browser PWA
  verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    try {
      const [encodedPayload, signature] = parts;
      const currentConfig = this.getLatestConfig();
      const tokenSecret = currentConfig.auth?.tokenSecret || this.secret;
      const expectedSig = crypto.createHmac('sha256', tokenSecret).update(encodedPayload).digest('base64url');

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

  // Verifikasi kunci rahasia hardware Wemos (timing-safe)
  verifyDeviceKey(key) {
    if (!key || typeof key !== 'string') return false;
    const currentConfig = this.getLatestConfig();
    const deviceSecret = currentConfig.auth?.deviceSecret || this.deviceSecret;
    const keyBuf = Buffer.from(key);
    const secretBuf = Buffer.from(deviceSecret);
    if (keyBuf.length !== secretBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, secretBuf);
  }

  // Buat Token Sesi Hardware (Berlaku 7 hari)
  createDeviceSessionToken(deviceId) {
    const payload = {
      d: deviceId,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const currentConfig = this.getLatestConfig();
    const tokenSecret = currentConfig.auth?.tokenSecret || this.secret;
    const signature = crypto.createHmac('sha256', tokenSecret).update(`device:${encoded}`).digest('base64url');
    return `sess_${encoded}.${signature}`;
  }

  // Validasi token sesi hardware (timing-safe)
  verifyDeviceSessionToken(token, deviceId) {
    if (!token || typeof token !== 'string') return false;
    const cleanToken = token.startsWith('sess_') ? token.substring(5) : token;
    const parts = cleanToken.split('.');
    if (parts.length !== 2) return false;

    const [encoded, signature] = parts;
    const currentConfig = this.getLatestConfig();
    const tokenSecret = currentConfig.auth?.tokenSecret || this.secret;
    const expectedSig = crypto.createHmac('sha256', tokenSecret).update(`device:${encoded}`).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
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

  // Ubah password user di SQLite (hash scrypt) dan bersihkan plaintext password dari config.json
  changePassword(usernameOrPassword, maybeNewPassword) {
    const username = maybeNewPassword !== undefined ? usernameOrPassword : 'admin';
    const newPassword = maybeNewPassword !== undefined ? maybeNewPassword : usernameOrPassword;
    const hashedPassword = this.hashPassword(newPassword);

    // 1. Simpan di database SQLite
    db.updatePassword(username, hashedPassword);
    db.addLog(null, 'auth_password_changed', `Password untuk '${username}' berhasil diperbarui (scrypt)`);

    // 2. Bersihkan password plaintext dari config.json demi keamanan
    try {
      const cfg = this.getLatestConfig();
      if (cfg && cfg.auth) {
        delete cfg.auth.password;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
      }
    } catch (err) {
      console.warn('[AUTH] Gagal membersihkan password plaintext dari config.json:', err.message);
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
