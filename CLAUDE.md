# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm start` | Start server on ports 3000 (browser) + 3001 (Teams) |
| `npm run dev` | Start with nodemon (auto-restart on file changes) |
| `node teams-app/update-url.js <URL>` | Update Teams manifest with tunnel URL + repackage zip |

No build step, no test runner, no TypeScript. The server runs directly with `node server.js`.

**Environment variables:**
- `GROQ_API_KEY` — required for `/api/hr-chat` (Groq llama-3.3-70b-versatile model)
- `PORT` — overrides default port 3000

## Project Structure

```
├── server.js                  # Main Express server (ports 3000 + 3001)
├── package.json
├── start-tunnel.ps1           # Cloudflare tunnel launcher for Teams
├── routes/                    # Express route handlers (one per feature)
│   ├── auth.js                #   Login/logout, session management
│   ├── analytics.js
│   ├── appraisal.js
│   ├── attendance.js
│   ├── customize.js           #   Theme/branding settings
│   ├── directory.js
│   ├── finance.js
│   ├── goals.js
│   ├── helpdesk.js
│   ├── hr-chat.js
│   ├── leaves.js
│   ├── news.js
│   ├── policy.js
│   ├── tasks.js
│   └── wfh.js
├── views/                     # HTML pages (1-to-1 with public/js controllers)
│   ├── login.html
│   ├── landing.html           #   Dashboard / home page
│   ├── analytics.html
│   ├── appraisal.html
│   ├── attendance.html
│   ├── customize.html
│   ├── directory.html
│   ├── doc-chat.html          #   Document chat (AI feature)
│   ├── erp-dialogue.html      #   AI assistant pages (WIP — no matching route file)
│   ├── goals.html
│   ├── helpdesk.html
│   ├── leave-assistant.html   #   WIP — no matching route file
│   ├── leaves.html
│   ├── policy.html
│   ├── proposal-eval.html     #   Proposal evaluation (AI feature)
│   ├── quick-services.html
│   ├── resume-eval.html       #   Resume evaluation (AI feature)
│   ├── services.html
│   ├── tasks.html
│   ├── voice-agent.html       #   WIP — no matching route file
│   └── wfh.html
├── public/                    # Static assets served by Express
│   ├── css/
│   │   ├── variables.css      #   CSS variable defaults (overridden by /theme.css)
│   │   ├── global.css         #   Shared layout & component styles
│   │   └── pages.css          #   Page-specific styles
│   ├── js/
│   │   ├── api.js             #   Shared utilities (API, Layout, Heartbeat, UI)
│   │   ├── landing.js         #   Controller for landing/dashboard
│   │   ├── analytics.js
│   │   ├── appraisal.js
│   │   ├── attendance.js
│   │   ├── customize.js
│   │   ├── directory.js
│   │   ├── doc-chat.js        #   Document chat controller (AI feature)
│   │   ├── goals.js
│   │   ├── helpdesk.js
│   │   ├── leaves.js
│   │   ├── policy.js
│   │   ├── proposal-eval.js   #   Proposal evaluation controller (AI feature)
│   │   ├── quick-services.js
│   │   ├── resume-eval.js     #   Resume evaluation controller (AI feature)
│   │   ├── tasks.js
│   │   └── wfh.js
│   └── assets/
│       ├── logo.png
│       └── login-bg.jpg
├── data/                      # JSON "database" files
│   ├── users.json
│   ├── tasks.json
│   ├── leaves.json
│   ├── wfh.json
│   ├── attendance.json
│   ├── appraisals.json
│   ├── goals.json
│   ├── finance.json
│   ├── helpdesk.json
│   ├── news.json
│   ├── notifications.json
│   ├── policies.json
│   └── settings.json          #   Theme colors, app name, logo path
├── utils/
│   └── teamsNotify.js         # Teams channel notification helper
├── teams-app/                 # Teams tab app (main portal)
│   ├── server.js              #   Standalone Express server (port 3001)
│   ├── update-url.js          #   Update manifest with tunnel URL + repackage
│   ├── create-zip.js          #   Zip manifest into uploadable package
│   ├── manifest/              #   Teams manifest.json + icons
│   └── public/                #   Teams-specific static files
│       ├── js/teams-init.js   #     Teams SDK initialization
│       └── pages/tab.html     #     Tab iframe entry point
└── teams-app-tasks/           # Teams tab app (tasks-only view)
    ├── update-url.js
    └── manifest/
```

## Architecture

Single **Node.js/Express** server (`server.js`) serving both a browser app (port 3000) and Microsoft Teams iframe (port 3001 via tunnel). One codebase — Teams is just a manifest pointing at the same Express routes.

- **Backend:** Express routes in `routes/` — each route reads/writes JSON files in `data/` directly via `fs.readFileSync`/`fs.writeFileSync`
- **Frontend:** Vanilla HTML/CSS/JS — no React/Vue/Angular, no bundler. Bootstrap 5.3 + Chart.js 4.4 loaded from CDN
- **Database:** JSON files in `data/` (users, tasks, leaves, settings, etc.) — no external DB
- **Auth:** `express-session` with file-based store in `.sessions/`, 8-hour TTL
- **Theme engine:** `GET /theme.css` is a **dynamic Express endpoint** (not a static file) that computes CSS variables from `data/settings.json` on every request

## Deployment to Teams

1. **Local tunnel:** Run `.\start-tunnel.ps1` to launch Cloudflare tunnel and obtain a public URL
2. **Update Teams manifest:** Run `node teams-app/update-url.js <tunnel-url>` with the active tunnel URL — this updates the manifest and repackages the zip
3. **Upload to Teams:** The generated zip file is ready to upload to Microsoft Teams Admin Center
4. **Tasks-only variant:** `teams-app-tasks/` contains a separate manifest for a tasks-focused Teams view — use `teams-app-tasks/update-url.js` for that app

## Design Patterns

### MVC-like Separation (without a framework)

The app follows a manual MVC pattern using plain files instead of a framework:

| Layer | Location | Responsibility |
|---|---|---|
| **Model** | `data/*.json` + read/write helpers in each route | Data storage and access. Each route file defines its own `readX()` / `writeX()` closures using `fs.readFileSync`/`writeFileSync`. No shared ORM or model layer. |
| **View** | `views/*.html` | Structure-only HTML templates. No server-side templating — all dynamic content is injected by the client-side controller. |
| **Controller** | `public/js/*.js` (client) + `routes/*.js` (server) | Split across client and server. Server routes handle data logic and role-based filtering; client controllers handle DOM rendering, events, and API calls. |

### Request → Approval Workflow

Leave and WFH modules follow an identical workflow pattern:

1. **User submits request** → POST route creates a record in `data/leaves.json` (or `wfh.json`) with `status: 'pending'`
2. **Auto-task creation** → The same POST handler looks up the user's `managerId` from `data/users.json` and creates an approval task in `data/tasks.json` with `type: 'approval'` and `metadata: { leaveId }` (or `wfhId`)
3. **Manager approves/rejects** → PUT route updates both the original request's `status` and the linked task's `status` to `'completed'`, appending to the task's `history` array
4. **Cross-file mutation** — A single HTTP request writes to 2 JSON files atomically (request file + tasks file)

To add a new approval workflow, replicate this pattern: create a data file, a route with POST (create + auto-task) and PUT (review + sync task), and wire the `metadata` key so the task links back to the source record.

### Route File Template

Every route file follows this structure:
```javascript
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

// File paths
const dataPath = path.join(__dirname, '../data/feature.json');

// Read/write closures (per-file, not shared)
const readData  = () => JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const writeData = d  => fs.writeFileSync(dataPath, JSON.stringify(d, null, 2));

// Auth guard (redeclared in every route file)
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// GET  — list (with role-based filtering)
// POST — create
// PUT  — update
// DELETE — remove (where applicable)

module.exports = router;
```

### Frontend Controller Template

Every page controller in `public/js/` follows this lifecycle:
```javascript
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('pageName');   // Sidebar, user info, heartbeat
  await loadData();                // Fetch from API, store in module-level array
  bindEvents();                    // Attach click/submit handlers
});
```

Key conventions:
- **Module-level arrays** (`let allLeaves = []`) hold fetched data for re-rendering without re-fetching
- **Render functions** (`renderMyLeaves()`, `renderPendingApprovals()`) rebuild DOM from the module-level array
- **After mutations**, call the load function again (`await loadLeaves()`) to refresh all views
- **Bootstrap modals** are used for forms and confirmations via `bootstrap.Modal.getOrCreateInstance()`
- **`UI.toast()`** for all user feedback — no `alert()` calls

### Role-Based Data Filtering

Filtering is done inside each route handler (not middleware):
```javascript
if (user.role === 'employee') {
  records = records.filter(r => r.userId === user.id);
}
// admin, hr, manager → see all records
```

There is no centralized RBAC middleware. Each route decides its own visibility rules.

### Shared Utility Layer (`public/js/api.js`)

All client-side code depends on a single shared module that provides four namespaces:
- **`API`** — fetch wrappers (`get`, `post`, `put`, `del`) with auto 401 redirect
- **`Layout`** — sidebar init, user info, notification badge, embed mode detection
- **`Heartbeat`** — 30s keep-alive ping with auto-reload on failure
- **`UI`** — toast notifications, date formatting, status/priority badge generators

### AI Features

- **HR Chat** (`/api/hr-chat`) — Uses Groq llama-3.3-70b-versatile model; requires `GROQ_API_KEY` environment variable. Integrated via `routes/hr-chat.js`
- **Document Chat** (`doc-chat.html` / `public/js/doc-chat.js`) — Upload PDFs → POST `/api/general/ingest` to get a `session_id` → POST `/api/general/query` with accumulated `chat_history` for conversational Q&A
- **Proposal Evaluation** (`proposal-eval.html` / `public/js/proposal-eval.js`) — AI-powered proposal analysis
- **Resume Evaluation** (`resume-eval.html` / `public/js/resume-eval.js`) — AI-powered resume screening

The three document AI features (doc-chat, proposal-eval, resume-eval) all proxy through `routes/doceval.js`, mounted at `/api/doceval-proxy`. This is a transparent server-side proxy to an external Heroku service (`doceval-8362469192e8.herokuapp.com`) — it exists solely to avoid CORS issues. No auth guard on this route.

### Dynamic Theming

Theme colors flow through a single pipeline:
1. Admin updates colors via `/customize` → saved to `data/settings.json`
2. Every page loads `<link href="/theme.css">` — this is a dynamic Express endpoint, not a static file
3. `server.js` reads `settings.json` on each request and computes CSS variables (shades, tints, RGB values)
4. All styles reference CSS variables (`--color-primary`, etc.) — never hard-coded hex values

## Key Conventions

**1-to-1 view/controller pairing:** Every `views/X.html` has exactly one `public/js/X.js` controller. The HTML has structure only; the JS handles all API calls, DOM updates, and events. No page shares a controller.

**Shared utilities in `public/js/api.js`:** All page controllers import this. It provides:
- `API.get/post/put/del()` — fetch wrapper with credential inclusion, auto-redirect on 401
- `Layout.init(activePage)` — sidebar, user info, notifications setup
- `Heartbeat.start()` — 30s ping to `/api/heartbeat` (keeps Teams iframe alive)
- `UI.toast/formatDate/statusBadge/priorityBadge()` — common UI helpers

**Every controller follows this pattern:**
```javascript
document.addEventListener('DOMContentLoaded', async () => {
  await Layout.init('pageName');
  await loadData();
  bindEvents();
});
```

**CSS variables only** — never hard-code hex colors. Use `--color-primary`, `--color-secondary`, and their computed shades defined in `/theme.css`. Defaults are in `public/css/variables.css`.

## Cross-Cutting Concerns

**Dynamic cookie security:** Middleware in `server.js` detects HTTPS (tunnel) vs HTTP (localhost) and upgrades session cookies to `SameSite=None; Secure` for Teams iframe compatibility. Both ports serve the same app.

**Workflow auto-task creation:** When a user submits a leave or WFH request, the route handler automatically creates an approval task assigned to their manager in `data/tasks.json`. Approving/rejecting that task updates the original request. Multiple data files are mutated in a single operation. Tasks also support comments (`/:id/comment`), delegation (`/:id/delegate`), reassignment (`/:id/reassign`), and escalation (`/:id/escalate`) — tracked via `history[]`, `comments[]`, `delegatedFrom`, and `escalated` fields on the task object.

**Teams activity notifications:** `utils/teamsNotify.js` sends Teams activity feed notifications via Microsoft Graph API when leaves are submitted or decided. Requires a `teamsGraph` object in `data/settings.json` with `tenantId`, `clientId`, `clientSecret`, and an Azure AD app registration with `TeamsActivity.Send` permission. If not configured, notifications are silently skipped.

**Role-based data filtering:** Routes filter data by user role — `admin`/`hr` see everything, `manager` sees team data, `employee` sees own data only. The role check happens inside each route handler.

**Teams iframe support:** `Content-Security-Policy` frame-ancestors header allows Teams/Outlook domains. `X-Frame-Options` is removed. `app.set('trust proxy', 1)` is required for ngrok HTTPS detection.

## Gotchas

- `/theme.css` is dynamic — changes to `data/settings.json` colors reflect immediately without restart
- JSON body limit is `10mb` in Express config (supports base64 logo upload)
- Sidebar collapse state is persisted in `localStorage` key `sidebarCollapsed`
- The heartbeat system (`/api/heartbeat` pinged every 30s) is critical for Teams — without it the iframe disconnects
- Demo users all use password `demo123` — passwords are plaintext in `data/users.json` (demo only)
- `?embed=1` query param triggers auto-login for Teams embedded mode
- **Data reset:** To reset all data to defaults, delete or truncate files in `data/` — there is no migration system
- **Session reset:** Delete the `.sessions/` directory to log out all users (sessions stored as files here)
- `data/settings.json` full structure: `colors.primary` (default `#198D87`), `colors.secondary` (default `#2C3E50`), `appName`, `logoPath`, and optionally `teamsGraph: { tenantId, clientId, clientSecret }`
- Entity IDs are auto-generated as a type prefix + first 8 chars of uuid (e.g. `L4A7F8C9` for leaves, `T2B5D6E1` for tasks, `W3A4F2G1` for WFH, `HD9B1C3D` for helpdesk). Helpdesk tickets additionally get a human-readable `ticketNo` in `TKT-YYYY-NNN` format
- **WIP/Incomplete pages:** `erp-dialogue.html`, `leave-assistant.html`, `voice-agent.html` exist with HTML but lack JS controllers — do not rely on these functioning
