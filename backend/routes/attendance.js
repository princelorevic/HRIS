const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/auditLog');

const LATE_CUTOFF = '09:00:00'; // adjust to your company's grace period

// POST /api/attendance/time-in
router.post('/time-in', authenticate, async (req, res) => {
  try {
    if (!req.user.employee_id) return res.status(400).json({ message: 'No employee record linked to this account.' });

    const today = new Date().toISOString().slice(0, 10);
    const [existing] = await pool.query('SELECT * FROM attendance WHERE employee_id = ? AND log_date = ?', [req.user.employee_id, today]);
    if (existing.length && existing[0].time_in) {
      return res.status(409).json({ message: 'You already timed in today.' });
    }

    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8);
    const status = timeStr > LATE_CUTOFF ? 'late' : 'present';

    if (existing.length) {
      await pool.query('UPDATE attendance SET time_in = ?, status = ? WHERE attendance_id = ?', [timeStr, status, existing[0].attendance_id]);
    } else {
      await pool.query(
        'INSERT INTO attendance (employee_id, log_date, time_in, status) VALUES (?, ?, ?, ?)',
        [req.user.employee_id, today, timeStr, status]
      );
    }
    res.json({ message: `Timed in at ${timeStr}`, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/attendance/time-out
router.post('/time-out', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [existing] = await pool.query('SELECT * FROM attendance WHERE employee_id = ? AND log_date = ?', [req.user.employee_id, today]);
    if (!existing.length || !existing[0].time_in) {
      return res.status(400).json({ message: 'You have not timed in yet today.' });
    }
    if (existing[0].time_out) {
      return res.status(409).json({ message: 'You already timed out today.' });
    }
    const timeStr = new Date().toTimeString().slice(0, 8);
    await pool.query('UPDATE attendance SET time_out = ? WHERE attendance_id = ?', [timeStr, existing[0].attendance_id]);
    res.json({ message: `Timed out at ${timeStr}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/attendance/today - current user's today status
router.get('/today', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query('SELECT * FROM attendance WHERE employee_id = ? AND log_date = ?', [req.user.employee_id, today]);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/attendance/history?employee_id=&from=&to=&page=&limit=
router.get('/history', authenticate, async (req, res) => {
  try {
    let { employee_id, from, to, page = 1, limit = 30 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    // Employees can only see their own; supervisors/hr can view others
    if (req.user.role === 'employee') employee_id = req.user.employee_id;
    if (!employee_id) return res.status(400).json({ message: 'employee_id is required.' });

    let where = ' WHERE a.employee_id = ? ';
    const params = [employee_id];
    if (from) { where += ' AND a.log_date >= ? '; params.push(from); }
    if (to) { where += ' AND a.log_date <= ? '; params.push(to); }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM attendance a ${where}`, params);
    const [rows] = await pool.query(
      `SELECT a.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name
       FROM attendance a JOIN employees e ON e.employee_id = a.employee_id
       ${where} ORDER BY a.log_date DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ data: rows, pagination: { total: countRows[0].total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/attendance/team - supervisor's team attendance for a given date
router.get('/team', authenticate, authorize('supervisor', 'hr'), async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    let where = ' WHERE 1=1 ';
    const params = [];
    if (req.user.role === 'supervisor') {
      where += ' AND e.supervisor_id = ? ';
      params.push(req.user.employee_id);
    }
    const [rows] = await pool.query(
      `SELECT e.employee_id, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              d.name AS department_name, a.time_in, a.time_out, a.status
       FROM employees e
       LEFT JOIN attendance a ON a.employee_id = e.employee_id AND a.log_date = ?
       LEFT JOIN departments d ON d.department_id = e.department_id
       ${where} AND e.employment_status != 'terminated'
       ORDER BY e.last_name`,
      [date, ...params]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/attendance/monthly-report?year=&month=&department_id=
router.get('/monthly-report', authenticate, authorize('hr', 'supervisor'), async (req, res) => {
  try {
    const { year, month, department_id } = req.query;
    if (!year || !month) return res.status(400).json({ message: 'year and month are required.' });

    let where = ' WHERE YEAR(a.log_date) = ? AND MONTH(a.log_date) = ? ';
    const params = [year, month];
    if (department_id) { where += ' AND e.department_id = ? '; params.push(department_id); }
    if (req.user.role === 'supervisor') { where += ' AND e.supervisor_id = ? '; params.push(req.user.employee_id); }

    const [rows] = await pool.query(
      `SELECT e.employee_id, CONCAT(e.first_name,' ',e.last_name) AS employee_name, d.name AS department_name,
              COUNT(CASE WHEN a.status='present' THEN 1 END) AS present_count,
              COUNT(CASE WHEN a.status='late' THEN 1 END) AS late_count,
              COUNT(CASE WHEN a.status='absent' THEN 1 END) AS absent_count,
              COUNT(CASE WHEN a.status='on-leave' THEN 1 END) AS leave_count
       FROM employees e
       LEFT JOIN attendance a ON a.employee_id = e.employee_id
       LEFT JOIN departments d ON d.department_id = e.department_id
       ${where}
       GROUP BY e.employee_id ORDER BY e.last_name`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
