const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/dashboard/summary - HR/admin dashboard
router.get('/summary', authenticate, authorize('hr'), async (req, res) => {
  try {
    const [[totalEmployees]] = await pool.query(`SELECT COUNT(*) AS count FROM employees WHERE employment_status != 'terminated'`);
    const [[activeEmployees]] = await pool.query(`SELECT COUNT(*) AS count FROM employees WHERE employment_status = 'regular'`);
    const [[probationary]] = await pool.query(`SELECT COUNT(*) AS count FROM employees WHERE employment_status = 'probationary'`);
    const [[onLeaveToday]] = await pool.query(`SELECT COUNT(*) AS count FROM attendance WHERE log_date = CURDATE() AND status = 'on-leave'`);
    const [[presentToday]] = await pool.query(`SELECT COUNT(*) AS count FROM attendance WHERE log_date = CURDATE() AND status IN ('present','late')`);
    const [[pendingLeaves]] = await pool.query(`SELECT COUNT(*) AS count FROM leave_requests WHERE status IN ('pending','supervisor_approved')`);
    const [[newHiresThisMonth]] = await pool.query(
      `SELECT COUNT(*) AS count FROM employees WHERE MONTH(date_hired) = MONTH(CURDATE()) AND YEAR(date_hired) = YEAR(CURDATE())`
    );

    const [byDepartment] = await pool.query(
      `SELECT d.name AS department_name, COUNT(e.employee_id) AS count
       FROM departments d LEFT JOIN employees e ON e.department_id = d.department_id AND e.employment_status != 'terminated'
       GROUP BY d.department_id ORDER BY d.name`
    );

    const [recentActivity] = await pool.query(
      `SELECT a.action, a.details, a.created_at, u.username
       FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
       ORDER BY a.created_at DESC LIMIT 10`
    );

    res.json({
      total_employees: totalEmployees.count,
      active_employees: activeEmployees.count,
      probationary_employees: probationary.count,
      on_leave_today: onLeaveToday.count,
      present_today: presentToday.count,
      pending_leave_requests: pendingLeaves.count,
      new_hires_this_month: newHiresThisMonth.count,
      by_department: byDepartment,
      recent_activity: recentActivity
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/dashboard/my-summary - employee/supervisor personal dashboard
router.get('/my-summary', authenticate, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    const year = new Date().getFullYear();

    const [balances] = await pool.query(
      `SELECT lt.name, (lb.total_days - lb.used_days) AS remaining
       FROM leave_balances lb JOIN leave_types lt ON lt.leave_type_id = lb.leave_type_id
       WHERE lb.employee_id = ? AND lb.year = ?`,
      [employeeId, year]
    );

    const [[attendanceThisMonth]] = await pool.query(
      `SELECT COUNT(CASE WHEN status IN ('present','late') THEN 1 END) AS present_days,
              COUNT(CASE WHEN status = 'late' THEN 1 END) AS late_days,
              COUNT(CASE WHEN status = 'absent' THEN 1 END) AS absent_days
       FROM attendance WHERE employee_id = ? AND MONTH(log_date) = MONTH(CURDATE()) AND YEAR(log_date) = YEAR(CURDATE())`,
      [employeeId]
    );

    const [[pendingOwnLeaves]] = await pool.query(
      `SELECT COUNT(*) AS count FROM leave_requests WHERE employee_id = ? AND status IN ('pending','supervisor_approved')`,
      [employeeId]
    );

    let teamPending = null;
    if (req.user.role === 'supervisor') {
      const [[row]] = await pool.query(
        `SELECT COUNT(*) AS count FROM leave_requests WHERE supervisor_id = ? AND status = 'pending'`,
        [employeeId]
      );
      teamPending = row.count;
    }

    res.json({
      leave_balances: balances,
      attendance_this_month: attendanceThisMonth,
      pending_own_leaves: pendingOwnLeaves.count,
      team_pending_approvals: teamPending
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
