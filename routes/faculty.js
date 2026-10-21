const express = require('express');
const { db } = require('../db');
const { requireRole, audit, clean, toId } = require('../middleware/security');

const router = express.Router();

function validate(body, existing = {}) {
  const data = {
    name: clean(body.name ?? existing.name, 100),
    email: clean(body.email ?? existing.email, 120).toLowerCase(),
    phone: clean(body.phone ?? existing.phone, 20),
    department_id: toId(body.department_id ?? existing.department_id),
    designation: clean(body.designation ?? existing.designation, 80),
    qualification: clean(body.qualification ?? existing.qualification, 120),
    join_date: clean(body.join_date ?? existing.join_date, 10),
    status: body.status === 'inactive' || existing.status === 'inactive' ? 'inactive' : 'active'
  };
  const errors = [];
  if (data.name.length < 2) errors.push('Faculty name is required');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Email is invalid');
  if (!data.department_id) errors.push('Department is required');
  return { data, errors };
}

router.get('/', (req, res) => {
  const q = clean(req.query.q, 80);
  const deptId = toId(req.query.department_id);
  const where = [];
  const params = [];
  if (q) {
    where.push('(f.name LIKE ? OR f.email LIKE ? OR f.designation LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (deptId) { where.push('f.department_id = ?'); params.push(deptId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT f.*, d.code AS dept_code, d.name AS department
    FROM faculty f LEFT JOIN departments d ON d.id = f.department_id
    ${whereSql} ORDER BY f.name`).all(...params);
  res.json({ rows });
});

router.post('/', requireRole('admin', 'registrar'), (req, res) => {
  const { data, errors } = validate(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  if (data.email && db.prepare('SELECT id FROM faculty WHERE email = ?').get(data.email)) {
    return res.status(409).json({ error: 'A faculty member with this email already exists' });
  }
  const info = db.prepare(`INSERT INTO faculty (name, email, phone, department_id, designation, qualification, join_date, status)
    VALUES (?,?,?,?,?,?,?,?)`).run(data.name, data.email, data.phone, data.department_id,
    data.designation, data.qualification, data.join_date, data.status);
  audit(req, 'create', 'faculty', data.name);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.put('/:id', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const existing = id && db.prepare('SELECT * FROM faculty WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Faculty member not found' });
  const { data, errors } = validate(req.body, existing);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  if (data.email && db.prepare('SELECT id FROM faculty WHERE email = ? AND id != ?').get(data.email, id)) {
    return res.status(409).json({ error: 'A faculty member with this email already exists' });
  }
  db.prepare(`UPDATE faculty SET name=?, email=?, phone=?, department_id=?, designation=?, qualification=?, join_date=?, status=?
    WHERE id=?`).run(data.name, data.email, data.phone, data.department_id, data.designation,
    data.qualification, data.join_date, data.status, id);
  audit(req, 'update', 'faculty', data.name);
  res.json({ ok: true });
});

module.exports = router;
