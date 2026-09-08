// Run with: npm run seed
// Creates the first HR admin account + a linked employee record,
// using SEED_ADMIN_* values from .env

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

async function seed() {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@company.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';

  try {
    const [existing] = await pool.query('SELECT user_id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing.length) {
      console.log(`[Seed] User "${username}" already exists. Skipping.`);
      process.exit(0);
    }

    const hash = await bcrypt.hash(password, 10);
    const [userResult] = await pool.query(
      `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'hr')`,
      [username, email, hash]
    );
    const userId = userResult.insertId;

    const [dept] = await pool.query(`SELECT department_id FROM departments WHERE name = 'Human Resources' LIMIT 1`);
    const [pos] = await pool.query(`SELECT position_id FROM positions WHERE title = 'HR Manager' LIMIT 1`);

    await pool.query(
      `INSERT INTO employees (employee_code, user_id, first_name, last_name, department_id, position_id, employment_status, date_hired)
       VALUES (?, ?, 'System', 'Administrator', ?, ?, 'regular', CURDATE())`,
      ['EMP-0001', userId, dept[0]?.department_id || null, pos[0]?.position_id || null]
    );

    console.log('[Seed] HR admin account created successfully.');
    console.log(`       Username: ${username}`);
    console.log(`       Password: ${password}`);
    console.log('       Please log in and change this password.');
    process.exit(0);
  } catch (err) {
    console.error('[Seed] Failed:', err.message);
    process.exit(1);
  }
}

seed();
