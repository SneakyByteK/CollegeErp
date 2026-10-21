const express = require('express');
const { db } = require('../db');
const { requireRole, audit, clean, toId, toInt, oneOf, money } = require('../middleware/security');
const mahabdt = require('../services/mahadbt');

const router = express.Router();

const STAGES = ['draft', 'institute_verified', 'submitted', 'approved', 'disbursed', 'rejected'];
const DOCS = ['Aadhaar Card', 'Income Certificate', 'Caste Certificate', 'Domicile Certificate',
  'Last Marksheet', 'Admission Receipt', 'Bank Passbook'];
const TRANSITIONS = {
  submitted: ['approved', 'rejected'],
  approved: ['disbursed'],
  rejected: ['institute_verified'],
  disbursed: []
};

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/', (req, res) => {
  const q = clean(req.query.q, 80);
  const stage = oneOf(req.query.stage, STAGES);
  const year = clean(req.query.academic_year, 10);
  const where = [];
  const params = [];
  if (q) {
    where.push('(s.name LIKE ? OR s.roll_no LIKE ? OR sc.mahabdt_app_no LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (stage) { where.push('sc.stage = ?'); params.push(stage); }
  if (year) { where.push('sc.academic_year = ?'); params.push(year); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT sc.*, s.name AS student_name, s.roll_no, s.category, d.code AS dept_code,
      (SELECT COUNT(*) FROM scholarship_docs sd WHERE sd.scholarship_id = sc.id AND sd.status = 'pending') AS pending_docs
    FROM scholarships sc
    JOIN students s ON s.id = sc.student_id
    JOIN departments d ON d.id = s.department_id
    ${whereSql}
    ORDER BY sc.created_at DESC, sc.id DESC LIMIT 300`).all(...params);

  const summary = db.prepare(`
    SELECT
      COUNT(*) total,
      COALESCE(SUM(CASE WHEN stage = 'draft' THEN 1 ELSE 0 END),0) draft,
      COALESCE(SUM(CASE WHEN stage = 'institute_verified' THEN 1 ELSE 0 END),0) institute_verified,
      COALESCE(SUM(CASE WHEN stage = 'submitted' THEN 1 ELSE 0 END),0) submitted,
      COALESCE(SUM(CASE WHEN stage = 'approved' THEN 1 ELSE 0 END),0) approved,
      COALESCE(SUM(CASE WHEN stage = 'disbursed' THEN 1 ELSE 0 END),0) disbursed,
      COALESCE(SUM(CASE WHEN stage = 'rejected' THEN 1 ELSE 0 END),0) rejected,
      COALESCE(SUM(CASE WHEN stage = 'disbursed' THEN amount ELSE 0 END),0) disbursed_amount,
      COALESCE(SUM(CASE WHEN stage = 'approved' THEN amount ELSE 0 END),0) sanctioned_amount
    FROM scholarships`).get();

  res.json({ rows, summary });
});

router.get('/export.csv', (req, res) => {
  const year = clean(req.query.academic_year, 10) || '2026-27';
  const config = mahabdt.getSettings();
  const rows = db.prepare(`
    SELECT sc.mahabdt_app_no, sc.scheme, sc.academic_year, sc.amount, sc.stage,
      s.roll_no, s.name, s.category, s.gender, s.phone, d.code AS dept_code
    FROM scholarships sc JOIN students s ON s.id = sc.student_id JOIN departments d ON d.id = s.department_id
    WHERE sc.academic_year = ? ORDER BY s.roll_no`).all(year);

  const header = ['Institute Code', 'MahaDBT Application No', 'Roll No', 'Student Name', 'Gender',
    'Category', 'Department', 'Scheme', 'Academic Year', 'Amount', 'Stage', 'Aadhaar No', 'Mobile'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      config.mahabdtInstituteCode, r.mahabdt_app_no || '', r.roll_no, r.name, r.gender, r.category,
      r.dept_code, r.scheme, r.academic_year, r.amount, r.stage, '', r.phone
    ].map(csvCell).join(','));
  }
  audit(req, 'export', 'scholarship', `${rows.length} applications for ${year}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="mahadbt-applications-${year}.csv"`);
  res.send(lines.join('\n'));
});

router.get('/settings', requireRole('admin'), (req, res) => {
  res.json({ settings: mahabdt.getSettings() });
});

router.put('/settings', requireRole('admin'), (req, res) => {
  const map = {
    institute_name: clean(req.body.institute_name, 150),
    institute_code: clean(req.body.institute_code, 50),
    mahabdt_institute_code: clean(req.body.mahabdt_institute_code, 50),
    mahabdt_user_id: clean(req.body.mahabdt_user_id, 80),
    mahabdt_api_base: clean(req.body.mahabdt_api_base, 200),
    mahabdt_mode: oneOf(req.body.mahabdt_mode, ['sandbox', 'live'], 'sandbox')
  };
  if (map.mahabdt_api_base && !/^https?:\/\/[^\s]+$/i.test(map.mahabdt_api_base)) {
    return res.status(400).json({ error: 'API base must be a valid http(s) URL' });
  }
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(map)) upsert.run(k, v);
  });
  tx();
  audit(req, 'settings', 'mahadbt', `Integration mode set to ${map.mahabdt_mode}`);
  res.json({ ok: true, settings: mahabdt.getSettings() });
});

router.get('/:id', (req, res) => {
  const id = toId(req.params.id);
  const row = id && db.prepare(`
    SELECT sc.*, s.name AS student_name, s.roll_no, s.category, s.phone, s.email, s.program, s.semester,
      d.code AS dept_code, d.name AS department
    FROM scholarships sc JOIN students s ON s.id = sc.student_id JOIN departments d ON d.id = s.department_id
    WHERE sc.id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Scholarship application not found' });
  const docs = db.prepare('SELECT id, doc_type, status FROM scholarship_docs WHERE scholarship_id = ? ORDER BY id').all(id);
  const events = db.prepare('SELECT action, detail, actor, created_at FROM scholarship_events WHERE scholarship_id = ? ORDER BY id DESC').all(id);
  res.json({ scholarship: row, docs, events });
});

router.post('/', requireRole('admin', 'registrar'), (req, res) => {
  const studentId = toId(req.body.student_id);
  const student = studentId && db.prepare('SELECT id, name, roll_no FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(400).json({ error: 'Student not found' });
  const scheme = clean(req.body.scheme, 150);
  const academicYear = clean(req.body.academic_year, 10) || '2026-27';
  const amount = money(req.body.amount, 1, 1000000);
  const appNo = clean(req.body.mahabdt_app_no, 40);
  const note = clean(req.body.status_note, 300);
  if (!scheme) return res.status(400).json({ error: 'Scholarship scheme is required' });
  if (!amount) return res.status(400).json({ error: 'Sanction amount must be greater than zero' });

  const info = db.prepare(`INSERT INTO scholarships (student_id, scheme, academic_year, mahabdt_app_no, stage, amount, status_note)
    VALUES (?,?,?,?, 'draft', ?, ?)`).run(studentId, scheme, academicYear, appNo || null, amount, note);
  const schId = info.lastInsertRowid;
  const insDoc = db.prepare("INSERT INTO scholarship_docs (scholarship_id, doc_type, status) VALUES (?,?, 'pending')");
  for (const doc of DOCS) insDoc.run(schId, doc);
  db.prepare('INSERT INTO scholarship_events (scholarship_id, action, detail, actor) VALUES (?,?,?,?)')
    .run(schId, 'Application created', `${scheme} (${academicYear})`, req.user.name);
  audit(req, 'create', 'scholarship', `${student.roll_no} - ${scheme}`);
  res.status(201).json({ ok: true, id: schId });
});

router.post('/:id/docs', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const sch = id && db.prepare('SELECT id FROM scholarships WHERE id = ?').get(id);
  if (!sch) return res.status(404).json({ error: 'Scholarship application not found' });
  const docType = oneOf(req.body.doc_type, DOCS);
  const status = oneOf(req.body.status, ['pending', 'uploaded', 'verified']);
  if (!docType || !status) return res.status(400).json({ error: 'Invalid document or status' });
  db.prepare('UPDATE scholarship_docs SET status = ? WHERE scholarship_id = ? AND doc_type = ?').run(status, id, docType);
  audit(req, 'document', 'scholarship', `${docType} -> ${status}`);
  res.json({ ok: true });
});

router.post('/:id/verify', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const sch = id && db.prepare('SELECT * FROM scholarships WHERE id = ?').get(id);
  if (!sch) return res.status(404).json({ error: 'Scholarship application not found' });
  if (sch.stage !== 'draft') return res.status(400).json({ error: 'Only draft applications can be verified at institute level' });
  const pending = db.prepare("SELECT COUNT(*) c FROM scholarship_docs WHERE scholarship_id = ? AND status = 'pending'").get(id).c;
  if (pending > 0) return res.status(400).json({ error: `${pending} document(s) are still pending. Upload all mandatory documents first.` });

  db.prepare("UPDATE scholarship_docs SET status = 'verified' WHERE scholarship_id = ?").run(id);
  db.prepare("UPDATE scholarships SET stage = 'institute_verified', verified_by = ?, verified_at = datetime('now') WHERE id = ?")
    .run(req.user.id, id);
  db.prepare('INSERT INTO scholarship_events (scholarship_id, action, detail, actor) VALUES (?,?,?,?)')
    .run(id, 'Documents verified at institute', 'All mandatory documents checked by the scholarship cell', req.user.name);
  audit(req, 'verify', 'scholarship', `Application ${id} verified`);
  res.json({ ok: true, stage: 'institute_verified' });
});

router.post('/:id/sync', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const sch = id && db.prepare(`
    SELECT sc.*, s.name AS student_name, s.roll_no FROM scholarships sc
    JOIN students s ON s.id = sc.student_id WHERE sc.id = ?`).get(id);
  if (!sch) return res.status(404).json({ error: 'Scholarship application not found' });

  if (sch.stage === 'submitted') {
    return res.json({
      ok: true,
      mode: mahabdt.getSettings().mode,
      message: 'Application is pending at MahaDBT. The prototype does not poll the government portal automatically - record the portal response below once received.'
    });
  }
  if (sch.stage !== 'institute_verified') {
    return res.status(400).json({ error: 'Verify the application at institute level before submitting to MahaDBT' });
  }

  const result = mahabdt.submitApplication(sch);
  if (!result.ok) return res.status(400).json({ error: result.message, mode: result.mode });

  db.prepare("UPDATE scholarships SET stage = 'submitted', mahabdt_app_no = ? WHERE id = ?").run(result.reference, id);
  db.prepare('INSERT INTO scholarship_events (scholarship_id, action, detail, actor) VALUES (?,?,?,?)')
    .run(id, 'Forwarded to MahaDBT', `Application ${result.reference} submitted (${result.mode})`, req.user.name);
  audit(req, 'submit', 'scholarship', `Application ${id} -> ${result.reference}`);
  res.json({ ok: true, ...result });
});

router.patch('/:id/stage', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const sch = id && db.prepare('SELECT * FROM scholarships WHERE id = ?').get(id);
  if (!sch) return res.status(404).json({ error: 'Scholarship application not found' });
  const stage = oneOf(req.body.stage, STAGES);
  const note = clean(req.body.note, 300);
  if (!stage) return res.status(400).json({ error: 'Invalid stage' });
  const allowed = TRANSITIONS[sch.stage] || [];
  if (!allowed.includes(stage)) {
    return res.status(400).json({ error: `Cannot move application from ${sch.stage.replace('_', ' ')} to ${stage.replace('_', ' ')}` });
  }
  db.prepare('UPDATE scholarships SET stage = ?, status_note = ?, disbursed_on = CASE WHEN ? = ? THEN date(\'now\') ELSE disbursed_on END WHERE id = ?')
    .run(stage, note, stage, 'disbursed', id);
  db.prepare('INSERT INTO scholarship_events (scholarship_id, action, detail, actor) VALUES (?,?,?,?)')
    .run(id, `MahaDBT response: ${stage.replace('_', ' ')}`, note || 'Portal status recorded by institute', req.user.name);
  audit(req, 'stage_change', 'scholarship', `Application ${id}: ${sch.stage} -> ${stage}`);
  res.json({ ok: true, stage });
});

module.exports = router;
