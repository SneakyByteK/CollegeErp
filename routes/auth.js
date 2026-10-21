const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { ensureCsrf, requireAuth, audit } = require('../middleware/security');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
});

router.get('/csrf', (req, res) => {
  res.json({ csrf: ensureCsrf(req) });
});

router.post('/login', loginLimiter, (req, res, next) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 120) : '';
  const password = typeof req.body.password === 'string' ? req.body.password.slice(0, 200) : '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const valid = user && bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    const csrf = ensureCsrf(req);
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      audit({ user }, 'login', 'session', `Signed in from ${req.ip}`);
      res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, csrf });
    });
  });
});

router.post('/logout', (req, res) => {
  const userId = req.session.userId;
  req.session.destroy(() => {
    res.clearCookie('erp.sid');
    if (userId) {
      const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
      db.prepare('INSERT INTO audit_log (actor_id, actor_name, action, entity, detail) VALUES (?,?,?,?,?)')
        .run(userId, user ? user.name : '', 'logout', 'session', '');
    }
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, csrf: ensureCsrf(req) });
});

module.exports = router;
