const express = require('express');
const { db } = require('../db');
const { requireRole, audit, clean, toId, toInt } = require('../middleware/security');

const router = express.Router();

router.get('/', (req, res) => {
  const deptId = toId(req.query.department_id);
  const semester = toInt(req.query.semester, 1, 8);
  if (!deptId || !semester) return res.status(400).json({ error: 'Department and semester are required' });
  const rows = db.prepare(`
    SELECT * FROM timetable WHERE department_id = ? AND semester = ?
    ORDER BY day_of_week, period`).all(deptId, semester);
  res.json({ rows });
});

router.post('/', requireRole('admin', 'registrar'), (req, res) => {
  const deptId = toId(req.body.department_id);
  const semester = toInt(req.body.semester, 1, 8);
  const day = toInt(req.body.day_of_week, 1, 6);
  const period = toInt(req.body.period, 1, 8);
  const subject = clean(req.body.subject, 100);
  const facultyName = clean(req.body.faculty_name, 100);
  const room = clean(req.body.room, 30);
  if (!deptId || !semester || !day || !period || !subject) {
    return res.status(400).json({ error: 'Department, semester, day, period and subject are required' });
  }
  const info = db.prepare(`INSERT INTO timetable (department_id, semester, day_of_week, period, subject, faculty_name, room)
    VALUES (?,?,?,?,?,?,?)`).run(deptId, semester, day, period, subject, facultyName, room);
  audit(req, 'create', 'timetable', `${subject} on day ${day} period ${period}`);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.delete('/:id', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const row = id && db.prepare('SELECT * FROM timetable WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Timetable entry not found' });
  db.prepare('DELETE FROM timetable WHERE id = ?').run(id);
  audit(req, 'delete', 'timetable', `${row.subject} on day ${row.day_of_week} period ${row.period}`);
  res.json({ ok: true });
});

module.exports = router;
