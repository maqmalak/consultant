# Deploy: vvsdigital.pk

| File | Where it runs | What it does |
|---|---|---|
| `export-data.sh` | development machine | Backs up the `consultant` site with files into `~/vvsdigital-data-<date>` and prints the copy command. |
| `install-production.sh` | production server (Ubuntu 24.04) | Installs everything, restores the data, and sets up nginx, supervisor, SSL, the firewall and the nightly backup. |
| `backup.sh` | production server (cron) | Nightly backup with files, kept 14 days; copies off the server when `REMOTE` is set. |
| `patches/ask_alyf-local.patch` | used by the installer | Local changes to Ask ALYF (temperature for reasoning models, "Ask VVS" chat title). |

## Steps

1. **Push the app** so the server can fetch it: `git -C apps/pakistan_tax_consultancy push origin main`.
   If the repository is private, give the server read access (a deploy key, or `APP_REPO=https://<token>@github.com/...`).
2. **DNS:** create A records for `vvsdigital.pk` and `www.vvsdigital.pk` pointing to the server's IP.
3. **Export the data** (development machine): `bash apps/pakistan_tax_consultancy/deploy/export-data.sh`
4. **Copy to the server** with the `rsync` command it prints, and copy this `deploy` folder too (or clone the repo).
5. **Install** (on the server, as the bench user with sudo, not root):
   ```bash
   RESTORE_DIR=~/vvsdigital-data-<date> LETSENCRYPT_EMAIL=you@vvsdigital.pk bash install-production.sh
   ```
6. **Delete the data folder** from both machines; it holds the site's encryption key and stored secrets.

Options (environment variables): `SITE`, `EXTRA_DOMAINS`, `SSL=0`, `DEMO_PASSWORDS=keep`, `BENCH_NAME`, `ENABLE_UFW=0`, and the pinned
versions (`FRAPPE_BRANCH`, `ERPNEXT_BRANCH`, `CRM_REF`, `WHATSAPP_REF`, `ASK_ALYF_REF`). The script can be re-run.

Passwords (MariaDB root, Administrator, demo users) are generated on the server into `~/.frappe-install-secrets`.

After the install, follow the "Next" list the script prints and `GO_LIVE.md`.
