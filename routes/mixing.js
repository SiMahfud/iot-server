// ==========================================
// Mixing Routes - Express Router
// API untuk Auto-Mixing Batch Dosing Hidroponik
// ==========================================

const express = require('express');
const router = express.Router();

let mixingEngine, db, broadcastToBrowsers;

// Ambil semua resep
router.get('/recipes', (req, res) => {
  res.json({ success: true, data: mixingEngine.getRecipes() });
});

// Ambil satu resep by ID
router.get('/recipes/:id', (req, res) => {
  const recipe = mixingEngine.getRecipeById(req.params.id);
  if (!recipe) return res.status(404).json({ success: false, message: 'Resep tidak ditemukan' });
  res.json({ success: true, data: recipe });
});

// Tambah resep baru
router.post('/recipes', (req, res) => {
  const { name, description, deviceId, targetPpm, targetVolume, steps } = req.body;
  if (!name || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ success: false, message: 'Nama dan steps wajib diisi' });
  }
  const recipe = mixingEngine.addRecipe({ name, description, deviceId, targetPpm, targetVolume, steps });
  res.json({ success: true, data: recipe });
});

// Update resep
router.put('/recipes/:id', (req, res) => {
  const updated = mixingEngine.updateRecipe(req.params.id, req.body);
  if (!updated) return res.status(404).json({ success: false, message: 'Resep tidak ditemukan' });
  res.json({ success: true, data: updated });
});

// Hapus resep
router.delete('/recipes/:id', (req, res) => {
  const success = mixingEngine.deleteRecipe(req.params.id);
  if (!success) return res.status(404).json({ success: false, message: 'Resep tidak ditemukan' });
  res.json({ success: true, message: 'Resep berhasil dihapus' });
});

// Ambil kalibrasi pompa
router.get('/calibrations', (req, res) => {
  res.json({ success: true, data: mixingEngine.getCalibrations() });
});

// Set kalibrasi pompa
router.post('/calibrations', (req, res) => {
  const { componentId, flowRate, label } = req.body;
  if (!componentId || !flowRate) {
    return res.status(400).json({ success: false, message: 'componentId dan flowRate wajib diisi' });
  }
  const cal = mixingEngine.setCalibration(componentId, flowRate, label);
  res.json({ success: true, data: cal });
});

// Status proses pencampuran aktif
router.get('/status', (req, res) => {
  res.json({ success: true, data: mixingEngine.getStatus() });
});

// Mulai pencampuran dari resep tersimpan
router.post('/start', (req, res) => {
  const { recipeId, deviceId, steps } = req.body;

  let result;
  if (recipeId) {
    // Jalankan dari resep tersimpan
    result = mixingEngine.startJob(recipeId, deviceId);
  } else if (Array.isArray(steps)) {
    // Jalankan dari langkah manual (one-shot)
    result = mixingEngine.startJob(steps, deviceId);
  } else {
    return res.status(400).json({ success: false, message: 'recipeId atau steps wajib diisi' });
  }

  if (result.success) {
    return res.json(result);
  }
  return res.status(400).json(result);
});

// Emergency Stop
router.post('/stop', (req, res) => {
  const result = mixingEngine.stopJob();
  if (result.success) {
    return res.json(result);
  }
  return res.status(400).json(result);
});

/**
 * Inisialisasi dependensi
 */
function init(deps) {
  mixingEngine = deps.mixingEngine;
  db = deps.db;
  broadcastToBrowsers = deps.broadcastToBrowsers;
}

module.exports = { router, init };
