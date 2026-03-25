const express = require('express');
const session = require('express-session');
const path    = require('path');
const fs      = require('fs');

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

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'unified-workspace-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

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

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.session.user });
});

// ─── View Routes ──────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

const pages = ['', 'tasks', 'leaves', 'analytics', 'goals', 'appraisal', 'attendance', 'policy', 'helpdesk', 'directory', 'customize'];

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
app.listen(PORT, () => {
  console.log(`\n  Unified Workspace running at http://localhost:${PORT}\n`);
});
