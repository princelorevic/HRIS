const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/auditLog');

/* ---------------- DEPARTMENTS ---------------- */

router.get('/departments', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, COUNT(e.employee_id) AS employee_count
       FROM departments d
       LEFT JOIN employees e ON e.department_id = d.department_id AND e.employment_status != 'terminated'
       GROUP BY d.department_id ORDER BY d.name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/departments', authenticate, authorize('hr'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Department name is required.' });
    const [result] = await pool.query('INSERT INTO departments (name, description) VALUES (?, ?)', [name, description || null]);
    await logActivity({ userId: req.user.user_id, action: 'CREATE_DEPARTMENT', entityType: 'department', entityId: result.insertId, ip: req.ip });
    res.status(201).json({ message: 'Department created.', department_id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Department already exists.' });
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/departments/:id', authenticate, authorize('hr'), async (req, res) => {
  try {
    const { name, description } = req.body;
    await pool.query('UPDATE departments SET name = ?, description = ? WHERE department_id = ?', [name, description || null, req.params.id]);
    res.json({ message: 'Department updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/departments/:id', authenticate, authorize('hr'), async (req, res) => {
  try {
    await pool.query('DELETE FROM departments WHERE department_id = ?', [req.params.id]);
    res.json({ message: 'Department deleted.' });
  } catch (err) {
    res.status(409).json({ message: 'Cannot delete: department is still in use.' });
  }
});

/* ---------------- POSITIONS ---------------- */

router.get('/positions', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, d.name AS department_name FROM positions p
       LEFT JOIN departments d ON d.department_id = p.department_id
       ORDER BY p.title`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/positions', authenticate, authorize('hr'), async (req, res) => {
  try {
    const { title, department_id } = req.body;
    if (!title) return res.status(400).json({ message: 'Position title is required.' });
    const [result] = await pool.query('INSERT INTO positions (title, department_id) VALUES (?, ?)', [title, department_id || null]);
    await logActivity({ userId: req.user.user_id, action: 'CREATE_POSITION', entityType: 'position', entityId: result.insertId, ip: req.ip });
    res.status(201).json({ message: 'Position created.', position_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/positions/:id', authenticate, authorize('hr'), async (req, res) => {
  try {
    const { title, department_id } = req.body;
    await pool.query('UPDATE positions SET title = ?, department_id = ? WHERE position_id = ?', [title, department_id || null, req.params.id]);
    res.json({ message: 'Position updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/positions/:id', authenticate, authorize('hr'), async (req, res) => {
  try {
    await pool.query('DELETE FROM positions WHERE position_id = ?', [req.params.id]);
    res.json({ message: 'Position deleted.' });
  } catch (err) {
    res.status(409).json({ message: 'Cannot delete: position is still in use.' });
  }
});

/* ---------------- HIERARCHY ---------------- */

// GET /api/organization/hierarchy - simple org tree grouped by department -> supervisors -> reports
router.get('/hierarchy', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.employee_id, e.first_name, e.last_name, e.supervisor_id, e.department_id,
              d.name AS department_name, p.title AS position_title
       FROM employees e
       LEFT JOIN departments d ON d.department_id = e.department_id
       LEFT JOIN positions p ON p.position_id = e.position_id
       WHERE e.employment_status != 'terminated'
       ORDER BY d.name, e.last_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
