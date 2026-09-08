const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/audit-logs?action=&user_id=&from=&to=&page=&limit=
router.get('/', authenticate, authorize('hr'), async (req, res) => {
  try {
    const { action, user_id, from, to, page = 1, limit = 30 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    let where = ' WHERE 1=1 ';
    const params = [];
    if (action) { where += ' AND a.action LIKE ? '; params.push(`%${action}%`); }
    if (user_id) { where += ' AND a.user_id = ? '; params.push(user_id); }
    if (from) { where += ' AND a.created_at >= ? '; params.push(from); }
    if (to) { where += ' AND a.created_at <= ? '; params.push(to); }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs a ${where}`, params);
    const [rows] = await pool.query(
      `SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
       ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ data: rows, pagination: { total: countRows[0].total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
