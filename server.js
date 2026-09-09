const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');
const cors = require('cors');

let config;
try {
  config = require('./config.json');
} catch (e) {
  config = require('./config.example.json');
}
const auth = require('./auth');
const deviceManager = require('./deviceManager');
const schedulerManager = require('./schedulerManager');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: config.server.wsPath || '/ws' });

const PORT = process.env.PORT || config.server.port || 3050;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Cegah cache berlebihan untuk html, js, css agar perubahan langsung aktif
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));
app.use('/firmwares', express.static(path.join(__dirname, 'firmwares')));

// Middleware Autentikasi REST API
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

// -------------------------------------------------------------
// Sockets Registry
// -------------------------------------------------------------
const authenticatedBrowsers = new Set();

function broadcastToBrowsers(message) {
  const payload = JSON.stringify(message);
  for (const client of authenticatedBrowsers) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Watchdog: Deteksi Otomatis Jika Hardware Wemos Mati
setInterval(() => {
  deviceManager.checkStaleDevices(config.iot.deviceTimeoutMs || 45000, (offlineDev) => {
    broadcastToBrowsers({
      type: 'DEVICE_UPDATE',
      device: offlineDev
    });
  });
}, 10000);

// -------------------------------------------------------------
// WebSocket Handler dengan Autentikasi Ketat
// -------------------------------------------------------------
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Koneksi baru masuk dari: ${clientIp}`);

  let isAuthenticated = false;
  let boundDeviceId = null;

  // Cek token atau device key dari URL query parameter jika ada (misal: /ws?token=... atau /ws?key=...)
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const qToken = urlObj.searchParams.get('token');
    const qKey = urlObj.searchParams.get('key');

    if (qToken && auth.verifyToken(qToken)) {
      isAuthenticated = true;
      authenticatedBrowsers.add(ws);
      ws.send(JSON.stringify({
        type: 'INIT_STATE',
        devices: deviceManager.getAll(),
        schedules: schedulerManager.getSchedules()
      }));
    } else if (qKey && auth.verifyDeviceKey(qKey)) {
      isAuthenticated = true;
    }
  } catch (e) {
    // Abaikan error parse URL
  }

  // Timeout: Jika tidak ada autentikasi dalam 8 detik, putuskan sambungan
  const authTimeout = setTimeout(() => {
    if (!isAuthenticated) {
      console.warn(`[WS UNAUTHORIZED] Memutus koneksi ${clientIp} karena tidak terautentikasi`);
      ws.send(JSON.stringify({ type: 'AUTH_ERROR', message: 'Autentikasi gagal atau waktu habis' }));
      ws.close(4001, 'Unauthorized');
    }
  }, 8000);

  ws.on('message', (messageRaw) => {
    try {
      const msg = JSON.parse(messageRaw.toString());

      // 1. Autentikasi dari Browser (PWA)
      if (msg.action === 'auth') {
        if (msg.token && auth.verifyToken(msg.token)) {
          isAuthenticated = true;
          authenticatedBrowsers.add(ws);
          clearTimeout(authTimeout);
          ws.send(JSON.stringify({ type: 'AUTH_SUCCESS' }));
          ws.send(JSON.stringify({
            type: 'INIT_STATE',
            devices: deviceManager.getAll(),
            schedules: schedulerManager.getSchedules()
          }));
          return;
        } else {
          ws.send(JSON.stringify({ type: 'AUTH_ERROR', message: 'Token tidak valid' }));
          ws.close(4001, 'Unauthorized');
          return;
        }
      }

      // 2a. Registrasi Modular (AgyGatewayClient Protocol)
      if (msg.event === 'register' && msg.deviceId) {
        const isKeyValid = msg.key && auth.verifyDeviceKey(msg.key);
        const isTokenValid = msg.token && auth.verifyDeviceSessionToken(msg.token, msg.deviceId);
        if (!isKeyValid && !isTokenValid) {
          console.warn(`[SECURITY] Kunci hardware register untuk ${msg.deviceId} tidak valid!`);
          ws.close(4003, 'Invalid Device Key');
          return;
        }

        isAuthenticated = true;
        clearTimeout(authTimeout);
        boundDeviceId = msg.deviceId;
        authenticatedBrowsers.delete(ws);

        // Buat session token untuk hardware sesuai protokol AgyGatewayClient
        const sessionToken = auth.createDeviceSessionToken(boundDeviceId);
        ws.deviceSessionToken = sessionToken;
        ws.send(JSON.stringify({
          action: 'auth_ok',
          token: sessionToken
        }));

        const updatedDevice = deviceManager.handleRegister(boundDeviceId, msg, ws);
        broadcastToBrowsers({
          type: 'DEVICE_UPDATE',
          device: updatedDevice
        });
        return;
      }

      // 2b. Telemetri Sensor & Komponen Modular
      if (msg.event === 'telemetry' && msg.deviceId) {
        const isSocketBound = isAuthenticated && boundDeviceId === msg.deviceId;
        const isTokenValid = msg.token && auth.verifyDeviceSessionToken(msg.token, msg.deviceId);
        const isKeyValid = msg.key && auth.verifyDeviceKey(msg.key);

        if (!isSocketBound && !isTokenValid && !isKeyValid) {
          console.warn(`[SECURITY] Kunci/token hardware telemetry untuk ${msg.deviceId} tidak valid!`);
          ws.close(4003, 'Invalid Device Key');
          return;
        }

        isAuthenticated = true;
        clearTimeout(authTimeout);
        boundDeviceId = msg.deviceId;
        authenticatedBrowsers.delete(ws);

        const updatedDevice = deviceManager.handleTelemetry(boundDeviceId, msg);
        if (updatedDevice) {
          broadcastToBrowsers({
            type: 'DEVICE_UPDATE',
            device: updatedDevice
          });
        }
        return;
      }

      // 2c. Pesan Status dari Hardware Wemos Lama (Legacy 4-Relay Support)
      if (msg.event === 'status' && msg.deviceId) {
        // Cek kunci keamanan hardware secara ketat (tolak jika key kosong atau salah)
        if (!msg.key || !auth.verifyDeviceKey(msg.key)) {
          console.warn(`[SECURITY] Kunci hardware untuk ${msg.deviceId} tidak valid atau kosong!`);
          ws.close(4003, 'Invalid Device Key');
          return;
        }

        isAuthenticated = true;
        clearTimeout(authTimeout);
        boundDeviceId = msg.deviceId;
        authenticatedBrowsers.delete(ws);

        const updatedDevice = deviceManager.handleStatusUpdate(boundDeviceId, msg, ws);

        broadcastToBrowsers({
          type: 'DEVICE_UPDATE',
          device: updatedDevice
        });
        return;
      }

      // 2d. Hasil Scan I2C dari Hardware
      if (msg.event === 'i2c_scan_result' && msg.deviceId) {
        const isSocketBound = isAuthenticated && boundDeviceId === msg.deviceId;
        const isTokenValid = msg.token && auth.verifyDeviceSessionToken(msg.token, msg.deviceId);
        const isKeyValid = msg.key && auth.verifyDeviceKey(msg.key);

        if (!isSocketBound && !isTokenValid && !isKeyValid) {
          console.warn(`[SECURITY] Kunci hardware i2c_scan untuk ${msg.deviceId} tidak valid!`);
          ws.close(4003, 'Invalid Device Key');
          return;
        }

        isAuthenticated = true;
        clearTimeout(authTimeout);
        boundDeviceId = msg.deviceId;
        authenticatedBrowsers.delete(ws);

        console.log(`[I2C SCAN] Menerima hasil scan I2C dari ${msg.deviceId}: ${(msg.devices || []).length} modul`);
        deviceManager.handleI2cScanResult(msg.deviceId, msg);
        broadcastToBrowsers({
          type: 'I2C_SCAN_RESULT',
          deviceId: msg.deviceId,
          devices: msg.devices || []
        });
        return;
      }

      // 2e. Laporan Progres OTA dari Hardware
      if (msg.event === 'ota_progress' && msg.deviceId) {
        const isSocketBound = isAuthenticated && boundDeviceId === msg.deviceId;
        const isTokenValid = msg.token && auth.verifyDeviceSessionToken(msg.token, msg.deviceId);
        const isKeyValid = msg.key && auth.verifyDeviceKey(msg.key);

        if (!isSocketBound && !isTokenValid && !isKeyValid) {
          console.warn(`[SECURITY] ota_progress dari ${msg.deviceId} ditolak (unauthorized)`);
          return;
        }

        const percent = parseInt(msg.percent) || 0;
        const current = parseInt(msg.current) || 0;
        const total = parseInt(msg.total) || 0;

        console.log(`[OTA PROGRESS] ${msg.deviceId}: ${percent}% (${current}/${total} B)`);
        db.addLog(msg.deviceId, 'ota_progress', { percent, current, total });

        broadcastToBrowsers({
          type: 'OTA_PROGRESS',
          deviceId: msg.deviceId,
          percent,
          current,
          total
        });
        return;
      }

      // Jika belum terautentikasi, tolak semua perintah kontrol
      if (!isAuthenticated) {
        ws.send(JSON.stringify({ type: 'AUTH_ERROR', message: 'Harap login terlebih dahulu' }));
        return;
      }

      // 3. Perintah Kontrol Komponen Universal & Relay & I2C Scan & Virtual Pin
      if (msg.action === 'set_component' || msg.action === 'set_relay' || msg.action === 'set_all' || msg.action === 'get_status' || msg.action === 'ota_update' || msg.action === 'scan_i2c' || msg.action === 'virtual_write') {
        const targetId = msg.target;
        const targetSocket = deviceManager.getSocket(targetId);

        if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
          // Teruskan pesan ke hardware termasuk field 'duration' jika ada (untuk timer countdown)
          targetSocket.send(JSON.stringify(msg));
          const durationInfo = msg.duration ? ` (timer: ${msg.duration}s)` : '';
          console.log(`[KONTROL] Teruskan '${msg.action}' ke hardware ${targetId}${durationInfo}`);
          db.addLog(targetId, 'control_' + msg.action, {
            componentId: msg.componentId || null,
            channel: msg.channel || null,
            pin: msg.pin || null,
            state: msg.state !== undefined ? msg.state : (msg.value !== undefined ? msg.value : null),
            duration: msg.duration || null
          });
        } else {
          ws.send(JSON.stringify({
            type: 'NOTIFICATION',
            level: 'warning',
            message: `Perangkat ${targetId} sedang offline!`
          }));
        }
      }

      // 3b. Perintah Batalkan Timer Countdown
      if (msg.action === 'cancel_timer') {
        const targetId = msg.target;
        const targetSocket = deviceManager.getSocket(targetId);

        if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
          targetSocket.send(JSON.stringify(msg));
          console.log(`[KONTROL] Teruskan 'cancel_timer' channel ${msg.channel} ke ${targetId}`);
          db.addLog(targetId, 'control_cancel_timer', { channel: msg.channel });
        } else {
          ws.send(JSON.stringify({
            type: 'NOTIFICATION',
            level: 'warning',
            message: `Perangkat ${targetId} sedang offline!`
          }));
        }
      }

      // 4. Ping
      if (msg.action === 'ping') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      }
    } catch (err) {
      console.error('[WS ERROR]', err.message);
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    authenticatedBrowsers.delete(ws);

    if (boundDeviceId) {
      console.log(`[WS] Perangkat hardware ${boundDeviceId} terputus`);
      const offlineDev = deviceManager.setDeviceOffline(boundDeviceId);
      if (offlineDev) {
        broadcastToBrowsers({
          type: 'DEVICE_UPDATE',
          device: offlineDev
        });
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[WS ERROR]', err.message);
  });
});

// -------------------------------------------------------------
// REST API Autentikasi
// -------------------------------------------------------------
// 1. Login
app.post('/api/auth/login', (req, res) => {
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
app.get('/api/auth/check', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.json({ authenticated: false });

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const payload = auth.verifyToken(token);
  return res.json({ authenticated: !!payload, user: payload ? payload.u : null });
});

// 3. Ubah Password
app.post('/api/auth/change-password', requireAuth, (req, res) => {
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

// -------------------------------------------------------------
// REST API Manajemen Device (Dilindungi Autentikasi)
// -------------------------------------------------------------
app.get('/api/devices', requireAuth, (req, res) => {
  res.json({ success: true, data: deviceManager.getAll() });
});

app.post('/api/devices/:deviceId/rename', requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const { name } = req.body;
  const updated = deviceManager.renameDevice(deviceId, name);
  if (!updated) return res.status(404).json({ success: false, message: 'Device not found' });

  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
  res.json({ success: true, data: updated });
});

app.post('/api/devices/:deviceId/relay/:channel/rename', requireAuth, (req, res) => {
  const { deviceId, channel } = req.params;
  const { name } = req.body;
  const updated = deviceManager.renameRelay(deviceId, channel, name);
  if (!updated) return res.status(404).json({ success: false, message: 'Device or relay not found' });

  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
  res.json({ success: true, data: updated });
});

app.delete('/api/devices/:deviceId', requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const success = deviceManager.deleteDevice(deviceId);
  if (!success) return res.status(404).json({ success: false, message: 'Device not found' });

  broadcastToBrowsers({ type: 'DEVICE_DELETED', deviceId });
  res.json({ success: true, message: `Device ${deviceId} removed` });
});

// Tambah / Konfigurasi Komponen Pin Baru via Web UI
app.post('/api/devices/:deviceId/components', requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const compData = req.body;

  if (!compData || (!compData.name && !compData.id)) {
    return res.status(400).json({ success: false, message: 'Data komponen atau pin tidak valid' });
  }

  const updated = deviceManager.addComponent(deviceId, compData);
  if (!updated) return res.status(404).json({ success: false, message: 'Perangkat tidak ditemukan' });

  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
  res.json({ success: true, data: updated, message: 'Komponen berhasil dikonfigurasi' });
});

// Hapus Komponen Pin via Web UI
app.delete('/api/devices/:deviceId/components/:componentId', requireAuth, (req, res) => {
  const { deviceId, componentId } = req.params;
  const updated = deviceManager.deleteComponent(deviceId, componentId);
  if (!updated) return res.status(404).json({ success: false, message: 'Perangkat atau komponen tidak ditemukan' });

  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
  res.json({ success: true, data: updated, message: `Komponen ${componentId} berhasil dihapus` });
});

// Request Pemindaian Bus I2C ke Hardware
app.post('/api/devices/:deviceId/scan-i2c', requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const { sda, scl } = req.body || {};

  const targetSocket = deviceManager.getSocket(deviceId);
  if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
    const msg = {
      action: 'scan_i2c',
      target: deviceId,
      sda: sda !== undefined ? parseInt(sda) : -1,
      scl: scl !== undefined ? parseInt(scl) : -1
    };
    targetSocket.send(JSON.stringify(msg));
    db.addLog(deviceId, 'i2c_scan_requested', 'Permintaan pemindaian I2C dikirim ke hardware');
    res.json({ success: true, message: `Instruksi pemindaian I2C dikirim ke hardware ${deviceId}` });
  } else {
    res.status(503).json({ success: false, message: `Perangkat ${deviceId} sedang offline` });
  }
});

// Ambil Hasil Pemindaian I2C Terakhir
app.get('/api/devices/:deviceId/scan-i2c', requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const result = deviceManager.getI2cScanResult(deviceId);
  res.json({ success: true, data: result });
});

// Rename komponen modular (sensor, switch, dll)
app.post('/api/devices/:deviceId/components/:componentId/rename', requireAuth, (req, res) => {
  const { deviceId, componentId } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Nama baru wajib diisi' });

  const updated = deviceManager.renameComponent(deviceId, componentId, name);
  if (!updated) return res.status(404).json({ success: false, message: 'Device or component not found' });

  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
  res.json({ success: true, data: updated });
});

// Ambil riwayat telemetri untuk grafik sensor (Blynk style graph)
app.get('/api/devices/:deviceId/components/:componentId/history', requireAuth, (req, res) => {
  const { deviceId, componentId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const history = db.getTelemetryHistory(deviceId, componentId, limit);
  res.json({ success: true, data: history });
});

// Kontrol komponen via REST API
app.post('/api/devices/:deviceId/components/:componentId/control', requireAuth, (req, res) => {
  const { deviceId, componentId } = req.params;
  const { value, duration } = req.body;

  const targetSocket = deviceManager.getSocket(deviceId);
  if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
    const msg = {
      action: 'set_component',
      target: deviceId,
      componentId,
      value,
      duration: duration || 0
    };
    targetSocket.send(JSON.stringify(msg));
    db.addLog(deviceId, 'rest_control_component', { componentId, value, duration });
    res.json({ success: true, message: `Command sent to ${deviceId}/${componentId}` });
  } else {
    res.status(503).json({ success: false, message: `Perangkat ${deviceId} sedang offline` });
  }
});

// Tulis ke Virtual Pin via REST API (Blynk style)
app.post('/api/devices/:deviceId/virtual-write', requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const { pin, value } = req.body;

  if (!pin || value === undefined) {
    return res.status(400).json({ success: false, message: 'Field pin dan value wajib diisi' });
  }

  const targetSocket = deviceManager.getSocket(deviceId);
  if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
    const msg = {
      action: 'virtual_write',
      target: deviceId,
      pin: String(pin),
      value: String(value)
    };
    targetSocket.send(JSON.stringify(msg));
    db.addLog(deviceId, 'rest_virtual_write', { pin, value });
    res.json({ success: true, message: `Virtual pin ${pin} diatur ke ${value} pada ${deviceId}` });
  } else {
    res.status(503).json({ success: false, message: `Perangkat ${deviceId} sedang offline` });
  }
});

// Trigger OTA Update via REST API
app.post('/api/devices/:deviceId/ota', requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const { firmwareUrl } = req.body;

  if (!firmwareUrl) {
    return res.status(400).json({ success: false, message: 'firmwareUrl wajib diisi' });
  }

  const targetSocket = deviceManager.getSocket(deviceId);
  if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
    const msg = { action: 'ota_update', target: deviceId, url: firmwareUrl };
    targetSocket.send(JSON.stringify(msg));
    db.addLog(deviceId, 'ota_update_triggered', { url: firmwareUrl });
    res.json({ success: true, message: `Instruksi OTA dikirim ke ${deviceId}` });
  } else {
    res.status(503).json({ success: false, message: `Perangkat ${deviceId} sedang offline` });
  }
});

// -------------------------------------------------------------
// REST API Scheduler (Dilindungi Autentikasi)
// -------------------------------------------------------------
// Daftar semua jadwal (opsional filter per device)
app.get('/api/schedules', requireAuth, (req, res) => {
  const { deviceId } = req.query;
  const schedules = schedulerManager.getSchedules(deviceId || null);
  res.json({ success: true, data: schedules });
});

// Tambah jadwal baru
app.post('/api/schedules', requireAuth, (req, res) => {
  const { deviceId, channel, action, time, days, label, duration } = req.body;

  if (!deviceId || !channel || !time) {
    return res.status(400).json({ success: false, message: 'deviceId, channel, dan time wajib diisi' });
  }

  // Validasi format time HH:MM
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ success: false, message: 'Format waktu harus HH:MM' });
  }

  const schedule = schedulerManager.addSchedule({ deviceId, channel, action, time, days, label, duration });
  broadcastToBrowsers({ type: 'SCHEDULES_UPDATE', schedules: schedulerManager.getSchedules() });
  res.json({ success: true, data: schedule });
});

// Update jadwal
app.put('/api/schedules/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const updated = schedulerManager.updateSchedule(id, req.body);
  if (!updated) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan' });

  broadcastToBrowsers({ type: 'SCHEDULES_UPDATE', schedules: schedulerManager.getSchedules() });
  res.json({ success: true, data: updated });
});

// Hapus jadwal
app.delete('/api/schedules/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const success = schedulerManager.deleteSchedule(id);
  if (!success) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan' });

  broadcastToBrowsers({ type: 'SCHEDULES_UPDATE', schedules: schedulerManager.getSchedules() });
  res.json({ success: true, message: 'Jadwal berhasil dihapus' });
});

// Sinkronisasi Manual schedules.json -> SQLite
app.post('/api/schedules/sync-json', requireAuth, (req, res) => {
  const result = db.importSchedulesFromJson();
  if (result.success) {
    schedulerManager.reloadFromDb();
    broadcastToBrowsers({ type: 'SCHEDULES_UPDATE', schedules: schedulerManager.getSchedules() });
    return res.json({ success: true, message: `Berhasil sinkronisasi ${result.count} jadwal dari schedules.json` });
  }
  return res.status(400).json({ success: false, message: result.message || 'Gagal sinkronisasi' });
});

// -------------------------------------------------------------
// REST API Daftar Firmware (untuk Web Flasher)
// -------------------------------------------------------------
app.get('/api/firmwares', requireAuth, (req, res) => {
  const firmwareDir = path.join(__dirname, 'firmwares');
  try {
    const files = fs.readdirSync(firmwareDir)
      .filter(f => f.endsWith('.bin'))
      .map(f => {
        const stat = fs.statSync(path.join(firmwareDir, f));
        return {
          name: f,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          url: `/firmwares/${encodeURIComponent(f)}`
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ success: true, data: files });
  } catch (e) {
    res.json({ success: true, data: [] });
  }
});

// -------------------------------------------------------------
// REST API Log Aktivitas (Dilindungi Autentikasi)
// -------------------------------------------------------------
app.get('/api/logs', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const logs = db.getRecentLogs(limit);
  res.json({ success: true, data: logs });
});

// -------------------------------------------------------------
// Jalankan Server
// -------------------------------------------------------------
server.listen(PORT, () => {
  // Inisialisasi scheduler setelah server aktif
  schedulerManager.init(deviceManager, broadcastToBrowsers);

  // File Watcher: Deteksi jika schedules.json diedit secara manual di text editor
  const SCHEDULES_FILE = path.join(__dirname, 'schedules.json');
  let watcherDebounce = null;
  if (fs.existsSync(SCHEDULES_FILE)) {
    fs.watch(SCHEDULES_FILE, (eventType) => {
      if (eventType === 'change') {
        // Hindari loop jika perubahan berasal dari penulisan internal SQLite
        if (db.isRecentInternalSync()) return;

        clearTimeout(watcherDebounce);
        watcherDebounce = setTimeout(() => {
          try {
            console.log('[WATCHER] Perubahan terdeteksi pada schedules.json. Memperbarui SQLite & Cron...');
            const res = db.importSchedulesFromJson();
            if (res.success) {
              schedulerManager.reloadFromDb();
              broadcastToBrowsers({
                type: 'SCHEDULES_UPDATE',
                schedules: schedulerManager.getSchedules()
              });
              broadcastToBrowsers({
                type: 'NOTIFICATION',
                level: 'info',
                message: '🔄 Jadwal otomatis disinkronkan dari file schedules.json'
              });
            }
          } catch (e) {
            console.error('[WATCHER ERROR]', e.message);
          }
        }, 1000);
      }
    });
  }

  console.log(`
============================================================
  🔒 IoT Smart Relay Server Aktif (SQLite Database Mode)
  - Port           : ${PORT}
  - Database       : SQLite (iot.db) - WAL Mode (JSON Live-Sync)
  - Web Dashboard  : http://localhost:${PORT}
  - WebSocket Path : ws://localhost:${PORT}${config.server.wsPath}
  - Auth           : Enabled (User: admin)
  - Scheduler      : ${schedulerManager.getSchedules().length} jadwal aktif
============================================================
  `);
});
