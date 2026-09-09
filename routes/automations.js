// ==========================================
// Automation & Misc Routes - Express Router
// AgyGateway Universal IoT Server
// ==========================================

const express = require('express');
const router = express.Router();

let automationEngine, componentTypes, db, requireAuth;

// --- Smart Automations (IF-THEN Rules) ---

router.get('/automations', (req, res) => {
  const deviceId = req.query.deviceId || null;
  res.json({ success: true, data: automationEngine.getRules(deviceId) });
});

router.post('/automations', (req, res) => {
  try {
    const created = automationEngine.addRule(req.body);
    res.json({ success: true, data: created, message: `Aturan "${created.name}" berhasil dibuat` });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.put('/automations/:id', (req, res) => {
  try {
    const updated = automationEngine.updateRule(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Aturan tidak ditemukan' });
    res.json({ success: true, data: updated, message: `Aturan "${updated.name}" berhasil diperbarui` });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.delete('/automations/:id', (req, res) => {
  const success = automationEngine.deleteRule(req.params.id);
  if (!success) return res.status(404).json({ success: false, message: 'Aturan tidak ditemukan' });
  res.json({ success: true, message: 'Aturan berhasil dihapus' });
});

router.post('/automations/:id/test', (req, res) => {
  const result = automationEngine.testRule(req.params.id);
  res.json(result);
});

// --- Component Types Catalog ---

router.get('/component-types', (req, res) => {
  res.json({ success: true, data: componentTypes.COMPONENT_TYPES });
});

// --- Activity Logs ---

router.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const logs = db.getRecentLogs(limit);
  res.json({ success: true, data: logs });
});

/**
 * Inisialisasi dependensi yang di-inject dari server.js
 */
function init(deps) {
  automationEngine = deps.automationEngine;
  componentTypes = deps.componentTypes;
  db = deps.db;
  requireAuth = deps.requireAuth;

  // Apply requireAuth to all routes (except component-types yang publik)
  router.use((req, res, next) => {
    // /component-types tidak perlu auth
    if (req.path === '/component-types') return next();
    requireAuth(req, res, next);
  });
}

module.exports = { router, init };
