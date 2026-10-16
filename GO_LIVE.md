# Go-live checklist

Written instructions only — nothing here has been run. Commands assume a fresh production server; adapt names to yours.

## 1. Server and domain

- VPS with Ubuntu LTS and at least 4 GB RAM (8 GB recommended), 2+ vCPU, 80 GB SSD.
- Domain: a `.pk` name through PKNIC or a `.com` through any registrar. Create an **A record** pointing to the server's IP (and `www` as a CNAME).
- Install Frappe Bench v16 per the official docs, then:

```bash
bench get-app https://<your-git-host>/pakistan_tax_consultancy.git
bench new-site tax.example.pk --install-app erpnext --install-app pakistan_tax_consultancy
bench --site tax.example.pk set-config developer_mode 0
bench build --app pakistan_tax_consultancy
```

## 2. Production services and HTTPS

```bash
sudo bench setup production <linux-user>     # nginx + supervisor
bench setup add-domain tax.example.pk --site tax.example.pk
sudo bench setup lets-encrypt tax.example.pk  # HTTPS certificate, auto-renewing
```

- Firewall: `sudo ufw allow 22,80,443/tcp && sudo ufw enable`.
- `sudo apt install fail2ban` and enable the `sshd` and `nginx-http-auth` jails.
- In `sites/tax.example.pk/site_config.json`: `"host_name": "https://tax.example.pk"`.
- **System Settings**: untick *Allow Error Traceback* (portal users must never see stack traces), set session expiry, enable *Force User to Reset Password* policy and a minimum password score.
- Keep `developer_mode` off in production and on only in development.

## 3. Email

- Create an **Email Account** (outgoing, default) for e.g. `no-reply@tax.example.pk` with your provider's SMTP.
- DNS: **SPF** (`v=spf1 include:<provider> ~all`), **DKIM** (key from the provider), **DMARC** (`v=DMARC1; p=quarantine; rua=mailto:dmarc@tax.example.pk`).
- Send a test: create a client with your own email and use *Invite to portal*.

## 4. SMS

Implement the chosen provider in `services/sms.py`, keep credentials in `site_config.json`, select it in *Tax Consultancy Settings*, and test an OTP to your own number.

## 5. Backups and restore

```bash
# nightly, with files; keep 14 days locally
bench --site tax.example.pk backup --with-files
```

- Copy `sites/tax.example.pk/private/backups/` off the server every night (S3-compatible storage or another server; encrypt at rest).
- Restore drill **before** launch on a scratch server:
  `bench --site restore.test restore <db.sql.gz> --with-public-files <files.tar> --with-private-files <private.tar>`
  then log in and open a few client documents.

## 6. Search and analytics

- Google Search Console: verify the domain, submit `https://tax.example.pk/sitemap.xml`.
- Google Business Profile with the same name, address and phone as the website.
- Analytics only with consent: the site sets no tracking cookies today; if you add analytics, extend the cookie notice to ask first.

## 7. Pre-launch checklist

- [ ] Real prices, contacts, WhatsApp number, address, map and bank / wallet details in **Firm Website Settings** (no `[FILL]` left)
- [ ] Legal pages reviewed by the owner (or a lawyer) and the *TO BE REVIEWED BY OWNER* banner removed
- [ ] **Tax slabs, withholding sections and credit rules verified against the Finance Act / FBR notifications** and marked validated
- [ ] Demo data removed (`setup.demo.remove_demo_data`) and demo prices replaced
- [ ] Only true facts in the trust strip; testimonials only with recorded consent
- [ ] Client isolation re-tested on production: `scripts/api_checks.sh` against a staging copy, plus a manual check with two real test clients
- [ ] Administrator password changed to a long unique password; no shared logins
- [ ] HTTPS working, HTTP redirects to HTTPS
- [ ] Email and SMS tested end to end (OTP, invite, document rejection, acknowledgment)
- [ ] Backups running and one restore tested
- [ ] Lighthouse (mobile) on `/`: performance ≥ 85, accessibility ≥ 90
