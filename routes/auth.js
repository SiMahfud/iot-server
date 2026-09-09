// ==========================================
// Auth Routes - Express Router
// AgyGateway Universal IoT Server
// ==========================================

const express = require('express');
const router = express.Router();

let auth; // Injected via init()

/**
 * Middleware: Autentikasi REST API via Bearer Token
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Autentikasi dibutuhkan' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const payload = auth.verifyToken(token);
  if (!payload) {
    return res.status(403).json({ success: false, message: 'Token tidak valid atau kedaluwarsa' });
  }

  req.user = payload;
  next();
}

// 1. Login
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (auth.verifyLogin(username, password)) {
    const token = auth.createToken(username);
    console.log(`[AUTH] Login berhasil untuk user: ${username}`);
    return res.json({ success: true, token, username });
  }

  console.warn(`[AUTH] Percobaan login gagal untuk user: ${username}`);
  return res.status(401).json({ success: false, message: 'Username atau password salah!' });
});

// 2. Cek Validitas Token
router.get('/auth/check', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.json({ authenticated: false });

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const payload = auth.verifyToken(token);
  return res.json({ authenticated: !!payload, user: payload ? payload.u : null });
});

// 3. Ubah Password
router.post('/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!auth.verifyLogin(req.user.u, currentPassword)) {
    return res.status(400).json({ success: false, message: 'Password saat ini salah!' });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter!' });
  }

  auth.changePassword(newPassword);
  console.log(`[AUTH] Password diubah untuk user: ${req.user.u}`);
  res.json({ success: true, message: 'Password berhasil diubah!' });
});

/**
 * Inisialisasi dependensi yang di-inject dari server.js
 */
function init(deps) {
  auth = deps.auth;
}

module.exports = { router, requireAuth, init };
