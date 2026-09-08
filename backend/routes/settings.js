const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logoUpload } = require('../middleware/upload');
const { logActivity } = require('../utils/auditLog');

// GET /api/settings - public (needed to render login page logo before auth)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    rows.forEach((r) => { settings[r.setting_key] = r.setting_value; });
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/settings (HR only) - update company name / primary color
router.put('/', authenticate, authorize('hr'), async (req, res) => {
  try {
    const { company_name, primary_color } = req.body;
    if (company_name) {
      await pool.query('UPDATE settings SET setting_value = ? WHERE setting_key = "company_name"', [company_name]);
    }
    if (primary_color) {
      await pool.query('UPDATE settings SET setting_value = ? WHERE setting_key = "primary_color"', [primary_color]);
    }
    await logActivity({ userId: req.user.user_id, action: 'UPDATE_SETTINGS', ip: req.ip });
    res.json({ message: 'Settings updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/settings/logo (HR only) - upload/replace the logo anytime
router.post('/logo', authenticate, authorize('hr'), logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No logo file uploaded.' });
    const relativePath = `/uploads/logo/${req.file.filename}`;
    await pool.query('UPDATE settings SET setting_value = ? WHERE setting_key = "logo_url"', [relativePath]);
    await logActivity({ userId: req.user.user_id, action: 'UPDATE_LOGO', ip: req.ip });
    res.json({ message: 'Logo updated.', logo_url: relativePath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Server error uploading logo.' });
  }
});

module.exports = router;
