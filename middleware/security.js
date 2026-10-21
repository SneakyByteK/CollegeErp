const crypto = require('crypto');
const { db } = require('../db');

function ensureCsrf(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.get('x-csrf-token') || '';
  const expected = req.session.csrf || '';
  const ok = token.length === expected.length && expected.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Authentication required' });
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Session expired' });
  }
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission for this action' });
    next();
  };
}

function audit(req, action, entity, detail) {
  db.prepare('INSERT INTO audit_log (actor_id, actor_name, action, entity, detail) VALUES (?,?,?,?,?)')
    .run(req.user ? req.user.id : null, req.user ? req.user.name : 'anonymous', action, entity, detail || '');
}

const clean = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const toId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const oneOf = (v, allowed, def = null) => (allowed.includes(v) ? v : def);
const toInt = (v, min, max, def = null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
};
const money = (v, min = 0, max = 10000000) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
};

module.exports = { ensureCsrf, csrfProtection, requireAuth, requireRole, audit, clean, toId, oneOf, toInt, money };
