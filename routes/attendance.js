const express = require('express');
const { db } = require('../db');
const { requireRole, audit, clean, toId, toInt, oneOf } = require('../middleware/security');

const router = express.Router();

function validDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

router.get('/meta', (req, res) => {
  const deptId = toId(req.query.department_id);
  const semester = toInt(req.query.semester, 1, 8);
  if (!deptId || !semester) return res.json({ subjects: [] });
  const rows = db.prepare(`
    SELECT DISTINCT subject FROM timetable WHERE department_id = ? AND semester = ?
    UNION
    SELECT DISTINCT a.subject FROM attendance a JOIN students s ON s.id = a.student_id
    WHERE s.department_id = ? AND s.semester = ?
    ORDER BY subject`).all(deptId, semester, deptId, semester);
  res.json({ subjects: rows.map(r => r.subject) });
});

router.get('/roster', (req, res) => {
  const deptId = toId(req.query.department_id);
  const semester = toInt(req.query.semester, 1, 8);
  const subject = clean(req.query.subject, 100);
  const date = clean(req.query.date, 10);
  if (!deptId || !semester || !subject) return res.status(400).json({ error: 'Department, semester and subject are required' });
  if (!validDate(date)) return res.status(400).json({ error: 'A valid date (YYYY-MM-DD) is required' });

  const rows = db.prepare(`
    SELECT s.id, s.roll_no, s.name, a.status
    FROM students s
    LEFT JOIN attendance a ON a.student_id = s.id AND a.subject = ? AND a.date = ?
    WHERE s.department_id = ? AND s.semester = ? AND s.status = 'active'
    ORDER BY s.roll_no`).all(subject, date, deptId, semester);
  res.json({ rows, subject, date });
});

router.get('/summary', (req, res) => {
  const deptId = toId(req.query.department_id);
  const semester = toInt(req.query.semester, 1, 8);
  const subject = clean(req.query.subject, 100);
  if (!deptId || !semester) return res.status(400).json({ error: 'Department and semester are required' });

  const params = [];
  let subjectClause = '';
  if (subject) { subjectClause = 'AND a.subject = ?'; params.push(subject); }
  params.push(deptId, semester);

  const rows = db.prepare(`
    SELECT s.id, s.roll_no, s.name,
      COUNT(a.id) AS total,
      COALESCE(SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END),0) AS attended
    FROM students s
    LEFT JOIN attendance a ON a.student_id = s.id ${subjectClause}
    WHERE s.department_id = ? AND s.semester = ? AND s.status = 'active'
    GROUP BY s.id ORDER BY s.roll_no`).all(...params);
  res.json({ rows: rows.map(r => ({ ...r, percent: r.total ? Math.round((r.attended / r.total) * 1000) / 10 : 0, shortage: r.total > 0 && r.attended / r.total < 0.75 })) });
});

router.post('/mark', requireRole('admin', 'registrar', 'faculty'), (req, res) => {
  const date = clean(req.body.date, 10);
  const subject = clean(req.body.subject, 100);
  const records = Array.isArray(req.body.records) ? req.body.records : null;
  if (!validDate(date)) return res.status(400).json({ error: 'A valid date is required' });
  if (!subject) return res.status(400).json({ error: 'Subject is required' });
  if (!records || records.length === 0 || records.length > 300) return res.status(400).json({ error: 'Invalid attendance records' });

  const validStudent = db.prepare('SELECT id FROM students WHERE id = ?');
  const upsert = db.prepare(`
    INSERT INTO attendance (student_id, subject, date, status, marked_by) VALUES (?,?,?,?,?)
    ON CONFLICT (student_id, subject, date) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by`);

  let saved = 0;
  const tx = db.transaction(() => {
    for (const rec of records) {
      const studentId = toId(rec.student_id);
      const status = oneOf(rec.status, ['present', 'absent', 'late']);
      if (!studentId || !status || !validStudent.get(studentId)) continue;
      upsert.run(studentId, subject, date, status, req.user.id);
      saved += 1;
    }
  });
  tx();
  if (!saved) return res.status(400).json({ error: 'No valid records were submitted' });
  audit(req, 'mark', 'attendance', `${subject} on ${date}: ${saved} students`);
  res.json({ ok: true, saved });
});

module.exports = router;
