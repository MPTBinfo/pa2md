# MPTB MD OFFICE — Next.js / TypeScript + Google Sheets

**Full-stack React/Next.js `.tsx` application. Google Sheets is the sole records database.** This is an initial pilot, NOT a security-audited government production system.

## Two-way workflow

Web user -> Next.js UI -> authenticated server API -> Google Sheets API -> the configured spreadsheet. Reads travel the reverse path. Users perform CRUD in the web application; they never need to open Google Sheets. The spreadsheet is NOT exposed to the client. Multiple web users see shared data after refresh. The pilot does not offer real-time push updates, conflict locking, or safe simultaneous writes at scale.

## Installation

1. `npm install`
2. In Google Cloud, enable **Google Sheets API** and create a service account. Save its email and private key securely.
3. Upload `Google_Sheets_DB_Template.xlsx` to Google Drive and open/convert it as a native Google Sheet, or create a blank Google Sheet and create tabs with the exact column headers in the template. The 27 tabs are master collections; never change the header row after connecting.
4. Share the Google Sheet *only* with the service account email as **Editor**. Do **not** share it with application end users. Copy the spreadsheet ID from its URL.
5. Copy `.env.example` to `.env.local` and populate spreadsheet ID, service-account email, private key, session secret, and admin login credentials. Never commit `.env.local`.
6. `npm run dev` and open `http://localhost:3000`.
7. Sign in as the configured administrator. Create/read/edit records directly through the website; they are stored in Google Sheets.

## Web hosting

Deploy the Next.js project on a platform supporting Next.js server runtime, e.g. Vercel or a Node host. Set **server-side** environment variables through the hosting provider. Never use `NEXT_PUBLIC_` for secrets. The service account does not grant website users direct spreadsheet permissions.

## Current functionality

- Institutional sign-in (bootstrap admin account from server environment).
- Responsive executive home, navigation and office module registers.
- Server-side Google Sheets reads, append and edits across 24 non-system sheets.
- Searchable tables, per-record editing, and audit logging to Google Sheets.
- Confidentiality-based server-side read/write checks (initial policy).
- Basic live-derived meeting, visitor, task and decision dashboard summaries.

## Important limitations before production

- Bootstrap admin credentials are environment-based; multi-user provisioning and stronger MFA are **not** yet implemented.
- No delete workflow, polished reference selectors, pagination, Google Drive document-binary management, notification scheduler, Virtual PA or MD tenure transition wizard yet.
- Data integrity across multiple sheets cannot be guaranteed by Google Sheets like a transactional database; add concurrency/version checks, idempotency, backups and monitoring.
- Audit events are written after each record write; if audit fails, the underlying record may already have changed.
- Google Sheets API has quotas and performance limits; do not treat it like an unrestricted database.
- Use an official domain and implement organization SSO, granular field-level authorization, CSRF/origin checks, stronger session management, backup procedures and security review before placing confidential records into this system.
