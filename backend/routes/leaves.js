const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/auditLog');

// GET /api/leaves/types
router.get('/types', authenticate, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM leave_types ORDER BY name');
  res.json(rows);
});

// GET /api/leaves/balance?employee_id=&year=
router.get('/balance', authenticate, async (req, res) => {
  try {
    let { employee_id, year } = req.query;
    if (req.user.role === 'employee') employee_id = req.user.employee_id;
    year = year || new Date().getFullYear();

    // Auto-provision balances from leave_types defaults if missing
    const [types] = await pool.query('SELECT * FROM leave_types');
    for (const t of types) {
      await pool.query(
        `INSERT IGNORE INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
         VALUES (?, ?, ?, ?, 0)`,
        [employee_id, t.leave_type_id, year, t.default_days]
      );
    }

    const [rows] = await pool.query(
      `SELECT lb.*, lt.name AS leave_type_name, (lb.total_days - lb.used_days) AS remaining_days
       FROM leave_balances lb JOIN leave_types lt ON lt.leave_type_id = lb.leave_type_id
       WHERE lb.employee_id = ? AND lb.year = ? ORDER BY lt.name`,
      [employee_id, year]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/leaves/apply
router.post('/apply', authenticate, async (req, res) => {
  try {
    const { leave_type_id, date_from, date_to, reason } = req.body;
    if (!leave_type_id || !date_from || !date_to) {
      return res.status(400).json({ message: 'Leave type, start date, and end date are required.' });
    }
    if (new Date(date_to) < new Date(date_from)) {
      return res.status(400).json({ message: 'End date cannot be before start date.' });
    }

    const totalDays = (new Date(date_to) - new Date(date_from)) / (1000 * 60 * 60 * 24) + 1;

    const [empRows] = await pool.query('SELECT supervisor_id FROM employees WHERE employee_id = ?', [req.user.employee_id]);
    const supervisorId = empRows[0]?.supervisor_id || null;

    const [result] = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type_id, date_from, date_to, total_days, reason, supervisor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.employee_id, leave_type_id, date_from, date_to, totalDays, reason || null, supervisorId]
    );

    if (supervisorId) {
      const [supUser] = await pool.query('SELECT user_id FROM employees WHERE employee_id = ?', [supervisorId]);
      if (supUser[0]?.user_id) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, link) VALUES (?, 'New Leave Request', ?, '/leaves.html')`,
          [supUser[0].user_id, `A leave request is waiting for your approval.`]
        );
      }
    }

    await logActivity({ userId: req.user.user_id, action: 'APPLY_LEAVE', entityType: 'leave_request', entityId: result.insertId, ip: req.ip });
    res.status(201).json({ message: 'Leave request submitted.', leave_request_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error submitting leave request.' });
  }
});

// GET /api/leaves/history?employee_id=&status=&page=&limit=
router.get('/history', authenticate, async (req, res) => {
  try {
    let { employee_id, status, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    if (req.user.role === 'employee') employee_id = req.user.employee_id;

    let where = ' WHERE 1=1 ';
    const params = [];
    if (employee_id) { where += ' AND lr.employee_id = ? '; params.push(employee_id); }
    if (status) { where += ' AND lr.status = ? '; params.push(status); }
    if (req.user.role === 'supervisor' && !employee_id) { where += ' AND lr.supervisor_id = ? '; params.push(req.user.employee_id); }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM leave_requests lr ${where}`, params);
    const [rows] = await pool.query(
      `SELECT lr.*, lt.name AS leave_type_name, CONCAT(e.first_name,' ',e.last_name) AS employee_name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.leave_type_id = lr.leave_type_id
       JOIN employees e ON e.employee_id = lr.employee_id
       ${where} ORDER BY lr.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ data: rows, pagination: { total: countRows[0].total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/leaves/pending-approvals (for supervisor or HR)
router.get('/pending-approvals', authenticate, authorize('supervisor', 'hr'), async (req, res) => {
  try {
    let where, params;
    if (req.user.role === 'supervisor') {
      where = ` WHERE lr.status = 'pending' AND lr.supervisor_id = ? `;
      params = [req.user.employee_id];
    } else {
      where = ` WHERE lr.status = 'supervisor_approved' `;
      params = [];
    }
    const [rows] = await pool.query(
      `SELECT lr.*, lt.name AS leave_type_name, CONCAT(e.first_name,' ',e.last_name) AS employee_name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.leave_type_id = lr.leave_type_id
       JOIN employees e ON e.employee_id = lr.employee_id
       ${where} ORDER BY lr.created_at ASC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/leaves/:id/supervisor-action  { action: 'approve' | 'reject', remarks }
router.put('/:id/supervisor-action', authenticate, authorize('supervisor'), async (req, res) => {
  try {
    const { action, remarks } = req.body;
    const [rows] = await pool.query('SELECT * FROM leave_requests WHERE leave_request_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Leave request not found.' });
    if (rows[0].supervisor_id != req.user.employee_id) return res.status(403).json({ message: 'This is not your team member\'s request.' });
    if (rows[0].status !== 'pending') return res.status(409).json({ message: 'This request has already been actioned.' });

    const newStatus = action === 'approve' ? 'supervisor_approved' : 'rejected';
    await pool.query(
      `UPDATE leave_requests SET status = ?, supervisor_action_at = NOW(), supervisor_remarks = ? WHERE leave_request_id = ?`,
      [newStatus, remarks || null, req.params.id]
    );
    await logActivity({ userId: req.user.user_id, action: `SUPERVISOR_${action.toUpperCase()}_LEAVE`, entityType: 'leave_request', entityId: req.params.id, ip: req.ip });
    res.json({ message: `Leave request ${action === 'approve' ? 'approved' : 'rejected'}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/leaves/:id/hr-action  { action: 'approve' | 'reject', remarks }
router.put('/:id/hr-action', authenticate, authorize('hr'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { action, remarks } = req.body;
    const [rows] = await pool.query('SELECT * FROM leave_requests WHERE leave_request_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Leave request not found.' });
    if (rows[0].status !== 'supervisor_approved') return res.status(409).json({ message: 'This request must be supervisor-approved first.' });

    await conn.beginTransaction();
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await conn.query(
      `UPDATE leave_requests SET status = ?, hr_id = ?, hr_action_at = NOW(), hr_remarks = ? WHERE leave_request_id = ?`,
      [newStatus, req.user.employee_id, remarks || null, req.params.id]
    );

    if (action === 'approve') {
      const req_ = rows[0];
      const year = new Date(req_.date_from).getFullYear();
      await conn.query(
        `UPDATE leave_balances SET used_days = used_days + ? WHERE employee_id = ? AND leave_type_id = ? AND year = ?`,
        [req_.total_days, req_.employee_id, req_.leave_type_id, year]
      );
      // Mark attendance as on-leave for the date range
      let d = new Date(req_.date_from);
      const end = new Date(req_.date_to);
      while (d <= end) {
        const dateStr = d.toISOString().slice(0, 10);
        await conn.query(
          `INSERT INTO attendance (employee_id, log_date, status) VALUES (?, ?, 'on-leave')
           ON DUPLICATE KEY UPDATE status = 'on-leave'`,
          [req_.employee_id, dateStr]
        );
        d.setDate(d.getDate() + 1);
      }
    }

    await conn.commit();
    await logActivity({ userId: req.user.user_id, action: `HR_${action.toUpperCase()}_LEAVE`, entityType: 'leave_request', entityId: req.params.id, ip: req.ip });
    res.json({ message: `Leave request ${action === 'approve' ? 'approved' : 'rejected'}.` });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  } finally {
    conn.release();
  }
});

// PUT /api/leaves/:id/cancel (employee cancels their own pending request)
router.put('/:id/cancel', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM leave_requests WHERE leave_request_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found.' });
    if (rows[0].employee_id != req.user.employee_id) return res.status(403).json({ message: 'Not your request.' });
    if (!['pending', 'supervisor_approved'].includes(rows[0].status)) return res.status(409).json({ message: 'Cannot cancel this request anymore.' });

    await pool.query(`UPDATE leave_requests SET status = 'cancelled' WHERE leave_request_id = ?`, [req.params.id]);
    res.json({ message: 'Leave request cancelled.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
