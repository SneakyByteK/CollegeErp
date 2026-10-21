const express = require('express');
const { db } = require('../db');
const { requireRole, audit, clean, toId, toInt, oneOf, money } = require('../middleware/security');

const router = express.Router();

const MODES = ['UPI', 'Net Banking', 'Card', 'Cash', 'Cheque'];

function nextChallanNo() {
  const year = new Date().getFullYear();
  let n = db.prepare('SELECT COUNT(*) c FROM challans WHERE challan_no LIKE ?').get(`CH-${year}-%`).c + 1;
  let no = `CH-${year}-${String(n).padStart(4, '0')}`;
  while (db.prepare('SELECT id FROM challans WHERE challan_no = ?').get(no)) {
    n += 1;
    no = `CH-${year}-${String(n).padStart(4, '0')}`;
  }
  return no;
}

router.get('/summary', (req, res) => {
  const totals = db.prepare(`
    SELECT COALESCE(SUM(amount),0) billed, COALESCE(SUM(paid_amount),0) collected,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END),0) pending_amount,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) pending_count,
      SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) partial_count,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) paid_count
    FROM challans`).get();
  const thisMonth = db.prepare(`
    SELECT COALESCE(SUM(paid_amount),0) c FROM challans
    WHERE paid_on >= date('now', 'start of month')`).get().c;
  const defaulters = db.prepare(`
    SELECT COUNT(DISTINCT student_id) c FROM challans WHERE status != 'paid'`).get().c;
  res.json({ ...totals, due: totals.billed - totals.collected, thisMonth, defaulters });
});

router.get('/challans', (req, res) => {
  const q = clean(req.query.q, 80);
  const status = oneOf(req.query.status, ['pending', 'partial', 'paid']);
  const where = [];
  const params = [];
  if (q) {
    where.push('(s.name LIKE ? OR s.roll_no LIKE ? OR c.challan_no LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) { where.push('c.status = ?'); params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT c.*, s.name AS student_name, s.roll_no, d.code AS dept_code
    FROM challans c JOIN students s ON s.id = c.student_id JOIN departments d ON d.id = s.department_id
    ${whereSql}
    ORDER BY c.created_at DESC, c.id DESC LIMIT 300`).all(...params);
  res.json({ rows });
});

router.post('/challans', requireRole('admin', 'registrar'), (req, res) => {
  const studentId = toId(req.body.student_id);
  const student = studentId && db.prepare('SELECT id, name, roll_no FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(400).json({ error: 'Student not found' });
  const feeType = clean(req.body.fee_type, 100) || 'Tuition Fee';
  const amount = money(req.body.amount, 1, 10000000);
  if (!amount) return res.status(400).json({ error: 'Amount must be greater than zero' });
  const dueDate = clean(req.body.due_date, 10) || null;
  const challanNo = nextChallanNo();
  const info = db.prepare(`INSERT INTO challans (challan_no, student_id, fee_type, amount, due_date)
    VALUES (?,?,?,?,?)`).run(challanNo, studentId, feeType, amount, dueDate);
  audit(req, 'create', 'challan', `${challanNo} for ${student.roll_no} - INR ${amount}`);
  res.status(201).json({ ok: true, id: info.lastInsertRowid, challan_no: challanNo });
});

router.post('/challans/bulk', requireRole('admin', 'registrar'), (req, res) => {
  const deptId = toId(req.body.department_id);
  const semester = toInt(req.body.semester, 1, 8);
  const academicYear = clean(req.body.academic_year, 10) || '2026-27';
  if (!deptId || !semester) return res.status(400).json({ error: 'Department and semester are required' });
  const structure = db.prepare(`SELECT * FROM fee_structures WHERE department_id = ? AND semester = ? ORDER BY id DESC LIMIT 1`)
    .get(deptId, semester);
  if (!structure) return res.status(400).json({ error: 'No fee structure configured for this department and semester' });

  const students = db.prepare("SELECT id, roll_no FROM students WHERE department_id = ? AND semester = ? AND status = 'active'")
    .all(deptId, semester);
  const feeType = `Semester ${semester} Tuition Fee`;
  const exists = db.prepare('SELECT id FROM challans WHERE student_id = ? AND fee_type = ?');
  let created = 0;
  const dueDate = clean(req.body.due_date, 10) || null;
  const tx = db.transaction(() => {
    for (const s of students) {
      if (exists.get(s.id, feeType)) continue;
      db.prepare('INSERT INTO challans (challan_no, student_id, fee_type, amount, due_date) VALUES (?,?,?,?,?)')
        .run(nextChallanNo(), s.id, feeType, structure.amount, dueDate);
      created += 1;
    }
  });
  tx();
  audit(req, 'bulk_generate', 'challan', `${created} challans for ${academicYear} sem ${semester}`);
  res.json({ ok: true, created, amount: structure.amount });
});

router.post('/challans/:id/pay', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const challan = id && db.prepare(`
    SELECT c.*, s.name AS student_name, s.roll_no, d.code AS dept_code
    FROM challans c JOIN students s ON s.id = c.student_id JOIN departments d ON d.id = s.department_id
    WHERE c.id = ?`).get(id);
  if (!challan) return res.status(404).json({ error: 'Challan not found' });
  if (challan.status === 'paid') return res.status(409).json({ error: 'This challan is already fully paid' });

  const remaining = challan.amount - challan.paid_amount;
  const payAmount = req.body.amount === undefined ? remaining : money(req.body.amount, 1, remaining);
  if (!payAmount) return res.status(400).json({ error: `Payment must be between 1 and ${remaining}` });
  const mode = oneOf(req.body.mode, MODES, 'UPI');

  const paidTotal = challan.paid_amount + payAmount;
  const status = paidTotal >= challan.amount ? 'paid' : 'partial';
  const receiptNo = challan.receipt_no || `RCP-${challan.challan_no}`;
  db.prepare(`UPDATE challans SET paid_amount = ?, status = ?, paid_on = date('now'), mode = ?, receipt_no = ? WHERE id = ?`)
    .run(paidTotal, status, mode, receiptNo, id);
  audit(req, 'payment', 'challan', `${challan.challan_no} INR ${payAmount} via ${mode}`);

  const updated = db.prepare('SELECT * FROM challans WHERE id = ?').get(id);
  res.json({
    ok: true,
    challan: updated,
    receipt: {
      receipt_no: receiptNo,
      paid_now: payAmount,
      mode,
      student_name: challan.student_name,
      roll_no: challan.roll_no,
      dept_code: challan.dept_code,
      fee_type: challan.fee_type,
      total: challan.amount,
      paid_total: paidTotal,
      balance: challan.amount - paidTotal
    }
  });
});

router.get('/receipt/:id', (req, res) => {
  const id = toId(req.params.id);
  const challan = id && db.prepare(`
    SELECT c.*, s.name AS student_name, s.roll_no, s.program, d.name AS department, d.code AS dept_code
    FROM challans c JOIN students s ON s.id = c.student_id JOIN departments d ON d.id = s.department_id
    WHERE c.id = ?`).get(id);
  if (!challan) return res.status(404).json({ error: 'Challan not found' });
  res.json({ challan });
});

module.exports = router;
