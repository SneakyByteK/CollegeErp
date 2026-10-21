const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'erp.db');
if (!fs.existsSync(dbPath)) {
  console.error('No database found at ' + dbPath);
  process.exit(1);
}

const outDir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = path.join(outDir, `erp-${stamp}.db`);

const db = new Database(dbPath);
db.pragma('wal_checkpoint(TRUNCATE)');
db.prepare('VACUUM INTO ?').run(dest);
db.close();

const size = fs.statSync(dest).size;
console.log(`Backup written: ${dest} (${(size / 1024 / 1024).toFixed(2)} MB)`);
