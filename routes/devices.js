// ==========================================
// Device Routes - Express Router
// AgyGateway Universal IoT Server
// ==========================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const { WebSocket } = require('ws');
const router = express.Router();

let deviceManager, db, broadcastToBrowsers, requireAuth;

// --- Device CRUD ---

router.get('/devices', (req, res) => {
  res.json({ success: true, data: deviceManager.getAll() });
});

router.get('/devices/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const dev = deviceManager.getDevice(deviceId);
  if (!dev) return res.status(404).json({ success: false, message: 'Device not found' });
  res.json({ success: true, data: dev });
});

router.post('/devices', (req, res) => {
  const { deviceId, name, type } = req.body;
  if (!deviceId || !deviceId.trim()) {
    return res.status(400).json({ success: false, message: 'Device ID wajib diisi' });
  }
  const cleanId = deviceId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const dev = deviceManager.addDevice({ deviceId: cleanId, name, type });
  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: dev });
  res.json({ success: true, data: dev });
});

router.post('/devices/:deviceId/rename', (req, res) => {
  const { deviceId } = req.params;
  const { name } = req.body;
  const updated = deviceManager.renameDevice(deviceId, name);
  if (!updated) return res.status(404).json({ success: false, message: 'Device not found' });

  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
  res.json({ success: true, data: updated });
});

router.post('/devices/:deviceId/relay/:channel/rename', (req, res) => {
  const { deviceId, channel } = req.params;
  const { name } = req.body;
  const updated = deviceManager.renameRelay(deviceId, channel, name);
  if (!updated) return res.status(404).json({ success: false, message: 'Device or relay not found' });

  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
  res.json({ success: true, data: updated });
});

router.delete('/devices/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const success = deviceManager.deleteDevice(deviceId);
  if (!success) return res.status(404).json({ success: false, message: 'Device not found' });

  broadcastToBrowsers({ type: 'DEVICE_DELETED', deviceId });
  res.json({ success: true, message: `Device ${deviceId} removed` });
});

// --- OTA Firmware ---

const handleOtaRequest = (req, res) => {
  const deviceId = req.params.deviceId || req.body.deviceId;
  const { url, filename, firmwareUrl, binUrl: reqBinUrl } = req.body;
  const binUrl = reqBinUrl || firmwareUrl || url || (filename ? `${req.protocol}://${req.get('host')}/firmwares/${encodeURIComponent(filename)}` : null);
  if (!deviceId || !binUrl) return res.status(400).json({ success: false, message: 'deviceId dan URL atau nama file firmware wajib diberikan' });

  const targetSocket = deviceManager.getSocket(deviceId);
  if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
    const msg = { action: 'ota_update', target: deviceId, url: binUrl };
    targetSocket.send(JSON.stringify(msg));
    db.addLog(deviceId, 'ota_update_triggered', { url: binUrl });
    res.json({ success: true, message: `Instruksi OTA dikirim ke ${deviceId}` });
  } else {
    res.status(503).json({ success: false, message: `Perangkat ${deviceId} sedang offline` });
  }
};

router.post('/devices/:deviceId/ota', handleOtaRequest);
router.post('/ota/trigger', handleOtaRequest);

// --- Daftar File Firmware ---

router.get('/firmwares', (req, res) => {
  const firmwareDir = path.join(__dirname, '..', 'firmwares');
  if (!fs.existsSync(firmwareDir)) fs.mkdirSync(firmwareDir, { recursive: true });
  try {
    const files = fs.readdirSync(firmwareDir)
      .filter(f => f.endsWith('.bin'))
      .map(f => {
        const stat = fs.statSync(path.join(firmwareDir, f));
        return {
          filename: f,
          name: f,
          size: stat.size,
          sizeFormatted: (stat.size / 1024).toFixed(1) + ' KB',
          modified: stat.mtime.toISOString(),
          updatedAt: stat.mtime,
          url: `/firmwares/${encodeURIComponent(f)}`
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- Components & Dynamic Pins Management ---

function handleConfigureComponent(req, res) {
  const { deviceId } = req.params;
  const compData = req.body;

  if (!compData || (!compData.name && !compData.id)) {
    return res.status(400).json({ success: false, message: 'Data komponen atau pin tidak valid' });
  }

  const updated = deviceManager.addComponent(deviceId, compData);
  if (!updated) return res.status(404).json({ success: false, message: 'Perangkat tidak ditemukan' });

  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
  res.json({ success: true, data: updated, message: 'Komponen berhasil dikonfigurasi' });
}

function handleDeleteComponent(req, res) {
  const { deviceId, componentId } = req.params;
  const updated = deviceManager.deleteComponent(deviceId, componentId);
  if (!updated) return res.status(404).json({ success: false, message: 'Perangkat atau komponen tidak ditemukan' });

  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
  res.json({ success: true, data: updated, message: `Komponen ${componentId} berhasil dihapus` });
}

router.post('/devices/:deviceId/components', handleConfigureComponent);
router.post('/devices/:deviceId/pins', handleConfigureComponent);

router.delete('/devices/:deviceId/components/:componentId', handleDeleteComponent);
router.delete('/devices/:deviceId/pins/:componentId', handleDeleteComponent);

router.post('/devices/:deviceId/components/:componentId/rename', (req, res) => {
  const { deviceId, componentId } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Nama baru wajib diisi' });

  const updated = deviceManager.renameComponent(deviceId, componentId, name);
  if (!updated) return res.status(404).json({ success: false, message: 'Device or component not found' });

  broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
  res.json({ success: true, data: updated });
});

router.get('/devices/:deviceId/components/:componentId/history', (req, res) => {
  const { deviceId, componentId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const history = db.getTelemetryHistory(deviceId, componentId, limit);
  res.json({ success: true, data: history });
});

router.get('/devices/:deviceId/history', (req, res) => {
  const { deviceId } = req.params;
  const { componentId } = req.query;
  if (!componentId) {
    return res.status(400).json({ success: false, message: 'Query parameter componentId wajib diisi' });
  }
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const history = db.getTelemetryHistory(deviceId, componentId, limit);
  res.json({ success: true, data: history });
});

// --- Kontrol Komponen & Timer via REST API ---

router.post('/devices/:deviceId/components/:componentId/control', (req, res) => {
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

    const updated = deviceManager.updateComponentState(deviceId, componentId, value);
    if (updated) {
      broadcastToBrowsers({ type: 'DEVICE_UPDATE', device: updated });
    }

    res.json({ success: true, message: `Command sent to ${deviceId}/${componentId}` });
  } else {
    res.status(503).json({ success: false, message: `Perangkat ${deviceId} sedang offline` });
  }
});

router.post('/devices/:deviceId/cancel-timer', (req, res) => {
  const { deviceId } = req.params;
  const { componentId, channel } = req.body || {};
  const compId = componentId || (channel !== undefined ? `relay_${channel}` : null);

  if (!compId) {
    return res.status(400).json({ success: false, message: 'componentId atau channel wajib diisi' });
  }

  const targetSocket = deviceManager.getSocket(deviceId);
  if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
    const msg = {
      action: 'cancel_timer',
      target: deviceId,
      componentId: compId
    };
    targetSocket.send(JSON.stringify(msg));
    db.addLog(deviceId, 'rest_cancel_timer', { componentId: compId });
    res.json({ success: true, message: `Instruksi cancel_timer dikirim ke ${deviceId} (${compId})` });
  } else {
    res.status(503).json({ success: false, message: `Perangkat ${deviceId} sedang offline` });
  }
});

// --- I2C Scanner ---

router.post('/devices/:deviceId/scan-i2c', (req, res) => {
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

router.get('/devices/:deviceId/scan-i2c', (req, res) => {
  const { deviceId } = req.params;
  const result = deviceManager.getI2cScanResult(deviceId);
  res.json({ success: true, data: result });
});

// --- Virtual Pin (Blynk style) ---

router.post('/devices/:deviceId/virtual-write', (req, res) => {
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

/**
 * Inisialisasi dependensi yang di-inject dari server.js
 * Semua route menggunakan requireAuth middleware yang diset setelah init
 */
function init(deps) {
  deviceManager = deps.deviceManager;
  db = deps.db;
  broadcastToBrowsers = deps.broadcastToBrowsers;
  requireAuth = deps.requireAuth;

  // Auth sekarang diterapkan di level mount server.js (app.use('/api', requireAuth, ...))
}

module.exports = { router, init };
