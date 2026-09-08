const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hris_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

// Quick sanity check on boot
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('[DB] Connected to MySQL database:', process.env.DB_NAME);
    conn.release();
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    console.error('     Check your .env DB_HOST / DB_USER / DB_PASSWORD / DB_NAME values,');
    console.error('     and make sure you ran database/schema.sql in MySQL Workbench first.');
  }
})();

module.exports = pool;
