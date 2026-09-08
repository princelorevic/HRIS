const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/auditLog');

// GET /api/reports/employees/excel
router.get('/employees/excel', authenticate, authorize('hr'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.employee_code, e.first_name, e.last_name, d.name AS department, p.title AS position,
              e.employment_status, e.date_hired, e.contact_number
       FROM employees e
       LEFT JOIN departments d ON d.department_id = e.department_id
       LEFT JOIN positions p ON p.position_id = e.position_id
       ORDER BY e.last_name`
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employees');
    sheet.columns = [
      { header: 'Employee Code', key: 'employee_code', width: 16 },
      { header: 'First Name', key: 'first_name', width: 18 },
      { header: 'Last Name', key: 'last_name', width: 18 },
      { header: 'Department', key: 'department', width: 22 },
      { header: 'Position', key: 'position', width: 22 },
      { header: 'Status', key: 'employment_status', width: 16 },
      { header: 'Date Hired', key: 'date_hired', width: 14 },
      { header: 'Contact Number', key: 'contact_number', width: 16 }
    ];
    sheet.getRow(1).font = { bold: true };
    rows.forEach((r) => sheet.addRow(r));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=employees_report.xlsx');
    await logActivity({ userId: req.user.user_id, action: 'EXPORT_EMPLOYEES_EXCEL', ip: req.ip });
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error generating report.' });
  }
});

// GET /api/reports/attendance/excel?year=&month=
router.get('/attendance/excel', authenticate, authorize('hr', 'supervisor'), async (req, res) => {
  try {
    const { year, month } = req.query;
    let where = ' WHERE 1=1 ';
    const params = [];
    if (year && month) {
      where += ' AND YEAR(a.log_date) = ? AND MONTH(a.log_date) = ? ';
      params.push(year, month);
    }
    if (req.user.role === 'supervisor') { where += ' AND e.supervisor_id = ? '; params.push(req.user.employee_id); }

    const [rows] = await pool.query(
      `SELECT CONCAT(e.first_name,' ',e.last_name) AS employee_name, d.name AS department,
              a.log_date, a.time_in, a.time_out, a.status
       FROM attendance a
       JOIN employees e ON e.employee_id = a.employee_id
       LEFT JOIN departments d ON d.department_id = e.department_id
       ${where} ORDER BY a.log_date, e.last_name`,
      params
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Attendance');
    sheet.columns = [
      { header: 'Employee', key: 'employee_name', width: 24 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Date', key: 'log_date', width: 14 },
      { header: 'Time In', key: 'time_in', width: 12 },
      { header: 'Time Out', key: 'time_out', width: 12 },
      { header: 'Status', key: 'status', width: 12 }
    ];
    sheet.getRow(1).font = { bold: true };
    rows.forEach((r) => sheet.addRow(r));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.xlsx');
    await logActivity({ userId: req.user.user_id, action: 'EXPORT_ATTENDANCE_EXCEL', ip: req.ip });
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error generating report.' });
  }
});

// GET /api/reports/leaves/pdf?year=
router.get('/leaves/pdf', authenticate, authorize('hr'), async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const [rows] = await pool.query(
      `SELECT CONCAT(e.first_name,' ',e.last_name) AS employee_name, lt.name AS leave_type,
              lr.date_from, lr.date_to, lr.total_days, lr.status
       FROM leave_requests lr
       JOIN employees e ON e.employee_id = lr.employee_id
       JOIN leave_types lt ON lt.leave_type_id = lr.leave_type_id
       WHERE YEAR(lr.date_from) = ?
       ORDER BY e.last_name, lr.date_from`,
      [year]
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=leave_report_${year}.pdf`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text(`Leave Report - ${year}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(9);

    const colX = [40, 180, 280, 360, 440, 500];
    const headers = ['Employee', 'Leave Type', 'From', 'To', 'Days', 'Status'];
    headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { continued: i < headers.length - 1 }));
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.3);

    rows.forEach((r) => {
      const y = doc.y;
      doc.text(r.employee_name, colX[0], y, { width: 130 });
      doc.text(r.leave_type, colX[1], y, { width: 90 });
      doc.text(String(r.date_from), colX[2], y, { width: 70 });
      doc.text(String(r.date_to), colX[3], y, { width: 70 });
      doc.text(String(r.total_days), colX[4], y, { width: 50 });
      doc.text(r.status, colX[5], y, { width: 60 });
      doc.moveDown();
    });

    await logActivity({ userId: req.user.user_id, action: 'EXPORT_LEAVES_PDF', ip: req.ip });
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error generating report.' });
  }
});

module.exports = router;
