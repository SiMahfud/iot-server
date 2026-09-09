// ==========================================
// Schedule Routes - Express Router
// AgyGateway Universal IoT Server
// ==========================================

const express = require('express');
const router = express.Router();

let schedulerManager, db, broadcastToBrowsers, requireAuth;

// Daftar semua jadwal (opsional filter per device)
router.get('/', (req, res) => {
  const { deviceId } = req.query;
  const schedules = schedulerManager.getSchedules(deviceId || null);
  res.json({ success: true, data: schedules });
});

// Tambah jadwal baru
router.post('/', (req, res) => {
  const { deviceId, channel, componentId, action, time, days, label, duration, targetValue } = req.body;

  if (!deviceId || !time || (!channel && !componentId)) {
    return res.status(400).json({ success: false, message: 'deviceId, time, dan channel atau componentId wajib diisi' });
  }

  // Validasi format time HH:MM
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ success: false, message: 'Format waktu harus HH:MM' });
  }

  const schedule = schedulerManager.addSchedule({ deviceId, channel, componentId, action, time, days, label, duration, targetValue });
  broadcastToBrowsers({ type: 'SCHEDULES_UPDATE', schedules: schedulerManager.getSchedules() });
  res.json({ success: true, data: schedule });
});

// Update jadwal
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const updated = schedulerManager.updateSchedule(id, req.body);
  if (!updated) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan' });

  broadcastToBrowsers({ type: 'SCHEDULES_UPDATE', schedules: schedulerManager.getSchedules() });
  res.json({ success: true, data: updated });
});

// Hapus jadwal
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const success = schedulerManager.deleteSchedule(id);
  if (!success) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan' });

  broadcastToBrowsers({ type: 'SCHEDULES_UPDATE', schedules: schedulerManager.getSchedules() });
  res.json({ success: true, message: 'Jadwal berhasil dihapus' });
});

// Sinkronisasi Manual schedules.json -> SQLite
router.post('/sync-json', (req, res) => {
  const result = db.importSchedulesFromJson();
  if (result.success) {
    schedulerManager.reloadFromDb();
    broadcastToBrowsers({ type: 'SCHEDULES_UPDATE', schedules: schedulerManager.getSchedules() });
    return res.json({ success: true, message: `Berhasil sinkronisasi ${result.count} jadwal dari schedules.json` });
  }
  return res.status(400).json({ success: false, message: result.message || 'Gagal sinkronisasi' });
});

/**
 * Inisialisasi dependensi yang di-inject dari server.js
 */
function init(deps) {
  schedulerManager = deps.schedulerManager;
  db = deps.db;
  broadcastToBrowsers = deps.broadcastToBrowsers;
  requireAuth = deps.requireAuth;

  // Auth sekarang diterapkan di level mount server.js (app.use('/api/schedules', requireAuth, ...))
}

module.exports = { router, init };
