# Contract Manager

A Windows desktop application for directors and teams to manage company and department contracts end-to-end.

## Features

- **Encrypted credentials** — SMTP, Gmail, e-signature, and AI keys sealed with AES-256-GCM behind one team passphrase
- **AI contract extraction** — reads an uploaded agreement (including scanned PDFs) and pulls out terms, obligations, and risk flags for review
- **Document vault with full-text search** — files are copied into managed storage and their contents indexed, so search covers what's *inside* every document
- **Obligation tracking** — deliverables, milestones, SLAs, and compliance duties with owners, due dates, and recurrence
- **Vendor records** — one entity per supplier with contacts, contract roll-ups, and duplicate detection/merge
- **Integrations** — emailed renewal and obligation reminders, an .ics calendar feed, and signed outbound webhooks
- **Approval workflows** — configurable routing rules (by scope, cost band, and vendor) send a contract through sequential sign-off before it goes active
- **Version control & redlining** — capture each draft, compare any two versions as a word-level redline, restore prior terms
- **Audit trail** — append-only log of every change: who, what, before/after, and when
- **Clause library** — reusable standard clauses with fallback variants, searchable and insertable while drafting
- **Multi-department contract tracking** with company-wide roll-up
- **Budget management** per department and company overall
- **Dashboard** with charts: spend trends, budget gauges, contract status, upcoming renewals
- **Renewal reminders** at 120, 90, 60, and 30 days (Windows notifications)
- **Contract drilldown** with editable line items
- **Price trend tracking** across renewal cycles
- **Competitor comparison** — upload/enter competitor offerings side-by-side
- **Gmail integration** — auto-import vendor billing emails and audit against budget; removed invoices are recoverable
- **Template library** — save a drafted contract and reopen, update, or delete it later
- **Vendor notes** and **project tracker** per contract
- **Company branding** — upload logo to auto-apply brand colors throughout the app
- **Role-based access** — Super Admin, Director, and Store Manager roles; scope is enforced in the main process from the stored role, so contracts, obligations, documents, and budgets outside a user's departments and branches never reach their window
- **Shared network database** — team of 6+ shares a single SQLite file on a network drive

---

## Getting Started (Development)

### Prerequisites
- Node.js 18+
- npm 9+

### Install dependencies
```bash
npm install
```

### Run in development
```bash
npm run dev
```

### First launch
On first launch, you'll be prompted to create an Admin account. This is the only time the setup screen appears.

---

## Credential Encryption

By default the app stores integration credentials (SMTP password, Gmail token, Documenso key, Anthropic key) in the database. On a shared network drive that means anyone who can read the drive can read them.

To encrypt them:

1. **Settings → Credential Encryption** → set a passphrase (Super Admin only)
2. Every stored credential is re-encrypted with AES-256-GCM immediately
3. On each other workstation, enter the same passphrase once — it's cached in that machine's OS keystore (Windows DPAPI), so it isn't needed again

The passphrase is never written to the database, so copying the `.db` file off the drive yields ciphertext. **There is no recovery** — if the passphrase is lost, the credentials must be re-entered.

While a machine is locked, email sending, Gmail sync, e-signature, and AI extraction are skipped rather than attempted with unreadable credentials. Everything else works normally.

---

## AI Extraction Setup (optional)

Contract term extraction uses the Anthropic API.

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/)
2. In the app: **Settings → AI Extraction** — paste the key, pick a model, and click **Test Connection**

Alternatively set an `ANTHROPIC_API_KEY` environment variable before launching; it takes precedence over the stored key and is never written to the database.

Extraction is billed by Anthropic per token. Without a key the rest of the app works normally — only the **Extract Terms** button is disabled.

---

## Gmail Integration Setup

To connect Gmail:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable **Gmail API**
3. Create **OAuth 2.0 credentials** (Desktop app type)
4. Set these environment variables before launching:
   ```
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```
5. In the app: **Settings → Gmail Integration → Connect Gmail Account**
6. Authorize in the browser, paste the code back into the app

---

## Shared Network Database

To share the database with your team:

1. Place the database on a shared network drive accessible to all users
2. In each team member's app: **Settings → Shared Database Location → Select Network Folder**
3. All instances will now read/write the same `contract-manager.db` file

> **Note:** Avoid having multiple users perform heavy writes simultaneously. The app uses SQLite WAL mode for better concurrent read performance.

---

## Building the Windows Installer

```bash
npm run build:win
```

This produces a `dist/Contract Manager Setup.exe` NSIS installer. Distribute this file to your team.

---

## Adding Google OAuth Credentials to the Installer

Set environment variables system-wide on Windows, or configure them in your deployment process before running the installer.

---

## Project Structure

```
src/
  main/           Electron main process (Node.js) — database, IPC, scheduler, Gmail
  preload/        Secure bridge between main and renderer
  renderer/       React frontend
  shared/         TypeScript types shared across processes
```
