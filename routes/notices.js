const express = require('express');
const { db } = require('../db');
const { requireRole, audit, clean, toId, oneOf } = require('../middleware/security');

const router = express.Router();

router.get('/', (req, res) => {
  const audience = oneOf(req.query.audience, ['all', 'students', 'faculty']);
  const where = audience ? "WHERE audience IN ('all', ?)" : '';
  const params = audience ? [audience] : [];
  const rows = db.prepare(`
    SELECT n.*, u.name AS author FROM notices n LEFT JOIN users u ON u.id = n.created_by
    ${where} ORDER BY n.pinned DESC, n.created_at DESC, n.id DESC LIMIT 100`).all(...params);
  res.json({ rows });
});

router.post('/', requireRole('admin', 'registrar', 'faculty'), (req, res) => {
  const title = clean(req.body.title, 140);
  const body = clean(req.body.body, 3000);
  const category = clean(req.body.category, 40) || 'General';
  const audience = oneOf(req.body.audience, ['all', 'students', 'faculty'], 'all');
  const pinned = req.body.pinned ? 1 : 0;
  if (title.length < 3) return res.status(400).json({ error: 'Notice title is required' });
  if (body.length < 5) return res.status(400).json({ error: 'Notice body is required' });
  const info = db.prepare('INSERT INTO notices (title, body, category, audience, pinned, created_by) VALUES (?,?,?,?,?,?)')
    .run(title, body, category, audience, pinned, req.user.id);
  audit(req, 'create', 'notice', title);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.delete('/:id', requireRole('admin', 'registrar'), (req, res) => {
  const id = toId(req.params.id);
  const notice = id && db.prepare('SELECT id, title FROM notices WHERE id = ?').get(id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });
  db.prepare('DELETE FROM notices WHERE id = ?').run(id);
  audit(req, 'delete', 'notice', notice.title);
  res.json({ ok: true });
});

module.exports = router;
