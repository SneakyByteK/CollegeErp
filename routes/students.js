const express = require('express');
const { db } = require('../db');
const { requireRole, audit, clean, toId, toInt, oneOf } = require('../middleware/security');

const router = express.Router();

function validateStudent(body, existing = {}) {
  const data = {
    roll_no: clean(body.roll_no ?? existing.roll_no, 30).toUpperCase(),
    name: clean(body.name ?? existing.name, 100),
    email: clean(body.email ?? existing.email, 120).toLowerCase(),
    phone: clean(body.phone ?? existing.phone, 20),
    gender: oneOf(body.gender ?? existing.gender, ['Male', 'Female', 'Other'], existing.gender || 'Other'),
    dob: clean(body.dob ?? existing.dob, 10),
    department_id: toId(body.department_id ?? existing.department_id),
    program: clean(body.program ?? existing.program, 40),
    semester: toInt(body.semester ?? existing.semester, 1, 8),
    batch_year: toInt(body.batch_year ?? existing.batch_year, 2000, 2100),
    status: oneOf(body.status ?? existing.status, ['active', 'graduated', 'dropped'], existing.status || 'active'),
    guardian_name: clean(body.guardian_name ?? existing.guardian_name, 100),
    guardian_phone: clean(body.guardian_phone ?? existing.guardian_phone, 20),
    address: clean(body.address ?? existing.address, 300),
    category: oneOf(body.category ?? existing.category, ['OPEN', 'OBC', 'SC', 'ST', 'EWT', 'EWS', 'VJNT', 'NT', 'SBC', 'Minority'], existing.category || 'OPEN'),
    admission_date: clean(body.admission_date ?? existing.admission_date, 10)
  };
  const errors = [];
  if (data.roll_no.length < 2) errors.push('Roll number is required');
  if (data.name.length < 2) errors.push('Student name is required');
  if (!data.department_id) errors.push('Department is required');
  if (!data.program) errors.push('Program is required');
  if (!data.semester) errors.push('Semester must be between 1 and 8');
  if (!data.batch_year) errors.push('Batch year is required');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Email is invalid');
  if (data.department_id && !db.prepare('SELECT id FROM departments WHERE id = ?').get(data.department_id)) {
    errors.push('Department does not exist');
  }
  return { data, errors };
}

router.get('/', (req, res) => {
  const q = clean(req.query.q, 80);
  const dept = toId(req.query.department_id);
  const sem = toInt(req.query.semester, 1, 8);
  const status = oneOf(req.query.status, ['active', 'graduated', 'dropped']);
  const page = toInt(req.query.page, 1, 100000) || 1;
  const pageSize = toInt(req.query.pageSize, 1, 100) || 20;

  const where = [];
  const params = [];
  if (q) {
    where.push('(s.name LIKE ? OR s.roll_no LIKE ? OR s.email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (dept) { where.push('s.department_id = ?'); params.push(dept); }
  if (sem) { where.push('s.semester = ?'); params.push(sem); }
  if (status) { where.push('s.status = ?'); params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) c FROM students s ${whereSql}`).get(...params).c;
  const rows = db.prepare(`
    SELECT s.*, d.name AS department, d.code AS dept_code,
      (SELECT COALESCE(SUM(c.amount - c.paid_amount),0) FROM challans c
       WHERE c.student_id = s.id AND c.status != 'paid') AS due_amount
    FROM students s JOIN departments d ON d.id = s.department_id
    ${whereSql}
    ORDER BY s.name LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);

  res.json({ rows, total, page, pageSize });
});

router.get('/:id', (req, res) => {
  const id = toId(req.params.id);
  const student = id && db.prepare(`
    SELECT s.*, d.name AS department, d.code AS dept_code
    FROM students s JOIN departments d ON d.id = s.department_id WHERE s.id = ?`).get(id);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const challans = db.prepare('SELECT * FROM challans WHERE student_id = ? ORDER BY created_at DESC').all(id);
  const attendance = db.prepare(`
    SELECT subject, COUNT(*) AS total,
      SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS attended
    FROM attendance WHERE student_id = ? GROUP BY subject ORDER BY subject`).all(id)
    .map(r => ({ ...r, percent: r.total ? Math.round((r.attended / r.total) * 1000) / 10 : 0 }));

  const scholarships = db.prepare(`
    SELECT id, scheme, academic_year, mahabdt_app_no, stage, amount
    FROM scholarships WHERE student_id = ? ORDER BY created_at DESC`).all(id);

  const results = db.prepare(`
    SELECT e.name AS exam, e.subject, e.max_marks, e.published, m.marks_obtained
    FROM marks m JOIN exams e ON e.id = m.exam_id
    WHERE m.student_id = ? AND e.published = 1 ORDER BY e.subject`).all(id);

  res.json({ student, challans, attendance, scholarships, results });
});

router.post('/', requireRole('admin', 'registrar'), (req, res) => {
  const { data, errors } = validateStudent(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  if (db.prepare('SELECT id FROM students WHERE roll_no = ?').get(data.roll_no)) {
    return res.status(409).json({ error: 'A student with this roll number already exists' });
  }
  const info = db.prepare(`INSERT INTO students
    (roll_no, name, email, phone, gender, dob, department_id, program, semester, batch_year, status,
     guardian_name, guardian_phone, address, category, admission_date)
    VALUES (@roll_no, @name, @email, @phone, @gender, @dob, @department_id, @program, @semester, @batch_year, @status,
     @guardian_name, @guardian_phone, @address, @category, @admission_date)`).run(data);
  audit(req, 'create', 'student', `${data.roll_no} - ${data.name}`);
  const row = db.prepare('SELECT s.*, d.name AS department FROM students s JOIN departments d ON d.id = s.department_id WHERE s.id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json({ student: row });
});

router.put('/:id', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const existing = id && db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Student not found' });
  const { data, errors } = validateStudent(req.body, existing);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  const dup = db.prepare('SELECT id FROM students WHERE roll_no = ? AND id != ?').get(data.roll_no, id);
  if (dup) return res.status(409).json({ error: 'A student with this roll number already exists' });

  db.prepare(`UPDATE students SET roll_no=@roll_no, name=@name, email=@email, phone=@phone, gender=@gender,
    dob=@dob, department_id=@department_id, program=@program, semester=@semester, batch_year=@batch_year,
    status=@status, guardian_name=@guardian_name, guardian_phone=@guardian_phone, address=@address,
    category=@category, admission_date=@admission_date WHERE id=@id`).run({ ...data, id });
  audit(req, 'update', 'student', `${data.roll_no} - ${data.name}`);
  const row = db.prepare('SELECT s.*, d.name AS department FROM students s JOIN departments d ON d.id = s.department_id WHERE s.id = ?').get(id);
  res.json({ student: row });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = toId(req.params.id);
  const existing = id && db.prepare('SELECT roll_no, name FROM students WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Student not found' });
  db.prepare('DELETE FROM students WHERE id = ?').run(id);
  audit(req, 'delete', 'student', `${existing.roll_no} - ${existing.name}`);
  res.json({ ok: true });
});

module.exports = router;
