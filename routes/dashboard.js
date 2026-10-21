const express = require('express');
const { db } = require('../db');

const router = express.Router();

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

router.get('/', (req, res) => {
  const students = db.prepare("SELECT COUNT(*) c FROM students WHERE status = 'active'").get().c;
  const faculty = db.prepare("SELECT COUNT(*) c FROM faculty WHERE status = 'active'").get().c;
  const admissions30 = db.prepare("SELECT COUNT(*) c FROM admissions WHERE created_at >= date('now', '-30 day')").get().c;
  const departmentCount = db.prepare('SELECT COUNT(*) c FROM departments').get().c;

  const feeTotals = db.prepare(`
    SELECT COALESCE(SUM(amount),0) billed, COALESCE(SUM(paid_amount),0) collected
    FROM challans`).get();
  const due = feeTotals.billed - feeTotals.collected;

  const att = db.prepare(`
    SELECT COUNT(*) total, SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) attended
    FROM attendance WHERE date >= date('now', '-30 day')`).get();
  const attendanceRate = att.total ? Math.round((att.attended / att.total) * 1000) / 10 : 0;

  const scholarships = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN stage IN ('draft','institute_verified','submitted') THEN 1 ELSE 0 END),0) pending,
      COALESCE(SUM(CASE WHEN stage = 'disbursed' THEN amount ELSE 0 END),0) disbursed,
      COALESCE(SUM(CASE WHEN stage = 'approved' THEN amount ELSE 0 END),0) sanctioned,
      COUNT(*) total
    FROM scholarships`).get();

  const pipelineRows = db.prepare('SELECT stage, COUNT(*) c FROM admissions GROUP BY stage').all();
  const pipeline = { enquiry: 0, applied: 0, verified: 0, approved: 0, enrolled: 0, rejected: 0 };
  for (const r of pipelineRows) pipeline[r.stage] = r.c;

  const byDept = db.prepare(`
    SELECT d.code, d.name, COUNT(s.id) students
    FROM departments d LEFT JOIN students s ON s.department_id = d.id AND s.status = 'active'
    GROUP BY d.id ORDER BY d.id`).all();

  const attByDept = db.prepare(`
    SELECT d.code, COUNT(a.id) total,
      SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) attended
    FROM departments d
    JOIN students s ON s.department_id = d.id
    JOIN attendance a ON a.student_id = s.id AND a.date >= date('now', '-30 day')
    GROUP BY d.id ORDER BY d.id`).all()
    .map(r => ({ code: r.code, rate: r.total ? Math.round((r.attended / r.total) * 1000) / 10 : 0 }));

  const monthly = db.prepare(`
    SELECT substr(paid_on, 1, 7) AS month, SUM(paid_amount) amount
    FROM challans WHERE paid_on IS NOT NULL AND paid_on >= date('now', '-6 month')
    GROUP BY month`).all();
  const feeTrend = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    const found = monthly.find(m => m.month === key);
    feeTrend.push({ month: d.toLocaleString('en-IN', { month: 'short' }), amount: found ? found.amount : 0 });
  }

  const topDues = db.prepare(`
    SELECT s.roll_no, s.name, d.code AS department,
      SUM(c.amount - c.paid_amount) AS due
    FROM challans c JOIN students s ON s.id = c.student_id JOIN departments d ON d.id = s.department_id
    WHERE c.status != 'paid'
    GROUP BY s.id ORDER BY due DESC LIMIT 5`).all();

  const notices = db.prepare(`
    SELECT id, title, category, audience, pinned, created_at FROM notices
    ORDER BY pinned DESC, created_at DESC LIMIT 4`).all();

  const upcomingExams = db.prepare(`
    SELECT e.id, e.name, e.subject, e.exam_date, e.start_time, d.code AS department
    FROM exams e JOIN departments d ON d.id = e.department_id
    WHERE e.exam_date >= date('now') ORDER BY e.exam_date ASC LIMIT 5`).all();

  res.json({
    students, faculty, departmentCount,
    admissions30,
    fees: { billed: feeTotals.billed, collected: feeTotals.collected, due },
    attendanceRate,
    scholarships,
    pipeline,
    byDept,
    attByDept,
    feeTrend,
    topDues,
    notices,
    upcomingExams
  });
});

module.exports = router;
