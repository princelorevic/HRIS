const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/auditLog');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.username, u.email, u.password_hash, u.role, u.is_active,
              e.employee_id, e.first_name, e.last_name, e.photo_url
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.user_id
       WHERE u.username = ? OR u.email = ?`,
      [username, username]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({ message: 'This account has been deactivated. Contact HR.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const payload = {
      user_id: user.user_id,
      employee_id: user.employee_id,
      username: user.username,
      role: user.role,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim()
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });

    await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id]);
    await logActivity({ userId: user.user_id, action: 'LOGIN', ip: req.ip });

    res.json({
      token,
      user: {
        ...payload,
        photo_url: user.photo_url
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.username, u.email, u.role,
              e.employee_id, e.employee_code, e.first_name, e.last_name, e.photo_url,
              d.name AS department_name, p.title AS position_title
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.user_id
       LEFT JOIN departments d ON d.department_id = e.department_id
       LEFT JOIN positions p ON p.position_id = e.position_id
       WHERE u.user_id = ?`,
      [req.user.user_id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  try {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.user_id]);
    if (!rows.length) return res.status(404).json({ message: 'User not found.' });

    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) return res.status(401).json({ message: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, req.user.user_id]);
    await logActivity({ userId: req.user.user_id, action: 'CHANGE_PASSWORD', ip: req.ip });

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
