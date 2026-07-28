# Contract Manager — User Tutorial

A step-by-step walkthrough of every feature in Contract Manager, written for the people who will actually use it: directors, store managers, and administrators.

> **Screenshots:** image placeholders throughout this document point to `docs/images/<name>.png`. Drop PNGs with those filenames into `docs/images/` to populate them.

---

## Table of Contents

1. [Welcome & Who This Is For](#1-welcome--who-this-is-for)
2. [Key Concepts (30-second primer)](#2-key-concepts-30-second-primer)
3. [First Launch: Create Your Admin Account](#3-first-launch-create-your-admin-account)
4. [Signing In](#4-signing-in)
5. [Tour of the Interface](#5-tour-of-the-interface)
6. [The Dashboard](#6-the-dashboard)
7. [Setting Up Your Organization](#7-setting-up-your-organization-super-admin)
8. [Managing Users & Roles](#8-managing-users--roles-super-admin)
9. [Adding Your First Contract](#9-adding-your-first-contract)
10. [Working With an Existing Contract](#10-working-with-an-existing-contract)
11. [Searching & Filtering Contracts](#11-searching--filtering-contracts)
12. [Bulk Importing Contracts](#12-bulk-importing-contracts)
13. [Tracking Renewals](#13-tracking-renewals)
14. [Comparing Competitors](#14-comparing-competitors)
15. [Vendor Projects Tracker](#15-vendor-projects-tracker)
16. [IT Assets Inventory](#16-it-assets-inventory-super-admin)
17. [Gmail Integration](#17-gmail-integration)
18. [Email Notifications (SMTP)](#18-email-notifications-smtp)
19. [E-Signature via Documenso](#19-e-signature-via-documenso)
20. [Sharing the Database Across Your Team](#20-sharing-the-database-across-your-team)
21. [Department & Branch Drill-down](#21-department--branch-drill-down)
22. [Approval Workflows](#22-approval-workflows)
23. [Version Control & Redlining](#23-version-control--redlining)
24. [Audit Trail](#24-audit-trail)
25. [Clause Library](#25-clause-library)
26. [Signing Out](#26-signing-out)
27. [Troubleshooting & FAQ](#27-troubleshooting--faq)

---

## 1. Welcome & Who This Is For

Contract Manager is a Windows desktop app for directors and teams to manage vendor contracts end-to-end: tracking costs, budgets, renewals, invoices, competitor offerings, and vendor projects — all in one place.

This tutorial assumes the application is already installed. If you're still setting up the development environment, see the `README.md`.

**You'll get the most out of this guide if you are one of:**
- A **Super Admin** setting up the app for the first time.
- A **Director** overseeing contracts for one or more departments/branches.
- A **Store Manager** responsible for contracts at a single branch.

---

## 2. Key Concepts (30-second primer)

A handful of ideas show up everywhere in the app. Skim these first — they'll save you time later.

### Roles

| Role | What they can do |
|---|---|
| **Super Admin** | Everything. Configures departments, branches, budgets, users, branding, Gmail, SMTP, the shared database. Sees company-wide data. |
| **Director** | Views and edits contracts in their assigned departments and branches. Cannot change settings. |
| **Store Manager** | Views and edits contracts at their one assigned branch only. |

### Scope

Every contract belongs to either a **department** (cross-branch) or a **store branch** (single location). Budgets are set at three levels: **Company**, **Department**, or **Branch**. The Dashboard and most list pages respect the scope selector in the top bar.

### Fiscal Year

Spend totals and the monthly spend chart are grouped by the current fiscal year. The fiscal year indicator sits in the top bar next to the scope switcher.

![App top bar showing scope and fiscal year](docs/images/topbar-scope-fiscal-year.png)

---

## 3. First Launch: Create Your Admin Account

The very first time anyone opens Contract Manager, the login screen asks you to create the first Super Admin account. This screen only appears once — whoever runs through it becomes the person with full control.

**Steps:**
1. Launch Contract Manager.
2. On the login screen, you'll see the heading **"Create your admin account"** (instead of "Sign in").
3. Enter your **Full Name**, **Email**, and **Password**.
4. Click **Create Admin Account**.
5. You'll be taken straight to the Dashboard.

![First-run Create Admin Account screen](docs/images/first-run-create-admin.png)

**What you just showed off:** a zero-friction install — no separate admin console, no license key screen, just one form and you're in.

---

## 4. Signing In

After the first admin exists, the screen behaves like a normal login.

**Steps:**
1. Launch Contract Manager.
2. Enter your **Email** and **Password**.
3. Click **Sign In**.
4. You land on the Dashboard. If your credentials are wrong, a red banner appears above the button.

![Sign-in screen](docs/images/sign-in.png)

---

## 5. Tour of the Interface

### The sidebar (left edge)

| Item | What it's for |
|---|---|
| ⊞ **Dashboard** | Charts, budget gauges, upcoming renewals, recent activity. |
| 📄 **Contracts** | Browse, search, and create contracts. |
| ✓ **Approvals** | Contracts waiting on your sign-off. Shows a count badge when any are pending. |
| § **Clauses** | The clause library — approved contract language and its fallbacks. |
| 📧 **Invoices** | Vendor billing emails pulled from Gmail. |
| ⚖ **Competitors** | Side-by-side price comparison against competing vendors. |
| 🗂 **Projects** | Vendor project tracker (Active / On Hold / Completed). |
| ⚙ **Settings** | Branding, org structure, budgets, approval rules, integrations, users, database. |
| 🕓 **Audit Log** | Every recorded change across the system — **Super Admin only**. |
| 🖥 **Assets** | IT inventory grid — **Super Admin only**. |

Your name and role show at the bottom of the sidebar, along with a **Sign out** button.

### The top bar

Two controls that affect almost every screen:
- **Scope switcher** — flip between Company-wide and a specific department/branch.
- **Fiscal year indicator** — the year everything is totaled against.

![Sidebar navigation and top bar](docs/images/interface-tour.png)

---

## 6. The Dashboard

The Dashboard is the app's showcase page. Everything here respects the scope chosen in the top bar.

### 6.1 Budget gauge

A radial gauge at the top-left shows the current scope's utilization:
- **Green** = 0–70 % (Within Budget)
- **Amber** = 70–90 % (Near Limit)
- **Red** = 90 %+ (Over Budget)

It also shows exact **Spent / Budget** dollar amounts.

### 6.2 Summary stat cards

Four at-a-glance numbers:
- **Total Contracts**
- **Active Contracts**
- **Expiring Soon** (anything renewing within 120 days)
- **Annual Spend**

### 6.3 Monthly spend trend

A chart of spend across the fiscal year. Use the toggle above the chart to flip between **Area**, **Bar**, and **Line** views. Hover any point for a formatted currency tooltip.

### 6.4 Contract status chart

A breakdown of Active / Expiring Soon / Expired / Pending contracts. Switch between **Donut**, **Bar**, and **Radial** layouts.

### 6.5 Budget breakdown panel

An expandable panel listing every branch and department with a progress bar, spent vs. budget, remaining dollars, and a status badge. Rows are sorted by utilization, so over-budget units float to the top. Click any row to drill into that unit's detail page.

### 6.6 Upcoming renewals

Contracts expiring in the next **120 days**, color-coded by urgency (30-day in red, 60-day in amber, 120-day in blue). Click any row to jump to the contract.

### 6.7 Recent invoices

Latest vendor billing emails imported from Gmail. Anything **> 5 %** over the budgeted amount is flagged red.

### 6.8 Vendor projects summary

Counts for **Active / On Hold / Completed** vendor projects, with colored dots.

![Dashboard overview with all widgets visible](docs/images/dashboard-overview.png)

**What you just showed off:** a single-glance operational view — budget health, upcoming risk (renewals), spend trajectory, invoice variance, and project status — all in one screen and all scope-aware.

---

## 7. Setting Up Your Organization (Super Admin)

Before you add contracts, teach the app about your company structure: departments, branches, budgets, and (optionally) your logo.

Everything here lives under **Settings** in the sidebar.

### 7.1 Add departments

1. Open **Settings → Departments**.
2. Type a department name (e.g. *IT*, *Marketing*, *Operations*) in the text box.
3. Click the **Add** button.
4. Repeat for every department.
5. To remove one, click the **×** next to its name.

### 7.2 Add store branches

1. Open **Settings → Store Branches**.
2. Enter the **Branch #** (a number) and the **Branch name**.
3. Click **Add**.
4. Repeat for every branch.

### 7.3 Set budgets

Budgets can be set three ways; set as many as you need.

1. Open **Settings → Budget Configuration**.
2. Pick a **Scope**: **Company Overall**, **Department**, or **Store Branch**.
3. If scoped to a department or branch, pick the specific one from the dropdown.
4. Pick the **Fiscal Year**.
5. Enter the **Total Budget ($)**.
6. Click **Save Budget**.

The Dashboard's budget gauge immediately reflects the new ceiling.

### 7.4 Upload your company logo

Dropping in a logo automatically re-skins the app with your brand colors.

1. Open **Settings → Branding**.
2. Click **Upload Logo** and select a PNG or JPG.
3. The app extracts the dominant colors from the image and applies them to the sidebar, buttons, and highlights.
4. Optionally tweak the brand color via the color swatch.

![Branding section with logo preview and color swatch](docs/images/settings-branding.png)

**What you just showed off:** a bespoke-looking deployment per customer with zero design work — upload a logo, get brand-consistent UI everywhere.

---

## 8. Managing Users & Roles (Super Admin)

Directors and Store Managers are added by a Super Admin from the same Settings page.

**Steps:**
1. Open **Settings → Users**.
2. Click **+ Add User**.
3. Fill in **Full Name**, **Email**, **Password**.
4. Pick a **Role**: *Super Admin*, *Director*, or *Store Manager*.
5. Depending on role, you'll see extra fields:
   - **Store Manager** → choose one branch (radio buttons).
   - **Director** → tick multiple branches and multiple departments (checkboxes).
   - **Super Admin** → no assignment; they see everything.
6. Click **Create User**.

To delete a user, click the **×** next to their row (you can't delete yourself).

![Create User modal showing role-specific assignment fields](docs/images/users-create.png)

**What you just showed off:** granular role-based access — a Store Manager only ever sees their branch, a Director only sees their assigned scope, and auditors can't accidentally see data that isn't theirs.

---

## 9. Adding Your First Contract

Head to **Contracts** in the sidebar. You'll see three tabs along the top: **Contracts**, **Search**, and **Contract Creation**.

To add a contract manually, Super Admins can click **+ New Contract** in the top-right of the page.

**Steps:**
1. Click **+ New Contract**.
2. Fill in the form:
   - **Vendor Name** (required).
   - **Contract Scope**: *Department* or *Store Branch*.
   - **Department** *(if department scope)* or **Branch** *(if branch scope)*.
   - **Cost Allocation** — for department contracts, you'll be asked whether to split the cost across branches/departments. Pick **No** to charge the whole thing to the owning department, or **Yes** to open the allocation editor and enter per-unit amounts.
   - **Start Date** and **End Date** (required).
   - **Monthly Cost** and **Annual Cost** (annual auto-fills from monthly).
   - **Total Contract Value**.
   - **POC Name / Email / Phone** — the vendor contact for this agreement.
3. Click **📁 Upload Contract File** to attach the signed PDF.
4. Click **Save**.

The new contract appears in the Contracts list immediately.

![New Contract modal with allocation editor expanded](docs/images/contract-new-modal.png)

**What you just showed off:** contracts that live at the right organizational level (dept vs branch) with optional fine-grained cost splits — useful when IT signs one contract that bills back to multiple stores.

---

## 10. Working With an Existing Contract

Click any row in the Contracts list to open its detail page. The header shows the vendor, dates, POC, and status. Below that sits a tab bar.

| Tab | What it does |
|---|---|
| **Overview** | Core contract info — status, financials, POC, dates. |
| **Line Items** | Editable table of individual items. Add a row, set description/quantity/unit price, and the total price is calculated for you. |
| **Renewals** | Historical record of previous renewals — date, previous cost, new cost, license-count change, reason. Click **+ Add Renewal** to record one. |
| **Notes** | Free-form vendor notes, stamped with the author and date. Click **+ Add Note**. |
| **Projects** | Vendor projects linked to this contract (active engagements, migrations, POCs). |
| **Competitors** | Competing offerings and their prices. Used by the Competitors page to show savings. |
| **Allocations** *(department contracts only)* | Per-branch cost split. Click **Edit Allocations** to open the editor, or **Calculate from Assets** to auto-split by asset counts (see §16). |

![Contract detail page with tabs visible](docs/images/contract-detail-tabs.png)

**What you just showed off:** every artifact about a vendor — pricing history, notes, projects, competing offers, cost splits — lives in one place next to the contract itself, not scattered across spreadsheets.

---

## 11. Searching & Filtering Contracts

The **Search** tab on the Contracts page is a full filter panel.

**Filters available (sticky left sidebar):**
- **Vendor Name**
- **Point of Contact**
- **Status** — multi-select: Active, Expiring Soon, Expired, Pending.
- **Cost** — choose the field (*Annual / Monthly / Total Value*) and operator (*Over / Under / Between / Any amount*).
- **Start Date** — From/To range.
- **End Date** — From/To range.
- **Department**
- **Branch**
- **Renews Within** — number of days.

Any active filter shows a "filtered" indicator at the top. Click **Clear all** to reset.

To save the current view out as a file, click **Export** in the page header (exports to CSV/Excel).

![Contracts → Search tab with filter sidebar](docs/images/contracts-search.png)

**What you just showed off:** instant answers to questions like *"Which contracts over $50 k/year are up for renewal in the next 60 days in the Operations department?"* — without touching a spreadsheet.

---

## 12. Bulk Importing Contracts

If you already track contracts in a spreadsheet, you don't need to re-enter them one by one.

**Steps:**
1. On the Contracts page header, click **↑ Import Contracts**.
2. Pick your CSV or Excel (`.xlsx`) file.
3. Map each column in the file to a contract field (Vendor, Start Date, Annual Cost, etc.).
4. Pick which **department** or **branch** each row belongs to (or map that from a column).
5. Review the preview.
6. Click **Import** to commit.

Rows with errors are flagged; valid rows are added in one shot.

![Import Contracts modal with column-mapping preview](docs/images/contracts-import.png)

**What you just showed off:** a clean on-ramp from whatever tracking you used before (a vendor spreadsheet, an export from another tool) into a structured database — no manual re-keying.

---

## 13. Tracking Renewals

Contract Manager watches every contract's end date and reminds you before each one lapses.

### How the schedule works

- Reminders fire at **120, 90, 60, and 30 days** before the end date.
- The scheduler runs once at app startup and then **daily at 9 AM**.
- Each contract/day combination fires only once — you won't get repeated notifications on the same milestone.

### Where reminders show up

- **Windows desktop notifications** from the scheduler. Reminders ≤30 days out are marked *critical*.
- **Dashboard → Upcoming Renewals** lists everything renewing in the next 120 days.
- **Email notifications** to relevant users, when SMTP is configured (see §18).

![Windows toast notification for a 30-day renewal](docs/images/renewal-toast.png)

**What you just showed off:** nothing lapses by accident — even if nobody opens the app, the scheduler runs in the background and fires a desktop toast.

---

## 14. Comparing Competitors

The **Competitors** page shows every active contract with at least one competing offering, and tells you which deal is currently best.

**To add competitor data:**
1. Open the contract's detail page (§10).
2. Switch to the **Competitors** tab.
3. Click **+ Add Competitor Offering**.
4. Enter: **Competitor Vendor**, **Offering Name**, **Price**, and optional **Notes**.
5. Save.

**To see the savings summary:**
1. Click **Competitors** in the sidebar.
2. Each contract is listed with its current annual cost.
3. Cards show a **"Save $X/yr"** badge if a competitor is cheaper, or a **"Best deal"** badge if the current vendor wins.
4. Click any card to expand a side-by-side comparison table.

![Competitors page with expanded savings comparison](docs/images/competitors.png)

**What you just showed off:** a built-in negotiation worksheet — when it's time to renegotiate, you already have competing quotes on file and the dollar savings calculated.

---

## 15. Vendor Projects Tracker

For ongoing vendor engagements beyond the core contract (a migration, a pilot, a support project), use the **Projects** page.

**Steps:**
1. Click **Projects** in the sidebar.
2. The top of the page shows three clickable stat cards — **Active**, **On Hold**, **Completed**. Click one to filter.
3. Click **+ Add Project**.
4. Pick the **Vendor/Contract**, enter a **Name**, **Status**, **Start/End Dates**, and **Description**.
5. Save.
6. To change status later, use the dropdown on the project card.

You can also add projects from a contract's **Projects** tab — they'll show up on this page automatically.

![Projects page with status filter and project cards](docs/images/projects.png)

**What you just showed off:** contracts and the work delivered under them stay connected — a renewal conversation can pull up *"these are the 4 projects we ran with this vendor last year"* in seconds.

---

## 16. IT Assets Inventory (Super Admin)

The **Assets** page (sidebar, visible only to Super Admins) is a grid that tracks how many computers, thin clients, servers, printers, and Ingenico terminals live at each branch.

**Why it matters:** department-level contracts (e.g. a single software license covering the whole company) can be auto-split across branches in proportion to asset counts. That means the branch with 120 machines pays more than the one with 12, without any manual math.

**Steps:**
1. Click **Assets** in the sidebar.
2. The grid shows one row per branch and one column per asset type.
3. Type a number into any cell.
4. Click **Save** at the top.

**To import from a spreadsheet:**
1. Click **Import**.
2. Pick your file.
3. Review the preview (any branch in the file that doesn't match an existing branch is flagged).
4. Click **Apply Import**.

**To use asset counts for a contract's allocation:**
1. Open the contract's detail page.
2. Go to the **Allocations** tab.
3. Click **Calculate from Assets**.
4. Review the auto-computed split, then **Save**.

![Assets grid with branches as rows and asset types as columns](docs/images/assets-grid.png)

**What you just showed off:** cost allocation that reflects reality — branches pay in proportion to what they actually use.

---

## 17. Gmail Integration

Contract Manager can pull vendor billing emails out of Gmail and turn them into Invoice records automatically.

### 17.1 Connecting Gmail (one-time, Super Admin)

1. Open **Settings → Gmail Integration**.
2. Click **Connect Gmail Account**.
3. Your browser opens the Google OAuth consent screen. Sign in and authorize.
4. Google shows you an authorization code.
5. Copy the code and paste it into the modal in the app.
6. Click **Connect**.

The section now shows the connected email address and a **Disconnect Gmail** button.

> Before this step will work, the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables must be set. See the `README.md`'s Gmail section for details.

### 17.2 Syncing invoices

1. Click **Invoices** in the sidebar.
2. Click **🔄 Sync Gmail** (top-right).
3. The app scans Gmail for billing emails, extracts amounts, matches vendors to contracts, and creates Invoice rows.

### 17.3 Reading the Invoices page

- Each card shows the email subject, sender, received date, vendor, **Amount**, and the **Budgeted** amount if the contract has one.
- A **variance badge** shows whether the invoice is over (red) or under (green) budget.
- A banner at the top of the page warns about invoices **>5 %** over their budgeted amount.
- Editors and above can remove rows.

![Invoices page with over-budget banner and variance badges](docs/images/invoices.png)

**What you just showed off:** an automated spend audit — the app pulls bills, reconciles them against the contracted amount, and surfaces overages without anyone opening a bank statement.

---

## 18. Email Notifications (SMTP)

Keep the team in the loop when contracts or budgets change.

**Steps:**
1. Open **Settings → Email Notifications**.
2. Turn on **Enable email notifications**.
3. Fill in:
   - **SMTP Host** (e.g. `smtp.gmail.com`)
   - **SMTP Port** (usually `587`)
   - **Username / Email**
   - **Password**
   - **From Address**
   - **Use SSL/TLS** checkbox (tick for port 465)
4. Click **Save Settings**.
5. Click **Send Test Email** to confirm the connection.

### Who gets notified

The app targets recipients by role and scope:
- **Super Admins** — all notifications.
- **Directors** — notifications that touch one of their assigned departments or branches.
- **Store Managers** — notifications that touch their branch.

Events that trigger an email:
- Contract created / updated / deleted.
- Budget updated.

![SMTP settings with Send Test Email button](docs/images/settings-smtp.png)

**What you just showed off:** the right people hear about the right changes — no "hey, did you know the Acme contract got renewed?" on Monday morning.

---

## 19. E-Signature via Documenso

If your organization uses [Documenso](https://documenso.com) for digital signatures, wire it up once and you can send contracts out for signature from inside the app.

**Steps:**
1. Open **Settings → E-Signature**.
2. Enter the **Documenso API URL** (for the hosted service, `https://app.documenso.com`).
3. Enter your **API Key**. Use the show/hide toggle if you want to double-check it.
4. Click **Save**.
5. Click **Test Connection** to confirm the credentials work.

![E-Signature settings with API URL and key fields](docs/images/settings-documenso.png)

**What you just showed off:** signatures live next to the contract record instead of in a separate inbox thread.

---

## 20. Sharing the Database Across Your Team

Contract Manager stores its data in a single SQLite file. Point every teammate's installation at the same file on a shared network drive, and you've got a shared database.

**Steps (on every teammate's machine):**
1. Place the database file on a network drive everyone can reach.
2. Open **Settings → Shared Database Location**.
3. Click **Select Network Folder** and pick the folder holding `contract-manager.db`.
4. The app restarts its connection against the shared file.

> **Note:** SQLite uses WAL mode for better concurrent reads. Avoid heavy writes from multiple users at the same moment — stagger bulk imports.

![Shared Database Location setting](docs/images/settings-shared-db.png)

**What you just showed off:** a 6-person team sharing a single source of truth without standing up a database server.

---

## 21. Department & Branch Drill-down

From the Dashboard's **Budget Breakdown** panel, click any row and you land on that unit's own detail page (`/department/:id` or `/branch/:id`). It's a focused, scoped version of the main dashboard:

- Back button to the Dashboard.
- Entity name with a **Department** or **Branch** badge.
- Budget status indicator (Within / Near / Over).
- Budget gauge, just for this unit.
- Stat cards: Total Contracts, Active, Annual Spend, Budget Remaining.
- Monthly spend trend, scoped.
- Upcoming renewals, scoped.

![Department detail page with scoped widgets](docs/images/org-detail.png)

**What you just showed off:** a Director can drill from company-wide to their own area in one click and see everything in context.

---

## 22. Approval Workflows

Contracts can be required to collect sign-off before they count as active.

### Setting up routing rules (Super Admin)

Go to **Settings → Approval Rules → + Add Rule**. A rule answers four questions:

| Field | What it does |
|---|---|
| **Applies To** | Company-wide, one department, or one branch. |
| **Cost Measured On** + **Minimum / Maximum** | The spend band that triggers the rule, measured on annual, monthly, or total contract value. Leave Maximum blank for "and above". |
| **Vendor Name Contains** | Optional. Restricts the rule to matching vendors — useful for a rule that only covers one supplier. |
| **Approver** | Either a named person, or anyone holding a role. |
| **Step Order** | Rules run lowest-to-highest. Step 2 doesn't see the contract until step 1 approves. |

A typical setup: "IT spend over $10k → Director" at step 1, and "Any spend over $50k → Super Admin" at step 2. A $75k IT contract then needs both, in that order.

### Submitting a contract

Open a contract, go to the **Approvals** tab, and click **Submit for Approval**. Before you confirm, the panel lists exactly which approvers it will route to. Add a note if the approvers need context.

While a contract is awaiting approval its status shows **pending** — it will not be counted as active on dashboards, and the nightly status sweep won't move it to active or expiring while it waits.

If no rule matches the contract, submitting simply records that no approval was required and leaves the contract alone.

### Approving or rejecting

Approvers see a count badge on the **Approvals** item in the sidebar. Open it to see everything waiting on you, then Approve or Reject with a comment.

- **Approving** the last step marks the contract approved and returns it to the normal date-driven lifecycle.
- **Rejecting** at any step ends the request, skips the remaining steps, and leaves the contract pending until it's revised and resubmitted.

Two rules are enforced regardless of what the app UI allows: you cannot approve a contract you submitted yourself (unless a rule names you personally as the approver), and steps must be decided in order.

### Withdrawing

The submitter — or a Super Admin — can withdraw an in-progress request from the Approvals tab. The contract returns to its normal status as if it had never been submitted.

![Approvals tab on a contract](docs/images/approvals-tab.png)

**What you just showed off:** spend controls that actually block, with separation of duties built in.

---

## 23. Version Control & Redlining

The **Versions** tab on a contract keeps the negotiation history.

### Capturing a version

Click **+ Capture Version**, then either paste the document text or click **Import from PDF / text file** to pull it out of a file. Give it a title ("Vendor's first markup") and a one-line summary of what changed.

Each version also snapshots the contract's commercial terms — dates, costs, contacts, renewal type — as they stood at capture time.

### Comparing

Pick any two versions in the **Compare Versions** panel and click **Compare**. You get:

- **Contract terms that changed** — a plain list of which commercial fields moved, and from what to what.
- **A redline** — insertions underlined in green, deletions struck through in red. A reworded sentence shows as one modified line with the changed words highlighted, not as a wholesale delete-and-retype.

Toggle between **Changes only** (hides untouched text, with two lines of context) and **Full redline** (the whole document).

### Restoring

**Restore Terms** on any version copies that version's commercial terms back onto the live contract. The document history is never rewritten — the restore is recorded as its own audit entry, so you can always see that it happened.

![Version comparison showing a redline](docs/images/version-redline.png)

**What you just showed off:** the negotiation trail, and the ability to answer "what did we actually agree to in March?"

---

## 24. Audit Trail

Every change is recorded permanently.

### On a single contract

The **History** tab on any contract shows its full timeline: creation, every field edit with its before and after value, notes added, approval submissions and decisions, versions captured, and restores.

### Across the whole system (Super Admin)

**Audit Log** in the sidebar shows everything, with filters for record type, action, user, and date range, plus a free-text search across record names, details, and users. **Export** writes the current filtered view to a spreadsheet for compliance requests.

Nothing in the app edits or deletes audit entries — the log is append-only.

![Audit log with filters](docs/images/audit-log.png)

**What you just showed off:** "who changed this, and when?" answered in seconds instead of never.

---

## 25. Clause Library

**Clauses** in the sidebar holds your approved contract language.

### How it's organised

Clauses are grouped by category, and each **standard** position can carry **fallback** or **alternative** variants beneath it — the positions you're willing to retreat to when a vendor pushes back. Each clause carries a risk level and a line of guidance telling a drafter when to reach for it.

The app ships with a starter set covering confidentiality, limitation of liability, termination, auto-renewal, payment terms, price-increase caps, data protection, indemnification, service levels, and governing law — most with their fallback position already written.

### Finding and using clauses

Search runs across titles, body text, and tags. Filter by category or type. **Copy** puts the clause text on your clipboard.

While drafting in **Contracts → Contract Creation**, the **§ Clause Library** toolbar button opens a picker that inserts the clause straight into your document with its title as a heading. Each insertion bumps the clause's usage counter, so you can see which language actually gets used.

### Maintaining the library

Directors and Super Admins can add, edit, and archive clauses; **+ Fallback** on a standard clause creates a variant already linked to its parent. Archiving hides a clause from drafting while keeping it for historical reference. Every change is recorded in the audit log.

![Clause library grouped by category](docs/images/clause-library.png)

**What you just showed off:** consistent contract language that doesn't depend on whoever drafted last remembering the right wording.

---

## 26. Signing Out

At the bottom of the sidebar, under your name and role, click **Sign out**. You're returned to the login screen immediately. No background session remains.

---

## 27. Troubleshooting & FAQ

**"I don't see the Assets page in the sidebar."**
Assets is Super Admin only. Ask a Super Admin to upgrade your role, or have them manage assets for you.

**"I submitted a contract for approval but nothing was routed."**
No approval rule matched it. Check the contract's **Approvals** tab — the Routing panel lists every rule that applies, and says so plainly when none do. Confirm the rule's scope (company / department / branch), its cost band, and that it's marked active in Settings → Approval Rules.

**"I can't approve my own contract."**
That's deliberate. A submitter can't clear their own request unless a rule names them personally as the approver. Have another approver decide it, or withdraw and have someone else submit.

**"An approver says they see nothing in their Approvals list."**
Steps are sequential — step 2's approver sees nothing until step 1 approves. Also check the step is assigned to them, either by name or by a role they actually hold.

**"A contract is stuck showing 'pending'."**
It's either awaiting approval or was rejected. Open its **Approvals** tab: approve the outstanding step, or withdraw the request to return the contract to its normal status. Contracts in the approval pipeline are deliberately excluded from the automatic status sweep, so dates alone won't move them.

**"The redline shows a whole line as deleted and re-added instead of highlighting the changed words."**
That happens when the two lines are too dissimilar to pair up — usually a genuinely rewritten paragraph rather than an edit. Comparing versions captured closer together gives a tighter redline.

**"Gmail sync imported 0 invoices."**
Make sure the Gmail account was connected recently (§17.1), that billing emails exist in the mailbox, and that the sender address vaguely matches a known vendor. If a message doesn't match a vendor name in your contracts, it won't be imported.

**"I'm not getting renewal toast notifications."**
The scheduler runs once at startup and again daily at 9 AM. If you launched the app after 9 AM, today's 9 AM check is skipped until the next day — but the startup check still runs. Confirm the contract's end date is exactly 120, 90, 60, or 30 days away (the window for each milestone is ±1 day).

**"My edits aren't visible to my teammates."**
Each teammate needs to point the app at the shared database (§20). If one person's copy is still using the local default, they have their own private data.

**"I uploaded a logo but the colors didn't change."**
Try a higher-resolution image. Color extraction samples the dominant colors from the PNG/JPG you provide; very small icons produce low-confidence palettes.

**"Test email fails but credentials look right."**
If you're using Gmail for SMTP, you'll need an **App Password**, not your regular Google account password. Generate one in your Google account's security settings.

---

*Questions, corrections, or a feature not covered here? Open an issue in the repository — the tutorial gets updated alongside the app.*
