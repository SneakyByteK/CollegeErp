const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const { ensureCsrf, csrfProtection, requireAuth } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 4000;

app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' }
}));

app.use(express.json({ limit: '250kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

const secretFile = path.join(__dirname, 'data', 'secret.txt');
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (fs.existsSync(secretFile)) {
    sessionSecret = fs.readFileSync(secretFile, 'utf8').trim();
  } else {
    sessionSecret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, sessionSecret, { mode: 0o600 });
  }
}

app.use(session({
  name: 'erp.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use((req, res, next) => {
  ensureCsrf(req);
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  next();
});

app.use('/api', csrfProtection);

app.use('/api/auth', require('./routes/auth'));

const api = express.Router();
api.use(requireAuth);
api.use('/meta', require('./routes/meta'));
api.use('/dashboard', require('./routes/dashboard'));
api.use('/students', require('./routes/students'));
api.use('/admissions', require('./routes/admissions'));
api.use('/fees', require('./routes/fees'));
api.use('/attendance', require('./routes/attendance'));
api.use('/timetable', require('./routes/timetable'));
api.use('/exams', require('./routes/exams'));
api.use('/faculty', require('./routes/faculty'));
api.use('/notices', require('./routes/notices'));
api.use('/scholarships', require('./routes/scholarships'));
app.use('/api', api);

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0 }));

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Endpoint not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed request body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  console.error(`[error] ${req.method} ${req.path}:`, err.message);
  res.status(err.status && err.status < 500 ? err.status : 500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`VidyaERP demo running on http://localhost:${PORT}`);
  console.log('Demo logins: admin@demo.edu / Admin@123 | registrar@demo.edu / Staff@123 | faculty@demo.edu / Faculty@123');
});
