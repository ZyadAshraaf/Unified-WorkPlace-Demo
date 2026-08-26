// Emulate iPhone 12 Pro (390x844 CSS px, DPR 3) and screenshot key pages.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4044/unifiedwp';
const OUT = path.join(__dirname, 'mobile-captures');
const SID = process.argv[2]; // connect.sid value (URL-encoded)

const PAGES = [
  ['landing', '/'],
  ['tasks', '/tasks'],
  ['leaves', '/leaves'],
  ['analytics', '/analytics'],
  ['helpdesk', '/helpdesk'],
  ['directory', '/directory'],
  ['appraisal', '/appraisal'],
  ['proposal-eval', '/proposal-eval'],
  ['leave-assistant', '/leave-assistant'],
  ['ems', '/ems'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await browser.newPage();

  // iPhone 12 Pro metrics
  await page.emulate({
    viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });

  await page.setCookie({
    name: 'connect.sid',
    value: decodeURIComponent(SID),
    domain: 'localhost',
    path: '/',
    httpOnly: true,
  });

  const report = [];
  for (const [name, route] of PAGES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 1200)); // let async data render
      // Measure horizontal overflow — the #1 mobile smell
      const metrics = await page.evaluate(() => {
        const de = document.documentElement;
        const overflowers = [];
        document.querySelectorAll('body *').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.right > window.innerWidth + 1 && r.width > 0 && r.left >= 0) {
            overflowers.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className && el.className.toString().slice(0, 40)) || '',
              right: Math.round(r.right),
            });
          }
        });
        // dedupe by cls
        const seen = new Set();
        const uniq = overflowers.filter(o => { const k = o.tag + o.cls; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
        return {
          scrollW: de.scrollWidth,
          clientW: de.clientWidth,
          innerW: window.innerWidth,
          horizOverflow: de.scrollWidth - de.clientWidth,
          zoom: getComputedStyle(document.body).zoom,
          overflowers: uniq,
        };
      });
      await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
      report.push({ name, ...metrics });
      console.log(`✓ ${name}: overflow=${metrics.horizOverflow}px zoom=${metrics.zoom} scrollW=${metrics.scrollW}`);
      if (metrics.overflowers.length) console.log('   offenders:', JSON.stringify(metrics.overflowers));
    } catch (e) {
      console.log(`✗ ${name}: ${e.message}`);
      report.push({ name, error: e.message });
    }
  }
  fs.writeFileSync(path.join(OUT, '_report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('\nSaved to', OUT);
})();
