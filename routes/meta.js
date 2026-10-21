const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/departments', (req, res) => {
  res.json({ rows: db.prepare('SELECT id, code, name FROM departments ORDER BY id').all() });
});

router.get('/fee-structures', (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, d.code AS dept_code FROM fee_structures f
    JOIN departments d ON d.id = f.department_id ORDER BY f.department_id, f.semester`).all();
  res.json({ rows });
});

module.exports = router;
