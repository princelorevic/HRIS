const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/auditLog');

const BASE_SELECT = `
  SELECT e.employee_id, e.employee_code, e.first_name, e.last_name, e.middle_name, e.photo_url,
         e.department_id, d.name AS department_name,
         e.position_id, p.title AS position_title,
         e.supervisor_id, CONCAT(s.first_name, ' ', s.last_name) AS supervisor_name,
         e.employment_status, e.date_hired, e.date_separated,
         e.contact_number, e.address,
         e.emergency_contact_name, e.emergency_contact_number, e.emergency_contact_relation,
         u.user_id, u.username, u.email, u.role, u.is_active
  FROM employees e
  LEFT JOIN departments d ON d.department_id = e.department_id
  LEFT JOIN positions p ON p.position_id = e.position_id
  LEFT JOIN employees s ON s.employee_id = e.supervisor_id
  LEFT JOIN users u ON u.user_id = e.user_id
`;

// GET /api/employees?search=&department_id=&status=&page=1&limit=20
router.get('/', authenticate, authorize('hr', 'supervisor'), async (req, res) => {
  try {
    const { search = '', department_id, status, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    let where = ' WHERE 1=1 ';
    const params = [];

    if (search) {
      where += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_code LIKE ?) `;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (department_id) {
      where += ' AND e.department_id = ? ';
      params.push(department_id);
    }
    if (status) {
      where += ' AND e.employment_status = ? ';
      params.push(status);
    }

    // Supervisors only see their own team
    if (req.user.role === 'supervisor') {
      where += ' AND e.supervisor_id = ? ';
      params.push(req.user.employee_id);
    }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM employees e ${where}`, params);
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `${BASE_SELECT} ${where} ORDER BY e.last_name ASC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({ data: rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching employees.' });
  }
});

// GET /api/employees/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Employees can only view themselves; supervisor/hr can view anyone (route-level nuance kept simple)
    if (req.user.role === 'employee' && req.user.employee_id != req.params.id) {
      return res.status(403).json({ message: 'You can only view your own profile.' });
    }
    const [rows] = await pool.query(`${BASE_SELECT} WHERE e.employee_id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Employee not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/employees  (HR only - creates employee + optional login account)
router.post('/', authenticate, authorize('hr'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      employee_code, first_name, last_name, middle_name, department_id, position_id,
      supervisor_id, employment_status, date_hired, contact_number, address,
      emergency_contact_name, emergency_contact_number, emergency_contact_relation,
      create_login, username, email, password, role
    } = req.body;

    if (!employee_code || !first_name || !last_name || !date_hired) {
      return res.status(400).json({ message: 'Employee code, first name, last name, and date hired are required.' });
    }

    await conn.beginTransaction();

    let userId = null;
    if (create_login) {
      if (!username || !email || !password) {
        await conn.rollback();
        return res.status(400).json({ message: 'Username, email, and password are required to create a login.' });
      }
      const hash = await bcrypt.hash(password, 10);
      const [userResult] = await conn.query(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [username, email, hash, role || 'employee']
      );
      userId = userResult.insertId;
    }

    const [empResult] = await conn.query(
      `INSERT INTO employees
        (employee_code, user_id, first_name, last_name, middle_name, department_id, position_id,
         supervisor_id, employment_status, date_hired, contact_number, address,
         emergency_contact_name, emergency_contact_number, emergency_contact_relation)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [employee_code, userId, first_name, last_name, middle_name || null, department_id || null,
       position_id || null, supervisor_id || null, employment_status || 'probationary', date_hired,
       contact_number || null, address || null, emergency_contact_name || null,
       emergency_contact_number || null, emergency_contact_relation || null]
    );

    await conn.commit();
    await logActivity({ userId: req.user.user_id, action: 'CREATE_EMPLOYEE', entityType: 'employee', entityId: empResult.insertId, ip: req.ip });

    res.status(201).json({ message: 'Employee created.', employee_id: empResult.insertId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Employee code, username, or email already exists.' });
    }
    res.status(500).json({ message: 'Server error creating employee.' });
  } finally {
    conn.release();
  }
});

// PUT /api/employees/:id  (HR only)
router.put('/:id', authenticate, authorize('hr'), async (req, res) => {
  try {
    const fields = [
      'first_name', 'last_name', 'middle_name', 'department_id', 'position_id', 'supervisor_id',
      'employment_status', 'date_hired', 'date_separated', 'contact_number', 'address',
      'emergency_contact_name', 'emergency_contact_number', 'emergency_contact_relation'
    ];
    const updates = [];
    const params = [];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f] === '' ? null : req.body[f]);
      }
    });
    if (!updates.length) return res.status(400).json({ message: 'No fields to update.' });

    params.push(req.params.id);
    await pool.query(`UPDATE employees SET ${updates.join(', ')} WHERE employee_id = ?`, params);
    await logActivity({ userId: req.user.user_id, action: 'UPDATE_EMPLOYEE', entityType: 'employee', entityId: req.params.id, ip: req.ip });

    res.json({ message: 'Employee updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error updating employee.' });
  }
});

// DELETE /api/employees/:id (HR only - soft delete via status)
router.delete('/:id', authenticate, authorize('hr'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE employees SET employment_status = 'terminated', date_separated = CURDATE() WHERE employee_id = ?`,
      [req.params.id]
    );
    await pool.query(
      `UPDATE users u JOIN employees e ON e.user_id = u.user_id SET u.is_active = 0 WHERE e.employee_id = ?`,
      [req.params.id]
    );
    await logActivity({ userId: req.user.user_id, action: 'DEACTIVATE_EMPLOYEE', entityType: 'employee', entityId: req.params.id, ip: req.ip });
    res.json({ message: 'Employee deactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
