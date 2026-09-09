// ==========================================
// AgyGateway Universal IoT Server - Entry Point
// Lean orchestrator (~150 lines)
// ==========================================

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
const automationEngine = require('./automationEngine');
const componentTypes = require('./modules/componentTypes');
const db = require('./database');

// --- Route Modules ---
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const scheduleRoutes = require('./routes/schedules');
const automationRoutes = require('./routes/automations');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: config.server.wsPath || '/ws' });

const PORT = process.env.PORT || config.server.port || 3050;

// Middleware
app.set('trust proxy', true);
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
// Inisialisasi Route Modules (Dependency Injection)
// -------------------------------------------------------------
authRoutes.init({ auth });
const { requireAuth } = authRoutes;

deviceRoutes.init({ deviceManager, db, broadcastToBrowsers, requireAuth });
scheduleRoutes.init({ schedulerManager, db, broadcastToBrowsers, requireAuth });
automationRoutes.init({ automationEngine, componentTypes, db, requireAuth });

// Mount Routes
app.use('/api', authRoutes.router);
app.use('/api', deviceRoutes.router);
app.use('/api/schedules', scheduleRoutes.router);
app.use('/api', automationRoutes.router);

// -------------------------------------------------------------
// WebSocket Handler dengan Autentikasi Ketat
// -------------------------------------------------------------
wss.on('connection', (ws, req) => {
  const clientIp = req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress);
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
        schedules: schedulerManager.getSchedules(),
        automations: automationEngine.getRules(),
        componentTypes: componentTypes.COMPONENT_TYPES
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
            schedules: schedulerManager.getSchedules(),
            automations: automationEngine.getRules(),
            componentTypes: componentTypes.COMPONENT_TYPES
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

      // 3. Perintah Kontrol Komponen Universal & Relay & I2C Scan & Virtual Pin & Kalibrasi
      if (msg.action === 'set_component' || msg.action === 'set_relay' || msg.action === 'set_all' || msg.action === 'get_status' || msg.action === 'ota_update' || msg.action === 'scan_i2c' || msg.action === 'virtual_write' || msg.action === 'calibrate_component') {
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

        // Sinkronkan state lokal & siarkan perubahan secara real-time ke semua dashboard browser
        let updatedDev = null;
        if (msg.action === 'set_component') {
          const val = msg.value !== undefined ? msg.value : msg.state;
          updatedDev = deviceManager.updateComponentState(targetId, msg.componentId, val);
        } else if (msg.action === 'set_all') {
          updatedDev = deviceManager.setAllComponentsState(targetId, Boolean(msg.state));
        } else if (msg.action === 'set_relay') {
          updatedDev = deviceManager.updateComponentState(targetId, `relay_${msg.channel}`, Boolean(msg.state));
        }

        if (updatedDev) {
          broadcastToBrowsers({
            type: 'DEVICE_UPDATE',
            device: updatedDev
          });
        }
      }

      // 3b. Perintah Batalkan Timer Countdown
      if (msg.action === 'cancel_timer') {
        const targetId = msg.target;
        const targetSocket = deviceManager.getSocket(targetId);
        const compId = msg.componentId || (msg.channel !== undefined ? `relay_${msg.channel}` : null);

        if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
          const outMsg = {
            action: 'cancel_timer',
            target: targetId,
            componentId: compId
          };
          targetSocket.send(JSON.stringify(outMsg));
          console.log(`[KONTROL] Teruskan 'cancel_timer' komponen ${compId} ke ${targetId}`);
          db.addLog(targetId, 'control_cancel_timer', { componentId: compId, channel: msg.channel });
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
// Jalankan Server
// -------------------------------------------------------------
server.listen(PORT, () => {
  // Inisialisasi scheduler dan automation engine setelah server aktif
  schedulerManager.init(deviceManager, broadcastToBrowsers);
  automationEngine.init(deviceManager, broadcastToBrowsers);

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
  🔒 AgyGateway Universal IoT Server Aktif (SQLite Mode)
  - Port           : ${PORT}
  - Database       : SQLite (iot.db) - WAL Mode (JSON Live-Sync)
  - Web Dashboard  : http://localhost:${PORT}
  - WebSocket Path : ws://localhost:${PORT}${config.server.wsPath}
  - Auth           : Enabled (User: admin)
  - Scheduler      : ${schedulerManager.getSchedules().length} jadwal aktif
  - Automations    : ${automationEngine.getRules().length} aturan aktif
============================================================
  `);
});
