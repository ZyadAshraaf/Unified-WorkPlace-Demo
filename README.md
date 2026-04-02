# Unified Workspace — Project Reference

## Overview

**Unified Workspace** is a centralized web portal that acts as a single integration layer and unified user interface across all enterprise systems (ERP, CRM, Warehouse, HR, Attendance, Accounting, etc.). Instead of users juggling multiple system logins and interfaces, they interact with one portal that aggregates data, tasks, and services from all underlying systems.

The app runs as a **single Node.js/Express server** and can be accessed from both a **browser** and **Microsoft Teams** simultaneously. There is only one codebase — the Teams app is just a thin manifest that tells Teams to load pages from this server inside an iframe.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Express Server (server.js)               │
│                     Ports: 3000 (browser) + 3001 (Teams/ngrok)  │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ Auth     │  │ API      │  │ View      │  │ Theme Engine  │  │
│  │ Session  │  │ Routes   │  │ Routes    │  │ /theme.css    │  │
│  │ Cookies  │  │ /api/*   │  │ HTML pages│  │ dynamic CSS   │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────────┘  │
│                          │                                      │
│                    ┌─────┴─────┐                                │
│                    │ data/*.json│  (file-based database)        │
│                    └───────────┘                                │
└───────────┬─────────────────────────────┬───────────────────────┘
            │                             │
     ┌──────┴──────┐              ┌───────┴────────┐
     │   Browser   │              │  Microsoft     │
     │ localhost   │              │  Teams         │
     │  :3000      │              │  (via ngrok    │
     │             │              │   → :3001)     │
     │ Normal      │              │ iframe loads   │
     │ HTTP cookie │              │ same pages     │
     └─────────────┘              │ SameSite=None  │
                                  │ Secure cookie  │
                                  └────────────────┘
```

### Key Architecture Decisions

- **One codebase, two access points** — The Express server listens on port 3000 (browser) and port 3001 (ngrok tunnel for Teams). Both serve the exact same routes and pages.
- **No separate Teams code** — The `teams-app/` folder contains only a manifest.json, icons, and a URL-update script. All UI and logic lives in the main Express app.
- **Dynamic cookie security** — A middleware detects HTTPS (ngrok) vs HTTP (localhost) and upgrades cookie attributes accordingly, so login works in both contexts without code changes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Frontend | HTML, CSS, Bootstrap 5.3, Vanilla JS |
| Icons | Bootstrap Icons 1.11 (CDN) |
| Charts | Chart.js 4.4 (CDN) |
| Database | JSON files (file-based, no external DB) |
| Auth | `express-session` (session-based) |
| Styling | Dynamic CSS Variables via `/theme.css` endpoint |
| Logo | WIND-IS branding (`public/assets/logo.png`) |
| Teams Integration | Teams manifest + ngrok tunnel |

---

## Color & Theme System

Themes are **fully dynamic** — colors are stored in `data/settings.json` and served via a `/theme.css` Express endpoint. No server restart is needed when colors change.

### How It Works

1. `data/settings.json` stores the primary & secondary hex colors
2. `server.js` has color utility functions (`shade`, `mixWhite`, `hexToRgb`) that compute all shades automatically
3. `GET /theme.css` reads settings and returns computed CSS variables on every request (`Cache-Control: no-cache`)
4. Every HTML page includes `<link rel="stylesheet" href="/theme.css">` which overrides the defaults in `variables.css`

### Default CSS Variables

```css
:root {
  --color-primary:         #198D87;
  --color-primary-dark:    computed;
  --color-primary-darker:  computed;
  --color-primary-light:   computed;
  --color-primary-lighter: computed;
  --color-primary-faint:   computed;
  --color-primary-rgb:     computed;
  --color-secondary:       #2C3E50;
  --color-secondary-light: computed;
  --color-border:          computed;
  --color-surface:         computed;
  --sidebar-bg:            same as primary;
}
```

All components must use these variables — never hard-code hex values in component CSS.

---

## Application Structure

```
unified-workspace/
├── server.js                   # Express entry point + theme engine + Teams iframe support
├── package.json                # Dependencies: express, express-session, uuid
├── .gitignore                  # Ignores node_modules/
├── routes/
│   ├── auth.js                 # Login/logout, session management
│   ├── tasks.js                # Full CRUD + delegate, reassign, escalate, comment
│   ├── leaves.js               # Submit leave, approve/reject (creates manager task)
│   ├── analytics.js            # Summary, tasks-by-system/status/priority, leave-summary
│   ├── goals.js                # Goals & OKR CRUD
│   ├── appraisal.js            # Performance appraisal management
│   ├── attendance.js           # Attendance records
│   ├── helpdesk.js             # Support ticket CRUD
│   ├── policy.js               # Keyword search across policies
│   ├── news.js                 # News/announcements
│   ├── directory.js            # Organization directory
│   └── customize.js            # Theme settings, logo upload, reset
├── data/                       # JSON file-based database
│   ├── users.json              # 6 demo users (admin, manager, hr, employee)
│   ├── tasks.json              # 12 tasks from various source systems
│   ├── leaves.json             # Leave records
│   ├── notifications.json      # User notifications
│   ├── news.json               # Company news & announcements
│   ├── policies.json           # Company policies (searchable)
│   ├── helpdesk.json           # Support tickets
│   ├── goals.json              # Goals & OKR records
│   ├── appraisals.json         # Performance appraisal records
│   ├── attendance.json         # Attendance punch records
│   └── settings.json           # Theme config (colors, appName, logoPath)
├── public/
│   ├── css/
│   │   ├── variables.css       # CSS variable defaults (overridden by /theme.css)
│   │   └── global.css          # Full design system (sidebar, topbar, cards, tables, etc.)
│   ├── js/
│   │   ├── api.js              # Shared utility: API.get/post/put/del, Layout.init(), UI helpers
│   │   ├── landing.js          # Controller: landing/home page
│   │   ├── tasks.js            # Controller: unified task list
│   │   ├── leaves.js           # Controller: leave requests
│   │   ├── analytics.js        # Controller: analytics & charts
│   │   ├── goals.js            # Controller: goals & OKR
│   │   ├── appraisal.js        # Controller: performance appraisal
│   │   ├── attendance.js       # Controller: attendance statistics
│   │   ├── policy.js           # Controller: AI policy assistant
│   │   ├── helpdesk.js         # Controller: help desk
│   │   ├── directory.js        # Controller: organization directory
│   │   └── customize.js        # Controller: theme customization
│   └── assets/
│       ├── logo.png            # WIND-IS logo (used in sidebar + topbar)
│       └── login-bg.jpg        # Login page cityscape background photo
├── views/
│   ├── login.html              # Login form (no sidebar)
│   ├── landing.html            # Portal home — analytics cards, quick access, announcements
│   ├── tasks.html              # Unified task list
│   ├── leaves.html             # Leave request self-service
│   ├── analytics.html          # Charts & KPIs
│   ├── goals.html              # Goals & OKR
│   ├── appraisal.html          # Performance appraisal
│   ├── attendance.html         # Attendance statistics
│   ├── policy.html             # AI policy assistant
│   ├── helpdesk.html           # Help desk & tickets
│   ├── directory.html          # Organization directory
│   ├── customize.html          # Theme customization (colors, logo)
│   └── services.html           # AI Use Cases catalog (14 GenAI demos)
└── teams-app/                  # Microsoft Teams integration (manifest only)
    ├── manifest/
    │   ├── manifest.json       # Teams app manifest (URLs point to Express app)
    │   ├── color.png           # Teams app icon (192x192)
    │   ├── outline.png         # Teams app icon (32x32, transparent)
    │   └── Unified Workplace.zip  # Ready-to-upload Teams package
    ├── update-url.js           # Script to update ngrok URL + repackage zip
    └── create-zip.js           # Legacy zip creation script
```

---

## Microsoft Teams Integration

### How It Works

The Teams app is **not a separate application** — it's a manifest file that tells Microsoft Teams to load the Express app's pages inside an iframe. There is zero duplicated code.

```
User clicks "Unified Workspace" in Teams
    → Teams reads manifest.json
    → manifest says: load https://<ngrok-url>/
    → ngrok forwards to localhost:3001
    → Express serves the same landing.html as localhost:3000
    → User sees the exact same app inside Teams
```

### Why This Matters

- **One change, both updated** — Edit any HTML/JS/CSS file and both browser and Teams reflect it immediately on refresh
- **No Teams-specific code** — The sidebar, topbar, charts, forms — everything is shared
- **Normal login flow** — Users log in normally inside Teams (same login page)

### Technical Details

1. **Iframe headers** — `server.js` sets `Content-Security-Policy: frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.skype.com` to allow Teams to embed the app
2. **Proxy trust** — `app.set('trust proxy', 1)` so Express correctly reads `X-Forwarded-Proto: https` from ngrok
3. **Dynamic cookie upgrade** — A middleware detects HTTPS requests (ngrok/Teams) and sets `SameSite=None; Secure` on the session cookie at runtime. HTTP requests (localhost) use normal cookies. This is critical — without it, the browser blocks cookies in the Teams iframe and login fails in a redirect loop
4. **Dual port listening** — The server listens on port 3000 (browser) and port 3001 (ngrok). This avoids conflicts with any other local services and keeps the ngrok tunnel stable

### Setting Up Teams Integration

```bash
# 1. Start ngrok pointing to port 3001
ngrok http 3001

# 2. Copy the ngrok HTTPS URL (e.g. https://xxxx.ngrok-free.app)

# 3. Update the manifest and repackage the zip
node teams-app/update-url.js https://xxxx.ngrok-free.app

# 4. Upload the zip to Teams
#    → Teams → Apps → Manage your apps → Upload an app
#    → Select: teams-app/manifest/Unified Workplace.zip

# 5. Open the app in Teams — it loads the login page, log in normally
```

### When ngrok URL Changes

Every time you start a new ngrok session, the URL changes. Just re-run:

```bash
node teams-app/update-url.js https://NEW-URL.ngrok-free.app
```

Then re-upload the zip to Teams. No code changes needed.

### Teams Manifest Structure

The manifest (`teams-app/manifest/manifest.json`) defines:
- **One static tab** ("Home") pointing to the Express app root `/`
- Once logged in, the user navigates to all other pages (Tasks, Leaves, Analytics, etc.) via the sidebar — just like in the browser
- `validDomains` is set to the ngrok domain so Teams allows the connection

---

## Pages & Features

### 1. Login Page
- Username + password authentication
- Role-based access (Employee, Manager, HR, Admin)
- Session stored via `express-session`
- Demo credentials: any user with password `demo123`
- **Redesigned UI** — full-screen cityscape background (`login-bg.jpg`) with two-layer blur/sharp photo system and film-grain texture overlay
- **Light-themed login panel** — white card on right with brand `#198D87` teal accents
- **Top info bar** — displays company logo, city, next prayer time, weather, live clock and date
- **Prayer times widget** — shows all 5 daily prayer times with the next prayer highlighted
- **Stats bar** — employee count, active modules, and departments displayed over the background

---

### 2. Landing Page (Portal Home)

The main hub after login. Features a futuristic, glassy UI with color-tinted cards and floating background orbs.

| Section | Description |
|---|---|
| **Welcome Banner** | Gradient greeting with user name, subtitle, and current date badge |
| **Metric Cards** | Glassy stat cards with color gradients — Pending Tasks, Leave Balance, Days Present, Open Tickets. Each has a trend indicator and accent top-bar |
| **Analytics Row** | Three chart cards: Task Overview (donut), Tasks by System (horizontal bar), Quick Access (shortcut tiles). Each card has its own color tint (teal, blue, violet) |
| **Recent Tasks** | Latest non-completed tasks with status dots, system badges, priority, and due dates |
| **Announcements** | Company news feed at the bottom |

**UI Design:** Corporate tech / B2B sales style with glassmorphism effects (backdrop-filter blur, translucent backgrounds), colored gradient orbs floating in the background, and subtle hover animations.

The landing page has a **collapsible sidebar** with burger menu toggle in the topbar. The WIND-IS logo appears in both the sidebar header and the topbar.

---

### 3. Unified Task List (Core Page)

Aggregates tasks from **all systems** (HR, Accounting, CRM, Warehouse, IT) into one unified list.

#### Task Table Contains:
- Priority badge, task title + description, source system badge, due date, status
- Tasks are **grouped by department/system** with a clearly styled section heading (e.g. HR, Accounting, IT) and task count
- A modern horizontal divider separates each task row
- "Assigned To" column is intentionally omitted — tasks shown are always the logged-in user's own tasks

#### Task Actions:
| Action | Description |
|---|---|
| **View Details** | Full task info, history, attachments |
| **Complete / Approve / Reject** | Context-aware action per task type |
| **Delegate** | Transfer task to another user temporarily |
| **Reassign** | Permanently move task to different user |
| **Create New Task** | Manual task creation with assignment |
| **Escalate** | Escalate with reason, auto-notify manager |
| **Search & Filter** | By system, status, priority, keyword |
| **View History** | Full audit trail of all actions |
| **Add Comment** | Internal notes on the task |

#### Task Status Flow:
```
New → In Progress → Pending Approval → Completed / Rejected / Escalated
```

---

### 4. Self-Service — Leave Requests
- Submit leave request (type, dates, reason)
- Manager receives approval task in their Task List
- Employee sees live status update
- Leave balance tracked in JSON

---

### 5. Analytics Page
- Charts and KPIs pulled from JSON data
- Sections: Tasks by system, tasks by status, tasks by priority, leave summary
- Library: Chart.js 4.4

---

### 6. Goals & OKR Page
- Set personal / team goals
- Progress tracking (%)
- Manager review and sign-off

---

### 7. Employee Performance Appraisal
- Appraisal cycles (quarterly, annual)
- Self-assessment + Manager assessment
- Rating scale + comments
- Historical records per employee

---

### 8. Attendance Statistics
- Daily punch in/out log
- Monthly attendance overview
- Late arrivals, absences, overtime

---

### 9. Internal Policy AI Assistant
- Chat-style interface
- User asks questions in natural language
- Keyword search across `policies.json`
- Returns relevant policy excerpts with bold highlights

---

### 10. Help Desk
- Submit support ticket (category, priority, description)
- Ticket status tracking (Open, In Progress, Resolved, Closed)
- Internal comments

---

### 11. Organization Directory
- Employee search (name, department, role)
- Employee profile cards
- Department listing

---

### 12. AI Use Cases

A curated catalog of **14 live GenAI demos** built on the WIND-IS platform, accessible directly from the portal.

| Demo | Description |
|---|---|
| Smart Document Chat | AI chat with document upload for tailored responses |
| Health Assistant | Appointment companion and condition awareness chat |
| Intelligent ERP Dialogue | Chat with ERP data (invoices, POs, stock) via AI-generated SQL |
| HR Policy Advisor | Employee inquiries on company policies |
| HR Self-Service Assistant | Submit self-service requests through conversation |
| Banking Assistant | Customer support for banking products via uploaded documents |
| Insurance Assistant | Gathers location/images and submits insurance reports |
| Global Quality Process | Identifies sensitive ingredients in medical or medicine packages |
| Sales Portal | Sales insights, promotion planning, and risk assessment |
| Customer Portal | Customer enquiries and refund requests |
| Document Evaluator | Evaluates proposals against provided criteria |
| Speech to Text | Speech to text and summarization |
| Leave Request Voice Agent | Real-time voice agent for processing leave requests |
| Loan Calculator | EMI by DTI calculator with loan tips |

Each card links directly to its live demo URL and opens in a new tab.

---

### 13. Customize Page
- Change primary and secondary colors via color pickers or hex input
- Auto-generated shade palette preview
- Upload new logo (base64 — no multer dependency)
- Live preview panel showing mini sidebar, stat cards, buttons, badges
- Reset to Defaults button
- Changes apply immediately on save (no server restart needed)

---

## UI Layout

### Sidebar
- Collapsible via burger menu icon in the topbar — works on both desktop (slides out with CSS class toggle, state persisted in localStorage) and mobile (overlay mode)
- Navigation links to all modules
- Colored with `--sidebar-bg` (matches primary color)

### Topbar
- Burger menu toggle (shows/hides sidebar on all screen sizes)
- WIND-IS logo (compact, next to toggle)
- Page title
- Search bar, notification bell, user dropdown
- User dropdown includes: **Customize** link + **Sign Out**

---

## Navigation Menu Structure

```
Sidebar:
├── Home (Landing Page)
├── My Tasks
├── Service Catalog (AI Use Cases)
├── Leave Requests
├── Analytics
├── Goals & OKR
├── Performance Appraisal
├── Attendance
├── Policy Assistant
├── Help Desk
└── Directory

User Dropdown:
├── Customize
└── Sign Out
```

---

## Role-Based Access

| Role | Access |
|---|---|
| **Employee** | Landing, My Tasks, Self-Service, Attendance, Goals, Help Desk, Directory, Policy AI |
| **Manager** | All Employee access + team tasks, approve/reject, team analytics, appraisals |
| **HR Admin** | All Manager access + all employees data, appraisal cycles, attendance admin |
| **System Admin** | Full access + user management, system config, customize |

### Demo Users

| Username | Role | Password |
|---|---|---|
| ahmed | admin | demo123 |
| khalid | manager | demo123 |
| fatima | hr | demo123 |
| sara | employee | demo123 |
| omar | employee | demo123 |
| mariam | manager | demo123 |

---

## Data Model (JSON Files)

### users.json
```json
{
  "id": "u001",
  "name": "Ahmed Al-Rashidi",
  "username": "ahmed",
  "email": "ahmed@company.com",
  "role": "admin",
  "department": "IT",
  "managerId": null
}
```

### tasks.json
```json
{
  "id": "t001",
  "title": "Approve Leave Request - Sara",
  "sourceSystem": "HR",
  "type": "approval",
  "priority": "high",
  "status": "pending",
  "assignedTo": "u001",
  "createdBy": "u005",
  "createdAt": "2026-03-20T09:00:00Z",
  "dueDate": "2026-03-25T00:00:00Z",
  "description": "Sara has requested annual leave for 5 days.",
  "history": [],
  "comments": [],
  "escalated": false
}
```

### settings.json
```json
{
  "colors": {
    "primary": "#198D87",
    "secondary": "#2C3E50"
  },
  "appName": "Unified Workspace",
  "logoPath": "/assets/logo.png"
}
```

---

## Key Design Principles

1. **Unified Experience** — One login, one interface, all systems.
2. **Task-Centric** — Everything actionable surfaces as a task in the unified task list.
3. **Role-Aware** — UI and data adapt to user role without separate portals.
4. **Lightweight** — No database engine; JSON files for simplicity and portability.
5. **Dynamic Theming** — Colors and logo changeable at runtime via Customize page, no restart needed.
6. **Mobile Responsive** — Bootstrap grid, collapsible sidebar, all pages work on tablet and phone.
7. **Extensible** — New systems connect by pushing tasks into `tasks.json` via API route.
8. **1-to-1 Convention** — Every `views/x.html` has exactly one `public/js/x.js` controller.
9. **Single Codebase for Teams** — Teams loads the same Express pages via iframe; no duplicate code.

---

## Development Notes

- Express serves static files from `/public` and HTML views from `/views`
- All data read/write goes through route handlers — frontend never reads JSON directly
- Bootstrap 5.3 via CDN for layout, components, and utilities
- Chart.js 4.4 via CDN for all charts
- No frontend framework (React/Vue) — plain JS with fetch API calls
- Session management via `express-session`
- JSON body limit set to `10mb` (to support base64 logo upload)
- `/theme.css` is a dynamic Express endpoint, not a static file
- Logo upload uses base64 encoding (FileReader → JSON POST → Buffer.from → fs.writeFileSync)
- `app.set('trust proxy', 1)` is required for ngrok/HTTPS cookie handling
- Sidebar collapse state is persisted in `localStorage` key `sidebarCollapsed`

### Server Ports

| Port | Purpose | Cookie Mode |
|---|---|---|
| 3000 | Browser access (default) | Normal HTTP cookies |
| 3001 | Teams/ngrok tunnel | `SameSite=None; Secure` (auto-detected) |

The dual-port setup is defined at the bottom of `server.js`. Both ports serve the same Express app instance.

### Teams-Specific Server Behavior

These are handled by middleware in `server.js` and apply to **all requests** (they don't break browser access):

1. **`Content-Security-Policy` header** — allows `frame-ancestors` for `teams.microsoft.com` and `*.skype.com`
2. **`X-Frame-Options` removal** — Express/Helmet sometimes sets this; we explicitly remove it so Teams iframe works
3. **Cookie upgrade middleware** — checks `req.secure` (or `X-Forwarded-Proto: https`) and upgrades the session cookie to `SameSite=None; Secure` for that request only. HTTP requests are unaffected.

---

## Page & Controller Convention

Every page follows a strict 1-to-1 pairing:

| View (HTML) | Controller (JS) | Purpose |
|---|---|---|
| `views/login.html` | inline script | Auth form, login logic |
| `views/landing.html` | `public/js/landing.js` | Portal home, analytics, quick access |
| `views/tasks.html` | `public/js/tasks.js` | Unified task list |
| `views/leaves.html` | `public/js/leaves.js` | Leave request self-service |
| `views/analytics.html` | `public/js/analytics.js` | Charts & KPIs |
| `views/goals.html` | `public/js/goals.js` | Goals & OKR |
| `views/appraisal.html` | `public/js/appraisal.js` | Performance appraisal |
| `views/attendance.html` | `public/js/attendance.js` | Attendance statistics |
| `views/policy.html` | `public/js/policy.js` | AI policy assistant |
| `views/helpdesk.html` | `public/js/helpdesk.js` | Help desk & tickets |
| `views/directory.html` | `public/js/directory.js` | Organization directory |
| `views/customize.html` | `public/js/customize.js` | Theme customization |
| `views/services.html` | inline script | AI Use Cases catalog |

**Rules:**
- The HTML file contains only structure and markup — no inline logic
- The JS controller handles all API calls, DOM updates, and event listeners
- Every controller imports `api.js` as the shared fetch utility
- No page shares a controller; no controller handles more than one page

---

## Setup & Running the Application

### Prerequisites

- **Node.js** v16 or higher — [download here](https://nodejs.org)
- **npm** (comes bundled with Node.js)
- **ngrok** (only if you need Teams integration) — [download here](https://ngrok.com)

### Step-by-Step Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd unified-workspace

# 2. Install all dependencies
npm install

# 3. Start the application
npm start
```

The server will start on **http://localhost:3000** (browser) and **http://localhost:3001** (Teams/ngrok).

### Login

Open **http://localhost:3000** in your browser. Use any demo account:

| Username | Password | Role |
|---|---|---|
| ahmed | demo123 | Admin |
| khalid | demo123 | Manager |
| fatima | demo123 | HR |
| sara | demo123 | Employee |
| omar | demo123 | Employee |
| mariam | demo123 | Manager |

### Development Mode (Auto-Restart)

For development with automatic restart on file changes:

```bash
npm run dev
```

This uses `nodemon` to watch for changes and restart the server automatically.

### Quick Reference

| Command | What it does |
|---|---|
| `npm install` | Installs express, express-session, uuid, nodemon |
| `npm start` | Starts the server (`node server.js`) on ports 3000 + 3001 |
| `npm run dev` | Starts with nodemon (auto-restart on file changes) |
| `node teams-app/update-url.js <URL>` | Updates Teams manifest with ngrok URL + repackages zip |

### Teams Setup (Optional)

```bash
# 1. Start ngrok
ngrok http 3001

# 2. Update manifest with ngrok URL
node teams-app/update-url.js https://xxxx.ngrok-free.app

# 3. Upload teams-app/manifest/Unified Workplace.zip to Teams
#    Teams → Apps → Manage your apps → Upload an app
```

### Automated Setup (for AI agents / CI)

```bash
# Full automated setup — copy and run as a single block
cd "<project-directory>"
npm install
node server.js
# Server is now running at http://localhost:3000 (browser) and :3001 (Teams)
# POST /api/auth/login with {"email":"ahmed@company.com","password":"demo123"} to authenticate
# All API endpoints are under /api/* and require an active session
```

### Notes

- No external database needed — all data is stored in JSON files under `data/`
- No build step required — frontend uses vanilla JS and CDN-hosted libraries
- No environment variables or `.env` file needed
- The app runs entirely locally with no external service dependencies
- Port 3000 is the default browser port; port 3001 is the Teams tunnel port
- Both ports are configurable in `server.js`

---

## Changelog

### v1.3.0 — Teams Integration & Futuristic Home UI (Mar-Apr 2026)

**Microsoft Teams Integration**
- Teams app now loads pages directly from the Express server via iframe — no separate Teams codebase
- Added iframe-allow headers (`Content-Security-Policy: frame-ancestors`) for Teams domains
- Added `trust proxy` setting and dynamic cookie upgrade middleware so sessions work inside Teams iframe (HTTPS requires `SameSite=None; Secure`)
- Server now listens on port 3001 in addition to 3000 for the ngrok tunnel
- Created `teams-app/update-url.js` script to update manifest URLs and repackage the zip in one command
- Teams manifest has a single "Home" tab — all navigation happens via the sidebar inside the app

**Landing Page — Futuristic Redesign**
- Redesigned with corporate tech / B2B sales aesthetic
- **Glassmorphism metric cards** — translucent backgrounds with colored gradients, accent top-bars, trend indicators, and sub-stats
- **Color-tinted chart cards** — each analytics card (Task Overview, Tasks by System, Quick Access, Recent Activity, Announcements) has its own distinct color theme (teal, blue, violet, emerald, amber)
- **Floating color orbs** — animated radial gradients in the background for depth
- **Welcome banner** — gradient banner with greeting, subtitle, and date badge
- Charts use the dynamic primary color from theme settings

**Sidebar & Topbar Improvements**
- Burger menu toggle works on **all screen sizes** (desktop + mobile) — desktop uses CSS class toggle with localStorage persistence, mobile uses overlay
- WIND-IS logo added to the topbar (next to burger icon)
- Sidebar brand section hidden (logo in topbar instead)
- Card shadows deepened for stronger depth perception

**Customize Page**
- Full theme customization: primary/secondary color pickers, hex input, shade palette preview
- Logo upload via base64 (drag & drop or file picker)
- Live preview panel with mini sidebar, stat cards, buttons, badges
- Changes apply on save without server restart

---

### v1.2.0 — AI Use Cases & Polish (Mar 2026)

**AI Use Cases Page (services.html)**
- Added a new **AI Use Cases** page showcasing 14 live GenAI demos from the WIND-IS platform
- Each demo is presented as a card with title, description, and a direct link to its live Heroku/Oracle URL
- Accessible from the sidebar navigation under "Service Catalog"

**Task Badge Fix**
- Fixed "In Progress" badge rendering as a thin blue bar — caused by a CSS class name collision with Bootstrap's `.progress` component
- Renamed badge class from `.progress` to `.in-prog` to eliminate the conflict; badge now displays correctly

**Login Page — Stats Bar Update**
- Replaced "Uptime 99.9%" stat pill with "Departments" — a more relevant and meaningful metric for an enterprise portal

---

### v1.1.0 — UI Overhaul (Mar 2026)

**Login Page — Full Redesign**
- Replaced plain login form with a split-panel layout: full-screen cityscape background (left) + white login card (right)
- Background uses a two-layer system: blurred `cover` layer fills edges, sharp `100% auto` layer shows the full panorama without side-cropping
- Film-grain CSS texture overlay masks image compression artifacts and adds depth
- Top info bar added with logo, location, next prayer time, weather conditions, and a live clock
- Prayer times card shows all 5 daily prayers with the current/next prayer highlighted
- Logo tinted to brand teal (`#198D87`) via CSS filter — no separate asset needed
- All colours aligned to `#198D87` primary brand with light theme throughout

**Tasks Page — Improvements**
- Tasks now grouped by source system/department with bold section headings and task count badges
- Horizontal dividers added between each task row for a clean modern look
- Action buttons reorganised — primary action (View) is prominent, secondary actions in a `...` overflow menu
- Removed the "Assigned To" column — redundant since the page always shows the logged-in user's own tasks
- Fixed table header and row text visibility (white text on light background issue resolved)

---

## Known Gaps & Future Improvements

> **Note:** This section documents known limitations and gaps identified during system analysis (March 2026). These items are logged here for awareness and should be addressed in future development iterations.

### GAP-01: No Real External System Integration
- **Area:** Task aggregation / System connectors
- **Current State:** Source systems (CRM, ERP, HR, Warehouse, Accounting) are simulated as label strings in `tasks.json` (e.g. `"sourceSystem": "HR"`). No actual API connections to external systems exist.
- **Impact:** The "unified integration layer" promise is architectural only — no live data flows from real enterprise systems.
- **Future Fix:** Build connector modules (adapters) per external system that push/pull tasks via the `/api/tasks` route. Consider a `connectors/` directory with a standard interface per system.

### GAP-02: Policy AI Assistant Is Keyword-Based, Not AI
- **Area:** Policy Assistant (`routes/policy.js`)
- **Current State:** The "AI Policy Assistant" uses basic word-frequency scoring — splits the user's question into words, counts matches against policy content and a `keywords[]` array (keywords weighted 3x). Returns top 2 results. No LLM or NLP is involved.
- **Impact:** Responses are brittle; synonyms, rephrasing, or contextual questions will fail. The chat-style UI suggests intelligence that doesn't exist.
- **Future Fix:** Integrate a real LLM (e.g. Claude API) with RAG over `policies.json` content to provide genuine natural-language answers with citations.

### GAP-03: Plaintext Passwords
- **Area:** Authentication (`data/users.json`)
- **Current State:** All user passwords are stored as plaintext (`"password": "demo123"`). No hashing, salting, or encryption.
- **Impact:** Acceptable for demo/pre-sales purposes only. Must never go to production in this state.
- **Future Fix:** Use `bcrypt` or `argon2` for password hashing. Add password validation on login via hash comparison.

### GAP-04: Notifications Are Static (Not Triggered Dynamically)
- **Area:** Notifications (`data/notifications.json`, `routes/news.js`)
- **Current State:** Notifications are pre-seeded demo data. Key workflows (leave approval, task delegation, escalation) do **not** create new notification records at runtime. The notification bell only displays the static seed data.
- **Impact:** Users won't see real-time feedback when actions happen. The notification system appears functional but is effectively read-only.
- **Future Fix:** Add notification creation logic inside `routes/tasks.js` (on delegate, reassign, escalate, complete) and `routes/leaves.js` (on approve/reject). Write new entries to `notifications.json` with correct userId targeting.

### GAP-05: Attendance Module Is Read-Only
- **Area:** Attendance (`routes/attendance.js`, `data/attendance.json`)
- **Current State:** The API provides `GET /`, `GET /today`, and `GET /team` endpoints — all read-only. There is no punch-in/punch-out endpoint. All attendance records are static seed data.
- **Impact:** Employees cannot clock in or out through the portal. The attendance page displays historical data only.
- **Future Fix:** Add `POST /api/attendance/punch-in` and `POST /api/attendance/punch-out` endpoints that write to `attendance.json` with current timestamp. Add UI buttons on the attendance page.

### GAP-06: No Real-Time Updates (No WebSocket)
- **Area:** All modules / Frontend
- **Current State:** The application uses standard HTTP request-response only. If User A approves a task, User B must manually refresh their page to see the change.
- **Impact:** In a multi-user demo, changes don't propagate in real-time. Stale data may be displayed.
- **Future Fix:** Implement WebSocket (e.g. `socket.io`) for push-based updates on task status changes, new notifications, and leave approvals. Alternatively, add short-polling on critical pages.

### GAP-07: Flat Manager Hierarchy (No Multi-Level Approvals)
- **Area:** Leave workflow / Task delegation (`routes/leaves.js`)
- **Current State:** `managerId` exists on user records, but the leave approval workflow only supports a single level — the employee's direct manager. There is no concept of multi-level approval chains, skip-level escalation, or approval delegation rules.
- **Impact:** Cannot model complex enterprise approval workflows (e.g. leave > 5 days requires VP approval).
- **Future Fix:** Implement an approval chain engine that walks the `managerId` hierarchy based on configurable rules (e.g. leave days threshold, amount threshold for financial approvals).

### GAP-08: No Data Validation or Error Handling on Input
- **Area:** All POST/PUT routes
- **Current State:** Route handlers accept request body data with minimal validation. Missing fields, invalid dates, or malformed data could corrupt the JSON files.
- **Impact:** Demo stability risk — a bad API call could break the data store.
- **Future Fix:** Add input validation middleware (e.g. `joi` or `express-validator`) to all write endpoints. Validate required fields, date formats, enum values, and string lengths.

---

*This README is the living reference document for the Unified Workspace project.*
