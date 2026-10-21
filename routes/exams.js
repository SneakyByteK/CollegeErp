const express = require('express');
const { db } = require('../db');
const { requireRole, audit, clean, toId, toInt, money } = require('../middleware/security');

const router = express.Router();

function gradeFor(percent) {
  if (percent >= 90) return 'O';
  if (percent >= 80) return 'A+';
  if (percent >= 70) return 'A';
  if (percent >= 60) return 'B+';
  if (percent >= 50) return 'B';
  if (percent >= 40) return 'C';
  return 'F';
}

router.get('/', (req, res) => {
  const deptId = toId(req.query.department_id);
  const semester = toInt(req.query.semester, 1, 8);
  const where = [];
  const params = [];
  if (deptId) { where.push('e.department_id = ?'); params.push(deptId); }
  if (semester) { where.push('e.semester = ?'); params.push(semester); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT e.*, d.code AS dept_code,
      (SELECT COUNT(*) FROM marks m WHERE m.exam_id = e.id) AS marks_entered,
      (SELECT COUNT(*) FROM students s WHERE s.department_id = e.department_id AND s.semester = e.semester AND s.status = 'active') AS student_count
    FROM exams e JOIN departments d ON d.id = e.department_id
    ${whereSql}
    ORDER BY e.exam_date DESC, e.id DESC LIMIT 200`).all(...params);
  res.json({ rows });
});

router.post('/', requireRole('admin', 'registrar'), (req, res) => {
  const name = clean(req.body.name, 100);
  const deptId = toId(req.body.department_id);
  const semester = toInt(req.body.semester, 1, 8);
  const subject = clean(req.body.subject, 100);
  const maxMarks = toInt(req.body.max_marks, 1, 200, 100);
  const examDate = clean(req.body.exam_date, 10);
  const startTime = clean(req.body.start_time, 5);
  const duration = toInt(req.body.duration_min, 15, 300, 90);
  if (!name || !deptId || !semester || !subject) {
    return res.status(400).json({ error: 'Exam name, department, semester and subject are required' });
  }
  if (examDate && !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return res.status(400).json({ error: 'Invalid exam date' });
  if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) return res.status(400).json({ error: 'Invalid start time' });

  const info = db.prepare(`INSERT INTO exams (name, department_id, semester, subject, max_marks, exam_date, start_time, duration_min)
    VALUES (?,?,?,?,?,?,?,?)`).run(name, deptId, semester, subject, maxMarks, examDate, startTime, duration);
  audit(req, 'create', 'exam', `${name} - ${subject}`);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.post('/:id/publish', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const exam = id && db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  db.prepare('UPDATE exams SET published = 1 WHERE id = ?').run(id);
  audit(req, 'publish', 'exam', `${exam.name} - ${exam.subject}`);
  res.json({ ok: true });
});

router.get('/:id/marks', (req, res) => {
  const id = toId(req.params.id);
  const exam = id && db.prepare(`
    SELECT e.*, d.code AS dept_code, d.name AS department FROM exams e
    JOIN departments d ON d.id = e.department_id WHERE e.id = ?`).get(id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const rows = db.prepare(`
    SELECT s.id, s.roll_no, s.name, m.marks_obtained
    FROM students s
    LEFT JOIN marks m ON m.student_id = s.id AND m.exam_id = ?
    WHERE s.department_id = ? AND s.semester = ? AND s.status = 'active'
    ORDER BY s.roll_no`).all(id, exam.department_id, exam.semester);
  res.json({ exam, rows });
});

router.post('/:id/marks', requireRole('admin', 'registrar', 'faculty'), (req, res) => {
  const id = toId(req.params.id);
  const exam = id && db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const records = Array.isArray(req.body.records) ? req.body.records : null;
  if (!records || records.length === 0 || records.length > 300) {
    return res.status(400).json({ error: 'Invalid marks records' });
  }
  const validStudent = db.prepare('SELECT id FROM students WHERE id = ?');
  const upsert = db.prepare(`
    INSERT INTO marks (exam_id, student_id, marks_obtained) VALUES (?,?,?)
    ON CONFLICT (exam_id, student_id) DO UPDATE SET marks_obtained = excluded.marks_obtained`);
  let saved = 0;
  const tx = db.transaction(() => {
    for (const rec of records) {
      const studentId = toId(rec.student_id);
      if (!studentId || !validStudent.get(studentId)) continue;
      if (rec.marks_obtained === null || rec.marks_obtained === '') {
        upsert.run(id, studentId, null);
        saved += 1;
        continue;
      }
      const value = money(rec.marks_obtained, 0, exam.max_marks);
      if (value === null) continue;
      upsert.run(id, studentId, value);
      saved += 1;
    }
  });
  tx();
  if (!saved) return res.status(400).json({ error: 'No valid marks were submitted' });
  audit(req, 'marks', 'exam', `${exam.name} - ${exam.subject}: ${saved} entries`);
  res.json({ ok: true, saved });
});

router.get('/results/list', (req, res) => {
  const deptId = toId(req.query.department_id);
  const semester = toInt(req.query.semester, 1, 8);
  if (!deptId || !semester) return res.status(400).json({ error: 'Department and semester are required' });
  const rows = db.prepare(`
    SELECT e.id AS exam_id, e.name AS exam_name, e.subject, e.max_marks,
      s.roll_no, s.name AS student_name, m.marks_obtained
    FROM exams e
    JOIN marks m ON m.exam_id = e.id
    JOIN students s ON s.id = m.student_id
    WHERE e.department_id = ? AND e.semester = ? AND e.published = 1
    ORDER BY e.subject, s.roll_no`).all(deptId, semester)
    .map(r => {
      const pct = r.marks_obtained === null ? null : Math.round((r.marks_obtained / r.max_marks) * 1000) / 10;
      return { ...r, percent: pct, grade: pct === null ? '-' : gradeFor(pct) };
    });
  const subjects = db.prepare(`
    SELECT e.subject, e.max_marks, e.name,
      ROUND(AVG(m.marks_obtained), 1) AS average,
      COUNT(m.id) AS entries
    FROM exams e JOIN marks m ON m.exam_id = e.id
    WHERE e.department_id = ? AND e.semester = ? AND e.published = 1
    GROUP BY e.id ORDER BY e.subject`).all(deptId, semester);
  res.json({ rows, subjects });
});

module.exports = router;
