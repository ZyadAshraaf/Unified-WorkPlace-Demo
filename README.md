# Unified Workspace — Project Reference

## Overview

**Unified Workspace** is a centralized web portal that acts as a single integration layer and unified user interface across all enterprise systems (ERP, CRM, Warehouse, HR, Attendance, Accounting, etc.). Instead of users juggling multiple system logins and interfaces, they interact with one portal that aggregates data, tasks, and services from all underlying systems.

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
├── server.js                   # Express entry point + theme engine
├── package.json                # Dependencies: express, express-session, uuid
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
│       └── logo.png            # WIND-IS logo (used in sidebar + topbar)
└── views/
    ├── login.html              # Login form (no sidebar)
    ├── landing.html            # Portal home — analytics cards, quick access, announcements
    ├── tasks.html              # Unified task list
    ├── leaves.html             # Leave request self-service
    ├── analytics.html          # Charts & KPIs
    ├── goals.html              # Goals & OKR
    ├── appraisal.html          # Performance appraisal
    ├── attendance.html         # Attendance statistics
    ├── policy.html             # AI policy assistant
    ├── helpdesk.html           # Help desk & tickets
    ├── directory.html          # Organization directory
    └── customize.html          # Theme customization (colors, logo)
```

---

## Pages & Features

### 1. Login Page
- Username + password authentication
- Role-based access (Employee, Manager, HR, Admin)
- Session stored via `express-session`
- Demo credentials: any user with password `demo123`

---

### 2. Landing Page (Portal Home)

The main hub after login. Features:

| Section | Description |
|---|---|
| **Welcome Banner** | Greeting with user name and current date |
| **Analytics Cards** | KPI stat cards (total tasks, pending, completed, leave balance) |
| **Quick Access** | Shortcut tiles to all major modules |
| **Announcements** | Company news and policy updates (at bottom) |

The landing page has a **collapsible sidebar** with burger menu toggle in the topbar. The WIND-IS logo appears in both the sidebar header and the topbar.

---

### 3. Unified Task List (Core Page)

Aggregates tasks from **all systems** (HR, Accounting, CRM, Warehouse, IT) into one unified list.

#### Task Card Contains:
- Task title, source system (badge), type, priority, due date, status
- Assigned to / created by
- Description / notes
- Action buttons

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

### 12. Customize Page
- Change primary and secondary colors via color pickers or hex input
- Auto-generated shade palette preview
- Upload new logo (base64 — no multer dependency)
- Live preview panel showing mini sidebar, stat cards, buttons, badges
- Reset to Defaults button
- Changes apply immediately on save (no server restart needed)

---

## UI Layout

### Sidebar
- Collapsible via burger menu icon (☰) in the topbar
- WIND-IS logo at top (white-filtered on colored background)
- Navigation links to all modules
- Colored with `--sidebar-bg` (matches primary color)

### Topbar
- Burger menu toggle (shows/hides sidebar)
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

The server will start on **http://localhost:3000**.

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
| `npm start` | Starts the server (`node server.js`) on port 3000 |
| `npm run dev` | Starts with nodemon (auto-restart on file changes) |

### Automated Setup (for AI agents / CI)

```bash
# Full automated setup — copy and run as a single block
cd "<project-directory>"
npm install
node server.js
# Server is now running at http://localhost:3000
# POST /api/auth/login with {"username":"ahmed","password":"demo123"} to authenticate
# All API endpoints are under /api/* and require an active session
```

### Notes

- No external database needed — all data is stored in JSON files under `data/`
- No build step required — frontend uses vanilla JS and CDN-hosted libraries
- No environment variables or `.env` file needed
- The app runs entirely locally with no external service dependencies
- Port 3000 is the default; modify `server.js` to change it

---

*This README is the living reference document for the Unified Workspace project.*
