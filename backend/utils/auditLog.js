const pool = require('../config/db');

/**
 * Records an entry in audit_logs. Never throws - a logging failure
 * should never break the actual request.
 */
async function logActivity({ userId, action, entityType = null, entityId = null, details = null, ip = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId || null, action, entityType, entityId, details, ip]
    );
  } catch (err) {
    console.error('[AuditLog] Failed to write audit entry:', err.message);
  }
}

module.exports = { logActivity };
