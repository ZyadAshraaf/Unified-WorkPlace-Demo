const express    = require('express');
const session    = require('express-session');
const FileStore  = require('session-file-store')(session);
const path       = require('path');
const fs         = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Color Utilities (for dynamic theme.css) ───────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return { r, g, b };
}

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function toHex(r, g, b) {
  return '#' + [r,g,b].map(v => clamp(v).toString(16).padStart(2,'0')).join('');
}

function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return toHex(r + amount, g + amount, b + amount);
}

function mixWhite(hex, ratio) {
  const { r, g, b } = hexToRgb(hex);
  return toHex(r + (255-r)*ratio, g + (255-g)*ratio, b + (255-b)*ratio);
}

function buildThemeCSS(settings) {
  const p  = settings.colors.primary;
  const s  = settings.colors.secondary;
  const { r, g, b } = hexToRgb(p);
  const { r: sr, g: sg, b: sb } = hexToRgb(s);

  return `:root {
  --color-primary:         ${p};
  --color-primary-dark:    ${shade(p, -18)};
  --color-primary-darker:  ${shade(p, -40)};
  --color-primary-light:   ${shade(p,  14)};
  --color-primary-lighter: ${mixWhite(p, 0.38)};
  --color-primary-faint:   ${mixWhite(p, 0.88)};
  --color-primary-rgb:     ${r}, ${g}, ${b};
  --color-secondary:       ${s};
  --color-secondary-light: ${shade(s, 20)};
  --color-border:          ${mixWhite(p, 0.72)};
  --color-border-light:    ${mixWhite(p, 0.88)};
  --color-surface:         ${mixWhite(p, 0.96)};
  --color-surface-alt:     ${mixWhite(p, 0.92)};
  --sidebar-bg:            ${p};
}
`;
}

// Trust reverse proxies (ngrok, nginx) so req.secure works correctly
app.set('trust proxy', 1);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Allow embedding in Microsoft Teams iframe
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.skype.com");
  // ngrok: skip browser warning page (uncomment if using ngrok instead of Cloudflare)
  // res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

app.use(session({
  store: new FileStore({
    path: path.join(__dirname, '.sessions'),
    ttl: 8 * 60 * 60,            // 8 hours (seconds)
    retries: 0,
    logFn: () => {}               // silence logs
  }),
  secret: 'unified-workspace-secret-2026',
  resave: true,                   // save session on every request (keeps it alive)
  rolling: true,                  // reset cookie maxAge on every response
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// Dynamically upgrade cookie security for HTTPS (Teams/ngrok) without breaking localhost
app.use((req, res, next) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (isHttps && req.session) {
    req.session.cookie.sameSite = 'none';
    req.session.cookie.secure   = true;
  }
  next();
});

// ─── Dynamic Theme CSS (no auth — CSS must load on every page) ─────────────
app.get('/theme.css', (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/settings.json'), 'utf8'));
    res.setHeader('Content-Type', 'text/css');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.send(buildThemeCSS(settings));
  } catch {
    res.setHeader('Content-Type', 'text/css');
    res.send('/* settings unavailable */');
  }
});

// ─── Auto-login for Teams embed mode (dev only — remove in production) ───────
app.use((req, res, next) => {
  if (!req.session.user && req.query.embed === '1') {
    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/users.json'), 'utf8'));
    const defaultUser = users.find(u => u.email === 'ahmed@company.com');
    if (defaultUser) {
      req.session.user = { id: defaultUser.id, name: defaultUser.name, email: defaultUser.email, role: defaultUser.role };
    }
  }
  next();
});

// ─── Auth Guard ────────────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.redirect('/login');
};

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/tasks',     require('./routes/tasks'));
app.use('/api/leaves',    require('./routes/leaves'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/goals',     require('./routes/goals'));
app.use('/api/appraisal', require('./routes/appraisal'));
app.use('/api/attendance',require('./routes/attendance'));
app.use('/api/policy',    require('./routes/policy'));
app.use('/api/helpdesk',  require('./routes/helpdesk'));
app.use('/api/directory', require('./routes/directory'));
app.use('/api/news',      require('./routes/news'));
app.use('/api/customize', require('./routes/customize'));
app.use('/api/hr-chat',   require('./routes/hr-chat'));

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.session.user });
});

// ─── Heartbeat (keeps session & tunnel alive for Teams iframe) ────────────
app.get('/api/heartbeat', (req, res) => {
  // Touch the session so it doesn't expire while the tab is open
  if (req.session) req.session._heartbeat = Date.now();
  res.json({ ok: true });
});

// ─── View Routes ──────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

const pages = ['', 'tasks', 'leaves', 'services', 'analytics', 'goals', 'appraisal', 'attendance', 'policy', 'helpdesk', 'directory', 'customize', 'erp-dialogue', 'leave-assistant', 'voice-agent'];

pages.forEach(page => {
  const route = page === '' ? '/' : `/${page}`;
  const file  = page === '' ? 'landing' : page;
  app.get(route, requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', `${file}.html`));
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const server1 = app.listen(PORT, () => {
  console.log(`\n  Unified Workspace running at http://localhost:${PORT}`);
});
server1.keepAliveTimeout  = 120000;   // 2 min — prevents tunnel from dropping idle connections
server1.headersTimeout    = 125000;   // slightly above keepAlive

// Also listen on 3001 for tunnel (Cloudflare / ngrok) → Teams integration
if (PORT !== 3001) {
  const server2 = app.listen(3001, () => {
    console.log(`  Teams tunnel port:      http://localhost:3001\n`);
  });
  server2.keepAliveTimeout = 120000;
  server2.headersTimeout   = 125000;
}
