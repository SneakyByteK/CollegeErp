const express = require('express');
const { db } = require('../db');
const { requireRole, audit, clean, toId, toInt, oneOf } = require('../middleware/security');

const router = express.Router();

const STAGES = ['enquiry', 'applied', 'verified', 'approved', 'enrolled', 'rejected'];

function nextApplicationNo() {
  const year = new Date().getFullYear();
  let n = db.prepare("SELECT COUNT(*) c FROM admissions WHERE application_no LIKE ?").get(`APP-${year}-%`).c + 1;
  let no = `APP-${year}-${String(n).padStart(4, '0')}`;
  while (db.prepare('SELECT id FROM admissions WHERE application_no = ?').get(no)) {
    n += 1;
    no = `APP-${year}-${String(n).padStart(4, '0')}`;
  }
  return no;
}

function nextRollNo(deptCode) {
  const year = new Date().getFullYear();
  const prefix = `${deptCode}${year}`;
  let n = db.prepare('SELECT COUNT(*) c FROM students WHERE roll_no LIKE ?').get(`${prefix}%`).c + 1;
  let roll = `${prefix}${String(n).padStart(3, '0')}`;
  while (db.prepare('SELECT id FROM students WHERE roll_no = ?').get(roll)) {
    n += 1;
    roll = `${prefix}${String(n).padStart(3, '0')}`;
  }
  return roll;
}

router.get('/', (req, res) => {
  const q = clean(req.query.q, 80);
  const stage = oneOf(req.query.stage, STAGES);
  const dept = toId(req.query.department_id);
  const where = [];
  const params = [];
  if (q) {
    where.push('(a.name LIKE ? OR a.application_no LIKE ? OR a.email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (stage) { where.push('a.stage = ?'); params.push(stage); }
  if (dept) { where.push('a.department_id = ?'); params.push(dept); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT a.*, d.code AS dept_code, d.name AS department
    FROM admissions a LEFT JOIN departments d ON d.id = a.department_id
    ${whereSql}
    ORDER BY a.created_at DESC, a.id DESC LIMIT 300`).all(...params);

  const counts = { enquiry: 0, applied: 0, verified: 0, approved: 0, enrolled: 0, rejected: 0 };
  for (const r of db.prepare('SELECT stage, COUNT(*) c FROM admissions GROUP BY stage').all()) counts[r.stage] = r.c;

  res.json({ rows, counts });
});

router.post('/', requireRole('admin', 'registrar'), (req, res) => {
  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 120).toLowerCase();
  const phone = clean(req.body.phone, 20);
  const gender = oneOf(req.body.gender, ['Male', 'Female', 'Other'], 'Other');
  const departmentId = toId(req.body.department_id);
  const category = oneOf(req.body.category, ['OPEN', 'OBC', 'SC', 'ST', 'EWS', 'VJNT', 'NT', 'SBC', 'Minority'], 'OPEN');
  const stage = oneOf(req.body.stage, ['enquiry', 'applied', 'verified', 'approved'], 'applied');
  const score = req.body.score === undefined || req.body.score === '' ? null : Number(req.body.score);
  const notes = clean(req.body.notes, 500);

  if (name.length < 2) return res.status(400).json({ error: 'Applicant name is required' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email is invalid' });
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
    return res.status(400).json({ error: 'Score must be between 0 and 100' });
  }
  let dept = null;
  if (departmentId) {
    dept = db.prepare('SELECT id, code FROM departments WHERE id = ?').get(departmentId);
    if (!dept) return res.status(400).json({ error: 'Department does not exist' });
  }
  const program = clean(req.body.program, 40) || (dept && dept.code === 'MBA' ? 'MBA' : 'B.Tech');

  const applicationNo = nextApplicationNo();
  const info = db.prepare(`INSERT INTO admissions
    (application_no, name, email, phone, gender, department_id, program, category, stage, score, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(applicationNo, name, email, phone, gender, departmentId, program, category, stage, score, notes);
  audit(req, 'create', 'admission', `${applicationNo} - ${name}`);
  const row = db.prepare('SELECT a.*, d.code AS dept_code FROM admissions a LEFT JOIN departments d ON d.id = a.department_id WHERE a.id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json({ admission: row });
});

router.patch('/:id/stage', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const existing = id && db.prepare('SELECT * FROM admissions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Application not found' });
  const stage = oneOf(req.body.stage, STAGES);
  if (!stage) return res.status(400).json({ error: 'Invalid admission stage' });
  if (stage === 'enrolled') return res.status(400).json({ error: 'Use the enroll action to convert this application' });
  const note = clean(req.body.note, 300);
  db.prepare("UPDATE admissions SET stage = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
    .run(stage, note || existing.notes, id);
  audit(req, 'stage_change', 'admission', `${existing.application_no}: ${existing.stage} -> ${stage}`);
  res.json({ ok: true, stage });
});

router.post('/:id/enroll', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const admission = id && db.prepare('SELECT * FROM admissions WHERE id = ?').get(id);
  if (!admission) return res.status(404).json({ error: 'Application not found' });
  if (admission.stage === 'enrolled') return res.status(409).json({ error: 'Application is already enrolled' });
  if (admission.stage !== 'approved') return res.status(400).json({ error: 'Only approved applications can be enrolled' });
  if (!admission.department_id) return res.status(400).json({ error: 'Assign a department before enrolling' });

  const dept = db.prepare('SELECT code FROM departments WHERE id = ?').get(admission.department_id);
  const semester = toInt(req.body.semester, 1, 8, 1);
  const batchYear = toInt(req.body.batch_year, 2000, 2100, new Date().getFullYear());
  const rollNo = clean(req.body.roll_no, 30).toUpperCase() || nextRollNo(dept.code);

  if (db.prepare('SELECT id FROM students WHERE roll_no = ?').get(rollNo)) {
    return res.status(409).json({ error: 'Roll number already exists' });
  }

  const program = admission.program || (dept.code === 'MBA' ? 'MBA' : 'B.Tech');
  const info = db.prepare(`INSERT INTO students
    (roll_no, name, email, phone, gender, department_id, program, semester, batch_year, status, category, admission_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,date('now'))`)
    .run(rollNo, admission.name, admission.email, admission.phone, admission.gender || 'Other',
      admission.department_id, program, semester, batchYear, 'active', admission.category || 'OPEN');

  db.prepare("UPDATE admissions SET stage = 'enrolled', updated_at = datetime('now') WHERE id = ?").run(id);
  audit(req, 'enroll', 'admission', `${admission.application_no} -> student ${rollNo}`);
  res.status(201).json({ ok: true, student_id: info.lastInsertRowid, roll_no: rollNo });
});

module.exports = router;
