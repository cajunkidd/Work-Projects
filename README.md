# Contract Manager

A Windows desktop application for directors and teams to manage company and department contracts end-to-end.

## Features

- **Multi-department contract tracking** with company-wide roll-up
- **Budget management** per department and company overall
- **Dashboard** with charts: spend trends, budget gauges, contract status, upcoming renewals
- **Renewal reminders** at 120, 90, 60, and 30 days (Windows notifications)
- **Contract drilldown** with editable line items
- **Price trend tracking** across renewal cycles
- **Competitor comparison** — upload/enter competitor offerings side-by-side
- **Gmail integration** — auto-import vendor billing emails and audit against budget
- **Vendor notes** and **project tracker** per contract
- **Company branding** — upload logo to auto-apply brand colors throughout the app
- **Role-based access** — Admin, Editor, Viewer roles with optional department scoping
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
