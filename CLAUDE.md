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

## Architecture

Single **Node.js/Express** server (`server.js`) serving both a browser app (port 3000) and Microsoft Teams iframe (port 3001 via tunnel). One codebase — Teams is just a manifest pointing at the same Express routes.

- **Backend:** Express routes in `routes/` — each route reads/writes JSON files in `data/` directly via `fs.readFileSync`/`fs.writeFileSync`
- **Frontend:** Vanilla HTML/CSS/JS — no React/Vue/Angular, no bundler. Bootstrap 5.3 + Chart.js 4.4 loaded from CDN
- **Database:** JSON files in `data/` (users, tasks, leaves, settings, etc.) — no external DB
- **Auth:** `express-session` with file-based store in `.sessions/`, 8-hour TTL
- **Theme engine:** `GET /theme.css` is a **dynamic Express endpoint** (not a static file) that computes CSS variables from `data/settings.json` on every request

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

**Workflow auto-task creation:** When a user submits a leave or WFH request, the route handler automatically creates an approval task assigned to their manager in `data/tasks.json`. Approving/rejecting that task updates the original request. Multiple data files are mutated in a single operation.

**Role-based data filtering:** Routes filter data by user role — `admin`/`hr` see everything, `manager` sees team data, `employee` sees own data only. The role check happens inside each route handler.

**Teams iframe support:** `Content-Security-Policy` frame-ancestors header allows Teams/Outlook domains. `X-Frame-Options` is removed. `app.set('trust proxy', 1)` is required for ngrok HTTPS detection.

## Gotchas

- `/theme.css` is dynamic — changes to `data/settings.json` colors reflect immediately without restart
- JSON body limit is `10mb` in Express config (supports base64 logo upload)
- Sidebar collapse state is persisted in `localStorage` key `sidebarCollapsed`
- The heartbeat system (`/api/heartbeat` pinged every 30s) is critical for Teams — without it the iframe disconnects
- Demo users all use password `demo123` — passwords are plaintext in `data/users.json` (demo only)
- `?embed=1` query param triggers auto-login for Teams embedded mode
- Sessions stored as files in `.sessions/` — delete this directory to clear all sessions
- `data/settings.json` has only `colors.primary`, `colors.secondary`, `appName`, and `logoPath`
