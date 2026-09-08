const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { documentUpload } = require('../middleware/upload');
const { logActivity } = require('../utils/auditLog');

// GET /api/documents?employee_id=
router.get('/', authenticate, async (req, res) => {
  try {
    let { employee_id, category } = req.query;
    if (req.user.role === 'employee') employee_id = req.user.employee_id;
    if (!employee_id) return res.status(400).json({ message: 'employee_id is required.' });

    let where = ' WHERE d.employee_id = ? ';
    const params = [employee_id];
    if (category) { where += ' AND d.category = ? '; params.push(category); }

    const [rows] = await pool.query(
      `SELECT d.*, u.username AS uploaded_by_username
       FROM documents d LEFT JOIN users u ON u.user_id = d.uploaded_by
       ${where} ORDER BY d.uploaded_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/documents  (HR uploads for any employee; employee can upload their own)
router.post('/', authenticate, documentUpload.single('file'), async (req, res) => {
  try {
    const { employee_id, category } = req.body;
    const targetEmployeeId = req.user.role === 'employee' ? req.user.employee_id : employee_id;

    if (!targetEmployeeId) return res.status(400).json({ message: 'employee_id is required.' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    const relativePath = `/uploads/documents/${req.file.filename}`;
    const [result] = await pool.query(
      `INSERT INTO documents (employee_id, category, file_name, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?)`,
      [targetEmployeeId, category || 'other', req.file.originalname, relativePath, req.user.user_id]
    );

    await logActivity({ userId: req.user.user_id, action: 'UPLOAD_DOCUMENT', entityType: 'document', entityId: result.insertId, ip: req.ip });
    res.status(201).json({ message: 'Document uploaded.', document_id: result.insertId, file_path: relativePath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Server error uploading document.' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM documents WHERE document_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Document not found.' });

    if (req.user.role === 'employee' && rows[0].employee_id != req.user.employee_id) {
      return res.status(403).json({ message: 'You can only delete your own documents.' });
    }

    const filePath = path.join(__dirname, '..', rows[0].file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM documents WHERE document_id = ?', [req.params.id]);
    await logActivity({ userId: req.user.user_id, action: 'DELETE_DOCUMENT', entityType: 'document', entityId: req.params.id, ip: req.ip });
    res.json({ message: 'Document deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
