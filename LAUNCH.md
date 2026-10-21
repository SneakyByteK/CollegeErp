# Launch Checklist (Path A)

## One-time setup

- [ ] Change demo passwords before going public:
  ```bash
  node -e "console.log(require('bcryptjs').hashSync('YOUR_NEW_PASSWORD', 10))"
  ```
  Then update each `users` row (`admin@demo.edu`, `registrar@demo.edu`, `faculty@demo.edu`) with the new hash — locally via DB Browser or on the server via `railway ssh`.
- [ ] Deploy as a **Node service from GitHub** (Nixpacks — `nixpacks.toml` + `railway.json` are in the repo). Never "Static Site".
- [ ] Railway → **Variables** → add `SESSION_SECRET` (long random hex)
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- [ ] Railway → **Volumes** → add volume, mount path `/app/data` (without it the DB resets every deploy)
- [ ] Railway → **Networking** → generate domain / attach your custom domain (HTTPS is automatic)
- [ ] Verify: Run logs show `VidyaERP demo running on http://localhost:8080`, login works with new passwords

## Backups

- **Local:** `npm run backup` → `backups/erp-<timestamp>.db`
- **On server:** `railway ssh`, then:
  ```bash
  BACKUP_DIR=/app/data/backups node scripts/backup.js
  ```
  (lands on the volume so it survives restarts; copy it off periodically — e.g. `type <file>` base64 via ssh, or scp tooling)
- **Restore:** stop the app → replace `data/erp.db` with the backup → delete `data/erp.db-wal` and `data/erp.db-shm` → start

## Ongoing

- [ ] Take + download a backup monthly (and before every schema change)
- [ ] Check Railway usage/limits
- [ ] Watch Run logs for errors after deploys
